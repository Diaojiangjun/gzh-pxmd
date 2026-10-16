/**
 * 统一产物命名（供 CI 与本地使用）。
 *
 * 为什么要统一：
 * electron-builder 默认用 productName 命名，但跨平台 CI 上中文名会被吞掉，
 * 产出 `-1.0.1-arm64.dmg` 这种开头是连字符的文件；Windows 的 exe 又完全
 * 不带产品名（只有 `1.0.1.exe`），用户从下载列表里根本认不出是什么。
 *
 * 统一成「产品英文名-平台-版本-架构」，三平台一致且可识别。
 *
 * 实现为独立脚本而非写进 workflow 的内联 shell：
 *  内联 shell 无法在本地复现验证，而 CI 上跑挂了要等几分钟才知道。
 *  抽出来后可在提交前跑 `node scripts/verify-rename.mjs` 提前发现问题。
 *
 * 用法：node scripts/rename-artifacts.mjs [目录] [版本]
 *   目录默认 release，版本默认取 package.json
 */
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const BASE = 'TreasureGzhEditor';

/** 命名规则 —— verify-rename.mjs 也复用这个函数，避免两份实现漂移 */
export function targetName(f, ver) {
  if (f.endsWith('.AppImage')) return `${BASE}-linux-${ver}-x86_64.AppImage`;
  if (f.endsWith('.deb')) return `${BASE}-linux-${ver}-amd64.deb`;
  if (f.startsWith('Setup') && f.endsWith('.exe')) return `${BASE}-Setup-${ver}-x64.exe`;
  if (f.endsWith('.exe')) return `${BASE}-${ver}-x64-portable.exe`;
  if (f.endsWith('.zip')) {
    return `${BASE}-macOS-${ver}-${f.includes('arm64') ? 'arm64' : 'x64'}.zip`;
  }
  if (f.endsWith('.dmg')) {
    return `${BASE}-macOS-${ver}-${f.includes('arm64') ? 'arm64' : 'x64'}.dmg`;
  }
  return null;
}

function main() {
  const dir = path.resolve(process.argv[2] || path.join(root, 'release'));
  const ver =
    process.argv[3] ||
    JSON.parse(fs.readFileSync(path.join(root, 'package.json'), 'utf8')).version;

  if (!fs.existsSync(dir)) {
    console.log(`目录不存在，跳过：${dir}`);
    return;
  }

  const files = fs.readdirSync(dir);

  // 先把映射收集完再统一改名 —— 边遍历边改名会让读到的列表失效，漏掉后面的文件
  const pairs = [];
  for (const f of files) {
    const to = targetName(f, ver);
    if (to && to !== f) pairs.push([f, to]);
  }

  if (pairs.length === 0) {
    console.log('没有需要重命名的产物');
    return;
  }

  // 目标名冲突会互相覆盖、丢文件，必须先拦下来。
  // 真实场景：目录里同时存在上次构建的旧版本产物，就会撞名。
  const targets = pairs.map((p) => p[1]);
  const dup = targets.filter((t, i) => targets.indexOf(t) !== i);
  if (dup.length > 0) {
    console.error(
      `目标文件名冲突，已中止：${[...new Set(dup)].join(', ')}\n` +
        '目录里可能有上次构建的残留产物，请先清理 release/ 目录。'
    );
    process.exitCode = 1;
    return;
  }

  for (const [from, to] of pairs) {
    fs.renameSync(path.join(dir, from), path.join(dir, to));
    console.log(`  ${from} → ${to}`);
  }

  console.log(`\n已重命名 ${pairs.length} 个产物（v${ver}）`);
}

// 只在被直接执行时跑 —— 否则 import 本模块做验证时会误改真实目录
// （踩过：verify 脚本 import 后触发改名，扫到了项目里的旧产物直接报冲突）
if (process.argv[1] && fileURLToPath(import.meta.url) === path.resolve(process.argv[1])) {
  main();
}