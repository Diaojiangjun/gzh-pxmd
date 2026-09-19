import {
  LocalPreset,
  StickerItem,
  ImageAttachment,
  ThemeConfig,
  BackgroundSettings,
  ArticleItem,
  HistorySnapshot,
  GzhComponentItem,
} from '../types';
import { dbService, FullBackupData } from './dbService';

const DRAFT_KEY = 'gzh_editor_draft_v1';
const ARTICLES_KEY = 'gzh_editor_articles_v1';
const CURRENT_ARTICLE_ID_KEY = 'gzh_editor_current_article_id_v1';
const SNAPSHOTS_KEY = 'gzh_editor_snapshots_v1';
const PRESETS_KEY = 'gzh_editor_presets_v1';
const STICKERS_KEY = 'gzh_editor_custom_stickers_v1';
const IMAGES_KEY = 'gzh_editor_images_v1';
const ACTIVE_THEME_KEY = 'gzh_editor_active_theme_v1';
const BACKGROUND_KEY = 'gzh_editor_background_v1';
const CUSTOM_COMPONENTS_KEY = 'gzh_editor_custom_components_v1';
const CUSTOM_THEMES_KEY = 'gzh_editor_custom_themes_v1';

function safeSetItem(key: string, value: string) {
  try {
    localStorage.setItem(key, value);
  } catch (e: any) {
    if (e?.name === 'QuotaExceededError' || e?.code === 22) {
      console.warn('LocalStorage quota exceeded, attempting to prune history snapshots...');
      try {
        const snapshotsData = localStorage.getItem(SNAPSHOTS_KEY);
        if (snapshotsData) {
          const list = JSON.parse(snapshotsData);
          if (Array.isArray(list) && list.length > 5) {
            localStorage.setItem(SNAPSHOTS_KEY, JSON.stringify(list.slice(0, 5)));
            localStorage.setItem(key, value);
            return;
          }
        }
        localStorage.removeItem(SNAPSHOTS_KEY);
        localStorage.setItem(key, value);
      } catch (err2) {
        console.warn('LocalStorage still full after pruning:', err2);
      }
    } else {
      console.warn(`Failed to set localStorage key "${key}":`, e);
    }
  }
}

/**
 * 当前文章存储模式。
 * `folder` 只在 Electron 且用户已启用本地文件夹时出现；其余一律 `browser`。
 * 结果做缓存——否则每次读写都要走一次同步 IPC（读配置文件）。
 */
let cachedMode: 'browser' | 'folder' | null = null;

export function currentStorageMode(): 'browser' | 'folder' {
  if (cachedMode) return cachedMode;
  try {
    const mode = window.electronAPI?.storageGetConfigSync?.()?.mode;
    cachedMode = mode === 'folder' ? 'folder' : 'browser';
  } catch {
    cachedMode = 'browser';
  }
  return cachedMode;
}

/** 切换存储模式后调用（实际流程会伴随页面重载，缓存自然失效） */
export function refreshStorageMode(): void {
  cachedMode = null;
}

export const storageService = {
  // Articles Management
  getArticles(): ArticleItem[] {
    // 文件夹模式：文章来自本地 .md 文件（同步 IPC，原因见 electron/main.ts）
    if (currentStorageMode() === 'folder') {
      try {
        return (window.electronAPI?.storageListArticlesSync?.() ?? []) as ArticleItem[];
      } catch (e) {
        console.warn('Failed to read articles from folder:', e);
        return [];
      }
    }
    try {
      const data = localStorage.getItem(ARTICLES_KEY);
      if (data) return JSON.parse(data);
    } catch (e) {
      console.warn('Failed to read articles:', e);
    }
    return [];
  },

  saveArticle(article: ArticleItem) {
    // 文件夹模式：直接写 .md 文件。异步进行，调用方并不等待（本地写盘很快）。
    if (currentStorageMode() === 'folder') {
      void window.electronAPI
        ?.storageSaveArticle?.({
          id: article.id,
          title: article.title,
          content: article.content,
        })
        .catch((e) => console.warn('Failed to save article file:', e));
      return;
    }
    try {
      const articles = this.getArticles().filter((a) => a.id !== article.id);
      articles.unshift({
        ...article,
        updatedAt: Date.now(),
        wordCount: article.content.trim() ? article.content.length : 0,
      });
      safeSetItem(ARTICLES_KEY, JSON.stringify(articles));
    } catch (e) {
      console.warn('Failed to save article:', e);
    }
  },

  deleteArticle(id: string) {
    if (currentStorageMode() === 'folder') {
      void window.electronAPI
        ?.storageDeleteArticle?.(id)
        .catch((e) => console.warn('Failed to delete article file:', e));
      this.clearSnapshots(id);
      return;
    }
    try {
      const articles = this.getArticles().filter((a) => a.id !== id);
      localStorage.setItem(ARTICLES_KEY, JSON.stringify(articles));
      // Also clean up snapshots for this article
      this.clearSnapshots(id);
    } catch (e) {
      console.warn('Failed to delete article:', e);
    }
  },

  getCurrentArticleId(): string | null {
    try {
      return localStorage.getItem(CURRENT_ARTICLE_ID_KEY);
    } catch (e) {
      return null;
    }
  },

  setCurrentArticleId(id: string) {
    try {
      localStorage.setItem(CURRENT_ARTICLE_ID_KEY, id);
    } catch (e) {
      console.warn('Failed to set current article id:', e);
    }
  },

  /** 当前是否处于本地文件夹模式 */
  isFolderMode(): boolean {
    return currentStorageMode() === 'folder';
  },

  /**
   * 为新文章取一个不冲突的文件名。
   *
   * 文件夹模式下文章 id 就是文件名，新建时必须用它：
   * 若沿用 `article-<时间戳>` 这类内存 id，主进程会把它当成新文章，
   * 于是**每次自动保存都生成一个带序号的新文件**（一次编辑产出 .md / (2).md / (3).md）。
   */
  resolveNewArticleId(title: string): string {
    if (currentStorageMode() !== 'folder') return '';
    try {
      return window.electronAPI?.storageResolveArticleIdSync?.(title) || '';
    } catch {
      return '';
    }
  },

  /** 重命名文章。文件夹模式下会重命名 .md 文件并返回新文件名 */
  async renameArticle(
    id: string,
    title: string
  ): Promise<{ ok: boolean; id?: string; error?: string }> {
    if (currentStorageMode() !== 'folder') return { ok: true };
    const api = window.electronAPI;
    if (!api?.storageRenameArticle) return { ok: true };
    return await api.storageRenameArticle({ id, title });
  },

  /** 扫描重复文件（只读）。仅文件夹模式有意义，其余返回空数组 */
  async scanDuplicates(): Promise<
    Array<{
      base: string;
      files: Array<{ id: string; size: number; mtime: number; preview: string }>;
    }>
  > {
    if (currentStorageMode() !== 'folder') return [];
    try {
      const res = await window.electronAPI?.storageScanDuplicates?.();
      return res?.groups ?? [];
    } catch {
      return [];
    }
  },

  /** 把文件移入系统回收站（可恢复）。**只应由用户确认后调用** */
  async trashDuplicates(
    ids: string[]
  ): Promise<{ ok: boolean; trashed: number; failed: string[]; error?: string }> {
    if (currentStorageMode() !== 'folder') {
      return { ok: false, trashed: 0, failed: [], error: '当前不是本地文件夹模式' };
    }
    const api = window.electronAPI;
    if (!api?.storageTrashDuplicates) {
      return { ok: false, trashed: 0, failed: [], error: '当前环境不支持' };
    }
    return await api.storageTrashDuplicates(ids);
  },

  // ---- 文件级模板（仅在本地文件夹模式下可用；模板存放在 <文章文件夹>/_templates/）----
  /** 模板目录信息（是否可用 + 路径），供 UI 展示 */
  getTemplateDirInfo(): { available: boolean; dir: string } {
    try {
      const res = window.electronAPI?.storageListTemplatesSync?.();
      return { available: !!res?.available, dir: res?.dir ?? '' };
    } catch {
      return { available: false, dir: '' };
    }
  },

  /** 读取模板列表（同步，供抽屉展开时即时渲染） */
  getFileTemplates(): Array<{ id: string; name: string; content: string }> {
    try {
      return window.electronAPI?.storageListTemplatesSync?.()?.templates ?? [];
    } catch {
      return [];
    }
  },

  async saveFileTemplate(
    name: string,
    content: string
  ): Promise<{ ok: boolean; id?: string; error?: string }> {
    const api = window.electronAPI;
    if (!api?.storageSaveTemplate) return { ok: false, error: '仅桌面端可用' };
    return await api.storageSaveTemplate({ name, content });
  },

  async deleteFileTemplate(id: string): Promise<{ ok: boolean; error?: string }> {
    const api = window.electronAPI;
    if (!api?.storageDeleteTemplate) return { ok: false, error: '仅桌面端可用' };
    return await api.storageDeleteTemplate(id);
  },

  async openTemplatesDir(): Promise<{ ok: boolean; error?: string }> {
    const api = window.electronAPI;
    if (!api?.storageOpenTemplatesDir) return { ok: false, error: '仅桌面端可用' };
    return await api.storageOpenTemplatesDir();
  },

  // History Snapshots Management
  getSnapshots(articleId?: string): HistorySnapshot[] {
    try {
      const data = localStorage.getItem(SNAPSHOTS_KEY);
      if (data) {
        const list: HistorySnapshot[] = JSON.parse(data);
        if (articleId) {
          return list.filter((s) => s.articleId === articleId);
        }
        return list;
      }
    } catch (e) {
      console.warn('Failed to read history snapshots:', e);
    }
    return [];
  },

  saveSnapshot(snapshot: HistorySnapshot) {
    try {
      const snapshots = this.getSnapshots();
      // Keep up to 50 latest snapshots to balance storage
      snapshots.unshift(snapshot);
      const trimmed = snapshots.slice(0, 50);
      localStorage.setItem(SNAPSHOTS_KEY, JSON.stringify(trimmed));
    } catch (e) {
      console.warn('Failed to save snapshot:', e);
    }
  },

  deleteSnapshot(id: string) {
    try {
      const snapshots = this.getSnapshots().filter((s) => s.id !== id);
      localStorage.setItem(SNAPSHOTS_KEY, JSON.stringify(snapshots));
    } catch (e) {
      console.warn('Failed to delete snapshot:', e);
    }
  },

  clearSnapshots(articleId?: string) {
    try {
      if (articleId) {
        const snapshots = this.getSnapshots().filter((s) => s.articleId !== articleId);
        localStorage.setItem(SNAPSHOTS_KEY, JSON.stringify(snapshots));
      } else {
        localStorage.removeItem(SNAPSHOTS_KEY);
      }
    } catch (e) {
      console.warn('Failed to clear snapshots:', e);
    }
  },

  saveDraft(content: string, title: string = '未命名文章') {
    try {
      localStorage.setItem(
        DRAFT_KEY,
        JSON.stringify({
          content,
          title,
          updatedAt: Date.now(),
        })
      );
    } catch (e) {
      console.warn('Failed to save draft to localStorage:', e);
    }
  },

  getDraft(): { content: string; title: string; updatedAt: number } | null {
    try {
      const data = localStorage.getItem(DRAFT_KEY);
      if (data) return JSON.parse(data);
    } catch (e) {
      console.warn('Failed to read draft:', e);
    }
    return null;
  },

  getSavedPresets(): LocalPreset[] {
    try {
      const data = localStorage.getItem(PRESETS_KEY);
      if (data) return JSON.parse(data);
    } catch (e) {
      console.warn('Failed to read presets:', e);
    }
    return [];
  },

  savePreset(preset: LocalPreset) {
    const presets = this.getSavedPresets().filter((p) => p.id !== preset.id);
    presets.unshift(preset);
    try {
      localStorage.setItem(PRESETS_KEY, JSON.stringify(presets));
    } catch (e) {
      console.warn('Failed to save preset:', e);
    }
  },

  deletePreset(id: string) {
    const presets = this.getSavedPresets().filter((p) => p.id !== id);
    try {
      localStorage.setItem(PRESETS_KEY, JSON.stringify(presets));
    } catch (e) {
      console.warn('Failed to delete preset:', e);
    }
  },

  getCustomStickers(): StickerItem[] {
    try {
      const data = localStorage.getItem(STICKERS_KEY);
      if (data) return JSON.parse(data);
    } catch (e) {
      console.warn('Failed to read stickers:', e);
    }
    return [];
  },

  saveCustomStickers(stickers: StickerItem[]) {
    try {
      safeSetItem(STICKERS_KEY, JSON.stringify(stickers));
      dbService.saveStickers(stickers).catch(() => {});
    } catch (e) {
      console.warn('Failed to save stickers:', e);
    }
  },

  getImageAttachments(): ImageAttachment[] {
    try {
      const data = localStorage.getItem(IMAGES_KEY);
      if (data) return JSON.parse(data);
    } catch (e) {
      console.warn('Failed to read images:', e);
    }
    return [];
  },

  saveImageAttachments(images: ImageAttachment[]) {
    try {
      safeSetItem(IMAGES_KEY, JSON.stringify(images));
      dbService.saveImages(images).catch(() => {});
    } catch (e) {
      console.warn('Failed to save images:', e);
    }
  },

  /**
   * Seamlessly hydrate/sync custom stickers and images from IndexedDB if present
   */
  async syncMediaFromIndexedDb(): Promise<{
    stickers: StickerItem[];
    images: ImageAttachment[];
  } | null> {
    try {
      const [idbStickers, idbImages] = await Promise.all([
        dbService.loadStickers(),
        dbService.loadImages(),
      ]);

      let hasNewMedia = false;
      const localStickers = this.getCustomStickers();
      const localImages = this.getImageAttachments();

      let mergedStickers = localStickers;
      if (idbStickers && idbStickers.length > 0) {
        const localIds = new Set(localStickers.map((s) => s.id));
        const missingFromLocal = idbStickers.filter((s) => !localIds.has(s.id));
        if (missingFromLocal.length > 0) {
          mergedStickers = [...localStickers, ...missingFromLocal];
          safeSetItem(STICKERS_KEY, JSON.stringify(mergedStickers));
          hasNewMedia = true;
        }
      } else if (localStickers.length > 0) {
        dbService.saveStickers(localStickers).catch(() => {});
      }

      let mergedImages = localImages;
      if (idbImages && idbImages.length > 0) {
        const localImgIds = new Set(localImages.map((img) => img.id));
        const missingImgFromLocal = idbImages.filter((img) => !localImgIds.has(img.id));
        if (missingImgFromLocal.length > 0) {
          mergedImages = [...localImages, ...missingImgFromLocal];
          safeSetItem(IMAGES_KEY, JSON.stringify(mergedImages));
          hasNewMedia = true;
        }
      } else if (localImages.length > 0) {
        dbService.saveImages(localImages).catch(() => {});
      }

      if (hasNewMedia) {
        return { stickers: mergedStickers, images: mergedImages };
      }
    } catch (err) {
      console.warn('syncMediaFromIndexedDb failed:', err);
    }
    return null;
  },

  /**
   * Export all user data as a single standardized JSON package
   */
  exportFullBackup(): FullBackupData {
    return {
      version: '3.3.0',
      exportedAt: Date.now(),
      articles: this.getArticles(),
      currentArticleId: this.getCurrentArticleId(),
      snapshots: this.getSnapshots(),
      presets: this.getSavedPresets(),
      customComponents: this.getCustomComponents(),
      stickers: this.getCustomStickers(),
      images: this.getImageAttachments(),
      activeTheme: this.getActiveTheme(),
      background: this.getBackground(),
    };
  },

  /**
   * Restore full backup data (merge or overwrite)
   */
  async importFullBackup(backup: FullBackupData, mode: 'merge' | 'overwrite' = 'merge'): Promise<void> {
    if (!backup || !Array.isArray(backup.articles)) {
      throw new Error('无效的备份文件格式');
    }

    if (mode === 'overwrite') {
      safeSetItem(ARTICLES_KEY, JSON.stringify(backup.articles));
      if (backup.currentArticleId) {
        safeSetItem(CURRENT_ARTICLE_ID_KEY, backup.currentArticleId);
      }
      safeSetItem(SNAPSHOTS_KEY, JSON.stringify(backup.snapshots || []));
      safeSetItem(PRESETS_KEY, JSON.stringify(backup.presets || []));
      safeSetItem(CUSTOM_COMPONENTS_KEY, JSON.stringify(backup.customComponents || []));
      safeSetItem(STICKERS_KEY, JSON.stringify(backup.stickers || []));
      safeSetItem(IMAGES_KEY, JSON.stringify(backup.images || []));
      if (backup.activeTheme) {
        safeSetItem(ACTIVE_THEME_KEY, JSON.stringify(backup.activeTheme));
      }
      if (backup.background) {
        safeSetItem(BACKGROUND_KEY, JSON.stringify(backup.background));
      }

      // Sync to IndexedDB
      if (backup.stickers) dbService.saveStickers(backup.stickers).catch(() => {});
      if (backup.images) dbService.saveImages(backup.images).catch(() => {});
    } else {
      // Merge mode: combine without duplicates
      const currentArticles = this.getArticles();
      const articleMap = new Map(currentArticles.map((a) => [a.id, a]));
      for (const a of backup.articles) {
        articleMap.set(a.id, a);
      }
      safeSetItem(ARTICLES_KEY, JSON.stringify(Array.from(articleMap.values())));

      if (backup.presets) {
        const currentPresets = this.getSavedPresets();
        const presetMap = new Map(currentPresets.map((p) => [p.id, p]));
        for (const p of backup.presets) {
          presetMap.set(p.id, p);
        }
        safeSetItem(PRESETS_KEY, JSON.stringify(Array.from(presetMap.values())));
      }

      if (backup.stickers) {
        const currentStickers = this.getCustomStickers();
        const stickerMap = new Map(currentStickers.map((s) => [s.id, s]));
        for (const s of backup.stickers) {
          stickerMap.set(s.id, s);
        }
        const mergedStickers = Array.from(stickerMap.values());
        this.saveCustomStickers(mergedStickers);
      }

      if (backup.images) {
        const currentImages = this.getImageAttachments();
        const imageMap = new Map(currentImages.map((img) => [img.id, img]));
        for (const img of backup.images) {
          imageMap.set(img.id, img);
        }
        const mergedImages = Array.from(imageMap.values());
        this.saveImageAttachments(mergedImages);
      }

      if (backup.customComponents) {
        const currentComps = this.getCustomComponents();
        const compMap = new Map(currentComps.map((c) => [c.id, c]));
        for (const c of backup.customComponents) {
          compMap.set(c.id, c);
        }
        safeSetItem(CUSTOM_COMPONENTS_KEY, JSON.stringify(Array.from(compMap.values())));
      }
    }
  },

  saveActiveTheme(theme: ThemeConfig) {
    try {
      localStorage.setItem(ACTIVE_THEME_KEY, JSON.stringify(theme));
    } catch (e) {
      console.warn('Failed to save active theme:', e);
    }
  },

  getActiveTheme(): ThemeConfig | null {
    try {
      const data = localStorage.getItem(ACTIVE_THEME_KEY);
      if (data) return JSON.parse(data);
    } catch (e) {
      console.warn('Failed to read active theme:', e);
    }
    return null;
  },

  // ---- 自定义主题（内置主题不可编辑，用户「复制」后存到这里）----
  getCustomThemes(): ThemeConfig[] {
    try {
      const data = localStorage.getItem(CUSTOM_THEMES_KEY);
      if (data) {
        const list = JSON.parse(data);
        return Array.isArray(list) ? list : [];
      }
    } catch (e) {
      console.warn('Failed to read custom themes:', e);
    }
    return [];
  },

  saveCustomTheme(theme: ThemeConfig) {
    try {
      const list = this.getCustomThemes().filter((t) => t.id !== theme.id);
      // 自定义主题一律不带 builtin 标记，避免被误判为不可编辑
      const next = { ...theme, builtin: false };
      list.unshift(next);
      safeSetItem(CUSTOM_THEMES_KEY, JSON.stringify(list));
    } catch (e) {
      console.warn('Failed to save custom theme:', e);
    }
  },

  deleteCustomTheme(id: string) {
    try {
      const list = this.getCustomThemes().filter((t) => t.id !== id);
      safeSetItem(CUSTOM_THEMES_KEY, JSON.stringify(list));
    } catch (e) {
      console.warn('Failed to delete custom theme:', e);
    }
  },

  saveBackground(bg: BackgroundSettings) {
    try {
      localStorage.setItem(BACKGROUND_KEY, JSON.stringify(bg));
    } catch (e) {
      console.warn('Failed to save background:', e);
    }
  },

  getBackground(): BackgroundSettings | null {
    try {
      const data = localStorage.getItem(BACKGROUND_KEY);
      if (data) return JSON.parse(data);
    } catch (e) {
      console.warn('Failed to read background:', e);
    }
    return null;
  },

  // Custom GZH Components Management
  getCustomComponents(): GzhComponentItem[] {
    try {
      const data = localStorage.getItem(CUSTOM_COMPONENTS_KEY);
      if (data) return JSON.parse(data);
    } catch (e) {
      console.warn('Failed to read custom components:', e);
    }
    return [
      {
        id: 'custom-default-welfare',
        name: '读者福利 / 资料领取卡',
        category: 'highlight',
        description: '公众号文末或篇中引导关注、回复关键词获取资源的福利卡片',
        snippet: `:::callout
🎁 **读者专属福利资料**
感谢您的细心阅读！关注公众号并回复关键词 **「排版秘籍」**，即可免费获取高清免抠 SVG 图标库及 50+ 爆款标题排版模版！
:::`,
        isCustom: true,
        createdAt: Date.now() - 3600000,
        updatedAt: Date.now() - 3600000,
      },
      {
        id: 'custom-default-author',
        name: '主笔专属签名卡',
        category: 'footer',
        description: '展示作者简介、专栏栏目及读者互动交流方式',
        snippet: `:::footer
**— 主笔档案 · 关于作者 —**
资深排版设计师 & 全栈开发者，专注于打造极致的文字阅读体验。
微信交流：**designer_pro** · 欢迎扫码或搜索添加探讨排版审美与设计灵感。
:::`,
        isCustom: true,
        createdAt: Date.now() - 7200000,
        updatedAt: Date.now() - 7200000,
      },
    ];
  },

  saveCustomComponents(components: GzhComponentItem[]) {
    try {
      localStorage.setItem(CUSTOM_COMPONENTS_KEY, JSON.stringify(components));
    } catch (e) {
      console.warn('Failed to save custom components:', e);
    }
  },

  saveCustomComponent(component: GzhComponentItem) {
    try {
      const current = this.getCustomComponents().filter((c) => c.id !== component.id);
      current.unshift({
        ...component,
        isCustom: true,
        updatedAt: Date.now(),
      });
      this.saveCustomComponents(current);
    } catch (e) {
      console.warn('Failed to save single custom component:', e);
    }
  },

  deleteCustomComponent(id: string) {
    try {
      const current = this.getCustomComponents().filter((c) => c.id !== id);
      this.saveCustomComponents(current);
    } catch (e) {
      console.warn('Failed to delete custom component:', e);
    }
  },
};
