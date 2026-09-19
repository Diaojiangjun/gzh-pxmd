/**
 * 主题令牌（Design Tokens）解析层
 *
 * 背景：此前主题只有 11 个参数（颜色 3 个 / 字号 / 行高 / 字间距 / 标题样式…），
 * 其余视觉细节（标题字号、引用色、表格边框、代码块底色、图片圆角、块间距…）
 * 全部**硬编码在 gzhCompiler.ts 的渲染器里**。用户说「想改标题颜色」「引用条太粗」
 * 这类需求无法通过参数满足，只能去写自定义 CSS——门槛高且容易写错。
 *
 * 本模块做两件事：
 *  1. `ThemeTokens`（全部可选）在 types/index.ts 定义，主题可只声明关心的字段；
 *  2. `resolveTokens(theme)` 用 `DEFAULT_TOKENS` 补齐成**完整值**，
 *     渲染器只从解析结果取值 → 硬编码归零，所有视觉细节都可主题化。
 *
 * 关键约束：**默认值必须与原硬编码逐一对齐**，保证已有 12 套主题、以及用户
 * 已保存的自定义主题在升级后视觉零回归（未声明 tokens 时行为与旧版完全一致）。
 */
import { ThemeConfig, ThemeTokens } from '../types';

export type ResolvedTokens = Required<ThemeTokens>;

/** 无衬线 & 等宽字体栈的通用默认值 */
const DEFAULT_MONO = "Menlo, Monaco, Consolas, 'Courier New', monospace";

/**
 * 与旧版硬编码逐一对齐的默认令牌。
 * 修改这里的值 = 修改所有未声明该字段的主题的外观，务必谨慎。
 */
export const DEFAULT_TOKENS: Omit<ResolvedTokens, 'codeBgColor' | 'codeTextColor' | 'codeBarBgColor'> & {
  codeBgColor: string;
  codeTextColor: string;
  codeBarBgColor: string;
} = {
  // 字体
  headingFontFamily: '',
  monoFontFamily: DEFAULT_MONO,

  // 排版
  textAlign: 'justify',
  firstLineIndent: '0px',
  paragraphSpacing: '16px',

  // 字号
  h1Size: '22px',
  h2Size: '18px',
  h3Size: '16px',
  quoteFontSize: '14.5px',
  codeFontSize: '13px',
  inlineCodeFontSize: '13.5px',
  captionFontSize: '12.5px',
  tableFontSize: '14px',

  // 标题间距
  h1MarginTop: '28px',
  h1MarginBottom: '16px',
  h2MarginTop: '26px',
  h2MarginBottom: '14px',
  h3MarginTop: '20px',
  h3MarginBottom: '10px',

  // 颜色（依赖主题色的项用空串占位，运行时回填）
  headingColor: '',
  h3Color: '',
  linkColor: '',
  strongColor: '',
  emColor: '',
  quoteTextColor: '',
  quoteBorderColor: '',
  quoteBgColor: 'rgba(0,0,0,0.025)',
  inlineCodeBgColor: 'rgba(0,0,0,0.05)',
  inlineCodeColor: '',
  hrColor: '',
  tableBorderColor: 'rgba(0,0,0,0.08)',
  tableHeadBgColor: 'rgba(0,0,0,0.04)',
  tableHeadColor: '',
  tableCellColor: '',
  captionColor: '#888888',
  listMarkerColor: '',
  codeBgColor: '',
  codeTextColor: '',
  codeBarBgColor: '',

  // 元素外观
  imageRadius: '6px',
  imageAlign: 'center',
  imageBorder: 'none',
  codeBlockRadius: '8px',
  codeShowBar: true,
  blockRadius: '12px',
  hrStyle: 'stars',

  // 容器
  contentPadding: '20px 16px',
  contentMaxWidth: '677px',
};

/** 代码块配色方案（由主题的 codeTheme 决定，也可被 tokens 覆盖） */
export function codePalette(theme: ThemeConfig): {
  bg: string;
  text: string;
  barBg: string;
  border: string;
  langText: string;
} {
  const isDark = theme.codeTheme === 'mac-dark';
  return isDark
    ? {
        bg: '#1e1e2e',
        text: '#cdd6f4',
        barBg: '#181825',
        border: 'rgba(255,255,255,0.08)',
        langText: '#a6adc8',
      }
    : {
        bg: '#f8fafc',
        text: '#1e293b',
        barBg: '#e2e8f0',
        border: 'rgba(0,0,0,0.08)',
        langText: '#64748b',
      };
}

/**
 * 把主题声明的令牌补齐为完整值。
 *
 * 空串默认值（依赖主题色）在此回填：
 *  - headingColor / strongColor / inlineCodeColor → primaryColor
 *  - h3Color / emColor / quoteTextColor / tableCellColor → secondaryColor
 *  - linkColor / quoteBorderColor / hrColor / listMarkerColor / tableHeadColor → accentColor
 */
export function resolveTokens(theme: ThemeConfig): ResolvedTokens {
  const raw = (theme.tokens ?? {}) as ThemeTokens;
  const palette = codePalette(theme);

  const merged = { ...DEFAULT_TOKENS, ...raw } as ResolvedTokens;

  // 空串 = 未设置，回填为主题语义色
  const fill = (value: string | undefined, fallback: string) => (value ? value : fallback);

  return {
    ...merged,
    headingColor: fill(raw.headingColor, theme.primaryColor),
    strongColor: fill(raw.strongColor, theme.primaryColor),
    inlineCodeColor: fill(raw.inlineCodeColor, theme.primaryColor),
    tableHeadColor: fill(raw.tableHeadColor, theme.primaryColor),

    h3Color: fill(raw.h3Color, theme.secondaryColor),
    emColor: fill(raw.emColor, theme.secondaryColor),
    quoteTextColor: fill(raw.quoteTextColor, theme.secondaryColor),
    tableCellColor: fill(raw.tableCellColor, theme.secondaryColor),

    linkColor: fill(raw.linkColor, theme.accentColor),
    quoteBorderColor: fill(raw.quoteBorderColor, theme.accentColor),
    hrColor: fill(raw.hrColor, theme.accentColor),
    listMarkerColor: fill(raw.listMarkerColor, theme.accentColor),

    codeBgColor: fill(raw.codeBgColor, palette.bg),
    codeTextColor: fill(raw.codeTextColor, palette.text),
    codeBarBgColor: fill(raw.codeBarBgColor, palette.barBg),
  };
}

/** 标题字体：未显式声明时继承正文字体（返回空串表示不输出该声明） */
export function headingFontDecl(t: ResolvedTokens): string {
  return t.headingFontFamily ? `font-family: ${t.headingFontFamily}; ` : '';
}

/**
 * 段首缩进。
 *
 * 与 `text-align: justify` 组合时缩进只作用于段首行（CSS 语义），
 * 所以中英混排也不会把整段推歪。
 */
export function indentDecl(t: ResolvedTokens): string {
  if (!t.firstLineIndent || t.firstLineIndent === '0' || t.firstLineIndent === '0px') return '';
  return `text-indent: ${t.firstLineIndent}; `;
}

/**
 * 一键风格预设。
 *
 * 用途有两个：
 *  1. 内置主题「学术论文 / 东方笺谱」把原先写在 customCss 里的缩进、段距
 *     迁移为令牌（**等价迁移**，渲染结果不变，但从此可在设计器里调节）；
 *  2. 在设计器里作为快捷键，一键把当前主题的某个风格维度调到典型值。
 */
export const TOKEN_PRESETS: Record<string, { label: string; hint: string; tokens: ThemeTokens }> = {
  academic: {
    label: '学术论文',
    hint: '段首缩进两格，标题紧凑',
    tokens: {
      firstLineIndent: '2em',
      textAlign: 'justify',
      paragraphSpacing: '14px',
      h2MarginTop: '34px',
      h2MarginBottom: '14px',
      h3MarginTop: '24px',
    },
  },
  letterpress: {
    label: '纸面书卷',
    hint: '首行缩进 + 宽松段距，还原纸感',
    tokens: {
      firstLineIndent: '2em',
      textAlign: 'justify',
      paragraphSpacing: '18px',
      quoteFontSize: '15px',
    },
  },
  sharp: {
    label: '直角克制',
    hint: '圆角收紧，分隔线改实线',
    tokens: {
      blockRadius: '4px',
      imageRadius: '4px',
      codeBlockRadius: '4px',
      hrStyle: 'solid',
    },
  },
  rounded: {
    label: '圆润柔和',
    hint: '大圆角卡片感',
    tokens: {
      blockRadius: '16px',
      imageRadius: '12px',
      codeBlockRadius: '12px',
    },
  },
  magazine: {
    label: '杂志排版',
    hint: '标题放大、段距拉开、左对齐',
    tokens: {
      textAlign: 'left',
      paragraphSpacing: '22px',
      h1Size: '24px',
      h2Size: '19px',
      h2MarginTop: '32px',
    },
  },
  compact: {
    label: '紧凑信息流',
    hint: '段距与标题间距收紧，适合干货清单',
    tokens: {
      paragraphSpacing: '12px',
      h2MarginTop: '20px',
      h2MarginBottom: '10px',
      h3MarginTop: '16px',
    },
  },
};

