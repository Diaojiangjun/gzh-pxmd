/**
 * 转义工具（全项目共享）
 *
 * 之前 `escapeHtml` 在 `mathExtension.ts` 里有一份、`gzhCompiler.ts` 里还手写了一份，
 * 容易失配；统一到这里。
 */

/** HTML 文本/属性转义（覆盖 & < > " ' 五个字符） */
export function escapeHtml(input: unknown): string {
  return String(input ?? '')
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#39;');
}

/** 判断 URL 是否为危险协议（会去掉空白与常见实体混淆后再判定） */
export function isDangerousUrl(raw: string): boolean {
  const normalized = String(raw ?? '')
    // 去掉所有空白与控制字符（浏览器解析 URL 时会忽略）
    .replace(/[\u0000-\u0020]/g, '')
    // 解码十进制/十六进制实体，防止 &#106;avascript: 这类混淆
    .replace(/&#x([0-9a-f]+);?/gi, (_, h) => String.fromCharCode(parseInt(h, 16)))
    .replace(/&#(\d+);?/g, (_, d) => String.fromCharCode(parseInt(d, 10)))
    .toLowerCase();

  return /^(javascript|vbscript|livescript|mocha|data:text\/html|data:application\/xhtml)/.test(
    normalized
  );
}

/** 链接地址净化：非安全协议一律降级为 `#` */
export function sanitizeHref(raw: unknown): string {
  const url = String(raw ?? '').trim();
  if (!url) return '#';
  if (isDangerousUrl(url)) return '#';
  // 只放行常见安全协议与相对路径/锚点
  if (!/^(https?:|mailto:|tel:|#|\/|\.\/|\.\.\/)/i.test(url)) return '#';
  return url.replace(/"/g, '%22').replace(/</g, '%3C').replace(/>/g, '%3E');
}
