export type HeadingStyle =
  | 'left-accent-bar'
  | 'badge-number'
  | 'double-bracket'
  | 'capsule-tag'
  | 'bottom-underline'
  | 'mac-window';

/** 主题分类，用于主题库的分组浏览与筛选 */
export type ThemeCategory =
  | 'minimal'
  | 'business'
  | 'literary'
  | 'chinese'
  | 'tech'
  | 'academic'
  | 'dark'
  | 'lifestyle'
  | 'festival';

/**
 * 主题令牌（Design Tokens）——细粒度视觉参数，全部可选。
 *
 * 未声明的字段由 `services/themeTokens.ts` 的 `DEFAULT_TOKENS` 补齐，
 * 补齐值与原硬编码逐一对齐，因此**不声明任何令牌 = 旧版外观**。
 *
 * 颜色类字段留空（不写）时按语义回填主题色：
 *  - headingColor / strongColor / inlineCodeColor / tableHeadColor → primaryColor
 *  - h3Color / emColor / quoteTextColor / tableCellColor → secondaryColor
 *  - linkColor / quoteBorderColor / hrColor / listMarkerColor → accentColor
 */
export interface ThemeTokens {
  /* ── 字体 ── */
  /** 标题字体栈；留空则继承正文字体 */
  headingFontFamily?: string;
  /** 等宽字体栈（代码块 / 行内代码） */
  monoFontFamily?: string;

  /* ── 段落排版 ── */
  textAlign?: 'left' | 'justify';
  /** 段首缩进，如 '2em'；设为 0 表示不缩进 */
  firstLineIndent?: string;
  /** 段落之间的间距 */
  paragraphSpacing?: string;

  /* ── 字号 ── */
  h1Size?: string;
  h2Size?: string;
  h3Size?: string;
  quoteFontSize?: string;
  codeFontSize?: string;
  inlineCodeFontSize?: string;
  captionFontSize?: string;
  tableFontSize?: string;

  /* ── 标题间距 ── */
  h1MarginTop?: string;
  h1MarginBottom?: string;
  h2MarginTop?: string;
  h2MarginBottom?: string;
  h3MarginTop?: string;
  h3MarginBottom?: string;

  /* ── 颜色 ── */
  headingColor?: string;
  h3Color?: string;
  linkColor?: string;
  strongColor?: string;
  emColor?: string;
  quoteTextColor?: string;
  quoteBorderColor?: string;
  quoteBgColor?: string;
  inlineCodeBgColor?: string;
  inlineCodeColor?: string;
  hrColor?: string;
  tableBorderColor?: string;
  tableHeadBgColor?: string;
  tableHeadColor?: string;
  tableCellColor?: string;
  captionColor?: string;
  listMarkerColor?: string;
  codeBgColor?: string;
  codeTextColor?: string;
  codeBarBgColor?: string;

  /* ── 元素外观 ── */
  imageRadius?: string;
  imageAlign?: 'left' | 'center';
  /** 图片描边，如 '1px solid #E5E7EB'；'none' 表示无 */
  imageBorder?: string;
  codeBlockRadius?: string;
  /** 代码块顶部的 macOS 圆点栏 */
  codeShowBar?: boolean;
  /** 版式块（hero / toc / callout / steps / card…）的圆角 */
  blockRadius?: string;
  /** 分隔线样式：星标 / 实线 / 虚线 */
  hrStyle?: 'stars' | 'solid' | 'dashed';

  /* ── 容器 ── */
  contentPadding?: string;
  contentMaxWidth?: string;
}

export interface ThemeConfig {
  id: string;
  name: string;
  englishName: string;
  description: string;
  primaryColor: string;
  secondaryColor: string;
  accentColor: string;
  backgroundColor: string;
  fontFamily: string;
  fontSize: string;
  lineHeight: number;
  letterSpacing: string;
  headingStyle: HeadingStyle;
  codeTheme: 'mac-dark' | 'mac-light';
  /** 分类（内置主题由 defaultData 的映射表统一赋值，自定义主题可不填） */
  category?: ThemeCategory;
  /**
   * 细粒度视觉参数。见 `ThemeTokens`。
   * 不声明 = 使用默认令牌（与旧版硬编码一致）。
   */
  tokens?: ThemeTokens;
  /**
   * 用户自定义 CSS。
   *
   * 微信编辑器会剥离 `<style>` 标签与 class 选择器，所以这里不是「注入一段样式表」，
   * 而是在编译时把每条规则**内联到匹配到的元素上**（见 utils/customCss.ts），
   * 这样预览与复制到公众号的效果一致。
   *
   * 选择器可用标签名（p / h2 / blockquote）或 `#gzh-article-root`（文章根容器）。
   */
  customCss?: string;
  /**
   * 内置主题标记。
   * 内置主题随应用发布、不可直接编辑或删除（改动会在升级时被覆盖），
   * 用户需先「复制为自定义主题」再修改——与 WeMD 的交互一致。
   */
  builtin?: boolean;
}

export type BackgroundType =
  | 'none'
  | 'dot-grid'
  | 'clean-grid'
  | 'paper-texture'
  | 'diagonal-stripes'
  | 'warm-grain';

export interface BackgroundSettings {
  type: BackgroundType;
  color: string;
  patternColor: string;
  opacity: number;
  scale: number;
  applyToWechat: boolean;
}

export interface StickerItem {
  id: string;
  name: string;
  category: string;
  url: string;
  isGif?: boolean;
}

export interface ImageAttachment {
  id: string;
  name: string;
  url: string;
  size?: number;
  createdAt: number;
}

export interface LocalPreset {
  id: string;
  name: string;
  updatedAt: number;
  theme: ThemeConfig;
  background: BackgroundSettings;
  authorSignature?: string;
}

export type PreviewMode = 'default' | 'mobile' | 'tablet' | 'desktop';

/** 主工作区布局模式：左右分栏 / 上下分栏 / 专注编辑 / 专注预览 */
export type LayoutMode = 'horizontal' | 'vertical' | 'editor' | 'preview';

export type ComponentCategory =
  | 'header'
  | 'heading'
  | 'quote'
  | 'highlight'
  | 'code'
  | 'nav'
  | 'footer'
  | 'custom'
  | string;

export interface GzhComponentItem {
  id: string;
  name: string;
  category: ComponentCategory;
  description: string;
  snippet: string;
  isCustom?: boolean;
  createdAt?: number;
  updatedAt?: number;
}

export interface ArticleItem {
  id: string;
  title: string;
  content: string;
  createdAt: number;
  updatedAt: number;
  themeId?: string;
  wordCount?: number;
}

export type SnapshotTrigger = 'auto' | 'copy' | 'manual' | 'switch' | 'rollback' | 'ai';

export interface HistorySnapshot {
  id: string;
  articleId: string;
  articleTitle: string;
  content: string;
  timestamp: number;
  trigger: SnapshotTrigger;
  charCount: number;
  lineCount: number;
  note?: string;
}
