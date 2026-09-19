/**
 * 主题设计器 UI 冒烟测试（驱动真实应用页面）
 *
 * 重点验证三件事：
 *  1. 8 个分组都能切换、控件都渲染出来，且全程 0 console 错误；
 *  2. 改参数能**实时反映到预览**（令牌 → 编译 → 预览 的链路是通的）；
 *  3. 反复开关不触发 hook 顺序错误（历史上踩过：hook 写在早退之后直接崩）。
 *
 * 用法：先 `npm run dev`，再 `npx electron scripts/run-designer-test.cjs`
 */
const { app, BrowserWindow } = require('electron');
const http = require('http');
const fs = require('fs');
const path = require('path');

/**
 * 为什么用「生产构建 + 临时静态服务器」而不是 vite dev：
 *
 *  1. **dev 的 HMR 会毁掉测试**：vite 首次遇到新模块时会推送「依赖已优化，整页 reload」，
 *     脚本执行到一半渲染上下文被销毁 → executeJavaScript 直接失败或永久挂起
 *     （表现为「跑了几分钟没有任何输出」）；
 *  2. **不污染用户数据**：临时端口与用户的 :3000 不同源，localStorage 天然隔离；
 *  3. **离真实产物更近**：包里跑的就是 dist，顺带能验证构建产物本身没问题。
 *
 * 注意不能直接用 file:// 加载 dist —— 生产构建用的是 `<script type="module">`，
 * file:// 的 opaque origin 会让模块脚本被 CORS 拦掉，页面白屏。
 */
const DIST = path.join(__dirname, '..', 'dist');

const MIME = {
  '.html': 'text/html; charset=utf-8',
  '.js': 'text/javascript; charset=utf-8',
  '.css': 'text/css; charset=utf-8',
  '.json': 'application/json; charset=utf-8',
  '.svg': 'image/svg+xml',
  '.png': 'image/png',
  '.ico': 'image/x-icon',
  '.woff': 'font/woff',
  '.woff2': 'font/woff2',
};

function startStaticServer() {
  return new Promise((resolve, reject) => {
    const server = http.createServer((req, res) => {
      let rel = decodeURIComponent((req.url || '/').split('?')[0]);
      if (rel === '/') rel = '/index.html';
      const file = path.join(DIST, rel);
      // 目录穿越防护：解析后的路径必须仍在 dist 内
      if (!file.startsWith(DIST) || !fs.existsSync(file) || fs.statSync(file).isDirectory()) {
        res.writeHead(404);
        res.end('not found');
        return;
      }
      res.writeHead(200, { 'Content-Type': MIME[path.extname(file)] || 'application/octet-stream' });
      fs.createReadStream(file).pipe(res);
    });
    server.on('error', reject);
    // 端口 0 = 由系统分配空闲端口，避免与用户正在跑的服务撞车
    server.listen(0, '127.0.0.1', () => resolve({ server, port: server.address().port }));
  });
}

const TIMEOUT_MS = 60000;

app.disableHardwareAcceleration();

const SCRIPT = `(async () => {
  const lines = [];
  // 整体包一层 try/catch：页面脚本一旦抛错，executeJavaScript 会返回 rejected promise，
  // 主进程若没接住就会静默挂死（表现为「测试跑了 7 分钟没输出」），排查成本极高。
  try {
  // 进度埋点：Electron 对 executeJavaScript 的失败只给一句笼统提示，
  // 靠这个标记才能在「页面被销毁 / 脚本抛错」之间分辨并定位到具体步骤。
  const mark = (m) => { window.__DIAG__ = m; };
  mark('start');
  const wait = (ms) => new Promise((r) => setTimeout(r, ms));
  const ok = (name, cond, detail) => lines.push((cond ? 'PASS  ' : 'FAIL  ') + name + (detail ? '  (' + detail + ')' : ''));

  // 收集运行期错误（React 崩溃 / hook 顺序错误都会走这里）
  const errs = [];
  window.addEventListener('error', (e) => errs.push(String(e.message || e)));
  window.addEventListener('unhandledrejection', (e) => errs.push('rejection: ' + String(e.reason)));
  const origError = console.error;
  console.error = function (...args) { errs.push(args.map(String).join(' ')); origError.apply(console, args); };

  const dialog = () => document.querySelector('[aria-label="主题设计器"]');
  const managerDialog = () => document.querySelector('[aria-label="文章主题"]');
  const paletteEntry = () => document.querySelector('[title^="文章主题"]');
  const mmBtn = (root, text) => [...root.querySelectorAll('button')].find((b) => (b.textContent || '').includes(text));
  /** 设计器的入口是「顶栏调色板 → 主题列表 → 样式参数」，测试走真实路径 */
  const openDesigner = async () => {
    const p = paletteEntry();
    if (!p) return null;
    // 主题列表没开才点入口 —— 顶栏按钮是 toggle 语义，已开时再点会把它关掉
    if (!managerDialog()) {
      p.click();
      await wait(500);
    }
    const mm = managerDialog();
    if (!mm) return null;
    const adv = mmBtn(mm, '样式参数');
    if (adv) { adv.click(); await wait(500); }
    return dialog();
  };

  /** 关掉所有主题相关弹窗（设计器在上层，必须先关它） */
  const closeModals = async () => {
    for (let i = 0; i < 5; i++) {
      const target = dialog() || managerDialog();
      if (!target) return;
      const c = target.querySelector('[aria-label="关闭"]');
      if (!c) return;
      c.click();
      await wait(280);
    }
  };
  const byText = (root, text) => [...root.querySelectorAll('button')].find((b) => (b.textContent || '').trim() === text);

  // ⚠️ 测试跑在与应用同一个 origin 上，会共享 localStorage。
  // 设计器是「实时改生效主题」的，不还原就会污染用户的主题配置 —— 先快照，收尾时恢复。
  const THEMES_KEY = 'gzh_editor_custom_themes_v1';
  const ACTIVE_KEY = 'gzh_editor_active_theme_v1';
  const PROMO_KEY = 'gzh_editor_promo_v1';
  const CONTACTS_KEY = 'gzh_editor_contacts_override_v1';
  const snap = {
    themes: localStorage.getItem(THEMES_KEY),
    active: localStorage.getItem(ACTIVE_KEY),
    promo: localStorage.getItem(PROMO_KEY),
    contacts: localStorage.getItem(CONTACTS_KEY),
  };
  const restore = () => {
    if (snap.themes === null) localStorage.removeItem(THEMES_KEY); else localStorage.setItem(THEMES_KEY, snap.themes);
    if (snap.active === null) localStorage.removeItem(ACTIVE_KEY); else localStorage.setItem(ACTIVE_KEY, snap.active);
    if (snap.promo === null) localStorage.removeItem(PROMO_KEY); else localStorage.setItem(PROMO_KEY, snap.promo);
    if (snap.contacts === null) localStorage.removeItem(CONTACTS_KEY); else localStorage.setItem(CONTACTS_KEY, snap.contacts);
  };

  if (!paletteEntry()) return { error: '未找到顶栏主题入口按钮', lines };

  // ── 0. 顶栏入口必须落到「主题列表」而不是设计器（用户原有的使用习惯） ──
  paletteEntry().click();
  await wait(600);
  ok('顶栏入口打开的是主题列表', !!managerDialog());
  const advBtn = managerDialog() ? mmBtn(managerDialog(), '样式参数') : null;
  ok('主题列表里有「样式参数」入口', !!advBtn);
  if (advBtn) { advBtn.click(); await wait(600); }
  let d = dialog();
  ok('从主题列表可进入设计器', !!d);
  if (!d) return { lines, errs };

  // ── 0b. 设计器里的「主题库」按钮应能返回列表，并能再次进入 ──
  const toLibraryBtn = mmBtn(d, '主题库');
  ok('设计器提供「主题库」返回入口', !!toLibraryBtn);
  if (toLibraryBtn) {
    toLibraryBtn.click();
    await wait(500);
    ok('点「主题库」回到主题列表', !!managerDialog() && !dialog());
    const back = managerDialog() ? mmBtn(managerDialog(), '样式参数') : null;
    if (back) { back.click(); await wait(500); }
    d = dialog();
    ok('可从列表再次进入设计器', !!d);
    if (!d) return { lines, errs };
  }

  // ── 2. 遍历 8 个分组 ──
  const GROUPS = [
    ['配色方案', '主要颜色'],
    ['元素配色', 'H1 / H2 标题色'],
    ['字体字号', '正文字号'],
    ['段落排版', '行高倍数'],
    ['标题装饰', 'H2 章节标题样式'],
    ['元素外观', '图片圆角'],
    ['代码块', '代码主题'],
    ['版心容器', '版心最大宽度'],
  ];
  for (const [group, probe] of GROUPS) {
    const btn = byText(d, group);
    if (!btn) { ok('分组按钮 ' + group, false, '按钮未找到'); continue; }
    btn.click();
    await wait(200);
    // 「标题装饰」面板全是分段按钮（无 input/select），所以按「可交互元素总数」统计
    const controls = d.querySelectorAll('input, select, textarea, button').length;
    const hasProbe = (d.textContent || '').includes(probe);
    ok('分组「' + group + '」', controls >= 2 && hasProbe, controls + ' 个可交互元素 / 探针:' + probe);
  }

  // ── 3. 改参数 → 预览实时更新 ──
  const previewHost = () => d.querySelector('.gzh-preview-container');
  const previewLen = () => (previewHost() ? previewHost().innerHTML.length : 0);

  // 3.1 切到示例内容，保证有 --- 分隔线可供观察
  const sampleBtn = byText(d, '示例内容');
  if (sampleBtn) { sampleBtn.click(); await wait(400); }

  // 3.2 元素外观 —— 先归零到「星标」，再切实线，确保观察的是本次改动带来的差异
  byText(d, '元素外观').click();
  await wait(220);
  const starsBtn = [...d.querySelectorAll('button')].find((b) => (b.textContent || '').includes('星标'));
  if (starsBtn) { starsBtn.click(); await wait(600); }
  const beforeHr = (previewHost() || {}).innerHTML || '';
  const solidBtn = byText(d, '实线');
  if (solidBtn) {
    solidBtn.click();
    await wait(600);
    const afterHr = (previewHost() || {}).innerHTML || '';
    ok(
      '分隔线 星标 → 实线，预览转为 <hr>',
      !beforeHr.includes('<hr') && afterHr.includes('<hr'),
      'before·hr=' + beforeHr.includes('<hr') + ' after·hr=' + afterHr.includes('<hr')
    );
  } else {
    ok('找到「实线」按钮', false);
  }

  // 3.3 段落排版 → 点「两端对齐 / 左对齐」切换，预览 text-align 应变化
  byText(d, '段落排版').click();
  await wait(220);
  const leftBtn = byText(d, '左对齐');
  if (leftBtn) {
    leftBtn.click();
    await wait(600);
    const html = (previewHost() || {}).innerHTML || '';
    ok('段对齐切换后产物变为 left', /text-align:\\s*left/.test(html));
  } else {
    ok('找到「左对齐」按钮', false);
  }

  // 3.4 字体字号 → 改正文字号（用原生 setter 触发 React onChange）
  byText(d, '字体字号').click();
  await wait(220);
  const sizeInput = d.querySelector('input[type="number"]');
  if (sizeInput) {
    const cur = parseFloat(sizeInput.value);
    // 值必须与当前不同，否则「无变化」断言会误判（上一次测试可能改过同一字段）
    const next = cur >= 20 ? cur - 1 : cur + 1;
    const before = (previewHost() || {}).innerHTML || '';
    const setter = Object.getOwnPropertyDescriptor(window.HTMLInputElement.prototype, 'value').set;
    setter.call(sizeInput, String(next));
    sizeInput.dispatchEvent(new Event('input', { bubbles: true }));
    await wait(700);
    const after = (previewHost() || {}).innerHTML || '';
    ok('改正文字号后预览随之变化', after !== before && after.includes(next + 'px'), 'cur=' + cur + ' → next=' + next);
  } else {
    ok('找到字号数值输入', false);
  }

  // ── 4. 另存为自定义主题 ──
  const KEY = 'gzh_editor_custom_themes_v1';
  const before = JSON.parse(localStorage.getItem(KEY) || '[]').length;
  const saveBtn = byText(d, '另存为自定义主题');
  if (saveBtn) {
    saveBtn.click();
    await wait(500);
    const after = JSON.parse(localStorage.getItem(KEY) || '[]').length;
    ok('另存为自定义主题写入 localStorage', after === before + 1, before + ' → ' + after);
  } else {
    ok('找到「另存为自定义主题」按钮', false);
  }

  mark('groups+live-done');
  // ── 5. 开关循环（hook 顺序稳定性） ──
  // ⚠️ 关闭按钮必须每轮重新查询：弹窗卸载后旧引用已脱离文档，对其 click() 无效
  for (let i = 0; i < 3; i++) {
    const c = d.querySelector('[aria-label="关闭"]');
    if (c) c.click(); else d.click();
    await wait(280);
    ok('第 ' + (i + 1) + ' 轮关闭', !dialog());
    d = await openDesigner();
    ok('第 ' + (i + 1) + ' 轮重新打开', !!d);
    if (!d) break;
  }

  mark('toggle-loop-done');
  // ── 6. 主题管理弹窗：导出 / 分享码 链路 ──
  const navEntry = [...document.querySelectorAll('nav button')].find((b) => (b.textContent || '').includes('主题'));
  if (navEntry) {
    await closeModals();
    navEntry.click();
    await wait(600);
    const mm = document.querySelector('[aria-label="文章主题"]');
    ok('主题管理弹窗已打开', !!mm);
    if (mm) {
      const btn = (text) => [...mm.querySelectorAll('button')].find((b) => (b.textContent || '').trim() === text);
      const btnHas = (text) => [...mm.querySelectorAll('button')].some((b) => (b.textContent || '').includes(text));

      ok('存在「粘贴分享码」入口', btnHas('粘贴分享码'));
      ok('存在「导出文件」入口', btnHas('导出文件'));
      ok('存在「分享码」入口', btnHas('分享码'));

      const shareBtn = btn('分享码');
      if (shareBtn) {
        shareBtn.click();
        await wait(450);
        ok('点击分享码后给出反馈', /已复制|不可用/.test(mm.textContent || ''));
      }

      // 展开粘贴区 → 先喂非法码，再喂合法码
      btn('粘贴分享码')?.click();
      await wait(320);
      const ta = mm.querySelector('textarea[placeholder*="分享码"]');
      ok('分享码输入区已展开', !!ta);
      if (ta) {
        const setter = Object.getOwnPropertyDescriptor(window.HTMLTextAreaElement.prototype, 'value').set;
        const type = async (v) => {
          setter.call(ta, v);
          ta.dispatchEvent(new Event('input', { bubbles: true }));
          await wait(200);
        };

        await type('这不是一个合法的分享码');
        btn('导入')?.click();
        await wait(420);
        ok('非法分享码给出错误提示', /无法识别/.test(mm.textContent || ''));

        const payload = JSON.stringify({
          name: '分享码测试主题',
          primaryColor: '#123456',
          secondaryColor: '#333333',
          accentColor: '#00aa88',
          backgroundColor: '#ffffff',
          fontFamily: 'sans-serif',
          fontSize: '15px',
          lineHeight: 1.75,
          letterSpacing: '0.5px',
          headingStyle: 'left-accent-bar',
          codeTheme: 'mac-dark',
        });
        const b64 = btoa(String.fromCharCode(...new TextEncoder().encode(payload)))
          .replace(/\\+/g, '-')
          .replace(/\\//g, '_')
          .replace(/=+$/, '');

        const countBefore = JSON.parse(localStorage.getItem(THEMES_KEY) || '[]').length;
        await type('GZH-THEME-1:' + b64);
        btn('导入')?.click();
        await wait(600);

        const countAfter = JSON.parse(localStorage.getItem(THEMES_KEY) || '[]').length;
        ok('合法分享码导入成功（自定义主题 +1）', countAfter === countBefore + 1, countBefore + ' → ' + countAfter);
        ok('导入后自动选中该主题', (mm.textContent || '').includes('分享码测试主题'));
      }

      const c2 = mm.querySelector('[aria-label="关闭"]');
      if (c2) c2.click();
      await wait(320);
      ok('主题管理弹窗已关闭', !document.querySelector('[aria-label="文章主题"]'));
    }
  } else {
    ok('找到主题管理入口', false);
  }

  mark('share-done');
  // ── 7. 主题库：搜索与分类筛选 ──
  await closeModals();
  navEntry?.click();
  await wait(600);
  let mm2 = document.querySelector('[aria-label="文章主题"]');
  if (mm2) {
    const countIn = (label) => {
      const el = [...mm2.querySelectorAll('div')].find((d) =>
        (d.textContent || '').startsWith(label) && d.children.length <= 2
      );
      return el ? (el.textContent || '') : '';
    };

    const allBtnTexts = [...mm2.querySelectorAll('button')].map((b) => (b.textContent || '').trim());
    const totalText = allBtnTexts.find((t) => t.startsWith('全部'));
    // 取数字用字符过滤而不是正则：注入脚本本体是外层模板字符串，
    // 正则里的单反斜杠转义（如反斜杠+D）会在模板求值阶段被吃掉，悄悄把行为改掉。
    const digitsOf = (s) => s.split('').filter((c) => c >= '0' && c <= '9').join('');
    const totalCount = totalText ? parseInt(digitsOf(totalText), 10) : NaN;
    ok(
      '显示主题总数且 ≥ 28',
      Number.isFinite(totalCount) && totalCount >= 28,
      totalText ?? '未找到（候选：' + allBtnTexts.filter((t) => t.includes('全部')).join('|') + '）'
    );

    // 分类筛选：点「暗色」后内置区只剩 3 套
    const darkBtn = [...mm2.querySelectorAll('button')].find((b) => (b.textContent || '').trim().startsWith('暗色'));
    if (darkBtn) {
      darkBtn.click();
      await wait(320);
      ok('分类筛选生效（暗色 3 套）', /内置主题（3）/.test(mm2.textContent || ''), (mm2.textContent || '').match(/内置主题（\d+）/)?.[0]);
      darkBtn.click(); // 再点一次取消筛选
      await wait(300);
    } else {
      ok('找到「暗色」分类按钮', false);
    }

    // 搜索：按中文名
    const searchInput = mm2.querySelector('input[placeholder*="搜索主题名"]');
    if (searchInput) {
      const setter = Object.getOwnPropertyDescriptor(window.HTMLInputElement.prototype, 'value').set;
      setter.call(searchInput, '青瓷');
      searchInput.dispatchEvent(new Event('input', { bubbles: true }));
      await wait(320);
      ok('搜索「青瓷」命中 1 套', /内置主题（1）/.test(mm2.textContent || ''), (mm2.textContent || '').match(/内置主题（\d+）/)?.[0]);

      // 按英文名搜（验证英文名也参与匹配）
      setter.call(searchInput, 'celadon');
      searchInput.dispatchEvent(new Event('input', { bubbles: true }));
      await wait(300);
      ok('搜索英文名「celadon」命中', /内置主题（1）/.test(mm2.textContent || ''));

      // 搜不到关键词
      setter.call(searchInput, 'zzz-不存在');
      searchInput.dispatchEvent(new Event('input', { bubbles: true }));
      await wait(300);
      ok('无结果时给出空态', (mm2.textContent || '').includes('没有符合条件的主题'));

      setter.call(searchInput, '');
      searchInput.dispatchEvent(new Event('input', { bubbles: true }));
      await wait(300);
    } else {
      ok('找到主题搜索框', false);
    }

    mark('search-filter-done');
    // ── 8. CSS 编辑器：高亮对齐 / 补全 / 速查 ──
    // 内置主题的编辑器是只读的，所以先建一个可编辑的自定义主题
    const newBtn = [...mm2.querySelectorAll('button')].find((b) => (b.textContent || '').includes('新建自定义主题'));
    if (newBtn) {
      newBtn.click();
      await wait(500);

      const ta = mm2.querySelector('textarea[aria-label="自定义 CSS 编辑区"]');
      const pre = mm2.querySelector('pre[aria-hidden="true"]');
      ok('CSS 编辑器已渲染（textarea + 高亮层）', !!ta && !!pre);

      if (ta && pre) {
        const setter = Object.getOwnPropertyDescriptor(window.HTMLTextAreaElement.prototype, 'value').set;
        const type = async (v) => {
          setter.call(ta, v);
          ta.dispatchEvent(new Event('input', { bubbles: true }));
          await wait(260);
        };

        // 8.1 高亮层文本必须与输入值逐字一致（多一个字符光标就会错位）
        // ⚠️ 换行必须写成「双反斜杠 + n」：注入脚本本体是外层模板字符串，
        // 单反斜杠写法会在模板求值阶段变成真实换行，让单引号字符串跨行 → 整段脚本语法错误。
        // （同样地，注释里也别出现「单反斜杠 + n」，否则注释会被换成换行、后半句直接变裸代码）
        const sample = 'p { margin: 16px 0; color: #07C160; }\\n/* 注释 */\\n@media (max-width:600px) { p { color: red; } }';
        await type(sample);
        ok(
          '高亮层与输入值逐字一致',
          pre.textContent === sample + '\\n',
          JSON.stringify((pre.textContent || '').slice(0, 60))
        );
        ok('高亮已着色（选择器/属性/数值/颜色）',
          !!pre.querySelector('.ck-sel') && !!pre.querySelector('.ck-prop') &&
          !!pre.querySelector('.ck-num') && !!pre.querySelector('.ck-color'));

        // 8.2 诊断：@media 应被标为「不会生效」
        ok('诊断出 @media 不会生效', (mm2.textContent || '').includes('@media'));

        // 8.3 自动补全：块内输入属性前缀应弹候选
        await type('p { font-');
        ta.focus();
        ta.setSelectionRange(ta.value.length, ta.value.length);
        await wait(200);
        const hasComp = [...mm2.querySelectorAll('button')].some((b) => (b.textContent || '').includes('font-size'));
        ok('输入「font-」弹出属性候选', hasComp);

        if (hasComp) {
          const opt = [...mm2.querySelectorAll('button')].find((b) => (b.textContent || '').includes('font-size'));
          opt.dispatchEvent(new MouseEvent('mousedown', { bubbles: true }));
          await wait(420);
          ok('点击候选完成补全', ta.value === 'p { font-size: ', JSON.stringify(ta.value));
        }

        // 8.4 属性值上下文不弹候选（避免打断输入颜色/数值）
        await type('p { margin: ');
        await wait(220);
        const compOnValue = [...mm2.querySelectorAll('button')].some((b) => (b.textContent || '').includes('CSS 属性 ·'));
        ok('写属性值时不再弹属性候选', !compOnValue);

        // 8.5 速查面板：点击即插入
        const cheatBtn = [...mm2.querySelectorAll('button')].find((b) => (b.textContent || '').includes('常用属性速查'));
        ok('存在「常用属性速查」入口', !!cheatBtn);
        if (cheatBtn) {
          cheatBtn.click();
          await wait(320);
          const chip = [...mm2.querySelectorAll('button')].find((b) => (b.textContent || '').trim() === 'padding');
          ok('速查面板展开且有属性 chips', !!chip);
          if (chip) {
            await type('p {  }');
            ta.focus();
            ta.setSelectionRange(5, 5);
            await wait(150);
            chip.click();
            await wait(350);
            ok('点击 chip 插入片段', (ta.value || '').includes('padding: 12px 18px;'), JSON.stringify(ta.value));
          }
        }
      }
    } else {
      ok('找到「新建自定义主题」按钮', false);
    }

    const c3 = mm2.querySelector('[aria-label="关闭"]');
    if (c3) c3.click();
    await wait(320);
    mm2 = null;
  }

  // ── 9. 使用说明 · 语法速查 ──
  mark('about');
  await closeModals();
  // 清掉推广位配置，保证下面「未配置时的引导态」断言是确定的
  localStorage.removeItem(PROMO_KEY);

  const aboutEntry = document.querySelector('[title="关于与使用说明"]');
  ok('找到使用说明入口', !!aboutEntry);
  if (aboutEntry) {
    aboutEntry.click();
    await wait(600);
    let am = document.querySelector('[aria-label="使用说明"]');
    ok('使用说明弹窗已打开', !!am);

    if (am) {
      const amBtn = (text) => [...am.querySelectorAll('button')].find((b) => (b.textContent || '').includes(text));
      const amText = () => am.textContent || '';
      const preText = () => [...am.querySelectorAll('pre')].map((p) => p.textContent || '').join(' @@ ');

      // 9.1 五个分类齐全
      const groups = ['基础语法', '排版块', '公式与图表', '特殊元素', '使用技巧'];
      const missingGroups = groups.filter((g) => !amBtn(g));
      ok('五个语法分类齐全', missingGroups.length === 0, missingGroups.join(','));

      // 9.2 默认展示基础语法
      ok('默认展示基础语法', amText().includes('加粗') && amText().includes('表格'));

      // 9.3 排版块：11 个 ::: 块示例都应出现
      amBtn('排版块').click();
      await wait(320);
      const blocks = [':::hero', ':::toc', ':::quote', ':::callout', ':::card', ':::timeline', ':::steps', ':::progress', ':::compare', ':::themes', ':::footer'];
      const missingBlocks = blocks.filter((blk) => !preText().includes(blk) && !amText().includes(blk));
      ok('排版块 11 个示例齐全', missingBlocks.length === 0, missingBlocks.join(','));

      // 9.4 公式与图表
      amBtn('公式与图表').click();
      await wait(320);
      ok('公式分类含行内公式', amText().includes('E = mc^2'));
      ok('公式分类含 Mermaid 示例', amText().includes('mermaid'));

      // 9.5 特殊元素
      amBtn('特殊元素').click();
      await wait(320);
      ok('特殊元素含表情包语法', amText().includes('sticker:small'));
      ok('特殊元素含注音语法', amText().includes('wén zì'));

      // 9.6 跨分类搜索
      const searchBox = am.querySelector('input[placeholder*="搜索语法"]');
      ok('存在语法搜索框', !!searchBox);
      if (searchBox) {
        const setter = Object.getOwnPropertyDescriptor(window.HTMLInputElement.prototype, 'value').set;
        const typeSearch = async (v) => {
          setter.call(searchBox, v);
          searchBox.dispatchEvent(new Event('input', { bubbles: true }));
          await wait(320);
        };

        await typeSearch('表格');
        ok('搜索「表格」命中', amText().includes('搜索结果') && preText().includes('表头'));

        await typeSearch('公式');
        ok('搜索「公式」跨分类命中', amText().includes('搜索结果') && amText().includes('E = mc^2'));

        await typeSearch('zzz查不到的关键词');
        ok('无结果时给出空态', amText().includes('没有找到匹配的语法'));

        const clearBtn = am.querySelector('[aria-label="清空搜索"]');
        if (clearBtn) { clearBtn.click(); await wait(320); }
        ok('清空搜索后回到分类视图', !amText().includes('搜索结果'));
      }

      // 9.7 复制按钮
      ok('条目带「复制」按钮', !!amBtn('复制'));

      // 9.8 关闭
      const amClose = am.querySelector('[aria-label="关闭"]');
      if (amClose) amClose.click();
      await wait(320);
      ok('使用说明可正常关闭', !document.querySelector('[aria-label="使用说明"]'));

      // 9.9 开关两轮不崩
      for (let i = 0; i < 2; i++) {
        aboutEntry.click();
        await wait(420);
        am = document.querySelector('[aria-label="使用说明"]');
        ok('第 ' + (i + 1) + ' 轮打开使用说明', !!am);
        if (!am) break;
        const c = am.querySelector('[aria-label="关闭"]');
        if (c) c.click();
        await wait(300);
      }
    }
  }

  // ── 10. 关于本器 / 我的推广位 ──
  mark('about-promo');
  await closeModals();

  const aboutBtn = document.querySelector('[title="关于与使用说明"]');
  ok('找到使用说明入口', !!aboutBtn);
  if (aboutBtn) {
    aboutBtn.click();
    await wait(600);
    let am = document.querySelector('[aria-label="使用说明"]');
    ok('使用说明弹窗已打开', !!am);

    if (am) {
      const amBtn = (text) => [...am.querySelectorAll('button')].find((b) => (b.textContent || '').includes(text));
      const amText = () => am.textContent || '';

      // 10.1 三个 Tab
      ok('Tab「语法速查」存在', !!amBtn('语法速查'));
      ok('Tab「关于本器」存在', !!amBtn('关于本器'));
      ok('Tab「我的推广位」存在', !!amBtn('我的推广位'));

      // 10.2 关于本器
      amBtn('关于本器').click();
      await wait(320);
      ok('关于页显示产品名与定位', amText().includes('宝藏排版器') && amText().includes('微信公众号 Markdown 排版利器'));
      ok('关于页有核心能力区块', amText().includes('核心能力') && amText().includes('主题设计器'));
      ok('关于页有技术栈', amText().includes('技术栈') && amText().includes('React 19'));
      ok('关于页有来源致谢', amText().includes('来源与致谢') && amText().includes('gzh-design-skill'));
      ok('关于页有支持与反馈', amText().includes('支持与反馈') && !!amBtn('复制诊断信息'));
      ok('关于页保留隐私声明', amText().includes('100% 离线与隐私安全'));
      ok('关于页有「开发者 / 联系我」区块', amText().includes('开发者 / 联系我'));
      // 开发者是否已填写联系方式取决于本人，两种状态都算正常：
      // 填了就出卡片，没填就出填写指引 —— 这里只钉「不能两者皆无」
      {
        const hasCards = !!am.querySelector('div[class*="grid"] img[alt]') || /群|邮箱|扫码关注/.test(amText());
        const hasGuide = amText().includes('还没有填写联系方式') || amText().includes('APP_CONTACTS');
        ok('开发者区块有内容或给出填写指引', hasCards || hasGuide, hasCards ? '已填写联系方式' : '未填写，显示指引');
      }

      // 10.3 推广位：填表 → 生成 → 预览
      amBtn('我的推广位').click();
      await wait(320);
      const promoInput = am.querySelector('input[placeholder*="宝藏排版研究所"]');
      const guideArea = am.querySelector('textarea');
      ok('推广位表单可编辑', !!promoInput && !!guideArea);

      if (promoInput) {
        const setter = Object.getOwnPropertyDescriptor(window.HTMLInputElement.prototype, 'value').set;
        setter.call(promoInput, '测试公众号');
        promoInput.dispatchEvent(new Event('input', { bubbles: true }));
        await wait(420);

        ok('填入公众号名后写入 localStorage', (localStorage.getItem(PROMO_KEY) || '').includes('测试公众号'));
        ok('生成的 Markdown 含公众号名', amText().includes(':::footer') && amText().includes('测试公众号'));
        ok('预览区按当前主题渲染', !!am.querySelector('.gzh-preview-container'));
        ok('状态提示变为已配置', amText().includes('已配置'));
        ok('存在「复制 Markdown」按钮', !!amBtn('复制 Markdown'));
      }

      // 10.4 未配置时点「插入推广位」应跳到配置页
      const c = am.querySelector('[aria-label="关闭"]');
      if (c) c.click();
      await wait(320);

      localStorage.removeItem(PROMO_KEY);
      const quickBtn = [...document.querySelectorAll('button')].find((b) => (b.getAttribute('title') || '').includes('快捷块'));
      ok('找到快捷块入口', !!quickBtn);
      if (quickBtn) {
        quickBtn.click();
        await wait(320);
        const promoItem = [...document.querySelectorAll('button')].find((b) => (b.textContent || '').includes('我的推广位'));
        ok('快捷块菜单里有「我的推广位」', !!promoItem);
        if (promoItem) {
          promoItem.click();
          await wait(700);
          const am2 = document.querySelector('[aria-label="使用说明"]');
          ok('未配置时自动打开使用说明', !!am2);
          ok('并直接落到「我的推广位」Tab', !!am2 && (am2.textContent || '').includes('二维码'));

          // 10.5 配好后再插入，应落到编辑器里
          const input2 = am2.querySelector('input[placeholder*="宝藏排版研究所"]');
          if (input2) {
            const setter2 = Object.getOwnPropertyDescriptor(window.HTMLInputElement.prototype, 'value').set;
            setter2.call(input2, '端到端测试号');
            input2.dispatchEvent(new Event('input', { bubbles: true }));
            await wait(400);
          }
          const close2 = am2.querySelector('[aria-label="关闭"]');
          if (close2) close2.click();
          await wait(320);

          const editor = document.querySelector('textarea[aria-label="Markdown 编辑区"]') ||
            [...document.querySelectorAll('textarea')].find((t) => (t.value || '').length > 0);
          const beforeLen = editor ? editor.value.length : 0;

          quickBtn.click();
          await wait(300);
          const promoItem2 = [...document.querySelectorAll('button')].find((b) => (b.textContent || '').includes('我的推广位'));
          if (promoItem2) promoItem2.click();
          await wait(700);

          const afterLen = editor ? editor.value.length : 0;
          ok('已配置时插入推广位到编辑器', afterLen > beforeLen, beforeLen + ' → ' + afterLen);
          ok('插入内容含公众号名', !!editor && editor.value.includes('端到端测试号'));
          ok('插入内容含 :::footer', !!editor && editor.value.includes(':::footer'));
          ok('插入后不再弹出配置窗口', !document.querySelector('[aria-label="使用说明"]'));

          // 10.6 开发者联系方式：写入测试数据后应渲染卡片、缩略图，并能放大预览
          //      （刻意不走「我的推广位」——那套是使用者自己的公众号，与开发者信息无关）
          const fakeImg = 'data:image/gif;base64,R0lGODlhAQABAIAAAAAAAP///yH5BAEAAAAALAAAAAABAAEAAAIBRAA7';
          localStorage.setItem(CONTACTS_KEY, JSON.stringify([
            { type: 'wechat-mp', label: '测试公众号', note: '扫码关注', image: fakeImg },
            { type: 'qq-group', label: '测试群', value: '123456', note: '备注来意' },
            { type: 'email', label: '测试邮箱', value: 'a@b.com' },
          ]));

          aboutBtn.click();
          await wait(600);
          let am3 = document.querySelector('[aria-label="使用说明"]');
          if (am3) {
            const b3 = [...am3.querySelectorAll('button')].find((b) => (b.textContent || '').includes('关于本器'));
            if (b3) { b3.click(); await wait(400); }
            const t3 = am3.textContent || '';
            ok('渲染出联系方式卡片', t3.includes('测试公众号') && t3.includes('测试群') && t3.includes('123456'));
            ok('联系方式有内容时不再显示空指引', !t3.includes('还没有填写联系方式'));

            const thumb = am3.querySelector('img[alt="测试公众号"]');
            ok('带 image 的条目显示缩略图', !!thumb);

            if (thumb) {
              thumb.dispatchEvent(new MouseEvent('click', { bubbles: true }));
              await wait(450);
              const lb = document.querySelector('[aria-label="图片预览"]');
              ok('点击缩略图打开放大预览', !!lb);
              ok('预览里显示图片', !!lb && !!lb.querySelector('img'));
              ok('预览打开时使用说明仍在（Esc 只关预览）', !!document.querySelector('[aria-label="使用说明"]'));

              const lbClose = lb
                ? [...lb.querySelectorAll('button')].find((b) => (b.textContent || '').includes('关闭'))
                : null;
              if (lbClose) { lbClose.click(); await wait(400); }
              ok(
                '关闭预览后回到使用说明',
                !document.querySelector('[aria-label="图片预览"]') && !!document.querySelector('[aria-label="使用说明"]')
              );
            }

            // 清掉测试数据，验证空态指引会回来
            localStorage.removeItem(CONTACTS_KEY);
            const c3 = am3.querySelector('[aria-label="关闭"]');
            if (c3) c3.click();
            await wait(320);

            aboutBtn.click();
            await wait(600);
            const am4 = document.querySelector('[aria-label="使用说明"]');
            if (am4) {
              const b4 = [...am4.querySelectorAll('button')].find((b) => (b.textContent || '').includes('关于本器'));
              if (b4) { b4.click(); await wait(400); }
              const hasCard = !!am4.querySelector('img[alt="测试公众号"]');
              const t4 = am4.textContent || '';
              // 这里只断言「测试数据已清除」，避免依赖开发者本人是否已填写真实联系方式
              ok('清掉覆盖数据后测试卡片消失', !hasCard && !t4.includes('测试公众号'));
              const c4 = am4.querySelector('[aria-label="关闭"]');
              if (c4) c4.click();
              await wait(300);
            }
          }
        }
      }
    }
  }

  mark('css-editor-done');
  // 收尾：关闭全部弹窗 + 还原 localStorage 快照（避免污染用户的主题配置）
  await closeModals();
  restore();
  ok('已还原测试前的主题配置', localStorage.getItem(THEMES_KEY) === snap.themes);

  // 过滤掉与本功能无关的告警（Electron CSP 提示等）
  const relevant = errs.filter((e) => !/Security Warning|Content-Security-Policy|devtools|Download the React/i.test(e));
  ok('运行期 0 错误（React/hook/渲染）', relevant.length === 0, relevant.slice(0, 3).join(' | '));

  return { lines, errs: relevant };
  } catch (e) {
    lines.push('FAIL  脚本异常中止: ' + (e && e.message ? e.message : String(e)));
    return { lines, errs: [] };
  }
})()`;

/** 页面脚本兜底超时：宁可直接报错，也不要让进程无声挂着 */
const SCRIPT_TIMEOUT_MS = 150000;

app.whenReady().then(async () => {
  let staticServer = null;
  let URL = process.env.TEST_URL;

  if (!URL) {
    if (!fs.existsSync(path.join(DIST, 'index.html'))) {
      console.log('NO_DIST  请先执行 npm run build');
      app.exit(2);
      return;
    }
    const { server, port } = await startStaticServer();
    staticServer = server;
    URL = `http://127.0.0.1:${port}/`;
    console.log(`静态服务已启动：${URL}`);
  }

  const win = new BrowserWindow({ show: false, width: 1400, height: 950 });

  /**
   * 注入前自检。
   *
   * SCRIPT 此刻已经是「模板求值后」的最终文本，所以这里的语法检查才等价于
   * 浏览器真正收到的内容 —— 直接校验源文件会漏掉模板转义带来的破坏
   * （单反斜杠 + n 变成真实换行、单反斜杠 + D 被吃掉反斜杠，两个坑都真踩过）。
   */
  try {
    new Function(SCRIPT);
  } catch (e) {
    console.log('INJECTED_SCRIPT_SYNTAX_ERROR', e.message);
    staticServer?.close();
    app.exit(5);
    return;
  }

  let loaded = false;
  for (let i = 0; i < 20 && !loaded; i++) {
    try {
      await win.loadURL(URL);
      loaded = true;
    } catch {
      await new Promise((r) => setTimeout(r, 400));
    }
  }
  if (!loaded) {
    console.log('LOAD_FAILED');
    staticServer?.close();
    app.exit(2);
    return;
  }

  // 等应用挂载完成（入口按钮出现即视为 ready）
  await win.webContents.executeJavaScript(`
    new Promise((resolve) => {
      const t0 = Date.now();
      const tick = () => {
        if (document.querySelector('[title^="文章主题"]')) return resolve(true);
        if (Date.now() - t0 > 20000) return resolve(false);
        setTimeout(tick, 150);
      };
      tick();
    })
  `);

  let result;
  try {
    result = await Promise.race([
      win.webContents.executeJavaScript(SCRIPT),
      new Promise((_, reject) =>
        setTimeout(() => reject(new Error(`页面脚本超时（>${SCRIPT_TIMEOUT_MS / 1000}s）`)), SCRIPT_TIMEOUT_MS)
      ),
    ]);
  } catch (e) {
    console.log('SCRIPT_FAILED', String(e && e.message ? e.message : e));
    // 关键诊断：页面是否还活着 + 执行到哪一步被中断
    try {
      const alive = await win.webContents.executeJavaScript(
        '({ url: location.href, diag: window.__DIAG__ || "no-diag" })'
      );
      console.log('PAGE_ALIVE', JSON.stringify(alive));
    } catch (e2) {
      console.log('PAGE_DEAD', String(e2 && e2.message ? e2.message : e2));
    }
    app.exit(4);
    return;
  }

  if (result.error) {
    console.log('RESULT_ERROR', result.error);
    for (const l of result.lines || []) console.log(l);
    app.exit(3);
    return;
  }

  for (const line of result.lines) console.log(line);
  const failed = result.lines.filter((l) => l.startsWith('FAIL')).length;
  console.log(`\nSUMMARY ${result.lines.filter((l) => l.startsWith('PASS')).length} passed / ${failed} failed`);
  if (result.errs && result.errs.length) console.log('ERRORS:', result.errs.slice(0, 5));

  staticServer?.close();
  app.exit(failed > 0 ? 1 : 0);
});
