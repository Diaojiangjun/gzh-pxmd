/**
 * 主题导出 / 分享码
 *
 * 用两条通道覆盖两种场景：
 *  1. **JSON 文件** —— 适合归档、批量导入、放进 Git 管理（与 ThemeManagerModal 的导入按钮闭环）；
 *  2. **分享码** —— 一段 `GZH-THEME-1:<base64url>` 文本，直接微信发同事，粘贴即导入。
 *
 * 选 base64url 而不是压缩：主题对象只有几百字节，压缩收益有限，
 * 而 base64url 无 `+ / =`，粘贴到聊天工具/URL 里不会被转义破坏。
 */
import { ThemeConfig } from '../types';

const PREFIX = 'GZH-THEME-1:';

/** 只保留主题本体字段，避免把 builtin / 临时状态带出去 */
function normalize(theme: ThemeConfig): ThemeConfig {
  const { id: _id, builtin: _builtin, ...rest } = theme;
  return { ...rest, builtin: false } as ThemeConfig;
}

function toBase64Url(text: string): string {
  const bytes = new TextEncoder().encode(text);
  let bin = '';
  for (const b of bytes) bin += String.fromCharCode(b);
  return btoa(bin).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '');
}

function fromBase64Url(text: string): string {
  const b64 = text.replace(/-/g, '+').replace(/_/g, '/');
  const padded = b64.padEnd(Math.ceil(b64.length / 4) * 4, '=');
  const bin = atob(padded);
  const bytes = Uint8Array.from(bin, (c) => c.charCodeAt(0));
  return new TextDecoder().decode(bytes);
}

/** 把主题编码为分享码 */
export function encodeThemeShare(theme: ThemeConfig): string {
  return PREFIX + toBase64Url(JSON.stringify(normalize(theme)));
}

/**
 * 解析分享码。
 *
 * 容错三种输入：带前缀的分享码、不带前缀的裸 base64、以及直接粘贴的 JSON 对象。
 * 解析失败一律返回 null，由调用方给出用户可读的提示。
 */
export function decodeThemeShare(code: string): ThemeConfig | null {
  const raw = code.trim();
  if (!raw) return null;

  // 1. 直接是 JSON
  if (raw.startsWith('{')) {
    try {
      return validate(JSON.parse(raw));
    } catch {
      return null;
    }
  }

  // 2. base64url（可选前缀）
  const body = raw.startsWith(PREFIX) ? raw.slice(PREFIX.length) : raw;
  try {
    const json = fromBase64Url(body);
    return validate(JSON.parse(json));
  } catch {
    return null;
  }
}

/** 结构校验：至少要有一个可用作主题的骨架 */
function validate(obj: any): ThemeConfig | null {
  if (!obj || typeof obj !== 'object') return null;
  if (typeof obj.name !== 'string' || !obj.name.trim()) return null;
  if (typeof obj.primaryColor !== 'string') return null;
  return { ...obj, id: `custom-${Date.now()}`, builtin: false } as ThemeConfig;
}

/** 触发浏览器下载主题 JSON 文件 */
export function downloadThemeJson(theme: ThemeConfig): void {
  const blob = new Blob([JSON.stringify(normalize(theme), null, 2)], {
    type: 'application/json',
  });
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = `${theme.name || 'theme'}.gzh-theme.json`;
  document.body.appendChild(a);
  a.click();
  document.body.removeChild(a);
  // 交给浏览器完成下载后再回收，立即 revoke 会让部分环境拿不到内容
  setTimeout(() => URL.revokeObjectURL(url), 4000);
}
