import esbuild from 'esbuild';
import process from 'node:process';
import builtins from 'builtin-modules';

const prod = process.argv[2] === 'production';

/**
 * Obsidian 插件的特殊约束：
 *  - 不能用 `node:fs` 之类模块，必须走 obsidian 提供的 `Vault.adapter`
 *  - CommonJS 输出，Electron 侧直接 require
 *  - marked 与 mermaid 都要打进包里（插件在用户机器上没有 node_modules）
 */
const context = await esbuild.context({
  entryPoints: ['src/main.ts'],
  bundle: true,
  external: [
    'obsidian',
    'electron',
    '@codemirror/state',
    '@codemirror/view',
    '@codemirror/language',
    '@lezer/common',
    '@lezer/highlight',
    '@lezer/lr',
    ...builtins,
  ],
  format: 'cjs',
  target: 'es2020',
  logLevel: 'info',
  sourcemap: prod ? false : 'inline',
  treeShaking: true,
  minify: prod,
  outfile: 'main.js',
});

if (prod) {
  await context.rebuild();
  process.exit(0);
} else {
  await context.watch();
}
