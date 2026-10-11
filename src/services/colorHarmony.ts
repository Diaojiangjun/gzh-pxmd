/**
 * 色彩运算与主色派生引擎
 *
 * 背景：主题有 20+ 个颜色令牌，但它们并不是各自独立的 —— 大部分都该跟着
 * 「主色」走（标题、链接、列表符号、引用边线、表头底色…）。让用户逐项手调
 * 不现实，改一次主色要同步十几项更是噩梦。
 *
 * 参考 wechat-formatter 的做法：给一个主色，重新生成整套依赖它的样式。
 * 本模块在此基础上补了它没有的一层保护 —— **对比度自动修正**：
 * 用户在任何主色下选出来的文字色，都会被调整到在当前底色上可读（WCAG AA）。
 */

import type { ThemeTokens } from '../types';

/* ────────────────────── 基础转换 ────────────────────── */

export interface Rgb {
  r: number;
  g: number;
  b: number;
}

/** 解析 #rgb / #rrggbb / #rrggbbaa，失败回退到黑色 */
export function hexToRgb(hex: string): Rgb {
  let s = (hex || '').trim().replace(/^#/, '');
  if (s.length === 3 || s.length === 4) s = s.slice(0, 3).split('').map((c) => c + c).join('');
  if (s.length > 6) s = s.slice(0, 6);
  if (!/^[0-9a-fA-F]{6}$/.test(s)) return { r: 0, g: 0, b: 0 };
  return {
    r: parseInt(s.slice(0, 2), 16),
    g: parseInt(s.slice(2, 4), 16),
    b: parseInt(s.slice(4, 6), 16),
  };
}

const clamp255 = (n: number) => Math.max(0, Math.min(255, Math.round(n)));

export function rgbToHex({ r, g, b }: Rgb): string {
  const h = (n: number) => clamp255(n).toString(16).padStart(2, '0');
  return `#${h(r)}${h(g)}${h(b)}`;
}

/** 转带透明度的 rgba 字符串 */
export function rgba(hex: string, alpha: number): string {
  const { r, g, b } = hexToRgb(hex);
  const a = Math.max(0, Math.min(1, Number(alpha.toFixed(3))));
  return `rgba(${r}, ${g}, ${b}, ${a})`;
}

/** 两个颜色按比例混合，ratio=0 取 a，ratio=1 取 b */
export function mix(a: string, b: string, ratio: number): string {
  const ca = hexToRgb(a);
  const cb = hexToRgb(b);
  const t = Math.max(0, Math.min(1, ratio));
  return rgbToHex({
    r: ca.r + (cb.r - ca.r) * t,
    g: ca.g + (cb.g - ca.g) * t,
    b: ca.b + (cb.b - ca.b) * t,
  });
}

export const lighten = (color: string, ratio: number) => mix(color, '#ffffff', ratio);
export const darken = (color: string, ratio: number) => mix(color, '#000000', ratio);

/** 转 HSL，用于调饱和度 */
export function toHsl(hex: string): { h: number; s: number; l: number } {
  const { r, g, b } = hexToRgb(hex);
  const rn = r / 255;
  const gn = g / 255;
  const bn = b / 255;
  const max = Math.max(rn, gn, bn);
  const min = Math.min(rn, gn, bn);
  const l = (max + min) / 2;
  let h = 0;
  let s = 0;
  if (max !== min) {
    const d = max - min;
    s = l > 0.5 ? d / (2 - max - min) : d / (max + min);
    if (max === rn) h = ((gn - bn) / d + (gn < bn ? 6 : 0)) * 60;
    else if (max === gn) h = ((bn - rn) / d + 2) * 60;
    else h = ((rn - gn) / d + 4) * 60;
  }
  return { h, s, l };
}

export function fromHsl({ h, s, l }: { h: number; s: number; l: number }): string {
  const sn = Math.max(0, Math.min(1, s));
  const ln = Math.max(0, Math.min(1, l));
  const c = (1 - Math.abs(2 * ln - 1)) * sn;
  const x = c * (1 - Math.abs(((h / 60) % 2) - 1));
  const m = ln - c / 2;
  let rgb: [number, number, number];
  if (h < 60) rgb = [c, x, 0];
  else if (h < 120) rgb = [x, c, 0];
  else if (h < 180) rgb = [0, c, x];
  else if (h < 240) rgb = [0, x, c];
  else if (h < 300) rgb = [x, 0, c];
  else rgb = [c, 0, x];
  return rgbToHex({
    r: (rgb[0] + m) * 255,
    g: (rgb[1] + m) * 255,
    b: (rgb[2] + m) * 255,
  });
}

/** 调整饱和度：amount > 0 提饱和，< 0 降饱和（-1 ~ 1） */
export function adjustSaturation(hex: string, amount: number): string {
  const hsl = toHsl(hex);
  return fromHsl({ ...hsl, s: Math.max(0, Math.min(1, hsl.s + amount)) });
}

/* ────────────────────── 对比度（WCAG） ────────────────────── */

/** WCAG 相对亮度 */
export function relativeLuminance(hex: string): number {
  const { r, g, b } = hexToRgb(hex);
  const f = (c: number) => {
    const s = c / 255;
    return s <= 0.03928 ? s / 12.92 : Math.pow((s + 0.055) / 1.055, 2.4);
  };
  return 0.2126 * f(r) + 0.7152 * f(g) + 0.0722 * f(b);
}

/** WCAG 对比度，1:1 ~ 21:1 */
export function contrastRatio(a: string, b: string): number {
  const l1 = relativeLuminance(a);
  const l2 = relativeLuminance(b);
  const [hi, lo] = l1 > l2 ? [l1, l2] : [l2, l1];
  return (hi + 0.05) / (lo + 0.05);
}

/** 判断底色是深是浅（按亮度 0.5 阈值） */
export function isDarkBackground(hex: string): boolean {
  return relativeLuminance(hex) < 0.32;
}

/**
 * 保证前景色在背景上达到最低对比度。
 *
 * 做法：沿着「远离背景」的方向逐步提亮/压暗，直到达标。
 * 深色底自动往亮处走，浅色底自动往暗处走 —— 这是用户手调最容易踩的坑
 * （深色主题下选了深蓝色标题，结果在深底上完全看不见）。
 */
export function ensureContrast(color: string, background: string, minRatio = 4.5): string {
  if (contrastRatio(color, background) >= minRatio) return color;

  const target = isDarkBackground(background) ? '#ffffff' : '#000000';
  let best = color;
  let bestRatio = contrastRatio(color, background);

  for (let step = 1; step <= 20; step++) {
    const ratio = step / 20;
    const candidate = mix(color, target, ratio);
    const cr = contrastRatio(candidate, background);
    if (cr > bestRatio) {
      best = candidate;
      bestRatio = cr;
    }
    if (cr >= minRatio) return candidate;
  }
  return best;
}

/* ────────────────────── 主色派生 ────────────────────── */

export interface DerivedScheme {
  /** 主题级三色 */
  secondaryColor: string;
  accentColor: string;
  /** 令牌级颜色（可直接 patch 到 theme.tokens） */
  tokens: Partial<ThemeTokens>;
}

export interface DeriveOptions {
  /** 主色，通常是强调色或用户选定的品牌色 */
  primary: string;
  /** 文章底色，用于判断深浅与对比度 */
  background: string;
  /** 正文文字色，用作「弱化色」的混合目标；不传则按背景深浅自动取 */
  textColor?: string;
  /** 代码块配色保持不变（true 时不产出 code* 系列） */
  keepCodeColors?: boolean;
}

const DEFAULT_DARK_TEXT = '#e2e8f0';
const DEFAULT_LIGHT_TEXT = '#222222';

/**
 * 由一个主色派生整套配色。
 *
 * 设计原则：
 *  - **装饰色**（引用边线、分隔线、列表符号、底色）直接取主色或其低透明度版本；
 *  - **文字色**（标题、链接、加粗）必须过对比度保护，深底自动提亮；
 *  - **辅助色**（斜体、图注、单元格文字）向正文色靠拢，避免整篇刺眼。
 */
export function deriveColorScheme(options: DeriveOptions): DerivedScheme {
  const { primary, background, keepCodeColors = true } = options;
  const dark = isDarkBackground(background);
  const text = options.textColor || (dark ? DEFAULT_DARK_TEXT : DEFAULT_LIGHT_TEXT);

  // 次要色：降低饱和度并向正文色靠一点，用作弱化元素。
  // 必须过对比度保护 —— 它会用在斜体等文字上，白底选浅色主色时尤其容易糊掉。
  const secondaryColor = ensureContrast(
    adjustSaturation(mix(primary, text, dark ? 0.45 : 0.35), -0.1),
    background,
    4.5
  );

  const strong = ensureContrast(primary, background, 4.5);
  const weak = ensureContrast(mix(primary, text, 0.3), background, 3);

  const tokens: Partial<ThemeTokens> = {
    // 标题：主色 + 对比保护
    headingColor: strong,
    h3Color: weak,
    // 行内强调
    strongColor: strong,
    emColor: ensureContrast(secondaryColor, background, 4.5),
    // 链接
    linkColor: strong,
    // 引用：边线用主色，底色用主色低透明度
    quoteTextColor: ensureContrast(text, background, 4.5),
    quoteBorderColor: primary,
    quoteBgColor: rgba(primary, dark ? 0.14 : 0.06),
    // 表格
    tableHeadColor: strong,
    tableHeadBgColor: rgba(primary, dark ? 0.16 : 0.09),
    tableCellColor: ensureContrast(text, background, 4.5),
    tableBorderColor: rgba(primary, dark ? 0.28 : 0.18),
    // 行内代码
    inlineCodeColor: strong,
    inlineCodeBgColor: rgba(primary, dark ? 0.18 : 0.1),
    // 装饰
    captionColor: ensureContrast(mix(primary, background, dark ? 0.45 : 0.5), background, 2.6),
    hrColor: rgba(primary, dark ? 0.5 : 0.35),
    listMarkerColor: primary,
  };

  return { secondaryColor, accentColor: primary, tokens };
}

/* ────────────────────── 预设色板 ────────────────────── */

export interface PalettePreset {
  id: string;
  name: string;
  color: string;
  /** 适配的底色倾向：light 只适合浅底，dark 只适合深底，both 通用 */
  fit: 'light' | 'dark' | 'both';
}

export const PALETTE_PRESETS: PalettePreset[] = [
  { id: 'wechat', name: '微信绿', color: '#07C160', fit: 'light' },
  { id: 'tech-blue', name: '科技蓝', color: '#2563EB', fit: 'both' },
  { id: 'navy', name: '商务藏青', color: '#1E40AF', fit: 'light' },
  { id: 'indigo', name: '学术靛', color: '#4338CA', fit: 'both' },
  { id: 'crimson', name: '中式朱红', color: '#C1272D', fit: 'both' },
  { id: 'jade', name: '墨玉青', color: '#0F766E', fit: 'both' },
  { id: 'orange', name: '暖阳橙', color: '#EA580C', fit: 'light' },
  { id: 'rose', name: '玫瑰粉', color: '#E11D48', fit: 'both' },
  { id: 'violet', name: '紫罗兰', color: '#7C3AED', fit: 'both' },
  { id: 'olive', name: '橄榄绿', color: '#4D7C0F', fit: 'light' },
  { id: 'amber', name: '琥珀', color: '#D97706', fit: 'light' },
  { id: 'slate', name: '石墨灰', color: '#334155', fit: 'both' },
  { id: 'cyan', name: '青碧', color: '#0891B2', fit: 'both' },
  { id: 'magenta', name: '品红', color: '#C026D3', fit: 'both' },
];

/** 按当前底色挑出合适的预设（both 的永远出现，light/dark 只在匹配时出现） */
export function presetsForBackground(background: string): PalettePreset[] {
  const dark = isDarkBackground(background);
  return PALETTE_PRESETS.filter((p) => p.fit === 'both' || (dark ? p.fit === 'dark' : p.fit === 'light'));
}