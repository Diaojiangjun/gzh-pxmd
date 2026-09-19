import React from 'react';
import {
  X,
  Palette,
  Type,
  AlignLeft,
  Shapes,
  Code2,
  Frame,
  Heading1,
  RotateCcw,
  Save,
  Check,
  Sparkles,
  Info,
  LayoutGrid,
} from 'lucide-react';
import { ThemeConfig, BackgroundSettings, HeadingStyle } from '../types';
import { DEFAULT_THEMES } from '../data/defaultData';
import { compileWeChatMarkdown } from '../services/gzhCompiler';
import { resolveTokens, TOKEN_PRESETS } from '../services/themeTokens';
import { useEscapeKey } from '../hooks/useEscapeKey';
import { SAMPLE_MARKDOWN } from '../data/sampleMarkdown';

/* ────────────────────────── 常量 ────────────────────────── */

type GroupId = 'palette' | 'colors' | 'typography' | 'spacing' | 'heading' | 'elements' | 'code' | 'container';

const GROUPS: Array<{ id: GroupId; label: string; icon: React.ElementType; desc: string }> = [
  { id: 'palette', label: '配色方案', icon: Palette, desc: '主色 / 次要色 / 强调色 / 底色' },
  { id: 'colors', label: '元素配色', icon: Sparkles, desc: '标题、引用、链接、表格、图注…' },
  { id: 'typography', label: '字体字号', icon: Type, desc: '字体栈与各级字号' },
  { id: 'spacing', label: '段落排版', icon: AlignLeft, desc: '行高、段距、对齐、缩进' },
  { id: 'heading', label: '标题装饰', icon: Heading1, desc: 'H2 的 6 种装饰样式' },
  { id: 'elements', label: '元素外观', icon: Shapes, desc: '圆角、图片、分隔线' },
  { id: 'code', label: '代码块', icon: Code2, desc: '配色与终端圆点栏' },
  { id: 'container', label: '版心容器', icon: Frame, desc: '内边距与最大宽度' },
];

const FONT_STACKS: Array<{ label: string; value: string }> = [
  {
    label: '系统无衬线（微信默认观感）',
    value:
      "-apple-system, BlinkMacSystemFont, 'Helvetica Neue', 'PingFang SC', 'Hiragino Sans GB', 'Microsoft YaHei', sans-serif",
  },
  { label: '思源黑体 / 苹方', value: "'PingFang SC', 'Source Han Sans SC', 'Noto Sans SC', 'Microsoft YaHei', sans-serif" },
  { label: '宋体（印刷感）', value: "SimSun, STSong, 'Songti SC', 'Noto Serif SC', serif" },
  {
    label: '思源宋体（中文衬线首选）',
    value: "'Songti SC', 'Source Han Serif SC', 'Noto Serif SC', SimSun, STSong, serif",
  },
  { label: '楷体（信笺手写感）', value: "KaiTi, STKaiti, 'Kaiti SC', 'Noto Serif SC', serif" },
  { label: '圆体（亲和）', value: "'Yuanti SC', 'Hiragino Sans GB', 'PingFang SC', 'Microsoft YaHei', sans-serif" },
];

const HEADING_STYLES: Array<{ id: HeadingStyle; name: string; desc: string }> = [
  { id: 'left-accent-bar', name: '左侧强调色块', desc: '经典竖条引导' },
  { id: 'badge-number', name: '数字章节徽章', desc: '方块序号' },
  { id: 'double-bracket', name: '典雅双括号', desc: '【 标题 】' },
  { id: 'capsule-tag', name: '胶囊标签框', desc: '商业报表风' },
  { id: 'bottom-underline', name: '底部强调色线', desc: '渐变下划线' },
  { id: 'mac-window', name: '极客圆点标', desc: '终端同源圆点' },
];

const SIZE_PRESETS: Record<string, string[]> = {
  h1Size: ['20px', '22px', '24px', '26px'],
  h2Size: ['16px', '18px', '19px', '20px'],
  h3Size: ['14px', '16px', '17px', '18px'],
};

/* ────────────────────────── 工具 ────────────────────────── */

/** 把任意 CSS 颜色近似成 #rrggbb（供 <input type="color"> 显示） */
function toHex(input: string | undefined, fallback = '#ffffff'): string {
  if (!input) return fallback;
  const value = input.trim();
  if (value.startsWith('#')) {
    if (value.length === 4) return `#${[...value.slice(1)].map((c) => c + c).join('')}`;
    return value.slice(0, 7);
  }
  const m = value.match(/rgba?\(([^)]+)\)/i);
  if (m) {
    const parts = m[1].split(',').map((s) => parseFloat(s.trim()));
    const [r, g, b] = parts;
    const a = parts.length > 3 && !Number.isNaN(parts[3]) ? parts[3] : 1;
    // rgba 常用来表达「极浅底/极浅描边」，编辑器预览底色为白，故与白混合后取近似可视色
    const mix = (c: number) => Math.max(0, Math.min(255, Math.round(c * a + 255 * (1 - a))));
    return `#${[mix(r), mix(g), mix(b)].map((v) => v.toString(16).padStart(2, '0')).join('')}`;
  }
  return fallback;
}

/* ────────────────────────── 基础控件 ────────────────────────── */

const Field: React.FC<{ label: string; hint?: string; children: React.ReactNode }> = ({
  label,
  hint,
  children,
}) => (
  <div className="mb-4">
    <div className="flex items-center justify-between mb-1.5 gap-2">
      <span className="text-[11px] font-semibold text-slate-700 shrink-0">{label}</span>
      {hint && <span className="text-[10px] text-slate-400 truncate">{hint}</span>}
    </div>
    {children}
  </div>
);

/** 颜色选择：色块 + 文本输入 + 「跟随主题色」回退 */
const ColorControl: React.FC<{
  value?: string;
  fallback: string;
  onChange: (v: string) => void;
}> = ({ value, fallback, onChange }) => {
  const isInherited = !value;
  return (
    <div className="flex items-center gap-1.5">
      <input
        type="color"
        value={toHex(value || fallback)}
        onChange={(e) => onChange(e.target.value)}
        aria-label="选择颜色"
        className="w-7 h-7 shrink-0 rounded-md border border-slate-200 cursor-pointer p-0 bg-white"
      />
      <input
        type="text"
        value={value ?? ''}
        placeholder={fallback}
        spellCheck={false}
        onChange={(e) => onChange(e.target.value.trim())}
        className="flex-1 min-w-0 px-2 py-1 rounded-md border border-slate-200 font-mono text-[11px] text-slate-700 focus:outline-none focus:border-emerald-500 focus:ring-2 focus:ring-emerald-500/15"
      />
      <button
        type="button"
        onClick={() => onChange('')}
        disabled={isInherited}
        title={isInherited ? '当前跟随主题色' : '恢复为跟随主题色'}
        className={`shrink-0 px-1.5 py-1 rounded-md text-[10px] font-medium transition-colors ${
          isInherited
            ? 'text-slate-300 cursor-default'
            : 'text-slate-500 hover:text-emerald-700 hover:bg-emerald-50'
        }`}
      >
        跟随
      </button>
    </div>
  );
};

/** 数值（带单位）输入：预设 chips + ± 微调 */
const SizeControl: React.FC<{
  value: string;
  step?: number;
  min?: number;
  max?: number;
  unit?: string;
  presets?: string[];
  onChange: (v: string) => void;
}> = ({ value, step = 1, min = 0, max = 120, unit = 'px', presets, onChange }) => {
  const current = parseFloat(value) || 0;
  const clamp = (n: number) => Math.min(max, Math.max(min, Math.round(n * 100) / 100));

  return (
    <div className="space-y-1.5">
      {presets && (
        <div className="grid grid-cols-4 gap-1">
          {presets.map((p) => (
            <button
              key={p}
              type="button"
              onClick={() => onChange(p)}
              className={`py-1 rounded text-[10px] font-medium transition-colors ${
                value === p
                  ? 'bg-slate-900 text-white'
                  : 'bg-white border border-slate-200 text-slate-600 hover:bg-slate-50'
              }`}
            >
              {p}
            </button>
          ))}
        </div>
      )}

      <div className="flex items-center gap-1">
        <button
          type="button"
          onClick={() => onChange(`${clamp(current - step)}${unit}`)}
          className="w-6 h-6 shrink-0 rounded-md border border-slate-200 bg-white hover:bg-slate-50 text-slate-600 font-bold text-xs"
          aria-label="减小"
        >
          -
        </button>
        <div className="flex-1 flex items-center justify-center gap-0.5 border border-slate-200 rounded-md px-1.5 py-1 bg-white">
          <input
            type="number"
            value={current}
            step={step}
            min={min}
            max={max}
            onChange={(e) => {
              const n = parseFloat(e.target.value);
              if (!Number.isNaN(n)) onChange(`${clamp(n)}${unit}`);
            }}
            className="w-full text-center font-mono text-[11px] font-semibold text-slate-800 focus:outline-none bg-transparent"
          />
          <span className="text-[10px] text-slate-400 shrink-0">{unit}</span>
        </div>
        <button
          type="button"
          onClick={() => onChange(`${clamp(current + step)}${unit}`)}
          className="w-6 h-6 shrink-0 rounded-md border border-slate-200 bg-white hover:bg-slate-50 text-slate-600 font-bold text-xs"
          aria-label="增大"
        >
          +
        </button>
      </div>
    </div>
  );
};

/** 分段选择 */
const Segmented: React.FC<{
  value: string;
  options: Array<{ label: string; value: string }>;
  onChange: (v: string) => void;
  cols?: number;
}> = ({ value, options, onChange, cols }) => (
  <div className="grid gap-1" style={{ gridTemplateColumns: `repeat(${cols ?? options.length}, minmax(0, 1fr))` }}>
    {options.map((o) => (
      <button
        key={o.value}
        type="button"
        onClick={() => onChange(o.value)}
        className={`py-1.5 px-2 rounded-md text-[11px] font-medium transition-colors truncate ${
          value === o.value
            ? 'bg-slate-900 text-white'
            : 'bg-white border border-slate-200 text-slate-600 hover:bg-slate-50'
        }`}
      >
        {o.label}
      </button>
    ))}
  </div>
);

/** 允许任意 CSS 值的输入（em / % / 多值简写…），不做数字解析 */
const CssValueControl: React.FC<{
  value: string;
  presets: Array<{ label: string; value: string }>;
  placeholder?: string;
  onChange: (v: string) => void;
}> = ({ value, presets, placeholder, onChange }) => (
  <div className="space-y-1.5">
    <input
      type="text"
      value={value}
      spellCheck={false}
      placeholder={placeholder}
      onChange={(e) => onChange(e.target.value)}
      className="w-full px-2 py-1.5 rounded-md border border-slate-200 font-mono text-[11px] text-slate-700 focus:outline-none focus:border-emerald-500 focus:ring-2 focus:ring-emerald-500/15"
    />
    <div className="grid grid-cols-4 gap-1">
      {presets.map((p) => (
        <button
          key={p.value}
          type="button"
          onClick={() => onChange(p.value)}
          className={`py-1 rounded text-[10px] font-medium transition-colors ${
            value === p.value
              ? 'bg-slate-900 text-white'
              : 'bg-white border border-slate-200 text-slate-600 hover:bg-slate-50'
          }`}
        >
          {p.label}
        </button>
      ))}
    </div>
  </div>
);

/* ────────────────────────── 主组件 ────────────────────────── */

interface ThemeDesignerModalProps {
  isOpen: boolean;
  onClose: () => void;
  /** 当前生效主题 */
  theme: ThemeConfig;
  background: BackgroundSettings;
  markdown: string;
  /** 实时写回生效主题 */
  onUpdate: (patch: Partial<ThemeConfig>) => void;
  /** 把当前状态另存为自定义主题并应用 */
  onSaveAsCustom: (theme: ThemeConfig) => void;
  /** 回到主题列表（选择 / 搜索 / 导入导出） */
  onOpenThemeLibrary?: () => void;
}

export const ThemeDesignerModal: React.FC<ThemeDesignerModalProps> = ({
  isOpen,
  onClose,
  theme,
  background,
  markdown,
  onUpdate,
  onSaveAsCustom,
  onOpenThemeLibrary,
}) => {
  const [group, setGroup] = React.useState<GroupId>('palette');
  const [previewSource, setPreviewSource] = React.useState<'article' | 'sample'>('sample');
  const [saved, setSaved] = React.useState(false);

  useEscapeKey(isOpen, onClose);

  // 打开时回到第一个分组，并清掉上一次的「已保存」提示
  React.useEffect(() => {
    if (!isOpen) return;
    setGroup('palette');
    setSaved(false);
  }, [isOpen]);

  // 预览防抖：拖滑块/选色时不要每一帧都重编译整篇文章
  const [previewTheme, setPreviewTheme] = React.useState(theme);
  React.useEffect(() => {
    const timer = setTimeout(() => setPreviewTheme(theme), 180);
    return () => clearTimeout(timer);
  }, [theme]);

  const previewHtml = React.useMemo(() => {
    if (!isOpen) return '';
    try {
      const md = previewSource === 'article' ? markdown : SAMPLE_MARKDOWN;
      return compileWeChatMarkdown(md, previewTheme, background, { convertLinksToFootnotes: false });
    } catch {
      return '<p style="color:#94A3B8;font-size:13px;">预览编译失败</p>';
    }
  }, [isOpen, previewSource, markdown, previewTheme, background]);

  if (!isOpen) return null;

  const t = resolveTokens(theme);
  const patchTokens = (patch: Partial<typeof t>) => onUpdate({ tokens: { ...(theme.tokens ?? {}), ...patch } });

  /** 恢复该主题的初始状态（内置主题回到出厂参数；自定义主题同样回到出厂快照，避免误操作后无法回头） */
  const handleReset = () => {
    const preset = DEFAULT_THEMES.find((x) => x.id === theme.id);
    if (preset) onUpdate({ ...preset });
    else if (theme.tokens) onUpdate({ tokens: {} });
  };

  const handleApplyPreset = (key: string) => {
    patchTokens(TOKEN_PRESETS[key].tokens);
  };

  const handleSaveAsCustom = () => {
    onSaveAsCustom({
      ...theme,
      id: `custom-${Date.now()}`,
      name: theme.builtin ? `${theme.name} 自定义` : theme.name,
      builtin: false,
    });
    setSaved(true);
    setTimeout(() => setSaved(false), 1800);
  };

  const renderPanel = () => {
    switch (group) {
      /* ── 配色方案 ── */
      case 'palette':
        return (
          <>
            <Field label="主要颜色" hint="正文与标题的主色">
              <ColorControl value={theme.primaryColor} fallback="#222222" onChange={(v) => onUpdate({ primaryColor: v || '#222222' })} />
            </Field>
            <Field label="次要颜色" hint="辅助文字、说明">
              <ColorControl
                value={theme.secondaryColor}
                fallback="#555555"
                onChange={(v) => onUpdate({ secondaryColor: v || '#555555' })}
              />
            </Field>
            <Field label="强调颜色" hint="装饰线、符号、链接">
              <ColorControl value={theme.accentColor} fallback="#07c160" onChange={(v) => onUpdate({ accentColor: v || '#07c160' })} />
            </Field>
            <Field label="文章底色" hint="根容器背景">
              <ColorControl
                value={theme.backgroundColor}
                fallback="#ffffff"
                onChange={(v) => onUpdate({ backgroundColor: v || '#ffffff' })}
              />
            </Field>

            <div className="mt-5 pt-4 border-t border-slate-100">
              <div className="text-[11px] font-bold text-slate-800 mb-2">风格预设</div>
              <div className="grid grid-cols-2 gap-1.5">
                {Object.entries(TOKEN_PRESETS).map(([key, p]) => (
                  <button
                    key={key}
                    type="button"
                    onClick={() => handleApplyPreset(key)}
                    title={p.hint}
                    className="px-2 py-1.5 rounded-md border border-slate-200 bg-white hover:bg-emerald-50 hover:border-emerald-300 text-[11px] font-medium text-slate-700 transition-colors"
                  >
                    {p.label}
                  </button>
                ))}
              </div>
              <p className="text-[10px] text-slate-400 mt-2 leading-relaxed">
                预设会覆盖对应的排版参数（不影响颜色）。可叠加使用，再逐项微调。
              </p>
            </div>
          </>
        );

      /* ── 元素配色 ── */
      case 'colors':
        return (
          <>
            <div className="text-[11px] font-bold text-slate-800 mb-2">标题</div>
            <Field label="H1 / H2 标题色">
              <ColorControl value={theme.tokens?.headingColor} fallback={theme.primaryColor} onChange={(v) => patchTokens({ headingColor: v })} />
            </Field>
            <Field label="H3 标题色">
              <ColorControl value={theme.tokens?.h3Color} fallback={theme.secondaryColor} onChange={(v) => patchTokens({ h3Color: v })} />
            </Field>

            <div className="mt-5 pt-4 border-t border-slate-100 text-[11px] font-bold text-slate-800 mb-2">行内元素</div>
            <Field label="加粗文字">
              <ColorControl value={theme.tokens?.strongColor} fallback={theme.primaryColor} onChange={(v) => patchTokens({ strongColor: v })} />
            </Field>
            <Field label="斜体文字">
              <ColorControl value={theme.tokens?.emColor} fallback={theme.secondaryColor} onChange={(v) => patchTokens({ emColor: v })} />
            </Field>
            <Field label="链接颜色">
              <ColorControl value={theme.tokens?.linkColor} fallback={theme.accentColor} onChange={(v) => patchTokens({ linkColor: v })} />
            </Field>
            <Field label="列表符号">
              <ColorControl
                value={theme.tokens?.listMarkerColor}
                fallback={theme.accentColor}
                onChange={(v) => patchTokens({ listMarkerColor: v })}
              />
            </Field>

            <div className="mt-5 pt-4 border-t border-slate-100 text-[11px] font-bold text-slate-800 mb-2">引用块</div>
            <Field label="引用文字">
              <ColorControl
                value={theme.tokens?.quoteTextColor}
                fallback={theme.secondaryColor}
                onChange={(v) => patchTokens({ quoteTextColor: v })}
              />
            </Field>
            <Field label="引用边线">
              <ColorControl
                value={theme.tokens?.quoteBorderColor}
                fallback={theme.accentColor}
                onChange={(v) => patchTokens({ quoteBorderColor: v })}
              />
            </Field>
            <Field label="引用底色">
              <ColorControl
                value={theme.tokens?.quoteBgColor}
                fallback="rgba(0,0,0,0.025)"
                onChange={(v) => patchTokens({ quoteBgColor: v })}
              />
            </Field>

            <div className="mt-5 pt-4 border-t border-slate-100 text-[11px] font-bold text-slate-800 mb-2">表格 / 其它</div>
            <Field label="表格表头文字">
              <ColorControl
                value={theme.tokens?.tableHeadColor}
                fallback={theme.primaryColor}
                onChange={(v) => patchTokens({ tableHeadColor: v })}
              />
            </Field>
            <Field label="表格正文文字">
              <ColorControl
                value={theme.tokens?.tableCellColor}
                fallback={theme.secondaryColor}
                onChange={(v) => patchTokens({ tableCellColor: v })}
              />
            </Field>
            <Field label="表格描边">
              <ColorControl
                value={theme.tokens?.tableBorderColor}
                fallback="rgba(0,0,0,0.08)"
                onChange={(v) => patchTokens({ tableBorderColor: v })}
              />
            </Field>
            <Field label="表格表头底色">
              <ColorControl
                value={theme.tokens?.tableHeadBgColor}
                fallback="rgba(0,0,0,0.04)"
                onChange={(v) => patchTokens({ tableHeadBgColor: v })}
              />
            </Field>
            <Field label="图片说明文字">
              <ColorControl value={theme.tokens?.captionColor} fallback="#888888" onChange={(v) => patchTokens({ captionColor: v })} />
            </Field>
            <Field label="分隔线颜色">
              <ColorControl value={theme.tokens?.hrColor} fallback={theme.accentColor} onChange={(v) => patchTokens({ hrColor: v })} />
            </Field>
            <Field label="行内代码底色">
              <ColorControl
                value={theme.tokens?.inlineCodeBgColor}
                fallback="rgba(0,0,0,0.05)"
                onChange={(v) => patchTokens({ inlineCodeBgColor: v })}
              />
            </Field>
            <Field label="行内代码文字">
              <ColorControl
                value={theme.tokens?.inlineCodeColor}
                fallback={theme.primaryColor}
                onChange={(v) => patchTokens({ inlineCodeColor: v })}
              />
            </Field>
          </>
        );

      /* ── 字体字号 ── */
      case 'typography':
        return (
          <>
            <Field label="正文字体" hint="影响全篇默认字体">
              <select
                value={FONT_STACKS.some((f) => f.value === theme.fontFamily) ? theme.fontFamily : '__custom'}
                onChange={(e) => {
                  if (e.target.value !== '__custom') onUpdate({ fontFamily: e.target.value });
                }}
                className="w-full px-2 py-1.5 rounded-md border border-slate-200 bg-white text-[11px] text-slate-700 mb-1.5 focus:outline-none focus:border-emerald-500"
              >
                {FONT_STACKS.map((f) => (
                  <option key={f.label} value={f.value}>
                    {f.label}
                  </option>
                ))}
                <option value="__custom">自定义字体栈…</option>
              </select>
              <textarea
                value={theme.fontFamily}
                rows={2}
                spellCheck={false}
                onChange={(e) => onUpdate({ fontFamily: e.target.value })}
                className="w-full px-2 py-1.5 rounded-md border border-slate-200 font-mono text-[10px] leading-relaxed text-slate-600 focus:outline-none focus:border-emerald-500 resize-none"
              />
            </Field>

            <Field label="标题字体" hint="留空 = 跟随正文">
              <input
                type="text"
                value={theme.tokens?.headingFontFamily ?? ''}
                placeholder="留空则继承正文字体"
                spellCheck={false}
                onChange={(e) => patchTokens({ headingFontFamily: e.target.value })}
                className="w-full px-2 py-1.5 rounded-md border border-slate-200 font-mono text-[10px] text-slate-600 focus:outline-none focus:border-emerald-500"
              />
            </Field>

            <Field label="正文字号" hint="微信推荐 15px">
              <SizeControl
                value={theme.fontSize}
                min={10}
                max={32}
                step={0.5}
                presets={['14px', '15px', '16px', '17px']}
                onChange={(v) => onUpdate({ fontSize: v })}
              />
            </Field>

            <div className="mt-5 pt-4 border-t border-slate-100">
              <div className="text-[11px] font-bold text-slate-800 mb-3">标题字号</div>
              <Field label="H1 一级标题">
                <SizeControl value={t.h1Size} min={14} max={40} presets={SIZE_PRESETS.h1Size} onChange={(v) => patchTokens({ h1Size: v })} />
              </Field>
              <Field label="H2 二级标题">
                <SizeControl value={t.h2Size} min={13} max={34} presets={SIZE_PRESETS.h2Size} onChange={(v) => patchTokens({ h2Size: v })} />
              </Field>
              <Field label="H3 三级标题">
                <SizeControl value={t.h3Size} min={12} max={30} presets={SIZE_PRESETS.h3Size} onChange={(v) => patchTokens({ h3Size: v })} />
              </Field>
            </div>

            <div className="mt-5 pt-4 border-t border-slate-100">
              <div className="text-[11px] font-bold text-slate-800 mb-3">其它元素字号</div>
              <Field label="引用文字">
                <SizeControl value={t.quoteFontSize} min={11} max={24} step={0.5} onChange={(v) => patchTokens({ quoteFontSize: v })} />
              </Field>
              <Field label="表格">
                <SizeControl value={t.tableFontSize} min={11} max={22} step={0.5} onChange={(v) => patchTokens({ tableFontSize: v })} />
              </Field>
              <Field label="图片说明">
                <SizeControl
                  value={t.captionFontSize}
                  min={10}
                  max={20}
                  step={0.5}
                  onChange={(v) => patchTokens({ captionFontSize: v })}
                />
              </Field>
              <Field label="等宽字体栈" hint="代码专用">
                <textarea
                  value={t.monoFontFamily}
                  rows={2}
                  spellCheck={false}
                  onChange={(e) => patchTokens({ monoFontFamily: e.target.value })}
                  className="w-full px-2 py-1.5 rounded-md border border-slate-200 font-mono text-[10px] leading-relaxed text-slate-600 focus:outline-none focus:border-emerald-500 resize-none"
                />
              </Field>
            </div>
          </>
        );

      /* ── 段落排版 ── */
      case 'spacing':
        return (
          <>
            <Field label="行高倍数" hint="微信推荐 1.75">
              <SizeControl
                value={String(theme.lineHeight)}
                unit=""
                min={1}
                max={3.5}
                step={0.05}
                presets={['1.6', '1.75', '1.8', '2.0']}
                onChange={(v) => onUpdate({ lineHeight: parseFloat(v) })}
              />
            </Field>
            <Field label="字间距" hint="微信推荐 0.8px">
              <SizeControl
                value={theme.letterSpacing}
                min={0}
                max={4}
                step={0.1}
                presets={['0px', '0.5px', '0.8px', '1px']}
                onChange={(v) => onUpdate({ letterSpacing: v })}
              />
            </Field>
            <Field label="段落对齐">
              <Segmented
                value={t.textAlign}
                options={[
                  { label: '两端对齐', value: 'justify' },
                  { label: '左对齐', value: 'left' },
                ]}
                onChange={(v) => patchTokens({ textAlign: v as 'justify' | 'left' })}
              />
            </Field>
            <Field label="段首缩进" hint="中文排版常缩进两格">
              <CssValueControl
                value={t.firstLineIndent}
                placeholder="例：2em / 32px / 0"
                presets={[
                  { label: '不缩进', value: '0px' },
                  { label: '16px', value: '16px' },
                  { label: '2em', value: '2em' },
                  { label: '2.5em', value: '2.5em' },
                ]}
                onChange={(v) => patchTokens({ firstLineIndent: v })}
              />
              <p className="text-[10px] text-slate-400 mt-1.5 leading-relaxed">
                <code className="text-slate-500">2em</code> 会随字号缩放（推荐）；引用块内的段落会自动取消缩进。
              </p>
            </Field>
            <Field label="段落间距">
              <SizeControl value={t.paragraphSpacing} min={0} max={48} onChange={(v) => patchTokens({ paragraphSpacing: v })} />
            </Field>

            <div className="mt-5 pt-4 border-t border-slate-100">
              <div className="text-[11px] font-bold text-slate-800 mb-3">标题上下间距</div>
              <Field label="H1 上 / 下">
                <div className="grid grid-cols-2 gap-2">
                  <SizeControl value={t.h1MarginTop} min={0} max={80} onChange={(v) => patchTokens({ h1MarginTop: v })} />
                  <SizeControl value={t.h1MarginBottom} min={0} max={80} onChange={(v) => patchTokens({ h1MarginBottom: v })} />
                </div>
              </Field>
              <Field label="H2 上 / 下">
                <div className="grid grid-cols-2 gap-2">
                  <SizeControl value={t.h2MarginTop} min={0} max={80} onChange={(v) => patchTokens({ h2MarginTop: v })} />
                  <SizeControl value={t.h2MarginBottom} min={0} max={80} onChange={(v) => patchTokens({ h2MarginBottom: v })} />
                </div>
              </Field>
              <Field label="H3 上 / 下">
                <div className="grid grid-cols-2 gap-2">
                  <SizeControl value={t.h3MarginTop} min={0} max={80} onChange={(v) => patchTokens({ h3MarginTop: v })} />
                  <SizeControl value={t.h3MarginBottom} min={0} max={80} onChange={(v) => patchTokens({ h3MarginBottom: v })} />
                </div>
              </Field>
            </div>
          </>
        );

      /* ── 标题装饰 ── */
      case 'heading':
        return (
          <>
            <Field label="H2 章节标题样式" hint="公众号最常用的层级">
              <div className="space-y-1.5">
                {HEADING_STYLES.map((hs) => (
                  <button
                    key={hs.id}
                    type="button"
                    onClick={() => onUpdate({ headingStyle: hs.id })}
                    className={`w-full p-2.5 rounded-lg border text-left flex items-center justify-between transition-colors ${
                      theme.headingStyle === hs.id
                        ? 'border-emerald-500 bg-emerald-50/50 ring-1 ring-emerald-400'
                        : 'border-slate-200 hover:bg-slate-50'
                    }`}
                  >
                    <span>
                      <span className="block text-[11px] font-bold text-slate-800">{hs.name}</span>
                      <span className="block text-[10px] text-slate-400 mt-0.5">{hs.desc}</span>
                    </span>
                    {theme.headingStyle === hs.id && <Check className="w-3.5 h-3.5 text-emerald-600 shrink-0" />}
                  </button>
                ))}
              </div>
            </Field>
            <div className="flex items-start gap-2 px-3 py-2.5 rounded-lg bg-slate-50 border border-slate-200 text-[10px] text-slate-500 leading-relaxed">
              <Info className="w-3.5 h-3.5 mt-0.5 shrink-0" />
              <span>
                H1 / H3 的样式固定（H1 带强调下划线、H3 带 ▸ 引导符），仅颜色与字号可调，见「字体字号」「元素配色」。
              </span>
            </div>
          </>
        );

      /* ── 元素外观 ── */
      case 'elements':
        return (
          <>
            <Field label="图片圆角">
              <SizeControl
                value={t.imageRadius}
                min={0}
                max={40}
                presets={['0px', '4px', '6px', '12px']}
                onChange={(v) => patchTokens({ imageRadius: v })}
              />
            </Field>
            <Field label="图片对齐">
              <Segmented
                value={t.imageAlign}
                options={[
                  { label: '居中', value: 'center' },
                  { label: '左对齐', value: 'left' },
                ]}
                onChange={(v) => patchTokens({ imageAlign: v as 'center' | 'left' })}
              />
            </Field>
            <Field label="图片描边" hint="如 1px solid #E5E7EB">
              <input
                type="text"
                value={t.imageBorder}
                spellCheck={false}
                onChange={(e) => patchTokens({ imageBorder: e.target.value })}
                className="w-full px-2 py-1.5 rounded-md border border-slate-200 font-mono text-[10px] text-slate-600 focus:outline-none focus:border-emerald-500"
              />
            </Field>
            <Field label="版式块圆角" hint="hero / 卡片 / 目录 / 对比卡">
              <SizeControl
                value={t.blockRadius}
                min={0}
                max={24}
                presets={['0px', '4px', '8px', '12px']}
                onChange={(v) => patchTokens({ blockRadius: v })}
              />
            </Field>
            <Field label="分隔线样式" hint="Markdown 的 --- ">
              <Segmented
                value={t.hrStyle}
                options={[
                  { label: '星标 ✦✦✦', value: 'stars' },
                  { label: '实线', value: 'solid' },
                  { label: '虚线', value: 'dashed' },
                ]}
                onChange={(v) => patchTokens({ hrStyle: v as 'stars' | 'solid' | 'dashed' })}
              />
            </Field>
          </>
        );

      /* ── 代码块 ── */
      case 'code':
        return (
          <>
            <Field label="代码主题">
              <Segmented
                value={theme.codeTheme}
                options={[
                  { label: '深色极客黑', value: 'mac-dark' },
                  { label: '明亮清爽白', value: 'mac-light' },
                ]}
                onChange={(v) => onUpdate({ codeTheme: v as 'mac-dark' | 'mac-light' })}
              />
            </Field>
            <Field label="代码字号">
              <SizeControl value={t.codeFontSize} min={10} max={20} step={0.5} onChange={(v) => patchTokens({ codeFontSize: v })} />
            </Field>
            <Field label="行内代码字号">
              <SizeControl
                value={t.inlineCodeFontSize}
                min={10}
                max={20}
                step={0.5}
                onChange={(v) => patchTokens({ inlineCodeFontSize: v })}
              />
            </Field>
            <Field label="代码块圆角">
              <SizeControl
                value={t.codeBlockRadius}
                min={0}
                max={20}
                presets={['0px', '4px', '8px', '12px']}
                onChange={(v) => patchTokens({ codeBlockRadius: v })}
              />
            </Field>
            <Field label="终端圆点栏" hint="代码块顶部的红黄绿圆点">
              <Segmented
                value={t.codeShowBar ? 'on' : 'off'}
                options={[
                  { label: '显示', value: 'on' },
                  { label: '隐藏', value: 'off' },
                ]}
                onChange={(v) => patchTokens({ codeShowBar: v === 'on' })}
              />
            </Field>

            <div className="mt-5 pt-4 border-t border-slate-100">
              <div className="flex items-center justify-between mb-3">
                <span className="text-[11px] font-bold text-slate-800">配色覆盖</span>
                <button
                  type="button"
                  onClick={() => patchTokens({ codeBgColor: '', codeTextColor: '', codeBarBgColor: '' })}
                  className="text-[10px] text-slate-400 hover:text-slate-600"
                >
                  恢复为代码主题默认
                </button>
              </div>
              <Field label="代码区背景">
                <ColorControl value={theme.tokens?.codeBgColor} fallback={t.codeBgColor} onChange={(v) => patchTokens({ codeBgColor: v })} />
              </Field>
              <Field label="代码文字">
                <ColorControl
                  value={theme.tokens?.codeTextColor}
                  fallback={t.codeTextColor}
                  onChange={(v) => patchTokens({ codeTextColor: v })}
                />
              </Field>
              <Field label="圆点栏背景">
                <ColorControl
                  value={theme.tokens?.codeBarBgColor}
                  fallback={t.codeBarBgColor}
                  onChange={(v) => patchTokens({ codeBarBgColor: v })}
                />
              </Field>
            </div>
          </>
        );

      /* ── 版心容器 ── */
      case 'container':
        return (
          <>
            <Field label="版心最大宽度" hint="公众号正文约 677px">
              <CssValueControl
                value={t.contentMaxWidth}
                placeholder="例：677px / 100%"
                presets={[
                  { label: '600', value: '600px' },
                  { label: '677', value: '677px' },
                  { label: '720', value: '720px' },
                  { label: '铺满', value: '100%' },
                ]}
                onChange={(v) => patchTokens({ contentMaxWidth: v })}
              />
            </Field>
            <Field label="内边距（上 右 下 左）" hint="支持 1~4 个值">
              <input
                type="text"
                value={t.contentPadding}
                spellCheck={false}
                onChange={(e) => patchTokens({ contentPadding: e.target.value })}
                className="w-full px-2 py-1.5 rounded-md border border-slate-200 font-mono text-[11px] text-slate-700 focus:outline-none focus:border-emerald-500"
              />
            </Field>
            <div className="grid grid-cols-2 gap-1.5 mt-1">
              {[
                { label: '紧凑', value: '12px 12px' },
                { label: '标准', value: '20px 16px' },
                { label: '宽松', value: '28px 22px' },
                { label: '无内边距', value: '0px' },
              ].map((p) => (
                <button
                  key={p.label}
                  type="button"
                  onClick={() => patchTokens({ contentPadding: p.value })}
                  className={`py-1.5 rounded-md text-[11px] font-medium transition-colors ${
                    t.contentPadding === p.value
                      ? 'bg-slate-900 text-white'
                      : 'bg-white border border-slate-200 text-slate-600 hover:bg-slate-50'
                  }`}
                >
                  {p.label}
                </button>
              ))}
            </div>
            <div className="flex items-start gap-2 mt-4 px-3 py-2.5 rounded-lg bg-slate-50 border border-slate-200 text-[10px] text-slate-500 leading-relaxed">
              <Info className="w-3.5 h-3.5 mt-0.5 shrink-0" />
              <span>
                容器只在「公众号编辑器」内生效；粘贴时微信会以自身版心为准，
                因此这里的宽度主要影响长图导出与预览。
              </span>
            </div>
          </>
        );
    }
  };

  const currentGroup = GROUPS.find((g) => g.id === group)!;

  return (
    <div
      role="dialog"
      aria-modal="true"
      aria-label="主题设计器"
      className="fixed inset-0 z-[95] flex items-center justify-center bg-black/50 backdrop-blur-xs p-4"
      onClick={onClose}
    >
      <div
        onClick={(e) => e.stopPropagation()}
        className="bg-white rounded-2xl shadow-2xl border border-gray-200 w-full max-w-[1180px] h-[90vh] flex flex-col overflow-hidden"
      >
        {/* Header */}
        <div className="flex items-start justify-between px-6 pt-5 pb-4 border-b border-gray-100 shrink-0">
          <div className="flex items-center gap-2.5">
            <div
              className="w-8 h-8 rounded-lg flex items-center justify-center text-white shrink-0"
              style={{ backgroundColor: theme.accentColor }}
            >
              <Palette className="w-4 h-4" />
            </div>
            <div>
              <h2 className="text-base font-bold text-slate-800">主题设计器</h2>
              <p className="text-xs text-slate-500 mt-0.5">
                当前主题「{theme.name}」
                {theme.builtin ? ' · 内置主题（改动需「另存为自定义主题」才能保留）' : ' · 自定义主题'}
              </p>
            </div>
          </div>
          <div className="flex items-center gap-2 shrink-0">
            {onOpenThemeLibrary && (
              <button
                onClick={onOpenThemeLibrary}
                title="回到主题列表：换主题、搜索分类、导入导出"
                className="px-3 py-1.5 rounded-lg border border-gray-200 hover:bg-slate-50 text-slate-600 text-xs font-medium flex items-center gap-1.5 transition-colors"
              >
                <LayoutGrid className="w-3.5 h-3.5" />
                主题库
              </button>
            )}
            <button
              onClick={onClose}
              aria-label="关闭"
              className="p-1.5 -mr-1 rounded-lg text-slate-400 hover:text-slate-600 hover:bg-slate-100 transition-colors"
            >
              <X className="w-4 h-4" />
            </button>
          </div>
        </div>

        {/* Body */}
        <div className="flex-1 flex min-h-0">
          {/* 左：分组 */}
          <div className="w-44 shrink-0 border-r border-gray-100 flex flex-col min-h-0 py-2 overflow-y-auto">
            {GROUPS.map((g) => {
              const Icon = g.icon;
              const active = group === g.id;
              return (
                <button
                  key={g.id}
                  onClick={() => setGroup(g.id)}
                  title={g.desc}
                  className={`mx-2 mb-0.5 px-2.5 py-2 rounded-lg text-left flex items-center gap-2 transition-colors ${
                    active ? 'bg-emerald-50 text-emerald-800' : 'text-slate-600 hover:bg-slate-50'
                  }`}
                >
                  <Icon className={`w-3.5 h-3.5 shrink-0 ${active ? 'text-emerald-600' : 'text-slate-400'}`} />
                  <span className={`text-[11px] ${active ? 'font-bold' : 'font-medium'}`}>{g.label}</span>
                </button>
              );
            })}
          </div>

          {/* 中：控件 */}
          <div className="w-[360px] shrink-0 border-r border-gray-100 flex flex-col min-h-0">
            <div className="px-4 pt-3.5 pb-2 shrink-0">
              <div className="text-xs font-bold text-slate-800">{currentGroup.label}</div>
              <div className="text-[10px] text-slate-400 mt-0.5">{currentGroup.desc}</div>
            </div>
            <div className="flex-1 overflow-y-auto px-4 pb-4 min-h-0">{renderPanel()}</div>
            <div className="px-4 py-2.5 border-t border-gray-100 shrink-0">
              <button
                onClick={handleReset}
                className="w-full py-1.5 rounded-lg border border-gray-200 hover:bg-slate-50 text-slate-600 text-[11px] font-medium flex items-center justify-center gap-1.5 transition-colors"
                title="恢复当前主题的初始参数"
              >
                <RotateCcw className="w-3 h-3" />
                重置当前主题
              </button>
            </div>
          </div>

          {/* 右：实时预览 */}
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
              <span className="ml-auto text-[10px] text-slate-400">改参数即时预览</span>
            </div>

            <div className="flex-1 overflow-y-auto px-4 pb-3 min-h-0">
              <div className="bg-white rounded-xl border border-gray-200 shadow-xs">
                <div className="gzh-preview-container" dangerouslySetInnerHTML={{ __html: previewHtml }} />
              </div>
            </div>
          </div>
        </div>

        {/* Footer */}
        <div className="px-6 py-3 border-t border-gray-100 flex items-center justify-between shrink-0">
          <div className="text-[10px] text-slate-400">
            所有样式在编译时内联到元素上，复制到公众号依然生效。
          </div>
          <div className="flex items-center gap-2">
            <button
              onClick={handleSaveAsCustom}
              className="px-3.5 py-2 rounded-lg border border-gray-200 hover:bg-slate-50 text-slate-700 text-xs font-medium flex items-center gap-1.5 transition-colors"
              title="把当前所有参数固化成一个新的自定义主题"
            >
              {saved ? <Check className="w-3.5 h-3.5 text-emerald-600" /> : <Save className="w-3.5 h-3.5" />}
              {saved ? '已保存' : '另存为自定义主题'}
            </button>
            <button
              onClick={onClose}
              className="px-4 py-2 rounded-lg bg-emerald-600 hover:bg-emerald-700 text-white text-xs font-semibold shadow-sm transition-colors"
            >
              完成
            </button>
          </div>
        </div>
      </div>
    </div>
  );
};
