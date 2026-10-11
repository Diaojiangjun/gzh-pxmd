/**
 * 启动耗时诊断（一次性工具）
 *
 * 回答三个问题：
 *  1. 白屏期间是不是 `did-fail-load` 在退避重试？（重试会让白屏累积到数秒）
 *  2. HTML 加载快不快？（不快 = vite 首次编译慢；快但白屏久 = JS 模块瀑布）
 *  3. React 挂载前请求了多少模块、传输了多少数据？
 *
 * 用法：TEST_URL=http://localhost:<port>/ npx electron scripts/diagnose-startup.cjs
 */
const { app, BrowserWindow } = require('electron');

app.disableHardwareAcceleration();

const URL = process.env.TEST_URL || 'http://localhost:3100/';
const t0 = Date.now();
const mark = () => String(Date.now() - t0).padStart(6, ' ');

app.whenReady().then(async () => {
  console.log(`[${mark()}ms] Electron ready，开始加载 ${URL}`);

  const win = new BrowserWindow({ show: false, width: 1280, height: 860 });

  let failCount = 0;
  win.webContents.on('did-fail-load', (_e, code, desc, _url, isMainFrame) => {
    if (!isMainFrame) return;
    failCount++;
    console.log(`[${mark()}ms] did-fail-load #${failCount}: ${code} ${desc}`);
  });

  const consoleMsgs = [];
  win.webContents.on('console-message', (_e, level, message) => {
    if (level >= 2 && consoleMsgs.length < 8) consoleMsgs.push(message.slice(0, 120));
  });

  await win.loadURL(URL);
  console.log(`[${mark()}ms] did-finish-load（HTML 与入口脚本已就绪）`);

  const info = await win.webContents.executeJavaScript(`
    new Promise((resolve) => {
      const start = performance.now();
      const check = () => {
        const root = document.getElementById('root');
        if (root && root.children.length > 0) {
          const nav = performance.getEntriesByType('navigation')[0] || {};
          const resources = performance.getEntriesByType('resource');
          // 找出最慢的 5 个请求
          const slowest = resources
            .map((r) => ({ n: r.name.split('/').pop().slice(0, 42), d: Math.round(r.duration), t: Math.round(r.transferSize / 1024) }))
            .sort((a, b) => b.d - a.d)
            .slice(0, 5);
          resolve({
            reactMountedAt: Math.round(performance.now()),
            domContentLoaded: Math.round(nav.domContentLoadedEventEnd || 0),
            loadEvent: Math.round(nav.loadEventEnd || 0),
            moduleRequests: resources.length,
            transferKB: Math.round(resources.reduce((s, r) => s + (r.transferSize || 0), 0) / 1024),
            slowest,
          });
        } else if (performance.now() - start > 25000) {
          resolve({ timeout: true, rootChildren: root ? root.children.length : 'no-root' });
        } else {
          setTimeout(check, 16);
        }
      };
      check();
    })
  `);

  console.log(`[${mark()}ms] ── 渲染诊断 ──`);
  console.log(JSON.stringify(info, null, 2));
  console.log(`[${mark()}ms] 加载失败重试次数: ${failCount}`);
  if (consoleMsgs.length) console.log('页面错误/警告:', consoleMsgs);

  app.exit(0);
});