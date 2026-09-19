# 代码审查报告 · 宝藏排版器

**日期**：2026-09-11  
**范围**：`src/`（40 个文件 / 约 14,800 行）+ `electron/` + `scripts/`  
**方法**：4 个区域并行静态审计 → 关键项**逐行人工复验**

> 标注说明：`✅` = 我已亲自读代码复验；`◦` = 来自静态审计，未逐行复验但可信度高。



---

## 一、结论摘要

| 级别     | 数量 | 性质                          |
| ------ | -- | --------------------------- |
| **P0** | 2  | 安全漏洞（可执行脚本）+ 主流程数据丢失（密钥被清空） |
| **P1** | 16 | 安全加固、状态竞态、流式正确性、性能          |
| **P2** | 18 | 可访问性、死代码、依赖、微信兼容残留          |

**架构本身是好的**：主进程持有密钥 + 掩码回传、`contextIsolation` + 白名单 preload、编译层刻意规避微信不支持的 CSS。问题集中在**转义层缺失**和**异步状态机不严谨**两类。

---

## 二、P0 — 必须立即修

### P0-1 ✅ 预览可执行任意脚本（XSS），且能进一步偷走 API Key

**根因**：`marked` 默认放行原始 HTML，而我们的 renderer **没有覆写 `html`**，同时多处把用户文本裸插值进 HTML 属性。

已验证的注入点（`src/services/gzhCompiler.ts`）：

| 行                                                           | 位置                              | 说明                                |
| ----------------------------------------------------------- | ------------------------------- | --------------------------------- |
| `createWechatRenderer`（约 683 起）                             | 无 `renderer.html` 覆写            | `<script>` / `<img onerror>` 直接穿透 |
| `:767` `renderer.codespan`                                  | `` `${text}` `` 未转义             | 行内代码里的 HTML 会执行                   |
| `:839` `renderer.link`                                      | `href="${href}"` 无协议白名单         | `[x](javascript:alert(1))` 可点     |
| `:891` 脚注生成                                                 | `${fn.text}` / `${fn.href}` 裸插值 | 属性突破                              |
| `:365/369/373/377` `:::hero`                                | tag/title/quote/author 裸插值      | —                                 |
| `:397` `:::toc`、`:454` `:::timeline`、`:613/615` `:::themes` | 裸插值                             | —                                 |
| `:789` 代码块 `lang`、`:834-835` 图片 alt/图注                      | 裸插值                             | —                                 |
| `:803/815` 表格单元格 `c.text`                                   | 未走 `parseInline`                | —                                 |
| `:156-168` sticker `alt`                                    | 裸插值                             | —                                 |

**触发链**：用户（或用户导入的第三方 Markdown）在正文写 `<img src=x onerror="...">` → `PreviewPanel` 的 `dangerouslySetInnerHTML` 执行 → 因为渲染层持有 preload 暴露的 IPC，脚本可调用 `ai:setConfig` **把 endpoint 改成攻击者服务器**，主进程随后就会带着真实 Key 去请求该端点。

**修复**：

```ts
// 1) 堵住源头
renderer.html = ({ text }) => escapeHtml(text);
// 2) 所有插值字段走 escapeHtml / parseInline
// 3) link 加协议白名单
const href = /^(https?:|mailto:)/i.test(raw) ? raw.replace(/"/g, '%22') : '#';
// 4) 兜底：对最终 HTML 过一遍 DOMPurify 白名单
```

---

### P0-2 ✅ 「保存配置」会静默清空已保存的 API Key

**证据链**：

- `src/components/AIPanel.tsx:113` — `loadAll()` 把输入框置为 `setCfgApiKey('')`
- `src/components/AIPanel.tsx:227` — 保存时**无条件**提交 `apiKey: cfgApiKey`
- `electron/main.ts:426-432` — `patchSecret('')` → `if (!v) return ''` → 判定为「清空」

**后果**：用户配好 Key 后，只想改个温度或换个模型再点保存 → **Key 被抹掉**，且界面还写着"留空则保留原 Key"，文案与行为完全相反。`patchSecret` 里 `••` 那条分支是**死代码**（渲染层从不上报掩码值）。

**修复**：

```ts
// AIPanel：未改动时不发送该字段
apiKey: cfgApiKey.trim() ? cfgApiKey : undefined,
// 并把 placeholder 改成真实语义
```

---

### P0-3 ✅ 密钥可被重定向到任意端点（放大 P0-1 的影响）

`electron/main.ts:467-471` 接受渲染层传来的任意 `endpoint`，`patchSecret` 又会在收到掩码时保留真 Key。任何渲染层脚本都可先改 endpoint、再触发 `ai:testConnection` / `ai:streamChat`，把 Key 以 `Authorization: Bearer` 发到攻击者服务器——直接违背"Key 不出主进程"的设计前提。

**修复**：Key 与 `type` 预设端点绑定；仅 `custom` 允许自定义 endpoint，且改动 endpoint 时强制要求重新输入 Key。

---

## 三、P1 — 重要

### 数据与状态

| # | 位置                    | 问题                                                                                         | 验证 |
| - | --------------------- | ------------------------------------------------------------------------------------------ | -- |
| 1 | `AIPanel.tsx:185`     | `acceptResult` 读**实时**的 `useSelection`：以「全文」生成后切到「选中文字」再接受，会把全文结果塞进选区；反向操作则**用选区结果整篇覆盖全文** | ✅  |
| 2 | `App.tsx:318-328`     | 自动快照 `setInterval` 依赖 `[markdown, ...]`，每次按键都重建 → 连续写作时 60s 定时器永不触发，3 分钟快照形同虚设             | ✅  |
| 3 | `AIPanel.tsx:120-131` | 关闭面板不 abort，`requestIdRef` 也不重置；重开后旧流的 delta 会被追加进新结果                                      | ◦  |
| 4 | `main.ts:107-114`     | `writeAIConfig` 失败只 `console.error`，handler 仍返回成功视图 → 用户看到"已保存 ✓"但没落盘                      | ✅  |
| 5 | `main.ts:682-688`     | 图床密钥清空条件写反，`val === ''` 也会恢复原值 → **密钥永远删不掉**                                               | ✅  |
| 6 | `AIPanel.tsx:277-281` | 生图 base64 直接插入正文 → 写入 localStorage，几百 KB~数 MB 的图会撑爆 ~5MB 配额                                | ◦  |

### 异步健壮性

| # | 位置                                    | 问题                                                                               | 验证 |
| - | ------------------------------------- | -------------------------------------------------------------------------------- | -- |
| 7 | `AIPanel.tsx:104/169/211/224/248/263` | 6 个 async 处理器**都没有 try/finally**：任一 IPC reject，`setLoading(false)` 永不执行，按钮永久转圈禁用 | ✅  |
| 8 | `main.ts:469/472`                     | `patch.endpoint.trim()` 对非字符串直接抛 TypeError → invoke reject → 叠加 #7 卡死            | ✅  |
| 9 | `AIPanel.tsx:154`                     | 用 `streaming` state 做防重入守卫，同一帧双击可绕过 → 双请求 + 前者 `setStreaming(false)` 误关后者        | ◦  |

### 流式正确性（`electron/ai.ts`）

| #  | 位置             | 问题                                                             | 验证 |
| -- | -------------- | -------------------------------------------------------------- | -- |
| 10 | `:419-446`     | 流结束时**不 flush 残留 `buffer`** → 服务端末尾无换行时丢最后一个 token             | ✅  |
| 11 | `:429-431`     | 只认 `data: `（含空格）；规范允许 `data:{...}` → 整段静默丢弃                    | ✅  |
| 12 | `:415/423`     | `TextDecoder` 末尾未 `decode()` 收尾                                | ◦  |
| 13 | `:367`         | `classifyAIError` 的 UNKNOWN 分支回传服务端原始错误体 → 若响应体回显了 Key 就泄露到界面  | ◦  |
| 14 | `:402/457/497` | 三个 fetch 均无超时 → 连接挂起时 `finally` 永不执行，`aiAbortControllers` 条目泄漏 | ◦  |

### 编译层

| #  | 位置                                                          | 问题                                                                                      | 验证 |
| -- | ----------------------------------------------------------- | --------------------------------------------------------------------------------------- | -- |
| 15 | `gzhCompiler.ts:338/424/433/582/613/615`                    | 块内用**全局 `marked`**（未挂公式扩展）→ `:::card` / `:::callout` / `:::quote` 里的 `$x$` 不会渲染，原样输出    | ✅  |
| 16 | `gzhCompiler.ts` 12 处 `replace(/:::name\s*([\s\S]*?):::/g)` | 非贪婪正则会**错配**：嵌套块提前截断、代码块内演示 `:::` 被当真实块、未闭合块整段不渲染；且与 `validateCustomBlocks` 是两套语义，提示不可信 | ✅  |
| 17 | `gzhCompiler.ts:308/626`                                    | `processStickerAndSvgTags` 对全文跑**两遍**                                                   | ✅  |
| 18 | `diagramRenderer.ts:131`                                    | `split/join` 在含 base64 的大字符串上重复全量扫描 → 多图文档 O(n²)                                        | ◦  |

### 主进程安全加固

| #  | 位置                                         | 问题                                                                               | 验证 |
| -- | ------------------------------------------ | -------------------------------------------------------------------------------- | -- |
| 19 | `index.html` / `main.ts`                   | **无 CSP**，也无 `will-navigate` / `setWindowOpenHandler` 限制                         | ✅  |
| 20 | `main.ts:248-274`                          | PDF 导出的 `${title}` 未转义就拼进 `data:text/html`，离屏窗口只关了 nodeIntegration（未关 JS/未沙箱）    | ◦  |
| 21 | `main.ts:704` + `imageHost.ts:100-105/172` | 上传文件名未 `path.basename` → `../../x.png` 可逃逸 GitHub/S3 目标目录；MIME 无白名单、base64 无长度上限 | ◦  |
| 22 | `main.ts:324-335`                          | `selectImages` 用 `readFileSync` 无大小上限、无 try/catch → 超大图 OOM                      | ◦  |
| 23 | `main.ts:126-130`                          | 长度 9-12 的 Key 会被掩码成 `前4+后4`，反而暴露大半                                               | ◦  |

### 性能

| #  | 位置                    | 问题                                                                         | 验证 |
| -- | --------------------- | -------------------------------------------------------------------------- | -- |
| 24 | `App.tsx:441-458`     | 含 mermaid 时**每个字符**都重跑 `mermaid.render` + canvas 转 PNG                     | ✅  |
| 25 | `PreviewPanel.tsx:63` | `calculateArticleStats` 每次渲染都对全文跑多组正则，未 `useMemo`（`PreflightModal:38` 是对的） | ◦  |

---

## 四、P2 — 次要 / 清理

**体验与无障碍**

- ✅ `App.tsx:408-413` `showToast` 不保存定时器句柄 → 连续两条提示，前者会提前抹掉后者
- ✅ `App.tsx:1090-1104` `closeAllDrawers` 漏了 `setIsAIPanelOpen(false)` → AI 面板叠在其它抽屉上
- ✅ 全仓 `role="dialog"` / `aria-modal` 使用量 **0**；纯图标按钮普遍无 `aria-label`
- ◦ 4 个弹窗（Backup/Preflight/ImageHost/CoverGenerator）既无 Esc 关闭也无点遮罩关闭
- ◦ 9 个组件逐字重复 Esc 关闭样板 → 应抽 `useEscapeKey`
- ◦ `PreviewPanel.tsx:229` / `PreflightModal.tsx:256` 用 `key={index}` 渲染可变列表
- ◦ `App.tsx:362-371` 窗口变窄降级为上下分栏后**不会恢复**
- ◦ `EditorToolbar.tsx:308-311` 表格选择器是不可聚焦的 `<div onClick>`

**工程卫生**

- ✅ 未使用依赖：`@google/genai`、`dotenv`、`express`、`@types/express`（"express" 唯一命中是注释里的 "expressive"）；`vite` 同时出现在 deps 与 devDeps
- ✅ 死代码：`electron/ai.ts:257` `getService` 从未被引用；`gzhCompiler.ts:746` 兜底 `listitem` 不可达；`HistoryModal` 的 `viewMode`；`renderHeading` 的 `fontSizes[1]`
- ✅ 类型重复：`AIServicePreset` 在 `ai.ts` 与 `preload.ts` 各定义一份；`MathJaxGlobal`/`getMathJax` 在 `mathExtension.ts` 与 `diagramRenderer.ts` 各一份
- ◦ 密钥文件未指定 `mode: 0o600`，也未使用 Electron `safeStorage` 加密
- ◦ `scripts/dev-electron.mjs`：Windows 上 `shell:true` + `kill()` 只杀 shell，Electron 进程残留；退出分支 `if (!viteReady)` 逻辑倒置，关窗后 dev 脚本不退出

**微信兼容残留**（会粘贴后变形）

- ◦ `gzhCompiler.ts:380`（hero）、`:168`（sticker 卡片）仍有 `box-shadow`
- ◦ `:412/416` `:::quote` 用负 margin + `position: relative`
- ◦ `:654` `bottom-underline` 标题的 `position: relative` 无必要
- ◦ `:735` 列表符号颜色依赖 `::marker` 继承，微信支持不稳定
- ◦ GFM alert 只按 `\n` 切分，CRLF 下残留 `\r`
- ◦ `:::compare` 用 `split('|')`，单元格含 `|` 即错列

**其它**

- ◦ `pangu.ts:14` 占位符 `___CODE_BLOCK_n___` 可被正文碰撞
- ◦ `diagramRenderer.ts:93` mermaid `securityLevel: 'loose'`
- ◦ `dbService.ts:68-76/109-118` `store.clear()` 无 `onerror`，失败时 Promise 悬挂
- ◦ `electronBridge.ts:37-46` Web 回退读文件无 `onerror` → Promise 永不 settle
- ◦ `HistoryModal.tsx:121-125` `clipboard.writeText` 未 await/catch，却总是显示"已复制"

---

## 五、已排除的误报（避免误改）

- `defaultData.ts:213` 的 `console.log` — 位于**演示代码块的字符串内**，不是遗留调试代码 ✅
- `storageService.ts` 各处 `JSON.parse`、`BackupModal` 导入 — **都已有 try/catch** ✅
- `App.tsx` 的 `onMenuAction`、`AIPanel` 的 `onStream` 退订 — **清理正确** ✅
- `shell.openExternal`（menu.ts:161）用的是硬编码 URL；`shell.openPath` 打开的是固定 `userData` — **无注入** ✅
- 文件保存路径来自系统原生对话框，渲染层无法任意指定 — **安全** ✅
- `chatStream` 跨 chunk 的多字节 UTF-8、`\r\n` 行尾、`data:` 行中途切断 — **处理正确**（仅缺末尾 flush） ✅

---

## 六、建议修复顺序

**第一批（当天，安全 + 数据）**

1. P0-1 XSS：`renderer.html` 覆写 + 全部插值点转义 + link 协议白名单
2. P0-2 密钥被清空
3. P1-7 六个 async 处理器补 `try/finally`
4. P1-2 自动快照改用 ref

**第二批（本周，稳定性）**  
5\. P0-3 endpoint 与 Key 绑定  
6\. P1-1 `acceptResult` 固化来源  
7\. P1-10/11/12 流式 flush + `data:` 兼容  
8\. P1-3 关闭面板即 abort  
9\. P1-4/5 写盘失败上报 + 图床密钥可清空  
10\. P1-19/20/21/22 CSP、PDF 转义、文件名净化、大文件上限

**第三批（排期，质量）**  
11\. P1-15/16 块内公式 + 单套 `:::` 解析器  
12\. P1-24/25 防抖与 memo  
13\. P2 无障碍、依赖清理、死代码、微信兼容残留
