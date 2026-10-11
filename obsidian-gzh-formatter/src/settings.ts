import { DEFAULT_THEMES } from './core/defaultData';
import { TOKEN_PRESETS } from './core/themeTokens';
import type { ThemeConfig } from './core/types';
import type { ImageMode } from './imageAdapter';

/** 插件设置 —— Obsidian 会自动持久化到 vault 的 data.json */
export interface GzhFormatterSettings {
  /** 当前主题 id，对应 DEFAULT_THEMES 里的一项 */
  themeId: string;
  /** 图片处理：内嵌 base64 还是走图床换外链 */
  imageMode: ImageMode;
  /** 单张图片内嵌的体积上限（字节），超过就跳过并提示 */
  maxInlineKB: number;
  /** 图床上传函数占位（图床需要后端签名，插件内不内置密钥） */
  uploadEndpoint: string;
  /** 链接转脚注（公众号里脚注体验更好） */
  convertLinksToFootnotes: boolean;
  /** 复制后是否插入推广位 */
  appendPromo: boolean;
  /** 推广位内容（支持多行） */
  promoText: string;
}

export const DEFAULT_SETTINGS: GzhFormatterSettings = {
  themeId: DEFAULT_THEMES[0]?.id ?? 'classic',
  imageMode: 'inline',
  maxInlineKB: 400,
  convertLinksToFootnotes: true,
  appendPromo: false,
  promoText: '',
  uploadEndpoint: '',
};

export function resolveTheme(themeId: string): ThemeConfig {
  return DEFAULT_THEMES.find((t) => t.id === themeId) ?? DEFAULT_THEMES[0];
}

/** 全部可选主题 —— 设置面板下拉框用 */
export function allThemes(): ThemeConfig[] {
  return DEFAULT_THEMES;
}

/** 令牌预设 —— 用户也可以只套一个令牌组，再手动微调 */
export function tokenPresets(): Record<string, { label: string; tokens: Record<string, string> }> {
  return TOKEN_PRESETS as never;
}
