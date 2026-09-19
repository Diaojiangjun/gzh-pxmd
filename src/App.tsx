import React, { useState, useEffect, useRef, useMemo } from 'react';
import {
  FileEdit,
  LayoutGrid,
  Palette,
  Smile,
  Layers,
  Image as ImageIcon,
  Bookmark,
  HelpCircle,
  BookOpen,
  History,
  ChevronsLeft,
  ChevronsRight,
  Cloud,
  HardDrive,
} from 'lucide-react';
import { TopNavBar } from './components/TopNavBar';
import { EditorToolbar } from './components/EditorToolbar';
import { MarkdownEditor } from './components/MarkdownEditor';
import { PreviewPanel, PreviewPanelRef } from './components/PreviewPanel';
import { ThemeDesignerModal } from './components/ThemeDesignerModal';
import { ThemeManagerModal } from './components/ThemeManagerModal';
import { ComponentDrawer } from './components/ComponentDrawer';
import { BackgroundModal } from './components/BackgroundModal';
import { StickerModal } from './components/StickerModal';
import { ImageManagerModal } from './components/ImageManagerModal';
import { PresetModal } from './components/PresetModal';
import { AboutModal } from './components/AboutModal';
import { ArticleManagerDrawer } from './components/ArticleManagerDrawer';
import { HistoryModal } from './components/HistoryModal';
import { PreflightModal } from './components/PreflightModal';
import { CoverGeneratorModal } from './components/CoverGeneratorModal';
import { BackupModal } from './components/BackupModal';
import { AIPanel, ApplyTarget } from './components/AIPanel';
import { ImageHostModal } from './components/ImageHostModal';
import { StorageModeModal } from './components/StorageModeModal';

import {
  ThemeConfig,
  BackgroundSettings,
  StickerItem,
  ImageAttachment,
  LocalPreset,
  PreviewMode,
  LayoutMode,
  ArticleItem,
  HistorySnapshot,
  SnapshotTrigger,
} from './types';
import {
  DEFAULT_THEMES,
  DEFAULT_BACKGROUND,
  DEFAULT_STICKERS,
  INITIAL_MARKDOWN,
} from './data/defaultData';
import { compileWeChatMarkdown, validateCustomBlocks } from './services/gzhCompiler';
import { processMermaid, hasMermaid, loadMathJax, isMathJaxReady } from './services/diagramRenderer';
import { hasMath, disableMathRendering } from './services/mathExtension';
import { electronBridge } from './services/electronBridge';
import { imageHostService } from './services/imageHostService';
import { storageService } from './services/storageService';
import { dbService } from './services/dbService';
import { panguFormat } from './utils/pangu';
import * as promoService from './services/promoService';

const TEMPLATES = {
  blank: '# 新文章标题\n\n在此开始编写您的微信公众号文章...\n',
  guide: `# 深度干货：公众号爆款排版与内容法则

> 在信息过载的时代，良好的排版不是单纯为了美观，而是为了降低读者的视觉认知负担。

## 01 / 视觉节奏感
优秀的公众号文章通常具备清晰的层级感与呼吸空间：

- **留白呼吸感**：段落之间空行，行高适中（1.6~1.8倍）
- **重点提炼**：关键语句加粗，色彩克制统一
- **图文配合**：每 300~500 字配一张高清图

## 02 / 核心要点清单
1. **标题吸引力**：直击痛点，激发点击欲
2. **开篇 3 秒定律**：以金句或引子迅速抓住读者注意力
3. **章节小标题**：使用醒目的标识强化阅读指引

---

*欢迎在下方留言分享您的写作心得与排版技巧！*`,
  tech: `# 前沿技术观察：现代化排版引擎与工程实践

> 本文剖析跨平台排版工具的设计理念与内核渲染原理。

## 技术架构概览
现代排版工具通过虚拟 AST 与内联样式引擎，将标准 GFM 编译为微信专属的内联富文本。

\`\`\`typescript
interface CompilerConfig {
  theme: string;
  inlineStyle: boolean;
  autoSanitize: boolean;
}
\`\`\`

## 性能指标对比
| 引擎版本 | 编译耗时 | 样式准确率 |
| :--- | :--- | :--- |
| v1.0.0 传统 DOM | 120ms | 85% |
| v3.2.0 内联 AST | 8ms | 99.8% |

---

*Powered by 宝藏排版器 Pro*`,
  story: `# 故事连载：那些藏在文字背后的温热时光

> 每一个故事，都是时光写给岁月最温柔的注脚。

## 第一章 / 启程的清晨
窗外微光熹微，城市刚刚苏醒。

有些旋律一响起来，整座城市的故事都开始流动。我们奔波于日常的琐碎，却常常忘了抬头看看头顶那片晴朗的星空。

## 第二章 / 沿途的微光
- 那杯冒着热气的咖啡
- 街角书店里泛黄的扉页
- 偶遇朋友时眼角弯起的笑意

---

**下期预告**：在下一章中，我们将去往南方的海边小镇，探索更多未知的故事。`,
};

/**
 * 启动时一次性读取全部本地状态。
 *
 * 背景：这些数据原先分散在 10 个 `useState` 初始化函数里各自读取，其中
 * `storageService.getArticles()` 被重复调用了 4 次（articles / currentArticleId /
 * markdown / title），而它每次都会把**整个文章库完整 JSON.parse 一遍**。
 * StrictMode 下初始化函数会跑两遍 → 最多 8 次全量反序列化，文章越多启动越慢
 * （实测文章库 4.8MB 时：单次 12.6ms、连读 4 次 50ms）。
 *
 * 这里收敛为「模块级 lazy 单例」：整个进程只解析一次，各 useState 共享同一份结果。
 */
interface BootData {
  articles: ArticleItem[];
  currentArticleId: string;
  activeArticle: ArticleItem | undefined;
  snapshots: HistorySnapshot[];
  activeTheme: ThemeConfig;
  background: BackgroundSettings;
  stickers: StickerItem[];
  images: ImageAttachment[];
  presets: LocalPreset[];
}

let bootDataCache: BootData | null = null;

function loadBootData(): BootData {
  if (bootDataCache) return bootDataCache;

  let articles = storageService.getArticles();
  if (!articles || articles.length === 0) {
    // 首次启动：落一篇欢迎文档
    const welcomeTitle = '欢迎使用宝藏排版器 Pro';
    const initial: ArticleItem = {
      // 文件夹模式下 id 必须是文件名，否则这篇欢迎文档会被反复重建
      id: storageService.resolveNewArticleId(welcomeTitle) || 'article-' + Date.now(),
      title: welcomeTitle,
      content: INITIAL_MARKDOWN,
      createdAt: Date.now(),
      updatedAt: Date.now(),
      wordCount: INITIAL_MARKDOWN.length,
    };
    storageService.saveArticle(initial);
    articles = [initial];
  }

  const savedId = storageService.getCurrentArticleId();
  const currentArticleId =
    savedId && articles.some((a) => a.id === savedId) ? savedId : articles[0]?.id || 'article-default';

  // 浅拷贝数组：state 与缓存分离，避免任何就地改动污染这份启动快照
  const articlesSnapshot = [...articles];
  const activeArticle =
    articlesSnapshot.find((a) => a.id === currentArticleId) || articlesSnapshot[0];

  bootDataCache = {
    articles: articlesSnapshot,
    currentArticleId,
    activeArticle,
    snapshots: [...storageService.getSnapshots()],
    activeTheme: storageService.getActiveTheme() || DEFAULT_THEMES[0],
    background: storageService.getBackground() || DEFAULT_BACKGROUND,
    stickers: [...DEFAULT_STICKERS, ...storageService.getCustomStickers()],
    images: [...storageService.getImageAttachments()],
    presets: [...storageService.getSavedPresets()],
  };
  return bootDataCache;
}

export default function App() {
  // 本地状态初始化统一走 loadBootData()，避免重复反序列化（详见该函数注释）
  const boot = loadBootData();

  // 1. Articles & Document State
  const [articles, setArticles] = useState<ArticleItem[]>(boot.articles);
  const [currentArticleId, setCurrentArticleId] = useState<string>(boot.currentArticleId);

  // Current active article content & title
  const [markdown, setMarkdown] = useState<string>(boot.activeArticle?.content || INITIAL_MARKDOWN);
  const [title, setTitle] = useState<string>(boot.activeArticle?.title || '未命名公众号文章');

  // History Snapshots State
  const [snapshots, setSnapshots] = useState<HistorySnapshot[]>(boot.snapshots);
  const [activeTheme, setActiveTheme] = useState<ThemeConfig>(boot.activeTheme);
  const [background, setBackground] = useState<BackgroundSettings>(boot.background);
  const [stickers, setStickers] = useState<StickerItem[]>(boot.stickers);
  const [images, setImages] = useState<ImageAttachment[]>(boot.images);
  const [presets, setPresets] = useState<LocalPreset[]>(boot.presets);

  const [previewMode, setPreviewMode] = useState<PreviewMode>('default');

  // 主工作区布局：左右分栏(默认) / 上下分栏 / 专注编辑 / 专注预览 + 可拖拽分割比例
  const [layoutMode, setLayoutMode] = useState<LayoutMode>('horizontal');
  const [splitRatio, setSplitRatio] = useState<number>(50);
  const [isDraggingSplit, setIsDraggingSplit] = useState(false);
  const workspaceRef = useRef<HTMLDivElement | null>(null);

  // 读取 localStorage 中的 UI 偏好（带容错，Electron 环境下 window.localStorage 始终可用）
  const readUIBool = (key: string, fallback: boolean): boolean => {
    try {
      const v = localStorage.getItem(key);
      return v === null ? fallback : v === '1';
    } catch {
      return fallback;
    }
  };
  const writeUIBool = (key: string, value: boolean) => {
    try {
      localStorage.setItem(key, value ? '1' : '0');
    } catch {
      /* 忽略写入异常 */
    }
  };

  // 左侧竖栏是否收起（收起后释放横向空间给编辑区），持久化到 localStorage
  const [railCollapsed, setRailCollapsed] = useState(() => readUIBool('gzh.railCollapsed', false));

  // 编辑器行号显示开关，持久化到 localStorage
  const [showLineNumbers, setShowLineNumbers] = useState(() => readUIBool('gzh.showLineNumbers', true));

  // 编辑器深色模式，持久化到 localStorage
  const [editorDarkMode, setEditorDarkMode] = useState(() => readUIBool('gzh.editorDarkMode', false));

  // 持久化 UI 偏好：折叠侧栏 / 行号开关 / 编辑器深色模式
  useEffect(() => {
    writeUIBool('gzh.railCollapsed', railCollapsed);
  }, [railCollapsed]);
  useEffect(() => {
    writeUIBool('gzh.showLineNumbers', showLineNumbers);
  }, [showLineNumbers]);
  useEffect(() => {
    writeUIBool('gzh.editorDarkMode', editorDarkMode);
  }, [editorDarkMode]);

  const [convertLinksToFootnotes, setConvertLinksToFootnotes] = useState<boolean>(true);
  const [copied, setCopied] = useState<boolean>(false);
  const [toastMessage, setToastMessage] = useState<string | null>(null);

  // Modals & Drawers
  const [isArticleDrawerOpen, setIsArticleDrawerOpen] = useState(false);
  const [isHistoryModalOpen, setIsHistoryModalOpen] = useState(false);
  const [isThemeDesignerOpen, setIsThemeDesignerOpen] = useState(false);
  // 主题管理（对标 WeMD：主题列表 + 实时预览 + CSS 编辑）
  const [isThemeManagerOpen, setIsThemeManagerOpen] = useState(false);
  const [isComponentDrawerOpen, setIsComponentDrawerOpen] = useState(false);
  const [isBackgroundModalOpen, setIsBackgroundModalOpen] = useState(false);
  const [isStickerModalOpen, setIsStickerModalOpen] = useState(false);
  const [isImageModalOpen, setIsImageModalOpen] = useState(false);
  const [isPresetModalOpen, setIsPresetModalOpen] = useState(false);
  const [isAboutModalOpen, setIsAboutModalOpen] = useState(false);
  /** 打开「使用说明」时落到哪个 Tab：从「插入推广位」跳过来时直接进配置页 */
  const [aboutInitialTab, setAboutInitialTab] = useState<'syntax' | 'about' | 'promo'>('syntax');
  const [isPreflightModalOpen, setIsPreflightModalOpen] = useState(false);
  const [isCoverModalOpen, setIsCoverModalOpen] = useState(false);
  const [isBackupModalOpen, setIsBackupModalOpen] = useState(false);
  const [isAIPanelOpen, setIsAIPanelOpen] = useState(false);
  const [isImageHostModalOpen, setIsImageHostModalOpen] = useState(false);
  // 文章存储模式：内置存储 / 本地文件夹
  const [isStorageModeModalOpen, setIsStorageModeModalOpen] = useState(false);
  const [aiSelectedText, setAiSelectedText] = useState('');
  const [aiSelection, setAiSelection] = useState<{ start: number; end: number }>({ start: 0, end: 0 });

  // Refs
  const textareaRef = useRef<HTMLTextAreaElement | null>(null);
  const previewRef = useRef<PreviewPanelRef | null>(null);
  const lastSnapshotRef = useRef<{ time: number; length: number }>({
    time: Date.now(),
    length: markdown.length,
  });

  // Snapshot recording helper
  const recordSnapshot = (trigger: SnapshotTrigger, note?: string) => {
    if (!markdown.trim()) return;
    const lines = markdown.split('\n').length;
    const newSnap: HistorySnapshot = {
      id: 'snap-' + Date.now() + '-' + Math.random().toString(36).substr(2, 4),
      articleId: currentArticleId,
      articleTitle: title,
      content: markdown,
      timestamp: Date.now(),
      trigger,
      charCount: markdown.length,
      lineCount: lines,
      note,
    };
    storageService.saveSnapshot(newSnap);
    setSnapshots((prev) => [newSnap, ...prev.filter((s) => s.id !== newSnap.id)].slice(0, 50));
  };

  // 自动保存需要读取最新文章列表，但又不能把 articles 放进依赖（会自激循环）。
  // 用 ref 持有最新值——同时避免把「保存」这个副作用写进 setState 更新函数（见下）。
  const articlesRef = useRef(articles);
  useEffect(() => {
    articlesRef.current = articles;
  }, [articles]);

  // Auto-save draft & current article debounced
  useEffect(() => {
    const timer = setTimeout(() => {
      void (async () => {
        // 1. General draft
        storageService.saveDraft(markdown, title);
        if (!currentArticleId) return;

        // 2. 文件夹模式下「标题 = 文件名」：标题变了要先**显式改名**，并把新文件名同步回 state。
        //    不能交给保存去"顺手"改——那样渲染层拿不到新名字，下次保存会不断产生 (2)(3)。
        let id = currentArticleId;
        if (storageService.isFolderMode()) {
          const renamed = await storageService.renameArticle(id, title);
          if (renamed.ok && renamed.id) {
            id = renamed.id;
          } else {
            // 原文件已不在（被外部改名/删除）：用标题重新落一个文件，而不是把旧文件名又写回来
            id = storageService.resolveNewArticleId(title) || id;
          }
          if (id !== currentArticleId) {
            setCurrentArticleId(id);
            storageService.setCurrentArticleId(id);
          }
        }

        const existing = articlesRef.current.find(
          (a) => a.id === id || a.id === currentArticleId
        );
        const next: ArticleItem = {
          id,
          title,
          content: markdown,
          createdAt: existing?.createdAt ?? Date.now(),
          updatedAt: Date.now(),
          wordCount: markdown.trim().length,
        };

        // ⚠️ 保存必须放在 setState 更新函数**之外**。
        // 之前写在 setArticles 的 updater 里，而 React StrictMode 会双调用 updater，
        // 导致副作用被执行两次 → 每次自动保存多写出一个文件。
        storageService.saveArticle(next);
        setArticles((prev) => {
          const idx = prev.findIndex((a) => a.id === id || a.id === currentArticleId);
          if (idx === -1) return [next, ...prev];
          const copy = prev.slice();
          copy[idx] = next;
          return copy;
        });
      })();
    }, 600);
    return () => clearTimeout(timer);
  }, [markdown, title, currentArticleId]);

  // 用 ref 持有最新的 markdown 与 recordSnapshot，让定时器的依赖保持为空。
  // 原实现依赖 [markdown, currentArticleId, title]，每次击键都会 clearInterval + 重建，
  // 导致连续写作时 60s 定时器永不触发，「每 3 分钟自动快照」形同虚设。
  const markdownRef = useRef(markdown);
  const recordSnapshotRef = useRef(recordSnapshot);
  useEffect(() => {
    markdownRef.current = markdown;
    recordSnapshotRef.current = recordSnapshot;
  });

  // Periodic Auto-Snapshot (every 3 minutes of active editing if content changed)
  useEffect(() => {
    const interval = setInterval(() => {
      const now = Date.now();
      const len = markdownRef.current.length;
      const lengthDiff = Math.abs(len - lastSnapshotRef.current.length);
      if (now - lastSnapshotRef.current.time > 3 * 60 * 1000 && lengthDiff > 15) {
        recordSnapshotRef.current('auto', '自动定时快照');
        lastSnapshotRef.current = { time: now, length: len };
      }
    }, 60 * 1000);
    return () => clearInterval(interval);
  }, []);

  // 拖拽分割条：实时调整编辑区/预览区比例
  useEffect(() => {
    if (!isDraggingSplit) return;

    const handleMouseMove = (e: MouseEvent) => {
      const container = workspaceRef.current;
      if (!container) return;
      const rect = container.getBoundingClientRect();
      const ratio =
        layoutMode === 'horizontal'
          ? ((e.clientX - rect.left) / rect.width) * 100
          : ((e.clientY - rect.top) / rect.height) * 100;
      // 限制在 20%~80%，避免任一栏被压到不可见
      setSplitRatio(Math.min(80, Math.max(20, ratio)));
    };

    const handleMouseUp = () => setIsDraggingSplit(false);

    document.addEventListener('mousemove', handleMouseMove);
    document.addEventListener('mouseup', handleMouseUp);
    document.body.style.userSelect = 'none';
    document.body.style.cursor = layoutMode === 'horizontal' ? 'col-resize' : 'row-resize';

    return () => {
      document.removeEventListener('mousemove', handleMouseMove);
      document.removeEventListener('mouseup', handleMouseUp);
      document.body.style.userSelect = '';
      document.body.style.cursor = '';
    };
  }, [isDraggingSplit, layoutMode]);

  // 响应式：窗口过窄时自动降级为上下分栏（不覆盖用户主动选择的专注模式）
  useEffect(() => {
    const handleResize = () => {
      if (window.innerWidth < 900) {
        setLayoutMode((prev) => (prev === 'horizontal' ? 'vertical' : prev));
      }
    };
    handleResize();
    window.addEventListener('resize', handleResize);
    return () => window.removeEventListener('resize', handleResize);
  }, []);

  // Sync active theme & background to storage
  useEffect(() => {
    storageService.saveActiveTheme(activeTheme);
  }, [activeTheme]);

  useEffect(() => {
    storageService.saveBackground(background);
  }, [background]);

  // 从 IndexedDB 水合自定义表情与图片素材（彻底突破 LocalStorage 5MB 容量天花板）
  useEffect(() => {
    let cancelled = false;
    (async () => {
      try {
        const [idbStickers, idbImages] = await Promise.all([
          dbService.loadStickers(),
          dbService.loadImages(),
        ]);
        if (cancelled) return;
        if (idbStickers.length > 0) {
          setStickers([...DEFAULT_STICKERS, ...idbStickers]);
        }
        if (idbImages.length > 0) {
          setImages(idbImages);
        }
      } catch (err) {
        console.warn('IndexedDB 素材水合失败，回退到 localStorage:', err);
      }
    })();
    return () => {
      cancelled = true;
    };
  }, []);

  // Toast notification helper：保存定时器句柄，
  // 否则连续两条提示时，前者的定时器会提前把后者抹掉
  const toastTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const showToast = (msg: string) => {
    if (toastTimerRef.current) clearTimeout(toastTimerRef.current);
    setToastMessage(msg);
    toastTimerRef.current = setTimeout(() => {
      setToastMessage(null);
      toastTimerRef.current = null;
    }, 2800);
  };
  useEffect(
    () => () => {
      if (toastTimerRef.current) clearTimeout(toastTimerRef.current);
    },
    []
  );

  // Mermaid 图表异步渲染为 PNG 后的 markdown（公式由编译器内的 marked 扩展处理）
  const [processedMarkdown, setProcessedMarkdown] = useState(markdown);
  // MathJax 状态：idle → ready / failed。状态变化会触发重新编译，
  // 把公式占位符替换为真实 SVG（或降级为原文）
  const [mathState, setMathState] = useState<'idle' | 'ready' | 'failed'>(() =>
    isMathJaxReady() ? 'ready' : 'idle'
  );

  // 检测到公式才懒加载 MathJax（tex-svg 约 1.7MB），加载完重新编译
  useEffect(() => {
    if (mathState !== 'idle' || !hasMath(markdown)) return;
    let cancelled = false;
    loadMathJax()
      .then(() => {
        if (!cancelled) setMathState('ready');
      })
      .catch((e) => {
        console.warn('MathJax 加载失败，公式降级为原文显示:', e);
        disableMathRendering();
        if (!cancelled) setMathState('failed');
      });
    return () => {
      cancelled = true;
    };
  }, [markdown, mathState]);

  useEffect(() => {
    if (!hasMermaid(markdown)) {
      setProcessedMarkdown(markdown);
      return;
    }
    // mermaid.render + canvas 转 PNG 需要数百毫秒，必须防抖；
    // 否则含图文章每敲一个字符都会重跑一次渲染
    let cancelled = false;
    const timer = setTimeout(() => {
      processMermaid(markdown)
        .then((processed) => {
          if (!cancelled) setProcessedMarkdown(processed);
        })
        .catch((e) => {
          console.warn('Mermaid 渲染失败，使用原文:', e);
          if (!cancelled) setProcessedMarkdown(markdown);
        });
    }, 400);
    return () => {
      cancelled = true;
      clearTimeout(timer);
    };
  }, [markdown]);

  // Compile Markdown to WeChat-ready HTML with active theme & background
  const compiledHtml = useMemo(() => {
    return compileWeChatMarkdown(processedMarkdown, activeTheme, background, { convertLinksToFootnotes });
    // mathState 参与依赖：MathJax 就绪后重新编译，替换公式占位符
  }, [processedMarkdown, activeTheme, background, convertLinksToFootnotes, mathState]);

  // 自定义语法块 :::xxx 的轻量体检（未闭合 / 块名不支持），仅用于提示
  const blockErrors = useMemo(() => validateCustomBlocks(markdown), [markdown]);

  // Synchronous scroll from editor to preview
  const handleScrollSync = (percentage: number) => {
    previewRef.current?.scrollToPercentage(percentage);
  };

  // Insert markdown at cursor
  const handleInsertMarkdown = (prefix: string, suffix: string = '', placeholder: string = '') => {
    const target = textareaRef.current;
    if (!target) return;

    const start = target.selectionStart;
    const end = target.selectionEnd;
    const selected = target.value.substring(start, end);
    const content = selected || placeholder;
    const insertText = prefix + content + suffix;
    const scrollTop = target.scrollTop;

    const newVal = target.value.substring(0, start) + insertText + target.value.substring(end);
    setMarkdown(newVal);

    setTimeout(() => {
      target.focus();
      target.selectionStart = start + prefix.length;
      target.selectionEnd = start + prefix.length + content.length;
      // 受控 textarea 失焦更新 value 会重置滚动位置，这里恢复，避免跳回顶部
      target.scrollTop = scrollTop;
    }, 0);
  };

  // Insert Sticker (both small and original without selecting the URL)
  const handleInsertSticker = (sticker: StickerItem, mode: 'small' | 'original') => {
    const target = textareaRef.current;
    const insertText = mode === 'small'
      ? `![sticker:small:${sticker.name}](${sticker.url})`
      : `\n![sticker:original:${sticker.name}](${sticker.url})\n`;

    if (!target) {
      setMarkdown((prev) => prev + insertText);
      showToast(`已插入表情「${sticker.name}」(${mode === 'small' ? '小图' : '原图'})`);
      return;
    }

    const start = target.selectionStart;
    const end = target.selectionEnd;
    const scrollTop = target.scrollTop;
    const newVal = target.value.substring(0, start) + insertText + target.value.substring(end);
    setMarkdown(newVal);

    setTimeout(() => {
      target.focus();
      target.selectionStart = target.selectionEnd = start + insertText.length;
      target.scrollTop = scrollTop;
    }, 0);

    showToast(`已插入表情「${sticker.name}」(${mode === 'small' ? '小图' : '原图'})`);
  };

  // Insert Component Snippet
  const handleInsertSnippet = (snippet: string) => {
    const target = textareaRef.current;
    if (!target) {
      setMarkdown((prev) => prev + '\n' + snippet);
      return;
    }
    const start = target.selectionStart;
    const end = target.selectionEnd;
    const scrollTop = target.scrollTop;
    const newVal = target.value.substring(0, start) + snippet + target.value.substring(end);
    setMarkdown(newVal);
    setTimeout(() => {
      target.focus();
      target.selectionStart = target.selectionEnd = start + snippet.length;
      target.scrollTop = scrollTop;
    }, 0);
    showToast('已插入排版组件！');
  };

  // Primary Action: Copy to WeChat Official Account
  const handleCopyWeChat = async () => {
    try {
      const plainText = markdown;
      const success = await electronBridge.copyToWeChat(compiledHtml, plainText);
      if (success) {
        setCopied(true);
        // Record automatic snapshot on copying
        recordSnapshot('copy', '复制到微信公众号');
        showToast('已复制到剪贴板！可直接在公众号后台编辑器按 Ctrl+V (或 Cmd+V) 粘贴！');
        setTimeout(() => setCopied(false), 2500);
      } else {
        showToast('复制失败，请尝试在浏览器中手动全选复制');
      }
    } catch (e) {
      console.error('Failed to copy to WeChat:', e);
      showToast('复制出错，请检查剪贴板权限');
    }
  };

  // Pangu 中英文排版格式化
  const handlePanguFormat = () => {
    if (!markdown.trim()) {
      showToast('当前没有可格式化的内容');
      return;
    }
    const formatted = panguFormat(markdown);
    if (formatted === markdown) {
      showToast('中英文排版已符合规范，无需调整');
      return;
    }
    recordSnapshot('manual', '中英文排版优化前备份');
    setMarkdown(formatted);
    showToast('中英文排版已优化（中西文间距与全半角标点规范）');
  };

  // 外链转脚注开关
  const handleToggleFootnotes = (value: boolean) => {
    setConvertLinksToFootnotes(value);
    showToast(value ? '已开启：外链自动转文末脚注' : '已关闭：外链保留为原文链接');
  };

  // 封面插入到文章开头
  const handleInsertCoverToArticle = (dataUri: string) => {
    const insertText = `\n![](${dataUri})\n`;
    setMarkdown((prev) => insertText + prev);
    showToast('封面已插入到文章开头');
  };

  // 打开 AI 面板：读取当前编辑器选中文字与光标/选区位置
  const openAIPanel = () => {
    const target = textareaRef.current;
    if (target) {
      setAiSelectedText(target.value.substring(target.selectionStart, target.selectionEnd));
      setAiSelection({ start: target.selectionStart, end: target.selectionEnd });
    } else {
      setAiSelectedText('');
      setAiSelection({ start: 0, end: 0 });
    }
    setIsAIPanelOpen(true);
  };

  // AI 结果应用到编辑器（按目标位置）
  const handleApplyAI = (text: string, targetMode: ApplyTarget) => {
    if (!text) return;

    // 一键排版：整体替换全文
    if (targetMode === 'replace-all') {
      recordSnapshot('ai', 'AI 一键排版前备份');
      setMarkdown(text);
      showToast('AI 排版结果已应用');
      return;
    }

    // 生成标题：插入到文章开头（若已有 # 标题则替换）
    if (targetMode === 'insert-as-title') {
      const titleLine = `# ${text}\n`;
      const current = markdown;
      const firstLineEnd = current.indexOf('\n');
      const firstLine = firstLineEnd === -1 ? current : current.slice(0, firstLineEnd);
      if (firstLine.trimStart().startsWith('# ')) {
        const leading = firstLine.match(/^\s*/)?.[0] ?? '';
        const rest = firstLineEnd === -1 ? '' : current.slice(firstLineEnd + 1);
        setMarkdown(leading + titleLine + rest);
      } else {
        setMarkdown(titleLine + '\n' + current);
      }
      showToast('标题已插入到文章开头');
      return;
    }

    // 替换选中文字 / 插入到光标处
    const start = aiSelection.start;
    const end = targetMode === 'replace-selection' ? aiSelection.end : aiSelection.start;
    const el = textareaRef.current;
    if (!el) {
      setMarkdown((prev) => prev + text);
    } else {
      const scrollTop = el.scrollTop;
      const newVal = el.value.substring(0, start) + text + el.value.substring(end);
      setMarkdown(newVal);
      setTimeout(() => {
        el.focus();
        el.selectionStart = el.selectionEnd = start + text.length;
        el.scrollTop = scrollTop;
      }, 0);
    }
    showToast(targetMode === 'replace-selection' ? '已替换选中文字' : 'AI 结果已插入到光标处');
  };

  // 备份恢复后重新载入全部数据
  const handleDataRestored = () => {
    const all = storageService.getArticles();
    setArticles(all);
    const currentId = storageService.getCurrentArticleId();
    const active = (currentId && all.find((a) => a.id === currentId)) || all[0];
    if (active) {
      setCurrentArticleId(active.id);
      setMarkdown(active.content);
      setTitle(active.title);
    }
    setStickers([...DEFAULT_STICKERS, ...storageService.getCustomStickers()]);
    setImages(storageService.getImageAttachments());
    setPresets(storageService.getSavedPresets());
    setSnapshots(storageService.getSnapshots());
    const theme = storageService.getActiveTheme();
    if (theme) setActiveTheme(theme);
    const bg = storageService.getBackground();
    if (bg) setBackground(bg);
    showToast('备份数据已恢复');
  };

  // Article Management Handlers
  const handleCreateNewArticle = (
    newTitle: string = '未命名文章',
    templateType: 'blank' | 'tech' | 'guide' | 'story' = 'blank'
  ) => {
    // Record snapshot of current article before switching
    if (markdown.trim()) {
      recordSnapshot('switch', '新建文章前自动归档');
    }
    const templateContent = TEMPLATES[templateType] || TEMPLATES.blank;
    // 文件夹模式下文章 id 就是文件名：必须先用主进程解析出唯一文件名，
    // 否则内存 id 会被当成「新文章」，导致每次自动保存都生成一个带序号的新文件
    const newId = storageService.resolveNewArticleId(newTitle) || 'article-' + Date.now();
    const newArticle: ArticleItem = {
      id: newId,
      title: newTitle,
      content: templateContent,
      createdAt: Date.now(),
      updatedAt: Date.now(),
      wordCount: templateContent.length,
    };
    storageService.saveArticle(newArticle);
    storageService.setCurrentArticleId(newId);
    setArticles((prev) => [newArticle, ...prev]);
    setCurrentArticleId(newId);
    setMarkdown(templateContent);
    setTitle(newTitle);
    setIsArticleDrawerOpen(false);
    showToast(`已新建文章「${newTitle}」`);
  };

  /** 用文件模板新建文章（模板来自 <文章文件夹>/_templates/*.md） */
  const handleCreateFromTemplate = (templateName: string, templateContent: string) => {
    if (markdown.trim()) {
      recordSnapshot('switch', '新建文章前自动归档');
    }
    const safeTitle = templateName.trim() || '未命名文章';
    // 同上：文件夹模式下先用主进程解析出唯一文件名作为 id
    const newId = storageService.resolveNewArticleId(safeTitle) || 'article-' + Date.now();
    const newArticle: ArticleItem = {
      id: newId,
      title: safeTitle,
      content: templateContent,
      createdAt: Date.now(),
      updatedAt: Date.now(),
      wordCount: templateContent.length,
    };
    storageService.saveArticle(newArticle);
    storageService.setCurrentArticleId(newId);
    setArticles((prev) => [newArticle, ...prev]);
    setCurrentArticleId(newId);
    setMarkdown(templateContent);
    setTitle(safeTitle);
    setIsArticleDrawerOpen(false);
    showToast(`已用模板「${safeTitle}」新建文章`);
  };

  const handleSelectArticle = (id: string) => {
    if (id === currentArticleId) return;
    if (markdown.trim()) {
      recordSnapshot('switch', '切换文章前自动快照');
    }
    const target = articles.find((a) => a.id === id);
    if (target) {
      storageService.setCurrentArticleId(id);
      setCurrentArticleId(id);
      setMarkdown(target.content);
      setTitle(target.title);
      showToast(`已载入文章「${target.title}」`);
    }
  };

  const handleDeleteArticle = (id: string) => {
    storageService.deleteArticle(id);
    const remaining = articles.filter((a) => a.id !== id);
    setArticles(remaining);
    if (id === currentArticleId) {
      if (remaining.length > 0) {
        handleSelectArticle(remaining[0].id);
      } else {
        handleCreateNewArticle('未命名文章', 'blank');
      }
    }
    showToast('文章已删除');
  };

  const handleDuplicateArticle = (article: ArticleItem) => {
    const duplicatedTitle = `${article.title} (副本)`;
    // 文件夹模式下 id 必须是唯一的文件名，否则副本会写到原文件上
    const newId =
      storageService.resolveNewArticleId(duplicatedTitle) || 'article-' + Date.now();
    const duplicated: ArticleItem = {
      ...article,
      id: newId,
      title: duplicatedTitle,
      createdAt: Date.now(),
      updatedAt: Date.now(),
    };
    storageService.saveArticle(duplicated);
    setArticles((prev) => [duplicated, ...prev]);
    showToast(`已创建副本「${duplicated.title}」`);
  };

  const handleRenameArticle = async (id: string, newTitle: string) => {
    if (storageService.isFolderMode()) {
      // 文件夹模式下重命名 = 重命名 .md 文件。必须把新文件名同步回 state，
      // 否则下一次自动保存会因为找不到原文件而新建一个，越改越多。
      const res = await storageService.renameArticle(id, newTitle);
      const nextId = res.ok && res.id ? res.id : id;
      setArticles((prev) =>
        prev.map((a) =>
          a.id === id ? { ...a, id: nextId, title: newTitle, updatedAt: Date.now() } : a
        )
      );
      if (currentArticleId === id) {
        setCurrentArticleId(nextId);
        storageService.setCurrentArticleId(nextId);
        setTitle(newTitle);
      }
      showToast(res.ok ? '文章标题已修改' : res.error || '重命名失败');
      return;
    }

    setArticles((prev) =>
      prev.map((a) => (a.id === id ? { ...a, title: newTitle, updatedAt: Date.now() } : a))
    );
    if (id === currentArticleId) {
      setTitle(newTitle);
    }
    const target = articles.find((a) => a.id === id);
    if (target) {
      storageService.saveArticle({ ...target, title: newTitle });
    }
    showToast('文章标题已修改');
  };

  const handleExportArticle = (article: ArticleItem) => {
    const blob = new Blob([article.content], { type: 'text/markdown;charset=utf-8' });
    const url = URL.createObjectURL(blob);
    const link = document.createElement('a');
    link.href = url;
    link.download = `${article.title || 'article'}.md`;
    link.click();
    URL.revokeObjectURL(url);
    showToast('已导出 Markdown 文件');
  };

  // History Snapshots Handlers
  const handleRestoreSnapshot = (snapshot: HistorySnapshot) => {
    // Archive current before rollback so nothing is ever lost
    recordSnapshot(
      'rollback',
      `恢复版本（${new Date(snapshot.timestamp).toLocaleTimeString()}）前备份`
    );
    setMarkdown(snapshot.content);
    if (snapshot.articleTitle) {
      setTitle(snapshot.articleTitle);
    }
    showToast(
      `已恢复至「${new Date(snapshot.timestamp).toLocaleTimeString([], {
        hour: '2-digit',
        minute: '2-digit',
      })}」历史快照！`
    );
  };

  const handleCreateManualSnapshot = (note?: string) => {
    recordSnapshot('manual', note || '手动备份快照');
    showToast('已保存当前版本快照');
  };

  const handleDeleteSnapshot = (id: string) => {
    storageService.deleteSnapshot(id);
    setSnapshots((prev) => prev.filter((s) => s.id !== id));
    showToast('快照已删除');
  };

  const handleClearSnapshots = (articleId?: string) => {
    storageService.clearSnapshots(articleId);
    if (articleId) {
      setSnapshots((prev) => prev.filter((s) => s.articleId !== articleId));
    } else {
      setSnapshots([]);
    }
    showToast('历史快照已清空');
  };

  // Open Markdown File from disk
  const handleOpen = async () => {
    try {
      const result = await electronBridge.openMarkdownFile();
      if (!result.canceled && result.content !== undefined) {
        const fileName = result.filePath
          ? result.filePath.split(/[/\\]/).pop()?.replace(/\.[^/.]+$/, '') || '本地导入文章'
          : '本地导入文章';
        handleCreateNewArticle(fileName, 'blank');
        setMarkdown(result.content);
        setTitle(fileName);
        showToast('已成功导入本地文件！');
      }
    } catch (e) {
      console.error('Failed to open file:', e);
    }
  };

  // Save Markdown File to disk
  const handleSave = async () => {
    try {
      const defaultName = `${title || 'article'}.md`;
      const result = await electronBridge.saveMarkdownFile(markdown, defaultName);
      if (!result.canceled) {
        showToast('Markdown 文章保存成功！');
      }
    } catch (e) {
      console.error('Failed to save file:', e);
    }
  };

  // Export HTML
  const handleExportHtml = async () => {
    try {
      const defaultName = `${title || 'wechat-article'}.html`;
      const result = await electronBridge.exportHtmlFile(compiledHtml, defaultName);
      if (!result.canceled) {
        showToast('公众号 HTML 文件导出成功！');
      }
    } catch (e) {
      console.error('Failed to export HTML:', e);
    }
  };

  // 导出 PDF
  const handleExportPdf = async () => {
    try {
      const defaultName = `${title || 'wechat-article'}.pdf`;
      const result = await electronBridge.exportPdfFile(compiledHtml, title, defaultName);
      if (result.error) {
        showToast(`PDF 导出失败：${result.error}`);
      } else if (!result.canceled) {
        showToast('PDF 导出成功！');
      }
    } catch (e) {
      console.error('Failed to export PDF:', e);
      showToast('PDF 导出失败，请重试');
    }
  };

  // 导出长图（用 html2canvas 截取预览区）
  const handleExportLongImage = async () => {
    try {
      const el = document.querySelector('.gzh-preview-container') as HTMLElement | null;
      if (!el) {
        showToast('未找到预览内容，请先切换到预览模式');
        return;
      }
      const { default: html2canvas } = await import('html2canvas');
      const canvas = await html2canvas(el, {
        backgroundColor: '#ffffff',
        scale: 2,
        useCORS: true,
      });
      const dataUrl = canvas.toDataURL('image/png');
      const a = document.createElement('a');
      a.download = `${title || 'wechat-article'}-长图.png`;
      a.href = dataUrl;
      a.click();
      showToast('长图导出成功！');
    } catch (e) {
      console.error('Failed to export long image:', e);
      showToast('长图导出失败，请重试');
    }
  };

  // ---- Electron 菜单动作处理 ----
  const menuActionRef = useRef<(action: string) => void>(() => {});

  menuActionRef.current = (action: string) => {
    switch (action) {
      case 'new-file':
        handleCreateNewArticle();
        break;
      case 'open-file':
        handleOpen();
        break;
      case 'save-file':
        handleSave();
        break;
      case 'copy-wechat':
        handleCopyWeChat();
        break;
      case 'export-html':
        handleExportHtml();
        break;
      case 'export-pdf':
        handleExportPdf();
        break;
      case 'export-longimage':
        handleExportLongImage();
        break;
      case 'open-ai':
        openAIPanel();
        break;
      case 'format-pangu':
        handlePanguFormat();
        break;
      case 'open-sticker':
        setIsStickerModalOpen(true);
        break;
      case 'open-background':
        setIsBackgroundModalOpen(true);
        break;
      case 'open-about':
        setIsAboutModalOpen(true);
        break;
      case 'view-default':
        setPreviewMode('default');
        break;
      case 'view-mobile':
        setPreviewMode('mobile');
        break;
      case 'view-tablet':
        setPreviewMode('tablet');
        break;
      case 'view-desktop':
        setPreviewMode('desktop');
        break;
      case 'layout-horizontal':
        setLayoutMode('horizontal');
        break;
      case 'layout-vertical':
        setLayoutMode('vertical');
        break;
      case 'layout-editor':
        setLayoutMode('editor');
        break;
      case 'layout-preview':
        setLayoutMode('preview');
        break;
      default:
        break;
    }
  };

  // 订阅 Electron 菜单动作（仅在桌面端生效）
  useEffect(() => {
    const api = window.electronAPI;
    if (!api?.onMenuAction) return;
    const unsubscribe = api.onMenuAction((action) => {
      menuActionRef.current(action);
    });
    return unsubscribe;
  }, []);

  // Custom Stickers Add/Delete/Reset
  const handleAddCustomStickers = (newStickers: StickerItem[]) => {
    const updated = [...stickers, ...newStickers];
    setStickers(updated);
    const customOnly = updated.filter((s) => s.id.startsWith('custom-'));
    storageService.saveCustomStickers(customOnly);
    showToast(`成功添加 ${newStickers.length} 个新表情素材！`);
  };

  const handleDeleteSticker = (id: string) => {
    const updated = stickers.filter((s) => s.id !== id);
    setStickers(updated);
    const customOnly = updated.filter((s) => s.id.startsWith('custom-'));
    storageService.saveCustomStickers(customOnly);
    showToast('已删除该表情素材');
  };

  const handleResetDefaultStickers = () => {
    setStickers(DEFAULT_STICKERS);
    storageService.saveCustomStickers([]);
    showToast('已重置恢复默认表情素材包');
  };

  // Images Import/Delete/Clean
  const handleImportImages = (newImages: ImageAttachment[]) => {
    const updated = [...images, ...newImages];
    setImages(updated);
    storageService.saveImageAttachments(updated);
    showToast(`成功导入 ${newImages.length} 张图片！`);
  };

  const handleDeleteImage = (id: string) => {
    const updated = images.filter((img) => img.id !== id);
    setImages(updated);
    storageService.saveImageAttachments(updated);
    showToast('图片已删除');
  };

  const handleCleanUnreferencedImages = () => {
    const cleanedImages = images.filter((img) => markdown.includes(img.url));
    setImages(cleanedImages);
    storageService.saveImageAttachments(cleanedImages);
    showToast('已一键清理所有未引用的多余图片');
  };

  // Paste image directly into Markdown editor
  // ---- 图床：启用状态 + 上传封装 ----
  const [imageHostEnabled, setImageHostEnabled] = useState(false);

  const refreshImageHostState = () => {
    imageHostService
      .getConfig()
      .then((s) => setImageHostEnabled(s.config.type !== 'none'))
      .catch(() => setImageHostEnabled(false));
  };

  useEffect(() => {
    refreshImageHostState();
  }, []);

  /** 启用图床时上传并返回 https 外链，否则回退本地 base64 */
  const uploadImageIfEnabled = async (dataUrl: string, fileName: string): Promise<string> => {
    if (!imageHostEnabled) return dataUrl;
    try {
      const res = await imageHostService.upload(dataUrl, fileName);
      if (res.ok && res.url) return res.url;
      console.warn('图床上传失败，回退本地图片:', res.error);
    } catch (e) {
      console.warn('图床上传异常，回退本地图片:', e);
    }
    return dataUrl;
  };

  const handleImagePasted = (image: ImageAttachment) => {
    handleImportImages([image]);
    showToast(`图片「${image.name}」已就绪并保存到图片库！`);
  };

  // Presets Save/Apply/Delete
  const handleSaveCurrentAsPreset = (name: string, authorSignature?: string) => {
    const newPreset: LocalPreset = {
      id: 'preset-' + Date.now(),
      name,
      updatedAt: Date.now(),
      theme: activeTheme,
      background,
      authorSignature,
    };
    storageService.savePreset(newPreset);
    setPresets(storageService.getSavedPresets());
    showToast(`排版预设「${name}」保存成功！`);
  };

  const handleApplyPreset = (preset: LocalPreset) => {
    setActiveTheme(preset.theme);
    setBackground(preset.background);
    if (preset.authorSignature) {
      setMarkdown((prev) => prev + '\n\n' + preset.authorSignature);
    }
    showToast(`已成功应用预设「${preset.name}」！`);
  };

  const handleDeletePreset = (id: string) => {
    storageService.deletePreset(id);
    setPresets(storageService.getSavedPresets());
    showToast('排版预设已删除');
  };

  // Safe Drawers/Modals Toggle & Switchers (supports free switching)
  const closeAllDrawers = () => {
    setIsArticleDrawerOpen(false);
    setIsHistoryModalOpen(false);
    setIsThemeDesignerOpen(false);
    setIsThemeManagerOpen(false);
    setIsComponentDrawerOpen(false);
    setIsBackgroundModalOpen(false);
    setIsStickerModalOpen(false);
    setIsImageModalOpen(false);
    setIsPresetModalOpen(false);
    setIsAboutModalOpen(false);
    setIsPreflightModalOpen(false);
    setIsCoverModalOpen(false);
    setIsBackupModalOpen(false);
    setIsImageHostModalOpen(false);
    setIsStorageModeModalOpen(false);
    // 之前漏了这一项，导致 AI 面板(z-50)会叠在其它抽屉之上遮挡操作
    setIsAIPanelOpen(false);
  };

  const toggleComponentDrawer = () => {
    if (isComponentDrawerOpen) {
      setIsComponentDrawerOpen(false);
    } else {
      closeAllDrawers();
      setIsComponentDrawerOpen(true);
    }
  };

  /**
   * 从设计器回到主题列表。
   *
   * 必须「先关设计器再开列表」：设计器 z-[95] 高于主题管理的 z-[80]，
   * 不关掉的话列表会被压在设计器底下，看起来像没打开。
   */
  const handleSwitchToThemeLibrary = () => {
    setIsThemeDesignerOpen(false);
    setIsThemeManagerOpen(true);
  };

  /**
   * 设计器「另存为自定义主题」。
   *
   * 为什么要显式另存：设计器是**实时改当前生效主题**的，当用户在内置主题上
   * 调参时，改动只挂在 activeTheme 上（切走主题即丢失）。固化成一个自定义主题
   * 才能长期保留，也符合「内置主题不可编辑、要改先复制」的既有约定。
   */
  const handleSaveThemeAsCustom = (next: ThemeConfig) => {
    storageService.saveCustomTheme(next);
    setActiveTheme(next);
    showToast(`已保存为自定义主题「${next.name}」`);
  };

  const toggleThemeManager = () => {
    if (isThemeManagerOpen) {
      setIsThemeManagerOpen(false);
    } else {
      closeAllDrawers();
      setIsThemeManagerOpen(true);
    }
  };

  const toggleArticleDrawer = () => {
    if (isArticleDrawerOpen) {
      setIsArticleDrawerOpen(false);
    } else {
      closeAllDrawers();
      setIsArticleDrawerOpen(true);
    }
  };

  const toggleHistoryModal = () => {
    if (isHistoryModalOpen) {
      setIsHistoryModalOpen(false);
    } else {
      closeAllDrawers();
      setIsHistoryModalOpen(true);
    }
  };

  const toggleBackgroundModal = () => {
    if (isBackgroundModalOpen) {
      setIsBackgroundModalOpen(false);
    } else {
      closeAllDrawers();
      setIsBackgroundModalOpen(true);
    }
  };

  const toggleStickerModal = () => {
    if (isStickerModalOpen) {
      setIsStickerModalOpen(false);
    } else {
      closeAllDrawers();
      setIsStickerModalOpen(true);
    }
  };

  const toggleImageModal = () => {
    if (isImageModalOpen) {
      setIsImageModalOpen(false);
    } else {
      closeAllDrawers();
      setIsImageModalOpen(true);
    }
  };

  const togglePresetModal = () => {
    if (isPresetModalOpen) {
      setIsPresetModalOpen(false);
    } else {
      closeAllDrawers();
      setIsPresetModalOpen(true);
    }
  };

  const toggleStorageModeModal = () => {
    if (isStorageModeModalOpen) {
      setIsStorageModeModalOpen(false);
    } else {
      closeAllDrawers();
      setIsStorageModeModalOpen(true);
    }
  };

  const toggleImageHostModal = () => {
    if (isImageHostModalOpen) {
      setIsImageHostModalOpen(false);
    } else {
      closeAllDrawers();
      setIsImageHostModalOpen(true);
    }
  };

  const toggleAboutModal = () => {
    if (isAboutModalOpen) {
      setIsAboutModalOpen(false);
    } else {
      closeAllDrawers();
      setAboutInitialTab('syntax');
      setIsAboutModalOpen(true);
    }
  };

  /**
   * 插入公众号推广位。
   *
   * 没配过就直接跳到配置页 —— 与其插一段空模板让用户自己填，不如顺手把配置做完，
   * 之后每次插入都是同一份内容（改一次配置，历史与未来的插入都跟着更新）。
   */
  const handleInsertPromo = () => {
    const cfg = promoService.getPromoConfig();
    if (!promoService.isPromoReady(cfg)) {
      setAboutInitialTab('promo');
      setIsAboutModalOpen(true);
      showToast('先填写公众号名称或上传二维码');
      return;
    }
    handleInsertSnippet(`\n${promoService.buildPromoMarkdown(cfg)}\n`);
    showToast('已在光标处插入推广位');
  };

  const togglePreflightModal = () => {
    if (isPreflightModalOpen) {
      setIsPreflightModalOpen(false);
    } else {
      closeAllDrawers();
      setIsPreflightModalOpen(true);
    }
  };

  const toggleCoverModal = () => {
    if (isCoverModalOpen) {
      setIsCoverModalOpen(false);
    } else {
      closeAllDrawers();
      setIsCoverModalOpen(true);
    }
  };

  const toggleBackupModal = () => {
    if (isBackupModalOpen) {
      setIsBackupModalOpen(false);
    } else {
      closeAllDrawers();
      setIsBackupModalOpen(true);
    }
  };

  // 编辑器面板 / 预览面板（按布局模式复用，避免重复 JSX）
  const editorPane = (
    <div className={`w-full h-full flex flex-col overflow-hidden ${editorDarkMode ? 'bg-[#0F172A]' : 'bg-white'}`}>
      {/* Quick Syntax Insertion Toolbar */}
      <EditorToolbar
        onInsertMarkdown={handleInsertMarkdown}
        onOpenStickerModal={() => setIsStickerModalOpen(true)}
        onOpenComponentDrawer={() => setIsComponentDrawerOpen(true)}
        onPanguFormat={handlePanguFormat}
        onInsertPromo={handleInsertPromo}
        showLineNumbers={showLineNumbers}
        onToggleLineNumbers={() => setShowLineNumbers((v) => !v)}
        onOpenAIPanel={openAIPanel}
        dark={editorDarkMode}
        onToggleDark={() => setEditorDarkMode((v) => !v)}
      />
      {/* Editor Body */}
      <MarkdownEditor
        content={markdown}
        onChange={setMarkdown}
        onScrollSync={handleScrollSync}
        onImagePasted={handleImagePasted}
        textareaRef={textareaRef}
        activeThemeName={activeTheme.name}
        showLineNumbers={showLineNumbers}
        dark={editorDarkMode}
        onUploadImage={uploadImageIfEnabled}
      />
    </div>
  );

  const previewPane = (
    <div className="w-full h-full flex flex-col bg-[#F1F5F9] overflow-hidden">
      <PreviewPanel
        ref={previewRef}
        html={compiledHtml}
        markdown={markdown}
        previewMode={previewMode}
        onPreviewModeChange={setPreviewMode}
        activeTheme={activeTheme}
        background={background}
        articleTitle={title}
        onCopyWeChat={handleCopyWeChat}
        copied={copied}
        convertLinksToFootnotes={convertLinksToFootnotes}
        onToggleFootnotes={handleToggleFootnotes}
        blockErrors={blockErrors}
      />
    </div>
  );

  return (
    <div className="flex flex-col h-screen w-screen bg-[#F8FAFC] text-[#2C3E50] overflow-hidden select-none font-sans">
      {/* Top Application Navigation Bar */}
      <TopNavBar
        title={title}
        onTitleChange={setTitle}
        activeTheme={activeTheme}
        articleCount={articles.length}
        onOpenArticles={toggleArticleDrawer}
        onOpenHistory={toggleHistoryModal}
        onNew={() => handleCreateNewArticle('未命名文章', 'blank')}
        onOpen={handleOpen}
        onSave={handleSave}
        onOpenThemes={toggleThemeManager}
        onOpenComponents={toggleComponentDrawer}
        onOpenBackground={toggleBackgroundModal}
        onOpenStickers={toggleStickerModal}
        onOpenImages={toggleImageModal}
        onOpenPresets={togglePresetModal}
        onOpenAbout={toggleAboutModal}
        onOpenPreflight={togglePreflightModal}
        onOpenCoverGenerator={toggleCoverModal}
        onOpenBackup={toggleBackupModal}
        onCopyWeChat={handleCopyWeChat}
        onExportHtml={handleExportHtml}
        copied={copied}
        layoutMode={layoutMode}
        onLayoutChange={setLayoutMode}
      />

      {/* Main Workspace Area */}
      <div ref={workspaceRef} className="flex-1 flex overflow-hidden relative">
        {/* Leftmost Tool Rail (Aside) with z-50 for instant switching & active indicators */}
        <aside
          className={`${
            railCollapsed
              ? 'w-0 overflow-hidden border-r-0'
              : 'w-10 sm:w-12 md:w-14 border-r border-[#E5E7EB]'
          } bg-white flex flex-col items-center py-2 md:py-4 justify-between shrink-0 select-none z-50 relative transition-all duration-200`}
        >
          <div className="flex flex-col items-center gap-1.5 md:gap-2.5">
            {/* Active Editor Mode */}
            <div
              className="p-1.5 md:p-2.5 bg-[#F0FAF5] text-[#07C160] rounded-lg md:rounded-xl shadow-2xs cursor-default"
              title="Markdown 编辑器"
            >
              <FileEdit className="w-4 h-4 sm:w-5 sm:h-5" />
            </div>

            {/* Local Articles Manager (WeMD Feature) */}
            <button
              onClick={toggleArticleDrawer}
              className={`p-1.5 md:p-2.5 rounded-lg md:rounded-xl cursor-pointer transition-all relative ${
                isArticleDrawerOpen
                  ? 'bg-[#F0FAF5] text-[#07C160] shadow-2xs'
                  : 'text-[#94A3B8] hover:text-[#07C160] hover:bg-[#F0FAF5]'
              }`}
              title="本地文章库 (管理与切换文章)"
            >
              <BookOpen className="w-4 h-4 sm:w-5 sm:h-5" />
              {articles.length > 1 && (
                <span className="absolute top-1 right-1 w-2 h-2 rounded-full bg-[#07C160]" />
              )}
            </button>

            {/* History Snapshots (WeMD Feature) */}
            <button
              onClick={toggleHistoryModal}
              className={`p-1.5 md:p-2.5 rounded-lg md:rounded-xl cursor-pointer transition-all ${
                isHistoryModalOpen
                  ? 'bg-[#F0FAF5] text-[#07C160] shadow-2xs'
                  : 'text-[#94A3B8] hover:text-[#07C160] hover:bg-[#F0FAF5]'
              }`}
              title="版本时光机 · 历史快照与一键回滚"
            >
              <History className="w-4 h-4 sm:w-5 sm:h-5" />
            </button>

            {/* Divider */}
            <div className="w-6 md:w-8 h-px bg-[#E5E7EB] my-0.5" />

            {/* Components Drawer (with active indicator & toggle) */}
            <button
              onClick={toggleComponentDrawer}
              className={`p-1.5 md:p-2.5 rounded-lg md:rounded-xl cursor-pointer transition-all ${
                isComponentDrawerOpen
                  ? 'bg-indigo-50 text-indigo-600 shadow-2xs ring-1 ring-indigo-200'
                  : 'text-[#94A3B8] hover:text-indigo-600 hover:bg-indigo-50'
              }`}
              title="排版组件库 (支持自定义组件与模板)"
            >
              <LayoutGrid className="w-4 h-4 sm:w-5 sm:h-5" />
            </button>

            {/* 主题入口：默认落到「主题列表」（选择 / 搜索 / 导入导出），
                设计器从列表里的「样式参数」进入 —— 与用户此前的使用习惯一致 */}
            <button
              onClick={toggleThemeManager}
              className={`p-1.5 md:p-2.5 rounded-lg md:rounded-xl cursor-pointer transition-all ${
                isThemeManagerOpen
                  ? 'bg-[#F0FAF5] text-[#07C160] shadow-2xs ring-1 ring-[#07C160]/30'
                  : 'text-[#94A3B8] hover:text-[#07C160] hover:bg-[#F0FAF5]'
              }`}
              title="文章主题：选择 / 搜索 / 创建 / 导入导出"
            >
              <Palette className="w-4 h-4 sm:w-5 sm:h-5" />
            </button>

            {/* Stickers Modal */}
            <button
              onClick={toggleStickerModal}
              className={`p-1.5 md:p-2.5 rounded-lg md:rounded-xl cursor-pointer transition-all ${
                isStickerModalOpen
                  ? 'bg-pink-50 text-pink-600 shadow-2xs ring-1 ring-pink-200'
                  : 'text-[#94A3B8] hover:text-[#07C160] hover:bg-[#F0FAF5]'
              }`}
              title="表情包素材库"
            >
              <Smile className="w-4 h-4 sm:w-5 sm:h-5" />
            </button>

            {/* Background Modal */}
            <button
              onClick={toggleBackgroundModal}
              className={`p-1.5 md:p-2.5 rounded-lg md:rounded-xl cursor-pointer transition-all ${
                isBackgroundModalOpen
                  ? 'bg-amber-50 text-amber-600 shadow-2xs ring-1 ring-amber-200'
                  : 'text-[#94A3B8] hover:text-[#07C160] hover:bg-[#F0FAF5]'
              }`}
              title="文章底纹背景设置"
            >
              <Layers className="w-4 h-4 sm:w-5 sm:h-5" />
            </button>

            {/* Images Modal */}
            <button
              onClick={toggleImageModal}
              className={`p-1.5 md:p-2.5 rounded-lg md:rounded-xl cursor-pointer transition-all ${
                isImageModalOpen
                  ? 'bg-blue-50 text-blue-600 shadow-2xs ring-1 ring-blue-200'
                  : 'text-[#94A3B8] hover:text-[#07C160] hover:bg-[#F0FAF5]'
              }`}
              title="文章图片管理"
            >
              <ImageIcon className="w-4 h-4 sm:w-5 sm:h-5" />
            </button>

            {/* Image Host (图床) Modal */}
            <button
              onClick={toggleImageHostModal}
              className={`p-1.5 md:p-2.5 rounded-lg md:rounded-xl cursor-pointer transition-all ${
                isImageHostModalOpen
                  ? 'bg-sky-50 text-sky-600 shadow-2xs ring-1 ring-sky-200'
                  : 'text-[#94A3B8] hover:text-[#07C160] hover:bg-[#F0FAF5]'
              }`}
              title="图床设置（图片自动上传为 https 外链）"
            >
              <Cloud className="w-4 h-4 sm:w-5 sm:h-5" />
            </button>

            {/* Storage Mode (存储模式) */}
            <button
              onClick={toggleStorageModeModal}
              className={`p-1.5 md:p-2.5 rounded-lg md:rounded-xl cursor-pointer transition-all ${
                isStorageModeModalOpen
                  ? 'bg-sky-50 text-sky-600 shadow-2xs ring-1 ring-sky-200'
                  : 'text-[#94A3B8] hover:text-[#07C160] hover:bg-[#F0FAF5]'
              }`}
              title="存储模式（内置存储 / 本地文件夹）"
            >
              <HardDrive className="w-4 h-4 sm:w-5 sm:h-5" />
            </button>

            {/* Presets Modal */}
            <button
              onClick={togglePresetModal}
              className={`p-1.5 md:p-2.5 rounded-lg md:rounded-xl cursor-pointer transition-all ${
                isPresetModalOpen
                  ? 'bg-blue-50 text-blue-600 shadow-2xs ring-1 ring-blue-200'
                  : 'text-[#94A3B8] hover:text-[#07C160] hover:bg-[#F0FAF5]'
              }`}
              title="保存与加载排版预设"
            >
              <Bookmark className="w-4 h-4 sm:w-5 sm:h-5" />
            </button>
          </div>

          {/* Bottom Settings/About Button */}
          <button
            onClick={toggleAboutModal}
            className={`p-1.5 md:p-2.5 rounded-lg md:rounded-xl cursor-pointer transition-all ${
              isAboutModalOpen
                ? 'bg-[#F0FAF5] text-[#07C160] shadow-2xs'
                : 'text-[#94A3B8] hover:text-[#07C160] hover:bg-[#F0FAF5]'
            }`}
            title="关于与使用说明"
          >
            <HelpCircle className="w-4 h-4 sm:w-5 sm:h-5" />
          </button>

          {/* 收起侧边工具栏（释放编辑区横向空间） */}
          <button
            onClick={() => setRailCollapsed(true)}
            className="p-1.5 md:p-2 rounded-lg md:rounded-xl cursor-pointer text-[#94A3B8] hover:text-[#07C160] hover:bg-[#F0FAF5] transition-colors"
            title="收起侧边工具栏（释放编辑区宽度）"
          >
            <ChevronsLeft className="w-4 h-4" />
          </button>
        </aside>

        {/* 侧边栏收起后：贴左边缘的悬浮展开按钮 */}
        {railCollapsed && (
          <button
            onClick={() => setRailCollapsed(false)}
            className="absolute left-2 top-1/2 -translate-y-1/2 z-40 p-2 rounded-lg bg-white border border-[#E5E7EB] shadow-sm text-[#94A3B8] hover:text-[#07C160] hover:border-[#07C160] transition-colors"
            title="展开侧边工具栏"
          >
            <ChevronsRight className="w-4 h-4" />
          </button>
        )}

        {/* Center/Right Split Area — 左右分栏 / 上下分栏 / 专注编辑 / 专注预览 四种布局 */}
        {layoutMode === 'editor' ? (
          /* 专注编辑：只显示编辑器 */
          <div className="flex-1 flex flex-col overflow-hidden relative">{editorPane}</div>
        ) : layoutMode === 'preview' ? (
          /* 专注预览：只显示预览 */
          <div className="flex-1 flex flex-col overflow-hidden relative">{previewPane}</div>
        ) : layoutMode === 'vertical' ? (
          /* 上下分栏：编辑在上，预览在下（窄屏友好） */
          <div className="flex-1 flex flex-col overflow-hidden relative">
            <div
              style={{ height: `${splitRatio}%` }}
              className="overflow-hidden flex flex-col border-b border-[#E5E7EB]"
            >
              {editorPane}
            </div>
            <div
              onMouseDown={(e) => {
                e.preventDefault();
                setIsDraggingSplit(true);
              }}
              onDoubleClick={() => setSplitRatio(50)}
              className="h-1.5 shrink-0 cursor-row-resize bg-[#E5E7EB] hover:bg-[#07C160] active:bg-[#07C160] transition-colors"
              title="拖拽调整高度比例（双击重置为 50%）"
            />
            <div
              style={{ height: `${100 - splitRatio}%` }}
              className="overflow-hidden flex flex-col"
            >
              {previewPane}
            </div>
          </div>
        ) : (
          /* 左右分栏（默认）：编辑在左，预览在右，可拖拽分割条 */
          <div className="flex-1 flex flex-row overflow-hidden relative">
            <div
              style={{ width: `${splitRatio}%` }}
              className="overflow-hidden flex flex-col border-r border-[#E5E7EB]"
            >
              {editorPane}
            </div>
            <div
              onMouseDown={(e) => {
                e.preventDefault();
                setIsDraggingSplit(true);
              }}
              onDoubleClick={() => setSplitRatio(50)}
              className="w-1.5 shrink-0 cursor-col-resize bg-[#E5E7EB] hover:bg-[#07C160] active:bg-[#07C160] transition-colors"
              title="拖拽调整宽度比例（双击重置为 50%）"
            />
            <div
              style={{ width: `${100 - splitRatio}%` }}
              className="overflow-hidden flex flex-col"
            >
              {previewPane}
            </div>
          </div>
        )}
      </div>

      {/* Floating Toast Notification */}
      {toastMessage && (
        <div className="fixed top-16 left-1/2 -translate-x-1/2 z-50 bg-slate-900/90 backdrop-blur-sm text-white text-xs px-4 py-2.5 rounded-xl shadow-xl flex items-center space-x-2 border border-slate-700/60 animate-in fade-in slide-in-from-top-2 duration-200">
          <span className="w-2 h-2 rounded-full bg-emerald-400 animate-pulse" />
          <span>{toastMessage}</span>
        </div>
      )}

      {/* Local Article Manager Drawer (WeMD) */}
      <ArticleManagerDrawer
        isOpen={isArticleDrawerOpen}
        onClose={() => setIsArticleDrawerOpen(false)}
        articles={articles}
        currentArticleId={currentArticleId}
        onSelectArticle={handleSelectArticle}
        onCreateNewArticle={handleCreateNewArticle}
        onCreateFromTemplate={handleCreateFromTemplate}
        onDeleteArticle={handleDeleteArticle}
        onDuplicateArticle={handleDuplicateArticle}
        onRenameArticle={handleRenameArticle}
        onExportArticle={handleExportArticle}
      />

      {/* History Snapshots Modal (WeMD) */}
      <HistoryModal
        isOpen={isHistoryModalOpen}
        onClose={() => setIsHistoryModalOpen(false)}
        snapshots={snapshots}
        currentArticleId={currentArticleId}
        currentArticleTitle={title}
        onRestoreSnapshot={handleRestoreSnapshot}
        onCreateManualSnapshot={handleCreateManualSnapshot}
        onDeleteSnapshot={handleDeleteSnapshot}
        onClearSnapshots={handleClearSnapshots}
      />

      {/* Side Drawers */}
      {/* 主题管理（列表 / 实时预览 / CSS 编辑）——主入口 */}
      <ThemeManagerModal
        isOpen={isThemeManagerOpen}
        onClose={() => setIsThemeManagerOpen(false)}
        currentTheme={activeTheme}
        background={background}
        markdown={markdown}
        onApply={setActiveTheme}
        onOpenAdvancedSettings={() => {
          // 进设计器时收起主题列表：两者不再层叠，关闭设计器后也不会「露出」一个列表，
          // 层级关系变成单向的（列表 → 设计器，设计器顶部有「主题库」按钮可返回）
          setIsThemeManagerOpen(false);
          setIsThemeDesignerOpen(true);
        }}
      />

      {/* 主题设计器：可视化调节全部视觉令牌（配色 / 字体 / 段落 / 元素 / 代码 / 容器） */}
      <ThemeDesignerModal
        isOpen={isThemeDesignerOpen}
        onClose={() => setIsThemeDesignerOpen(false)}
        theme={activeTheme}
        background={background}
        markdown={markdown}
        onUpdate={(patch) => setActiveTheme((prev) => ({ ...prev, ...patch }))}
        onSaveAsCustom={handleSaveThemeAsCustom}
        onOpenThemeLibrary={handleSwitchToThemeLibrary}
      />

      <ComponentDrawer
        isOpen={isComponentDrawerOpen}
        onClose={() => setIsComponentDrawerOpen(false)}
        onInsertSnippet={handleInsertSnippet}
        onToast={showToast}
      />

      {/* Modals */}
      <BackgroundModal
        isOpen={isBackgroundModalOpen}
        onClose={() => setIsBackgroundModalOpen(false)}
        background={background}
        onChange={setBackground}
      />

      <StickerModal
        isOpen={isStickerModalOpen}
        onClose={() => setIsStickerModalOpen(false)}
        stickers={stickers}
        onInsertSticker={handleInsertSticker}
        onAddCustomStickers={handleAddCustomStickers}
        onDeleteSticker={handleDeleteSticker}
        onResetDefaultStickers={handleResetDefaultStickers}
      />

      <ImageManagerModal
        isOpen={isImageModalOpen}
        onClose={() => setIsImageModalOpen(false)}
        images={images}
        markdown={markdown}
        onImportImages={handleImportImages}
        onDeleteImage={handleDeleteImage}
        onCleanUnreferencedImages={handleCleanUnreferencedImages}
        onInsertImageSyntax={async (img) => {
          const target = textareaRef.current;
          // 本地 base64 图片：若启用图床则先上传为 https 外链
          let imageUrl = img.url;
          if (imageUrl.startsWith('data:')) {
            imageUrl = await uploadImageIfEnabled(imageUrl, img.name);
          }
          const insertText = `\n![${img.name}](${imageUrl})\n`;
          if (!target) {
            setMarkdown((prev) => prev + insertText);
            showToast(`已插入图片「${img.name}」`);
            return;
          }
          const start = target.selectionStart;
          const end = target.selectionEnd;
          const scrollTop = target.scrollTop;
          const newVal = target.value.substring(0, start) + insertText + target.value.substring(end);
          setMarkdown(newVal);
          setTimeout(() => {
            target.focus();
            target.selectionStart = target.selectionEnd = start + insertText.length;
            target.scrollTop = scrollTop;
          }, 0);
          showToast(`已插入图片「${img.name}」`);
        }}
      />

      <PresetModal
        isOpen={isPresetModalOpen}
        onClose={() => setIsPresetModalOpen(false)}
        presets={presets}
        currentTheme={activeTheme}
        currentBackground={background}
        onSaveCurrentAsPreset={handleSaveCurrentAsPreset}
        onApplyPreset={handleApplyPreset}
        onDeletePreset={handleDeletePreset}
      />

      <AboutModal
        isOpen={isAboutModalOpen}
        onClose={() => setIsAboutModalOpen(false)}
        theme={activeTheme}
        background={background}
        initialTab={aboutInitialTab}
      />

      {/* 发布前排版体检 */}
      <PreflightModal
        isOpen={isPreflightModalOpen}
        onClose={() => setIsPreflightModalOpen(false)}
        markdown={markdown}
        articleTitle={title}
        onCopyWeChat={handleCopyWeChat}
        onFormatPangu={handlePanguFormat}
        copied={copied}
      />

      {/* 公众号标准尺寸封面生成器 */}
      <CoverGeneratorModal
        isOpen={isCoverModalOpen}
        onClose={() => setIsCoverModalOpen(false)}
        articleTitle={title}
        activeTheme={activeTheme}
        onInsertCoverToArticle={handleInsertCoverToArticle}
      />

      {/* 数据备份与恢复 */}
      <BackupModal
        isOpen={isBackupModalOpen}
        onClose={() => setIsBackupModalOpen(false)}
        onDataRestored={handleDataRestored}
      />

      {/* AI 排版助手 */}
      <AIPanel
        open={isAIPanelOpen}
        onClose={() => setIsAIPanelOpen(false)}
        markdown={markdown}
        selectedText={aiSelectedText}
        onApply={handleApplyAI}
      />

      {/* 图床设置（关闭后刷新启用状态） */}
      <ImageHostModal
        isOpen={isImageHostModalOpen}
        onClose={() => {
          setIsImageHostModalOpen(false);
          refreshImageHostState();
        }}
      />

      {/* 存储模式（内置存储 / 本地文件夹） */}
      <StorageModeModal
        isOpen={isStorageModeModalOpen}
        onClose={() => setIsStorageModeModalOpen(false)}
        articles={articles}
      />
    </div>
  );
}
