/**
 * 文章存储：本地文件夹模式
 *
 * 两种模式：
 *  - `browser`：文章存在渲染层的 localStorage（默认，现状）
 *  - `folder` ：文章以 `<标题>.md` 的形式直接读写用户指定文件夹
 *
 * 设计取舍：
 *  1. **只有「文章」走文件夹**，主题/背景/表情/图片/预设等配置仍留在本地存储。
 *     用户在文件夹里看到的就是纯粹的 Markdown，可以直接用 Git / 编辑器管理。
 *  2. **id = 文件名**（含 `.md`）。这样重启后 id 依然稳定，无需额外的映射表，
 *     也不用往用户的 md 文件里塞 frontmatter 污染正文。
 *  3. 主进程维护一层内存缓存：`listArticles()` 被渲染层高频调用，
 *     每次都全量扫盘读文件会很浪费；写操作后主动失效，另提供 `rescan` 供外部改动后同步。
 */
import fs from 'fs';
import path from 'path';
import { app, ipcMain, dialog, shell, type BrowserWindow } from 'electron';

export type StorageMode = 'browser' | 'folder';

export interface StorageConfig {
  mode: StorageMode;
  folderPath: string;
}

export interface StoredArticle {
  /** 文件名（含 .md），同时作为文章 id */
  id: string;
  /** 文件名去掉 .md */
  title: string;
  content: string;
  createdAt: number;
  updatedAt: number;
  wordCount: number;
}

const CONFIG_FILE = 'storage-config.json';
const MD_EXT = /\.md$/i;
/** Windows 文件名非法字符 + 控制字符 */
const ILLEGAL_FILENAME_CHARS = /[\\/:*?"<>|\u0000-\u001f]/g;
const MAX_BASENAME = 80;

function configPath(): string {
  return path.join(app.getPath('userData'), CONFIG_FILE);
}

// ---------- 配置 ----------

export function readStorageConfig(): StorageConfig {
  try {
    const parsed = JSON.parse(fs.readFileSync(configPath(), 'utf-8'));
    return {
      mode: parsed?.mode === 'folder' ? 'folder' : 'browser',
      folderPath: typeof parsed?.folderPath === 'string' ? parsed.folderPath : '',
    };
  } catch {
    // 文件不存在 / 损坏 → 回到默认的浏览器存储
    return { mode: 'browser', folderPath: '' };
  }
}

export function writeStorageConfig(cfg: StorageConfig): { ok: boolean; error?: string } {
  try {
    fs.mkdirSync(app.getPath('userData'), { recursive: true });
    fs.writeFileSync(configPath(), JSON.stringify(cfg, null, 2), 'utf-8');
    // 换文件夹后，之前占用的名字不再有意义
    reservedNames.clear();
    return { ok: true };
  } catch (err) {
    return { ok: false, error: (err as Error)?.message || String(err) };
  }
}

// ---------- 工具 ----------

/** 标题 → 安全的文件名主体（不含扩展名） */
export function sanitizeBaseName(title: string): string {
  const cleaned = (title || '')
    .replace(ILLEGAL_FILENAME_CHARS, '_')
    // 结尾的点和空格在 Windows 上会被静默丢弃，显式处理掉
    .replace(/[. ]+$/g, '')
    .trim()
    .slice(0, MAX_BASENAME);
  return cleaned || '未命名';
}

/** 文件夹是否可用（存在且是目录） */
export function isFolderUsable(folderPath: string): boolean {
  try {
    return !!folderPath && fs.statSync(folderPath).isDirectory();
  } catch {
    return false;
  }
}

/** id 是否是「纯文件名」——不含任何路径成分 */
function isPlainFileName(id: string): boolean {
  return !!id && !id.includes('/') && !id.includes('\\') && !id.includes('..');
}

/**
 * 已分配但**尚未落盘**的文件名。
 *
 * `uniqueFileName` 只查磁盘，所以连续两次为新文章取名字（中间还没写文件）会拿到同一个名字，
 * 第二篇就会盖掉第一篇。把已分配的名字记下来，直到真正写盘再释放。
 */
const reservedNames = new Set<string>();

/**
 * 取一个不冲突的文件名；`excludeName` 表示「自己」不算冲突。
 *
 * ⚠️ **只在「新建文章 / 重命名 / 另存模板」时使用，绝不能出现在保存路径上**：
 * 保存是「覆写自己那个文件」，一旦在这里加序号，同一次编辑就会被存成
 * `未命名文章.md` / `(2).md` / `(3).md` —— 这就是重复文件的来源。
 */
function uniqueFileName(dir: string, base: string, excludeName?: string): string {
  let name = `${base}.md`;
  let i = 2;
  while (
    name !== excludeName &&
    (reservedNames.has(name) || fs.existsSync(path.join(dir, name)))
  ) {
    name = `${base} (${i}).md`;
    i += 1;
  }
  return name;
}

// ---------- 缓存 ----------

let cache: StoredArticle[] | null = null;
let cacheFolder = '';

export function invalidateCache(): void {
  cache = null;
  cacheFolder = '';
}

/** 当前生效的文件夹路径；未启用或不可用时返回空串 */
export function currentFolder(): string {
  const cfg = readStorageConfig();
  return cfg.mode === 'folder' && isFolderUsable(cfg.folderPath) ? cfg.folderPath : '';
}

// ---------- 读 ----------

export function listArticles(force = false): StoredArticle[] {
  const dir = currentFolder();
  if (!dir) return [];
  if (!force && cache && cacheFolder === dir) return cache;

  let entries: fs.Dirent[];
  try {
    entries = fs.readdirSync(dir, { withFileTypes: true });
  } catch (err) {
    console.error('[articleStore] 无法读取文件夹:', err);
    return [];
  }

  const articles: StoredArticle[] = [];
  for (const entry of entries) {
    if (!entry.isFile()) continue;
    if (!MD_EXT.test(entry.name)) continue;
    if (entry.name.startsWith('.')) continue; // 跳过隐藏文件

    const full = path.join(dir, entry.name);
    try {
      const content = fs.readFileSync(full, 'utf-8');
      const stat = fs.statSync(full);
      articles.push({
        id: entry.name,
        title: entry.name.replace(MD_EXT, ''),
        content,
        createdAt: Math.round(stat.birthtimeMs || stat.mtimeMs),
        updatedAt: Math.round(stat.mtimeMs),
        wordCount: content.replace(/\s/g, '').length,
      });
    } catch (err) {
      // 单个文件读失败（权限/编码）不应影响整个列表
      console.warn(`[articleStore] 跳过无法读取的文件 ${entry.name}:`, err);
    }
  }

  articles.sort((a, b) => b.updatedAt - a.updatedAt);
  cache = articles;
  cacheFolder = dir;
  return articles;
}

// ---------- 写 ----------

/**
 * 保存文章到文件。
 *
 * **核心规则：一篇文章 = 一个文件；保存只覆写，绝不改名、绝不加序号。**
 *
 * 为什么连改名也不能做（实测教训）：
 *   保存时若发现「id 的基名 ≠ 标题」就顺势改名，渲染层是**拿不到新文件名的**，
 *   于是它的 id 仍指向旧文件名；下一次保存找不到旧文件，就会去 `uniqueFileName()`
 *   取一个带序号的名字 —— 每保存一次多一个文件（一次改标题能连出 `(2)(3)(4)…`）。
 *   改名是**独立操作**（`renameArticleFile`），由渲染层在标题变化时显式调用并把
 *   新文件名同步回 state；保存路径上永远不做这件事。
 *
 * 目标文件名：
 *  - `id` 是合法文件名（正常情况）→ 就是它
 *  - 否则（历史遗留的内存 id）→ 用标题推导
 */
export function saveArticleToFolder(article: {
  id?: string;
  title: string;
  content: string;
}): { ok: boolean; id?: string; error?: string } {
  const dir = currentFolder();
  if (!dir) return { ok: false, error: '未启用本地文件夹模式，或文件夹不可用' };

  try {
    const rawId = typeof article.id === 'string' ? article.id : '';
    const targetName =
      isPlainFileName(rawId) && MD_EXT.test(rawId)
        ? rawId
        : `${sanitizeBaseName(article.title)}.md`;

    fs.writeFileSync(path.join(dir, targetName), article.content ?? '', 'utf-8');
    reservedNames.delete(targetName); // 已落盘，磁盘检查足以判重
    invalidateCache();
    return { ok: true, id: targetName };
  } catch (err) {
    return { ok: false, error: (err as Error)?.message || String(err) };
  }
}

/** 为新文章取一个不冲突的文件名（渲染层用它作为文章 id，从源头避免重名） */
export function resolveArticleFileName(title: string): string {
  const dir = currentFolder();
  const base = sanitizeBaseName(title);
  if (!dir) return `${base}.md`;
  const name = uniqueFileName(dir, base);
  // 占住这个名字：连续新建两篇同名文章时，两次调用必须拿到不同的名字
  reservedNames.add(name);
  return name;
}

/**
 * 重命名文章文件，返回新的文件名。
 * 渲染层必须用返回值同步更新它的文章 id，否则下次保存又会新建一个文件。
 */
export function renameArticleFile(
  id: string,
  newTitle: string
): { ok: boolean; id?: string; error?: string } {
  const dir = currentFolder();
  if (!dir) return { ok: false, error: '未启用本地文件夹模式，或文件夹不可用' };

  const oldName = String(id ?? '');
  if (!isPlainFileName(oldName) || !MD_EXT.test(oldName)) {
    return { ok: false, error: '非法的文件名' };
  }

  const oldPath = path.join(dir, oldName);
  if (!fs.existsSync(oldPath)) return { ok: false, error: '原文件不存在' };

  const base = sanitizeBaseName(newTitle);
  if (oldName.replace(MD_EXT, '') === base) return { ok: true, id: oldName }; // 标题没变

  const targetName = uniqueFileName(dir, base, oldName);
  try {
    // 用 rename 而不是「读+写+删」：原子操作，且保留文件系统时间戳
    fs.renameSync(oldPath, path.join(dir, targetName));
    reservedNames.delete(targetName);
    invalidateCache();
    return { ok: true, id: targetName };
  } catch (err) {
    return { ok: false, error: (err as Error)?.message || String(err) };
  }
}

export function deleteArticleFile(id: string): { ok: boolean; error?: string } {
  const dir = currentFolder();
  if (!dir) return { ok: false, error: '未启用本地文件夹模式，或文件夹不可用' };

  const name = String(id ?? '');
  // 明确拒绝含路径成分的 id。
  // 不用 `path.basename` 静默净化——那会让调用方以为"删掉了"，实际什么也没做。
  if (!isPlainFileName(name) || !MD_EXT.test(name)) {
    return { ok: false, error: '非法的文件名' };
  }

  try {
    const full = path.join(dir, name);
    if (fs.existsSync(full)) fs.unlinkSync(full);
    invalidateCache();
    return { ok: true };
  } catch (err) {
    return { ok: false, error: (err as Error)?.message || String(err) };
  }
}

/**
 * 把一批文章写入文件夹（用于「浏览器存储 → 本地文件夹」的首次迁移）。
 * 已存在的同名文件会被跳过，不覆盖用户文件夹里已有的内容。
 */
export function importArticlesToFolder(
  folderPath: string,
  articles: Array<{ title: string; content: string }>
): { ok: boolean; written: number; skipped: number; error?: string } {
  if (!isFolderUsable(folderPath)) {
    return { ok: false, written: 0, skipped: 0, error: '目标文件夹不存在' };
  }

  let written = 0;
  let skipped = 0;
  try {
    for (const article of articles) {
      const base = sanitizeBaseName(article.title);
      const name = `${base}.md`;
      const full = path.join(folderPath, name);
      if (fs.existsSync(full)) {
        skipped += 1;
        continue;
      }
      fs.writeFileSync(full, article.content ?? '', 'utf-8');
      written += 1;
    }
    invalidateCache();
    return { ok: true, written, skipped };
  } catch (err) {
    return { ok: false, written, skipped, error: (err as Error)?.message || String(err) };
  }
}

/** 统计文件夹中的 md 数量（供 UI 展示，不读内容） */
export function countMarkdownFiles(folderPath: string): number {
  if (!isFolderUsable(folderPath)) return 0;
  try {
    return fs
      .readdirSync(folderPath, { withFileTypes: true })
      .filter((e) => e.isFile() && MD_EXT.test(e.name) && !e.name.startsWith('.')).length;
  } catch {
    return 0;
  }
}

// ---------- 文件级模板（<文章文件夹>/_templates/*.md） ----------

/**
 * 模板子目录名。
 * 刻意放在**文章文件夹内部**：用户可以把「文章 + 模板」一起用 Git 管理并共享给同事；
 * 而 `_templates` 是子目录，不会被 `listArticles()` 当成文章读进来（那里只收文件）。
 */
export const TEMPLATES_DIR_NAME = '_templates';

export interface TemplateFile {
  /** 文件名（含 .md），作为模板 id */
  id: string;
  /** 文件名去掉 .md */
  name: string;
  content: string;
}

/** 模板目录路径；未启用文件夹模式时返回空串 */
export function templatesDirPath(): string {
  const dir = currentFolder();
  return dir ? path.join(dir, TEMPLATES_DIR_NAME) : '';
}

/** 模板功能是否可用（需要处于文件夹模式） */
export function isTemplatesAvailable(): boolean {
  return !!templatesDirPath();
}

/** 确保模板目录存在（不存在则创建） */
export function ensureTemplatesDir(): { ok: boolean; path: string; error?: string } {
  const target = templatesDirPath();
  if (!target) return { ok: false, path: '', error: '需要先启用本地文件夹模式' };
  try {
    fs.mkdirSync(target, { recursive: true });
    return { ok: true, path: target };
  } catch (err) {
    return { ok: false, path: target, error: (err as Error)?.message || String(err) };
  }
}

export function listTemplates(): TemplateFile[] {
  const target = templatesDirPath();
  if (!target || !isFolderUsable(target)) return [];

  try {
    const entries = fs.readdirSync(target, { withFileTypes: true });
    const templates: TemplateFile[] = [];
    for (const entry of entries) {
      if (!entry.isFile() || !MD_EXT.test(entry.name) || entry.name.startsWith('.')) continue;
      try {
        templates.push({
          id: entry.name,
          name: entry.name.replace(MD_EXT, ''),
          content: fs.readFileSync(path.join(target, entry.name), 'utf-8'),
        });
      } catch (err) {
        console.warn(`[articleStore] 跳过无法读取的模板 ${entry.name}:`, err);
      }
    }
    templates.sort((a, b) => a.name.localeCompare(b.name, 'zh-Hans-CN'));
    return templates;
  } catch {
    return [];
  }
}

/** 把内容存为模板。同名默认覆盖——模板是用户主动维护的资源，覆盖比"悄悄加序号"更符合预期 */
export function saveTemplateAs(
  name: string,
  content: string,
  overwrite = true
): { ok: boolean; id?: string; error?: string } {
  const ensured = ensureTemplatesDir();
  if (!ensured.ok) return ensured;

  const base = sanitizeBaseName(name);
  const fileName = overwrite ? `${base}.md` : uniqueFileName(ensured.path, base);

  try {
    fs.writeFileSync(path.join(ensured.path, fileName), content ?? '', 'utf-8');
    return { ok: true, id: fileName };
  } catch (err) {
    return { ok: false, error: (err as Error)?.message || String(err) };
  }
}

export function deleteTemplate(id: string): { ok: boolean; error?: string } {
  const target = templatesDirPath();
  if (!target) return { ok: false, error: '需要先启用本地文件夹模式' };

  const name = String(id ?? '');
  if (name.includes('/') || name.includes('\\') || name.includes('..')) {
    return { ok: false, error: '非法的模板文件名' };
  }
  if (!MD_EXT.test(name)) return { ok: false, error: '非法的模板文件名' };

  try {
    fs.unlinkSync(path.join(target, name));
    return { ok: true };
  } catch (err) {
    return { ok: false, error: (err as Error)?.message || String(err) };
  }
}

// ---------- 重复文件清理（处理历史 bug 遗留的 `X (2).md` / `X (3).md`） ----------

/** 形如 `标题 (2)` 的重复后缀 */
const DUP_SUFFIX = /^(.+?) \((\d+)\)$/;

export interface DuplicateFileInfo {
  /** 文件名（含 .md） */
  id: string;
  size: number;
  mtime: number;
  /** 正文开头（用于区分「同一篇的历史副本」和「两篇不同文章」） */
  preview: string;
}

export interface DuplicateGroup {
  /** 去掉序号后的原始名称 */
  base: string;
  files: DuplicateFileInfo[];
}

/**
 * 扫描重复文件。**只读，不做任何改动。**
 *
 * 归组方式：去掉尾部 ` (N)` 后同名的算一组（大小写不敏感），
 * 组内多于一个文件才算重复。仅用于给 UI 展示候选，是否清理由用户决定。
 */
export function scanDuplicateFiles(): DuplicateGroup[] {
  const dir = currentFolder();
  if (!dir) return [];

  let entries: fs.Dirent[];
  try {
    entries = fs.readdirSync(dir, { withFileTypes: true });
  } catch {
    return [];
  }

  const buckets = new Map<string, { base: string; files: DuplicateFileInfo[] }>();
  for (const entry of entries) {
    if (!entry.isFile() || !MD_EXT.test(entry.name) || entry.name.startsWith('.')) continue;
    const bare = entry.name.replace(MD_EXT, '');
    const matched = bare.match(DUP_SUFFIX);
    const key = (matched ? matched[1] : bare).toLowerCase();

    let size = 0;
    let mtime = 0;
    let preview = '';
    try {
      const full = path.join(dir, entry.name);
      const stat = fs.statSync(full);
      size = stat.size;
      mtime = Math.round(stat.mtimeMs);
      // 只读开头一小段即可——用来让用户分辨「同一篇的历史副本」还是「两篇不同文章」
      preview = fs
        .readFileSync(full, 'utf-8')
        .slice(0, 200)
        .replace(/\s+/g, ' ')
        .trim()
        .slice(0, 60);
    } catch {
      // 单个文件取不到 stat / 读不到内容不应影响整组扫描
    }

    const bucket = buckets.get(key) ?? { base: matched ? matched[1] : bare, files: [] };
    bucket.files.push({ id: entry.name, size, mtime, preview });
    buckets.set(key, bucket);
  }

  const groups: DuplicateGroup[] = [];
  for (const bucket of buckets.values()) {
    if (bucket.files.length < 2) continue;
    bucket.files.sort((a, b) => a.mtime - b.mtime); // 最旧 → 最新
    groups.push({ base: bucket.base, files: bucket.files });
  }
  groups.sort((a, b) => a.base.localeCompare(b.base, 'zh-Hans-CN'));
  return groups;
}

/**
 * 把指定文件**移入系统回收站**（可恢复），不做硬删除。
 *
 * 这是唯一允许的清理方式：出错了用户还能从回收站捞回来。
 * 每次最多处理 `MAX_TRASH_BATCH` 个，避免误传超长列表造成事故。
 */
const MAX_TRASH_BATCH = 200;

export async function trashArticleFiles(
  ids: string[]
): Promise<{ ok: boolean; trashed: number; failed: string[]; error?: string }> {
  const dir = currentFolder();
  if (!dir) return { ok: false, trashed: 0, failed: [], error: '未启用本地文件夹模式' };

  const list = Array.isArray(ids) ? ids.slice(0, MAX_TRASH_BATCH) : [];
  let trashed = 0;
  const failed: string[] = [];

  for (const raw of list) {
    const name = String(raw ?? '');
    if (!isPlainFileName(name) || !MD_EXT.test(name)) {
      failed.push(name);
      continue;
    }
    const full = path.join(dir, name);
    try {
      if (!fs.existsSync(full)) continue;
      await shell.trashItem(full); // 回收站，可恢复
      trashed += 1;
    } catch (err) {
      failed.push(name);
      console.warn('[articleStore] 移入回收站失败:', name, err);
    }
  }

  invalidateCache();
  return { ok: failed.length === 0, trashed, failed };
}

// ---------- IPC 注册 ----------

/**
 * 注册文章存储相关的全部 IPC。
 *
 * 单独抽成函数（而不是堆在 main.ts 里）是为了**可测试**：测试进程可以直接调用它，
 * 不必拉起完整的主进程入口；main.ts 只负责在窗口就绪后调用一次。
 *
 * @param getWindow 取当前主窗口（作为对话框父窗口），可为空
 */
export function registerStorageIpc(getWindow: () => BrowserWindow | null = () => null): void {
  /**
   * 同步返回文章列表。
   *
   * 刻意用同步 IPC：渲染层的 storageService 是同步接口且被大量同步调用，
   * 改成异步会牵动整个 App 的数据流。本地读盘量很小（几十个 md），代价可接受。
   */
  ipcMain.on('storage:listArticlesSync', (event) => {
    try {
      const cfg = readStorageConfig();
      event.returnValue = cfg.mode === 'folder' ? listArticles() : [];
    } catch (err) {
      console.error('[storage] listArticlesSync 失败:', err);
      event.returnValue = [];
    }
  });

  ipcMain.on('storage:getConfigSync', (event) => {
    try {
      const cfg = readStorageConfig();
      const usable = cfg.mode === 'folder' && isFolderUsable(cfg.folderPath);
      event.returnValue = {
        ...cfg,
        folderUsable: usable,
        fileCount: usable ? countMarkdownFiles(cfg.folderPath) : 0,
      };
    } catch {
      event.returnValue = { mode: 'browser', folderPath: '', folderUsable: false, fileCount: 0 };
    }
  });

  // 选择文章文件夹
  ipcMain.handle('storage:pickFolder', async () => {
    const options: Electron.OpenDialogOptions = {
      title: '选择文章存储文件夹',
      buttonLabel: '使用此文件夹',
      properties: ['openDirectory', 'createDirectory'],
    };
    const win = getWindow();
    const result = win
      ? await dialog.showOpenDialog(win, options)
      : await dialog.showOpenDialog(options);
    if (result.canceled || !result.filePaths[0]) return { canceled: true, path: '', fileCount: 0 };
    const folderPath = result.filePaths[0];
    return { canceled: false, path: folderPath, fileCount: countMarkdownFiles(folderPath) };
  });

  // 切换存储模式（可同时把现有文章迁移进文件夹）
  ipcMain.handle(
    'storage:setMode',
    (
      _event,
      payload: {
        mode: 'browser' | 'folder';
        folderPath?: string;
        migrate?: Array<{ title: string; content: string }>;
      }
    ) => {
      const current = readStorageConfig();
      const mode = payload?.mode === 'folder' ? 'folder' : 'browser';

      if (mode === 'folder') {
        const folderPath =
          typeof payload?.folderPath === 'string' ? payload.folderPath : current.folderPath;
        if (!isFolderUsable(folderPath)) {
          return { ok: false, error: '该文件夹不存在或不可访问，请重新选择' };
        }

        let migrated = 0;
        let skipped = 0;
        if (Array.isArray(payload.migrate) && payload.migrate.length > 0) {
          const res = importArticlesToFolder(folderPath, payload.migrate);
          if (!res.ok) return { ok: false, error: res.error || '迁移文章失败' };
          migrated = res.written;
          skipped = res.skipped;
        }

        const write = writeStorageConfig({ mode: 'folder', folderPath });
        if (!write.ok) return { ok: false, error: write.error };
        invalidateCache();
        return {
          ok: true,
          mode: 'folder',
          folderPath,
          migrated,
          skipped,
          fileCount: countMarkdownFiles(folderPath),
        };
      }

      // 切回浏览器存储：保留 folderPath，方便以后一键切回同一文件夹
      const write = writeStorageConfig({ mode: 'browser', folderPath: current.folderPath });
      if (!write.ok) return { ok: false, error: write.error };
      invalidateCache();
      return { ok: true, mode: 'browser', folderPath: current.folderPath };
    }
  );

  // 外部改动（在编辑器里改了 md）后重新扫盘
  ipcMain.handle('storage:rescan', () => {
    const cfg = readStorageConfig();
    if (cfg.mode !== 'folder') return { ok: true, count: 0 };
    return { ok: true, count: listArticles(true).length };
  });

  ipcMain.handle(
    'storage:saveArticle',
    (_event, article: { id?: string; title: string; content: string }) => {
      const cfg = readStorageConfig();
      if (cfg.mode !== 'folder') return { ok: true, skipped: true };
      return saveArticleToFolder({
        id: typeof article?.id === 'string' ? article.id : undefined,
        title: String(article?.title ?? '未命名'),
        content: String(article?.content ?? ''),
      });
    }
  );

  ipcMain.handle('storage:deleteArticle', (_event, id: string) => {
    const cfg = readStorageConfig();
    if (cfg.mode !== 'folder') return { ok: true, skipped: true };
    return deleteArticleFile(String(id ?? ''));
  });

  /** 同步为新文章取一个不冲突的文件名（渲染层新建文章时用作 id） */
  ipcMain.on('storage:resolveArticleIdSync', (event, title: string) => {
    try {
      event.returnValue = resolveArticleFileName(String(title ?? '未命名文章'));
    } catch {
      event.returnValue = '';
    }
  });

  /** 重命名：返回新文件名，渲染层据此更新文章 id（否则下次保存会新建文件） */
  ipcMain.handle('storage:renameArticle', (_event, payload: { id: string; title: string }) =>
    renameArticleFile(String(payload?.id ?? ''), String(payload?.title ?? ''))
  );

  /** 扫描重复文件（只读） */
  ipcMain.handle('storage:scanDuplicates', () => {
    const cfg = readStorageConfig();
    if (cfg.mode !== 'folder') return { ok: true, groups: [], error: undefined };
    try {
      return { ok: true, groups: scanDuplicateFiles() };
    } catch (err) {
      return { ok: false, groups: [], error: (err as Error)?.message || String(err) };
    }
  });

  /** 把重复文件移入回收站（需渲染层列出并经用户确认的候选） */
  ipcMain.handle('storage:trashDuplicates', async (_event, ids: string[]) => {
    const cfg = readStorageConfig();
    if (cfg.mode !== 'folder') return { ok: false, trashed: 0, failed: [], error: '未启用本地文件夹模式' };
    return await trashArticleFiles(Array.isArray(ids) ? ids : []);
  });

  // 在系统文件管理器中打开文章文件夹
  ipcMain.handle('storage:openFolder', async () => {
    const cfg = readStorageConfig();
    if (cfg.mode !== 'folder' || !isFolderUsable(cfg.folderPath)) {
      return { ok: false, error: '尚未选择有效的文件夹' };
    }
    const errMsg = await shell.openPath(cfg.folderPath);
    return { ok: !errMsg, error: errMsg || undefined };
  });

  // ---------- 文件级模板 ----------

  /** 同步返回模板列表与模板目录（抽屉打开时读取） */
  ipcMain.on('storage:listTemplatesSync', (event) => {
    try {
      event.returnValue = {
        available: isTemplatesAvailable(),
        dir: templatesDirPath(),
        templates: listTemplates(),
      };
    } catch {
      event.returnValue = { available: false, dir: '', templates: [] };
    }
  });

  ipcMain.handle('storage:saveTemplate', (_event, payload: { name: string; content: string }) =>
    saveTemplateAs(String(payload?.name ?? '未命名模板'), String(payload?.content ?? ''))
  );

  ipcMain.handle('storage:deleteTemplate', (_event, id: string) => deleteTemplate(String(id ?? '')));

  // 打开模板目录（顺带创建，方便用户第一次直接往里放模板）
  ipcMain.handle('storage:openTemplatesDir', async () => {
    const ensured = ensureTemplatesDir();
    if (!ensured.ok) return { ok: false, error: ensured.error };
    const errMsg = await shell.openPath(ensured.path);
    return { ok: !errMsg, error: errMsg || undefined };
  });
}
