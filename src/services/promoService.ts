/**
 * 「我的推广位」配置与生成。
 *
 * 公众号作者几乎每篇文末都要放同一段关注引导，手工重复粘贴很容易漏改、
 * 也让正文变得难以维护。这里把公众号名、二维码、引导语存成一份配置，
 * 写作时一键插入到文末 —— 改一次配置，之后所有插入都是最新内容。
 *
 * 生成的是 `:::footer` 块：它天生居中排版，正好是署名区该有的样子，
 * 且内部支持 Markdown（图片、加粗）与主题令牌，能跟着主题一起换风格。
 */
import type { ThemeConfig } from '../types';

const PROMO_KEY = 'gzh_editor_promo_v1';

export interface PromoConfig {
  /** 写过一次配置后自动置为 true，用于判断「是否已配置」 */
  enabled: boolean;
  /** 公众号名称 */
  accountName: string;
  /** 二维码图片（dataURL 或图片直链） */
  qrImage: string;
  /** 署名区顶部标题，如「— 感谢您的细心阅读 —」 */
  footerTitle: string;
  /** 正文引导语，支持 Markdown */
  guideText: string;
  /** 二维码下方的一句话，如「扫码关注，每周更新」 */
  slogan: string;
}

export const DEFAULT_PROMO: PromoConfig = {
  enabled: false,
  accountName: '',
  qrImage: '',
  footerTitle: '— 感谢您的细心阅读 —',
  guideText: '如果这篇内容对你有帮助，欢迎**点赞**和**在看**。',
  slogan: '扫码关注，获取更多干货',
};

/** 二维码图片上限：localStorage 整体约 5MB，超了会连带影响文章与快照的写入 */
export const QR_MAX_BYTES = 400 * 1024;

export function getPromoConfig(): PromoConfig {
  try {
    const raw = localStorage.getItem(PROMO_KEY);
    if (!raw) return { ...DEFAULT_PROMO };
    const parsed = JSON.parse(raw);
    if (!parsed || typeof parsed !== 'object') return { ...DEFAULT_PROMO };
    // 与默认值合并：后续新增字段时老配置不会缺键
    return { ...DEFAULT_PROMO, ...parsed };
  } catch {
    return { ...DEFAULT_PROMO };
  }
}

export function savePromoConfig(cfg: PromoConfig): void {
  try {
    localStorage.setItem(PROMO_KEY, JSON.stringify(cfg));
  } catch (e) {
    console.warn('Failed to save promo config:', e);
  }
}

/** 是否已经填了足够生成推广位的内容 */
export function isPromoReady(cfg: PromoConfig): boolean {
  return Boolean(cfg.accountName.trim() || cfg.qrImage.trim());
}

/**
 * 生成可直接插入编辑器的 Markdown。
 *
 * 生成的顺序刻意是「标题 → 引导语 → 二维码 → 公众号名 → 一句话」：
 * 二维码前的引导语负责说服，二维码后的账号名负责让读者确认扫对了人。
 */
export function buildPromoMarkdown(cfg: PromoConfig): string {
  const lines: string[] = [];
  const name = cfg.accountName.trim();

  if (cfg.footerTitle.trim()) lines.push(`**${cfg.footerTitle.trim()}**`);
  if (cfg.guideText.trim()) lines.push('', cfg.guideText.trim());

  if (cfg.qrImage.trim()) {
    lines.push('', `![${name || '公众号二维码'}](${cfg.qrImage.trim()})`);
  }

  if (name) {
    lines.push('', `**关注「${name}」**`);
  }

  if (cfg.slogan.trim()) {
    lines.push('', cfg.slogan.trim());
  }

  if (lines.length === 0) lines.push('感谢阅读。');

  return [':::footer', ...lines, ':::'].join('\n');
}

/** 分析生成的 Markdown 在指定主题下的「实际效果」由编译器负责，这里只提供文案统计供 UI 展示 */
export function promoSummary(cfg: PromoConfig): { configured: boolean; hasQr: boolean; fields: number } {
  const fields = [cfg.accountName, cfg.qrImage, cfg.guideText, cfg.slogan, cfg.footerTitle].filter(
    (v) => v && v.trim()
  ).length;
  return { configured: isPromoReady(cfg), hasQr: Boolean(cfg.qrImage.trim()), fields };
}

/** 供 UI 显示：把主题信息编进预览用的说明（当前未使用，保留扩展位） */
export type PromoPreviewTheme = Pick<ThemeConfig, 'accentColor' | 'name'>;
