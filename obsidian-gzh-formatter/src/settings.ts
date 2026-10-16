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
  /** 图床上传接口；留空则图片自动退回 base64 内嵌 */
  uploadEndpoint: string;
  /** 图床返回相对路径时用于补全的域名；留空则取上传接口的 origin */
  uploadDomain: string;
  /** 上传时追加的查询参数，如 returnFormat=full */
  uploadQuery: string;
  /** 上传的文件字段名 */
  uploadField: string;
  /** 响应里图片链接的位置，如 url / data.url / 0.src */
  uploadResponsePath: string;
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
  uploadDomain: '',
  uploadQuery: '',
  uploadField: 'file',
  uploadResponsePath: 'url',
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
