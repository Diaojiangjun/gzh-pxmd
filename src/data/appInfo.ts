/**
 * 「关于本器」的内容数据。
 *
 * 与技术实现分离，便于后续改文案；同时集中一处，避免同样的描述在多处不一致。
 *
 * ⚠️ 这里只写**真实存在**的能力。功能被移除或改数字时，必须同步改这里 ——
 * 夸大的介绍比没有介绍更糟，用户一试就露馅。
 */

export const APP_INFO = {
  name: '宝藏排版器',
  englishName: 'Treasure WeChat Layout Editor',
  version: '1.0.0',
  tagline: '跨平台微信公众号 Markdown 排版利器',
  intro:
    '专为微信公众号写作场景打造的桌面排版工具：用 Markdown 写作，一键产出可直接粘贴到公众号后台的富文本，排版不会在复制过程中走样。',
} as const;

/** 核心特性（每条都是已实现的能力） */
export const APP_FEATURES: Array<{ icon: string; title: string; desc: string }> = [
  {
    icon: 'shield',
    title: '完全离线运行',
    desc: '主题、组件、公式引擎全部内置于本地，不依赖任何在线接口，写作内容不上传',
  },
  {
    icon: 'palette',
    title: '28 套排版主题',
    desc: '极简 / 商务 / 中式 / 学术 / 科技 / 暗色 / 生活 / 节日等 9 大分类，支持搜索与一键套用',
  },
  {
    icon: 'sliders',
    title: '主题设计器',
    desc: '40 多项视觉参数可视化调节：配色、字号、间距、圆角、分隔线…改完即时预览',
  },
  {
    icon: 'blocks',
    title: '11 个排版块',
    desc: '头图 / 目录 / 金句 / 提示 / 时间线 / 步骤 / 进度条 / 对比卡 / 信息卡 / 主题列表 / 署名',
  },
  {
    icon: 'function',
    title: '公式与图表',
    desc: 'LaTeX 公式与 Mermaid 流程图渲染成图片，粘到公众号不会退化成一行代码',
  },
  {
    icon: 'clipboard',
    title: '一键复制到公众号',
    desc: '全量内联样式，在公众号后台 Ctrl+V 直接还原字号、行高、代码框与卡片',
  },
  {
    icon: 'folder',
    title: '文章即文件',
    desc: '本地文件夹模式下一篇一个 .md 文件，可用 Git 管理、团队共享，支持模板与重复文件清理',
  },
  {
    icon: 'history',
    title: '快照与备份',
    desc: '自动历史快照、一键回滚、整库备份导出，误删误改都能找回来',
  },
  {
    icon: 'smartphone',
    title: '多端样机预览',
    desc: '手机样机与桌面样机，贴公众号之前先看真实阅读效果',
  },
  {
    icon: 'sparkles',
    title: '背景 · 表情包 · 图片管理',
    desc: '纹理背景随内容一起复制；截图直接粘贴，表情包与图片支持批量导入与清理',
  },
];

export const APP_STACK: string[] = [
  'Electron',
  'React 19',
  'TypeScript',
  'Vite',
  'Tailwind CSS 4',
  'marked',
  'KaTeX',
  'Mermaid',
];

/**
 * 来源与致谢。
 * 只列真实存在的项目，不虚构合作方。
 */
export const APP_CREDITS: Array<{ name: string; desc: string; url?: string }> = [
  {
    name: 'gzh-design-skill',
    desc: '微信公众号排版设计规范（6 套官方主题与组件结构的原始出处）',
    url: 'https://github.com/isjiamu/gzh-design-skill',
  },
  { name: 'marked', desc: 'Markdown 解析内核' },
  { name: 'KaTeX', desc: '数学公式渲染' },
  { name: 'Mermaid', desc: '流程图 / 时序图 / 甘特图渲染' },
];

/**
 * 需要你自行填写的字段（留空则对应入口自动隐藏，不会显示空按钮）。
 *
 * 这些东西我无法替你决定，所以留成配置项：
 *  - author      ：作者或团队署名，显示在「关于本器」底部
 *  - repoUrl     ：本项目的开源仓库地址
 *  - feedbackUrl ：问题反馈入口（GitHub Issues / 表单 / 邮箱均可）
 *  - donateUrl   ：赞赏或赞助入口
 */
export const APP_OWNER = {
  author: '',
  repoUrl: '',
  feedbackUrl: '',
  donateUrl: '',
};

/* ───────────────────────── 开发者联系方式 ───────────────────────── */

export type ContactType =
  | 'wechat-mp'
  | 'wechat'
  | 'qq-group'
  | 'qq-channel'
  | 'qq'
  | 'email'
  | 'github'
  | 'website'
  | 'bilibili'
  | 'x'
  | 'custom';

export interface ContactItem {
  type: ContactType;
  /** 显示名称，如「鹏星影音」「网盘资源交流群」 */
  label: string;
  /** 账号 / 群号 / 邮箱 / 微信号等；纯名称类（如公众号）可留空 */
  value?: string;
  /** 点击跳转地址，填了就渲染成可点链接（QQ 频道、网站、GitHub 常用） */
  href?: string;
  /** 补充说明，如「每周更新」「备注来意」 */
  note?: string;
  /**
   * 配图，最常用于公众号二维码。
   *
   * 三种写法都支持：`/assets/qr-mp.png`（放进 public/assets，推荐）、
   * `data:image/...`（随代码走，适合小图）、`https://...`（外链）。
   * 卡片里显示缩略图，**点击可放大预览**。
   */
  image?: string;
}

const CONTACTS_OVERRIDE_KEY = 'gzh_editor_contacts_override_v1';

/**
 * 取开发者联系方式。
 *
 * 优先读 localStorage，仅用于**调试与自动化测试**（不必重新打包就能试排版效果）；
 * 没有或格式不对时回退到下面手工维护的 APP_CONTACTS。
 *
 * ⚠️ 与「我的推广位」是两回事，刻意不做任何关联：
 *  - 「我的推广位」= **使用者**自己的公众号，随文章发给读者；
 *  - 这里 = **开发者**的联系方式，随软件给别人看。
 * 两者归属不同的人，共用一套数据只会互相污染。
 */
export function getContacts(): ContactItem[] {
  try {
    const raw = localStorage.getItem(CONTACTS_OVERRIDE_KEY);
    if (raw) {
      const parsed = JSON.parse(raw);
      if (Array.isArray(parsed)) return parsed as ContactItem[];
    }
  } catch {
    // 解析失败就当作没有覆盖
  }
  return APP_CONTACTS;
}

/**
 * 开发者联系方式，显示在「关于本器 → 开发者 / 联系我」。
 *
 * 填写规则：
 *  - 每条至少要有 `label` 或 `value`，两个都空会被自动过滤（不会出现空卡片）；
 *  - `value` 会被做成一键复制 —— 群号、邮箱这类最怕读者手抄错；
 *  - 填了 `href` 则整条变成可点链接；
 *  - 填了 `image`（如公众号二维码）会在卡片里显示缩略图，点击放大预览。
 *
 * 示例（把这段复制出去、去掉注释，改成你自己的信息即可）：
 *   { type: 'wechat-mp',  label: '鹏星影音', note: '扫码关注，每周更新', image: '/assets/qr-mp.png' },
 *   { type: 'qq-group',   label: '网盘资源交流群', value: '654486119', note: '备注「排版」秒通过' },
 *   { type: 'qq-channel', label: 'QQ 频道', value: '你的频道名', href: 'https://q.qq.com/你的频道' },
 *   { type: 'email',      label: '邮箱', value: 'you@yourdomain.com' },
 *   { type: 'github',     label: 'GitHub', value: '@yourname', href: 'https://github.com/yourname' },
 */
export const APP_CONTACTS: ContactItem[] = [
  { type: 'wechat-mp', label: '鹏星影音', note: '扫码关注，每周更新', image: '/assets/px-gzh.png' },
  { type: 'qq-group',   label: '网盘资源交流群', value: '654486119', note: '备注「排版」秒通过', image: '/assets/qq-wp.png' },
  { type: 'qq-channel', label: 'QQ 频道', value: '网盘资源收藏', href: 'https://pd.qq.com/s/gh2bifz9t' },
  { type: 'github',      label: 'GitHub', value: '鹏星' , href: 'https://github.com/Diaojiangjun' },
  { type: 'blog' , label: '博客', value: '雕将军' ,href: 'https://blog.lzphy.top/'},
  { type: 'blog' , label: '导航', value: '雕将军' ,note:'汇总一些好玩的东西' ,href: 'https://lzphy.top/'},
];
