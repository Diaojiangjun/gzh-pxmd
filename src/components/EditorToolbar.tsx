import React, { useState } from 'react';
import {
  Heading1,
  Heading2,
  Heading3,
  Bold,
  Italic,
  Strikethrough,
  Quote,
  List,
  ListOrdered,
  CheckSquare,
  Code,
  FileCode,
  Table,
  Minus,
  Link,
  Image as ImageIcon,
  Smile,
  Sparkles,
  Wand2,
  Hash,
  Blocks,
  Megaphone,
  Info,
  PenLine,
  ListTree,
  Footprints,
  Gauge,
  GitCompare,
  SquareStack,
  Moon,
  Sun,
  Tags,
} from 'lucide-react';

/** 小白可视化面板：常用自定义块，点击即生成 :::xxx 语法，无需记忆 */
const QUICK_BLOCKS = [
  {
    key: 'hero',
    label: '头图卡片',
    desc: '文章开头：标签 + 主标题 + 引言',
    icon: ImageIcon,
    snippet:
      '\n:::hero\n[TAG] 分类标签\n# 文章主标题\n> 一句话引言，点明文章价值\n作者名 · 2026年\n:::\n',
  },
  {
    key: 'toc',
    label: '导读目录',
    desc: '章节导航，读者一眼看懂文章结构',
    icon: ListOrdered,
    snippet: '\n:::toc\n1. 第一部分标题\n2. 第二部分标题\n3. 第三部分标题\n:::\n',
  },
  {
    key: 'quote',
    label: '金句卡片',
    desc: '突出显示一句核心观点',
    icon: Quote,
    snippet: '\n:::quote\n这里放一句值得被记住的话。\n:::\n',
  },
  {
    key: 'callout',
    label: '提示框',
    desc: '虚线框：补充说明或注意事项',
    icon: Info,
    snippet: '\n:::callout\n**提示**：这里是需要读者特别注意的内容。\n:::\n',
  },
  {
    key: 'timeline',
    label: '时间线',
    desc: '按时间顺序展示发展历程',
    icon: ListTree,
    snippet: '\n:::timeline\n2020 · 项目启动\n2021 · 产品上线\n2022 · 用户破百万\n:::\n',
  },
  {
    key: 'steps',
    label: '步骤条',
    desc: '分步骤说明操作流程',
    icon: Footprints,
    snippet: '\n:::steps\n第一步：注册账号\n第二步：完善资料\n第三步：开始使用\n:::\n',
  },
  {
    key: 'progress',
    label: '进度条',
    desc: '展示目标完成度 / 占比',
    icon: Gauge,
    snippet: '\n:::progress\n70 · 目标完成度\n40 · 学习进度\n:::\n',
  },
  {
    key: 'compare',
    label: '对比卡',
    desc: '左右两栏对比优劣',
    icon: GitCompare,
    snippet: '\n:::compare\n方案 A | 方案 B\n优点一 | 优点二\n缺点一 | 缺点二\n:::\n',
  },
  {
    key: 'card',
    label: '信息卡',
    desc: '标题 + 正文的卡片式信息块',
    icon: SquareStack,
    snippet: '\n:::card\n**卡片标题**\n卡片正文描述内容。\n:::\n',
  },
  {
    key: 'themes',
    label: '主题列表',
    desc: '彩色徽章 + 描述，微信兼容（避免加粗列表换行）',
    icon: Tags,
    snippet:
      '\n:::themes\n经典黑灰 | 现代极简，搭配标志性微信绿，适合深度思考与科技文章。\n山茶花红 | 人文宋体与优雅深红，适合文化历史、散文诗歌与人物专访。\n翠竹清墨 | 苍翠竹绿与墨黑，散发中式美学，适合生活美学与健康。\n商务蔚蓝 | 稳健蓝调与高对比卡片，适合行业研报、财讯与商业分析。\n活力暖橙 | 热情枫橙与金黄点缀，亲和力强，适合好物测评与美食探店。\n赛博极客 | 前沿紫与荧光脉冲，搭配 Mac 终端代码块，适合开发者专栏。\n:::\n',
  },
  {
    key: 'footer',
    label: '文末署名',
    desc: '结尾引导关注 / 点赞在看',
    icon: PenLine,
    snippet: '\n:::footer\n感谢阅读到这里～\n如果觉得有帮助，欢迎 **点赞** 和 **在看**\n:::\n',
  },
];

interface EditorToolbarProps {
  onInsertMarkdown: (prefix: string, suffix?: string, placeholder?: string) => void;
  onOpenStickerModal: () => void;
  onOpenComponentDrawer: () => void;
  onPanguFormat?: () => void;
  /** 插入公众号推广位（读本地配置动态生成） */
  onInsertPromo?: () => void;
  showLineNumbers?: boolean;
  onToggleLineNumbers?: () => void;
  onOpenAIPanel?: () => void;
  dark?: boolean;
  onToggleDark?: () => void;
}

export const EditorToolbar: React.FC<EditorToolbarProps> = ({
  onInsertMarkdown,
  onOpenStickerModal,
  onOpenComponentDrawer,
  onPanguFormat,
  onInsertPromo,
  showLineNumbers = true,
  onToggleLineNumbers,
  onOpenAIPanel,
  dark = false,
  onToggleDark,
}) => {
  const [showQuickBlocks, setShowQuickBlocks] = useState(false);
  const [showTablePicker, setShowTablePicker] = useState(false);
  const [hoverCell, setHoverCell] = useState<{ r: number; c: number }>({ r: 2, c: 2 });

  // 深色样式复用
  const iconBtn = `p-1.5 rounded transition-colors ${
    dark ? 'hover:bg-[#334155] hover:text-[#E2E8F0]' : 'hover:bg-white hover:text-[#1E293B]'
  }`;
  const divider = `w-px h-4 mx-1 ${dark ? 'bg-[#334155]' : 'bg-[#E2E8F0]'}`;
  const specialBtn = dark
    ? 'bg-[#0F172A] text-[#CBD5E1] hover:bg-[#1E293B] border-[#334155]'
    : 'bg-white text-[#2C3E50] hover:bg-[#F8FAFC] border-[#E2E8F0]';

  // 生成 N 行 × M 列的空表格（首行表头）
  const buildTableMarkdown = (rows: number, cols: number) => {
    const emptyRow = '|' + Array(cols).fill('  ').join('|') + '|';
    const sepRow = '|' + Array(cols).fill(' --- ').join('|') + '|';
    const bodyRows = Array(rows).fill(emptyRow);
    return '\n' + emptyRow + '\n' + sepRow + '\n' + bodyRows.join('\n') + '\n\n';
  };

  const insertTable = (rows: number, cols: number) => {
    onInsertMarkdown(buildTableMarkdown(rows, cols), '', '');
    setShowTablePicker(false);
  };

  return (
    <div
      className={`min-h-10 border-b px-2 sm:px-3.5 py-1.5 flex flex-wrap items-center justify-between gap-y-2 gap-x-2 select-none shrink-0 ${
        dark ? 'bg-[#1E293B] border-[#334155] text-[#94A3B8]' : 'bg-[#F8FAFC] border-[#F1F5F9] text-[#64748B]'
      }`}
    >
      <div className="flex flex-wrap items-center gap-x-1 gap-y-1 shrink-0">
        {/* Headings */}
        <button
          onClick={() => onInsertMarkdown('# ', '', '主标题')}
          className={`${iconBtn} text-xs font-bold w-7 text-center`}
          title="一级大标题 (H1)"
        >
          H1
        </button>

        <button
          onClick={() => onInsertMarkdown('## ', '', '二级标题')}
          className={`${iconBtn} text-xs font-bold w-7 text-center`}
          title="二级章节标题 (H2)"
        >
          H2
        </button>

        <button
          onClick={() => onInsertMarkdown('### ', '', '三级标题')}
          className={`${iconBtn} text-xs font-bold w-7 text-center`}
          title="三级小标题 (H3)"
        >
          H3
        </button>

        <div className={divider} />

        {/* Text styling */}
        <button
          onClick={() => onInsertMarkdown('**', '**', '加粗文字')}
          className={`${iconBtn} text-xs font-bold font-serif w-7 text-center`}
          title="粗体 (Ctrl+B)"
        >
          B
        </button>

        <button
          onClick={() => onInsertMarkdown('*', '*', '斜体文字')}
          className={`${iconBtn} text-xs font-bold italic w-7 text-center`}
          title="斜体 (Ctrl+I)"
        >
          I
        </button>

        <button
          onClick={() => onInsertMarkdown('~~', '~~', '删除线文字')}
          className={iconBtn}
          title="删除线"
        >
          <Strikethrough className="w-3.5 h-3.5" />
        </button>

        <button
          onClick={() => onInsertMarkdown('`', '`', '行内代码')}
          className={iconBtn}
          title="行内代码"
        >
          <Code className="w-3.5 h-3.5" />
        </button>

        <div className={divider} />

        {/* Quotes & Lists */}
        <button
          onClick={() => onInsertMarkdown('> ', '', '在这里输入引用文字...')}
          className={iconBtn}
          title="段落引用"
        >
          <Quote className="w-3.5 h-3.5" />
        </button>

        <button
          onClick={() => onInsertMarkdown('- ', '', '列表项')}
          className={iconBtn}
          title="无序列表"
        >
          <List className="w-3.5 h-3.5" />
        </button>

        <button
          onClick={() => onInsertMarkdown('1. ', '', '排序列表项')}
          className={iconBtn}
          title="有序列表"
        >
          <ListOrdered className="w-3.5 h-3.5" />
        </button>

        <button
          onClick={() => onInsertMarkdown('- [ ] ', '', '待办事项')}
          className={iconBtn}
          title="任务待办列表"
        >
          <CheckSquare className="w-3.5 h-3.5" />
        </button>

        <div className={divider} />

        {/* Blocks & Media */}
        <button
          onClick={() => onInsertMarkdown('```javascript\n', '\n```', '// 在此输入代码')}
          className={iconBtn}
          title="代码高亮块 (Mac 窗口效果)"
        >
          <FileCode className="w-3.5 h-3.5" />
        </button>

        {/* 表格：Notion 风格网格点选 */}
        <div className="relative">
          <button
            onClick={() => setShowTablePicker((v) => !v)}
            className={iconBtn}
            title="插入表格（点选行列数）"
          >
            <Table className="w-3.5 h-3.5" />
          </button>

          {showTablePicker && (
            <>
              <div className="fixed inset-0 z-40" onClick={() => setShowTablePicker(false)} />
              <div
                className={`absolute left-0 top-full mt-1.5 p-2.5 rounded-lg shadow-lg border z-50 ${
                  dark ? 'bg-[#1E293B] border-[#334155]' : 'bg-white border-[#E5E7EB]'
                }`}
              >
                <div className={`text-center text-[11px] mb-1.5 ${dark ? 'text-[#94A3B8]' : 'text-[#64748B]'}`}>
                  {hoverCell.r + 1} 行 × {hoverCell.c + 1} 列
                </div>
                <div className="grid grid-cols-6 gap-1">
                  {Array.from({ length: 36 }).map((_, i) => {
                    const r = Math.floor(i / 6);
                    const c = i % 6;
                    const active = r <= hoverCell.r && c <= hoverCell.c;
                    return (
                      <div
                        key={i}
                        onMouseEnter={() => setHoverCell({ r, c })}
                        onClick={() => insertTable(hoverCell.r + 1, hoverCell.c + 1)}
                        className={`w-5 h-5 rounded-sm border transition-colors cursor-pointer ${
                          active
                            ? 'bg-[#07C160]/60 border-[#07C160]'
                            : dark
                            ? 'bg-[#0F172A] border-[#334155]'
                            : 'bg-[#F8FAFC] border-[#E2E8F0]'
                        }`}
                      />
                    );
                  })}
                </div>
              </div>
            </>
          )}
        </div>

        <button
          onClick={() => onInsertMarkdown('\n---\n\n', '', '')}
          className={iconBtn}
          title="插入优雅星号分割线"
        >
          <Minus className="w-3.5 h-3.5" />
        </button>

        <button
          onClick={() => onInsertMarkdown('[', '](https://example.com)', '链接文本')}
          className={iconBtn}
          title="插入超链接"
        >
          <Link className="w-3.5 h-3.5" />
        </button>

        <button
          onClick={() => onInsertMarkdown('![图片描述](', ')', 'https://images.unsplash.com/photo-1579783900882-c0d3dad7b119?auto=format&fit=crop&w=800&q=80')}
          className={iconBtn}
          title="插入图片链接"
        >
          <ImageIcon className="w-3.5 h-3.5" />
        </button>
      </div>

      {/* Quick Insert Specials */}
      <div className="flex flex-wrap items-center gap-x-2 gap-y-1.5 shrink-0 ml-auto">
        {/* AI 助手入口 */}
        {onOpenAIPanel && (
          <button
            onClick={onOpenAIPanel}
            className="flex items-center space-x-1 px-2.5 py-1 rounded bg-gradient-to-r from-[#07C160] to-[#059649] text-white hover:from-[#06ad56] hover:to-[#048a40] text-xs font-medium transition-all shadow-sm"
            title="AI 助手：一键排版 / 生成标题 / 润色改写 / 校对"
          >
            <Sparkles className="w-3.5 h-3.5" />
            <span>AI 助手</span>
          </button>
        )}

        {/* Pangu typography format button */}
        {onPanguFormat && (
          <button
            onClick={onPanguFormat}
            className={`flex items-center space-x-1 px-2.5 py-1 rounded border text-xs font-medium transition-colors shadow-2xs ${specialBtn}`}
            title="排版优化：自动规范中英文与数字间距，调整全角半角标点混排"
          >
            <Wand2 className="w-3.5 h-3.5 text-[#2563EB]" />
            <span className="hidden sm:inline">中英文排版</span>
          </button>
        )}

        {/* Expression / Sticker Button */}
        <button
          onClick={onOpenStickerModal}
          className="flex items-center space-x-1 px-2 sm:px-2.5 py-1 rounded bg-[#F0FAF5] text-[#07C160] hover:bg-[#E6F7ED] border border-[#07C160]/20 text-xs font-medium transition-colors"
          title="表情包弹窗：聊天式选择表情，支持小图/原图模式"
        >
          <Smile className="w-3.5 h-3.5" />
          <span className="hidden sm:inline">表情包</span>
        </button>

        {/* Component Drawer Quick Button */}
        <button
          onClick={onOpenComponentDrawer}
          className={`flex items-center space-x-1 px-2 sm:px-2.5 py-1 rounded border text-xs font-medium transition-colors shadow-2xs ${specialBtn}`}
          title="插入排版组件：头图卡片、导读目录、金句卡片、文末署名"
        >
          <Sparkles className="w-3 h-3 text-[#07C160]" />
          <span className="hidden sm:inline">组件库</span>
        </button>

        {/* 行号显示开关 */}
        <button
          onClick={onToggleLineNumbers}
          className={`p-1.5 rounded transition-colors border ${
            showLineNumbers
              ? 'bg-[#F0FAF5] text-[#07C160] border-[#07C160]/20'
              : dark
              ? 'bg-[#0F172A] text-[#94A3B8] border-[#334155] hover:text-[#E2E8F0]'
              : 'bg-white text-[#94A3B8] border-[#E2E8F0] hover:text-[#1E293B]'
          }`}
          title={showLineNumbers ? '隐藏行号（获得更宽编辑区）' : '显示行号'}
        >
          <Hash className="w-3.5 h-3.5" />
        </button>

        {/* 编辑器深色模式切换 */}
        {onToggleDark && (
          <button
            onClick={onToggleDark}
            className={`p-1.5 rounded transition-colors border ${
              dark
                ? 'bg-[#1E293B] border-[#334155] text-amber-300'
                : 'bg-white text-[#64748B] border-[#E2E8F0] hover:text-[#1E293B]'
            }`}
            title={dark ? '切换到浅色编辑器' : '切换到深色编辑器（夜间写作）'}
          >
            {dark ? <Sun className="w-3.5 h-3.5" /> : <Moon className="w-3.5 h-3.5" />}
          </button>
        )}

        {/* 快捷块（小白可视化面板）：不懂语法也能插入常用块 */}
        <div className="relative">
          <button
            onClick={() => setShowQuickBlocks((v) => !v)}
            className={`flex items-center space-x-1 px-2 sm:px-2.5 py-1 rounded border text-xs font-medium transition-colors shadow-2xs ${specialBtn}`}
            title="快捷块：不用记语法，点击即可插入头图 / 目录 / 金句 / 提示 / 署名 / 我的推广位"
          >
            <Blocks className="w-3.5 h-3.5 text-[#7C3AED]" />
            <span className="hidden sm:inline">快捷块</span>
          </button>

          {showQuickBlocks && (
            <>
              <div className="fixed inset-0 z-40" onClick={() => setShowQuickBlocks(false)} />
              <div
                className={`absolute right-0 mt-1.5 w-64 rounded-lg shadow-lg border py-1 z-50 max-h-96 overflow-y-auto ${
                  dark ? 'bg-[#1E293B] border-[#334155]' : 'bg-white border-[#E5E7EB]'
                }`}
              >
                {QUICK_BLOCKS.map((block) => {
                  const Icon = block.icon;
                  return (
                    <button
                      key={block.key}
                      onClick={() => {
                        onInsertMarkdown(block.snippet, '', '');
                        setShowQuickBlocks(false);
                      }}
                      className={`w-full text-left px-3 py-2 flex items-start gap-2.5 transition-colors ${
                        dark ? 'hover:bg-[#0F172A]' : 'hover:bg-[#F8FAFC]'
                      }`}
                    >
                      <Icon className="w-4 h-4 text-[#7C3AED] shrink-0 mt-0.5" />
                      <div className="min-w-0">
                        <div className={`text-xs font-medium ${dark ? 'text-[#E2E8F0]' : 'text-[#2C3E50]'}`}>
                          {block.label}
                        </div>
                        <div className={`text-[11px] leading-snug ${dark ? 'text-[#64748B]' : 'text-[#94A3B8]'}`}>
                          {block.desc}
                        </div>
                      </div>
                    </button>
                  );
                })}

                {/* 推广位是动态生成的（读本地配置），跟静态 snippet 不同，单独一项 */}
                {onInsertPromo && (
                  <>
                    <div className={`h-px my-1 ${dark ? 'bg-[#334155]' : 'bg-[#E5E7EB]'}`} />
                    <button
                      onClick={() => {
                        setShowQuickBlocks(false);
                        onInsertPromo();
                      }}
                      className={`w-full text-left px-3 py-2 flex items-start gap-2.5 transition-colors ${
                        dark ? 'hover:bg-[#0F172A]' : 'hover:bg-[#F8FAFC]'
                      }`}
                    >
                      <Megaphone className="w-4 h-4 text-[#07C160] shrink-0 mt-0.5" />
                      <div className="min-w-0">
                        <div className={`text-xs font-medium ${dark ? 'text-[#E2E8F0]' : 'text-[#2C3E50]'}`}>
                          我的推广位
                        </div>
                        <div className={`text-[11px] leading-snug ${dark ? 'text-[#64748B]' : 'text-[#94A3B8]'}`}>
                          公众号名 + 二维码 + 关注引导，文末一键插入
                        </div>
                      </div>
                    </button>
                  </>
                )}
              </div>
            </>
          )}
        </div>
      </div>
    </div>
  );
};
