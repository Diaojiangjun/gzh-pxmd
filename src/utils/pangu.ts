/**
 * Pangu text spacing utility for Chinese/English/Numeric typography
 * Inserts proper spacing between CJK characters and Western words/numbers,
 * while safely preserving Markdown syntax, code blocks, links, and tags.
 */

export function panguFormat(text: string): string {
  if (!text) return '';

  // 占位符带随机 nonce：避免正文里恰好出现 ___CODE_BLOCK_0___ 这类文本时被错误还原
  const nonce = Math.random().toString(36).slice(2, 10);
  const codePrefix = `___CODE_${nonce}_`;
  const linkPrefix = `___LINK_${nonce}_`;

  // 1. Separate code blocks and HTML blocks so they are not altered
  const codeBlocks: string[] = [];
  let masked = text.replace(/(```[\s\S]*?```|`[^`\n]+`|:::[\s\S]*?:::|<[^>]+>)/g, (match) => {
    codeBlocks.push(match);
    return `${codePrefix}${codeBlocks.length - 1}___`;
  });

  // 2. Separate markdown links and images: [text](url) and ![alt](url)
  const linkBlocks: string[] = [];
  masked = masked.replace(/(!?\[[^\]]*\]\([^\)]+\))/g, (match) => {
    linkBlocks.push(match);
    return `${linkPrefix}${linkBlocks.length - 1}___`;
  });

  // 3. Spacing rules for CJK and Western characters:
  // CJK regex: \u4e00-\u9fa5\u3040-\u30ff
  // Western alphanumeric: a-zA-Z0-9

  // CJK followed by Western
  masked = masked.replace(/([\u4e00-\u9fa5\u3040-\u30ff])([a-zA-Z0-9$#%@+])/g, '$1 $2');

  // Western followed by CJK
  masked = masked.replace(/([a-zA-Z0-9$#%@+])([\u4e00-\u9fa5\u3040-\u30ff])/g, '$1 $2');

  // Fix spacing around parentheses containing English/numbers next to Chinese
  // e.g. 微信 (WeChat) 官方 -> 微信 (WeChat) 官方
  masked = masked.replace(/([\u4e00-\u9fa5])\(([a-zA-Z0-9\s]+)\)/g, '$1 ($2)');
  masked = masked.replace(/\(([a-zA-Z0-9\s]+)\)([\u4e00-\u9fa5])/g, '($1) $2');

  // Fix repeated exclamation / question marks in Chinese text
  masked = masked.replace(/([！？。，；：])\s+([！？。，；：])/g, '$1$2');

  // 4. Restore link blocks
  // 4. Restore link blocks（倒序精确替换，不做正则匹配，避免 nonce 含特殊字符）
  for (let i = linkBlocks.length - 1; i >= 0; i--) {
    const original = linkBlocks[i];
    // Within link text [text], we can format text without touching the (url)
    const formatted = original.replace(/^(!?\[)([^\]]+)(\]\([^\)]+\))$/, (__, p1, p2, p3) => {
      const formattedInner = p2
        .replace(/([\u4e00-\u9fa5])([a-zA-Z0-9])/g, '$1 $2')
        .replace(/([a-zA-Z0-9])([\u4e00-\u9fa5])/g, '$1 $2');
      return `${p1}${formattedInner}${p3}`;
    });
    masked = masked.split(`${linkPrefix}${i}___`).join(formatted);
  }

  // 5. Restore code blocks
  for (let i = codeBlocks.length - 1; i >= 0; i--) {
    masked = masked.split(`${codePrefix}${i}___`).join(codeBlocks[i]);
  }

  return masked;
}
