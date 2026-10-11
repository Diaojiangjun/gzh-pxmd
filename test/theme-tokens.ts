/**
 * 主题令牌验证（浏览器环境，Vite dev server 下运行）
 *
 * 两条主线：
 *  A. 零回归 —— 未声明 tokens 的主题，产物中的视觉值必须与原硬编码**逐一相等**；
 *  B. 可调 —— 声明 tokens 后，对应元素的 computed style 必须立刻改变。
 *
 * 只测「编译器产物 + 浏览器计算样式」，不涉及 Electron / UI，
 * 因此结论是确定性的，不受 HMR 或时序影响。
 */
import { DEFAULT_THEMES, THEME_CATEGORIES } from '../src/data/defaultData';
import { SAMPLE_MARKDOWN } from '../src/data/sampleMarkdown';
import { compileWeChatMarkdown, validateCustomBlocks, KNOWN_CUSTOM_BLOCKS } from '../src/services/gzhCompiler';
import { SYNTAX_GROUPS } from '../src/data/syntaxReference';
import {
  APP_INFO,
  APP_FEATURES,
  APP_STACK,
  APP_CREDITS,
  APP_OWNER,
  APP_CONTACTS,
  getContacts,
} from '../src/data/appInfo';
import { resolveTokens } from '../src/services/themeTokens';
import { encodeThemeShare, decodeThemeShare } from '../src/utils/themeShare';
import { tokenizeCss, highlightCss, detectCompletionContext } from '../src/utils/cssHighlight';
import { analyzeCustomCss } from '../src/utils/customCss';
import {
  buildPromoMarkdown,
  isPromoReady,
  DEFAULT_PROMO,
  QR_MAX_BYTES,
  type PromoConfig,
} from '../src/services/promoService';
import {
  hexToRgb,
  rgbToHex,
  rgba,
  mix,
  adjustSaturation,
  contrastRatio,
  relativeLuminance,
  ensureContrast,
  isDarkBackground,
  deriveColorScheme,
  presetsForBackground,
  PALETTE_PRESETS,
} from '../src/services/colorHarmony';
import {
  computeEditorProgress,
  computePreviewScrollTop,
  alignmentError,
} from '../src/utils/scrollSync';
import {
  resolveEndpointUrl,
  redactSecret,
  classifyAIError,
  buildAIHeaders,
  isEmptyConfigPatch,
  AI_SERVICES,
  IMAGE_SERVICES,
} from '../electron/ai';
import {
  TOOLBOX_SYSTEM_PROMPT,
  OPTIMIZE_DEFAULT_PROMPT,
  buildToolboxMessages,
} from '../src/services/aiPrompts';
import type { ThemeConfig, BackgroundSettings } from '../src/types';

declare global {
  interface Window {
    __RESULT__: { passed: number; failed: number; lines: string[]; done: boolean };
  }
}

const BG: BackgroundSettings = {
  type: 'none',
  color: '#ffffff',
  patternColor: '#cbd5e1',
  opacity: 0.3,
  scale: 24,
  applyToWechat: true,
};

const out: string[] = [];
let passed = 0;
let failed = 0;

function ok(name: string, cond: boolean, detail = '') {
  if (cond) {
    passed++;
    out.push(`PASS  ${name}${detail ? `  (${detail})` : ''}`);
  } else {
    failed++;
    out.push(`FAIL  ${name}${detail ? `  (${detail})` : ''}`);
  }
}

function eq(name: string, actual: unknown, expected: unknown) {
  ok(name, actual === expected, `got ${JSON.stringify(actual)} / want ${JSON.stringify(expected)}`);
}

/**
 * 容差比较（px）。
 * Chromium 会把非整数边框宽度吸附到设备像素网格（本机 DPR 1.25 时
 * 3.5px → 3.2px），font-size 等则不吸附——所以对边框类断言必须留容差。
 */
function approxPx(name: string, actual: string, expected: number, tol = 0.5) {
  const v = parseFloat(actual);
  ok(name, Number.isFinite(v) && Math.abs(v - expected) <= tol, `got ${actual} / want ~${expected}px`);
}

/** 颜色容差比较：rgb 通道 ±1、alpha ±0.005（浏览器对 alpha 做 8 位量化） */
function approxRgba(name: string, actual: string, expected: [number, number, number], alpha?: number) {
  const m = actual.match(/rgba?\(([^)]+)\)/);
  if (!m) return ok(name, false, `无法解析颜色: ${actual}`);
  const parts = m[1].split(',').map((s) => parseFloat(s.trim()));
  const channelsOk = expected.every((c, i) => Math.abs((parts[i] ?? -999) - c) <= 1);
  const alphaOk = alpha === undefined || Math.abs((parts[3] ?? 1) - alpha) <= 0.005;
  ok(name, channelsOk && alphaOk, `got ${actual} / want rgba(${expected.join(',')}${alpha !== undefined ? `,${alpha}` : ''})`);
}

/**
 * 色彩解析与对比度统一走 colorHarmony 的实现，不再在测试里另写一套 ——
 * 两份算法一旦有细微差异，测试就会出现「自己验自己」的假绿。
 */

/* ── 挂载容器：离屏但参与布局与样式计算 ── */
const host = document.createElement('div');
host.style.cssText = 'position:fixed;left:-99999px;top:0;width:700px;';
document.body.appendChild(host);

/** 把编译产物挂到 DOM，返回查询工具 */
function mount(html: string) {
  host.innerHTML = html;
  const root = host.querySelector('#gzh-article-root') as HTMLElement | null;
  const css = (el: Element | null, prop: string) =>
    el ? getComputedStyle(el as HTMLElement).getPropertyValue(prop).trim() : '<no-el>';
  return { root, css, raw: html };
}

/** 颜色归一：computed 值里 rgba(0, 0, 0, 0.04) 带空格，去掉空格统一比较 */
const normColor = (v: string) => v.replace(/\s+/g, '').toLowerCase();

const theme = (id: string): ThemeConfig => {
  const t = DEFAULT_THEMES.find((x) => x.id === id);
  if (!t) throw new Error(`主题不存在: ${id}`);
  return t;
};

/* ══════════════ 1. 12 套内置主题：全部编译成功 + 根容器 + CSS 内联生效 ══════════════ */
out.push('=== 1. 内置主题编译 ===');
for (const t of DEFAULT_THEMES) {
  let html = '';
  try {
    html = compileWeChatMarkdown(SAMPLE_MARKDOWN, t, BG, { convertLinksToFootnotes: false });
  } catch (e) {
    ok(`${t.id} 编译`, false, String(e));
    continue;
  }
  const { root } = mount(html);
  ok(
    `${t.id} 编译 + 根容器`,
    html.length > 500 && !!root && root.id === 'gzh-article-root',
    `${html.length}B`
  );
}

/* ══════════════ 2. 零回归：classic-minimal（无 tokens）关键视觉值 ══════════════ */
out.push('');
out.push('=== 2. 零回归（classic-minimal 未声明 tokens） ===');
{
  const t = theme('classic-minimal');
  const html = compileWeChatMarkdown(SAMPLE_MARKDOWN, t, BG, { convertLinksToFootnotes: false });
  const { root, css } = mount(html);

  const p = host.querySelector('p');
  const h1 = host.querySelector('h1');
  const h2 = host.querySelector('h2');
  const h3 = host.querySelector('h3');
  const bq = host.querySelector('blockquote');
  const pre = host.querySelector('pre');
  const th = host.querySelector('th');
  const img = host.querySelector('img');
  const code = host.querySelector('p code, li code');

  eq('root 内边距 20px 16px', css(root, 'padding'), '20px 16px');
  eq('root 最大宽度 677px', css(root, 'max-width'), '677px');
  eq('正文段落 font-size', css(p, 'font-size'), '15px');
  eq('正文段落 text-align', css(p, 'text-align'), 'justify');
  eq('正文段落 margin-bottom', css(p, 'margin-bottom'), '16px');
  eq('正文段落 text-indent（默认不缩进）', css(p, 'text-indent'), '0px');
  eq('H1 font-size', css(h1, 'font-size'), '22px');
  eq('H1 margin-top', css(h1, 'margin-top'), '28px');
  eq('H1 margin-bottom', css(h1, 'margin-bottom'), '16px');
  eq('H2 font-size', css(h2, 'font-size'), '18px');
  eq('H2 margin-top（主题令牌 30px）', css(h2, 'margin-top'), '30px');
  eq('H3 font-size', css(h3, 'font-size'), '16px');
  eq('H3 颜色 = secondaryColor', normColor(css(h3, 'color')), 'rgb(85,85,85)');
  eq('引用 font-size', css(bq, 'font-size'), '14.5px');
  approxPx('引用 border-left-width', css(bq, 'border-left-width'), 3.5);
  approxRgba('引用底色 rgba(0,0,0,0.025)', css(bq, 'background-color'), [0, 0, 0], 0.025);
  eq('代码块底色（mac-dark）', normColor(css(pre, 'background-color')), 'rgb(30,30,46)');
  eq('代码块字号', css(pre, 'font-size'), '13px');
  eq('表头底色 rgba(0,0,0,0.04)', normColor(css(th, 'background-color')), 'rgba(0,0,0,0.04)');
  eq('表头内边距 10px 14px', css(th, 'padding'), '10px 14px');
  eq('图片圆角 6px', css(img, 'border-radius'), '6px');
  eq('行内代码字号 13.5px', css(code, 'font-size'), '13.5px');
  ok('分隔线仍是星标样式', html.includes('✦ ✦ ✦'));
  ok('代码块仍带终端圆点栏', html.includes('#ff5f56'));

  // 版式块圆角（需要带 :::block 的内容才体现，故单独编译一次）
  const blockHtml = compileWeChatMarkdown(
    ':::card\n卡片标题\n\n卡片正文\n:::\n\n:::callout\n提示内容\n:::',
    t,
    BG,
    { convertLinksToFootnotes: false }
  );
  mount(blockHtml);
  ok('版式块圆角 12px 生效', blockHtml.includes('border-radius: 12px'));
  ok('版式块描边色取自令牌', blockHtml.includes('border: 1px solid rgba(0,0,0,0.08)'));

  // 恢复第 2 组的主体 DOM，避免后续断言读到块内容
  mount(html);

  // 根容器的数字字形修正不能被改动（上轮修复）
  ok(
    '根容器保留 lining-nums 修正',
    (root?.getAttribute('style') ?? '').includes('font-variant-numeric: lining-nums tabular-nums')
  );
}

/* ══════════════ 3. 零回归：学术论文 / 东方笺谱（缩进已迁移为令牌） ══════════════ */
out.push('');
out.push('=== 3. 缩进主题（customCss → 令牌 的等价迁移） ===');
{
  const t = theme('academic-paper'); // fontSize 15px → 2em = 30px
  const { css } = mount(compileWeChatMarkdown(SAMPLE_MARKDOWN, t, BG, { convertLinksToFootnotes: false }));
  const p = host.querySelector('p');
  eq('学术论文 text-indent = 30px（2em × 15px）', css(p, 'text-indent'), '30px');
  eq('学术论文 text-align', css(p, 'text-align'), 'justify');
  eq('学术论文 段落间距 14px', css(p, 'margin-bottom'), '14px');
  eq('学术论文 H2 margin-top 34px', css(host.querySelector('h2'), 'margin-top'), '34px');
  eq('学术论文 H3 margin-top 24px', css(host.querySelector('h3'), 'margin-top'), '24px');

  // 引用块内段落必须清零缩进
  const bqP = host.querySelector('blockquote p');
  eq('引用块内段落 text-indent = 0', css(bqP, 'text-indent'), '0px');

  // customCss 仍然叠加生效（h2 letter-spacing）
  eq('学术论文 customCss 仍生效', css(host.querySelector('h2'), 'letter-spacing'), '0.3px');
}
{
  const t = theme('oriental-letter'); // fontSize 16px → 2em = 32px
  const { css } = mount(compileWeChatMarkdown(SAMPLE_MARKDOWN, t, BG, { convertLinksToFootnotes: false }));
  const p = host.querySelector('p');
  eq('东方笺谱 text-indent = 32px（2em × 16px）', css(p, 'text-indent'), '32px');
  eq('东方笺谱 段落间距 18px', css(p, 'margin-bottom'), '18px');
}

/* ══════════════ 4. 令牌可调：改 tokens 产物必须随之变化 ══════════════ */
out.push('');
out.push('=== 4. 令牌可调性 ===');
{
  const base = theme('classic-minimal');
  const tuned: ThemeConfig = {
    ...base,
    tokens: {
      h1Size: '28px',
      h2Size: '20px',
      h3Size: '17px',
      headingColor: '#123456',
      linkColor: '#654321',
      strongColor: '#ff0000',
      paragraphSpacing: '30px',
      firstLineIndent: '2em',
      imageRadius: '16px',
      imageAlign: 'left',
      blockRadius: '4px',
      codeBlockRadius: '2px',
      codeShowBar: false,
      hrStyle: 'solid',
      contentPadding: '30px 24px',
      contentMaxWidth: '600px',
      quoteBgColor: '#f0f0f0',
      quoteFontSize: '17px',
      tableFontSize: '12px',
    },
  };
  const html = compileWeChatMarkdown(SAMPLE_MARKDOWN, tuned, BG, { convertLinksToFootnotes: false });
  const { root, css } = mount(html);

  eq('H1 字号被令牌改写', css(host.querySelector('h1'), 'font-size'), '28px');
  eq('H2 字号被令牌改写', css(host.querySelector('h2'), 'font-size'), '20px');
  eq('H3 字号被令牌改写', css(host.querySelector('h3'), 'font-size'), '17px');
  eq('标题色被令牌改写', normColor(css(host.querySelector('h1'), 'color')), 'rgb(18,52,86)');
  eq('加粗色被令牌改写', normColor(css(host.querySelector('strong'), 'color')), 'rgb(255,0,0)');
  eq('链接色被令牌改写', normColor(css(host.querySelector('a'), 'color')), 'rgb(101,67,33)');
  eq('段落间距被令牌改写', css(host.querySelector('p'), 'margin-bottom'), '30px');
  eq('段首缩进 2em = 30px', css(host.querySelector('p'), 'text-indent'), '30px');
  eq('图片圆角被令牌改写', css(host.querySelector('img'), 'border-radius'), '16px');
  eq('图片左对齐', css(host.querySelector('img').parentElement, 'text-align'), 'left');
  eq('引用底色被令牌改写（hex→rgb）', normColor(css(host.querySelector('blockquote'), 'background-color')), 'rgb(240,240,240)');
  eq('引用字号被令牌改写', css(host.querySelector('blockquote'), 'font-size'), '17px');
  eq('表格字号被令牌改写', css(host.querySelector('table'), 'font-size'), '12px');
  eq('容器内边距被令牌改写', css(root, 'padding'), '30px 24px');
  eq('容器最大宽度被令牌改写', css(root, 'max-width'), '600px');
  ok('终端圆点栏已关闭', !html.includes('#ff5f56'));
  ok('分隔线改为实线 <hr>', /<hr[^>]*border-top:\s*1px solid/.test(html));

  const blockTuned = compileWeChatMarkdown(
    ':::card\n卡片标题\n\n卡片正文\n:::\n\n:::callout\n提示\n:::',
    tuned,
    BG,
    { convertLinksToFootnotes: false }
  );
  ok('块圆角被令牌改写为 4px', blockTuned.includes('border-radius: 4px'));
}

/* ══════════════ 5. resolveTokens 回填语义色 ══════════════ */
out.push('');
out.push('=== 5. resolveTokens 语义回填 ===');
{
  const t = theme('classic-minimal');
  const r = resolveTokens(t);
  eq('headingColor 回填 primaryColor', r.headingColor, t.primaryColor);
  eq('h3Color 回填 secondaryColor', r.h3Color, t.secondaryColor);
  eq('linkColor 回填 accentColor', r.linkColor, t.accentColor);
  eq('codeBgColor 由 codeTheme 决定（dark）', r.codeBgColor, '#1e1e2e');

  const light = resolveTokens({ ...t, codeTheme: 'mac-light' });
  eq('codeBgColor 由 codeTheme 决定（light）', light.codeBgColor, '#f8fafc');

  const overridden = resolveTokens({ ...t, tokens: { linkColor: '#abcdef' } });
  eq('显式声明的令牌优先于回填', overridden.linkColor, '#abcdef');
}

/* ══════════════ 6. 自定义 CSS 仍为最终仲裁者 ══════════════ */
out.push('');
out.push('=== 6. customCss 覆盖令牌 ===');
{
  const t: ThemeConfig = {
    ...theme('classic-minimal'),
    tokens: { h1Size: '28px' },
    customCss: '#gzh-article-root h1 { font-size: 40px !important; }',
  };
  const { css } = mount(compileWeChatMarkdown(SAMPLE_MARKDOWN, t, BG, { convertLinksToFootnotes: false }));
  eq('customCss 覆盖令牌（含 !important）', css(host.querySelector('h1'), 'font-size'), '40px');
}

/* ══════════════ 7. 分享码：编码 / 解码 / 容错 ══════════════ */
out.push('');
out.push('=== 7. 主题分享码 ===');
{
  const src: ThemeConfig = {
    ...theme('morandi-forest'),
    builtin: true,
    customCss: '#gzh-article-root p { margin: 17px 0; }',
    tokens: { paragraphSpacing: '17px', h3MarginTop: '24px' },
  };

  const code = encodeThemeShare(src);
  ok('分享码带前缀', code.startsWith('GZH-THEME-1:'));
  ok('分享码为 base64url（无 + / =）', !/[+/=]/.test(code.slice('GZH-THEME-1:'.length)));

  const back = decodeThemeShare(code);
  ok('分享码可往返解析', !!back);
  eq('名称一致', back?.name, src.name);
  eq('主色一致', back?.primaryColor, src.primaryColor);
  eq('行高一致', back?.lineHeight, src.lineHeight);
  eq('customCss 一致', back?.customCss, src.customCss);
  eq('tokens 段落间距一致', back?.tokens?.paragraphSpacing, '17px');
  eq('tokens 三级标题间距一致', back?.tokens?.h3MarginTop, '24px');
  eq('builtin 被剥离（导入后即自定义）', back?.builtin, false);
  ok('id 被重新分配（避免与本地主题撞车）', !!back?.id && back.id !== src.id);

  // 容错
  const bare = code.slice('GZH-THEME-1:'.length);
  ok('无前缀的裸码也能解析', !!decodeThemeShare(bare));
  ok('直接粘贴 JSON 也能解析', !!decodeThemeShare(JSON.stringify({ name: 'X', primaryColor: '#000000' })));
  eq('空字符串返回 null', decodeThemeShare('   '), null);
  eq('乱码返回 null', decodeThemeShare('这不是分享码'), null);
  eq('缺字段的 JSON 返回 null', decodeThemeShare(JSON.stringify({ hello: 'world' })), null);
}

/* ══════════════ 8. 主题库完整性 + 可读性 ══════════════ */
out.push('');
out.push('=== 8. 主题库完整性 ===');
{
  ok('主题数量 ≥ 28', DEFAULT_THEMES.length >= 28, `${DEFAULT_THEMES.length} 套`);

  const ids = DEFAULT_THEMES.map((t) => t.id);
  eq('主题 id 无重复', new Set(ids).size, ids.length);
  const names = DEFAULT_THEMES.map((t) => t.name);
  eq('主题名无重复', new Set(names).size, names.length);

  const missingCategory = DEFAULT_THEMES.filter((t) => !t.category);
  eq('每套主题都有分类', missingCategory.length, 0);

  const validCats = new Set(THEME_CATEGORIES.map((c) => c.id));
  const badCat = DEFAULT_THEMES.filter((t) => !validCats.has(t.category as any));
  eq('分类都在已定义列表内', badCat.length, 0);

  // 每个分类都得有主题，否则筛选条上会出现一个点了没结果的空分类
  const used = new Set(DEFAULT_THEMES.map((t) => t.category));
  eq('每个分类至少 1 套', THEME_CATEGORIES.filter((c) => !used.has(c.id)).length, 0);

  const shortDesc = DEFAULT_THEMES.filter((t) => (t.description ?? '').length < 12);
  eq('每套主题都有像样的描述', shortDesc.length, 0);

  const missingEn = DEFAULT_THEMES.filter((t) => !t.englishName);
  eq('每套主题都有英文名', missingEn.length, 0);

  // 正文对比度（WCAG AA 要求 4.5:1）—— 深色主题最容易在这里翻车
  const lowContrast: string[] = [];
  for (const t of DEFAULT_THEMES) {
    const ratio = contrastRatio(t.primaryColor, t.backgroundColor);
    if (ratio < 4.5) lowContrast.push(`${t.id}(${ratio.toFixed(2)})`);
  }
  ok('正文与底色对比度 ≥ 4.5:1', lowContrast.length === 0, lowContrast.join(', '));

  // 引言块文字 vs 底色也要求可读（次要色标准放宽到 3:1）
  const lowQuote: string[] = [];
  for (const t of DEFAULT_THEMES) {
    const tk = resolveTokens(t);
    const ratio = contrastRatio(tk.quoteTextColor, t.backgroundColor);
    if (ratio < 3) lowQuote.push(`${t.id}(${ratio.toFixed(2)})`);
  }
  ok('引用文字对比度 ≥ 3:1', lowQuote.length === 0, lowQuote.join(', '));
}

/* ══════════════ 9. CSS 高亮：绝不丢字符 ══════════════ */
out.push('');
out.push('=== 9. CSS 高亮 tokenizer ===');
{
  /**
   * 这是本组最关键的断言。
   * 高亮层与 textarea 是两层叠加，只要 tokenizer 少吞/多吐一个字符，
   * 用户看到的光标位置就会与文字错位 —— 而且越往后错得越多。
   * 所以「token 文本拼回去必须与原文逐字相等」是硬性不变量。
   */
  const samples: Array<[string, string]> = [
    ['空字符串', ''],
    ['单条规则', 'p { margin: 16px 0; }'],
    ['多条规则', 'p { margin: 16px 0; }\nh2 { color: #123456; }'],
    ['带注释', '/* 说明 */\np { color: red; }'],
    ['注释里含花括号', '/* { } 陷阱 */\np { color: #fff; }'],
    ['@media 嵌套', '@media (max-width:600px) { p { color: red; } }'],
    ['顶层 @import', '@import url("a.css");\np { color: blue; }'],
    ['!important', 'p { color: red !important; }'],
    ['块未闭合', 'p { color: red;'],
    ['只有选择器', 'p'],
    ['两个选择器', 'p, h2 { margin: 0; }'],
    ['中文注释与值', '/* 中文 */\np { font-family: "宋体", serif; }'],
    ['多空格与制表', '\n\n  p   {\n\tcolor :  red ;\n  }\n'],
    ['函数值', 'p { color: rgba(0, 0, 0, 0.05); width: calc(100% - 20px); }'],
    ['emoji 与特殊字符', 'p { content: "✨"; }'],
    ['裸分号', ';;p { a: b };;;'],
  ];

  for (const [label, src] of samples) {
    const rebuilt = tokenizeCss(src)
      .map((tk) => tk.text)
      .join('');
    eq(`tokenizer 不丢字符：${label}`, rebuilt, src);
  }

  // 高亮函数必须转义，否则用户 CSS 里的 `<` 会变成真标签
  const evil = highlightCss('p { content: "<img src=x onerror=alert(1)>"; }');
  ok('高亮输出已转义尖括号', !evil.includes('<img') && evil.includes('&lt;img'));
  ok('高亮输出以换行结尾（保证行数与 textarea 一致）', evil.endsWith('\n'));

  // 着色确实发生了
  const colored = highlightCss('p { margin: 16px 0; color: #07C160; }');
  ok('选择器被着色', colored.includes('ck-sel'));
  ok('属性名被着色', colored.includes('ck-prop'));
  ok('数值被着色', colored.includes('ck-num'));
  ok('hex 颜色被着色', colored.includes('ck-color'));
  ok('注释被着色', highlightCss('/* a */ p{}').includes('ck-cmt'));
  ok('!important 被着色', highlightCss('p { color: red !important; }').includes('ck-bang'));
}

/* ══════════════ 10. 补全上下文判定 ══════════════ */
out.push('');
out.push('=== 10. 补全上下文 ===');
{
  const at = (text: string) => detectCompletionContext(text, text.length);

  eq('块外 → 补选择器', at('p').kind, 'selector');
  eq('块内写属性名 → 补属性', at('p { mar').kind, 'prop');
  eq('块内带连字符 → 补属性', at('p { font-').kind, 'prop');
  eq('冒号后 → 不补属性', at('p { margin: ').kind, 'value');
  eq('分号后新声明 → 补属性', at('p { margin: 0; col').kind, 'prop');

  const ctx = at('p { mar');
  eq('候选起点正确', 'p { mar'.slice(ctx.start), 'mar');
  eq('候选词正确', ctx.word, 'mar');
}

/* ══════════════ 11. 自定义 CSS 诊断 ══════════════ */
out.push('');
out.push('=== 11. 自定义 CSS 诊断 ===');
{
  eq('空 CSS 无告警', analyzeCustomCss('')?.issues.length, 0);

  const okCss = analyzeCustomCss('p { margin: 16px 0; color: #123456; }');
  eq('正常 CSS 无告警', okCss.issues.length, 0);
  eq('正常 CSS 规则数', okCss.rules, 1);
  eq('正常 CSS 声明数', okCss.declarations, 2);

  const media = analyzeCustomCss('@media (max-width:600px) { p { color: red; } }');
  ok('@media 给出告警', media.issues.some((i) => i.level === 'warn' && i.message.includes('@media')));

  const noValue = analyzeCustomCss('p { color: }');
  ok('「无值」被识别', noValue.issues.some((i) => i.message.includes('没有值')));

  const noColon = analyzeCustomCss('p { color red; }');
  ok('「缺冒号」被识别', noColon.issues.some((i) => i.message.includes('冒号')));

  const unbalanced = analyzeCustomCss('p { color: red;');
  ok('「括号未配平」被识别', unbalanced.issues.some((i) => i.message.includes('花括号')));

  const evil = analyzeCustomCss('p { color: expression(alert(1)); }');
  ok('危险值被拦下并提示', evil.issues.some((i) => i.message.includes('安全')));

  const important = analyzeCustomCss('p { color: red !important; }');
  eq('!important 不算错误且正常计数', important.issues.length, 0);

  const commented = analyzeCustomCss('/* color: ; 注释里不算错 */ p { margin: 0; }');
  eq('注释内容不参与诊断', commented.issues.length, 0);
}

/* ══════════════ 12. 语法速查内容必须与实现一致 ══════════════ */
out.push('');
out.push('=== 12. 语法速查（文档 ↔ 实现 一致性） ===');
{
  /**
   * 这一组的意义：把「使用说明里写的语法」和「编译器真正支持的语法」钉在一起。
   * 否则文档会随迭代悄悄失真 —— 用户照着说明写却渲染不出来，是最伤人的 bug。
   */
  const all = SYNTAX_GROUPS.flatMap((g) => g.items.map((it) => ({ ...it, group: g.title })));
  ok('语法速查条目 ≥ 30 条', all.length >= 30, `${all.length} 条 / ${SYNTAX_GROUPS.length} 个分类`);

  const emptyDesc = all.filter((it) => !it.desc || it.desc.length < 6);
  eq('每条都有像样的说明', emptyDesc.length, 0);

  // 1. 所有 ::: 块示例必须能通过语法体检（块名正确 + 闭合完整）
  const blockItems = all.filter((it) => it.syntax.includes(':::'));
  const badBlocks: string[] = [];
  for (const it of blockItems) {
    // 「块名拼错会提示」那条是故意写错的样例，见下面的反向断言
    if (it.label.includes('拼错')) continue;
    const errs = validateCustomBlocks(it.syntax);
    if (errs.length > 0) badBlocks.push(`${it.label}(${errs.map((e) => e.reason).join(',')})`);
  }
  eq('排版块示例全部通过语法体检', badBlocks.length, 0);
  ok('排版块示例数量 ≥ 11', blockItems.length >= 11, `${blockItems.length} 条`);

  // 2. 反向断言：故意写错的示例必须真能被检出，否则说明体检功能本身失效了
  const typoItem = all.find((it) => it.label.includes('拼错'));
  ok('存在「块名拼错」示例', !!typoItem);
  if (typoItem) {
    const errs = validateCustomBlocks(typoItem.syntax);
    ok('拼错的块名确实被体检检出', errs.some((e) => e.reason === 'unknown'), JSON.stringify(errs));
  }

  // 3. 每条示例都要能编译成功且产物非空
  const failed: string[] = [];
  for (const it of all) {
    try {
      const html = compileWeChatMarkdown(it.syntax, DEFAULT_THEMES[0], BG, {
        convertLinksToFootnotes: false,
      });
      if (!html || html.length < 10) failed.push(`${it.label}(空产物)`);
    } catch (e) {
      failed.push(`${it.label}(${String(e)})`);
    }
  }
  eq('全部示例可编译', failed.length, 0);

  // 4. 关键能力必须真的生效（不是「写了但没渲染」）
  const render = (md: string) =>
    compileWeChatMarkdown(md, DEFAULT_THEMES[0], BG, { convertLinksToFootnotes: false });
  const byLabel = (label: string) => all.find((it) => it.label === label)?.syntax ?? '';

  ok('头图卡片渲染出内容', render(byLabel('头图卡片')).includes('文章主标题'));
  ok('导读目录渲染出内容', render(byLabel('导读目录')).includes('第一部分标题'));
  ok('时间线渲染出内容', render(byLabel('时间线')).includes('项目启动'));
  ok('步骤条渲染出内容', render(byLabel('步骤条')).includes('注册账号'));
  ok('进度条渲染出百分比', /\d+%/.test(render(byLabel('进度条'))));
  ok('对比卡渲染出两侧栏目', render(byLabel('对比卡')).includes('方案 A'));
  ok('主题列表渲染出徽章', render(byLabel('主题列表')).includes('经典黑灰'));
  ok('文末署名渲染出内容', render(byLabel('文末署名')).includes('点赞'));
  ok('注音（^ 写法）渲染出 ruby', render(byLabel('注音（^ 写法）')).includes('<ruby>'));
  ok('注音（花括号写法）渲染出 ruby', render(byLabel('注音（花括号写法）')).includes('<ruby>'));
  ok('行内公式渲染出公式容器', render(byLabel('行内公式')).includes('katex'));
  ok('块级公式渲染出公式容器', render(byLabel('块级公式')).includes('katex'));
  // NOTE 块渲染出的不是英文 "NOTE"，而是中文标签 + 专属配色，这里两样都验
  const noteHtml = render(byLabel('提示块（GFM 警告块）'));
  ok('GFM 提示块渲染出中文标签', noteHtml.includes('提示'));
  ok('GFM 提示块渲染出专属配色', noteHtml.includes('#0969da'));
  ok('GFM 提示块渲染出正文', noteHtml.includes('补充说明的内容'));

  // 五种警告块都要能用（只用 NOTE 举例说明，但实现必须五种齐全）
  const alertTypes: Array<[string, string, string]> = [
    ['NOTE', '#0969da', '提示'],
    ['TIP', '#1a7f37', '技巧'],
    ['WARNING', '#9a6700', '警告'],
    ['IMPORTANT', '#8250df', '重要'],
    ['CAUTION', '#cf222e', '注意'],
  ];
  const brokenAlerts = alertTypes.filter(([type, color, label]) => {
    const html = render(`> [!${type}]\n> 内容`);
    return !html.includes(color) || !html.includes(label);
  });
  eq('五种警告块全部生效', brokenAlerts.length, 0);
  ok('表格渲染出 th', render(byLabel('表格')).includes('<th'));
  ok('代码块渲染出圆点栏', render(byLabel('代码块')).includes('#ff5f56'));
  ok('分隔线渲染出星标', render(byLabel('分隔线')).includes('✦'));
  ok('图片图注渲染出说明文字', render(byLabel('图片')).includes('图片说明文字'));
  ok('Mermaid 代码块被识别', /mermaid/i.test(render(byLabel('Mermaid 图表'))));
}

/* ══════════════ 13. 公众号推广位：生成与渲染 ══════════════ */
out.push('');
out.push('=== 13. 推广位（配置 → Markdown → 渲染） ===');
{
  const full: PromoConfig = {
    enabled: true,
    accountName: '宝藏排版研究所',
    qrImage: 'data:image/png;base64,iVBORw0KGgo=',
    footerTitle: '— 感谢您的细心阅读 —',
    guideText: '如果这篇内容对你有帮助，欢迎**点赞**和**在看**。',
    slogan: '扫码关注，获取更多干货',
  };

  eq('未配置时 isPromoReady = false', isPromoReady(DEFAULT_PROMO), false);
  eq('填了公众号名即算已配置', isPromoReady({ ...DEFAULT_PROMO, accountName: 'X' }), true);
  eq('仅上传二维码也算已配置', isPromoReady({ ...DEFAULT_PROMO, qrImage: 'data:image/png;base64,AA' }), true);
  eq('只有空白字符不算已配置', isPromoReady({ ...DEFAULT_PROMO, accountName: '   ' }), false);

  const md = buildPromoMarkdown(full);
  ok('生成结果用 :::footer 包裹', md.startsWith(':::footer') && md.endsWith(':::'));
  ok('包含公众号名', md.includes('宝藏排版研究所'));
  ok('包含二维码图片语法', md.includes('![宝藏排版研究所](data:image/png'));
  ok('包含引导语（保留加粗标记）', md.includes('**点赞**'));
  ok('包含一句话', md.includes('扫码关注，获取更多干货'));
  eq('生成的 Markdown 通过语法体检', validateCustomBlocks(md).length, 0);

  // 渲染层：粘贴到公众号后要能真正看到内容
  const html = compileWeChatMarkdown(md, DEFAULT_THEMES[0], BG, { convertLinksToFootnotes: false });
  ok('渲染出品牌名', html.includes('宝藏排版研究所'));
  ok('渲染出二维码 img', html.includes('<img') && html.includes('data:image/png'));
  ok('渲染出加粗的引导语', html.includes('<strong') && html.includes('点赞'));
  ok('图片宽度自适应（不撑破手机屏）', html.includes('max-width: 100%'));

  // 边界：极简配置也要能生成，不能产出空块
  const minimal = buildPromoMarkdown({ ...DEFAULT_PROMO, accountName: '只有名字' });
  ok('只有公众号名也能生成', minimal.includes('只有名字') && validateCustomBlocks(minimal).length === 0);

  const bare = buildPromoMarkdown({ ...DEFAULT_PROMO, footerTitle: '', guideText: '', slogan: '' });
  ok('全空配置有兜底文案（不产出空块）', bare.includes('感谢阅读') && validateCustomBlocks(bare).length === 0);

  ok('二维码体积上限设置合理（≤512KB）', QR_MAX_BYTES <= 512 * 1024, `${QR_MAX_BYTES / 1024}KB`);
}

/* ══════════════ 14. 关于页内容：不能与实现脱节、不能带占位符 ══════════════ */
out.push('');
out.push('=== 14. 关于页内容质量 ===');
{
  // 1. 介绍里的数字必须与实际功能一致（主题从 12 加到 28 时就差点忘改介绍）
  const themeFeature = APP_FEATURES.find((f) => f.title.includes('主题'));
  ok(
    '介绍里的主题套数与实际一致',
    !!themeFeature && themeFeature.title.includes(`${DEFAULT_THEMES.length} 套`),
    `实际 ${DEFAULT_THEMES.length} 套，文案：${themeFeature?.title ?? '未找到'}`
  );

  const blockFeature = APP_FEATURES.find((f) => f.title.includes('排版块'));
  ok(
    '介绍里的排版块数量与实际一致',
    !!blockFeature && blockFeature.title.includes(`${KNOWN_CUSTOM_BLOCKS.length} 个`),
    `实际 ${KNOWN_CUSTOM_BLOCKS.length} 个，文案：${blockFeature?.title ?? '未找到'}`
  );

  // 2. 排版块描述里列举的英文块名必须都在实现里（写错一个，用户照着找就找不到）
  const knownSet = new Set<string>(KNOWN_CUSTOM_BLOCKS as readonly string[]);
  const mentioned = (blockFeature?.desc ?? '').match(/[a-z]{3,}/g) ?? [];
  const unknownMentioned = mentioned.filter((w) => !knownSet.has(w));
  ok('排版块描述里没有拼错的块名', unknownMentioned.length === 0, unknownMentioned.join(','));

  // 3. 产品介绍文案不得含未替换的占位符 —— 这类东西跟着产品发出去很尴尬
  //    （只查介绍文案，不查 APP_CONTACTS / APP_OWNER：那是作者正在填的个人信息，
  //      用示例值过渡是正常的，不该把构建卡住）
  const aboutText = JSON.stringify({ APP_INFO, APP_FEATURES, APP_STACK, APP_CREDITS });
  const placeholders = ['example.com', 'XXX', 'TODO', '你的公众号', 'yourname', '待填写'];
  const leaked = placeholders.filter((ph) => aboutText.includes(ph));
  ok('关于页介绍文案不含未替换的占位符', leaked.length === 0, leaked.join(','));

  // 4. 数据完整性
  ok('核心能力条目都有标题与说明', APP_FEATURES.every((f) => f.title && f.desc.length > 8), `${APP_FEATURES.length} 条`);
  ok('技术栈非空', APP_STACK.length > 0, `${APP_STACK.length} 项`);
  ok('致谢条目都有名称与说明', APP_CREDITS.every((c) => c.name && c.desc));
  ok(
    '联系方式每条都有 label 或 value',
    APP_CONTACTS.every((c) => (c.label ?? '').trim() || (c.value ?? '').trim()),
    `${APP_CONTACTS.length} 条`
  );

  // 5. 可选入口：要么留空（UI 隐藏），要么是合法 URL，不能是半截字符串
  const optionalOwnerFields: Array<[string, string]> = [
    ['repoUrl', APP_OWNER.repoUrl],
    ['feedbackUrl', APP_OWNER.feedbackUrl],
    ['donateUrl', APP_OWNER.donateUrl],
  ];
  ok(
    '可选入口留空或为合法 URL',
    optionalOwnerFields.every(([, v]) => v === '' || /^https?:\/\//.test(v)),
    optionalOwnerFields.map(([k, v]) => `${k}=${v || '空'}`).join(' ')
  );

  // 6. getContacts 的覆盖逻辑（调试用 override，脏数据必须安全回退）
  const OVERRIDE_KEY = 'gzh_editor_contacts_override_v1';
  const backup = localStorage.getItem(OVERRIDE_KEY);
  try {
    localStorage.removeItem(OVERRIDE_KEY);
    eq('无 override 时返回 APP_CONTACTS', getContacts().length, APP_CONTACTS.length);

    localStorage.setItem(OVERRIDE_KEY, JSON.stringify([{ type: 'email', label: 'X', value: 'x@y.com' }]));
    eq('override 生效', getContacts().length, 1);
    eq('override 内容正确', getContacts()[0].label, 'X');

    localStorage.setItem(OVERRIDE_KEY, '{ 这不是 JSON');
    eq('脏数据回退到 APP_CONTACTS', getContacts().length, APP_CONTACTS.length);

    localStorage.setItem(OVERRIDE_KEY, JSON.stringify({ notAnArray: true }));
    eq('非数组也回退到 APP_CONTACTS', getContacts().length, APP_CONTACTS.length);
  } finally {
    if (backup === null) localStorage.removeItem(OVERRIDE_KEY);
    else localStorage.setItem(OVERRIDE_KEY, backup);
  }
}

/* ══════════════ 15. 一键配色：主色派生引擎 ══════════════ */
out.push('');
out.push('=== 15. 色彩派生引擎 ===');
{
  // 1. 基础色彩转换
  eq('hexToRgb 解析 6 位', JSON.stringify(hexToRgb('#2563EB')), JSON.stringify({ r: 37, g: 99, b: 235 }));
  eq('hexToRgb 解析 3 位缩写', JSON.stringify(hexToRgb('#fff')), JSON.stringify({ r: 255, g: 255, b: 255 }));
  eq('hexToRgb 非法输入回退黑', JSON.stringify(hexToRgb('zzz')), JSON.stringify({ r: 0, g: 0, b: 0 }));
  eq('rgbToHex 与 hexToRgb 往返一致', rgbToHex(hexToRgb('#2563EB')), '#2563eb');
  eq('mix 取 0 返回原色', mix('#FF0000', '#0000FF', 0).toLowerCase(), '#ff0000');
  eq('mix 取 1 返回目标色', mix('#FF0000', '#0000FF', 1).toLowerCase(), '#0000ff');
  eq('mix 中点计算正确', mix('#000000', '#FFFFFF', 0.5).toLowerCase(), '#808080');
  eq('rgba 保留三位小数', rgba('#000000', 0.125), 'rgba(0, 0, 0, 0.125)');
  eq('rgba 对越界 alpha 做钳制', rgba('#000', 2), 'rgba(0, 0, 0, 1)');
  eq('饱和度调整保持合法色值', /^#[0-9a-f]{6}$/.test(adjustSaturation('#2563EB', -0.3)), true);

  // 2. WCAG 对比度
  ok('白字黑底 = 21:1（标准值）', Math.abs(contrastRatio('#FFFFFF', '#000000') - 21) < 0.01);
  ok('同色对比度 = 1:1', Math.abs(contrastRatio('#123456', '#123456') - 1) < 0.001);

  // 3. 对比度保护
  ok(
    'ensureContrast 把低对比色提亮到达标',
    contrastRatio(ensureContrast('#333333', '#ffffff'), '#ffffff') >= 4.5
  );
  ok('已达标的颜色原样返回（不做多余调整）', ensureContrast('#000000', '#ffffff') === '#000000');

  /**
   * 4. 核心不变量（穷举验证）
   *
   * 无论用户挑了什么主色、什么底色，派生出的**文字色**都必须达到 WCAG AA。
   * 这是本模块存在的全部意义 —— 用户不需要懂配色，工具替他兜底。
   */
  const backgrounds = ['#ffffff', '#fafafa', '#fffbeb', '#f7faf7', '#1a1a1a', '#0f172a', '#10201a'];
  const primaries = ['#000000', '#ffffff', '#ffff00', '#07C160', '#2563EB', '#C1272D', '#1a1a1a', '#e2e8f0'];
  const unreadable: string[] = [];
  let combos = 0;
  for (const bg of backgrounds) {
    for (const p of primaries) {
      combos++;
      const s = deriveColorScheme({ primary: p, background: bg });
      const textFields: Array<[string, string | undefined]> = [
        ['headingColor', s.tokens.headingColor],
        ['linkColor', s.tokens.linkColor],
        ['emColor', s.tokens.emColor],
        ['inlineCodeColor', s.tokens.inlineCodeColor],
        ['tableHeadColor', s.tokens.tableHeadColor],
        ['quoteTextColor', s.tokens.quoteTextColor],
        ['tableCellColor', s.tokens.tableCellColor],
        ['secondaryColor', s.secondaryColor],
      ];
      for (const [name, color] of textFields) {
        if (!color) continue;
        const r = contrastRatio(color, bg);
        if (r < 4.4) unreadable.push(`${p}@${bg} ${name}=${r.toFixed(2)}`);
      }
    }
  }
  ok(`穷举 ${combos} 组主色×底色，文字色全部达到 AA`, unreadable.length === 0, unreadable.slice(0, 3).join(' | '));

  // 5. 派生结构正确性
  const s1 = deriveColorScheme({ primary: '#07C160', background: '#ffffff', textColor: '#222222' });
  eq('accentColor 原样取主色', s1.accentColor, '#07C160');
  ok('次要色与主色不同（已降饱和）', s1.secondaryColor !== '#07C160');
  ok('引用底色使用主色 + 透明度', /^rgba\(\d+, \d+, \d+, 0\.0\d+\)$/.test(String(s1.tokens.quoteBgColor)), String(s1.tokens.quoteBgColor));
  ok('引用边线直接用主色', s1.tokens.quoteBorderColor === '#07C160');
  ok('表头底色使用主色 + 透明度', String(s1.tokens.tableHeadBgColor).startsWith('rgba('));
  ok('代码块配色未被改动', !s1.tokens.codeBgColor && !s1.tokens.codeTextColor);
  eq('产出 17 项派生色', Object.keys(s1.tokens).length, 17);

  // 6. 深色底的处理：装饰色透明度要比浅底更高才看得见
  const lightScheme = deriveColorScheme({ primary: '#07C160', background: '#ffffff' });
  const darkScheme = deriveColorScheme({ primary: '#22c55e', background: '#0f172a' });
  ok(
    '深色底的主色被提亮（保证可读）',
    relativeLuminance(String(darkScheme.tokens.headingColor)) > relativeLuminance(String(lightScheme.tokens.headingColor)),
    `${lightScheme.tokens.headingColor} → ${darkScheme.tokens.headingColor}`
  );
  ok('isDarkBackground 能区分深浅', isDarkBackground('#0f172a') && !isDarkBackground('#ffffff'));

  // 7. 预设色板
  ok('预设色板非空', PALETTE_PRESETS.length >= 12, `${PALETTE_PRESETS.length} 套`);
  const badPalette = PALETTE_PRESETS.filter((p) => !/^#[0-9a-f]{6}$/i.test(p.color) || !p.name);
  eq('预设色值均合法', badPalette.length, 0);
  const lightPresets = presetsForBackground('#ffffff');
  const darkPresets = presetsForBackground('#0f172a');
  ok('浅底只出现适配浅色的预设', lightPresets.every((p) => p.fit === 'both' || p.fit === 'light'));
  ok('深底只出现适配深色的预设', darkPresets.every((p) => p.fit === 'both' || p.fit === 'dark'));
  ok('通用预设两种底色都出现', lightPresets.some((p) => p.fit === 'both'));
}

/* ══════════════ 16. 滚动同步换算 ══════════════ */
out.push('');
out.push('=== 16. 编辑器 ↔ 预览 滚动同步 ===');
{
  // 边界：这三档决定了「滚到底时两边是否同时到底」
  eq('编辑器在顶部 → 进度 0', computeEditorProgress(0, 500, 2000), 0);
  eq('编辑器在顶部附近(1px) → 0', computeEditorProgress(1, 500, 2000), 0);
  eq('编辑器到底 → 进度 1', computeEditorProgress(1500, 500, 2000), 1);
  eq('编辑器底部附近(maxScroll-1) → 1', computeEditorProgress(1499, 500, 2000), 1);
  eq('内容不足一屏 → 进度 0', computeEditorProgress(0, 800, 800), 0);
  eq('空内容 → 进度 0', computeEditorProgress(0, 0, 0), 0);

  // 中间位置：视口中心对应全文的比例
  eq(
    '中段进度按视口中心计算',
    Number(computeEditorProgress(500, 500, 2000).toFixed(3)),
    0.375
  );

  // 单调性：任何滚动都必须单调递增，否则会出现回弹
  let monotonic = true;
  let prev = -1;
  for (let top = 0; top <= 1500; top += 25) {
    const p = computeEditorProgress(top, 500, 2000);
    if (p < prev - 1e-9) { monotonic = false; break; }
    prev = p;
  }
  ok('进度随滚动单调递增（无回弹）', monotonic);

  /**
   * 互逆性 —— 本次优化的核心断言。
   *
   * 编辑器算出的进度，经预览换算回位置后，再算回进度应当几乎不变。
   * 这保证了「你看编辑器第 N 行时，预览也在第 N 行」。
   */
  const editor = { clientHeight: 500, scrollHeight: 2000 };
  const preview = { clientHeight: 500, scrollHeight: 6000 }; // 预览渲染后高 3 倍
  let worstError = 0;
  for (let top = 0; top <= 1500; top += 100) {
    const err = alignmentError({ ...editor, scrollTop: top }, preview);
    worstError = Math.max(worstError, err);
  }
  ok('编辑器→预览→回算，进度几乎无损', worstError < 1, `最大误差 ${worstError.toFixed(2)}px`);

  // 对比：旧的「可视区百分比」方案在同一场景下的误差
  const oldEditorPct = (top: number) => top / (editor.scrollHeight - editor.clientHeight);
  const oldPreviewTop = (p: number) => p * (preview.scrollHeight - preview.clientHeight);
  const oldErrorAt = (top: number) => {
    const expected = computeEditorProgress(top, editor.clientHeight, editor.scrollHeight);
    const actual = computeEditorProgress(
      oldPreviewTop(oldEditorPct(top)),
      preview.clientHeight,
      preview.scrollHeight
    );
    return Math.abs(actual - expected) * preview.scrollHeight;
  };
  const oldWorst = Math.max(...[0, 500, 1000, 1500].map(oldErrorAt));
  ok(
    '新方案误差显著优于旧的可视百分比方案',
    worstError < oldWorst,
    `新 ${worstError.toFixed(2)}px vs 旧 ${oldWorst.toFixed(2)}px`
  );

  // 边界对齐：编辑器到底时，预览必须精确落在自己的底部
  const bottomTop = computePreviewScrollTop(
    computeEditorProgress(1500, editor.clientHeight, editor.scrollHeight),
    preview.scrollHeight,
    preview.clientHeight
  );
  eq(
    '两端同时到底',
    bottomTop,
    preview.scrollHeight - preview.clientHeight
  );

  // 预览侧自身的钳制
  eq('进度为负 → 顶部', computePreviewScrollTop(-1, 6000, 500), 0);
  eq('进度大于 1 → 底部', computePreviewScrollTop(5, 6000, 500), 5500);
  eq('预览内容不足一屏 → 0', computePreviewScrollTop(0.5, 400, 500), 0);
}

/* ══════════════ 17. AI 能力：URL 拼接 / 脱敏 / 错误分类 ══════════════ */
out.push('');
out.push('=== 17. AI 能力（electron/ai.ts） ===');
{
  // ---- 端点归一化：路径补全是这里最容易出错的地方 ----
  const ep = (endpoint: string, kind: 'chat' | 'image' | 'models') =>
    resolveEndpointUrl(endpoint, kind);

  eq('裸域名自动补 chat 路径', ep('https://api.deepseek.com', 'chat'), 'https://api.deepseek.com/chat/completions');
  eq('带 /v1 的补在后面', ep('https://api.openai.com/v1', 'chat'), 'https://api.openai.com/v1/chat/completions');
  eq(
    '已有 chat 路径不重复添加',
    ep('https://api.deepseek.com/chat/completions', 'chat'),
    'https://api.deepseek.com/chat/completions'
  );
  eq('尾部斜杠被清理', ep('https://api.deepseek.com/', 'chat'), 'https://api.deepseek.com/chat/completions');
  eq('生图补 images 路径', ep('https://api.openai.com/v1', 'image'), 'https://api.openai.com/v1/images/generations');
  eq(
    'models 会先剥掉 chat 再补 models',
    ep('https://api.deepseek.com/chat/completions', 'models'),
    'https://api.deepseek.com/models'
  );
  eq(
    'models 会先剥掉 images 再补 models',
    ep('https://api.openai.com/v1/images/generations', 'models'),
    'https://api.openai.com/v1/models'
  );

  let threwEmpty = false;
  try { ep('', 'chat'); } catch { threwEmpty = true; }
  ok('空端点抛出可读错误', threwEmpty);

  let threwBad = false;
  try { ep('不是-url', 'chat'); } catch { threwBad = true; }
  ok('非法端点抛出可读错误', threwBad);

  // ---- 密钥脱敏：服务端回显 Header 时不能把 Key 显示给用户 ----
  const red = (t: string) => redactSecret(t);
  ok('Bearer 令牌被抹掉', !/sk-abc123def456ghi/.test(red('Authorization: Bearer sk-abc123def456ghi789')));
  ok('api_key= 形式被抹掉', !/secretvalue123/.test(red('api_key=secretvalue123')));
  ok('token= 形式被抹掉', !/tok_abcdefgh12345/.test(red('token: tok_abcdefgh12345')));
  ok('普通中文不被误伤', red('这是一段正常的中文回复，没有密钥') === '这是一段正常的中文回复，没有密钥');

  // ---- 错误分类 ----
  eq('401 → BAD_KEY', classifyAIError('401 Unauthorized').code, 'BAD_KEY');
  eq('invalid api key → BAD_KEY', classifyAIError('Invalid API key provided').code, 'BAD_KEY');
  eq('429 → QUOTA', classifyAIError('429 rate limit exceeded').code, 'QUOTA');
  eq('余额不足 → QUOTA', classifyAIError('insufficient balance').code, 'QUOTA');
  eq('模型不存在 → BAD_MODEL', classifyAIError('The model does not exist').code, 'BAD_MODEL');
  eq('model not found → BAD_MODEL', classifyAIError('model not found').code, 'BAD_MODEL');
  eq('no such model → BAD_MODEL', classifyAIError('no such model: gpt-9').code, 'BAD_MODEL');
  eq('中文模型未开通 → BAD_MODEL', classifyAIError('模型未开通').code, 'BAD_MODEL');
  eq('fetch failed → NETWORK', classifyAIError('fetch failed').code, 'NETWORK');
  eq('连接超时 → NETWORK', classifyAIError('ETIMEDOUT').code, 'NETWORK');

  // **安全底线**：未知错误也绝不能把报文里的密钥原样吐给用户
  const unknown = classifyAIError('服务端异常：sk-shouldneverappear123456');
  eq('未知错误归为 UNKNOWN', unknown.code, 'UNKNOWN');
  ok('未知错误报文已脱敏', !unknown.friendly.includes('sk-shouldneverappear123456'), unknown.friendly);
  ok('未知错误报文长度受限', unknown.friendly.length <= 200);

  // ---- 鉴权头 ----
  ok('有 key 时带 Bearer', buildAIHeaders('sk-x', 'openai').Authorization === 'Bearer sk-x');
  ok('default 服务不带鉴权', buildAIHeaders('sk-x', 'default').Authorization === undefined);
  ok('空 key 不带鉴权', buildAIHeaders('', 'openai').Authorization === undefined);
  ok('始终带 JSON Content-Type', buildAIHeaders('', 'openai')['Content-Type'] === 'application/json');

  // ---- 配置补丁：回归防护 ----
  /**
   * 这组断言直接对应已修的那个 bug：
   * 渲染层保存对话配置时总会带上 image 字段，没填的是空串；
   * 若主进程按「!== undefined」判断，空串会被当成「用户要求改成空」，
   * 于是改一下对话温度就把生图端点抹了。
   */
  ok('全空字符串补丁 → 视为未修改', isEmptyConfigPatch({ type: '', endpoint: '', model: '', apiKey: undefined }));
  ok('全空串 + 空白串 → 视为未修改', isEmptyConfigPatch({ type: '   ', endpoint: '  ' }));
  ok('空对象 → 视为未修改', isEmptyConfigPatch({}));
  ok('null → 视为未修改', isEmptyConfigPatch(null));
  ok('有 endpoint → 视为真实修改', !isEmptyConfigPatch({ endpoint: 'https://x/v1' }));
  ok('有 apiKey → 视为真实修改', !isEmptyConfigPatch({ apiKey: 'sk-abc' }));
  ok('温度 0 是有效值而非空', !isEmptyConfigPatch({ temperature: 0 }));

  // ---- 服务预设完整性 ----
  // 注意：对话服务与生图服务是**两个独立命名空间**，同一个 key（如 openai）在两边都出现
  // 是设计如此，唯一性必须在各自列表内检查，合并后检查会误报
  eq('对话服务 key 无重复', new Set(AI_SERVICES.map((s) => s.key)).size, AI_SERVICES.length);
  eq('生图服务 key 无重复', new Set(IMAGE_SERVICES.map((s) => s.key)).size, IMAGE_SERVICES.length);
  eq(
    '对话服务含自定义项',
    AI_SERVICES.some((s) => s.key === 'custom'),
    true
  );
  const allPresets = [...AI_SERVICES, ...IMAGE_SERVICES];
  const badEndpoints = allPresets.filter(
    (s) => s.key !== 'custom' && !/^https:\/\/.+/.test(s.endpoint)
  );
  eq('非自定义预设都有合法 https 端点', badEndpoints.length, 0);
  const emptyModels = allPresets.filter((s) => s.key !== 'custom' && s.models.length === 0);
  eq('非自定义预设都有候选模型', emptyModels.length, 0);
  const dupModels = AI_SERVICES.filter(
    (s) => new Set(s.models).size !== s.models.length
  );
  eq('同一服务内无重复模型', dupModels.length, 0);

  // ---- 提示词组装 ----
  const msg = buildToolboxMessages('summarize', [], '这是待处理的正文');
  eq('消息数为 2（system + user）', msg.length, 2);
  eq('首条是 system', msg[0].role, 'system');
  ok('system 提示词为工具箱专用', msg[0].content === TOOLBOX_SYSTEM_PROMPT);
  ok('user 消息带总结指令', msg[1].content.includes('摘要'));
  ok('user 消息带原文', msg[1].content.includes('这是待处理的正文'));

  const custom = buildToolboxMessages('custom', ['不超过 300 字', '不要标题'], '正文');
  ok('自定义提示词被拼接', custom[1].content.includes('不超过 300 字') && custom[1].content.includes('不要标题'));
  ok('自定义动作不再附加内置指令', !custom[1].content.includes('请优化文本'));

  const fallback = buildToolboxMessages('custom', [], '正文');
  ok('自定义且无要求时走兜底指令', fallback[1].content.includes(OPTIMIZE_DEFAULT_PROMPT));
}

/* ── 汇总 ── */
out.push('');
out.push(`===== ${passed} passed / ${failed} failed =====`);

document.getElementById('log')!.innerHTML = out
  .map((l) => `<div style="color:${l.startsWith('FAIL') ? '#c00' : l.startsWith('PASS') ? '#080' : '#333'}">${l}</div>`)
  .join('');

window.__RESULT__ = { passed, failed, lines: out, done: true };
