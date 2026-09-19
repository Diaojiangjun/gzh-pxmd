import { ThemeConfig, BackgroundSettings, StickerItem, GzhComponentItem, ThemeCategory } from '../types';
import { TOKEN_PRESETS } from '../services/themeTokens';

/**
 * 主题原始定义（不带分类）。
 *
 * 分类刻意**不写在每个主题对象里**，而是集中在下方 `THEME_CATEGORY_MAP` ——
 * 主题数量到 28 套后，逐个对象加字段既啰嗦又容易漏，集中成一张表一眼就能看出
 * 「哪个分类下有多少套、有没有重名」。
 */
const RAW_THEMES: ThemeConfig[] = [
  {
    id: 'classic-minimal',
    name: '经典黑灰',
    englishName: 'Minimal Tech & Editorial',
    description: '极简黑灰与微信绿强调色，专为科技资讯、深度阅读与严肃长文打造',
    primaryColor: '#222222',
    secondaryColor: '#555555',
    accentColor: '#07c160',
    backgroundColor: '#ffffff',
    fontFamily: "-apple-system, BlinkMacSystemFont, 'Helvetica Neue', 'PingFang SC', 'Hiragino Sans GB', 'Microsoft YaHei', sans-serif",
    fontSize: '15px',
    lineHeight: 1.75,
    letterSpacing: '0.5px',
    headingStyle: 'left-accent-bar',
    codeTheme: 'mac-dark',
    builtin: true,
    // 段距与标题间距迁移为主题令牌（等价迁移，从此可在设计器里调节）
    tokens: {
      paragraphSpacing: '16px',
      h2MarginTop: '30px',
      h2MarginBottom: '15px',
    },
    customCss: `/* 经典黑灰：视觉参数已交给「主题设计器」，这里只放额外微调 */
#gzh-article-root a {
  text-underline-offset: 2px;
}`,
  },
  {
    id: 'camellia-red',
    name: '山茶花红',
    englishName: 'Camellia Crimson',
    description: '深红与暖陶粉交融，典雅温润，适合情感散文、文化历史与深度报道',
    primaryColor: '#9c2738',
    secondaryColor: '#6d1623',
    accentColor: '#d48872',
    backgroundColor: '#fcf9f7',
    fontFamily: "'Songti SC', 'Source Han Serif SC', 'Noto Serif SC', SimSun, STSong, serif",
    fontSize: '15px',
    lineHeight: 1.9,
    letterSpacing: '0.8px',
    headingStyle: 'double-bracket',
    codeTheme: 'mac-light',
    builtin: true,
    // 段距迁到令牌；正文行高由 theme.lineHeight 统一控制（原先在 customCss 里改 p，已提升为 1.9）
    tokens: {
      paragraphSpacing: '18px',
    },
    customCss: `/* 山茶花红：散文类，引用边线更细更含蓄 */
#gzh-article-root blockquote {
  border-left-width: 3px;
}`,
  },
  {
    id: 'bamboo-green',
    name: '翠竹清墨',
    englishName: 'Bamboo Green & Ink',
    description: '竹青与墨黑相衬，宁静致远，适合健康养生、文博美学与人文自然',
    primaryColor: '#1b5e20',
    secondaryColor: '#2e7d32',
    accentColor: '#689f38',
    backgroundColor: '#f6f9f6',
    fontFamily: "-apple-system, BlinkMacSystemFont, 'Helvetica Neue', 'PingFang SC', 'Hiragino Sans GB', 'Microsoft YaHei', sans-serif",
    fontSize: '15px',
    lineHeight: 1.8,
    letterSpacing: '0.6px',
    headingStyle: 'badge-number',
    codeTheme: 'mac-dark',
    builtin: true,
    // 段距迁到令牌；正文字距是该主题的个性，留在 customCss
    tokens: {
      paragraphSpacing: '17px',
    },
    customCss: `/* 翠竹清墨：中式留白，正文更松、标题更沉 */
#gzh-article-root p {
  letter-spacing: 0.7px;
}
#gzh-article-root h2 {
  letter-spacing: 1.2px;
}`,
  },
  {
    id: 'ocean-blue',
    name: '商务蔚蓝',
    englishName: 'Executive Cerulean',
    description: '稳健深蓝与海天蓝辉映，沉稳专业，适合商业财讯、行业研报与企业公关',
    primaryColor: '#1565c0',
    secondaryColor: '#0d47a1',
    accentColor: '#42a5f5',
    backgroundColor: '#f4f8fc',
    fontFamily: "-apple-system, BlinkMacSystemFont, 'Helvetica Neue', 'PingFang SC', 'Hiragino Sans GB', 'Microsoft YaHei', sans-serif",
    fontSize: '15px',
    lineHeight: 1.75,
    letterSpacing: '0.5px',
    headingStyle: 'capsule-tag',
    codeTheme: 'mac-dark',
    builtin: true,
    tokens: {
      paragraphSpacing: '15px',
    },
    customCss: `/* 商务蔚蓝：研报类，表格与要点更醒目 */
#gzh-article-root th {
  font-weight: 700;
}
#gzh-article-root td {
  padding-top: 9px;
  padding-bottom: 9px;
}`,
  },
  {
    id: 'warm-amber',
    name: '活力暖橙',
    englishName: 'Vibrant Amber & Lifestyle',
    description: '温暖明亮的暖橙与琥珀色，亲和力强，适合美食好物、生活方式与消费指南',
    // 原 #d84315 对暖白底只有 4.21:1，低于 WCAG AA 的 4.5:1（长文阅读吃力），
    // 下调一档到 #bf360c（5.31:1），色相不变、观感几乎无差异
    primaryColor: '#bf360c',
    secondaryColor: '#e65100',
    accentColor: '#ff8f00',
    backgroundColor: '#fdf8f4',
    fontFamily: "-apple-system, BlinkMacSystemFont, 'Helvetica Neue', 'PingFang SC', 'Hiragino Sans GB', 'Microsoft YaHei', sans-serif",
    fontSize: '15px',
    lineHeight: 1.75,
    letterSpacing: '0.5px',
    headingStyle: 'bottom-underline',
    codeTheme: 'mac-light',
    builtin: true,
    // 段距 / 图片圆角 / 引用边线色全部迁到令牌
    tokens: {
      paragraphSpacing: '16px',
      imageRadius: '10px',
      quoteBorderColor: '#f59e0b',
    },
    customCss: `/* 活力暖橙：视觉参数已交给「主题设计器」，这里只放额外微调 */
#gzh-article-root strong {
  font-weight: 700;
}`,
  },
  {
    id: 'cyber-purple',
    name: '赛博极客',
    englishName: 'Cyber Neon & Geek',
    description: '前沿极客紫与高亮脉冲色，适合人工智能、编程技术与前沿软件测评',
    primaryColor: '#5e35b1',
    secondaryColor: '#4527a0',
    accentColor: '#7e57c2',
    backgroundColor: '#f8f7fc',
    fontFamily: "-apple-system, BlinkMacSystemFont, 'Helvetica Neue', 'PingFang SC', 'Hiragino Sans GB', 'Microsoft YaHei', sans-serif",
    fontSize: '15px',
    lineHeight: 1.75,
    letterSpacing: '0.5px',
    headingStyle: 'mac-window',
    codeTheme: 'mac-dark',
    builtin: true,
    customCss: `/* 赛博极客：技术类，代码块与行内代码更清晰 */
#gzh-article-root code {
  letter-spacing: 0;
}
#gzh-article-root pre {
  line-height: 1.7;
}
#gzh-article-root h2 {
  letter-spacing: 1px;
}`,
  },
  {
    id: 'data-blueprint',
    name: '数据蓝图',
    englishName: 'Data Blueprint',
    description: '冷调深蓝与网格秩序感，适合数据报告、行业分析与商业研报',
    primaryColor: '#1a3a5c',
    secondaryColor: '#3d5a80',
    accentColor: '#2b6cb0',
    backgroundColor: '#f7fafc',
    fontFamily: "-apple-system, BlinkMacSystemFont, 'Helvetica Neue', 'PingFang SC', 'Hiragino Sans GB', 'Microsoft YaHei', sans-serif",
    fontSize: '15px',
    lineHeight: 1.78,
    letterSpacing: '0.4px',
    headingStyle: 'left-accent-bar',
    codeTheme: 'mac-light',
    builtin: true,
    tokens: {
      paragraphSpacing: '15px',
    },
    customCss: `/* 数据蓝图：强化表格与数字的可读性 */
#gzh-article-root th {
  font-weight: 700;
}
#gzh-article-root td {
  padding-top: 9px;
  padding-bottom: 9px;
}
/* 引用：作为「结论/要点」块使用 */
#gzh-article-root blockquote {
  border-left-width: 3px;
}`,
  },
  {
    id: 'oriental-letter',
    name: '东方笺谱',
    englishName: 'Oriental Letter',
    description: '米色信笺与朱红印色，衬线字体，适合文史掌故、书评与文化随笔',
    primaryColor: '#3d2b1f',
    secondaryColor: '#6b5b4a',
    accentColor: '#a63a2e',
    backgroundColor: '#fdfaf3',
    fontFamily: "Georgia, 'Songti SC', 'SimSun', 'Noto Serif SC', 'Source Han Serif SC', serif",
    fontSize: '16px',
    lineHeight: 1.9,
    letterSpacing: '0.6px',
    headingStyle: 'double-bracket',
    codeTheme: 'mac-light',
    builtin: true,
    // 段首缩进 / 段距原先写在 customCss 里，现等价迁移为主题令牌 ——
    // 渲染结果不变，但从此可以在「主题设计器 → 段落排版」里直接调节。
    tokens: TOKEN_PRESETS.letterpress.tokens,
    customCss: `/* 东方笺谱：标题字距拉开，其余交由主题令牌控制 */
#gzh-article-root h2 {
  letter-spacing: 1.5px;
}`,
  },
  {
    id: 'academic-paper',
    name: '学术论文',
    englishName: 'Academic Paper',
    description: '高对比黑白配藏青强调线，严谨克制，适合论文摘要、技术综述与方法论',
    primaryColor: '#1c1c1c',
    secondaryColor: '#4a4a4a',
    accentColor: '#00539c',
    backgroundColor: '#ffffff',
    fontFamily: "Georgia, 'Songti SC', 'SimSun', 'Noto Serif SC', 'Source Han Serif SC', serif",
    fontSize: '15px',
    lineHeight: 1.85,
    letterSpacing: '0.3px',
    headingStyle: 'capsule-tag',
    codeTheme: 'mac-light',
    builtin: true,
    // 同「东方笺谱」：缩进与标题间距迁移为令牌（等价迁移，可调）
    tokens: TOKEN_PRESETS.academic.tokens,
    customCss: `/* 学术论文：正文与标题层级已交由主题令牌控制 */
#gzh-article-root h2 {
  letter-spacing: 0.3px;
}`,
  },
  {
    id: 'black-gold',
    name: '黑金奢华',
    englishName: 'Black & Gold',
    description: '深色底与香槟金标题，克制的奢华感，适合品牌叙事、高端访谈与年度复盘',
    primaryColor: '#e8dfc8',
    secondaryColor: '#c9b477',
    accentColor: '#d4af37',
    backgroundColor: '#141414',
    fontFamily: "-apple-system, BlinkMacSystemFont, 'Helvetica Neue', 'PingFang SC', 'Hiragino Sans GB', 'Microsoft YaHei', sans-serif",
    fontSize: '15px',
    lineHeight: 1.85,
    letterSpacing: '0.6px',
    headingStyle: 'bottom-underline',
    codeTheme: 'mac-dark',
    builtin: true,
    // 段距 / 加粗色 / 引用配色迁到令牌
    tokens: {
      paragraphSpacing: '16px',
      strongColor: '#f0e6cf',
      quoteBorderColor: '#d4af37',
      quoteBgColor: 'rgba(212, 175, 55, 0.07)',
    },
    customCss: `/* 黑金奢华：深色底稿靠「字距 + 字重」而不是色彩制造奢华感 */
#gzh-article-root h2 {
  letter-spacing: 2px;
  font-weight: 700;
}`,
  },
  {
    id: 'morandi-forest',
    name: '莫兰迪森林',
    englishName: 'Morandi Forest',
    description: '低饱和灰绿与柔雾白，安静不刺眼，适合生活美学、自然观察与慢读随笔',
    primaryColor: '#4a5450',
    secondaryColor: '#6b7570',
    accentColor: '#7d8f7b',
    backgroundColor: '#f5f6f4',
    fontFamily: "-apple-system, BlinkMacSystemFont, 'Helvetica Neue', 'PingFang SC', 'Hiragino Sans GB', 'Microsoft YaHei', sans-serif",
    fontSize: '15px',
    lineHeight: 1.88,
    letterSpacing: '0.5px',
    headingStyle: 'left-accent-bar',
    codeTheme: 'mac-light',
    builtin: true,
    tokens: {
      paragraphSpacing: '17px',
      h2MarginTop: '32px',
      h2MarginBottom: '15px',
      imageRadius: '10px',
    },
    customCss: `/* 莫兰迪森林：整体降饱和，靠间距而非色彩制造层次 */
#gzh-article-root p {
  color: #55605b;
}
#gzh-article-root h2 {
  font-weight: 600;
}`,
  },
  {
    id: 'sunset-film',
    name: '落日胶片',
    englishName: 'Sunset Film',
    description: '暖棕与琥珀色，带胶片颗粒气质，适合旅行游记、城市漫游与影像随笔',
    primaryColor: '#4a3226',
    secondaryColor: '#7a5c48',
    accentColor: '#d97706',
    backgroundColor: '#fffaf5',
    fontFamily: "-apple-system, BlinkMacSystemFont, 'Helvetica Neue', 'PingFang SC', 'Hiragino Sans GB', 'Microsoft YaHei', sans-serif",
    fontSize: '15px',
    lineHeight: 1.82,
    letterSpacing: '0.5px',
    headingStyle: 'badge-number',
    codeTheme: 'mac-light',
    builtin: true,
    // 段距 / 图片描边 / 引用边线色迁到令牌
    tokens: {
      paragraphSpacing: '16px',
      imageBorder: '1px solid rgba(217, 119, 6, 0.18)',
      quoteBorderColor: '#d97706',
    },
    customCss: `/* 落日胶片：暖色强调 + 图片留白，靠近胶片冲印的观感 */
#gzh-article-root p {
  color: #5a4335;
}
#gzh-article-root h2 {
  letter-spacing: 1px;
}`,
  },

  /* ══════════════ 极简 ══════════════ */
  {
    id: 'charcoal-mono',
    name: '炭白',
    englishName: 'Charcoal Mono',
    description: '纯灰阶、无彩色装饰，唯一的颜色留给链接。适合观点输出、札记与需要「零干扰」的长文',
    primaryColor: '#1a1a1a',
    secondaryColor: '#666666',
    accentColor: '#1a1a1a',
    backgroundColor: '#ffffff',
    fontFamily: "-apple-system, BlinkMacSystemFont, 'Helvetica Neue', 'PingFang SC', 'Hiragino Sans GB', 'Microsoft YaHei', sans-serif",
    fontSize: '15px',
    lineHeight: 1.78,
    letterSpacing: '0.4px',
    headingStyle: 'left-accent-bar',
    codeTheme: 'mac-light',
    builtin: true,
    tokens: {
      hrStyle: 'solid',
      h2MarginTop: '32px',
      blockRadius: '4px',
    },
    customCss: `/* 炭白：靠字重与间距建层次，表格线降到最轻 */
#gzh-article-root td,
#gzh-article-root th {
  border-color: rgba(0,0,0,0.06);
}`,
  },
  {
    id: 'ink-slate',
    name: '墨岩',
    englishName: 'Ink Slate',
    description: '冷灰底配一点深青，克制但有方向感。适合产品思考、行业观察与方法论拆解',
    primaryColor: '#2d3436',
    secondaryColor: '#636e72',
    accentColor: '#0f766e',
    backgroundColor: '#fdfdfc',
    fontFamily: "-apple-system, BlinkMacSystemFont, 'Helvetica Neue', 'PingFang SC', 'Hiragino Sans GB', 'Microsoft YaHei', sans-serif",
    fontSize: '15px',
    lineHeight: 1.8,
    letterSpacing: '0.5px',
    headingStyle: 'bottom-underline',
    codeTheme: 'mac-light',
    builtin: true,
    tokens: {
      blockRadius: '4px',
      imageRadius: '2px',
      hrStyle: 'solid',
      paragraphSpacing: '17px',
    },
    customCss: `/* 墨岩：标题下方留白更足，形成停顿感 */
#gzh-article-root h3 {
  letter-spacing: 0.8px;
}`,
  },

  /* ══════════════ 商务 ══════════════ */
  {
    id: 'wall-street',
    name: '华尔街',
    englishName: 'Wall Street',
    description: '深海军蓝配金融红，表头反白。适合财报解读、投研观点与商业分析',
    primaryColor: '#0b2545',
    secondaryColor: '#4a5d75',
    accentColor: '#b91c1c',
    backgroundColor: '#ffffff',
    fontFamily: "-apple-system, BlinkMacSystemFont, 'Helvetica Neue', 'PingFang SC', 'Hiragino Sans GB', 'Microsoft YaHei', sans-serif",
    fontSize: '15px',
    lineHeight: 1.75,
    letterSpacing: '0.4px',
    headingStyle: 'capsule-tag',
    codeTheme: 'mac-dark',
    builtin: true,
    tokens: {
      tableHeadBgColor: '#0b2545',
      tableHeadColor: '#ffffff',
      strongColor: '#b91c1c',
      blockRadius: '6px',
    },
    customCss: `/* 华尔街：表头反白是关键，数字加粗更醒目 */
#gzh-article-root th {
  font-weight: 700;
  letter-spacing: 0.6px;
}
#gzh-article-root td {
  padding-top: 9px;
  padding-bottom: 9px;
}`,
  },
  {
    id: 'mist-blue',
    name: '晨雾蓝',
    englishName: 'Mist Blue',
    description: '浅蓝灰底、低对比深蓝字，久读不累。适合内部周报、产品说明与团队分享',
    primaryColor: '#1e3a5f',
    secondaryColor: '#5b7c99',
    accentColor: '#3b82f6',
    backgroundColor: '#f8fafc',
    fontFamily: "-apple-system, BlinkMacSystemFont, 'Helvetica Neue', 'PingFang SC', 'Hiragino Sans GB', 'Microsoft YaHei', sans-serif",
    fontSize: '15px',
    lineHeight: 1.76,
    letterSpacing: '0.5px',
    headingStyle: 'left-accent-bar',
    codeTheme: 'mac-light',
    builtin: true,
    tokens: {
      quoteBgColor: '#eff6ff',
      blockRadius: '8px',
      paragraphSpacing: '17px',
    },
    customCss: `/* 晨雾蓝：引用块用淡蓝底替代灰底 */
#gzh-article-root blockquote {
  border-left-width: 3px;
}`,
  },
  {
    id: 'copper-craft',
    name: '鎏铜',
    englishName: 'Copper Craft',
    description: '近黑正文配铜色强调，沉稳有质感。适合品牌故事、设计复盘与手作记录',
    primaryColor: '#1c1917',
    secondaryColor: '#78716c',
    accentColor: '#b45309',
    backgroundColor: '#fffbf5',
    fontFamily: "-apple-system, BlinkMacSystemFont, 'Helvetica Neue', 'PingFang SC', 'Hiragino Sans GB', 'Microsoft YaHei', sans-serif",
    fontSize: '15px',
    lineHeight: 1.8,
    letterSpacing: '0.5px',
    headingStyle: 'bottom-underline',
    codeTheme: 'mac-light',
    builtin: true,
    tokens: {
      h2MarginTop: '30px',
      imageRadius: '8px',
      blockRadius: '10px',
    },
    customCss: `/* 鎏铜：暖底上把表格描边调暖，避免冷灰突兀 */
#gzh-article-root th,
#gzh-article-root td {
  border-color: rgba(180,83,9,0.14);
}`,
  },

  /* ══════════════ 中式 ══════════════ */
  {
    id: 'celadon',
    name: '青瓷',
    englishName: 'Celadon',
    description: '青瓷绿配宣纸白，宋体首行缩进。适合器物笔记、茶事记录与古典美学随笔',
    primaryColor: '#2f4f4f',
    secondaryColor: '#5f7470',
    accentColor: '#7ba05b',
    backgroundColor: '#f7faf7',
    fontFamily: "'Songti SC', 'Source Han Serif SC', 'Noto Serif SC', SimSun, STSong, serif",
    fontSize: '16px',
    lineHeight: 1.9,
    letterSpacing: '0.7px',
    headingStyle: 'double-bracket',
    codeTheme: 'mac-light',
    builtin: true,
    tokens: {
      firstLineIndent: '2em',
      paragraphSpacing: '18px',
      blockRadius: '6px',
    },
    customCss: `/* 青瓷：引用块保留缩进外的呼吸感 */
#gzh-article-root blockquote {
  border-left-width: 3px;
}`,
  },
  {
    id: 'vermilion-seal',
    name: '朱砂印',
    englishName: 'Vermilion Seal',
    description: '墨黑正文 + 朱砂红章节徽章，落款感强。适合历史掌故、典籍札记与人文长文',
    primaryColor: '#1f1a17',
    secondaryColor: '#6b5a4e',
    accentColor: '#c1272d',
    backgroundColor: '#fdfbf7',
    fontFamily: "'Songti SC', 'Source Han Serif SC', 'Noto Serif SC', SimSun, STSong, serif",
    fontSize: '16px',
    lineHeight: 1.88,
    letterSpacing: '0.6px',
    headingStyle: 'badge-number',
    codeTheme: 'mac-light',
    builtin: true,
    tokens: {
      firstLineIndent: '2em',
      quoteBgColor: 'rgba(193,39,45,0.04)',
      paragraphSpacing: '18px',
    },
    customCss: `/* 朱砂印：朱色只出现在徽章与引用线，正文保持墨黑 */
#gzh-article-root blockquote {
  border-left-width: 3px;
}`,
  },
  {
    id: 'song-elegance',
    name: '宋韵',
    englishName: 'Song Elegance',
    description: '素雅灰墨配暗金，无多余装饰。适合书评、文化专栏与需要沉静气质的连续更新',
    primaryColor: '#262626',
    secondaryColor: '#6b6b6b',
    accentColor: '#8c7b64',
    backgroundColor: '#fbfaf7',
    fontFamily: "'Songti SC', 'Source Han Serif SC', 'Noto Serif SC', SimSun, STSong, serif",
    fontSize: '16px',
    lineHeight: 1.92,
    letterSpacing: '0.8px',
    headingStyle: 'bottom-underline',
    codeTheme: 'mac-light',
    builtin: true,
    tokens: {
      firstLineIndent: '2em',
      paragraphSpacing: '18px',
      hrStyle: 'solid',
      blockRadius: '4px',
    },
    customCss: `/* 宋韵：极淡的分隔线，只做停顿不做装饰 */
#gzh-article-root hr {
  border-top-color: rgba(140,123,100,0.35);
}`,
  },

  /* ══════════════ 暗色 ══════════════ */
  {
    id: 'neon-night',
    name: '深夜霓虹',
    englishName: 'Neon Night',
    description: '深底 + 霓虹紫青，视觉冲击强。适合科技评论、AI 观察与年轻化内容',
    primaryColor: '#e2e8f0',
    secondaryColor: '#94a3b8',
    accentColor: '#a855f7',
    backgroundColor: '#0f0f1a',
    fontFamily: "-apple-system, BlinkMacSystemFont, 'Helvetica Neue', 'PingFang SC', 'Hiragino Sans GB', 'Microsoft YaHei', sans-serif",
    fontSize: '15px',
    lineHeight: 1.8,
    letterSpacing: '0.5px',
    headingStyle: 'badge-number',
    codeTheme: 'mac-dark',
    builtin: true,
    tokens: {
      // 深色主题必须把「浅底淡色」整套换成「深底提亮」，否则引用/表格会糊成一片
      quoteBgColor: 'rgba(168,85,247,0.10)',
      quoteBorderColor: '#a855f7',
      quoteTextColor: '#cbd5e1',
      tableBorderColor: 'rgba(255,255,255,0.10)',
      tableHeadBgColor: 'rgba(255,255,255,0.06)',
      tableHeadColor: '#e2e8f0',
      tableCellColor: '#cbd5e1',
      inlineCodeBgColor: 'rgba(168,85,247,0.14)',
      inlineCodeColor: '#d8b4fe',
      strongColor: '#c084fc',
      hrColor: '#a855f7',
      captionColor: '#94a3b8',
      codeBgColor: '#08080f',
      codeBarBgColor: '#030308',
      codeTextColor: '#cbd5e1',
      blockRadius: '8px',
    },
    customCss: `/* 深夜霓虹：深底上标题加一点辉光感（微信不支持阴影，用提亮代替） */
#gzh-article-root h2 {
  letter-spacing: 0.8px;
}`,
  },
  {
    id: 'night-read',
    name: '暗夜护眼',
    englishName: 'Night Read',
    description: '暖棕深底 + 琥珀强调，字号偏大。适合夜间阅读的长文、连载与小说',
    primaryColor: '#d4cfc4',
    secondaryColor: '#9a9488',
    accentColor: '#d97706',
    backgroundColor: '#1c1b19',
    fontFamily: "'Songti SC', 'Source Han Serif SC', 'Noto Serif SC', SimSun, STSong, serif",
    fontSize: '16px',
    lineHeight: 1.9,
    letterSpacing: '0.6px',
    headingStyle: 'left-accent-bar',
    codeTheme: 'mac-dark',
    builtin: true,
    tokens: {
      quoteBgColor: 'rgba(217,119,6,0.10)',
      quoteBorderColor: '#d97706',
      quoteTextColor: '#c4beb2',
      tableBorderColor: 'rgba(255,255,255,0.10)',
      tableHeadBgColor: 'rgba(255,255,255,0.06)',
      tableHeadColor: '#d4cfc4',
      tableCellColor: '#b8b2a6',
      inlineCodeBgColor: 'rgba(217,119,6,0.14)',
      inlineCodeColor: '#fbbf24',
      strongColor: '#fbbf24',
      hrColor: '#d97706',
      captionColor: '#9a9488',
      codeBgColor: '#111110',
      codeBarBgColor: '#0a0a09',
      codeTextColor: '#c4beb2',
      paragraphSpacing: '18px',
      blockRadius: '8px',
    },
    customCss: `/* 暗夜护眼：低蓝光暖色，标题不加粗过重 */
#gzh-article-root h2 {
  font-weight: 600;
}`,
  },

  /* ══════════════ 科技 ══════════════ */
  {
    id: 'terminal-green',
    name: '终端绿',
    englishName: 'Terminal Green',
    description: '黑底绿字等宽字体，命令行气质。适合技术教程、源码解读与极客向随笔',
    primaryColor: '#c8ffd4',
    secondaryColor: '#7dd3a0',
    accentColor: '#22c55e',
    backgroundColor: '#0a1410',
    fontFamily: "'JetBrains Mono', Menlo, Monaco, Consolas, 'Courier New', monospace",
    fontSize: '14.5px',
    lineHeight: 1.75,
    letterSpacing: '0.3px',
    headingStyle: 'mac-window',
    codeTheme: 'mac-dark',
    builtin: true,
    tokens: {
      quoteBgColor: 'rgba(34,197,94,0.10)',
      quoteBorderColor: '#22c55e',
      quoteTextColor: '#a7f3d0',
      tableBorderColor: 'rgba(34,197,94,0.22)',
      tableHeadBgColor: 'rgba(34,197,94,0.10)',
      tableHeadColor: '#c8ffd4',
      tableCellColor: '#a7f3d0',
      inlineCodeBgColor: 'rgba(34,197,94,0.14)',
      inlineCodeColor: '#86efac',
      strongColor: '#4ade80',
      hrColor: '#22c55e',
      captionColor: '#7dd3a0',
      codeBgColor: '#050d0a',
      codeBarBgColor: '#020706',
      codeTextColor: '#a7f3d0',
      blockRadius: '2px',
      imageRadius: '2px',
      codeBlockRadius: '2px',
      hrStyle: 'dashed',
      monoFontFamily: "'JetBrains Mono', Menlo, Monaco, Consolas, 'Courier New', monospace",
    },
    customCss: `/* 终端绿：沿用等宽字体栈，段落不两端对齐（等宽字距下 justifier 会拉开空隙） */
#gzh-article-root p {
  text-align: left;
}`,
  },
  {
    id: 'frost-glass',
    name: '冰霜玻璃',
    englishName: 'Frost Glass',
    description: '极浅冰蓝底配大圆角，有玻璃质感。适合产品发布、设计说明与 SaaS 内容',
    primaryColor: '#0f172a',
    secondaryColor: '#475569',
    accentColor: '#06b6d4',
    backgroundColor: '#f0f9ff',
    fontFamily: "-apple-system, BlinkMacSystemFont, 'Helvetica Neue', 'PingFang SC', 'Hiragino Sans GB', 'Microsoft YaHei', sans-serif",
    fontSize: '15px',
    lineHeight: 1.78,
    letterSpacing: '0.5px',
    headingStyle: 'capsule-tag',
    codeTheme: 'mac-light',
    builtin: true,
    tokens: {
      blockRadius: '16px',
      imageRadius: '12px',
      codeBlockRadius: '12px',
      quoteBgColor: 'rgba(6,182,212,0.06)',
      tableHeadBgColor: 'rgba(6,182,212,0.07)',
      paragraphSpacing: '17px',
    },
    customCss: `/* 冰霜玻璃：大圆角是这套的关键，卡片块保持轻盈描边 */
#gzh-article-root table {
  border-color: rgba(6,182,212,0.20);
}`,
  },

  /* ══════════════ 生活 ══════════════ */
  {
    id: 'sakura-milk',
    name: '樱花奶昔',
    englishName: 'Sakura Milk',
    description: '奶白底 + 樱粉强调，大圆角高亲和。适合美妆、穿搭、探店与日常分享',
    primaryColor: '#4a3f44',
    secondaryColor: '#8b7d85',
    accentColor: '#ec4899',
    backgroundColor: '#fff7fa',
    fontFamily: "-apple-system, BlinkMacSystemFont, 'Helvetica Neue', 'PingFang SC', 'Hiragino Sans GB', 'Microsoft YaHei', sans-serif",
    fontSize: '15px',
    lineHeight: 1.85,
    letterSpacing: '0.6px',
    headingStyle: 'bottom-underline',
    codeTheme: 'mac-light',
    builtin: true,
    tokens: {
      blockRadius: '16px',
      imageRadius: '14px',
      codeBlockRadius: '12px',
      paragraphSpacing: '18px',
      quoteBgColor: 'rgba(236,72,153,0.05)',
      tableHeadBgColor: 'rgba(236,72,153,0.06)',
    },
    customCss: `/* 樱花奶昔：轻量描边，突出圆角与留白 */
#gzh-article-root td,
#gzh-article-root th {
  border-color: rgba(236,72,153,0.14);
}`,
  },
  {
    id: 'breakfast-cream',
    name: '早餐奶油',
    englishName: 'Breakfast Cream',
    description: '奶油黄底配焦糖强调，暖调亲切。适合美食、食谱、生活方式与亲子记录',
    primaryColor: '#3f3222',
    secondaryColor: '#857257',
    accentColor: '#f59e0b',
    backgroundColor: '#fffcf2',
    fontFamily: "-apple-system, BlinkMacSystemFont, 'Helvetica Neue', 'PingFang SC', 'Hiragino Sans GB', 'Microsoft YaHei', sans-serif",
    fontSize: '15px',
    lineHeight: 1.82,
    letterSpacing: '0.5px',
    headingStyle: 'badge-number',
    codeTheme: 'mac-light',
    builtin: true,
    tokens: {
      blockRadius: '14px',
      imageRadius: '12px',
      quoteBgColor: 'rgba(245,158,11,0.07)',
      quoteBorderColor: '#f59e0b',
    },
    customCss: `/* 早餐奶油：暖底统一色温，表格线也调暖 */
#gzh-article-root th,
#gzh-article-root td {
  border-color: rgba(245,158,11,0.16);
}`,
  },

  /* ══════════════ 节日 ══════════════ */
  {
    id: 'new-year-red',
    name: '新年红',
    englishName: 'New Year Red',
    description: '正红与暖白，喜庆但不刺眼。适合春节、节庆活动与品牌祝福推文',
    primaryColor: '#7f1d1d',
    secondaryColor: '#9f1239',
    accentColor: '#dc2626',
    backgroundColor: '#fffbf7',
    fontFamily: "-apple-system, BlinkMacSystemFont, 'Helvetica Neue', 'PingFang SC', 'Hiragino Sans GB', 'Microsoft YaHei', sans-serif",
    fontSize: '15px',
    lineHeight: 1.8,
    letterSpacing: '0.6px',
    headingStyle: 'capsule-tag',
    codeTheme: 'mac-light',
    builtin: true,
    tokens: {
      strongColor: '#dc2626',
      quoteBorderColor: '#dc2626',
      quoteBgColor: 'rgba(220,38,38,0.05)',
      tableHeadBgColor: 'rgba(220,38,38,0.07)',
      blockRadius: '10px',
    },
    customCss: `/* 新年红：红色只落在强调处，正文保持深红避免刺眼 */
#gzh-article-root h2 span {
  letter-spacing: 0.8px;
}`,
  },
  {
    id: 'pine-snow',
    name: '松雪夜',
    englishName: 'Pine Snow',
    description: '墨绿深底配雪白与圣诞红，冬季节日氛围。适合圣诞、年末盘点与冬季企划',
    primaryColor: '#e8f0ec',
    secondaryColor: '#9fb3ab',
    accentColor: '#e11d48',
    backgroundColor: '#10201a',
    fontFamily: "-apple-system, BlinkMacSystemFont, 'Helvetica Neue', 'PingFang SC', 'Hiragino Sans GB', 'Microsoft YaHei', sans-serif",
    fontSize: '15px',
    lineHeight: 1.82,
    letterSpacing: '0.5px',
    headingStyle: 'left-accent-bar',
    codeTheme: 'mac-dark',
    builtin: true,
    tokens: {
      quoteBgColor: 'rgba(225,29,72,0.12)',
      quoteBorderColor: '#e11d48',
      quoteTextColor: '#c3d4cc',
      tableBorderColor: 'rgba(255,255,255,0.12)',
      tableHeadBgColor: 'rgba(255,255,255,0.07)',
      tableHeadColor: '#e8f0ec',
      tableCellColor: '#bfd0c8',
      inlineCodeBgColor: 'rgba(225,29,72,0.16)',
      inlineCodeColor: '#fda4af',
      strongColor: '#fb7185',
      hrColor: '#e11d48',
      captionColor: '#9fb3ab',
      codeBgColor: '#0b1713',
      codeBarBgColor: '#06100c',
      codeTextColor: '#bfd0c8',
      blockRadius: '10px',
    },
    customCss: `/* 松雪夜：深绿底上红色只做点缀，避免整篇节日化过头 */
#gzh-article-root h2 {
  letter-spacing: 0.6px;
}`,
  },
];

/** 主题分类：用于主题库的分组浏览与筛选 */
export const THEME_CATEGORIES: Array<{ id: ThemeCategory; label: string }> = [
  { id: 'minimal', label: '极简' },
  { id: 'business', label: '商务' },
  { id: 'literary', label: '文艺' },
  { id: 'chinese', label: '中式' },
  { id: 'academic', label: '学术' },
  { id: 'tech', label: '科技' },
  { id: 'dark', label: '暗色' },
  { id: 'lifestyle', label: '生活' },
  { id: 'festival', label: '节日' },
];

/**
 * 分类归属表。
 *
 * 与主题定义分离：加主题时只需在这里补一行，不必回到几百行的数组里改对象；
 * 也便于快速核对「每个分类下有几套」。
 */
const THEME_CATEGORY_MAP: Record<string, ThemeCategory> = {
  'classic-minimal': 'minimal',
  'charcoal-mono': 'minimal',
  'ink-slate': 'minimal',

  'ocean-blue': 'business',
  'data-blueprint': 'business',
  'wall-street': 'business',
  'mist-blue': 'business',
  'copper-craft': 'business',

  'camellia-red': 'literary',
  'morandi-forest': 'literary',

  'bamboo-green': 'chinese',
  'oriental-letter': 'chinese',
  'celadon': 'chinese',
  'vermilion-seal': 'chinese',
  'song-elegance': 'chinese',

  'academic-paper': 'academic',

  'cyber-purple': 'tech',
  'terminal-green': 'tech',
  'frost-glass': 'tech',

  'black-gold': 'dark',
  'neon-night': 'dark',
  'night-read': 'dark',

  'warm-amber': 'lifestyle',
  'sunset-film': 'lifestyle',
  'sakura-milk': 'lifestyle',
  'breakfast-cream': 'lifestyle',

  'new-year-red': 'festival',
  'pine-snow': 'festival',
};

/** 内置主题（带分类），全局唯一入口 */
export const DEFAULT_THEMES: ThemeConfig[] = RAW_THEMES.map((t) => ({
  ...t,
  category: THEME_CATEGORY_MAP[t.id] ?? 'minimal',
}));

export const DEFAULT_BACKGROUND: BackgroundSettings = {
  type: 'none',
  color: '#ffffff',
  patternColor: '#e2e8f0',
  opacity: 0.35,
  scale: 24,
  applyToWechat: true,
};

// SVG-based built-in expressive stickers with crisp high-res vector rendering
export const createSvgSticker = (bg: string, emoji: string, text: string) => {
  const svg = `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 120 120" width="120" height="120">
    <rect width="120" height="120" rx="28" fill="${bg}"/>
    <text x="60" y="66" font-size="44" text-anchor="middle" dominant-baseline="middle">${emoji}</text>
    <rect x="20" y="88" width="80" height="22" rx="11" fill="#000000" fill-opacity="0.25"/>
    <text x="60" y="103" font-size="12" font-family="-apple-system, sans-serif" font-weight="bold" fill="#ffffff" text-anchor="middle">${text}</text>
  </svg>`;
  return `data:image/svg+xml;utf8,${encodeURIComponent(svg).replace(/\(/g, '%28').replace(/\)/g, '%29')}`;
};

export const DEFAULT_STICKERS: StickerItem[] = [
  // 搞怪 & 职场
  { id: 'st-1', name: '狗头保命', category: '搞怪', url: createSvgSticker('#fef08a', '🐶', '狗头保命') },
  { id: 'st-2', name: '打工人冲', category: '职场', url: createSvgSticker('#fed7aa', '💼', '搬砖致富') },
  { id: 'st-3', name: '咖啡续命', category: '职场', url: createSvgSticker('#e0e7ff', '☕', '再续一杯') },
  { id: 'st-4', name: '绝绝子', category: '搞怪', url: createSvgSticker('#fbcfe8', '💅', '绝绝子') },
  { id: 'st-5', name: '疯狂点赞', category: '互动', url: createSvgSticker('#bbf7d0', '👍', '强推点赞') },
  { id: 'st-6', name: '求在看', category: '互动', url: createSvgSticker('#dbeafe', '👀', '求个在看') },
  { id: 'st-7', name: '灵光一现', category: '干货', url: createSvgSticker('#fef9c3', '💡', '灵感爆棚') },
  { id: 'st-8', name: '学到了', category: '干货', url: createSvgSticker('#dcfce7', '📝', '疯狂记笔记') },
  { id: 'st-9', name: '火热围观', category: '搞怪', url: createSvgSticker('#fee2e2', '🔥', '吃瓜群众') },
  { id: 'st-10', name: '开心撒花', category: '互动', url: createSvgSticker('#f3e8ff', '🎉', '恭喜发财') },
  { id: 'st-11', name: '乖巧等更', category: '萌宠', url: createSvgSticker('#ffedd5', '🐱', '乖巧求更') },
  { id: 'st-12', name: '问号脸', category: '搞怪', url: createSvgSticker('#f1f5f9', '🤔', '黑人问号') },
  { id: 'st-13', name: '掌声鼓励', category: '互动', url: createSvgSticker('#fae8ff', '👏', '掌声雷动') },
  { id: 'st-14', name: '抱拳感谢', category: '互动', url: createSvgSticker('#ffe4e6', '🙏', '感谢支持') },
  { id: 'st-15', name: '比心心', category: '萌宠', url: createSvgSticker('#ffe4e6', '❤️', '爱你哟') },
  { id: 'st-16', name: '躺平摸鱼', category: '职场', url: createSvgSticker('#e2e8f0', '🐟', '今日摸鱼') },
];

export const BUILTIN_COMPONENTS: GzhComponentItem[] = [
  {
    id: 'hero-card',
    name: '头图信息卡',
    category: 'header',
    description: '开篇大标题与导语背景卡片',
    snippet: `:::hero
[TAG] 深度精选
# 排版美学：让文字拥有呼吸的节奏感
> “好的排版不会抢夺文字的光芒，它就像微风一样自然托起读者的注意力。”
专栏主笔：设计研究所 · 预计阅读 4 分钟
:::
`,
  },
  {
    id: 'toc-box',
    name: '文章导读目录',
    category: 'nav',
    description: '结构化章节导览框',
    snippet: `:::toc
1. 视觉层级：标题与字号的严谨比例
2. 呼吸留白：行距与段间距的黄金法则
3. 配色克制：如何挑选 2 种主视觉色彩
4. 移动端实测：在真实微信阅读场景下的体验
:::
`,
  },
  {
    id: 'heading-badge',
    name: '章节标题 - 徽章标',
    category: 'heading',
    description: '带序号色块的章节标题',
    snippet: `## 01 / 视觉层级的黄金法则
`,
  },
  {
    id: 'quote-box',
    name: '金句引用卡',
    category: 'quote',
    description: '优雅金句与观点引述',
    snippet: `:::quote
“优秀的设计不是多余饰品的堆砌，而是每一个细节都恰到好处地服务于信息的优雅传递。”
—— 现代排版设计通则
:::
`,
  },
  {
    id: 'callout-box',
    name: '要点速记卡',
    category: 'highlight',
    description: '核心干货提炼与行动要点',
    snippet: `:::callout
💡 **微信排版避坑核心原则**
- 手机屏幕建议正文字号统一在 15px 或 16px 之间
- 每屏重点不超过 2 处，避免大面积高亮造成视觉疲劳
- 表情包小图尺寸建议保持在 22px 行内对齐
:::
`,
  },
  {
    id: 'code-mac',
    name: 'Mac终端代码块',
    category: 'code',
    description: '带红黄绿圆点窗口顶栏的代码高亮块',
    snippet: `\`\`\`typescript
// 一键复制为微信公众号专属内联富文本
async function copyToWeChatOfficial(renderedHtml: string) {
  const inlineStyles = applyGzhDesignSkill(renderedHtml);
  await navigator.clipboard.write([
    new ClipboardItem({ 'text/html': new Blob([inlineStyles], { type: 'text/html' }) })
  ]);
  console.log('已成功复制，可直接在公众号后台 Ctrl+V 粘贴！');
}
\`\`\`
`,
  },
  {
    id: 'footer-card',
    name: '文末互动与署名',
    category: 'footer',
    description: '版权声明、点赞在看引导与作者卡片',
    snippet: `:::footer
**— 感谢阅读与陪伴 —**
如果你也觉得这篇文章有启发，不妨点击右下角 **「在看」** 与 **「点赞」**，分享给身边同样热爱创作的朋友们！

*本文基于 gzh-design-skill 设计规范排版生成 · 原创内容未经允许请勿转载*
:::
`,
  },
];

export const INITIAL_MARKDOWN = `:::hero
[TAG] 宝藏排版器 · 特别推荐
# 探索排版美学：用 Markdown 写出杂志质感的公众号爆款
> 排版不仅是文字的容器，更是内容的第一张脸。精心打磨的字距、行高与色彩搭配，能让读者的停留时间成倍提升。
主笔：极客排版室 · 预计阅读 3 分钟
:::

:::toc
1. 为什么我们需要专业的公众号排版工具？
2. 6 套经典设计主题的视觉语言
3. 表情包与动图的黄金穿插法则
4. 移动端手机样机与一键复制体验
:::

## 01 / 排版设计的呼吸感

在碎片化阅读时代，读者平均只有 **3 秒钟** 决定是否继续下滑阅读。因此，排版的核心并不是花哨的边框，而是克制的视觉韵律。

:::quote
“真正的优雅，不是让人驻足惊叹它的繁复，而是让人在无意识中享受每一次文字跳跃的顺畅。”
:::

在微信公众号的生态中，有三个极易被忽视的关键数值：
- **正文字号**：最佳实践为 \`15px\` 或 \`16px\`，既能兼顾大屏阅读，又不会在小屏折行破碎。
- **行高比例**：建议保持在 \`1.75\` 至 \`1.8\` 之间，给视线留出换行的呼吸通道。
- **色彩层级**：全篇正文建议使用深炭黑（如 \`#222222\` 或 \`#333333\`），避免纯黑带来的尖锐视觉刺痛。

---

## 02 / 内置 6 套 gzh-design-skill 主题

本排版工具完整内置了来自开源项目 **gzh-design-skill** 的 6 套视觉规范：

1. **经典黑灰**：现代极简，搭配标志性微信绿，适合深度思考与科技文章。
2. **山茶花红**：人文宋体与优雅深红，适合文化历史、散文诗歌与人物专访。
3. **翠竹清墨**：苍翠竹绿与墨黑，散发中式美学，适合生活美学与健康。
4. **商务蔚蓝**：稳健蓝调与高对比卡片，适合行业研报、财讯与商业分析。
5. **活力暖橙**：热情枫橙与金黄点缀，亲和力强，适合好物测评与美食探店。
6. **赛博极客**：前沿紫与荧光脉冲，搭配 Mac 终端代码块，适合开发者专栏。

:::callout
💡 **排版小贴士**
在顶部工具栏点击 **「主题选择」**，即可实时无损切换整篇文章的排版风格。你还可以在 **「底纹背景」** 中添加宣纸微纹、点阵或方格纸感，复制时完整带入公众号后台！
:::

---

## 03 / 表情包与趣味插图

一篇生动有趣的文章少不了贴切的表情包活跃气氛！比如在讲到加班赶稿时，来一个贴心表情：

![sticker:small:绝绝子](${createSvgSticker('#fbcfe8', '💅', '绝绝子')}) 简直太好用了！点击顶部 **「表情包」** 按钮，可以自由选择 **小图模式**（行内文字紧凑跟随）或者 **原图模式**（居中大卡片展示）：

![sticker:original:打工人冲](${createSvgSticker('#fed7aa', '💼', '搬砖致富')})

---

## 04 / Mac 终端与代码高亮

如果文章中包含代码或配置片段，宝藏排版器会自动为你添加精致的 macOS 终端窗口圆点：

\`\`\`typescript
// 一键复制公众号富文本核心逻辑
export async function copyFormattedArticle() {
  const html = compileWeChatMarkdown(markdownContent, currentTheme);
  await copyToWechatClipboard(html);
  showToast('已复制到剪贴板，请直接在公众号后台 Ctrl+V 粘贴！');
}
\`\`\`

---

:::footer
**— 感谢您的细心阅读 —**
如果您觉得本篇排版工具对您的创作有所助益，请不吝点击右下角 **「在看」** 或 **「点赞」**！
关注我们，每周获取前沿设计技巧与排版灵感。

*本文由「宝藏排版器」排版生成 · 遵循 gzh-design-skill 规范*
:::
`;
