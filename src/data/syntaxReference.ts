/**
 * 语法速查数据
 *
 * 「关于与使用说明」弹窗的内容主体。之所以抽成独立数据文件而不是写在组件里：
 *  1. 语法条目会随功能迭代增加，数据与渲染分离后加一条只需动这里一行；
 *  2. `syntax` 字段是**可直接粘贴使用**的片段，能被「一键复制」按钮复用；
 *  3. 全部用单引号字符串 + \n 书写 —— 里面的示例含反引号（行内代码、代码块），
 *     若用模板字符串会被反引号提前终止。
 */
export interface SyntaxItem {
  /** 可直接粘贴到编辑器里使用的语法片段 */
  syntax: string;
  label: string;
  desc: string;
}

export interface SyntaxGroup {
  id: string;
  title: string;
  hint: string;
  items: SyntaxItem[];
}

export const SYNTAX_GROUPS: SyntaxGroup[] = [
  {
    id: 'basic',
    title: '基础语法',
    hint: '标准 Markdown，写惯了还是原来的手感',
    items: [
      { syntax: '# 一级标题', label: '标题', desc: '支持 # 到 ###### 共六级，字号与装饰由当前主题决定' },
      { syntax: '**加粗文字**', label: '加粗', desc: '取主题的「加粗色」，默认跟随主要颜色' },
      { syntax: '*斜体文字*', label: '斜体', desc: '取主题的「斜体色」，适合术语与书名' },
      { syntax: '~~删除线~~', label: '删除线', desc: '常用于表示修订或已失效的信息' },
      { syntax: '> 引用一句话', label: '引用块', desc: '左侧竖线 + 浅色底，颜色随主题的「引用边线」设置' },
      { syntax: '- 无序列表项\n- 第二项', label: '无序列表', desc: '用 - 或 * 开头，标记颜色可在设计器里单独调' },
      { syntax: '1. 有序列表项\n2. 第二项', label: '有序列表', desc: '编号自动生成，无需手动维护序号' },
      { syntax: '`行内代码`', label: '行内代码', desc: '等宽字体 + 浅色底，适合函数名、参数、命令' },
      {
        syntax: '```javascript\nconsole.log("hello");\n```',
        label: '代码块',
        desc: '写上语言名会显示在顶部的终端圆点栏；圆点栏可在设计器里关掉',
      },
      {
        syntax: '| 表头 | 表头 |\n| :--- | ---: |\n| 左对齐 | 右对齐 |',
        label: '表格',
        desc: '第二行的 :--- / ---: 控制列对齐：左对齐 / 居中 / 右对齐',
      },
      {
        syntax: '![图片说明文字](https://example.com/a.png)',
        label: '图片',
        desc: '方括号里的说明会渲染成图片下方的小字图注',
      },
      { syntax: '[链接文字](https://example.com)', label: '链接', desc: '可开启「链接转脚注」，把外链统一收进文末' },
      { syntax: '---', label: '分隔线', desc: '样式随主题：星标 ✦✦✦ / 实线 / 虚线，在设计器「元素外观」里切换' },
    ],
  },
  {
    id: 'blocks',
    title: '排版块',
    hint: '用 ::: 包起来的模块，是这套工具的核心能力',
    items: [
      {
        syntax: ':::hero\n[TAG] 分类标签\n# 文章主标题\n> 一句话引言，点明文章价值\n作者名 · 2026年\n:::',
        label: '头图卡片',
        desc: '文章开头的整块卡片。[TAG] 行是标签，以 # 开头的是主标题，以 > 开头的是引言，其余行作署名',
      },
      { syntax: ':::toc\n1. 第一部分标题\n2. 第二部分标题\n3. 第三部分标题\n:::', label: '导读目录', desc: '每行一个条目，行首的「1. 」会自动去掉并重新编号' },
      { syntax: ':::quote\n这里放一句值得被记住的话。\n:::', label: '金句卡片', desc: '带大引号的居中卡片，适合放核心观点' },
      { syntax: ':::callout\n**提示**：这里是需要读者特别注意的内容。\n:::', label: '提示框', desc: '虚线框，用来补充说明或提醒注意事项' },
      { syntax: ':::card\n**卡片标题**\n卡片正文描述内容。\n:::', label: '信息卡', desc: '标题 + 正文的卡片式信息块，适合并列展示若干要点' },
      { syntax: ':::timeline\n2020 · 项目启动\n2021 · 产品上线\n2022 · 用户破百万\n:::', label: '时间线', desc: '每行「时间 · 事件」，圆点自动生成；中间的点是中文间隔号「·」' },
      { syntax: ':::steps\n第一步：注册账号\n第二步：完善资料\n第三步：开始使用\n:::', label: '步骤条', desc: '每行一个步骤，会自动编号；行首的「第X步：」或「1. 」都会被自动识别并去掉' },
      { syntax: ':::progress\n70 · 目标完成度\n40 · 学习进度\n:::', label: '进度条', desc: '每行「百分比 · 说明」，只写数字也行、带 % 也行' },
      { syntax: ':::compare\n方案 A | 方案 B\n优点一 | 优点二\n缺点一 | 缺点二\n:::', label: '对比卡', desc: '第一行是两侧表头，之后每行用 | 分左右两栏' },
      { syntax: ':::themes\n经典黑灰 | 现代极简，适合深度思考与科技文章。\n山茶花红 | 人文宋体与优雅深红，适合文化历史。\n:::', label: '主题列表', desc: '每行「名称 | 描述」，名称会渲染成彩色徽章；微信里比加粗列表更不容易错行' },
      { syntax: ':::footer\n感谢阅读到这里～\n如果觉得有帮助，欢迎 **点赞** 和 **在看**\n:::', label: '文末署名', desc: '结尾的引导关注 / 点赞在看区块' },
    ],
  },
  {
    id: 'charts',
    title: '公式与图表',
    hint: '数学公式与流程图会渲染成图片，粘贴到公众号不会变形',
    items: [
      { syntax: '$E = mc^2$', label: '行内公式', desc: '写在文字中间，跟正文一起排版' },
      { syntax: '$$\n\\int_{0}^{1} x^2 dx = \\frac{1}{3}\n$$', label: '块级公式', desc: '独占一行并居中显示，适合推导过程' },
      { syntax: '\\(a^2 + b^2 = c^2\\)', label: '公式（括号写法）', desc: '等价于 $...$，若原文已在用 LaTeX 括号写法可直接沿用' },
      { syntax: '\\[\\sum_{i=1}^{n} i\\]', label: '块级公式（括号写法）', desc: '等价于 $$...$$' },
      {
        syntax: '```mermaid\ngraph LR\n  A[写作] --> B[排版]\n  B --> C[复制到公众号]\n```',
        label: 'Mermaid 图表',
        desc: '支持流程图 / 时序图 / 甘特图等；会按需加载渲染成图片，微信里不会变成一堆代码',
      },
    ],
  },
  {
    id: 'extras',
    title: '特殊元素',
    hint: '表情包、注音、GitHub 风格的提示块',
    items: [
      {
        syntax: '> [!NOTE]\n> 补充说明的内容',
        label: '提示块（GFM 警告块）',
        desc: '共 5 种，写法与 GitHub 一致，渲染时会换成中文标签：NOTE→提示（蓝）、TIP→技巧（绿）、WARNING→警告（黄）、IMPORTANT→重要（紫）、CAUTION→注意（红）',
      },
      { syntax: '![sticker:small:绝绝子](表情地址)', label: '行内表情', desc: '小图模式，像文字一样跟在句子中间' },
      { syntax: '![sticker:original:打工人冲](表情地址)', label: '大图表情', desc: '原图模式，居中大卡片展示' },
      { syntax: '[文字]^(wén zì)', label: '注音（^ 写法）', desc: '渲染为汉字上方的拼音小字；公众号若剥离 ruby 标签会退化为普通文字，不影响阅读' },
      { syntax: '[文字]{wén zì}', label: '注音（花括号写法）', desc: '与上一条等价，两种写法都支持' },
    ],
  },
  {
    id: 'tips',
    title: '使用技巧',
    hint: '几个能少踩坑的约定',
    items: [
      {
        syntax: ':::callout\n**加粗**、`代码`、$公式$ 都能写\n:::',
        label: '块内可以继续写语法',
        desc: '排版块内部同样支持基础语法与公式，不必把内容拆开写',
      },
      { syntax: ':::card\n内容\n:::', label: '每个块都要有结尾 :::', desc: '开头 :::名字、结尾单独一行 :::；漏写结尾会让后面的内容一起被吞进块里' },
      { syntax: ':::crad\n内容\n:::', label: '块名拼错会提示', desc: '支持 11 个块：hero / toc / quote / callout / card / timeline / steps / progress / compare / themes / footer；拼错或未闭合时预览上方会给出提示' },
      { syntax: 'Ctrl + B  /  Ctrl + I  /  Ctrl + K', label: '常用快捷键', desc: '加粗 / 斜体 / 插入链接；另有 Ctrl+E 行内代码、Ctrl+F 查找、Ctrl+H 替换、Ctrl+V 直接粘贴截图、Tab 缩进' },
      {
        syntax: '这是 Markdown 排版工具',
        label: '中英文自动加空格',
        desc: '工具栏的「中英文排版」按钮会一键规范中英文与数字之间的间距、纠正全角半角混排，长文排出来更透气',
      },
    ],
  },
];
