# 公众号排版助手（Obsidian 插件）

在 Obsidian 里用 **28 套主题**排版笔记，一键复制到微信公众号。与桌面版 `gzh-gemimi` **共用同一套排版引擎**，输出逐字节一致。

---

## 一、可行性的关键：编译器本来就是纯前端

`gzh-gemimi` 一开始就是 Electron 应用，但排版链路**从来没有和 Electron 绑定**：

| 模块 | 行数 | 外部依赖 |
| :--- | --- | --- |
| `gzhCompiler.ts` | 1085 | 仅 `marked` |
| `mathExtension.ts` | 367 | 仅 marked 的类型 |
| `themeTokens.ts` | 251 | 无 |
| `customCss.ts` | 306 | 无 |
| `diagramRenderer.ts` | 176 | 动态 import / DOM script |
| `escape.ts` + `sanitizeHtml.ts` | 131 | 无 |
| `defaultData.ts`（28 套主题） | 1130 | 无 |

合计 **3446 行、约 137KB**，零 Electron API、零 Node API。`window.electronAPI` 只出现在 AI 助手和存储层，与排版完全隔离。

图片处理（`processStickerAndSvgTags` / `sanitizeSvgUrl`）也是纯字符串操作，data URI 与外链都走标准 Markdown 图片语法 —— 所以换宿主环境不需要改。

剪贴板那层原本就写了浏览器降级路径（`navigator.clipboard` → `execCommand`），Obsidian 本身也是 Electron，窗口聚焦时可直接用。

---

## 二、目录结构

```
obsidian-gzh-formatter/
├── manifest.json          插件清单
├── package.json           依赖（只多一个 obsidian 类型包）
├── esbuild.config.mjs     打包配置
├── tsconfig.json
├── styles.css             侧栏预览样式
├── main.js                产物（130KB，由 esbuild 生成）
└── src/
    ├── main.ts            插件入口：命令、设置、剪贴板
    ├── view.ts            侧栏排版预览
    ├── imageAdapter.ts    Obsidian 图片语法适配
    ├── settings.ts        设置项定义
    └── core/              ← 从主项目同步而来，勿手改
        ├── gzhCompiler.ts
        ├── themeTokens.ts
        ├── mathExtension.ts
        ├── diagramRenderer.ts
        ├── customCss.ts
        ├── escape.ts
        ├── sanitizeHtml.ts
        ├── defaultData.ts
        └── types.ts
```

---

## 三、为什么要用同步脚本而不是拷贝

`core/` 下 9 个文件由 `scripts/sync-core.mjs` 从主项目生成：

```bash
node scripts/sync-core.mjs
```

**如果手抄 3400 行会怎样**：主项目修一个 bug，插件这边还是旧行为 —— 而且不会有任何报错，用户只会觉得"排版怎么变了"。同步脚本在每个文件顶部写了来源标注。

脚本做了两件容易出错的事：

1. **重写相对导入** —— 主项目里 core 之间用 `../types` / `../services/x` 互引，平铺进 `core/` 后必须统一改成 `./x`，否则 esbuild 解析不到。
2. **只抽取用到的类型** —— `src/types/index.ts` 有 200 多行，但排版只用到 8 个类型。整份搬进来会带上一堆无关定义。

---

## 四、一致性校验（重要）

```bash
node scripts/verify-core-parity.mjs
```

跑同一批输入过主项目和插件两套实现，**逐字节比对输出**：

```
主题数：28，语料数：25
通过 726 / 失败 0
两套实现输出逐字节一致 ✓
```

覆盖：28 个主题 × 25 类语料（排版块全 9 种、公式两种写法、Mermaid、注音、表情包、GFM 警告块、表格、脚注…）+ 主题库本身 + 语法体检函数。

**这是防漂移的关键防线** —— 以后改了主项目的编译器却忘了同步，跑一次就知道。

---

## 五、安装

### 开发模式

```bash
cd obsidian-gzh-formatter
npm install
npm run build
```

然后把整个目录软链到 vault 的插件目录：

```
<你的 vault>/.obsidian/plugins/gzh-formatter
```

Obsidian → 设置 → 第三方插件 → 关闭「安全模式」→ 刷新 → 启用「公众号排版助手」。

### 发布

```bash
npm run build
# 提交 main.js、manifest.json、styles.css 三个文件即可
```

---

## 六、用法

| 命令 | 说明 |
| :--- | :--- |
| 复制排版结果到公众号 | 读当前笔记 → 排版 → 写剪贴板 |
| 仅复制选中内容到公众号 | 只排版选中的部分 |

侧栏图标打开**排版预览**，切换笔记或改内容时自动刷新（400ms 防抖）。预览宽度按公众号的 **375px** 阅读栏设定，所见即所得。

命令面板（`Ctrl+P`）里搜「公众号排版」即可。

---

## 七、图片处理

Obsidian 里的图片有三种写法，直接丢给编译器会导致公众号里**图片全裂**：

| 写法 | 场景 | 处理 |
| :--- | :--- | :--- |
| `![[image.png]]` | wikilink（Obsidian 默认） | ✓ 解析 |
| `![[image.png\|300]]` | 带尺寸 | ✓ 解析，尺寸保留 |
| `![](attachments/a.png)` | 标准 Markdown | ✓ 解析 |

路径解析按顺序尝试：vault 根相对 → 相对当前笔记目录 → 全库按文件名搜（多个同名时取最近修改的）。

### 两种输出模式

**内嵌 base64（默认）** — 图片转成 data URI 直接带上。公众号里一定能显示，不依赖图床可用性。代价是 HTML 变大，所以有体积上限（默认 400KB，可在设置里调）。

**上传图床** — 先上传换外链，体积小。需要你在设置里填接口地址。

```
POST <你填的地址>
Content-Type: application/json
{ "filename": "a.png", "mime": "png", "base64": "..." }

期望返回 { "url": "https://..." }
```

**插件不内置任何图床密钥** —— 内置就等于密钥进仓库。留空时自动退回内嵌模式，图片不会丢。

### 为什么不做自动跳过

找不到的文件、超过上限的图片都会**在预览面板明确列出**（`⚠ 找不到 2 张：…`），而不是静默丢弃 —— 静默丢图会让用户以为插件坏了。

---

## 八、与 Obsidian 的三处差异

**1. MathJax 冲突**

主项目从 `public/mathjax/tex-svg.js` 加载 MathJax（相对 `document.baseURI`）。Obsidian 自带 KaTeX，两者在同一页面会抢全局命名空间。

插件里 `:::hero` 等块内的公式暂走纯文本路径；如需完整公式渲染，需把 MathJax 改为按需动态加载并加命名空间隔离。**这是目前唯一未完全对齐的能力**。

**2. 主题配置独立**

插件自带 28 套主题（从主项目同步），配置存 vault 的 `.obsidian/plugins/gzh-formatter/data.json`。改主题与主项目**互不影响**。

**3. 排版块语法需要用户知晓**

`:::hero` / `:::callout` / `:::timeline` 这些是本工具的扩展语法，Obsidian 自己不认识。复制前会做语法体检，有错会提示具体行号，不会让你复制出一篇乱的。

---

## 九、验证

| 项 | 结果 |
| :--- | :--- |
| `tsc --noEmit` | 0 错误 |
| esbuild 生产打包 | 成功，`main.js` 130KB |
| 编译器一致性（28 主题 × 25 语料） | **726/726 逐字节一致** |
| 主项目测试 | 310/310（无回归） |

---

## 十、后续可做

- MathJax 在 Obsidian 内的完整公式渲染（见第八节）
- 语法速查笔记自动写入 vault
- 主题预览缩略图（设置面板里直接看效果）
- 自定义排版块（让用户自己加 `:::xxx`）
