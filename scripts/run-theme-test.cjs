/**
 * 在真实 Chromium 环境里跑主题令牌测试。
 *
 * 为什么必须用 Electron 而不是 Node：
 * 编译产物要经 DOMParser（customCss 内联化）与 getComputedStyle 量测，
 * 这两者都依赖浏览器 DOM，Node 里无法等价复现。
 *
 * 用法：先 `npm run dev`（vite，端口 3000），再 `npx electron scripts/run-theme-test.cjs`
 */
const { app, BrowserWindow } = require('electron');

const URL = process.env.TEST_URL || 'http://localhost:3000/test/theme-tokens.html';
const TIMEOUT_MS = 40000;

app.disableHardwareAcceleration();

/** 等 vite dev server 就绪（首次冷启动可能几秒） */
async function loadWithRetry(win, tries = 30) {
  for (let i = 0; i < tries; i++) {
    try {
      await win.loadURL(URL);
      return true;
    } catch (e) {
      if (i === tries - 1) throw e;
      await new Promise((r) => setTimeout(r, 500));
    }
  }
  return false;
}

app.whenReady().then(async () => {
  const win = new BrowserWindow({ show: false, width: 1200, height: 900 });

  // 页面的 console 全量透传，便于定位模块加载 / 运行期错误
  win.webContents.on('console-message', (_e, level, message) => {
    if (level >= 2) console.log(`[page:${level}] ${message}`);
  });

  try {
    await loadWithRetry(win);
  } catch (e) {
    console.log('LOAD_FAILED', String(e));
    app.exit(2);
    return;
  }

  const result = await win.webContents.executeJavaScript(`
    new Promise((resolve) => {
      const t0 = Date.now();
      const tick = () => {
        if (window.__RESULT__ && window.__RESULT__.done) return resolve(window.__RESULT__);
        if (Date.now() - t0 > ${TIMEOUT_MS}) {
          return resolve({ error: 'timeout', body: (document.body.innerText || '').slice(0, 3000) });
        }
        setTimeout(tick, 120);
      };
      tick();
    })
  `);

  if (result.error) {
    console.log('RESULT_ERROR', result.error);
    console.log(result.body || '');
    app.exit(3);
    return;
  }

  // 只打印失败项 + 汇总，通过项太多不刷屏（需要时用 VERBOSE=1）
  const verbose = process.env.VERBOSE === '1';
  for (const line of result.lines) {
    if (verbose || line.startsWith('FAIL') || line.startsWith('===')) console.log(line);
  }
  console.log(`\nSUMMARY ${result.passed} passed / ${result.failed} failed`);

  app.exit(result.failed > 0 ? 1 : 0);
});
