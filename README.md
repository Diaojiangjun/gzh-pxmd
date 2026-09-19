# 宝藏排版器 (Treasure WeChat Layout Editor)
> 🚀 跨平台微信公众号 Markdown 排版利器 · 基于 `gzh-design-skill` 设计规范构建

![Platform](https://img.shields.io/badge/Platform-Windows%20%7C%20macOS%20%7C%20Linux-blue)
![Framework](https://img.shields.io/badge/Framework-Electron%20%2B%20React%20%2B%20Vite-brightgreen)
![Skill](https://img.shields.io/badge/Skill-gzh--design--skill-orange)

## 📌 项目定位与特性

基于开源排版规范库 [gzh-design-skill](https://github.com/isjiamu/gzh-design-skill) 进行本地化与工程化改造的桌面级跨平台公众号排版工具。

- ⚡ **离线运行**：所有 6 套排版规范与样式资源整理为离线模板位于 `resources/skill`，不依赖任何第三方在线接口，安全无广告。
- 📝 **Markdown 深度优化**：支持微信专属标题胶囊、双线标、徽章标、Mac终端代码块、引用卡片、要点提炼盒等组件语法。
- 🎨 **多主题排版**：内置经典黑灰、山茶花红、翠竹清墨、商务蔚蓝、活力暖橙、赛博极客 6 套公众号标准视觉主题，支持自定义字号、行高、间距和强调色。
- 🖼️ **文章背景持久化**：支持纯净白、透明网格、纸感纹理、点阵等背景，复制到微信公众号编辑器时完整保留背景样式。
- 📱 **多端样机预览**：支持默认全屏模式、移动端手机样机（iPhone 外观与公众号顶部栏）和电脑端阅读样机。
- 💬 **表情包素材管理**：聊天软件式表情包弹窗，支持“小图”（行内表情）与“原图”（居中插图）两种模式，支持 GIF 动态预览和本地文件夹批量导入。
- 📎 **剪贴板与图片管理**：支持截图 Ctrl+V 直接粘贴、本地图片批量导入及无用图片一键清理。
- 📋 **公众号一键富文本复制**：点击“复制到公众号”后，采用全量内联 CSS 与微信专属规避策略，直接 `Ctrl+V` 粘贴到公众号后台即可。

---

## 🛠️ 快速启动与开发 (Quick Start)

### 1. 网页预览模式
```bash
# 启动 Vite 开发服务器 (Port 3000)
npm run dev
```

### 2. Electron 桌面端调试运行
```bash
# 编译并启动 Electron 桌面应用
npm run electron:dev
```

### 3. 多平台打包 (Windows / macOS / Linux)
```bash
# 构建前端静态资源与 Electron 主进程
npm run electron:build

# 打包 Windows 安装包 (NSIS .exe / 便携版)
npm run pack:win

# 打包 macOS 镜像 (.dmg / .zip)
npm run pack:mac

# 打包 Linux 包 (.AppImage / .deb)
npm run pack:linux
```

---

## 📂 项目结构说明

```
├── electron/                 # Electron 主进程与预加载脚本
│   ├── main.ts               # 主窗口、原生菜单、文件 IPC 通信、剪贴板管理
│   ├── preload.ts            # 暴露安全 electronAPI contextBridge
│   └── menu.ts               # 跨平台原生应用菜单
├── resources/skill/          # gzh-design-skill 离线资源与规范
│   ├── SKILL.md              # 排版规则与微信 CSS 避坑规范
│   ├── themes.json           # 6 套官方主题配置
│   └── components.json       # 常用排版组件与代码片段
├── src/                      # 渲染进程 (React + Tailwind + Vite)
│   ├── components/           # 模块化 UI 组件
│   │   ├── TopNavBar.tsx     # 顶部工具栏与系统窗口控制
│   │   ├── EditorToolbar.tsx # 快速格式化与组件插入工具栏
│   │   ├── MarkdownEditor.tsx# Markdown 编写区与粘贴监听
│   │   ├── PreviewPanel.tsx  # 公众号实时渲染与样机外壳
│   │   ├── StickerModal.tsx  # 表情包素材库与小图/原图弹窗
│   │   ├── BackgroundModal.tsx # 文章底纹与背景设置
│   │   ├── ImageManagerModal.tsx # 图片附件与清理管理
│   │   ├── ComponentDrawer.tsx # 结构化排版组件库抽屉
│   │   ├── ThemeDrawer.tsx   # 6 套主题切换与微调面板
│   │   └── PresetModal.tsx   # 用户样式预设管理器
│   ├── services/             # 核心服务与编译器
│   │   ├── gzhCompiler.ts    # Markdown 转微信内联样式富文本引擎
│   │   ├── clipboardService.ts # 微信剪贴板富文本复制服务
│   │   ├── electronBridge.ts # 跨平台统一 API 桥接层 (桌面/Web自适应)
│   │   └── storageService.ts # 本地草稿与自定义素材持久化
│   └── types/                # 全局 TypeScript 规范定义
├── electron-builder.json     # 多平台安装包编译配置
└── package.json
```
