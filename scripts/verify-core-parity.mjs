/**
 * 校验「插件里的编译器」与「主项目的编译器」行为一致。
 *
 * 为什么必须验这个：
 * 插件的 core/ 是从主项目**拷贝**过去的。以后主项目改了编译器而忘了同步，
 * 插件就会静默地用旧行为 —— 而且不会有任何报错，用户只会觉得"排版怎么变了"。
 * 所以这里跑同一批输入过两套实现，逐字节比对输出。
 *
 * 用法：node scripts/verify-core-parity.mjs
 */
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { createRequire } from 'node:module';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');

/**
 * 用 esbuild 把两套 TS 打成 CJS 后 require 进来。
 * 直接用 tsx 跑 .ts 会遇到模块解析差异，打包成单文件最接近真实运行形态。
 */
const { build } = await import('esbuild');

/**
 * 造一个最小入口，把目标模块导出出去。
 * 路径必须转成「相对 resolveDir 且带 ./ 前缀」的形式 —— esbuild 不会把
 * 裸相对路径当相对路径解析，而当包名去 node_modules 里找。
 */
function entryFor(target) {
  const rel = path.relative(root, path.join(root, target)).split(path.sep).join('/');
  const spec = rel.startsWith('.') ? rel : './' + rel;
  return `
    export * from ${JSON.stringify(spec)};
  `;
}

async function loadModule(paths, outfile) {
  const entries = paths.map(entryFor);
  const abs = path.join(root, outfile);
  await build({
    stdin: {
      contents: entries.join('\n'),
      resolveDir: root,
      loader: 'ts',
    },
    bundle: true,
    platform: 'node',
    format: 'cjs',
    target: 'node18',
    outfile: abs,
    logLevel: 'silent',
    // 主项目与插件各引一份 marked，避免互相污染缓存
    external: ['marked', 'mermaid'],
  });

  // 本文件是 ESM（有 top-level await），不能用 require 加载 CJS 产物 ——
  // 走 createRequire 显式声明这是 CommonJS。
  const require = createRequire(import.meta.url);
  delete require.cache[require.resolve(abs)];
  return require(abs);
}

const MAIN = [
  'src/services/gzhCompiler.ts',
  'src/data/defaultData.ts',
];

const PLUGIN = [
  'obsidian-gzh-formatter/src/core/gzhCompiler.ts',
  'obsidian-gzh-formatter/src/core/defaultData.ts',
];

const main = await loadModule(MAIN, '.parity-main.cjs');
const plugin = await loadModule(PLUGIN, '.parity-plugin.cjs');

/** 覆盖各种语法的测试语料 —— 排版块、公式、注释、图片、脚注都要覆盖到 */
const CASES = [
  ['纯段落', '这是一段普通文字，带**加粗**与`行内代码`。'],
  ['标题层级', '# 一级\n## 二级\n### 三级'],
  ['列表与任务', '- 甲\n- 乙\n  - 乙一\n\n1. 一\n2. 二\n- [ ] 待办\n- [x] 已完成'],
  ['引用', '> 这是引用\n> 第二行'],
  ['GFM 警告块', '> [!NOTE]\n> 提示内容\n\n> [!WARNING]\n> 警告内容'],
  ['表格', '| 名称 | 说明 |\n| --- | --- |\n| 甲 | 一 |\n| 乙 | 二 |'],
  ['代码块', '```js\nconst a = 1;\nconsole.log(a);\n```'],
  ['Mermaid', '```mermaid\ngraph TD\n  A --> B\n```'],
  ['行内公式', '质能方程 $E = mc^2$ 很有名。'],
  ['块级公式', '$$\n\\frac{a}{b} = c\n$$'],
  ['图片', '![alt](https://example.com/a.png)\n\n![](/local/b.jpg)'],
  ['表情包', '![sticker:开心](https://example.com/s.png)'],
  ['注音', '[汉字]^(hàn zì) 注音测试'],
  ['排版块 hero', ':::hero\n# 大标题\n这里是副标题\n:::'],
  ['排版块 toc', ':::toc\n:::\n\n正文'],
  ['排版块 callout', ':::callout\n**提示**：注意这里\n:::'],
  ['排版块 card', ':::card\n卡片一\n---\n卡片二\n:::'],
  ['排版块 timeline', ':::timeline\n2024-01-01 开始\n2024-06-01 里程碑\n:::'],
  ['排版块 steps', ':::steps\n第一步\n第二步\n:::'],
  ['排版块 progress', ':::progress\n标题|80%\n:::'],
  ['排版块 compare', ':::compare\n左 | 右\n:::'],
  ['排版块 footer', ':::footer\n感谢阅读\n:::'],
  ['链接与脚注', '访问[示例](https://example.com)看看。'],
  ['分割线', '上面\n\n---\n\n下面'],
  ['混排', '# 标题\n\n:::callout\n公式 $E=mc^2$ 与 [链接](https://a.com)\n:::\n\n| a | b |\n| - | - |\n| 1 | 2 |'],
];

let pass = 0;
let fail = 0;
const failures = [];

const BG = { type: 'none', color: '', opacity: 0 };

function compare(name, md, theme) {
  let a, b;
  try {
    a = main.compileWeChatMarkdown(md, theme, BG, { convertLinksToFootnotes: true });
  } catch (e) {
    a = `__THROW__${e.message}`;
  }
  try {
    b = plugin.compileWeChatMarkdown(md, theme, BG, { convertLinksToFootnotes: true });
  } catch (e) {
    b = `__THROW__${e.message}`;
  }

  if (a === b) {
    pass++;
    return;
  }
  fail++;
  failures.push({ name, mainLen: a.length, pluginLen: b.length, a, b });
}

// 1. 每个主题都跑一遍全部语料 —— 主题不同则渲染结果不同，只测一个主题会漏掉
//    「只在特定主题下才走不同代码分支」的不一致
const themes = main.DEFAULT_THEMES || [];
console.log(`主题数：${themes.length}，语料数：${CASES.length}\n`);

for (const theme of themes) {
  for (const [name, md] of CASES) {
    compare(`${theme.id} / ${name}`, md, theme);
  }
}

// 2. 校验：主题列表本身也要一致
const mainThemes = JSON.stringify(main.DEFAULT_THEMES);
const pluginThemes = JSON.stringify(plugin.DEFAULT_THEMES);
if (mainThemes === pluginThemes) {
  pass++;
} else {
  fail++;
  failures.push({
    name: 'DEFAULT_THEMES 主题库',
    mainLen: mainThemes.length,
    pluginLen: pluginThemes.length,
    a: mainThemes.slice(0, 300),
    b: pluginThemes.slice(0, 300),
  });
}

// 3. 语法体检函数也要一致
for (const [name, md] of CASES) {
  const a = JSON.stringify(main.validateCustomBlocks(md));
  const b = JSON.stringify(plugin.validateCustomBlocks(md));
  if (a === b) pass++;
  else {
    fail++;
    failures.push({ name: `validateCustomBlocks / ${name}`, mainLen: a.length, pluginLen: b.length, a, b });
  }
}

console.log(`通过 ${pass} / 失败 ${fail}`);

if (failures.length) {
  console.log('\n差异明细（前 5 条）：');
  for (const f of failures.slice(0, 5)) {
    console.log(`\n--- ${f.name} (主 ${f.mainLen} vs 插件 ${f.pluginLen}) ---`);
    // 找出第一个不同的位置，便于定位
    let i = 0;
    while (i < f.a.length && i < f.b.length && f.a[i] === f.b[i]) i++;
    console.log(`首个差异在第 ${i} 字符`);
    console.log('主:  …' + f.a.slice(Math.max(0, i - 60), i + 60).replace(/\n/g, '\\n'));
    console.log('插件:…' + f.b.slice(Math.max(0, i - 60), i + 60).replace(/\n/g, '\\n'));
  }
  process.exit(1);
}

console.log('\n两套实现输出逐字节一致 ✓');
