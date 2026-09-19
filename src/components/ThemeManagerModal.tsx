import React from 'react';
import {
  X,
  Plus,
  Upload,
  Copy,
  Check,
  Trash2,
  Palette,
  Settings2,
  Info,
  Download,
  Share2,
  ClipboardPaste,
  Search,
} from 'lucide-react';
import { ThemeConfig, BackgroundSettings, ThemeCategory } from '../types';
import { DEFAULT_THEMES, THEME_CATEGORIES } from '../data/defaultData';
import { SAMPLE_MARKDOWN } from '../data/sampleMarkdown';
import { compileWeChatMarkdown } from '../services/gzhCompiler';
import { storageService } from '../services/storageService';
import { encodeThemeShare, decodeThemeShare, downloadThemeJson } from '../utils/themeShare';
import { CssEditor } from './CssEditor';
import { useEscapeKey } from '../hooks/useEscapeKey';

interface ThemeManagerModalProps {
  isOpen: boolean;
  onClose: () => void;
  currentTheme: ThemeConfig;
  background: BackgroundSettings;
  markdown: string;
  onApply: (theme: ThemeConfig) => void;
  /** 打开参数化精调面板（颜色/字号/标题样式等） */
  onOpenAdvancedSettings?: () => void;
}

/**
 * 文章主题管理
 *
 * 对齐 WeMD 的交互模型：主题 = 「参数 + 一段 CSS」。
 * 与 WeMD 的差异：WeMD 的主题是纯 CSS 作用于 class；我们保留了参数化内核
 * （block 渲染器生成的内联样式是精心调过微信兼容性的），CSS 作为**叠加微调**，
 * 这样即使自定义 CSS 里用了微信不支持的属性，基础版式依然完好。
 *
 * 内置主题标记 builtin，不可直接编辑（改动会在升级时被覆盖），需先「复制」。
 */
export const ThemeManagerModal: React.FC<ThemeManagerModalProps> = ({
  isOpen,
  onClose,
  currentTheme,
  background,
  markdown,
  onApply,
  onOpenAdvancedSettings,
}) => {
  const [draft, setDraft] = React.useState<ThemeConfig>(currentTheme);
  const [customThemes, setCustomThemes] = React.useState<ThemeConfig[]>([]);
  const [previewSource, setPreviewSource] = React.useState<'article' | 'sample'>('sample');
  const [copied, setCopied] = React.useState(false);
  const [query, setQuery] = React.useState('');
  const [category, setCategory] = React.useState<ThemeCategory | 'all'>('all');

  // 分享码：输入区展开状态与反馈。⚠️ 所有 hook 都必须在 `if (!isOpen) return null` 之前，
  // 否则弹窗开合时 hook 数量变化，React 会直接抛错崩溃（历史上踩过）。
  const [shareOpen, setShareOpen] = React.useState(false);
  const [shareInput, setShareInput] = React.useState('');
  const [shareMsg, setShareMsg] = React.useState<{ text: string; ok: boolean } | null>(null);

  // Esc 关闭（hook 必须在条件早退之前）
  useEscapeKey(isOpen, onClose);

  React.useEffect(() => {
    if (!isOpen) return;
    setDraft(currentTheme);
    setCustomThemes(storageService.getCustomThemes());
    setCopied(false);
    setShareOpen(false);
    setShareInput('');
    setShareMsg(null);
    setQuery('');
    setCategory('all');
  }, [isOpen, currentTheme]);

  // 筛选：内置主题按分类 + 关键词，自定义主题只按关键词（它们没有分类）
  const filteredBuiltins = React.useMemo(() => {
    const kw = query.trim().toLowerCase();
    return DEFAULT_THEMES.map((t) => ({ ...t, builtin: true as const })).filter((t) => {
      if (category !== 'all' && t.category !== category) return false;
      if (!kw) return true;
      return [t.name, t.englishName, t.description].some((s) => (s ?? '').toLowerCase().includes(kw));
    });
  }, [query, category]);

  const filteredCustoms = React.useMemo(() => {
    const kw = query.trim().toLowerCase();
    if (!kw) return customThemes;
    return customThemes.filter((t) =>
      [t.name, t.englishName, t.description].some((s) => (s ?? '').toLowerCase().includes(kw))
    );
  }, [customThemes, query]);

  /** 各分类的主题数量，用于在筛选条上直接显示「有多少套」 */
  const categoryCounts = React.useMemo(() => {
    const map: Record<string, number> = {};
    for (const t of DEFAULT_THEMES) {
      const key = t.category ?? 'minimal';
      map[key] = (map[key] ?? 0) + 1;
    }
    return map;
  }, []);

  // 预览防抖：CSS 逐字符输入时不要每次按键都重编译整篇文章
  const [previewTheme, setPreviewTheme] = React.useState(draft);
  React.useEffect(() => {
    const timer = setTimeout(() => setPreviewTheme(draft), 220);
    return () => clearTimeout(timer);
  }, [draft]);

  const previewHtml = React.useMemo(() => {
    if (!isOpen) return '';
    try {
      const md = previewSource === 'article' ? markdown : SAMPLE_MARKDOWN;
      return compileWeChatMarkdown(md, previewTheme, background, {
        convertLinksToFootnotes: false,
      });
    } catch {
      return '<p style="color:#94A3B8;font-size:13px;">预览编译失败</p>';
    }
  }, [isOpen, previewSource, markdown, previewTheme, background]);

  if (!isOpen) return null;

  const isBuiltin = !!draft.builtin;
  const allThemes = [...DEFAULT_THEMES.map((t) => ({ ...t, builtin: true })), ...customThemes];

  /** 把当前草稿「固化」成一个可编辑的自定义主题（复制 / 新建都走这里） */
  const materializeCustom = (name: string): ThemeConfig => {
    const next: ThemeConfig = {
      ...draft,
      id: `custom-${Date.now()}`,
      name,
      builtin: false,
    };
    storageService.saveCustomTheme(next);
    setCustomThemes(storageService.getCustomThemes());
    return next;
  };

  const handleDuplicate = () => {
    const original = draft.name.replace(/\s*副本(\s*\d+)?$/, '');
    setDraft(materializeCustom(`${original} 副本`));
  };

  const handleCreateNew = () => {
    setDraft(materializeCustom('未命名主题'));
  };

  const handleDeleteCustom = (id: string, name: string) => {
    if (!window.confirm(`确定删除自定义主题「${name}」？`)) return;
    storageService.deleteCustomTheme(id);
    setCustomThemes(storageService.getCustomThemes());
    // 删掉的正是当前编辑中的主题 → 退回当前生效主题，避免悬空
    if (draft.id === id) setDraft(currentTheme);
  };

  /** 导入主题：读取 JSON 主题文件 */
  const handleImport = () => {
    const input = document.createElement('input');
    input.type = 'file';
    input.accept = '.json,application/json';
    input.onchange = () => {
      const file = input.files?.[0];
      if (!file) return;
      const reader = new FileReader();
      reader.onload = () => {
        try {
          const parsed = JSON.parse(String(reader.result));
          const list = Array.isArray(parsed) ? parsed : [parsed];
          let imported = 0;
          for (const item of list) {
            if (!item || typeof item !== 'object' || typeof item.name !== 'string') continue;
            storageService.saveCustomTheme({ ...(item as ThemeConfig), builtin: false });
            imported += 1;
          }
          setCustomThemes(storageService.getCustomThemes());
          if (imported === 0) window.alert('文件里没有可识别的主题');
        } catch {
          window.alert('主题文件解析失败，请确认是导出的 JSON 主题文件');
        }
      };
      reader.onerror = () => window.alert('读取文件失败');
      reader.readAsText(file);
    };
    input.click();
  };

  const handleApply = () => {
    if (!draft.builtin) storageService.saveCustomTheme(draft);
    onApply(draft);
    onClose();
  };

  const handleCopyCss = async () => {
    try {
      await navigator.clipboard.writeText(draft.customCss || '');
      setCopied(true);
      setTimeout(() => setCopied(false), 1600);
    } catch {
      // 剪贴板不可用（无权限）时静默失败
    }
  };

  /** 导入分享码：粘贴即导入，并直接把草稿切到新主题，省掉「再点一次列表」 */
  const handleImportShare = () => {
    const parsed = decodeThemeShare(shareInput);
    if (!parsed) {
      setShareMsg({ text: '分享码无法识别，请确认已完整复制', ok: false });
      return;
    }
    storageService.saveCustomTheme(parsed);
    setCustomThemes(storageService.getCustomThemes());
    setDraft(parsed);
    setShareInput('');
    setShareOpen(false);
    setShareMsg({ text: `已导入「${parsed.name}」`, ok: true });
    setTimeout(() => setShareMsg(null), 2400);
  };

  const handleExportJson = () => downloadThemeJson(draft);

  const handleCopyShare = async () => {
    try {
      await navigator.clipboard.writeText(encodeThemeShare(draft));
      setShareMsg({ text: '分享码已复制，粘贴给同事即可导入', ok: true });
    } catch {
      setShareMsg({ text: '剪贴板不可用，请手动复制 CSS 或导出文件', ok: false });
    }
    setTimeout(() => setShareMsg(null), 2600);
  };

  const renderThemeItem = (theme: ThemeConfig, custom: boolean) => {
    const selected = draft.id === theme.id;
    return (
      <div
        key={theme.id}
        className={`group flex items-center rounded-lg transition-colors ${
          selected ? 'bg-emerald-50 text-emerald-800' : 'text-slate-600 hover:bg-slate-50'
        }`}
      >
        <button
          onClick={() => setDraft(theme)}
          className={`flex-1 min-w-0 text-left px-3 py-2 text-xs truncate ${
            selected ? 'font-semibold' : ''
          }`}
          title={theme.description}
        >
          {theme.name}
        </button>
        {custom && (
          <button
            onClick={() => handleDeleteCustom(theme.id, theme.name)}
            aria-label={`删除主题 ${theme.name}`}
            className="opacity-0 group-hover:opacity-100 pr-2 text-slate-400 hover:text-red-500 transition-opacity"
          >
            <Trash2 className="w-3.5 h-3.5" />
          </button>
        )}
      </div>
    );
  };

  return (
    <div
      role="dialog"
      aria-modal="true"
      aria-label="文章主题"
      className="fixed inset-0 z-[80] flex items-center justify-center bg-black/50 backdrop-blur-xs p-4"
      onClick={onClose}
    >
      <div
        onClick={(e) => e.stopPropagation()}
        className="bg-white rounded-2xl shadow-2xl border border-gray-200 w-full max-w-[1080px] h-[88vh] flex flex-col overflow-hidden"
      >
        {/* Header */}
        <div className="flex items-start justify-between px-6 pt-5 pb-4 border-b border-gray-100 shrink-0">
          <div>
            <h2 className="text-base font-bold text-slate-800">文章主题</h2>
            <p className="text-xs text-slate-500 mt-1">选择、创建或导入公众号排版主题</p>
          </div>
          <button
            onClick={onClose}
            aria-label="关闭"
            className="p-1.5 -mr-1 rounded-lg text-slate-400 hover:text-slate-600 hover:bg-slate-100 transition-colors"
          >
            <X className="w-4 h-4" />
          </button>
        </div>

        {/* Body: 三栏 */}
        <div className="flex-1 flex min-h-0">
          {/* 左栏：主题列表 */}
          <div className="w-64 shrink-0 border-r border-gray-100 flex flex-col min-h-0">
            <div className="p-3 space-y-2 shrink-0">
              <button
                onClick={handleCreateNew}
                className="w-full py-2 px-3 bg-emerald-600 hover:bg-emerald-700 text-white text-xs font-semibold rounded-lg flex items-center justify-center gap-1.5 transition-colors"
              >
                <Plus className="w-3.5 h-3.5" />
                新建自定义主题
              </button>
              <button
                onClick={handleImport}
                className="w-full py-2 px-3 border border-gray-200 hover:bg-slate-50 text-slate-700 text-xs font-medium rounded-lg flex items-center justify-center gap-1.5 transition-colors"
              >
                <Upload className="w-3.5 h-3.5" />
                导入主题文件
              </button>

              <button
                onClick={() => {
                  setShareOpen((v) => !v);
                  setShareMsg(null);
                }}
                className={`w-full py-2 px-3 border text-xs font-medium rounded-lg flex items-center justify-center gap-1.5 transition-colors ${
                  shareOpen
                    ? 'border-emerald-400 bg-emerald-50 text-emerald-700'
                    : 'border-gray-200 hover:bg-slate-50 text-slate-700'
                }`}
              >
                <ClipboardPaste className="w-3.5 h-3.5" />
                粘贴分享码
              </button>

              {shareOpen && (
                <div className="space-y-1.5 p-2 rounded-lg bg-slate-50 border border-slate-200">
                  <textarea
                    value={shareInput}
                    onChange={(e) => setShareInput(e.target.value)}
                    rows={3}
                    spellCheck={false}
                    placeholder="粘贴以 GZH-THEME-1: 开头的分享码"
                    className="w-full px-2 py-1.5 rounded-md border border-slate-200 bg-white font-mono text-[10px] leading-relaxed text-slate-700 resize-none focus:outline-none focus:border-emerald-500"
                  />
                  <div className="flex items-center gap-1.5">
                    <button
                      onClick={handleImportShare}
                      disabled={!shareInput.trim()}
                      className="flex-1 py-1.5 rounded-md bg-emerald-600 hover:bg-emerald-700 disabled:bg-slate-200 disabled:text-slate-400 text-white text-[11px] font-semibold transition-colors"
                    >
                      导入
                    </button>
                    <button
                      onClick={() => {
                        setShareOpen(false);
                        setShareInput('');
                      }}
                      className="px-2.5 py-1.5 rounded-md text-[11px] font-medium text-slate-500 hover:bg-slate-100 transition-colors"
                    >
                      取消
                    </button>
                  </div>
                </div>
              )}

              {shareMsg && (
                <div
                  className={`px-2.5 py-2 rounded-lg text-[10px] leading-relaxed border ${
                    shareMsg.ok
                      ? 'bg-emerald-50 border-emerald-200 text-emerald-700'
                      : 'bg-amber-50 border-amber-200 text-amber-800'
                  }`}
                >
                  {shareMsg.text}
                </div>
              )}
            </div>

            {/* 搜索 + 分类筛选：主题到 28 套后，「按名字找」和「按气质挑」都得能用 */}
            <div className="px-3 pb-2 space-y-2 shrink-0">
              <div className="relative">
                <Search className="w-3.5 h-3.5 text-slate-400 absolute left-2.5 top-1/2 -translate-y-1/2 pointer-events-none" />
                <input
                  type="text"
                  value={query}
                  onChange={(e) => setQuery(e.target.value)}
                  placeholder="搜索主题名 / 英文名 / 描述"
                  className="w-full pl-8 pr-7 py-1.5 rounded-lg border border-gray-200 bg-white text-[11px] text-slate-700 placeholder:text-slate-400 focus:outline-none focus:border-emerald-500 focus:ring-2 focus:ring-emerald-500/15"
                />
                {query && (
                  <button
                    onClick={() => setQuery('')}
                    aria-label="清空搜索"
                    className="absolute right-1.5 top-1/2 -translate-y-1/2 p-1 rounded text-slate-400 hover:text-slate-600"
                  >
                    <X className="w-3 h-3" />
                  </button>
                )}
              </div>

              <div className="flex flex-wrap gap-1">
                <button
                  onClick={() => setCategory('all')}
                  className={`px-2 py-0.5 rounded-full text-[10px] font-medium transition-colors ${
                    category === 'all'
                      ? 'bg-emerald-600 text-white'
                      : 'bg-slate-100 text-slate-600 hover:bg-slate-200'
                  }`}
                >
                  全部 {DEFAULT_THEMES.length}
                </button>
                {THEME_CATEGORIES.map((c) => (
                  <button
                    key={c.id}
                    onClick={() => setCategory(category === c.id ? 'all' : c.id)}
                    className={`px-2 py-0.5 rounded-full text-[10px] font-medium transition-colors ${
                      category === c.id
                        ? 'bg-emerald-600 text-white'
                        : 'bg-slate-100 text-slate-600 hover:bg-slate-200'
                    }`}
                  >
                    {c.label} {categoryCounts[c.id] ?? 0}
                  </button>
                ))}
              </div>
            </div>

            <div className="flex-1 overflow-y-auto px-2 pb-3">
              <div className="px-2 py-1.5 text-[10px] font-medium text-slate-400 uppercase tracking-wide">
                内置主题
                <span className="ml-1 text-slate-300 normal-case">（{filteredBuiltins.length}）</span>
              </div>
              {filteredBuiltins.length === 0 ? (
                <div className="px-3 py-2 text-[11px] text-slate-400 leading-relaxed">
                  没有符合条件的主题。
                </div>
              ) : (
                filteredBuiltins.map((t) => renderThemeItem(t, false))
              )}

              <div className="px-2 py-1.5 mt-2 text-[10px] font-medium text-slate-400 uppercase tracking-wide">
                自定义主题
                <span className="ml-1 text-slate-300 normal-case">（{filteredCustoms.length}）</span>
              </div>
              {filteredCustoms.length === 0 ? (
                <div className="px-3 py-2 text-[11px] text-slate-400 leading-relaxed">
                  {customThemes.length === 0
                    ? '还没有自定义主题。点上方按钮创建，或对内置主题点「复制」。'
                    : '没有符合条件的自定义主题。'}
                </div>
              ) : (
                filteredCustoms.map((t) => renderThemeItem(t, true))
              )}
            </div>
          </div>

          {/* 中栏：预览 */}
          <div className="flex-1 flex flex-col min-w-0 min-h-0 bg-slate-50/60">
            <div className="flex items-center gap-2 px-4 py-3 shrink-0">
              <button
                onClick={() => setPreviewSource('article')}
                className={`px-3 py-1.5 rounded-lg text-xs font-medium transition-colors ${
                  previewSource === 'article'
                    ? 'bg-emerald-600 text-white'
                    : 'bg-white text-slate-600 hover:bg-slate-100 border border-gray-200'
                }`}
              >
                当前文章
              </button>
              <button
                onClick={() => setPreviewSource('sample')}
                className={`px-3 py-1.5 rounded-lg text-xs font-medium transition-colors ${
                  previewSource === 'sample'
                    ? 'bg-emerald-600 text-white'
                    : 'bg-white text-slate-600 hover:bg-slate-100 border border-gray-200'
                }`}
              >
                示例内容
              </button>
              <span className="ml-auto text-[10px] text-slate-400">实时预览</span>
            </div>

            <div className="flex-1 overflow-y-auto px-4 pb-3 min-h-0">
              <div className="bg-white rounded-xl border border-gray-200 shadow-xs">
                <div
                  className="gzh-preview-container"
                  dangerouslySetInnerHTML={{ __html: previewHtml }}
                />
              </div>
            </div>

            <div className="px-4 py-3 shrink-0 flex items-center gap-2">
              <button
                onClick={handleDuplicate}
                className="px-3 py-1.5 rounded-lg border border-gray-200 bg-white hover:bg-slate-50 text-slate-700 text-xs font-medium flex items-center gap-1.5 transition-colors"
              >
                <Copy className="w-3.5 h-3.5" />
                复制
              </button>
              {onOpenAdvancedSettings && (
                <button
                  onClick={onOpenAdvancedSettings}
                  className="px-3 py-1.5 rounded-lg border border-gray-200 bg-white hover:bg-slate-50 text-slate-700 text-xs font-medium flex items-center gap-1.5 transition-colors"
                  title="颜色、字号、行高、标题样式、代码主题等参数化精调"
                >
                  <Settings2 className="w-3.5 h-3.5" />
                  样式参数
                </button>
              )}
            </div>
          </div>

          {/* 右栏：名称 + CSS */}
          <div className="w-[380px] shrink-0 border-l border-gray-100 flex flex-col min-h-0">
            <div className="flex-1 overflow-y-auto p-4 space-y-3 min-h-0">
              <div>
                <label className="block text-xs font-bold text-slate-800 mb-1.5">主题名称</label>
                <input
                  type="text"
                  value={draft.name}
                  readOnly={isBuiltin}
                  onChange={(e) => setDraft({ ...draft, name: e.target.value })}
                  className={`w-full px-3 py-2 rounded-lg border text-xs outline-none transition-colors ${
                    isBuiltin
                      ? 'bg-slate-50 text-slate-500 border-gray-200 cursor-not-allowed'
                      : 'bg-white text-slate-700 border-gray-200 focus:border-emerald-500 focus:ring-2 focus:ring-emerald-500/20'
                  }`}
                />
              </div>

              <div className="flex flex-col min-h-0">
                <div className="flex items-center justify-between mb-1.5">
                  <label className="block text-xs font-bold text-slate-800">CSS 样式</label>
                  {isBuiltin && (
                    <span className="text-[10px] text-slate-400">内置主题只读</span>
                  )}
                </div>
                <CssEditor
                  value={draft.customCss ?? ''}
                  onChange={(v) => setDraft({ ...draft, customCss: v })}
                  readOnly={isBuiltin}
                  height={280}
                  placeholder={`p { margin: 20px 0; letter-spacing: 0.6px; }
h2 { margin-top: 34px; }
blockquote { border-left: 3px solid #07C160; }
#gzh-article-root { padding: 24px 18px; }`}
                />
              </div>

              {isBuiltin && (
                <div className="flex items-start gap-2 px-3 py-2.5 rounded-lg bg-amber-50 border border-amber-200 text-[11px] text-amber-800 leading-relaxed">
                  <Info className="w-3.5 h-3.5 mt-0.5 shrink-0" />
                  <span>
                    内置主题不可编辑（改动会在升级时被覆盖）。点击下方「复制」可以基于此主题创建自定义主题。
                  </span>
                </div>
              )}

              <button
                onClick={handleCopyCss}
                className="w-full py-2 rounded-lg border border-gray-200 hover:bg-slate-50 text-slate-600 text-xs font-medium flex items-center justify-center gap-1.5 transition-colors"
              >
                {copied ? (
                  <>
                    <Check className="w-3.5 h-3.5 text-emerald-600" />
                    已复制
                  </>
                ) : (
                  <>
                    <Copy className="w-3.5 h-3.5" />
                    复制 CSS
                  </>
                )}
              </button>

              <div className="grid grid-cols-2 gap-2">
                <button
                  onClick={handleExportJson}
                  title="导出为 .gzh-theme.json 文件，可归档或放进 Git 管理"
                  className="py-2 rounded-lg border border-gray-200 hover:bg-slate-50 text-slate-600 text-xs font-medium flex items-center justify-center gap-1.5 transition-colors"
                >
                  <Download className="w-3.5 h-3.5" />
                  导出文件
                </button>
                <button
                  onClick={handleCopyShare}
                  title="生成一段分享码，粘贴给同事即可导入"
                  className="py-2 rounded-lg border border-gray-200 hover:bg-slate-50 text-slate-600 text-xs font-medium flex items-center justify-center gap-1.5 transition-colors"
                >
                  <Share2 className="w-3.5 h-3.5" />
                  分享码
                </button>
              </div>
            </div>

            {/* 右栏底部操作 */}
            <div className="px-4 py-3 border-t border-gray-100 flex items-center justify-end gap-2 shrink-0">
              <button
                onClick={onClose}
                className="px-4 py-2 rounded-lg text-xs font-medium text-slate-600 hover:bg-slate-100 transition-colors"
              >
                取消
              </button>
              <button
                onClick={handleApply}
                className="px-4 py-2 rounded-lg bg-emerald-600 hover:bg-emerald-700 text-white text-xs font-semibold shadow-sm transition-colors flex items-center gap-1.5"
              >
                <Palette className="w-3.5 h-3.5" />
                应用主题
              </button>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
};
