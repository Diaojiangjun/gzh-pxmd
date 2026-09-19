import { marked, Marked } from 'marked';
import { ThemeConfig, BackgroundSettings } from '../types';
import { escapeHtml, sanitizeHref } from '../utils/escape';
import { sanitizeHtml } from '../utils/sanitizeHtml';
import { applyCustomCss } from '../utils/customCss';
import { createMathExtensions, stripBreakBeforeInlineKatex } from './mathExtension';
import { resolveTokens, indentDecl, headingFontDecl, codePalette, type ResolvedTokens } from './themeTokens';

/**
 * Generate SVG background data URI based on BackgroundSettings
 */
export function generateBackgroundCss(bg: BackgroundSettings): {
  backgroundColor: string;
  backgroundImage?: string;
  backgroundSize?: string;
} {
  if (bg.type === 'none') {
    return { backgroundColor: bg.color || '#ffffff' };
  }

  const color = bg.color || '#ffffff';
  const patternColor = bg.patternColor || '#cbd5e1';
  const opacity = bg.opacity ?? 0.3;
  const scale = bg.scale || 24;

  if (bg.type === 'dot-grid') {
    const svg = `<svg xmlns="http://www.w3.org/2000/svg" width="${scale}" height="${scale}" viewBox="0 0 ${scale} ${scale}"><circle cx="${scale / 2}" cy="${scale / 2}" r="1.5" fill="${patternColor}" fill-opacity="${opacity}"/></svg>`;
    return {
      backgroundColor: color,
      backgroundImage: `url("data:image/svg+xml;utf8,${encodeURIComponent(svg)}")`,
      backgroundSize: `${scale}px ${scale}px`,
    };
  }

  if (bg.type === 'clean-grid') {
    const svg = `<svg xmlns="http://www.w3.org/2000/svg" width="${scale}" height="${scale}" viewBox="0 0 ${scale} ${scale}"><path d="M ${scale} 0 L 0 0 0 ${scale}" fill="none" stroke="${patternColor}" stroke-width="1" stroke-opacity="${opacity}"/></svg>`;
    return {
      backgroundColor: color,
      backgroundImage: `url("data:image/svg+xml;utf8,${encodeURIComponent(svg)}")`,
      backgroundSize: `${scale}px ${scale}px`,
    };
  }

  if (bg.type === 'diagonal-stripes') {
    const svg = `<svg xmlns="http://www.w3.org/2000/svg" width="${scale}" height="${scale}" viewBox="0 0 ${scale} ${scale}"><line x1="0" y1="0" x2="${scale}" y2="${scale}" stroke="${patternColor}" stroke-width="1" stroke-opacity="${opacity}"/></svg>`;
    return {
      backgroundColor: color,
      backgroundImage: `url("data:image/svg+xml;utf8,${encodeURIComponent(svg)}")`,
      backgroundSize: `${scale}px ${scale}px`,
    };
  }

  if (bg.type === 'paper-texture') {
    const svg = `<svg xmlns="http://www.w3.org/2000/svg" width="60" height="60" viewBox="0 0 60 60"><filter id="noise"><feTurbulence type="fractalNoise" baseFrequency="0.8" numOctaves="3" stitchTiles="stitch"/></filter><rect width="60" height="60" filter="url(#noise)" opacity="${opacity * 0.4}"/></svg>`;
    return {
      backgroundColor: color,
      backgroundImage: `url("data:image/svg+xml;utf8,${encodeURIComponent(svg)}")`,
    };
  }

  if (bg.type === 'warm-grain') {
    const svg = `<svg xmlns="http://www.w3.org/2000/svg" width="40" height="40" viewBox="0 0 40 40"><circle cx="10" cy="10" r="0.8" fill="${patternColor}" fill-opacity="${opacity}"/><circle cx="30" cy="30" r="0.8" fill="${patternColor}" fill-opacity="${opacity}"/></svg>`;
    return {
      backgroundColor: color,
      backgroundImage: `url("data:image/svg+xml;utf8,${encodeURIComponent(svg)}")`,
      backgroundSize: '40px 40px',
    };
  }

  return { backgroundColor: color };
}

/**
 * Helper to find matching closing parenthesis taking nested parens into account
 */
export function findMatchingParen(text: string, openParenIndex: number): number {
  let depth = 1;
  for (let i = openParenIndex + 1; i < text.length; i++) {
    const ch = text[i];
    if (ch === '(') {
      depth++;
    } else if (ch === ')') {
      depth--;
      if (depth === 0) {
        return i;
      }
    }
  }
  return -1;
}

/**
 * Sanitize and normalize SVG and data URLs (both percent-encoded, base64 and raw XML data URIs)
 * Prevents attribute quotes breaking HTML and unencoded parens/newlines breaking regex/markdown
 */
export function sanitizeSvgUrl(rawUrl: string): string {
  const trimmed = rawUrl.trim();
  if (!trimmed) return '';

  // Clean any internal whitespace or newlines from data URIs
  if (trimmed.startsWith('data:')) {
    if (trimmed.startsWith('data:image/svg+xml')) {
      const svgIdx = trimmed.indexOf('<svg');
      if (svgIdx !== -1) {
        let svg = trimmed.substring(svgIdx);
        // Clean trailing quotes/spaces
        svg = svg.trim().replace(/['"]+$/, '');
        const closeIdx = svg.lastIndexOf('</svg>');
        if (closeIdx !== -1) {
          svg = svg.substring(0, closeIdx + 6);
        }
        // Decode any existing entities/percent-escapes first
        try {
          svg = decodeURIComponent(svg);
        } catch {
          svg = svg.replace(/%23/g, '#').replace(/%20/g, ' ');
        }
        // Properly percent-encode SVG for valid Data URI, including parentheses
        const encoded = encodeURIComponent(svg)
          .replace(/\(/g, '%28')
          .replace(/\)/g, '%29')
          .replace(/'/g, '%27');
        return `data:image/svg+xml;utf8,${encoded}`;
      } else {
        // Already encoded data URI: ensure any raw parens or quotes are safe and newlines stripped
        return trimmed
          .replace(/\s+/g, '')
          .replace(/\(/g, '%28')
          .replace(/\)/g, '%29')
          .replace(/"/g, '%22');
      }
    }
    // Other data URIs (e.g. data:image/webp, png, jpeg, gif)
    return trimmed.replace(/\s+/g, '').replace(/"/g, '%22');
  }

  // Normal HTTP/HTTPS URLs
  return trimmed.replace(/\s+/g, '').replace(/"/g, '%22');
}

/**
 * Process all sticker tags and raw SVG/WebP image tags with balanced parentheses
 */
export function processStickerAndSvgTags(content: string): string {
  if (!content) return '';
  // 快路径：大多数文档既没有 sticker 语法也没有 data:image，
  // 直接返回，省掉一遍整篇正则扫描（该函数在一次编译里会被调用多次）
  if (!content.includes('![sticker:') && !content.includes('data:image')) return content;

  // 0. Pre-normalize any multiline or split markdown image/sticker syntax:
  // e.g. ![alt]\n(url) or ![alt] (url)
  const normalized = content.replace(/!\[([^\]]*)\]\s*\n+\s*\(/g, '![$1](');

  // 1. Process all ![sticker:...](...) tags with balanced parentheses
  const stickerPattern = /!\[sticker:(small|original)?:?([^\]]*)\]\s*\(/g;
  let result = '';
  let lastIndex = 0;
  let match: RegExpExecArray | null;

  while ((match = stickerPattern.exec(normalized)) !== null) {
    const startIndex = match.index;
    const mode = (match[1] as 'small' | 'original') || 'small';
    const alt = escapeHtml(match[2] ? match[2].trim() : '表情包');
    const openParenIdx = startIndex + match[0].length - 1;
    const closeParenIdx = findMatchingParen(normalized, openParenIdx);

    if (closeParenIdx !== -1) {
      const rawUrl = normalized.substring(openParenIdx + 1, closeParenIdx).trim();
      const safeUrl = sanitizeSvgUrl(rawUrl);

      result += normalized.substring(lastIndex, startIndex);
      if (mode === 'small') {
        result += `<img src="${safeUrl}" alt="${alt}" style="display: inline-block; width: 24px; height: 24px; vertical-align: -5px; margin: 0 3px; border-radius: 4px; object-fit: contain;" />`;
      } else {
        result += `\n<section style="text-align: center; margin: 18px 0;"><img src="${safeUrl}" alt="${alt}" style="display: block; margin: 0 auto; max-width: 220px; border-radius: 12px;" /></section>\n`;
      }
      lastIndex = closeParenIdx + 1;
      stickerPattern.lastIndex = lastIndex;
    } else {
      result += normalized.substring(lastIndex, openParenIdx + 1);
      lastIndex = openParenIdx + 1;
    }
  }
  result += normalized.substring(lastIndex);

  // 2. Also normalize any standard markdown image tags with data URIs or multi-line URLs
  const stdImgPattern = /!\[([^\]]*)\]\s*\(\s*(data:image\/[a-zA-Z0-9+.-]+;base64,|data:image\/svg\+xml)/g;
  let stdResult = '';
  let stdLastIndex = 0;
  let stdMatch: RegExpExecArray | null;

  while ((stdMatch = stdImgPattern.exec(result)) !== null) {
    const startIndex = stdMatch.index;
    const alt = stdMatch[1];
    const openParenIdx = startIndex + stdMatch[0].length - stdMatch[2].length - 1;
    const closeParenIdx = findMatchingParen(result, openParenIdx);

    if (closeParenIdx !== -1) {
      const rawUrl = result.substring(openParenIdx + 1, closeParenIdx).trim();
      const safeUrl = sanitizeSvgUrl(rawUrl);

      stdResult += result.substring(stdLastIndex, startIndex);
      stdResult += `![${alt}](${safeUrl})`;
      stdLastIndex = closeParenIdx + 1;
      stdImgPattern.lastIndex = stdLastIndex;
    } else {
      stdResult += result.substring(stdLastIndex, openParenIdx + 1);
      stdLastIndex = openParenIdx + 1;
    }
  }
  stdResult += result.substring(stdLastIndex);

  return stdResult;
}

/**
 * 支持的自定义块名（新增块时记得同步这里）
 */
export const KNOWN_CUSTOM_BLOCKS = [
  'hero',
  'toc',
  'quote',
  'callout',
  'footer',
  'timeline',
  'steps',
  'progress',
  'compare',
  'card',
  'themes',
] as const;

export interface BlockSyntaxError {
  /** 出错的块名，如 hero */
  blockName: string;
  /** 1-based 行号 */
  line: number;
  /** unclosed = 缺少结尾 :::；unknown = 块名拼错或暂不支持 */
  reason: 'unclosed' | 'unknown';
}

/**
 * 轻量语法体检：检测 :::xxx 自定义块的常见错误（未闭合 / 块名拼错或不支持）。
 * 仅用于给用户友好提示，不影响正常编译结果。
 */
export function validateCustomBlocks(markdown: string): BlockSyntaxError[] {
  const errors: BlockSyntaxError[] = [];
  const lines = markdown.split('\n');
  const stack: { name: string; line: number }[] = [];
  let inCodeFence = false;

  lines.forEach((raw, idx) => {
    const line = raw.trim();
    // 跳过代码块内的内容，避免误报
    if (line.startsWith('```')) {
      inCodeFence = !inCodeFence;
      return;
    }
    if (inCodeFence) return;

    const openMatch = line.match(/^:::\s*(\w+)/);
    if (openMatch) {
      const name = openMatch[1];
      if (!KNOWN_CUSTOM_BLOCKS.includes(name as (typeof KNOWN_CUSTOM_BLOCKS)[number])) {
        errors.push({ blockName: name, line: idx + 1, reason: 'unknown' });
      }
      stack.push({ name, line: idx + 1 });
    } else if (/^:::\s*$/.test(line)) {
      stack.pop(); // 闭合标签
    }
  });

  // 栈内剩余的都是未闭合的块
  stack.forEach((s) => errors.push({ blockName: s.name, line: s.line, reason: 'unclosed' }));

  return errors;
}

/**
 * 复用的 marked 实例：**带公式扩展**。
 *
 * 之前块内解析（:::card / :::callout / :::quote / GFM alert）走的是**全局 marked**，
 * 没有挂公式扩展，导致这些块里的 `$x$` / `$$...$$` 原样输出、不渲染；
 * 顺带也省掉每次编译都 `new Marked(...)` 的开销。
 */
let sharedMarked: Marked | null = null;

function sharedMd(): Marked {
  if (!sharedMarked) {
    sharedMarked = new Marked({
      gfm: true,
      breaks: true,
      extensions: createMathExtensions(),
    });
  }
  return sharedMarked;
}

/** marked.parseInline 的同步包装（marked v18 类型为 string | Promise<string>） */
function inlineMd(md: string): string {
  return sharedMd().parseInline(md) as string;
}

/**
 * 正文 / 块内共用的图片渲染。
 *
 * 抽出来是为了修一个真实缺陷：`:::card` / `:::footer` 这类块内部的图片
 * 原先走 marked 的**默认 renderer**，产出的 `<img>` 没有 `max-width`，
 * 在手机上会直接撑破屏幕宽度（二维码尤其明显）。
 */
function renderThemedImage(
  href: string,
  text: string | undefined,
  t: ResolvedTokens
): string {
  const safeHref = sanitizeSvgUrl(href);
  const centered = t.imageAlign === 'center';
  const border = t.imageBorder && t.imageBorder !== 'none' ? ` border: ${t.imageBorder};` : '';
  return `<section style="margin: 18px 0; text-align: ${t.imageAlign};">
  <img src="${safeHref}" alt="${escapeHtml(text || '')}" style="max-width: 100%; height: auto; border-radius: ${t.imageRadius};${border} margin: 0 ${centered ? 'auto' : '0'}; display: block;" />
  ${text ? `<span style="display: block; font-size: ${t.captionFontSize}; color: ${t.captionColor}; margin-top: 8px; text-align: ${t.imageAlign}; font-style: italic;">${escapeHtml(text)}</span>` : ''}
</section>`;
}

/**
 * 块内解析的当前主题上下文。
 *
 * blockMd 被 preprocessCustomBlocks 调用多次，逐处传参既啰嗦又容易漏；
 * 编译本身是同步串行的，用模块级变量在编译入口设置一次即可。
 */
let activeBlockCtx: ResolvedTokens | null = null;
let blockMarked: Marked | null = null;
let blockMarkedKey = '';

/** marked.parse 的同步包装（块内解析，图片跟随主题，其余保持 marked 默认） */
function blockMd(md: string): string {
  const ctx = activeBlockCtx;
  const key = ctx ? `${ctx.imageRadius}|${ctx.imageAlign}|${ctx.imageBorder}|${ctx.captionFontSize}|${ctx.captionColor}` : '';
  if (!blockMarked || blockMarkedKey !== key) {
    const renderer = new marked.Renderer();
    if (ctx) renderer.image = ({ href, text }) => renderThemedImage(href, text, ctx);
    blockMarked = new Marked({ gfm: true, breaks: true, extensions: createMathExtensions(), renderer });
    blockMarkedKey = key;
  }
  return blockMarked.parse(md) as string;
}

/**
 * :::compare 单元格切分。
 * 只把「不在行内代码里、且未被转义」的 `|` 当分隔符——
 * 否则 `含 \`a|b\` 的代码 | 正常` 这种写法会被错误拆成三列。
 */
function splitCompareCells(row: string): string[] {
  const cells: string[] = [];
  let current = '';
  let inCode = false;

  for (let i = 0; i < row.length; i++) {
    const ch = row[i];

    if (ch === '`') {
      inCode = !inCode;
      current += ch;
      continue;
    }
    if (ch === '\\' && row[i + 1] === '|') {
      current += '|';
      i++;
      continue;
    }
    if (ch === '|' && !inCode) {
      cells.push(current.trim());
      current = '';
      continue;
    }
    current += ch;
  }

  cells.push(current.trim());
  return cells;
}

/**
 * 微信兼容的「两列并排」布局
 *
 * 微信编辑器不支持 flex，且**会把 `<table>` 当成数据表格**：自动加边框、把列宽拉平，
 * 导致版式块（步骤/进度条/对比卡…）复制过去就变形。
 * 因此这里统一用 `inline-block` + 百分比宽度实现并排：
 *  - 父级 `font-size: 0; line-height: 0`  消除 inline-block 之间的空白间隙
 *  - 子级各自声明 `font-size` / `line-height`（否则继承 0 会看不见字）
 *  - `vertical-align: top` + `box-sizing: border-box` 保证对齐与内边距不撑宽
 */
function twoCols(
  leftHtml: string,
  rightHtml: string,
  leftWidthPercent: number,
  leftStyle: string,
  rightStyle: string
): string {
  const rightWidthPercent = 100 - leftWidthPercent;
  return (
    `<section style="margin: 0; padding: 0; font-size: 0; line-height: 0; text-align: left;">` +
    `<section style="display: inline-block; width: ${leftWidthPercent}%; vertical-align: top; box-sizing: border-box; ${leftStyle}">${leftHtml}</section>` +
    `<section style="display: inline-block; width: ${rightWidthPercent}%; vertical-align: top; box-sizing: border-box; ${rightStyle}">${rightHtml}</section>` +
    `</section>`
  );
}

/**
 * Pre-process custom block components (:::hero, :::toc, :::quote, :::callout, :::footer)
 */
function preprocessCustomBlocks(md: string, theme: ThemeConfig, t: ResolvedTokens): string {
  // 让块内解析（blockMd）能用上与正文一致的图片样式
  activeBlockCtx = t;

  // Pre-process stickers and images first so they are properly rendered even inside custom blocks
  let content = processStickerAndSvgTags(md);

  // 0.1 Process Ruby annotation: [文字]^(注音) 或 [文字]{注音}
  // 渲染为 <ruby>，公众号若剥离 ruby 标签会退化为「文字注音」，可读性不丢
  content = content.replace(/\[([^\[\]()]+)\]\^\(([^()]+)\)/g, (_, text: string, ruby: string) => {
    return `<ruby>${text}<rt>${ruby}</rt></ruby>`;
  });
  content = content.replace(/\[([^\[\]{}]+)\]\{([^{}]+)\}/g, (_, text: string, ruby: string) => {
    return `<ruby>${text}<rt>${ruby}</rt></ruby>`;
  });

  // 0.2 Process GFM alert blockquotes: > [!NOTE] / [!TIP] / [!WARNING] / [!IMPORTANT] / [!CAUTION]
  content = content.replace(
    /^>\s*\[!(NOTE|TIP|WARNING|IMPORTANT|CAUTION)\]\s*\n((?:>.*(?:\n|$))*)/gm,
    (_match, type: string, body: string) => {
      const meta: Record<string, { label: string; color: string; bg: string }> = {
        NOTE: { label: '提示', color: '#0969da', bg: '#ddf4ff' },
        TIP: { label: '技巧', color: '#1a7f37', bg: '#dafbe1' },
        WARNING: { label: '警告', color: '#9a6700', bg: '#fff8c5' },
        IMPORTANT: { label: '重要', color: '#8250df', bg: '#fbefff' },
        CAUTION: { label: '注意', color: '#cf222e', bg: '#ffebe9' },
      };
      const cfg = meta[type] || meta.NOTE;
      const inner = body
        .split('\n')
        .map((l: string) => l.replace(/^>\s?/, ''))
        .join('\n')
        .trim();
      return `\n<section style="margin: 18px 0; padding: 14px 18px; background-color: ${cfg.bg}; border-left: 4px solid ${cfg.color}; border-radius: 0 ${t.blockRadius} ${t.blockRadius} 0;">
  <section style="font-size: 13px; font-weight: bold; color: ${cfg.color}; margin-bottom: 6px; letter-spacing: 0.5px;">${cfg.label}</section>
  <section style="font-size: 14px; color: ${theme.primaryColor}; line-height: 1.7;">${blockMd(inner)}</section>
</section>\n`;
    }
  );

  // 1. Process Hero Header Block :::hero ... :::
  content = content.replace(/:::hero\s*([\s\S]*?):::/g, (_, inner) => {
    const lines = inner.trim().split('\n');
    let tag = '';
    let title = '';
    let quote = '';
    let author = '';

    for (const line of lines) {
      const trimmed = line.trim();
      if (trimmed.startsWith('[TAG]') || trimmed.startsWith('[CATEGORY]')) {
        tag = trimmed.replace(/^\[(TAG|CATEGORY)\]\s*/, '');
      } else if (trimmed.startsWith('# ')) {
        title = trimmed.replace(/^#\s*/, '');
      } else if (trimmed.startsWith('> ')) {
        quote = trimmed.replace(/^>\s*/, '');
      } else if (trimmed.length > 0) {
        author = trimmed;
      }
    }

    const tagHtml = tag
      ? `<section style="margin-bottom: 12px;"><span style="display: inline-block; background-color: ${theme.primaryColor}; color: #ffffff; font-size: 12px; font-weight: 600; padding: 3px 10px; border-radius: 20px; letter-spacing: 0.5px;">${escapeHtml(tag)}</span></section>`
      : '';

    const titleHtml = title
      ? `<h1 style="font-size: ${t.h1Size}; font-weight: bold; color: ${t.headingColor}; line-height: 1.4; margin: 0 0 14px 0; letter-spacing: 0.5px; ${headingFontDecl(t)}">${escapeHtml(title)}</h1>`
      : '';

    const quoteHtml = quote
      ? `<section style="font-size: ${t.quoteFontSize}; color: ${t.quoteTextColor}; line-height: 1.6; border-left: 3px solid ${t.quoteBorderColor}; padding-left: 12px; margin: 12px 0; font-style: italic; background-color: ${t.quoteBgColor}; padding: 8px 12px; border-radius: 0 6px 6px 0;">${escapeHtml(quote)}</section>`
      : '';

    const authorHtml = author
      ? `<section style="font-size: ${t.captionFontSize}; color: ${t.captionColor}; margin-top: 12px; line-height: 1.6;">${escapeHtml(author)}</section>`
      : '';

    return `\n<section style="margin: 20px 0 28px 0; padding: 22px 20px; background-color: ${theme.backgroundColor}; border: 1px solid ${t.tableBorderColor}; border-radius: ${t.blockRadius};">
  ${tagHtml}
  ${titleHtml}
  ${quoteHtml}
  ${authorHtml}
</section>\n`;
  });

  // 2. Process TOC Block :::toc ... :::
  content = content.replace(/:::toc\s*([\s\S]*?):::/g, (_, inner) => {
    const items = inner
      .trim()
      .split('\n')
      .filter((l: string) => l.trim().length > 0)
      .map((l: string) => {
        const text = l.trim().replace(/^\d+\.\s*/, '');
        // 悬挂缩进代替 flex：微信不支持 flex，会退化成上下堆叠
        return `<section style="margin: 6px 0; padding-left: 20px; text-indent: -20px; font-size: 14px; color: ${theme.primaryColor}; line-height: 1.7;"><span style="color: ${theme.accentColor}; font-weight: bold; margin-right: 8px; font-size: 12px;">●</span>${escapeHtml(text)}</section>`;
      })
      .join('');

    return `\n<section style="margin: 20px 0; padding: 18px 20px; background: ${t.quoteBgColor}; border-left: 4px solid ${t.quoteBorderColor}; border-radius: 0 ${t.blockRadius} ${t.blockRadius} 0;">
  <section style="font-size: 14px; font-weight: bold; color: ${theme.primaryColor}; margin-bottom: 10px; letter-spacing: 0.5px;">
    <span style="display: inline-block; width: 6px; height: 6px; background-color: ${theme.accentColor}; border-radius: 50%; margin-right: 8px; vertical-align: middle;">&nbsp;</span>本文导读目录
  </section>
  ${items}
</section>\n`;
  });

  // 3. Process Quote Block :::quote ... :::
  // 微信会剥离 position 与负 margin，引号装饰改用正常间距摆位
  content = content.replace(/:::quote\s*([\s\S]*?):::/g, (_, inner) => {
    return `\n<section style="margin: 24px 0; padding: 18px 24px; background-color: ${t.quoteBgColor}; border-left: 4px solid ${t.quoteBorderColor}; border-radius: 0 ${t.blockRadius} ${t.blockRadius} 0;">
  <span style="font-size: 30px; line-height: 0.6; color: ${t.quoteBorderColor}; opacity: 0.4; font-family: Georgia, serif; display: block;">“</span>
  <section style="font-size: ${theme.fontSize}; color: ${t.quoteTextColor}; line-height: 1.8; font-style: italic; letter-spacing: 0.5px; margin: 6px 0;">
    ${inlineMd(inner.trim())}
  </section>
  <span style="font-size: 30px; line-height: 0.6; color: ${t.quoteBorderColor}; opacity: 0.4; font-family: Georgia, serif; display: block; text-align: right;">”</span>
</section>\n`;
  });

  // 4. Process Callout Block :::callout ... :::
  content = content.replace(/:::callout\s*([\s\S]*?):::/g, (_, inner) => {
    return `\n<section style="margin: 22px 0; padding: 16px 20px; background-color: ${theme.backgroundColor}; border: 1.5px dashed ${t.quoteBorderColor}; border-radius: ${t.blockRadius};">
  <section style="font-size: 14px; color: ${theme.primaryColor}; line-height: 1.7;">
    ${blockMd(inner.trim())}
  </section>
</section>\n`;
  });

  // 5. Process Footer Block :::footer ... :::
  content = content.replace(/:::footer\s*([\s\S]*?):::/g, (_, inner) => {
    return `\n<section style="margin: 36px 0 20px 0; padding: 24px 20px; background-color: ${t.quoteBgColor}; border-radius: ${t.blockRadius}; text-align: center; border-top: 1px solid ${t.tableBorderColor};">
  <section style="font-size: 14px; color: ${theme.secondaryColor}; line-height: 1.7;">
    ${blockMd(inner.trim())}
  </section>
</section>\n`;
  });

  // 5.1 Process Timeline Block :::timeline ... :::（每行：`时间 · 事件`）
  // 微信不支持 position / 负 margin 技巧，用「悬挂缩进」让圆点与文字对齐
  content = content.replace(/:::timeline\s*([\s\S]*?):::/g, (_, inner) => {
    const DOT = 10;
    const GAP = 12;
    const indent = DOT + GAP;
    const items = inner
      .trim()
      .split('\n')
      .map((l: string) => l.trim())
      .filter((l: string) => l.length > 0)
      .map((l: string) => {
        const sep = l.indexOf('·');
        const time = sep !== -1 ? l.slice(0, sep).trim() : '';
        const event = sep !== -1 ? l.slice(sep + 1).trim() : l;
        const timeHtml = time
          ? `<strong style="color: ${theme.accentColor}; margin-right: 8px; font-size: 13px; font-weight: bold; letter-spacing: 0.5px;">${escapeHtml(time)}</strong>`
          : '';
        return `<section style="margin: 0 0 14px 0; padding: 1px 0 1px ${indent}px; text-indent: -${indent}px; border-left: 2px solid ${t.quoteBorderColor}; color: ${theme.primaryColor}; font-size: 14px; line-height: 1.75;">
  <span style="display: inline-block; width: ${DOT}px; height: ${DOT}px; background-color: ${theme.primaryColor}; border-radius: 50%; margin-right: ${GAP}px; vertical-align: middle;">&nbsp;</span>${timeHtml}<span>${inlineMd(event)}</span>
</section>`;
      })
      .join('');

    return `\n<section style="margin: 22px 0; padding: 8px 4px;">
  ${items}
</section>\n`;
  });

  // 5.2 Process Steps Block :::steps ... :::（每行一个步骤）
  // 微信不支持 flex，表格又会被加边框 → 用「悬挂缩进 + 圆形编号」
  content = content.replace(/:::steps\s*([\s\S]*?):::/g, (_, inner) => {
    const BADGE = 26;
    const GAP = 12;
    const indent = BADGE + GAP;
    const steps = inner
      .trim()
      .split('\n')
      .map((l: string) => l.trim())
      .filter((l: string) => l.length > 0)
      .map((l: string, idx: number) => {
        const text = l.replace(/^(第[一二三四五六七八九十]+步[:：]|\d+[.、)]\s*)/, '').trim();
        return `<section style="margin: 0 0 12px 0; padding-left: ${indent}px; text-indent: -${indent}px; color: ${theme.primaryColor}; font-size: 14px; line-height: 1.75;">
  <span style="display: inline-block; width: ${BADGE}px; height: ${BADGE}px; line-height: ${BADGE}px; text-align: center; background-color: ${theme.accentColor}; color: #ffffff; border-radius: 50%; font-size: 13px; font-weight: bold; margin-right: ${GAP}px; vertical-align: middle;">${idx + 1}</span>${inlineMd(text)}
</section>`;
      })
      .join('');

    return `\n<section style="margin: 22px 0; padding: 14px 18px; background-color: ${theme.backgroundColor}; border: 1px solid ${t.tableBorderColor}; border-radius: ${t.blockRadius};">
  ${steps}
</section>\n`;
  });

  // 5.3 Process Progress Block :::progress ... :::（每行：`百分比 · 标签`）
  // 微信不支持 flex / linear-gradient，表格又会被加边框
  // → 标签行用 inline-block 两列；进度条用两段 border-bottom 上色
  content = content.replace(/:::progress\s*([\s\S]*?):::/g, (_, inner) => {
    const bars = inner
      .trim()
      .split('\n')
      .map((l: string) => l.trim())
      .filter((l: string) => l.length > 0)
      .map((l: string) => {
        const sep = l.indexOf('·');
        const pctRaw = sep !== -1 ? l.slice(0, sep).trim().replace(/%/g, '') : l.replace(/%/g, '').trim();
        const pct = Math.max(0, Math.min(100, parseInt(pctRaw, 10) || 0));
        const label = sep !== -1 ? l.slice(sep + 1).trim() : '';

        const labelRow = twoCols(
          inlineMd(label),
          `${pct}%`,
          72,
          `font-size: 13px; line-height: 1.6; color: ${theme.primaryColor}; padding: 0;`,
          `font-size: 13px; line-height: 1.6; font-weight: bold; color: ${theme.accentColor}; text-align: right; padding: 0;`
        );

        // 进度条：用 border-bottom 的粗细当条高，纯色、无渐变、无空元素高度依赖
        const rest = 100 - pct;
        const bar =
          `<section style="margin: 6px 0 0 0; padding: 0; font-size: 0; line-height: 10px; text-align: left;">` +
          `<span style="display: inline-block; width: ${pct}%; border-bottom: 10px solid ${theme.accentColor}; border-radius: ${rest > 0 ? '5px 0 0 5px' : '5px'}; font-size: 0; line-height: 0;">&nbsp;</span>` +
          (rest > 0
            ? `<span style="display: inline-block; width: ${rest}%; border-bottom: 10px solid ${t.tableBorderColor}; border-radius: 0 5px 5px 0; font-size: 0; line-height: 0;">&nbsp;</span>`
            : '') +
          `</section>`;

        return `<section style="margin: 14px 0;">${labelRow}${bar}</section>`;
      })
      .join('');

    return `\n<section style="margin: 22px 0; padding: 16px 20px; background-color: ${theme.backgroundColor}; border: 1px solid ${t.tableBorderColor}; border-radius: ${t.blockRadius};">
  ${bars}
</section>\n`;
  });

  // 5.4 Process Compare Block :::compare ... :::（每行：`左 | 右`）
  // 微信不支持 flex（会退化成上下堆叠），表格又会被加边框/拉平列宽
  // → 用 inline-block + 百分比宽度做两列并排
  content = content.replace(/:::compare\s*([\s\S]*?):::/g, (_, inner) => {
    const rows = inner
      .trim()
      .split('\n')
      .map((l: string) => l.trim())
      .filter((l: string) => l.length > 0);
    const header = rows[0] ? splitCompareCells(rows[0]) : ['', ''];
    const bodyRows = rows.slice(1);
    // 超过 2 段时把多余内容并入右列，避免用户多写一个 `|` 就静默丢内容
    const leftOf = (cells: string[]) => (cells[0] || '');
    const rightOf = (cells: string[]) =>
      cells.length > 2 ? cells.slice(1).join(' | ') : cells[1] || '';

    const headerRow = twoCols(
      inlineMd(leftOf(header).trim()),
      inlineMd(rightOf(header).trim()),
      50,
      `padding: 12px 8px; text-align: center; font-size: ${t.tableFontSize}; line-height: 1.6; font-weight: bold; color: ${t.tableHeadColor}; background-color: ${t.tableHeadBgColor}; border-bottom: 2px solid ${theme.primaryColor}; border-right: 1px solid ${t.tableBorderColor};`,
      `padding: 12px 8px; text-align: center; font-size: ${t.tableFontSize}; line-height: 1.6; font-weight: bold; color: ${t.tableHeadColor}; background-color: ${t.tableHeadBgColor}; border-bottom: 2px solid ${theme.primaryColor};`
    );

    const bodyRowsHtml = bodyRows
      .map((row: string) => {
        const cells = splitCompareCells(row);
        return twoCols(
          inlineMd(leftOf(cells).trim()),
          inlineMd(rightOf(cells).trim()),
          50,
          `padding: 10px 8px; text-align: center; font-size: 13px; line-height: 1.65; color: ${t.tableCellColor}; border-bottom: 1px solid ${t.tableBorderColor}; border-right: 1px solid ${t.tableBorderColor};`,
          `padding: 10px 8px; text-align: center; font-size: 13px; line-height: 1.65; color: ${t.tableCellColor}; border-bottom: 1px solid ${t.tableBorderColor};`
        );
      })
      .join('');

    return `\n<section style="margin: 22px 0; padding: 4px 0; background-color: ${theme.backgroundColor}; border: 1px solid ${t.tableBorderColor}; border-radius: ${t.blockRadius}; overflow: hidden;">
  ${headerRow}
  ${bodyRowsHtml}
</section>\n`;
  });

  // 5.5 Process Card Block :::card ... :::（首行标题，其余正文）
  // 微信不支持 linear-gradient / box-shadow，改用纯色背景 + 无阴影
  content = content.replace(/:::card\s*([\s\S]*?):::/g, (_, inner) => {
    const lines = inner.trim().split('\n');
    const title = lines[0]?.trim() || '';
    const body = lines.slice(1).join('\n').trim();
    const titleHtml = title
      ? `<section style="font-size: 15px; font-weight: bold; color: ${theme.primaryColor}; line-height: 1.5; margin-bottom: 8px;">${inlineMd(title)}</section>`
      : '';
    const bodyHtml = body
      ? `<section style="font-size: 14px; color: ${theme.secondaryColor}; line-height: 1.7;">${blockMd(body)}</section>`
      : '';

    return `\n<section style="margin: 20px 0; padding: 18px 20px; background-color: ${theme.backgroundColor}; border: 1px solid ${t.tableBorderColor}; border-radius: ${t.blockRadius};">
  <span style="display: block; width: 32px; height: 4px; background-color: ${theme.accentColor}; border-radius: 2px; margin-bottom: 12px;"></span>
  ${titleHtml}
  ${bodyHtml}
</section>\n`;
  });

  // 5.6 Process Themes Block :::themes ... :::（每行：`标签 | 描述`）
  // 专门用于替代 markdown 加粗列表（避免微信对 <li><strong>:文字</strong> 自动换行的硬限制）
  // 微信会给表格加边框 → 用「徽章 inline-block + 悬挂缩进」
  content = content.replace(/:::themes\s*([\s\S]*?):::/g, (_, inner) => {
    const BADGE_W = 104;
    const GAP = 12;
    const indent = BADGE_W + GAP;
    const rows = inner
      .trim()
      .split('\n')
      .map((l: string) => l.trim())
      .filter((l: string) => l.length > 0)
      .map((l: string, idx: number) => {
        const sepIdx = l.indexOf('|');
        const label = sepIdx !== -1 ? l.slice(0, sepIdx).trim() : l;
        const desc = sepIdx !== -1 ? l.slice(sepIdx + 1).trim() : '';
        // 第一个标签用主题色实心徽章，其余用描边徽章，形成层次
        const badgeStyle =
          idx === 0
            ? `background-color: ${theme.accentColor}; color: #ffffff;`
            : `background-color: ${theme.backgroundColor}; color: ${theme.primaryColor}; border: 1px solid ${theme.accentColor};`;
        const badge = `<span style="display: inline-block; width: ${BADGE_W}px; box-sizing: border-box; text-align: center; padding: 3px 0; border-radius: 4px; font-size: 13px; font-weight: bold; letter-spacing: 0.5px; line-height: 1.5; margin-right: ${GAP}px; vertical-align: top; ${badgeStyle}">${inlineMd(label)}</span>`;
        return `<section style="margin: 0 0 12px 0; padding-left: ${indent}px; text-indent: -${indent}px; color: ${theme.secondaryColor}; font-size: 14px; line-height: 1.75;">
  ${badge}<span>${inlineMd(desc)}</span>
</section>`;
      })
      .join('');

    return `\n<section style="margin: 22px 0;">
  ${rows}
</section>\n`;
  });

  // 6. Process Sticker Tags & SVG Data URIs
  content = processStickerAndSvgTags(content);

  return content;
}

/**
 * Heading styled markup depending on theme.headingStyle
 *
 * 所有字号 / 颜色 / 间距 / 字体均取自主题令牌（themeTokens.ts），
 * 不在本函数内写死任何视觉值。
 */
function renderHeading(level: number, text: string, theme: ThemeConfig, t: ResolvedTokens): string {
  const headingFont = headingFontDecl(t);

  if (level === 1) {
    return `<h1 style="font-size: ${t.h1Size}; font-weight: bold; color: ${t.headingColor}; line-height: 1.4; margin: ${t.h1MarginTop} 0 ${t.h1MarginBottom} 0; letter-spacing: 0.5px; border-bottom: 2px solid ${theme.accentColor}; padding-bottom: 8px; ${headingFont}">${text}</h1>`;
  }

  if (level === 2) {
    const base = `font-size: ${t.h2Size}; font-weight: bold; color: ${t.headingColor}; margin: ${t.h2MarginTop} 0 ${t.h2MarginBottom} 0; letter-spacing: 0.5px; ${headingFont}`;

    switch (theme.headingStyle) {
      case 'badge-number':
        return `<h2 style="${base}"><span style="display: inline-block; background-color: ${theme.accentColor}; color: #ffffff; padding: 2px 8px; border-radius: 4px; font-size: 13px; margin-right: 8px; font-weight: bold; vertical-align: middle;">§</span>${text}</h2>`;

      case 'double-bracket':
        return `<h2 style="${base} text-align: center; letter-spacing: 1px;"><span style="color: ${theme.accentColor}; margin-right: 6px;">【</span>${text}<span style="color: ${theme.accentColor}; margin-left: 6px;">】</span></h2>`;

      case 'capsule-tag':
        return `<h2 style="${base}"><span style="display: inline-block; border-left: 4px solid ${theme.primaryColor}; padding-left: 10px; border-bottom: 2px solid ${theme.accentColor}; padding-bottom: 4px;">${text}</span></h2>`;

      case 'bottom-underline':
        return `<h2 style="${base}"><span style="display: inline-block; border-bottom: 3px solid ${theme.accentColor}; padding-bottom: 4px;">${text}</span></h2>`;

      case 'mac-window':
        return `<h2 style="${base}"><span style="display: inline-block; width: 10px; height: 10px; background-color: ${theme.accentColor}; border-radius: 50%; margin-right: 8px; vertical-align: middle;">&nbsp;</span>${text}</h2>`;

      case 'left-accent-bar':
      default:
        return `<h2 style="${base} border-left: 4px solid ${theme.accentColor}; padding-left: 10px; line-height: 1.4;">${text}</h2>`;
    }
  }

  // Level 3
  return `<h3 style="font-size: ${t.h3Size}; font-weight: bold; color: ${t.h3Color}; margin: ${t.h3MarginTop} 0 ${t.h3MarginBottom} 0; letter-spacing: 0.4px; ${headingFont}"><span style="color: ${theme.accentColor}; margin-right: 6px;">▸</span>${text}</h3>`;
}

export interface CompilerOptions {
  convertLinksToFootnotes?: boolean;
}

/**
 * Custom Marked Renderer to guarantee strict WeChat-safe inline styles
 */
function createWechatRenderer(
  theme: ThemeConfig,
  t: ResolvedTokens,
  footnotes: Array<{ index: number; text: string; href: string }>,
  convertLinksToFootnotes: boolean
) {
  const renderer = new marked.Renderer();

  renderer.heading = function (token: any) {
    const text = token.tokens && this.parser ? this.parser.parseInline(token.tokens) : token.text;
    return renderHeading(token.depth, text, theme, t);
  };

  renderer.paragraph = function (token: any) {
    const text = token.tokens && this.parser ? this.parser.parseInline(token.tokens) : token.text;
    return `<p style="font-size: ${theme.fontSize}; color: ${theme.primaryColor}; line-height: ${theme.lineHeight}; margin: 0 0 ${t.paragraphSpacing} 0; letter-spacing: ${theme.letterSpacing}; word-break: break-word; text-align: ${t.textAlign}; ${indentDecl(t)}">${text}</p>`;
  };

  renderer.blockquote = function (token: any) {
    const inner = token.tokens && this.parser ? (this.parser.parse(token.tokens) as string) : token.text;
    // 引用块内部段落清零段首缩进：缩进是「正文段落」的排版约定，
    // 引用块本身就是缩进块，再缩一次会层次混乱（原靠主题 customCss 打补丁，
    // 现在令牌化后必须在渲染期处理，否则任何开了缩进的主题都会踩到）。
    const text = String(inner).replace(/text-indent:[^;"]+;/g, 'text-indent: 0;');
    return `<blockquote style="margin: 20px 0; padding: 12px 18px; border-left: 3.5px solid ${t.quoteBorderColor}; background-color: ${t.quoteBgColor}; border-radius: 0 ${t.blockRadius} ${t.blockRadius} 0; color: ${t.quoteTextColor}; font-size: ${t.quoteFontSize}; line-height: 1.75; font-style: italic;">${text}</blockquote>`;
  };

  // 列表：原生 ul/ol + 内联 list-style-type（微信可直接保留符号）
  // ⚠️ 不要用 <table> 渲染列表——微信会给表格加边框、列宽也会被重排，结构全乱
  (renderer as any).list = function (token: any) {
    const ordered = !!token.ordered;
    const start = token.start || 1;
    const tag = ordered ? 'ol' : 'ul';
    const listStyleType = ordered ? 'decimal' : 'disc';
    const parser = this.parser;

    const items = (token.items || [])
      .map((item: any) => {
        const tokens: any[] = item.tokens || [];

        // 把 list item 里的 text/paragraph 直接内联渲染（不包 <p>）：
        // 微信在 <li> 内含块级元素时容易丢列表符号
        const isInlineToken = (t: any) => t.type === 'text' || t.type === 'paragraph';
        let inner = '';
        let prevInline = false;

        if (!parser || tokens.length === 0) {
          inner = item.text || '';
        } else {
          for (const t of tokens) {
            if (isInlineToken(t)) {
              const seg = t.tokens ? parser.parseInline(t.tokens) : t.text || '';
              if (prevInline && seg) inner += '<br>';
              inner += seg;
              prevInline = true;
            } else {
              // 嵌套列表 / 代码块等块级内容原样渲染
              inner += parser.parse([t]);
              prevInline = false;
            }
          }
        }

        const isInline = !parser || tokens.length === 0 || tokens.every(isInlineToken);
        // 符号颜色取 <li> 的 color（::marker 跟随 li 颜色），正文再套一层主色
        const body = isInline ? `<span style="color: ${theme.primaryColor};">${inner}</span>` : inner;

        return `<li style="margin: 6px 0; color: ${t.listMarkerColor}; list-style-type: ${listStyleType}; font-size: ${theme.fontSize}; line-height: ${theme.lineHeight};">${body}</li>`;
      })
      .join('');

    const startAttr = ordered && start !== 1 ? ` start="${start}"` : '';
    return `<${tag}${startAttr} style="margin: 12px 0 ${t.paragraphSpacing} 0; padding-left: 1.7em; list-style-type: ${listStyleType}; list-style-position: outside; color: ${theme.primaryColor}; font-size: ${theme.fontSize}; line-height: ${theme.lineHeight};">${items}</${tag}>`;
  };

  renderer.listitem = function (token: any) {
    // 正常路径由上面的 list renderer 处理；这里作为兜底
    return token.tokens && this.parser ? this.parser.parse(token.tokens) : (token.text || '');
  };

  renderer.hr = () => {
    // 微信不支持 position/transform，分隔线只能用「居中文字」或「纯色边框」表达。
    // 三种样式（星标 / 实线 / 虚线）都只用微信允许的属性，复制后不会变形。
    if (t.hrStyle === 'solid') {
      return `<hr style="border: none; border-top: 1px solid ${t.hrColor}; margin: 28px 0; height: 0;" />`;
    }
    if (t.hrStyle === 'dashed') {
      return `<hr style="border: none; border-top: 1px dashed ${t.hrColor}; margin: 28px 0; height: 0;" />`;
    }
    return `<section style="margin: 28px auto; text-align: center; color: ${t.hrColor}; font-size: 12px; letter-spacing: 8px;">✦ ✦ ✦</section>`;
  };

  renderer.strong = function (token: any) {
    const text = token.tokens && this.parser ? this.parser.parseInline(token.tokens) : token.text;
    // 微信对 8 位 hex 色（带透明度）支持不稳定，改用纯色
    return `<strong style="font-weight: bold; color: ${t.strongColor};">${text}</strong>`;
  };

  renderer.em = function (token: any) {
    const text = token.tokens && this.parser ? this.parser.parseInline(token.tokens) : token.text;
    return `<em style="font-style: italic; color: ${t.emColor};">${text}</em>`;
  };

  renderer.codespan = ({ text }) => {
    return `<code style="font-family: ${t.monoFontFamily}; font-size: ${t.inlineCodeFontSize}; background-color: ${t.inlineCodeBgColor}; color: ${t.inlineCodeColor}; padding: 2px 6px; border-radius: 4px; margin: 0 2px; border: 1px solid rgba(0,0,0,0.04);">${escapeHtml(text)}</code>`;
  };

  renderer.code = ({ text, lang }) => {
    // Escape HTML inside code
    const escapedText = text
      .replace(/&/g, '&amp;')
      .replace(/</g, '&lt;')
      .replace(/>/g, '&gt;');

    // 圆点栏可关闭（部分用户希望代码块更「克制」）
    const barHtml = t.codeShowBar
      ? `  <section style="padding: 8px 12px; background-color: ${t.codeBarBgColor}; border-bottom: 1px solid ${codePalette(theme).border}; font-size: 0; line-height: 16px;">
    <span style="display: inline-block; width: 11px; height: 11px; border-radius: 50%; background-color: #ff5f56; margin-right: 6px; font-size: 0; line-height: 0; vertical-align: middle;">&nbsp;</span>
    <span style="display: inline-block; width: 11px; height: 11px; border-radius: 50%; background-color: #ffbd2e; margin-right: 6px; font-size: 0; line-height: 0; vertical-align: middle;">&nbsp;</span>
    <span style="display: inline-block; width: 11px; height: 11px; border-radius: 50%; background-color: #27c93f; font-size: 0; line-height: 0; vertical-align: middle;">&nbsp;</span>
    <span style="display: inline-block; margin-left: 8px; font-size: 11px; line-height: 16px; font-family: ${t.monoFontFamily}; font-weight: 600; color: ${codePalette(theme).langText}; text-transform: uppercase; letter-spacing: 0.5px; vertical-align: middle;">${escapeHtml(lang || 'CODE')}</span>
  </section>
`
      : '';

    return `<section style="margin: 22px 0; border-radius: ${t.codeBlockRadius}; overflow: hidden; border: 1px solid ${codePalette(theme).border};">
${barHtml}  <pre style="margin: 0; padding: 14px 16px; background-color: ${t.codeBgColor}; color: ${t.codeTextColor}; font-family: ${t.monoFontFamily}; font-size: ${t.codeFontSize}; line-height: 1.65; overflow-x: auto; white-space: pre-wrap; word-break: break-all;"><code>${escapedText}</code></pre>
</section>`;
  };

  (renderer as any).table = function (token: any) {
    const self: any = this;
    let headerHtml = '';
    let bodyHtml = '';

    if (token.header && Array.isArray(token.header)) {
      const cells = token.header
        .map(
          (c: any) =>
            `<th style="padding: 10px 14px; background-color: ${t.tableHeadBgColor}; font-weight: bold; color: ${t.tableHeadColor}; border-right: 1px solid ${t.tableBorderColor};">${c.tokens && self.parser ? self.parser.parseInline(c.tokens) : escapeHtml(c.text ?? c)}</th>`
        )
        .join('');
      headerHtml = `<tr>${cells}</tr>`;
    }

    if (token.rows && Array.isArray(token.rows)) {
      bodyHtml = token.rows
        .map((row: any[]) => {
          const cells = row
            .map(
              (c: any) =>
                `<td style="padding: 10px 14px; color: ${t.tableCellColor}; border-right: 1px solid ${t.tableBorderColor}; border-top: 1px solid ${t.tableBorderColor};">${c.tokens && self.parser ? self.parser.parseInline(c.tokens) : escapeHtml(c.text ?? c)}</td>`
            )
            .join('');
          return `<tr>${cells}</tr>`;
        })
        .join('');
    }

    return `<section style="margin: 20px 0; overflow-x: auto; -webkit-overflow-scrolling: touch;">
  <table style="width: 100%; border-collapse: collapse; font-size: ${t.tableFontSize}; text-align: left; border: 1px solid ${t.tableBorderColor};">
    <thead>${headerHtml}</thead>
    <tbody>${bodyHtml}</tbody>
  </table>
</section>`;
  };

  renderer.image = ({ href, text }) => renderThemedImage(href, text, t);

  renderer.link = function (token: any) {
    const text = token.tokens && this.parser ? this.parser.parseInline(token.tokens) : (token.text || token.href);
    const href = sanitizeHref(token.href);

    // If footnote conversion is enabled and it is an external link
    if (convertLinksToFootnotes && (href.startsWith('http://') || href.startsWith('https://'))) {
      const footnoteIndex = footnotes.length + 1;
      footnotes.push({ index: footnoteIndex, text: text.replace(/<[^>]*>/g, ''), href });
      return `<span style="color: ${t.linkColor}; font-weight: 500;">${text}</span><sup style="font-size: 10px; color: ${t.linkColor}; font-weight: bold; margin-left: 2px; vertical-align: super; line-height: 0;">[${footnoteIndex}]</sup>`;
    }

    return `<a href="${href}" style="color: ${t.linkColor}; text-decoration: none; border-bottom: 1px dotted ${t.linkColor};">${text}</a>`;
  };

  return renderer;
}

/**
 * Main Markdown to WeChat HTML compiler
 */
export function compileWeChatMarkdown(
  markdown: string,
  theme: ThemeConfig,
  background: BackgroundSettings,
  options?: CompilerOptions
): string {
  const convertLinksToFootnotes = options?.convertLinksToFootnotes ?? true;
  const footnotes: Array<{ index: number; text: string; href: string }> = [];

  // 统一换行符：CRLF 会让 GFM alert 等按 \n 切分的逻辑残留 \r
  markdown = markdown.replace(/\r\n?/g, '\n');

  // 0. 解析主题令牌：后续所有渲染器只从解析结果取值，不再有硬编码视觉值
  const t = resolveTokens(theme);

  // 1. Preprocess special directives
  const processedMarkdown = preprocessCustomBlocks(markdown, theme, t);

  // 2. Configure marked（公式走 marked 扩展：作用于 token 流，
  //    代码块/行内代码里的 $ 不会被误判，且支持 $...$ / $$...$$ / \(...\) / \[...\]）
  const renderer = createWechatRenderer(theme, t, footnotes, convertLinksToFootnotes);
  const md = new Marked({
    gfm: true,
    breaks: true,
    renderer,
    extensions: createMathExtensions(),
  });
  let rawHtml = md.parse(processedMarkdown) as string;
  // marked breaks:true 会在行内公式前插入 <br>，去掉
  rawHtml = stripBreakBeforeInlineKatex(rawHtml);

  // 3. Append footnotes section if external links were recorded
  if (convertLinksToFootnotes && footnotes.length > 0) {
    // 脚注列表：不用 <li>（微信会把 li 内容拆行），改用 section + 悬挂缩进；
    // 冒号跟在标题后面，即使微信把链接单独折行也能读顺
    const footnoteListHtml = footnotes
      .map(
        (fn) =>
          `<section style="margin: 7px 0; padding-left: 26px; text-indent: -26px; font-size: 12.5px; line-height: 1.7; color: #888888;"><span style="color: ${theme.accentColor}; font-weight: bold;">[${fn.index}]</span> <span style="color: ${theme.primaryColor}; font-weight: 500;">${escapeHtml(fn.text)}</span><span style="color: #94A3B8;">：</span><span style="color: #64748B; text-decoration: underline; word-break: break-all;">${escapeHtml(fn.href)}</span></section>`
      )
      .join('');

    rawHtml += `\n<section style="margin: 36px 0 16px 0; padding: 18px 20px; background-color: ${t.quoteBgColor}; border-top: 1px dashed rgba(0,0,0,0.15); border-radius: ${t.blockRadius};">
  <section style="font-size: 13px; font-weight: bold; color: ${theme.primaryColor}; margin-bottom: 10px; letter-spacing: 0.5px;">
    <span style="display: inline-block; width: 4px; height: 12px; background-color: ${theme.accentColor}; border-radius: 2px; margin-right: 8px; vertical-align: -1px;">&nbsp;</span>参考资料与延伸阅读
  </section>
  ${footnoteListHtml}
</section>`;
  }

  // 4. Wrap in root container with background settings for WeChat persistence
  const bgStyles = generateBackgroundCss(background);
  let bgStyleString = `background-color: ${bgStyles.backgroundColor};`;
  if (background.type !== 'none' && bgStyles.backgroundImage) {
    bgStyleString += ` background-image: ${bgStyles.backgroundImage};`;
    if (bgStyles.backgroundSize) {
      bgStyleString += ` background-size: ${bgStyles.backgroundSize};`;
    }
  }

  // 根容器。
  //
  // 最后两条 `font-variant-numeric` / `font-feature-settings` 是为了修「数字有大有小、不在同一水平线上」：
  // 部分衬线字体（Georgia 被「学术论文」「东方笺谱」等主题放在字体栈首位）默认输出**旧式数字**
  // （old-style figures）—— `3 4 5 7 9` 沉到基线以下、`6 8` 冒出、`0 1 2` 只有 x 高度，且宽度也各不相同。
  // 实测（56px 字号，Georgia）：
  //   · 墨迹高：默认 51.1px → lining-nums 41.4px（与 SimSun 39 / Times 39.8 一致）
  //   · 「1」宽 24.06 / 「8」宽 33.39 → 加 tabular-nums 后同为 31.53（等宽）
  // 两个属性各写两份（CSS 属性 + 低层特性）是为了容错：不同引擎/公众号编辑器支持度不同；
  // 且都是内联样式，可随「复制到公众号」保留。
  const containerHtml = `<section id="gzh-article-root" style="font-family: ${theme.fontFamily}; font-size: ${theme.fontSize}; line-height: ${theme.lineHeight}; color: ${theme.primaryColor}; ${bgStyleString} padding: ${t.contentPadding}; margin: 0 auto; max-width: ${t.contentMaxWidth}; box-sizing: border-box; text-size-adjust: 100%; -webkit-text-size-adjust: 100%; word-break: break-word; font-variant-numeric: lining-nums tabular-nums; font-feature-settings: 'lnum' 1, 'tnum' 1;">
${rawHtml}
</section>`;

  // 出口统一消毒：删除可执行标签、on* 事件属性与危险协议
  const sanitized = sanitizeHtml(containerHtml);

  // 最后叠加用户自定义 CSS（内联化）。
  // 必须放在消毒之后：否则用户写的样式会被消毒流程改写掉。
  // customCss 模块内部已自行过滤危险值（javascript: / expression() 等）。
  return applyCustomCss(sanitized, theme.customCss);
}

/**
 * Calculate reading stats
 */
export function calculateArticleStats(markdown: string): {
  wordCount: number;
  readingTimeMinutes: number;
  imageCount: number;
} {
  // Chinese characters + English words
  const clean = markdown.replace(/:::[\s\S]*?:::/g, '').replace(/```[\s\S]*?```/g, '');
  const chinese = (clean.match(/[\u4e00-\u9fa5]/g) || []).length;
  const english = (clean.replace(/[\u4e00-\u9fa5]/g, ' ').match(/\b[a-zA-Z0-9_-]+\b/g) || []).length;
  const wordCount = chinese + english;

  const images = (markdown.match(/!\[.*?\]\(.*?\)/g) || []).length;
  const readingTimeMinutes = Math.max(1, Math.ceil(wordCount / 350));

  return { wordCount, readingTimeMinutes, imageCount: images };
}
