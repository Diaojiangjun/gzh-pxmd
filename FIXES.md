# 代码审查问题修复记录

**日期**：2026-09-11
**依据**：`CODE_REVIEW.md`（2 个 P0 / 16 个 P1 / 18 个 P2）
**结果**：**P0 全部修复，P1 修复 15/16，P2 修复 12/18**

---

## 一、批次 1 —— 安全与数据（P0 优先）

| # | 问题 | 修复 |
|---|---|---|
| 1 | **XSS：预览可执行任意脚本** | 新增 `src/utils/sanitizeHtml.ts`，在**编译出口**统一消毒：删除 script/iframe/object 等可执行标签、清除所有 `on*` 事件属性、危险协议降级为 `#`。逐标签处理，不误伤属性值里的普通文本 |
| 2 | 10+ 处用户文本裸插值 | 新增 `src/utils/escape.ts`（`escapeHtml` / `sanitizeHref` / `isDangerousUrl`），逐点转义：hero 四个字段、toc、timeline、codespan、脚注、代码块语言名、图片 alt 与图注、sticker alt、表格单元格；`renderer.link` 加协议白名单 |
| 3 | **保存配置静默清空 API Key** | `AIPanel` 输入框为空时**不发送** `apiKey` 字段（undefined = 保留原值）；`patchSecret` 语义收紧为「只有与当前掩码完全一致才算未修改」 |
| 4 | 6 个 async 处理器无 try/finally | `runToolbox` / `handleDiscover` / `handleSaveConfig` / `handleTest` / `runImageGen` / `loadAll` 全部补 `try/finally`，IPC 失败不再永久转圈 |
| 5 | 自动快照永不触发 | `setInterval` 依赖从 `[markdown, title, articleId]` 改为 `[]`，改用 ref 读取最新值 |
| 6 | 编辑器「一键排版」可能被选区结果覆盖 | `acceptResult` 改用**发起时固化**的来源（`appliedSelectionRef`），不再读实时 state |
| 7 | 关闭面板不终止流式请求 | `open=false` 时 `abort()` 并清空 `requestIdRef`，重开不再串流 |
| 8 | 双击竞态 | 引入 `inFlightRef` 做同步防重入（state 在同一帧不可靠） |
| 9 | 自定义提示词跨动作残留 | 仅 `action === 'custom'` 时传入 `customPrompts` |
| 10 | `closeAllDrawers` 漏 AI 面板 | 补上 `setIsAIPanelOpen(false)` |
| 11 | `showToast` 定时器未清理 | 保存句柄并在新提示前 `clearTimeout`，卸载时清理 |

---

## 二、批次 2 —— 流式正确性与主进程加固

| # | 问题 | 修复 |
|---|---|---|
| 12 | 流末尾丢 token | 循环结束后 `decoder.decode()` 收尾，并处理最后一个无换行结尾的数据块 |
| 13 | `data:` 无空格不识别 | 统一用 `/^data:\s?/` 剥离前缀（规范允许无空格） |
| 14 | 服务端可能回显 Key | 新增 `redactSecret()`，UNKNOWN 分支与所有响应体片段都先脱敏 |
| 15 | fetch 无超时 | `chatStream` 180s / `listModels` 30s / `generateImage` 180s，并合并外部 AbortSignal |
| 16 | 生图参数不适配非 OpenAI 服务 | `quality` / `style` 仅对 OpenAI 系模型发送 |
| 17 | base64 MIME 硬编码 png | 按响应里的 `mime_type` 推断 |
| 18 | requestId 无校验 | 校验为非空字符串；消息数组过滤非法项并限长 |
| 19 | 补丁字段非字符串 → TypeError | 新增 `normStr()`，非字符串一律当「未提供」 |
| 20 | 图床密钥永远删不掉 | 掩码语义与 AI 配置统一：显式空串 = 清空 |
| 21 | 短密钥掩码反而暴露 | 长度 < 16 一律全掩码 |
| 22 | 配置写盘失败仍返回成功 | 去掉 `try/catch` 吞错，失败时 reject，前端提示 |
| 23 | 密钥文件权限 | 写入时 `mode: 0o600` |
| 24 | PDF 导出未转义 + 离屏窗口偏弱 | `title` 转义；离屏窗口加 `sandbox: true` + `javascript: false` |
| 25 | 上传文件名可路径逃逸 | `path.basename` + 字符白名单；MIME 白名单；base64 长度上限 |
| 26 | 大文件读取无上限 | `selectImages` 单文件 20MB 上限 + `statSync` + try/catch，跳过超限文件 |
| 27 | 无导航限制 / 无 CSP | `setWindowOpenHandler` + `will-navigate` 拦截外链跳转；生产构建注入严格 CSP（dev 不注入，避免破坏 HMR） |
| 28 | 未使用依赖 | 移除 `@google/genai`、`dotenv`、`express`、`@types/express`；`vite` 去重到 devDependencies |

---

## 三、批次 3 —— 编译器质量、性能与清理

| # | 问题 | 修复 |
|---|---|---|
| 29 | **块内公式不渲染** | 新增复用的 `sharedMd()`（带公式扩展），块内解析全部改走它（`:::card` / `:::callout` / `:::quote` / GFM alert 里的 `$x$` 现在能渲染） |
| 30 | `:::` 内容含 `\|` 错列 | `splitCompareCells()` 支持 `\|` 转义，并**识别行内代码**（`` `a\|b` `` 不再被拆列）；超过 2 段时多余内容并入右列，不再静默丢弃 |
| 31 | 微信不兼容 CSS 残留 | `:::quote` 去掉 `position: relative` 与负 margin；`bottom-underline` 标题去掉无用的 `position`；hero / sticker 去掉 `box-shadow` |
| 32 | CRLF 残留 `\r` | 编译入口统一 `markdown.replace(/\r\n?/g, '\n')` |
| 33 | 重复全文扫描 | `processStickerAndSvgTags` 加**快路径**（无 sticker / 无 data:image 直接返回） |
| 34 | mermaid 每键重渲染 | App 侧 400ms 防抖 + diagramRenderer 内按图形代码缓存 PNG |
| 35 | 统计每次渲染都重算 | `PreviewPanel` 的 `calculateArticleStats` 加 `useMemo` |
| 36 | pangu 占位符可碰撞 | 占位符加随机 nonce，还原逻辑改为精确字符串替换（不用正则） |
| 37 | mermaid 注入面 | `securityLevel` 由 `loose` 收紧为 `strict` |
| 38 | 生图 base64 撑爆 localStorage | 插入前优先走图床换 https 外链，失败才回退内嵌 |
| 39 | 死代码 | 删除 `HistoryModal` 的 `viewMode` 与不可交互的「假 Tabs」；删除未被引用的 `getService`；`AIServicePreset` 类型去重到 `ai.ts` |
| 40 | 无障碍 | 新增 `src/hooks/useEscapeKey.ts`；4 个弹窗（备份/体检/图床/封面）补 **Esc 关闭 + 点遮罩关闭 + `role="dialog" aria-modal aria-label`**；AIPanel 图标按钮补 `aria-label` |
| 41 | dev 脚本进程残留 | 新增 `killProcessTree()`（Windows 走 `taskkill /T /F`）；修正退出分支逻辑——**用户关窗后整个开发环境会正确退出**；`shutdown` 加幂等保护 |
| 42 | FileReader 失败悬挂 | 补 `reader.onerror`，Promise 一定 settle |
| 43 | 复制失败谎报成功 | `HistoryModal` 复制改为 `await` + try/catch |
| 44 | IndexedDB clear 失败悬挂 | `dbService` 两处补 `clearReq.onerror` |

---

## 四、验证结果

### 静态检查
```
npm run lint            零错误
esbuild 主进程编译      main.js 59.2kb / preload.js 3.5kb / menu.js 7.2kb
vite 生产构建           成功（1m27s），CSP meta 已注入 dist/index.html
node --check dev 脚本   通过
```

### 运行时实测（Electron 无头，跑真实模块）

**XSS 专项**（含 `<script>` / `<img onerror>` / `javascript:` / `<iframe>` / 行内代码注入 / hero、toc、图片 alt、表格单元格注入）：
```
badAttrs = []      ← 真实 DOM 中零事件属性、零危险协议
badTags  = []      ← 无 script/iframe/object/embed/form/input/style/link/meta
```
> 初测时字符串出现过 3 处 `on*=`，DOM 复验确认全部位于**被转义后的正文文本**里，非真实属性。

**功能回归**（块版式 + 列表 + 公式 + 脚注同篇文档）：
```
codeSpanPipe = true        行内代码里的 | 不再被拆列
escapedPipe  = true        \| 转义生效
multiSegmentKept = true    >2 段不丢内容
quoteNoPosition / quoteNoNegMargin = true
progressBars = 3           compareCols = 10
stepsBadge = 2             themesBadge = 2
ul = 3   ol = 1   pInLi = 0     列表正常且无 <p> 干扰微信符号
tables = 1                 markdown 表格正常
svg = 2   blockCentered = 1      公式渲染 + 块级居中
mathInQuote = true         ★ 块内公式已修复
footnote = true            脚注正常
```

---

## 五、未修复项（有意保留）

| 项 | 原因 |
|---|---|
| 其余 9 个组件的 Esc 样板未统一替换 | 已抽出 `useEscapeKey`，逐个替换属纯重构、无功能收益，建议后续随改动顺手迁移 |
| 大量图标按钮仍缺 `aria-label` | 数量多、需逐个确认语义，建议专项处理 |
| 抽屉类组件未加 `role="dialog"` | 同上 |
| `renderer.listitem` 兜底分支 | 静态看不可达，但删掉后若某路径真的调用会退回无样式 `<li>`，风险大于收益 |
| 列表符号颜色依赖 `::marker` | 微信对 `::marker` 支持不稳定，但没有更好的内联替代方案 |
| 对比卡左右列高度不一致时下边框不对齐 | 用 `<table>` 能对齐但会被微信破坏，属已知取舍 |
| 密钥未用 Electron `safeStorage` 加密 | 已设 `0600` 权限；加密需评估跨平台兼容与迁移成本 |
| `:::xxx` 嵌套 / 代码块内 `:::` 错配 | 需要把块解析从「非贪婪正则」重写为「带栈的逐行状态机」，属结构性改造，建议单独排期 |

---

## 六、建议的后续动作

1. **重启 `npm run electron:dev`** —— 本批改了主进程，新 IPC 与安全策略需重启生效。
2. 重点手测三条链路：**复制到公众号**、**AI 配置保存后再打开**（确认 Key 不再丢失）、**AI 流式生成中途关闭面板**（确认已终止）。
3. 若后续要动 `:::` 块解析，请先补一层回归用例，现有实现的多处行为（嵌套、未闭合、代码块内）都没有测试覆盖。
