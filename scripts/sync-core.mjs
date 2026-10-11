/**
 * 把主项目的排版核心同步到插件工程。
 *
 * 为什么用脚本而不是手抄：
 * 排版核心有 2500 行，手抄必然漂移 —— 主项目修一个 bug，插件这边还是旧行为。
 * 这里保证「插件里的编译器 == 主项目的编译器」，改一处两处都生效。
 *
 * 用法：node scripts/sync-core.mjs
 */
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const pluginRoot = path.join(root, 'obsidian-gzh-formatter');
const coreDir = path.join(pluginRoot, 'src', 'core');

/**
 * 主项目文件 → 插件文件名。
 *
 * 全部平铺进 src/core/，并把相对导入重写成平铺路径：
 * 主项目里 core 之间互相 import '../types' / './escape'，
 * 平铺后必须统一成 './xxx'，否则 esbuild 解析不到。
 */
const FILES = [
  { from: 'src/services/gzhCompiler.ts', to: 'gzhCompiler.ts' },
  { from: 'src/services/themeTokens.ts', to: 'themeTokens.ts' },
  { from: 'src/services/mathExtension.ts', to: 'mathExtension.ts' },
  { from: 'src/services/diagramRenderer.ts', to: 'diagramRenderer.ts' },
  { from: 'src/utils/escape.ts', to: 'escape.ts' },
  { from: 'src/utils/sanitizeHtml.ts', to: 'sanitizeHtml.ts' },
  { from: 'src/utils/customCss.ts', to: 'customCss.ts' },
  { from: 'src/data/defaultData.ts', to: 'defaultData.ts' },
];

/** defaultData 还引用了这两个类型，漏了会编译不过 */
const TYPE_NAMES = [
  'HeadingStyle',
  'ThemeCategory',
  'ThemeTokens',
  'ThemeConfig',
  'BackgroundType',
  'BackgroundSettings',
  'StickerItem',
  'GzhComponentItem',
  // GzhComponentItem.category 用到它 —— 漏了会编译不过
  'ComponentCategory',
];

function extractTypes() {
  const src = fs.readFileSync(path.join(root, 'src/types/index.ts'), 'utf8');
  const lines = src.split(/\r?\n/);
  const out = [
    '/**',
    ' * 排版核心用到的类型定义。',
    ' *',
    ' * 由 scripts/sync-core.mjs 从主项目 src/types/index.ts 抽取生成，请勿手改。',
    ' * 只取编译器与主题令牌真正用到的部分 —— 整份 types 里有大量与排版无关的类型',
    ' *（组件目录、快照策略、布局模式），搬进来只会增加插件体积和维护成本。',
    ' */',
    '',
  ];

  for (const name of TYPE_NAMES) {
    // 匹配 `export interface X {` / `export type X =` 到配对的结束行为止
    const startRe = new RegExp(`^export (interface|type) ${name}\\b`);
    let i = lines.findIndex((l) => startRe.test(l));
    if (i === -1) throw new Error(`types/index.ts 里找不到 ${name}`);

    // 单行类型：`export type X = 'a' | 'b';`
    if (!/\{\s*$/.test(lines[i])) {
      let j = i;
      while (j < lines.length && !lines[j].trimEnd().endsWith(';')) j++;
      out.push(...lines.slice(i, j + 1), '');
      continue;
    }

    // 多行：按大括号配对扫描，跳过块注释避免误判
    let depth = 0;
    let j = i;
    let inBlockComment = false;
    for (; j < lines.length; j++) {
      const l = lines[j];
      if (l.includes('/*') && !l.includes('*/')) inBlockComment = true;
      if (l.includes('*/')) inBlockComment = false;
      if (!inBlockComment) {
        for (const ch of l) {
          if (ch === '{') depth++;
          else if (ch === '}') depth--;
        }
      }
      if (depth === 0) break;
    }
    out.push(...lines.slice(i, j + 1), '');
  }
  return out.join('\n');
}

/** 把主项目的相对导入改写成插件内的平铺导入 */
function rewriteImports(code) {
  return (
    code
      .replace(/from '\.\.\/types'/g, "from './types'")
      // 顺序要紧：先吃掉带目录的（../services/x、../utils/x），再吃同级的（./x）
      .replace(/from '\.\.\/(?:services|utils|data)\/([a-zA-Z]+)'/g, "from './$1'")
      .replace(/from '\.\.\/([a-zA-Z]+)'/g, "from './$1'")
      .replace(/from '\.\/([a-zA-Z]+)'/g, "from './$1'")
  );
}

fs.mkdirSync(coreDir, { recursive: true });
let bytes = 0;

for (const { from, to } of FILES) {
  const srcPath = path.join(root, from);
  if (!fs.existsSync(srcPath)) throw new Error(`源文件不存在：${from}`);
  let code = fs.readFileSync(srcPath, 'utf8');
  code = rewriteImports(code);

  const banner =
    '/**\n' +
    ` * 来自主项目 ${from}\n` +
    ' * 由 scripts/sync-core.mjs 生成 —— 请在主项目修改后重新同步，不要手改这里。\n' +
    ' */\n';

  fs.writeFileSync(path.join(coreDir, to), banner + code, 'utf8');
  bytes += Buffer.byteLength(code);
  console.log(`  ✓ ${to.padEnd(22)} ${String(code.split(/\r?\n/).length).padStart(5)} 行`);
}

const types = extractTypes();
fs.writeFileSync(path.join(coreDir, 'types.ts'), types, 'utf8');
console.log(`  ✓ ${'types.ts'.padEnd(22)} ${String(types.split(/\r?\n/).length).padStart(5)} 行`);

console.log(
  `\n排版核心同步完成：${FILES.length + 1} 个文件，` +
    `${((bytes + Buffer.byteLength(types)) / 1024).toFixed(0)} KB`
);
