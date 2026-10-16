/**
 * 验证 release.yml 的产物重命名逻辑。
 *
 * 为什么用 Node 而不是 bash：
 * bash 在本机沙箱里执行不稳定（多次 SIGTERM），而这段逻辑最终要在
 * GitHub Actions 的 ubuntu/macos runner 上跑 —— 用 Node 模拟可以避开
 * 环境差异，也能把逻辑本身验证清楚。
 *
 * 用法：node scripts/verify-rename.mjs
 */
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { targetName } from './rename-artifacts.mjs';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const VER = '1.0.1';

// 注意：这里直接复用 rename-artifacts.mjs 的实现，而不是复刻一份 ——
// 两份实现必然漂移，验证就失去了意义。

// 真实的 v1.0.1 产物名（从 GitHub Release 拉下来的）
const INPUT = [
  '-1.0.1-arm64.dmg',
  '-1.0.1-arm64-mac.zip',
  '-1.0.1.dmg',
  '-1.0.1-mac.zip',
  '1.0.1.AppImage',
  'treasure-gzh-editor_1.0.1_amd64.deb',
  'Setup.1.0.1.exe',
  '1.0.1.exe',
];

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

console.log('=== 产物重命名逻辑验证 ===\n');

// 1. 每个文件都能算出目标名（不能有漏网的）
const plan = INPUT.map((f) => ({ from: f, to: targetName(f, VER) }));
const unmapped = plan.filter((p) => !p.to);
ok('所有产物都能映射到目标名', unmapped.length === 0, unmapped.map((p) => p.from).join(','));

plan.forEach((p) => console.log(`  ${p.from.padEnd(38)} → ${p.to}`));
console.log('');

// 2. 目标名唯一 —— 否则会互相覆盖，丢文件
const targets = plan.map((p) => p.to).filter(Boolean);
const dupTargets = targets.filter((t, i) => targets.indexOf(t) !== i);
ok('目标名无重复（不会互相覆盖）', dupTargets.length === 0, [...new Set(dupTargets)].join(','));

// 3. 目标名不以连字符开头 —— 那是本次要修的核心问题
const leadingDash = targets.filter((t) => t.startsWith('-'));
ok('目标名不以连字符开头', leadingDash.length === 0, leadingDash.join(','));

// 4. 目标名不含中文 —— 跨平台 CI 会吞掉中文名，这是根因
const hasChinese = targets.filter((t) => /[\u4e00-\u9fa5]/.test(t));
ok('目标名不含中文', hasChinese.length === 0, hasChinese.join(','));

// 5. 目标名都带版本号与平台，用户能一眼分辨
ok('目标名都含版本号', targets.every((t) => t.includes(VER)));
ok('目标名都含平台标识', targets.every((t) => /macOS|linux|Setup|portable/i.test(t)));

// 6. macOS 的 x64/arm64 必须区分开 —— 弄错架构用户就装不了
const macNames = targets.filter((t) => t.includes('macOS'));
ok('macOS 产物区分 arm64/x64', macNames.some((t) => t.includes('arm64')) && macNames.some((t) => t.includes('x64')));
ok('macOS 产物区分 dmg/zip', macNames.some((t) => t.endsWith('.dmg')) && macNames.some((t) => t.endsWith('.zip')));

// 7. 实际执行一遍，确认没有文件名冲突
// 注意用独立的临时目录，不能碰项目里的 release/ ——
// 那里可能有你正在跑的旧版本产物，会干扰验证结果（这次就被 1.0.0 的 exe 干扰过）
const dir = path.join(root, '.rename-verify-tmp');
fs.rmSync(dir, { recursive: true, force: true });
fs.mkdirSync(dir, { recursive: true });
for (const f of INPUT) fs.writeFileSync(path.join(dir, f), '');

const seen = new Set();
let executeFail = '';
for (const p of plan) {
  if (!p.to) continue;
  const dest = path.join(dir, p.to);
  if (seen.has(p.to)) {
    executeFail = `目标冲突：${p.to}`;
    break;
  }
  seen.add(p.to);
  fs.renameSync(path.join(dir, p.from), dest);
}
ok('实际重命名无冲突', !executeFail, executeFail);
const remaining = fs.readdirSync(dir);
ok('没有残留未处理文件', remaining.length === targets.length, `${remaining.length}/${targets.length}`);
fs.rmSync(dir, { recursive: true, force: true });

console.log(`\n通过 ${pass} / 失败 ${fail}`);
process.exit(fail > 0 ? 1 : 0);