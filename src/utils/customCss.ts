/**
 * 自定义 CSS → 内联样式
 *
 * 为什么必须内联，而不是「注入一段 <style>」：
 * 微信公众号编辑器会剥离 `<style>` 标签与 class 选择器，只有写在元素
 * `style` 属性上的样式才会被保留。所以这里把用户写的规则逐条匹配后
 * **拍平为内联样式**，让「软件内预览」与「复制到公众号」结果一致。
 *
 * 因此自定义 CSS 的选择器建议写成标签名（p / h2 / blockquote）或
 * `#gzh-article-root`（文章根容器）——编译产物本身没有稳定的业务 class。
 */

interface CssRule {
  selector: string;
  /** [属性名, 属性值, 是否 !important] */
  declarations: Array<[string, string, boolean]>;
}

/**
 * 危险值过滤（防御性，宁可少支持一个特性）：
 * 自定义 CSS 会被写进 style 属性，这里拦掉能形成代码执行 / 内容注入的写法。
 */
const DANGEROUS_VALUE = /(javascript\s*:|vbscript\s*:|expression\s*\(|@import|<\s*\/?\s*[a-z])/i;

export const CUSTOM_CSS_EXAMPLE = `p { margin: 20px 0; letter-spacing: 0.6px; }
h2 { margin-top: 34px; }
blockquote { border-left: 3px solid #07C160; }
#gzh-article-root { padding: 24px 18px; }`;

const ruleCache = new Map<string, CssRule[]>();
const RULE_CACHE_LIMIT = 16;

/**
 * 移除 @ 规则整块（@media / @keyframes / @font-face …）。
 *
 * 必须整块剔除，而不是解析后靠选择器前缀去筛：
 * `@media (max-width:600px) { p { color: red } }` 里的内层 `p { … }`
 * 会被正则当成一条**普通规则**提取出来，于是「条件生效」变成「无条件生效」，
 * 与用户意图正好相反。
 */
function stripAtRules(css: string): string {
  let out = '';
  let i = 0;
  while (i < css.length) {
    const at = css.indexOf('@', i);
    if (at === -1) {
      out += css.slice(i);
      break;
    }
    out += css.slice(i, at);

    const open = css.indexOf('{', at);
    const semi = css.indexOf(';', at);
    // 形如 `@import url(...);` 的无块 @ 规则：跳到分号
    if (semi !== -1 && (open === -1 || semi < open)) {
      i = semi + 1;
      continue;
    }
    if (open === -1) break; // 收尾异常，丢弃剩余

    // 按花括号配平找到 @ 块的结束位置
    let depth = 0;
    let j = open;
    for (; j < css.length; j++) {
      if (css[j] === '{') depth += 1;
      else if (css[j] === '}') {
        depth -= 1;
        if (depth === 0) {
          j += 1;
          break;
        }
      }
    }
    i = j;
  }
  return out;
}

/** 解析 CSS 文本为规则列表（纯函数，结果按文本缓存） */
function parseCssRulesUncached(css: string): CssRule[] {
  const rules: CssRule[] = [];
  // 先去注释（注释里的花括号会干扰分块），再整块剔除 @ 规则
  const cleaned = stripAtRules(css.replace(/\/\*[\s\S]*?\*\//g, ''));
  const blockRe = /([^{}]+)\{([^{}]*)\}/g;
  let match: RegExpExecArray | null;

  while ((match = blockRe.exec(cleaned)) !== null) {
    const selector = match[1].trim();
    const body = match[2];

    // 跳过 @media / @keyframes / @font-face —— 内联化无法表达嵌套规则
    if (!selector || selector.startsWith('@')) continue;

    const declarations: Array<[string, string, boolean]> = [];
    for (const chunk of body.split(';')) {
      const idx = chunk.indexOf(':');
      if (idx <= 0) continue;
      const prop = chunk.slice(0, idx).trim();
      let value = chunk.slice(idx + 1).trim();
      if (!prop || !value) continue;
      // 属性名只接受常规写法与自定义属性（--var）
      if (!/^(--[\w-]+|[a-zA-Z-]+)$/.test(prop)) continue;

      // 优先级后缀必须先摘掉再交给 setProperty。
      // Chrome 的 CSSOM 把 '40px !important' 视为**非法值并静默忽略**，
      // 于是用户写了 !important 反而整条失效（比不写更糟），
      // 正确做法是拆成 setProperty(prop, value, 'important')。
      let important = false;
      const bang = value.match(/!\s*important\s*$/i);
      if (bang) {
        important = true;
        value = value.slice(0, bang.index).trim();
      }

      if (!value || DANGEROUS_VALUE.test(value)) continue;
      declarations.push([prop, value, important]);
    }
    if (declarations.length > 0) rules.push({ selector, declarations });
  }
  return rules;
}

export function parseCustomCss(css: string): CssRule[] {
  const cached = ruleCache.get(css);
  if (cached) return cached;

  const rules = parseCssRulesUncached(css);
  if (ruleCache.size >= RULE_CACHE_LIMIT) {
    const oldest = ruleCache.keys().next().value;
    if (oldest !== undefined) ruleCache.delete(oldest);
  }
  ruleCache.set(css, rules);
  return rules;
}

/**
 * 把自定义 CSS 内联到编译产物上。
 *
 * @param html 编译后的文章 HTML（内含 `id="gzh-article-root"` 根容器）
 * @param css  用户自定义 CSS 文本
 * @returns 内联化后的 HTML；未配置或无可应用规则时原样返回（零开销）
 */
export function applyCustomCss(html: string, css?: string): string {
  const source = css?.trim();
  if (!source) return html;

  const rules = parseCustomCss(source);
  if (rules.length === 0) return html;

  // 交给浏览器做选择器匹配，比手写 CSS 选择器引擎可靠得多
  const doc = new DOMParser().parseFromString(html, 'text/html');
  const root = doc.querySelector('#gzh-article-root') ?? doc.body;
  if (!root) return html;

  let applied = 0;
  for (const rule of rules) {
    let targets: Element[];
    try {
      // querySelectorAll 只匹配后代、不含自身，所以根容器要单独判断一次
      const self = root.matches(rule.selector) ? [root] : [];
      targets = self.concat(Array.from(root.querySelectorAll(rule.selector)));
    } catch {
      continue; // 选择器语法错误，跳过这一条
    }
    for (const el of targets) {
      const style = (el as HTMLElement).style;
      for (const [prop, value, important] of rule.declarations) {
        try {
          style.setProperty(prop, value, important ? 'important' : '');
        } catch {
          // 个别属性名在特定引擎下会抛错，忽略单条即可
        }
      }
      applied += 1;
    }
  }

  // 应用到元素上（含根容器自身被匹配的情况）后再取回，保持产物结构不变
  return applied > 0 ? root.outerHTML : html;
}

/** 统计规则条数，用于 UI 反馈 */
export function countCustomCssRules(css?: string): { rules: number; declarations: number } {
  if (!css?.trim()) return { rules: 0, declarations: 0 };
  const rules = parseCustomCss(css);
  return {
    rules: rules.length,
    declarations: rules.reduce((sum, r) => sum + r.declarations.length, 0),
  };
}

/* ────────────────────────── 诊断 ────────────────────────── */

export interface CssIssue {
  level: 'warn' | 'error';
  message: string;
  snippet: string;
}

export interface CssAnalysis {
  rules: number;
  declarations: number;
  issues: CssIssue[];
}

const AT_RULE_RE = /@([\w-]+)/g;

/**
 * 诊断自定义 CSS，给出「哪些内容不会被应用」。
 *
 * 为什么不复用 `parseCustomCss`：那个函数只关心「能用的部分」，
 * 被跳过的内容它直接丢掉。而编辑器需要把**丢掉的原因**讲给用户听 ——
 * 否则用户只会看到「写了没效果」，无从排查。
 */
export function analyzeCustomCss(css?: string): CssAnalysis {
  const source = css?.trim();
  if (!source) return { rules: 0, declarations: 0, issues: [] };

  const issues: CssIssue[] = [];
  const withoutComments = source.replace(/\/\*[\s\S]*?\*\//g, '');

  // 1. @ 规则：内联化无法表达嵌套，整块跳过
  const atNames = new Set<string>();
  let atMatch: RegExpExecArray | null;
  AT_RULE_RE.lastIndex = 0;
  while ((atMatch = AT_RULE_RE.exec(withoutComments)) !== null) atNames.add(`@${atMatch[1]}`);
  if (atNames.size > 0) {
    issues.push({
      level: 'warn',
      message: `${[...atNames].join('、')} 无法内联到元素上，已整块跳过（` +
        `内层规则若被当成普通规则会「条件生效」变成「无条件生效」，因此不做降级）`,
      snippet: [...atNames].join(' '),
    });
  }

  // 2. 逐条声明检查
  const cleaned = stripAtRules(withoutComments);
  const rules = parseCustomCss(source);
  const blockRe = /([^{}]+)\{([^{}]*)\}/g;
  let match: RegExpExecArray | null;

  while ((match = blockRe.exec(cleaned)) !== null) {
    const selector = match[1].trim();
    if (!selector || selector.startsWith('@')) continue;

    for (const chunk of match[2].split(';')) {
      const raw = chunk.trim();
      if (!raw) continue;

      const idx = raw.indexOf(':');
      if (idx <= 0) {
        issues.push({
          level: 'error',
          message: '缺少「属性: 值」的冒号，已跳过',
          snippet: raw.slice(0, 40),
        });
        continue;
      }

      const prop = raw.slice(0, idx).trim();
      let value = raw.slice(idx + 1).trim();

      if (!/^(--[\w-]+|[a-zA-Z-]+)$/.test(prop)) {
        issues.push({ level: 'error', message: `属性名「${prop}」不合法，已跳过`, snippet: raw.slice(0, 40) });
        continue;
      }

      const bang = value.match(/!\s*important\s*$/i);
      if (bang) value = value.slice(0, bang.index).trim();

      if (!value) {
        issues.push({ level: 'error', message: `「${prop}」没有值，已跳过`, snippet: raw.slice(0, 40) });
        continue;
      }

      if (DANGEROUS_VALUE.test(value)) {
        issues.push({
          level: 'error',
          message: `「${prop}」的值包含脚本/导入等不安全写法，出于安全考虑已跳过`,
          snippet: `${prop}: ${value}`.slice(0, 40),
        });
      }
    }
  }

  // 3. 花括号配平（用户漏写 } 是最常见的手误，会导致后面整段失效）
  let depth = 0;
  for (const ch of withoutComments) {
    if (ch === '{') depth += 1;
    else if (ch === '}') depth -= 1;
  }
  if (depth !== 0) {
    issues.push({
      level: 'error',
      message: depth > 0 ? `花括号少闭合 ${depth} 个「}」` : `花括号多出 ${-depth} 个「}」`,
      snippet: '',
    });
  }

  return {
    rules: rules.length,
    declarations: rules.reduce((sum, r) => sum + r.declarations.length, 0),
    issues,
  };
}
