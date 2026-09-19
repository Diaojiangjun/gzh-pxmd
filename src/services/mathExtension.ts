/**
 * 数学公式 marked 扩展 —— 实现逻辑参考 doocs/md
 * （doocs/md `packages/core/src/extensions/katex.ts` + `utils/mathDetection.ts`）
 *
 * 为什么用「扩展」而不是「正则替换原始 markdown」：
 *  1. 扩展作用在 marked 的 **token 流**上，代码块 / 行内代码里的 `$` 永远不会被误判
 *     —— 之前的方案会把正文里 `用 `$$` 包裹` 这种游离的 `$$` 与真正的公式块错配，
 *     导致公式整块漏渲染（这正是用户看到的现象）；
 *  2. 同时支持四种分隔符：`$...$`、`$$...$$`、`\(...\)`、`\[...\]`；
 *  3. 未就绪时输出占位符，MathJax 加载完成后再由外层重新编译替换为真实 SVG。
 *
 * 渲染：`window.MathJax.tex2svg()` → 自包含内联 SVG（字体轮廓内嵌），
 *       `fill/stroke = currentColor` 让公式颜色跟随正文（微信深色模式可读）。
 */
import type { TokenizerAndRendererExtension, RendererExtensionFunction } from 'marked';
import { isMathJaxReady, loadMathJax } from './diagramRenderer';

// ---------- 检测规则（照搬 doocs/md utils/mathDetection.ts） ----------

/** 行内公式 `$...$`（标准：闭合符后必须是空白/标点/行尾） */
export const inlineRule = /^(\${1,2})(?!\$)((?:\\.|[^\\\n])*?(?:\\.|[^\\\n$]))\1(?=[\s?!.,:？！。，：]|$)/;
/** 行内公式 `$...$`（宽松：不要求闭合符后有标点，中文场景更自然） */
export const inlineRuleNonStandard = /^(\${1,2})(?!\$)((?:\\.|[^\\\n])*?(?:\\.|[^\\\n$]))\1/;
/** 块级公式：独占多行 `$$\n...\n$$` */
export const blockRuleMultiline = /^\s{0,3}(\${1,2})[ \t]*\n([\s\S]+?)\n\s{0,3}\1[ \t]*(?:\n|$)/;
/** 块级公式：独占单行 `$$...$$` */
export const blockRuleSingleLine = /^\s{0,3}(\$\$)([^\n]+)\1[ \t]*(?:\n|$)/;
/** 行内公式 `\(...\)` */
export const inlineLatexRule = /^\\\(([^\\]*(?:\\.[^\\]*)*?)\\\)/;
/** 块级公式 `\[...\]` */
export const blockLatexRule = /^\\\[([^\\]*(?:\\.[^\\]*)*?)\\\]/;

const blockLatexAnywhere = /\\\[[^\\]*(?:\\.[^\\]*)*?\\\]/;
const inlineLatexAnywhere = /\\\([^\\]*(?:\\.[^\\]*)*?\\\)/;

const DOLLAR = 36;

/** 块级公式匹配（多行优先） */
export function matchBlockKatex(src: string): RegExpMatchArray | null {
  return src.match(blockRuleMultiline) ?? src.match(blockRuleSingleLine);
}

/**
 * 把 `^` 锚定规则改写成 sticky 版本，这样可以直接在某个位置测试，
 * 而不必每次 slice 字符串。
 */
const stickyRules = new Map<RegExp, RegExp>();

function stickyRuleFor(rule: RegExp): RegExp {
  let sticky = stickyRules.get(rule);
  if (!sticky) {
    sticky = new RegExp(rule.source.replace(/^\^/, ''), `${rule.flags.replace(/[gy]/g, '')}y`);
    stickyRules.set(rule, sticky);
  }
  return sticky;
}

function matchesAt(rule: RegExp, src: string, index: number): boolean {
  const sticky = stickyRuleFor(rule);
  sticky.lastIndex = index;
  return sticky.test(src);
}

function contentHasBlockKatex(content: string): boolean {
  if (!content.includes('$')) return false;

  let lineStart = 0;
  for (;;) {
    if (
      matchesAt(blockRuleMultiline, content, lineStart) ||
      matchesAt(blockRuleSingleLine, content, lineStart)
    ) {
      return true;
    }
    const next = content.indexOf('\n', lineStart);
    if (next === -1) return false;
    lineStart = next + 1;
  }
}

/** 判断 `$` 是否是金额符号（如 `$100`、`价格 $ 5`），避免把货币当公式 */
function isAmountDollarSign(src: string, index: number, offset: number): boolean {
  if (index <= offset) return false;
  const prev = src.charAt(index - 1);
  if (/[\d,.]/.test(prev)) return true;
  return prev === ' ' && index - offset >= 2 && /\d/.test(src.charAt(index - 2));
}

function isInlineKatexStart(src: string, index: number, offset: number, nonStandard: boolean): boolean {
  if (nonStandard) return !isAmountDollarSign(src, index, offset);
  return index === offset || src.charAt(index - 1) === ' ';
}

/** 找到下一个可作为行内公式起点的 `$` 位置 */
export function findInlineKatexStart(
  src: string,
  nonStandard: boolean,
  ruleReg: RegExp
): number | undefined {
  let offset = 0;

  while (offset < src.length) {
    const index = src.indexOf('$', offset);
    if (index === -1) return undefined;

    if (isInlineKatexStart(src, index, offset, nonStandard) && matchesAt(ruleReg, src, index)) {
      return index;
    }

    // 跳过分隔符以及紧跟其后的连续 `$`
    let next = index + 1;
    while (next < src.length && src.charCodeAt(next) === DOLLAR) next++;
    offset = next;
  }

  return undefined;
}

/** 找到第一个位于行首（允许 ≤3 空格缩进）的分隔符位置，作为块级扫描起点 */
function findBlockStartHint(src: string, delim: string): number | undefined {
  let idx = src.indexOf(delim);
  while (idx !== -1) {
    const lineStart = src.lastIndexOf('\n', idx - 1) + 1;
    if (/^[ \t]{0,3}$/.test(src.slice(lineStart, idx))) return idx;
    idx = src.indexOf(delim, idx + 1);
  }
  return undefined;
}

/**
 * 判断 markdown 是否包含公式（与 MDKatex 的识别范围保持一致，nonStandard 默认 true）
 */
export function hasMath(content: string, nonStandard = true): boolean {
  if (contentHasBlockKatex(content)) return true;
  if (blockLatexAnywhere.test(content)) return true;
  if (inlineLatexAnywhere.test(content)) return true;

  const ruleReg = nonStandard ? inlineRuleNonStandard : inlineRule;
  return findInlineKatexStart(content, nonStandard, ruleReg) !== undefined;
}

/** 去掉 marked breaks:true 在行内公式前插入的 <br> */
export function stripBreakBeforeInlineKatex(html: string): string {
  return html.replace(/<br\s*\/?>\s*(?=<span class="katex-inline)/gi, '');
}

// ---------- 渲染 ----------

interface MathJaxGlobal {
  tex2svg: (input: string, options?: { display?: boolean }) => HTMLElement;
  texReset: () => void;
  startup?: { promise?: Promise<void> };
}

interface MathToken {
  raw?: string;
  text: string;
  displayMode?: boolean;
}

function escapeHtml(s: string): string {
  return s
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;');
}

function getMathJax(): MathJaxGlobal | undefined {
  return (window as unknown as { MathJax?: MathJaxGlobal }).MathJax;
}

/** 公式 SVG 缓存：避免每次输入都重新排版（只缓存已完成的 SVG，占位符不入缓存） */
const mathSvgCache = new Map<string, string>();
const MATH_CACHE_LIMIT = 400;

/**
 * MathJax 加载失败时置为 true：公式降级为「原文代码」显示，
 * 避免用户一直看到「公式加载中…」却不知道发生了什么。
 */
let mathRenderDisabled = false;

export function disableMathRendering(): void {
  mathRenderDisabled = true;
  mathSvgCache.clear();
}

function createRenderer(defaultDisplay: boolean, withStyle = true) {
  return (token: MathToken): string => {
    const display = token.displayMode ?? defaultDisplay;
    const rawAttr = escapeHtml(token.raw ?? token.text);
    const cacheKey = `${display ? '1' : '0'}\u0000${withStyle ? '1' : '0'}\u0000${rawAttr}\u0000${token.text}`;

    // MathJax 不可用（加载失败）：降级为原文，保证文章结构与内容完整
    if (mathRenderDisabled) {
      return display
        ? `<section style="display: block; text-align: center; margin: 16px 0; padding: 10px 14px; background-color: #F6F8FA; border-radius: 6px; font-family: Menlo, Consolas, monospace; font-size: 13px; color: #C0392B; overflow-x: auto; white-space: pre-wrap; word-break: break-all;">${escapeHtml(token.text)}</section>`
        : `<code style="font-family: Menlo, Consolas, monospace; color: #C0392B;">${escapeHtml(token.text)}</code>`;
    }

    const cached = mathSvgCache.get(cacheKey);
    if (cached !== undefined) return cached;

    const mjx = typeof window === 'undefined' ? undefined : getMathJax();
    if (!mjx?.tex2svg) {
      // MathJax 未就绪：输出占位符并触发异步加载，加载完成后外层会重新编译
      loadMathJax().catch(() => {});
      return display
        ? `<section class="katex-block katex-pending" data-math-display="true" data-math-raw="${rawAttr}" style="display: block; text-align: center; margin: 18px 0;"><span style="font-size: 14px; color: #94A3B8;">公式加载中…</span></section>`
        : `<span class="katex-inline katex-pending" data-math-display="false" data-math-raw="${rawAttr}"><span>…</span></span>`;
    }

    let html: string;
    try {
      mjx.texReset();
      const container = mjx.tex2svg(token.text, { display });
      const svg = (container.querySelector?.('svg') || container.firstChild) as SVGElement | null;
      if (!svg) throw new Error('MathJax 未返回 SVG 节点');

      // 记录宽度后移除固定 width（对齐 doocs/md）
      const styleAny = svg.style as unknown as Record<string, string>;
      const width = styleAny['min-width'] || svg.getAttribute('width');
      svg.removeAttribute('width');

      if (withStyle) {
        // 块级公式用 inline-block + 父级 text-align:center 实现居中
        // （SVG 是内联级元素，父级 text-align 即可居中；微信同样支持）
        styleAny.display = display ? 'inline-block' : 'initial';
        svg.style.setProperty('max-width', '300vw', 'important');
        styleAny.flexShrink = '0';
        svg.style.width = width || '';
      }

      // 关键：fill/stroke 用 currentColor，让公式颜色跟随正文
      const firstG = svg.querySelector('g');
      if (firstG) {
        const gAny = firstG as unknown as { style: Record<string, string> };
        gAny.style.fill = 'currentColor';
        gAny.style.stroke = 'currentColor';
        firstG.setAttribute('fill', 'currentColor');
        firstG.setAttribute('stroke', 'currentColor');
      }

      // 外层包裹：块级公式居中（内联样式跟随复制到公众号）
      html = display
        ? `<section class="katex-block" data-math-display="true" data-math-raw="${rawAttr}" style="display: block; text-align: center; margin: 18px 0;">${svg.outerHTML}</section>`
        : `<span class="katex-inline" data-math-display="false" data-math-raw="${rawAttr}">${svg.outerHTML}</span>`;
    } catch (e) {
      // 渲染失败时降级为行内代码，至少让读者看到公式原文，不破坏整篇排版
      console.warn('公式渲染失败，降级为原文:', e);
      return `<code style="font-family: Menlo, Consolas, monospace; color: #c0392b;">${escapeHtml(token.text)}</code>`;
    }

    if (mathSvgCache.size >= MATH_CACHE_LIMIT) {
      const firstKey = mathSvgCache.keys().next().value;
      if (firstKey !== undefined) mathSvgCache.delete(firstKey);
    }
    mathSvgCache.set(cacheKey, html);
    return html;
  };
}

interface MathExtensionOptions {
  /** 宽松行内规则（不要求闭合符后有标点），中文场景建议开启 */
  nonStandard?: boolean;
  /** 是否给 SVG 注入 display / max-width 等样式（导出「只保留内容」时可关） */
  withStyle?: boolean;
}

/**
 * 创建公式 marked 扩展（4 个：`$...$` / `$$...$$` / `\(...\)` / `\[...\]`）
 */
export function createMathExtensions(options?: MathExtensionOptions): TokenizerAndRendererExtension[] {
  const nonStandard = options?.nonStandard ?? true;
  const withStyle = options?.withStyle ?? true;
  const inlineRenderer = createRenderer(false, withStyle);
  const blockRenderer = createRenderer(true, withStyle);
  const ruleReg = nonStandard ? inlineRuleNonStandard : inlineRule;

  const inlineKatex: TokenizerAndRendererExtension = {
    name: 'inlineKatex',
    level: 'inline',
    start(src: string) {
      return findInlineKatexStart(src, nonStandard, ruleReg);
    },
    tokenizer(src: string) {
      const match = src.match(ruleReg);
      if (match) {
        return {
          type: 'inlineKatex',
          raw: match[0],
          text: match[2].trim(),
          displayMode: match[1].length === 2,
        };
      }
      return undefined;
    },
    renderer: inlineRenderer as unknown as RendererExtensionFunction,
  };

  const blockKatex: TokenizerAndRendererExtension = {
    name: 'blockKatex',
    level: 'block',
    start(src: string) {
      return findBlockStartHint(src, '$$');
    },
    tokenizer(src: string) {
      const match = matchBlockKatex(src);
      if (match) {
        return {
          type: 'blockKatex',
          raw: match[0],
          text: match[2].trim(),
          displayMode: true,
        };
      }
      return undefined;
    },
    renderer: blockRenderer as unknown as RendererExtensionFunction,
  };

  const inlineLatexKatex: TokenizerAndRendererExtension = {
    name: 'inlineLatexKatex',
    level: 'inline',
    start(src: string) {
      const index = src.indexOf('\\(');
      return index !== -1 ? index : undefined;
    },
    tokenizer(src: string) {
      const match = src.match(inlineLatexRule);
      if (match) {
        return {
          type: 'inlineLatexKatex',
          raw: match[0],
          text: match[1].trim(),
          displayMode: false,
        };
      }
      return undefined;
    },
    renderer: inlineRenderer as unknown as RendererExtensionFunction,
  };

  const blockLatexKatex: TokenizerAndRendererExtension = {
    name: 'blockLatexKatex',
    level: 'block',
    start(src: string) {
      return findBlockStartHint(src, '\\[');
    },
    tokenizer(src: string) {
      const match = src.match(blockLatexRule);
      if (match) {
        return {
          type: 'blockLatexKatex',
          raw: match[0],
          text: match[1].trim(),
          displayMode: true,
        };
      }
      return undefined;
    },
    renderer: blockRenderer as unknown as RendererExtensionFunction,
  };

  return [inlineKatex, blockKatex, inlineLatexKatex, blockLatexKatex];
}
