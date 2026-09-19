# WeChat Official Account Design Skill (gzh-design-skill)
> 微信公众号文章专业排版设计规范与离线模板引擎

## 1. 概述 (Overview)
本 Skill 为微信公众号文章提供专门优化的排版设计系统。微信公众号编辑器采用私有富文本过滤机制，所有样式必须转为行内样式 (`inline style`)，且不支持诸多现代 CSS 特性（如外部 stylesheet、CSS 变量、部分 flexbox 复合属性以及负 margin）。本 Skill 沉淀了 6 套官方排版主题、多套常用组件结构及安全渲染规范。

---

## 2. 内置 6 套官方主题设计规范 (Six Registered Themes)

### Theme 1: 经典黑灰 (Minimal Tech & Editorial)
- **定位**：极简科技、深度报道、学术研究、严谨读物
- **主色**：`#222222` (深石墨黑)
- **辅色**：`#555555` (中灰)
- **强调色**：`#07c160` (微信标准绿)
- **背景底色**：`#fafafa`
- **字体规范**：无衬线系统黑体，15px 正文，行高 1.75，字间距 0.5px

### Theme 2: 山茶花红 (Camellia Crimson)
- **定位**：文化文艺、情感美文、历史人文、深度访谈
- **主色**：`#9c2738` (山茶花深红)
- **辅色**：`#6d1623` (绛紫红)
- **强调色**：`#d48872` (暖陶粉)
- **背景底色**：`#fcf9f7` (微暖宣纸感)
- **字体规范**：人文宋体与黑体结合，15px 正文，行高 1.8，段前段后 16px

### Theme 3: 翠竹清墨 (Bamboo Green & Chinese Ink)
- **定位**：传统东方、健康养生、自然地理、禅意美学
- **主色**：`#1b5e20` (翠竹深绿)
- **辅色**：`#2e7d32` (松柏绿)
- **强调色**：`#689f38` (青苔绿)
- **背景底色**：`#f6f9f6` (淡竹纸青)
- **字体规范**：沉稳典雅，行距 1.8，标题配备典雅双线与水墨竹节装饰

### Theme 4: 商务蔚蓝 (Executive Cerulean)
- **定位**：商业财讯、智库研究、行业分析报告、企业公关
- **主色**：`#1565c0` (商务深蓝)
- **辅色**：`#0d47a1` (深邃藏蓝)
- **强调色**：`#42a5f5` (高亮海蓝)
- **背景底色**：`#f4f8fc` (冰霜淡蓝)
- **字体规范**：现代利落，标题带精致编号胶囊或左侧加粗色块

### Theme 5: 活力暖橙 (Vibrant Amber / Lifestyle)
- **定位**：生活方式、数码好物测评、美食探店、年轻消费
- **主色**：`#d84315` (夕阳枫橙)
- **辅色**：`#e65100` (浓郁亮橙)
- **强调色**：`#ff8f00` (琥珀金黄)
- **背景底色**：`#fdf8f4` (暖日光底)
- **字体规范**：热情亲切，卡片带有温润边框和微弱暖色阴影

### Theme 6: 赛博极客 (Cyber Neon / Developer)
- **定位**：AI与前沿软件、开源生态、开发者专栏、极客硬件
- **主色**：`#5e35b1` (极客智紫)
- **辅色**：`#4527a0` (午夜深紫)
- **强调色**：`#7e57c2` (脉冲紫罗兰)
- **背景底色**：`#f8f7fc` (云白微紫)
- **字体规范**：代码块配备 macOS 风格红黄绿圆点装饰窗口，等宽字体等高对齐

---

## 3. 微信公众号排版避坑规范 (WeChat Layout Constraints)

1. **绝对行内样式 (Inline Style Only)**：
   微信编辑器过滤 `<style>` 标签及 `<link>` 标签，所有属性必须逐一内联在 `style=""` 中。

2. **跨平台字体兼容堆栈 (Font Stack)**：
   推荐优先使用：
   `-apple-system, BlinkMacSystemFont, "Helvetica Neue", "PingFang SC", "Hiragino Sans GB", "Microsoft YaHei UI", "Microsoft YaHei", Arial, sans-serif`

3. **防止代码块与表格横向溢出**：
   - 表格必须包裹在 `overflow-x: auto; -webkit-overflow-scrolling: touch;` 的容器中。
   - 代码块需支持换行 `white-space: pre-wrap; word-break: break-all;`，避免手机端排版被撑爆。

4. **背景图与纹理安全传递**：
   微信编辑器允许携带带背景色与安全 SVG 数据 URI 纹理的外层 `<section>`。复制时外层包裹统一内边距（如 16px-20px）。

5. **表情包与小插图的排版规则**：
   - **小图模式**：尺寸固定为 `width: 22px; height: 22px; vertical-align: -4px; margin: 0 2px; display: inline-block;`
   - **原图模式**：居中展示，最大宽度 `max-width: 260px; margin: 12px auto; display: block; border-radius: 8px;`
