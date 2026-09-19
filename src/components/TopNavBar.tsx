import React, { useState } from 'react';
import {
  FileText,
  FolderOpen,
  Save,
  Palette,
  LayoutGrid,
  Image as ImageIcon,
  Smile,
  Sparkles,
  Download,
  Copy,
  Check,
  HelpCircle,
  Bookmark,
  Layers,
  FileEdit,
  History,
  BookOpen,
  Plus,
  ImagePlus,
  ShieldCheck,
  Database,
  MoreHorizontal,
  Columns2,
  Rows2,
  Eye,
} from 'lucide-react';
import { ThemeConfig, LayoutMode } from '../types';

interface TopNavBarProps {
  title: string;
  onTitleChange: (title: string) => void;
  activeTheme: ThemeConfig;
  articleCount?: number;
  onOpenArticles: () => void;
  onOpenHistory: () => void;
  onNew: () => void;
  onOpen: () => void;
  onSave: () => void;
  onOpenThemes: () => void;
  onOpenComponents: () => void;
  onOpenBackground: () => void;
  onOpenStickers: () => void;
  onOpenImages: () => void;
  onOpenPresets: () => void;
  onOpenAbout: () => void;
  onOpenPreflight: () => void;
  onOpenCoverGenerator: () => void;
  onOpenBackup: () => void;
  onCopyWeChat: () => void;
  onExportHtml: () => void;
  copied: boolean;
  layoutMode: LayoutMode;
  onLayoutChange: (mode: LayoutMode) => void;
}

export const TopNavBar: React.FC<TopNavBarProps> = ({
  title,
  onTitleChange,
  activeTheme,
  articleCount = 1,
  onOpenArticles,
  onOpenHistory,
  onNew,
  onOpen,
  onSave,
  onOpenThemes,
  onOpenComponents,
  onOpenBackground,
  onOpenStickers,
  onOpenImages,
  onOpenPresets,
  onOpenAbout,
  onOpenPreflight,
  onOpenCoverGenerator,
  onOpenBackup,
  onCopyWeChat,
  onExportHtml,
  copied,
  layoutMode,
  onLayoutChange,
}) => {
  const [showExportMenu, setShowExportMenu] = useState(false);
  const [showFileMenu, setShowFileMenu] = useState(false);
  const [showMoreMenu, setShowMoreMenu] = useState(false);

  return (
    <header className="flex flex-wrap items-center justify-between px-4 py-2 bg-[#FFFFFF] border-b border-[#E5E7EB] shrink-0 min-h-14 select-none z-30 relative font-sans gap-y-2">
      {/* Left: Window Dots + App Brand + Version + Nav */}
      <div className="flex items-center gap-4">
        {/* macOS Window Control Dots */}
        <div className="flex gap-1.5 items-center pl-0.5">
          <div className="w-3 h-3 rounded-full bg-[#FF5F56] border border-[#E0443E]/40" />
          <div className="w-3 h-3 rounded-full bg-[#FFBD2E] border border-[#DEA123]/40" />
          <div className="w-3 h-3 rounded-full bg-[#27C93F] border border-[#1AAB29]/40" />
        </div>

        {/* Brand Name & Version Tag */}
        <div className="flex items-center gap-2">
          <span className="font-semibold text-sm tracking-tight text-[#2C3E50]">
            宝藏排版器 Pro
          </span>
          <span className="px-2 py-0.5 bg-[#F3F4F6] text-[#6B7280] text-[10px] rounded uppercase font-bold tracking-widest hidden sm:inline-block">
            v1.0.0
          </span>
        </div>

        {/* Divider */}
        <div className="h-4 w-px bg-[#E5E7EB]" />

        {/* Quick Article Manager trigger button */}
        <button
          onClick={onOpenArticles}
          className="flex items-center gap-1.5 px-2.5 py-1 rounded-lg bg-[#F8FAFC] hover:bg-[#F1F5F9] border border-[#E2E8F0] text-xs font-medium text-[#2C3E50] transition-colors"
          title="打开本地文章库 (管理与切换文章)"
        >
          <BookOpen className="w-3.5 h-3.5 text-[#07C160]" />
          <span>文章库</span>
          <span className="px-1.5 py-0.2 bg-[#07C160]/10 text-[#07C160] text-[10px] font-bold rounded-full">
            {articleCount}
          </span>
        </button>

        {/* Inline Editable Document Title */}
        <div className="flex items-center gap-1.5 text-xs text-[#64748B]">
          <FileEdit className="w-3.5 h-3.5 text-[#94A3B8]" />
          <input
            type="text"
            value={title}
            onChange={(e) => onTitleChange(e.target.value)}
            className="text-xs font-medium text-[#2C3E50] hover:bg-[#F8FAFC] focus:bg-white focus:ring-1 focus:ring-[#07C160] rounded px-2 py-1 w-32 sm:w-48 truncate outline-none border border-transparent focus:border-[#07C160] transition-colors"
            placeholder="输入文章标题..."
            title="点击修改当前文章标题"
          />
        </div>

        {/* Top Navigation Links */}
        <nav className="hidden 2xl:flex items-center gap-4 text-xs font-medium text-[#64748B] ml-2">
          <button
            onClick={onOpenThemes}
            className="hover:text-[#07C160] flex items-center gap-1 transition-colors"
          >
            <span
              className="w-2 h-2 rounded-full shrink-0"
              style={{ backgroundColor: activeTheme.primaryColor }}
            />
            <span>主题: {activeTheme.name}</span>
          </button>
          <button
            onClick={onOpenComponents}
            className="hover:text-[#07C160] transition-colors"
          >
            组件库
          </button>
          <button
            onClick={onOpenBackground}
            className="hover:text-[#07C160] transition-colors"
          >
            底纹背景
          </button>
          <button
            onClick={onOpenStickers}
            className="hover:text-[#07C160] transition-colors"
          >
            表情素材
          </button>
          <button
            onClick={onOpenPresets}
            className="hover:text-[#07C160] transition-colors"
          >
            排版预设
          </button>
        </nav>
      </div>

      {/* Right: Actions & Primary Button */}
      <div className="flex flex-wrap items-center justify-end gap-2 shrink-0 ml-auto">
        {/* Quick New Article Button */}
        <button
          onClick={onNew}
          className="px-2.5 py-1.5 text-xs font-medium border border-[#E2E8F0] rounded hover:bg-[#F8FAFC] bg-white text-[#2C3E50] shadow-2xs hidden md:flex items-center gap-1.5 transition-colors"
          title="新建本地文章"
        >
          <Plus className="w-3.5 h-3.5 text-[#07C160]" />
          <span>新建</span>
        </button>

        {/* Quick File Actions Dropdown */}
        <div className="relative">
          <button
            onClick={() => {
          setShowExportMenu(false);
          setShowMoreMenu(false);
          setShowFileMenu(!showFileMenu);
        }}
            className="px-3 py-1.5 text-xs font-medium border border-[#E2E8F0] rounded hover:bg-[#F8FAFC] bg-white text-[#2C3E50] shadow-2xs flex items-center gap-1.5 transition-colors"
          >
            <FolderOpen className="w-3.5 h-3.5 text-[#64748B]" />
            <span>文件</span>
          </button>

          {showFileMenu && (
            <div
              className="absolute right-0 mt-1.5 w-48 bg-white rounded-lg shadow-lg border border-[#E5E7EB] py-1 z-50 text-xs text-[#2C3E50]"
              onClick={() => setShowFileMenu(false)}
            >
              <button
                onClick={onOpenArticles}
                className="w-full text-left px-3 py-2 hover:bg-[#F8FAFC] flex items-center gap-2"
              >
                <BookOpen className="w-3.5 h-3.5 text-[#07C160]" />
                <span>打开文章管理库</span>
              </button>
              <button
                onClick={onNew}
                className="w-full text-left px-3 py-2 hover:bg-[#F8FAFC] flex items-center gap-2"
              >
                <Plus className="w-3.5 h-3.5 text-[#07C160]" />
                <span>新建空白文章</span>
              </button>
              <button
                onClick={onOpen}
                className="w-full text-left px-3 py-2 hover:bg-[#F8FAFC] flex items-center gap-2"
              >
                <FolderOpen className="w-3.5 h-3.5 text-[#64748B]" />
                <span>打开本地 Markdown 文件</span>
              </button>
              <button
                onClick={onSave}
                className="w-full text-left px-3 py-2 hover:bg-[#F8FAFC] flex items-center gap-2"
              >
                <Save className="w-3.5 h-3.5 text-[#64748B]" />
                <span>保存 Markdown 到本地</span>
              </button>
              <button
                onClick={onOpenHistory}
                className="w-full text-left px-3 py-2 hover:bg-[#F8FAFC] flex items-center gap-2 border-t border-[#F1F5F9]"
              >
                <History className="w-3.5 h-3.5 text-[#2563EB]" />
                <span>查看版本历史与回滚</span>
              </button>
              <button
                onClick={onOpenBackup}
                className="w-full text-left px-3 py-2 hover:bg-[#F8FAFC] flex items-center gap-2 border-t border-[#F1F5F9]"
              >
                <Database className="w-3.5 h-3.5 text-[#6366F1]" />
                <span>数据备份与迁移</span>
              </button>
            </div>
          )}
        </div>

        {/* Export Dropdown */}
        <div className="relative">
          <button
            onClick={() => {
          setShowFileMenu(false);
          setShowMoreMenu(false);
          setShowExportMenu(!showExportMenu);
        }}
            className="px-3 py-1.5 text-xs font-medium border border-[#E2E8F0] rounded hover:bg-[#F8FAFC] bg-white text-[#2C3E50] shadow-xs flex items-center gap-1.5 transition-colors"
            title="导出选项"
          >
            <Download className="w-3.5 h-3.5 text-[#64748B]" />
            <span>导出</span>
          </button>

          {showExportMenu && (
            <div
              className="absolute right-0 mt-1.5 w-48 bg-white rounded-lg shadow-lg border border-[#E5E7EB] py-1 z-50 text-xs text-[#2C3E50]"
              onClick={() => setShowExportMenu(false)}
            >
              <button
                onClick={onExportHtml}
                className="w-full text-left px-3 py-2 hover:bg-[#F8FAFC] flex items-center gap-2"
              >
                <Download className="w-3.5 h-3.5 text-[#07C160]" />
                <span>导出公众号 HTML 文件</span>
              </button>
              <button
                onClick={onSave}
                className="w-full text-left px-3 py-2 hover:bg-[#F8FAFC] flex items-center gap-2"
              >
                <FileText className="w-3.5 h-3.5 text-[#2563EB]" />
                <span>导出 Markdown 源码</span>
              </button>
            </div>
          )}
        </div>

        {/* Layout Mode Switcher: 左右分栏 / 上下分栏 / 专注编辑 / 专注预览 */}
        <div className="flex items-center bg-[#F8FAFC] border border-[#E2E8F0] rounded-lg p-0.5 shrink-0">
          {[
            { mode: 'horizontal' as LayoutMode, icon: Columns2, label: '左右分栏（编辑 | 预览）' },
            { mode: 'vertical' as LayoutMode, icon: Rows2, label: '上下分栏（编辑 / 预览）' },
            { mode: 'editor' as LayoutMode, icon: FileEdit, label: '专注编辑（仅显示编辑器）' },
            { mode: 'preview' as LayoutMode, icon: Eye, label: '专注预览（仅显示预览）' },
          ].map(({ mode, icon: Icon, label }) => (
            <button
              key={mode}
              onClick={() => onLayoutChange(mode)}
              className={`p-1.5 rounded-md transition-colors ${
                layoutMode === mode
                  ? 'bg-white text-[#07C160] shadow-xs'
                  : 'text-[#94A3B8] hover:text-[#07C160]'
              }`}
              title={label}
            >
              <Icon className="w-3.5 h-3.5" />
            </button>
          ))}
        </div>

        {/* More Tools Dropdown */}
        <div className="relative">
          <button
            onClick={() => {
          setShowFileMenu(false);
          setShowExportMenu(false);
          setShowMoreMenu(!showMoreMenu);
        }}
            className="p-1.5 rounded-md hover:bg-[#F8FAFC] text-[#64748B] hover:text-[#2C3E50] transition-colors"
            title="更多工具"
          >
            <MoreHorizontal className="w-4 h-4" />
          </button>

          {showMoreMenu && (
            <div
              className="absolute right-0 mt-1.5 w-52 bg-white rounded-lg shadow-lg border border-[#E5E7EB] py-1 z-50 text-xs text-[#2C3E50]"
              onClick={() => setShowMoreMenu(false)}
            >
              <button
                onClick={onOpenCoverGenerator}
                className="w-full text-left px-3 py-2 hover:bg-[#F8FAFC] flex items-center gap-2"
              >
                <ImagePlus className="w-3.5 h-3.5 text-[#2563EB]" />
                <span>封面生成器</span>
              </button>
              <button
                onClick={onOpenPreflight}
                className="w-full text-left px-3 py-2 hover:bg-[#F8FAFC] flex items-center gap-2"
              >
                <ShieldCheck className="w-3.5 h-3.5 text-[#2563EB]" />
                <span>发布前体检</span>
              </button>
              <button
                onClick={onOpenBackup}
                className="w-full text-left px-3 py-2 hover:bg-[#F8FAFC] flex items-center gap-2 border-t border-[#F1F5F9]"
              >
                <Database className="w-3.5 h-3.5 text-[#6366F1]" />
                <span>数据备份与迁移</span>
              </button>
            </div>
          )}
        </div>

        {/* About / Help */}
        <button
          onClick={onOpenAbout}
          className="p-1.5 rounded hover:bg-[#F8FAFC] text-[#94A3B8] hover:text-[#2C3E50] transition-colors"
          title="使用帮助与说明"
        >
          <HelpCircle className="w-4 h-4" />
        </button>

        {/* Primary Action Button: 复制到公众号 (WeChat Green #07C160) */}
        <button
          onClick={onCopyWeChat}
          className={`px-4 py-1.5 text-xs font-semibold text-white rounded shadow-xs flex items-center gap-1.5 transition-all duration-150 ${
            copied
              ? 'bg-[#059649] ring-2 ring-[#07C160]/40 ring-offset-1'
              : 'bg-[#07C160] hover:bg-[#06ad56] active:scale-95'
          }`}
          title="复制为微信公众号富文本 (支持公众号后台直接 Ctrl+V / Cmd+V 粘贴)"
        >
          {copied ? (
            <>
              <Check className="w-3.5 h-3.5 animate-bounce" />
              <span>已复制到公众号</span>
            </>
          ) : (
            <>
              <Copy className="w-3.5 h-3.5" />
              <span>复制到公众号</span>
            </>
          )}
        </button>
      </div>
    </header>
  );
};
