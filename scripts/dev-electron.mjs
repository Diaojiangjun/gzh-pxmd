import { spawn } from 'node:child_process';
import { context } from 'esbuild';
import fs from 'node:fs';

const isWin = process.platform === 'win32';
const PORT = 3000;
const DEV_URL = `http://localhost:${PORT}`;

async function waitForServer(url, timeoutMs = 30000) {
  const deadline = Date.now() + timeoutMs;
  while (Date.now() < deadline) {
    try {
      const res = await fetch(url);
      if (res.ok) return;
    } catch {
      // 开发服务器尚未就绪，继续等待
    }
    await new Promise((r) => setTimeout(r, 400));
  }
  throw new Error(`dev server 未能在 ${timeoutMs / 1000}s 内启动`);
}

/**
 * 结束进程树。
 * Windows 上 child.kill() 只会结束 cmd.exe（因为 spawn 时用了 shell:true），
 * 真正的 Electron 子进程会残留下来，必须用 taskkill /T /F 连子进程一起结束。
 */
function killProcessTree(child) {
  if (!child || child.exitCode !== null) return;
  try {
    if (isWin && child.pid) {
      spawn('taskkill', ['/pid', String(child.pid), '/T', '/F'], { stdio: 'ignore' });
    } else {
      child.kill();
    }
  } catch {
    // 忽略 kill 异常（进程可能已退出）
  }
}

// ---- Electron 进程管理（主进程代码变更时自动重启） ----
let electronProcess = null;
let viteReady = false;
let viteProcess = null;
let disposed = false;

function launchElectron() {
  if (!viteReady) return; // vite 未就绪前不启动

  // 先把旧的结束掉（含子进程）
  if (electronProcess) killProcessTree(electronProcess);

  console.log('[dev-electron] 启动 Electron 桌面窗口...');
  const child = spawn('electron', ['.'], {
    stdio: 'inherit',
    shell: isWin,
    env: { ...process.env, NODE_ENV: 'development', VITE_DEV_SERVER_URL: DEV_URL },
  });
  electronProcess = child;

  child.on('exit', (code) => {
    // 被新实例替换掉的旧进程：忽略它的退出事件
    if (electronProcess !== child) return;
    electronProcess = null;
    // 走到这里说明是用户主动关闭了窗口 → 整个开发环境一起退出
    console.log('[dev-electron] Electron 已退出，正在关闭开发环境...');
    shutdown(code ?? 0);
  });
}

// 1. 编译 electron 主进程 / preload / menu 到 dist-electron（监听模式）
const esbuildContext = await context({
  entryPoints: ['electron/main.ts', 'electron/preload.ts', 'electron/menu.ts'],
  outdir: 'dist-electron',
  bundle: true,
  platform: 'node',
  target: 'node18',
  // 所有 node_modules 依赖保持 external，运行时从 node_modules 加载
  // （mathjax-full 是 CJS + 依赖 Node-only 的 esm 包，不能被打包进 bundle）
  packages: 'external',
  plugins: [
    {
      name: 'restart-electron-on-rebuild',
      setup(build) {
        // 每次重新编译完成（含 watch 触发）时，若已启动过则自动重启 Electron
        build.onEnd(() => {
          // 由于项目 root 的 package.json 设置了 "type": "module"，Node 会把 dist-electron/*.js 当作 ESM。
          // 但 esbuild 默认输出 CommonJS（含 require），所以必须给 dist-electron 单独声明 type: commonjs。
          fs.writeFileSync('dist-electron/package.json', JSON.stringify({ type: 'commonjs' }, null, 2));
          if (electronProcess) {
            console.log('[dev-electron] 主进程代码已更新，重启 Electron...');
            launchElectron();
          }
        });
      },
    },
  ],
});
await esbuildContext.rebuild();
await esbuildContext.watch();
console.log('[dev-electron] Electron 代码已编译并监听中...');

// 2. 启动 vite dev server
viteProcess = spawn('npx', ['vite', '--port', String(PORT), '--host', '0.0.0.0'], {
  stdio: 'inherit',
  shell: isWin,
});

// 3. 等待 vite 就绪后再拉起 Electron
try {
  await waitForServer(DEV_URL);
} catch (err) {
  killProcessTree(viteProcess);
  await esbuildContext.dispose();
  console.error(err.message);
  process.exit(1);
}

/**
 * 预热 vite：把「依赖预打包 + 入口编译」提前到窗口显示之前做完
 *
 * vite 的 optimizeDeps（把 react / react-dom / lucide-react 这类 CJS 依赖
 * 预打包成 ESM）是**惰性触发**的 —— 只有浏览器真的请求到某个模块才会启动。
 * 如果放任 Electron 去触发，窗口就会先亮出来再白屏数秒（实测首次可长达 20s+）。
 *
 * 这里主动请求关键模块，等 vite 把预打包跑完，再开窗口。
 * 注意：dev-electron 只在真正打开窗口前多花几秒，而窗口一出现就是可用状态。
 */
async function warmupVite(baseUrl, timeoutMs = 30000) {
  const deadline = Date.now() + timeoutMs;
  const paths = ['/@vite/client', '/src/main.tsx', '/src/App.tsx', '/src/index.css'];

  for (const p of paths) {
    if (Date.now() > deadline) break;
    try {
      const res = await fetch(baseUrl + p);
      await res.arrayBuffer(); // 必须读完，否则连接不释放，预打包不会被触发
      if (!res.ok) console.warn(`[dev-electron] 预热 ${p} 返回 ${res.status}`);
    } catch {
      // 预热失败不影响启动，交给 Electron 自己重试
    }
  }

  // 预打包在服务端异步进行，请求返回不代表已完成；
  // 再等待一小段时间让 esbuild 把产物落盘（观察到稳定后提前结束）
  const settleUntil = Date.now() + 6000;
  let stableCount = 0;
  while (Date.now() < settleUntil && stableCount < 3) {
    const t0 = Date.now();
    try {
      const res = await fetch(`${baseUrl}/src/main.tsx`);
      await res.arrayBuffer();
    } catch {
      stableCount = 0;
    }
    // 单次编译耗时稳定在 300ms 内，认为预热完成
    if (Date.now() - t0 < 300) stableCount += 1;
    else stableCount = 0;
    await new Promise((r) => setTimeout(r, 500));
  }
}

console.log('[dev-electron] 预热 vite（依赖预打包 + 入口编译）...');
const warmupStart = Date.now();
await warmupVite(DEV_URL);
console.log(`[dev-electron] 预热完成，耗时 ${Date.now() - warmupStart}ms`);

// 4. 启动 Electron 桌面窗口
viteReady = true;
launchElectron();

function shutdown(code = 0) {
  if (disposed) return;
  disposed = true;
  viteReady = false;
  killProcessTree(viteProcess);
  killProcessTree(electronProcess);
  electronProcess = null;
  viteProcess = null;
  void esbuildContext.dispose();
  process.exit(code);
}

process.on('SIGINT', () => shutdown(0));
process.on('SIGTERM', () => shutdown(0));
