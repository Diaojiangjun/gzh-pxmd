import tailwindcss from '@tailwindcss/vite';
import react from '@vitejs/plugin-react';
import path from 'path';
import { defineConfig, type Plugin } from 'vite';

/**
 * 只对生产构建注入 CSP（dev 下 vite/React Refresh 需要 inline script，注入会破坏 HMR）。
 * 这是 XSS 修复之外的第二道防线：即便有内容绕过了输出消毒，也无法执行脚本/加载外部资源。
 */
const PROD_CSP = [
  "default-src 'self'",
  "script-src 'self'",
  // 内容里大量使用 inline style（公众号内联样式），必须放开
  "style-src 'self' 'unsafe-inline'",
  // 图片：本地 + base64 + 图床 https 外链
  "img-src 'self' data: blob: https:",
  "font-src 'self' data:",
  "connect-src 'self' https:",
  "media-src 'self' data: blob:",
  "object-src 'none'",
  "base-uri 'none'",
  "form-action 'none'",
  "frame-src 'none'",
].join('; ');

function injectProdCSP(): Plugin {
  return {
    name: 'inject-prod-csp',
    apply: 'build',
    transformIndexHtml(html: string) {
      const meta = `    <meta http-equiv="Content-Security-Policy" content="${PROD_CSP}" />\n`;
      return html.includes('Content-Security-Policy')
        ? html
        : html.replace(/<head>/i, `<head>\n${meta}`);
    },
  };
}

export default defineConfig(({ command }) => {
  return {
    // 生产构建必须用相对路径：Electron 打包后用 `loadFile(dist/index.html)` 走 file:// 协议，
    // 绝对路径 `/assets/xxx.js` 会被解析成 `file:///assets/xxx.js` → 资源 404 → 白屏。
    // 开发服务器仍用 '/'（'./' 在 dev 下语义不同）。
    base: command === 'build' ? './' : '/',
    plugins: [react(), tailwindcss(), injectProdCSP()],
    resolve: {
      alias: {
        '@': path.resolve(__dirname, '.'),
      },
    },
    // ⚠️ 不要设置 optimizeDeps.holdUntilCrawlEnd = false。
    // 试过：它能让 dev server「提前就绪」，看似省掉冷启动等待，实则会让
    // Electron 窗口在依赖预打包**尚未完成**时就加载页面 → 模块解析失败 → 白屏。
    // 冷启动那几秒等待就是 Vite 的在途门控，去掉它等于把风险转嫁给用户。
    // 首屏真正的大头（mermaid）已在 diagramRenderer.ts 改为运行时动态 import 解决。
    server: {
      // HMR is disabled in AI Studio via DISABLE_HMR env var.
      // Do not modify—file watching is disabled to prevent flickering during agent edits.
      hmr: process.env.DISABLE_HMR !== 'true',
      // Disable file watching when DISABLE_HMR is true to save CPU during agent edits.
      watch: process.env.DISABLE_HMR === 'true' ? null : {},
    },
  };
});
