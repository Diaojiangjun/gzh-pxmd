MathJax tex-svg 组件（公式渲染）
================================

文件：tex-svg.js
版本：MathJax 3.2.0
来源：https://cdn.jsdelivr.net/npm/mathjax@3.2.0/es5/tex-svg.js

为什么固定用 3.2.0？
------------------
MathJax 3.2.2 存在一个回归 bug：渲染含 \frac（分数）的公式时会抛出
  "Cannot read properties of null (reading '4')"
（内部 getRange 返回 null 后未做空值保护）。
3.2.0 与 3.1.2 均正常。

使用方式（见 src/services/diagramRenderer.ts）：
1. 加载前先设置 window.MathJax 配置：
   { tex: { tags: 'ams' }, svg: { fontCache: 'none' }, startup: { typeset: false } }
2. 动态注入 <script src="mathjax/tex-svg.js">（本目录位于 public/，dev 与打包后均可访问）
3. 等 MathJax.startup.promise
4. 调用 window.MathJax.tex2svg(formula, { display }) 得到自包含 SVG

升级注意：升级此文件前，务必回归测试 \frac 等复杂公式。
