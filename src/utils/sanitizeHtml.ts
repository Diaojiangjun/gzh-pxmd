/**
 * 最终 HTML 产物消毒（输出侧的唯一收口）
 *
 * 背景：本项目的编译产物会被 `dangerouslySetInnerHTML` 渲染，并复制到微信公众号。
 * 用户 Markdown 里的原始 HTML 会被 `marked` 原样放行，而自定义块 / 脚注 / 行内代码等
 * 多处是「裸插值」，逐一改造既繁琐又容易漏。
 *
 * 因此这里在**编译出口**做一次统一消毒：
 *  - 删除可执行标签（script/style/iframe/…）
 *  - 删除所有 `on*` 事件属性
 *  - 把 `javascript:` / `data:text/html` 等危险协议改写为 `#`
 *
 * 采用「逐标签处理」而不是全文正则，避免误伤属性值里的普通文本；
 * 同时保留我们自己生成的全部 inline-style 结构与 MathJax 的内联 SVG。
 */
import { isDangerousUrl } from './escape';

/** 直接删除的标签（含内容） */
const DROP_WITH_CONTENT = [
  'script',
  'style',
  'iframe',
  'frame',
  'frameset',
  'object',
  'embed',
  'applet',
  'noscript',
  'template',
];

/** 只删除标签本身、保留内容的标签 */
const DROP_TAG_ONLY = [
  'meta',
  'link',
  'base',
  'form',
  'input',
  'button',
  'textarea',
  'select',
  'option',
  'basefont',
  'isindex',
];

/** 需要检查协议的属性 */
const URL_ATTRS = ['href', 'src', 'xlink:href', 'action', 'formaction', 'srcdoc', 'poster', 'data'];

/** 属性值匹配（双引号 / 单引号 / 无引号） */
const ATTR_VALUE = `("[^"]*"|'[^']*'|[^\\s>]+)`;

export function sanitizeHtml(html: string): string {
  let out = String(html ?? '');

  // 1) 删除「危险标签 + 内容」
  for (const tag of DROP_WITH_CONTENT) {
    out = out.replace(new RegExp(`<${tag}\\b[^>]*>[\\s\\S]*?<\\/${tag}\\s*>`, 'gi'), '');
    // 未闭合/自闭合的残片也一并清掉
    out = out.replace(new RegExp(`<\\/?${tag}\\b[^>]*>`, 'gi'), '');
  }

  // 2) 只删标签本身
  for (const tag of DROP_TAG_ONLY) {
    out = out.replace(new RegExp(`<\\/?${tag}\\b[^>]*>`, 'gi'), '');
  }

  // 3) 逐标签清理属性（不触碰标签之间的正文，避免误伤）
  out = out.replace(/<[a-z][^>]*>/gi, (tag) => {
    // 3.1 删除事件属性 on*
    let cleaned = tag.replace(new RegExp(`\\son[a-z-]+\\s*=\\s*${ATTR_VALUE}`, 'gi'), '');

    // 3.2 危险协议降级
    const attrRe = new RegExp(`\\s(${URL_ATTRS.join('|')})\\s*=\\s*${ATTR_VALUE}`, 'gi');
    cleaned = cleaned.replace(attrRe, (whole, name, value) => {
      const unquoted = String(value).replace(/^["']|["']$/g, '');
      if (isDangerousUrl(unquoted)) return ` ${name}="#"`;
      return whole;
    });

    // 3.3 srcdoc 一律清空（即便内容不是 HTML 协议也属于高危）
    cleaned = cleaned.replace(/\ssrcdoc\s*=\s*("[^"]*"|'[^']*'|[^\s>]+)/gi, '');

    return cleaned;
  });

  return out;
}
