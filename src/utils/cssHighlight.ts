/**
 * 自定义 CSS 语法高亮 + 补全数据
 *
 * 为什么自研而不是引 CodeMirror/Monaco：
 *  这两个包体积在 200KB~2MB 量级，而本编辑器只服务「一段几十行的主题微调 CSS」，
 *  为它拖进一个完整 IDE 不划算。这里用 ~150 行的状态机做 tokenize，覆盖
 *  注释 / 选择器 / 属性名 / 数值 / 颜色 / 关键字六类着色，已经够用。
 *
 * 渲染方式：textarea 负责输入（文字透明、只留光标），背后叠一层同样排版的
 * `<pre>` 承载着色结果。这是 textarea 着色的标准做法，比 contenteditable 稳得多
 * ——后者要自己维护光标与撤销栈，极易踩坑。
 */

/** 着色单元：cls 对应 CSS 类名（在组件里定义配色） */
export interface CssToken {
  text: string;
  cls: 'plain' | 'cmt' | 'sel' | 'prop' | 'value' | 'num' | 'color' | 'punc' | 'at' | 'bang';
}

const PUNCT = new Set(['{', '}', ';', ':', ',']);

/**
 * 把一段 CSS 拆成着色单元。
 *
 * 采用「找结构字符 → 分段 → 递归处理声明」的简化模型，而不是完整 CSS 语法树：
 * 自定义 CSS 的实际写法很窄（标签选择器 + 少量属性），够用且没有解析失败的风险。
 * 遇到看不懂的写法一律降级为 plain，绝不丢字符 —— 高亮层必须与 textarea 文本逐字对齐，
 * 少一个空格就会让光标与视觉错位。
 */
export function tokenizeCss(src: string): CssToken[] {
  const out: CssToken[] = [];
  const push = (text: string, cls: CssToken['cls']) => {
    if (text) out.push({ text, cls });
  };

  let i = 0;
  while (i < src.length) {
    // 1. 注释优先（注释里可能包含 { } ; ，必须先吃掉）
    if (src[i] === '/' && src[i + 1] === '*') {
      const end = src.indexOf('*/', i + 2);
      const stop = end === -1 ? src.length : end + 2;
      push(src.slice(i, stop), 'cmt');
      i = stop;
      continue;
    }

    // 2. 找下一个结构字符
    const brace = src.indexOf('{', i);
    const semi = src.indexOf(';', i);
    let next = -1;
    if (brace === -1) next = semi;
    else if (semi === -1) next = brace;
    else next = Math.min(brace, semi);

    if (next === -1) {
      push(src.slice(i), 'plain');
      break;
    }

    const head = src.slice(i, next);

    if (src[next] === '{') {
      // head 是选择器（可能以 @ 开头，如 @media）
      push(head, head.trim().startsWith('@') ? 'at' : 'sel');
      push('{', 'punc');

      const close = src.indexOf('}', next);
      const bodyEnd = close === -1 ? src.length : close;
      tokenizeDeclarations(src.slice(next + 1, bodyEnd), out);

      if (close === -1) {
        i = bodyEnd;
      } else {
        push('}', 'punc');
        i = close + 1;
      }
    } else {
      // 顶层没有块的语句，如 @import url(...);
      push(head, head.trim().startsWith('@') ? 'at' : 'plain');
      push(';', 'punc');
      i = next + 1;
    }
  }

  return out;
}

/** 处理声明块内部：`prop: value; prop2: value2` */
function tokenizeDeclarations(body: string, out: CssToken[]) {
  const push = (text: string, cls: CssToken['cls']) => {
    if (text) out.push({ text, cls });
  };

  let i = 0;
  while (i < body.length) {
    // 声明内部也可能有注释
    if (body[i] === '/' && body[i + 1] === '*') {
      const end = body.indexOf('*/', i + 2);
      const stop = end === -1 ? body.length : end + 2;
      push(body.slice(i, stop), 'cmt');
      i = stop;
      continue;
    }

    const semi = body.indexOf(';', i);
    const stop = semi === -1 ? body.length : semi;
    const chunk = body.slice(i, stop);

    const colon = chunk.indexOf(':');
    if (colon <= 0) {
      push(chunk, 'plain');
    } else {
      push(chunk.slice(0, colon), 'prop');
      push(':', 'punc');
      tokenizeValue(chunk.slice(colon + 1), out);
    }

    if (semi === -1) {
      i = stop;
    } else {
      push(';', 'punc');
      i = semi + 1;
    }
  }
}

/** 处理属性值：切出 hex 颜色 / 数值 / !important / 其它 */
function tokenizeValue(value: string, out: CssToken[]) {
  // 顺序很重要：hex → !important → 数值 → 兜底文本
  const re =
    /(#[0-9a-fA-F]{3,8}\b)|(!\s*important\b)|(-?(?:\d*\.)?\d+(?:px|em|rem|%|vh|vw|pt|s|ms|deg|fr)?)|([^#!\d]+|!)/g;

  let matched = false;
  let m: RegExpExecArray | null;
  while ((m = re.exec(value)) !== null) {
    matched = true;
    const text = m[0];
    if (m[1]) out.push({ text, cls: 'color' });
    else if (m[2]) out.push({ text, cls: 'bang' });
    else if (m[3]) out.push({ text, cls: 'num' });
    else out.push({ text, cls: 'value' });
  }
  // 空值或正则意外不匹配时兜底，保证不丢字符
  if (!matched && value) out.push({ text: value, cls: 'value' });
}

const ESCAPE_MAP: Record<string, string> = {
  '&': '&amp;',
  '<': '&lt;',
  '>': '&gt;',
  '"': '&quot;',
  "'": '&#39;',
};

/**
 * 生成高亮层的 HTML。
 *
 * 必须先转义再包 span —— 用户 CSS 里出现 `<` 会被当成标签注入（XSS）。
 * 另外末尾补一个换行：`<pre>` 的最后一行若是空行，浏览器会吞掉，
 * 导致高亮层比 textarea 少一行、滚动长度不一致。
 */
export function highlightCss(src: string): string {
  const body = tokenizeCss(src)
    .map((tk) => {
      const safe = tk.text.replace(/[&<>"']/g, (c) => ESCAPE_MAP[c]);
      return tk.cls === 'plain' ? safe : `<span class="ck-${tk.cls}">${safe}</span>`;
    })
    .join('');
  return body + '\n';
}

/** 补全候选：常用属性（含示例值与中文说明） */
export const CSS_PROPOSALS: Array<{ name: string; sample: string; note: string }> = [
  { name: 'margin', sample: '16px 0', note: '外边距（1~4 个值）' },
  { name: 'margin-top', sample: '24px', note: '上外边距' },
  { name: 'margin-bottom', sample: '16px', note: '下外边距' },
  { name: 'margin-left', sample: '0px', note: '左外边距' },
  { name: 'padding', sample: '12px 18px', note: '内边距' },
  { name: 'padding-top', sample: '10px', note: '上内边距' },
  { name: 'padding-left', sample: '12px', note: '左内边距（悬挂缩进常用）' },
  { name: 'font-size', sample: '15px', note: '字号' },
  { name: 'font-weight', sample: '700', note: '字重' },
  { name: 'font-style', sample: 'italic', note: '斜体' },
  { name: 'font-family', sample: "'Songti SC', serif", note: '字体栈' },
  { name: 'line-height', sample: '1.8', note: '行高倍数' },
  { name: 'letter-spacing', sample: '0.5px', note: '字间距' },
  { name: 'text-align', sample: 'justify', note: '对齐（justify/left/center）' },
  { name: 'text-indent', sample: '2em', note: '首行缩进' },
  { name: 'text-decoration', sample: 'none', note: '文本装饰' },
  { name: 'color', sample: '#222222', note: '文字颜色' },
  { name: 'background-color', sample: 'rgba(0,0,0,0.03)', note: '背景色' },
  { name: 'border-radius', sample: '8px', note: '圆角' },
  { name: 'border', sample: '1px solid #E5E7EB', note: '边框简写' },
  { name: 'border-left', sample: '4px solid #07C160', note: '左边框（引用条常用）' },
  { name: 'border-bottom', sample: '2px solid #E5E7EB', note: '下边框' },
  { name: 'border-top', sample: '1px dashed #CBD5E1', note: '上边框' },
  { name: 'border-color', sample: '#E5E7EB', note: '边框颜色' },
  { name: 'border-left-width', sample: '3px', note: '左边框粗细' },
  { name: 'border-collapse', sample: 'collapse', note: '表格边框合并' },
  { name: 'width', sample: '100%', note: '宽度' },
  { name: 'max-width', sample: '100%', note: '最大宽度' },
  { name: 'height', sample: 'auto', note: '高度' },
  { name: 'opacity', sample: '0.6', note: '不透明度' },
  { name: 'overflow', sample: 'hidden', note: '溢出处理' },
  { name: 'word-break', sample: 'break-word', note: '长词换行' },
  { name: 'white-space', sample: 'pre-wrap', note: '空白处理' },
  { name: 'list-style-type', sample: 'disc', note: '列表符号' },
  { name: 'display', sample: 'block', note: '显示方式（微信慎用 flex）' },
  { name: 'vertical-align', sample: 'middle', note: '垂直对齐（行内元素）' },
  { name: 'box-sizing', sample: 'border-box', note: '盒模型' },
  { name: 'font-variant-numeric', sample: 'lining-nums tabular-nums', note: '数字字形（等宽/等高）' },
];

/** 补全候选：可用选择器。编译产物没有业务 class，所以只能靠标签名与根容器 */
export const SELECTOR_PROPOSALS: Array<{ name: string; note: string }> = [
  { name: '#gzh-article-root', note: '文章根容器（最外层的 padding / 底色）' },
  { name: 'p', note: '正文段落' },
  { name: 'h1', note: '一级标题' },
  { name: 'h2', note: '二级标题' },
  { name: 'h3', note: '三级标题' },
  { name: 'blockquote', note: '引用块' },
  { name: 'ul', note: '无序列表' },
  { name: 'ol', note: '有序列表' },
  { name: 'li', note: '列表项' },
  { name: 'table', note: '表格' },
  { name: 'th', note: '表头单元格' },
  { name: 'td', note: '正文单元格' },
  { name: 'pre', note: '代码块' },
  { name: 'code', note: '行内代码' },
  { name: 'img', note: '图片' },
  { name: 'a', note: '链接' },
  { name: 'strong', note: '加粗' },
  { name: 'em', note: '斜体' },
  { name: 'hr', note: '分隔线' },
  { name: 'section', note: '版式块容器（hero/card 等）' },
];

/**
 * 判断光标是否位于「声明块内的属性名位置」，用于决定补全哪一类候选。
 *
 * 做法：取光标前的文本，比较最后一个 `{` 与最后一个 `}` 谁更近；
 * 若在块内，再看该块中光标前是否已有 `:` 未闭合（有则说明在写值，不补全属性名）。
 */
export function detectCompletionContext(
  text: string,
  cursor: number
): { kind: 'prop' | 'selector' | 'value'; word: string; start: number } {
  const before = text.slice(0, cursor);

  // 光标前的连续单词（含 - 与 #）
  const wordMatch = before.match(/([#a-zA-Z-]+)$/);
  const word = wordMatch ? wordMatch[1] : '';
  const start = wordMatch ? cursor - word.length : cursor;

  // 正在写属性值（最后一段里已有冒号）→ 不做候选，避免打断输入颜色/数值
  const lastOpen = before.lastIndexOf('{');
  const lastClose = before.lastIndexOf('}');
  const insideBlock = lastOpen > lastClose;
  if (insideBlock) {
    // 只看当前这条声明（从块内上一个分号之后开始），避免把 `a:hover` 的选择器冒号误判为「正在写值」
    const segStart = Math.max(lastOpen + 1, before.lastIndexOf(';') + 1);
    const segment = before.slice(segStart);
    if (segment.includes(':')) return { kind: 'value', word, start };
    return { kind: 'prop', word, start };
  }

  return { kind: 'selector', word, start };
}
