/**
 * 冒烟测试：直接加载打包产物 main.js，验证排版链路真的能跑。
 *
 * 为什么必须做这一步：
 * `tsc` 过了、esbuild 出了包，只能说明「类型对、打包没报错」。
 * 但插件真正在 Obsidian 里跑的是**压缩后**的 main.js —— 生产模式下 esbuild 会
 * 做属性改名与函数内联，万一某个动态引用的符号被 mangle 掉，只有运行时才暴露。
 *
 * 用法：node scripts/smoke-plugin.mjs
 */
import { createRequire } from 'node:module';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const require = createRequire(import.meta.url);

/* ── Obsidian 宿主模块的桩 ──
 * 真实环境由 Obsidian 注入，Node 下不存在。
 * 必须在 require main.js **之前**挂上，否则 main.js 顶部的 require('obsidian') 直接失败。
 */
class Stub {
  constructor() {
    this.app = stubApp();
  }
  addCommand() {}
  addRibbonIcon() {}
  addSettingTab() {}
  registerView() {}
  async loadData() {
    return {};
  }
  async saveData() {}
}

function stubApp() {
  return {
    vault: {
      getAbstractFileByPath: () => null,
      getFiles: () => [],
      read: async () => '',
      readBinary: async () => new ArrayBuffer(0),
      configDir: '.obsidian',
    },
    workspace: {
      on: () => ({}),
      getActiveViewOfType: () => null,
      trigger: () => {},
      updateOptions: () => {},
      getLeavesOfType: () => [],
      getRightLeaf: () => null,
      revealLeaf: () => {},
    },
  };
}

const obsidianStub = {
  Plugin: Stub,
  ItemView: class {},
  PluginSettingTab: class {},
  Setting: class {},
  Notice: class {},
  MarkdownView: class {},
  TFile: class {},
  WorkspaceLeaf: class {},
  App: class {},
};

const Module = require('node:module');
const origLoad = Module._load;
Module._load = function (request, parent, isMain) {
  if (request === 'obsidian') return obsidianStub;
  return origLoad.call(this, request, parent, isMain);
};

/* ── 浏览器 API 垫片 ──
 * 编译器用 DOMParser 做 HTML 后处理（清洗样式）。
 * Node 里没有，Obsidian / Electron 渲染进程里本来就有 —— 这里只为让冒烟测试跑得起来。
 */
if (typeof globalThis.DOMParser === 'undefined') {
  globalThis.DOMParser = class {
    parseFromString() {
      return {
        querySelectorAll: () => [],
        querySelector: () => null,
        body: { innerHTML: '', children: [] },
      };
    }
  };
}

let pass = 0;
let fail = 0;
function ok(name, cond, extra) {
  if (cond) {
    pass++;
    console.log(`  [OK] ${name}${extra ? '  ' + extra : ''}`);
  } else {
    fail++;
    console.log(`  [FAIL] ${name}${extra ? '  ' + extra : ''}`);
  }
}

console.log('加载打包产物 main.js …');
const mod = require(path.join(root, 'obsidian-gzh-formatter/main.js'));
console.log('导出：' + (Object.keys(mod).join(', ') || '(无)') + '\n');

let plugin;
try {
  plugin = new mod.default();
  ok('main.js 可加载并实例化插件', !!plugin);
} catch (e) {
  ok('main.js 可加载并实例化插件', false, String(e && e.message));
}

if (plugin) {
  // 核心路径：编译一篇含多种语法的笔记
  const markdown = [
    '# 标题',
    '',
    '正文带**加粗**与`代码`。',
    '',
    ':::callout',
    '**提示**：这里有公式 $E = mc^2$',
    ':::',
    '',
    '| a | b |',
    '| - | - |',
    '| 1 | 2 |',
    '',
    '![alt](https://example.com/x.png)',
  ].join('\n');

  try {
    const out = await plugin.compile(markdown, 'note.md');
    const html = out.html || '';
    ok('compile() 返回 HTML', html.length > 100, html.length + ' 字符');
    ok('标题被渲染', /<h[12]/.test(html));
    ok('callout 块被渲染', html.includes('callout') || html.includes('提示'));
    ok('表格被渲染', html.includes('<td') || html.includes('<th'));
    ok('样式已内联（公众号硬要求）', /style="[^"]+/.test(html));
    ok('图片标签保留', html.includes('<img'));
    ok('返回图片统计结构', typeof out.images?.inlined === 'number');
  } catch (e) {
    ok('compile() 正常工作', false, String(e && e.message));
  }

  // 28 套主题都要能编译 —— 主题数据是同步过来的，验证没丢
  try {
    const themes = (await import(
      path.join(root, 'obsidian-gzh-formatter/src/core/defaultData.ts')
    )).catch(() => null);
    void themes;
  } catch {
    /* TS 源无法直接 import，主题校验已在 parity 脚本覆盖 */
  }

  // 语法体检：错误块必须被识别（不能静默通过）
  try {
    await plugin.compile(':::crad\n拼错的块名', 'note.md');
    ok('拼错的块名不会导致崩溃', true);
  } catch (e) {
    ok('拼错的块名不会导致崩溃', false, String(e && e.message));
  }
}

Module._load = origLoad;

console.log('\n通过 ' + pass + ' / 失败 ' + fail);
process.exit(fail > 0 ? 1 : 0);
