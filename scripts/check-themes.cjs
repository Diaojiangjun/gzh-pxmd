/**
 * 只读检查：应用 localStorage 里的主题数据现状。
 *
 * 用途是排查「我原来的主题看不到了」到底属于
 * 「入口被改动的界面问题」还是「自定义主题数据真的丢了」——
 * 全程只读，不写入任何东西。
 *
 * 用法：npx electron scripts/check-themes.cjs
 */
const { app, BrowserWindow } = require('electron');

const URL = process.env.TEST_URL || 'http://localhost:3000/';

app.disableHardwareAcceleration();

app.whenReady().then(async () => {
  const win = new BrowserWindow({ show: false, width: 1200, height: 800 });

  let ok = false;
  for (let i = 0; i < 15 && !ok; i++) {
    try {
      await win.loadURL(URL);
      ok = true;
    } catch {
      await new Promise((r) => setTimeout(r, 500));
    }
  }
  if (!ok) {
    console.log('LOAD_FAILED  无法加载 ' + URL);
    app.exit(2);
    return;
  }

  await new Promise((r) => setTimeout(r, 1500));

  const data = await win.webContents.executeJavaScript(`
    (() => {
      const THEMES = 'gzh_editor_custom_themes_v1';
      const ACTIVE = 'gzh_editor_active_theme_v1';
      const out = { origin: location.origin, themesRaw: localStorage.getItem(THEMES), activeRaw: localStorage.getItem(ACTIVE) };

      let themes = [];
      try { themes = out.themesRaw ? JSON.parse(out.themesRaw) : []; } catch (e) { out.themesParseError = String(e); }
      out.customThemeCount = Array.isArray(themes) ? themes.length : 0;
      out.customThemeNames = Array.isArray(themes) ? themes.map((t) => (t && t.name) || '(无名)') : [];
      out.customThemeHasTokens = Array.isArray(themes)
        ? themes.map((t) => !!(t && t.tokens && Object.keys(t.tokens).length))
        : [];

      try {
        const a = out.activeRaw ? JSON.parse(out.activeRaw) : null;
        out.activeThemeName = a ? a.name : null;
        out.activeThemeBuiltin = a ? !!a.builtin : null;
        out.activeThemeTokenKeys = a && a.tokens ? Object.keys(a.tokens).length : 0;
        out.activeThemePrimary = a ? a.primaryColor : null;
      } catch (e) { out.activeParseError = String(e); }

      // localStorage 总用量，用来判断是否触顶被裁过
      let total = 0;
      for (let i = 0; i < localStorage.length; i++) {
        const k = localStorage.key(i);
        total += (k || '').length + (localStorage.getItem(k) || '').length;
      }
      out.approxBytes = total;
      out.keyCount = localStorage.length;
      return out;
    })()
  `);

  console.log('=== 主题数据检查（只读） ===');
  console.log('origin            :', data.origin);
  console.log('自定义主题数量    :', data.customThemeCount);
  console.log('自定义主题名称    :', (data.customThemeNames || []).join(' / ') || '（无）');
  console.log('各自是否带令牌    :', (data.customThemeHasTokens || []).join(', ') || '（无）');
  console.log('当前生效主题      :', data.activeThemeName, data.activeThemeBuiltin === null ? '' : '(builtin=' + data.activeThemeBuiltin + ')');
  console.log('当前主题令牌数    :', data.activeThemeTokenKeys);
  console.log('当前主题主色      :', data.activeThemePrimary);
  console.log('localStorage 键数 :', data.keyCount, ' / 约', Math.round((data.approxBytes || 0) / 1024), 'KB');
  if (data.themesParseError) console.log('主题 JSON 解析错误:', data.themesParseError);
  if (data.activeParseError) console.log('生效主题解析错误  :', data.activeParseError);

  app.exit(0);
});
