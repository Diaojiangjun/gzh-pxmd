import React, { useRef, useImperativeHandle, forwardRef, useState, useMemo } from 'react';
import {
  Smartphone,
  Tablet,
  Monitor,
  Maximize2,
  Copy,
  Check,
  ArrowUp,
  Clock,
  FileText,
  Image as ImageIcon,
  ChevronLeft,
  MoreHorizontal,
  Moon,
  Sun,
  EyeOff,
  AlertTriangle,
} from 'lucide-react';
import { PreviewMode, ThemeConfig, BackgroundSettings } from '../types';
import { calculateArticleStats, BlockSyntaxError } from '../services/gzhCompiler';

interface PreviewPanelProps {
  html: string;
  markdown: string;
  previewMode: PreviewMode;
  onPreviewModeChange: (mode: PreviewMode) => void;
  activeTheme: ThemeConfig;
  background: BackgroundSettings;
  articleTitle: string;
  onCopyWeChat: () => void;
  copied: boolean;
  convertLinksToFootnotes: boolean;
  onToggleFootnotes: (value: boolean) => void;
  blockErrors?: BlockSyntaxError[];
}

export interface PreviewPanelRef {
  scrollToPercentage: (percentage: number) => void;
}

export const PreviewPanel = forwardRef<PreviewPanelRef, PreviewPanelProps>(
  (
    {
      html,
      markdown,
      previewMode,
      onPreviewModeChange,
      activeTheme,
      background,
      articleTitle,
      onCopyWeChat,
      copied,
      convertLinksToFootnotes,
      onToggleFootnotes,
      blockErrors = [],
    },
    ref
  ) => {
    const scrollContainerRef = useRef<HTMLDivElement>(null);
    const [darkMode, setDarkMode] = useState(false);
    const [hidePhoneFrame, setHidePhoneFrame] = useState(false);
    const stats = useMemo(() => calculateArticleStats(markdown), [markdown]);

    useImperativeHandle(ref, () => ({
      scrollToPercentage: (percentage: number) => {
        if (!scrollContainerRef.current) return;
        const { scrollHeight, clientHeight } = scrollContainerRef.current;
        const maxScroll = scrollHeight - clientHeight;
        if (maxScroll > 0) {
          scrollContainerRef.current.scrollTop = maxScroll * percentage;
        }
      },
    }));

    const scrollToTop = () => {
      scrollContainerRef.current?.scrollTo({ top: 0, behavior: 'smooth' });
    };

    return (
      <div className="flex-1 flex flex-col h-full bg-[#F1F5F9] border-l border-[#E5E7EB] overflow-hidden relative">
        {/* Preview Header Control Bar */}
        <div className="min-h-10 bg-white border-b border-[#E5E7EB] px-2 sm:px-4 py-1.5 flex flex-wrap items-center justify-between gap-y-2 gap-x-2 shrink-0 select-none text-xs">
          {/* Mode Switcher Tabs */}
          <div className="flex flex-wrap items-center gap-y-1 bg-[#F1F5F9] p-0.5 rounded-lg border border-[#E2E8F0] shrink-0">
            <button
              onClick={() => onPreviewModeChange('default')}
              className={`flex items-center space-x-1 px-2 sm:px-2.5 py-1 rounded-md transition-all ${
                previewMode === 'default'
                  ? 'bg-white text-[#2C3E50] font-semibold shadow-xs'
                  : 'text-[#64748B] hover:text-[#1E293B]'
              }`}
              title="默认排版预览"
            >
              <Maximize2 className="w-3.5 h-3.5" />
              <span className="hidden sm:inline">全宽预览</span>
            </button>

            <button
              onClick={() => onPreviewModeChange('mobile')}
              className={`flex items-center space-x-1 px-2 sm:px-2.5 py-1 rounded-md transition-all ${
                previewMode === 'mobile'
                  ? 'bg-white text-[#07C160] font-semibold shadow-xs'
                  : 'text-[#64748B] hover:text-[#1E293B]'
              }`}
              title="手机端真机样机"
            >
              <Smartphone className="w-3.5 h-3.5 text-[#07C160]" />
              <span className="hidden sm:inline">移动端样机</span>
            </button>

            <button
              onClick={() => onPreviewModeChange('tablet')}
              className={`flex items-center space-x-1 px-2 sm:px-2.5 py-1 rounded-md transition-all ${
                previewMode === 'tablet'
                  ? 'bg-white text-[#6366F1] font-semibold shadow-xs'
                  : 'text-[#64748B] hover:text-[#1E293B]'
              }`}
              title="平板端阅读视窗 (中等宽度设备)"
            >
              <Tablet className="w-3.5 h-3.5 text-[#6366F1]" />
              <span className="hidden sm:inline">平板样机</span>
            </button>

            <button
              onClick={() => onPreviewModeChange('desktop')}
              className={`flex items-center space-x-1 px-2 sm:px-2.5 py-1 rounded-md transition-all ${
                previewMode === 'desktop'
                  ? 'bg-white text-[#2563EB] font-semibold shadow-xs'
                  : 'text-[#64748B] hover:text-[#1E293B]'
              }`}
              title="电脑端微信文章阅读视窗"
            >
              <Monitor className="w-3.5 h-3.5 text-[#2563EB]" />
              <span className="hidden sm:inline">电脑样机</span>
            </button>
          </div>

          {/* Toggles & Stats */}
          <div className="flex flex-wrap items-center gap-x-1.5 gap-y-1.5 ml-auto shrink-0">
            {/* 隐藏手机外壳开关 */}
            <button
              onClick={() => setHidePhoneFrame(!hidePhoneFrame)}
              className={`flex items-center space-x-1 px-2 py-1 rounded-md border text-[11px] font-medium transition-colors ${
                hidePhoneFrame
                  ? 'bg-slate-100 border-slate-300 text-[#2C3E50]'
                  : 'bg-white border-[#E2E8F0] text-[#94A3B8] hover:text-[#2C3E50]'
              }`}
              title="隐藏手机外壳，只渲染公众号正文 (释放更多预览可视区)"
            >
              <EyeOff className="w-3.5 h-3.5" />
              <span className="hidden sm:inline">隐藏外壳</span>
            </button>

            {/* 外链转脚注开关 */}
            <button
              onClick={() => onToggleFootnotes(!convertLinksToFootnotes)}
              className={`flex items-center space-x-1 px-2 py-1 rounded-md border text-[11px] font-medium transition-colors ${
                convertLinksToFootnotes
                  ? 'bg-[#F0FAF5] border-[#07C160]/30 text-[#07C160]'
                  : 'bg-white border-[#E2E8F0] text-[#94A3B8]'
              }`}
              title="外链自动转文末脚注（公众号正文外链点击无效）"
            >
              <span
                className={`w-1.5 h-1.5 rounded-full ${
                  convertLinksToFootnotes ? 'bg-[#07C160]' : 'bg-gray-300'
                }`}
              />
              <span className="hidden sm:inline">外链脚注</span>
            </button>

            {/* 微信深色模式预览开关 */}
            <button
              onClick={() => setDarkMode(!darkMode)}
              className={`p-1.5 rounded-md border transition-colors ${
                darkMode
                  ? 'bg-[#1E293B] border-[#1E293B] text-amber-300'
                  : 'bg-white border-[#E2E8F0] text-[#64748B] hover:text-[#1E293B]'
              }`}
              title="微信深色模式 (夜间模式) 预览"
            >
              {darkMode ? <Sun className="w-3.5 h-3.5" /> : <Moon className="w-3.5 h-3.5" />}
            </button>

            {/* 复制到公众号按钮（移至预览头部，避免悬浮遮挡） */}
            <button
              onClick={onCopyWeChat}
              className={`flex items-center space-x-1 px-2 sm:px-2.5 py-1 rounded-md text-[11px] font-medium transition-all ${
                copied
                  ? 'bg-[#059649] text-white shadow-xs'
                  : 'bg-[#07C160] text-white hover:bg-[#06ad56] active:scale-95'
              }`}
              title="一键复制到微信公众号"
            >
              {copied ? <Check className="w-3.5 h-3.5" /> : <Copy className="w-3.5 h-3.5" />}
              <span className="hidden sm:inline">{copied ? '已复制' : '复制'}</span>
            </button>

            {/* Stats Badges */}
            <div className="hidden lg:flex flex-wrap items-center gap-x-3 gap-y-1 text-[#64748B] text-[11px] ml-2 pl-2 border-l border-[#E5E7EB]">
              <div className="flex items-center gap-x-1" title="字数统计">
                <FileText className="w-3.5 h-3.5 text-[#94A3B8]" />
                <span>{stats.wordCount} 字</span>
              </div>
              <div className="flex items-center gap-x-1" title="预计阅读时长">
                <Clock className="w-3.5 h-3.5 text-[#94A3B8]" />
                <span>约 {stats.readingTimeMinutes} 分钟</span>
              </div>
              <div className="flex items-center gap-x-1" title="配图数">
                <ImageIcon className="w-3.5 h-3.5 text-[#94A3B8]" />
                <span>{stats.imageCount} 张图片</span>
              </div>
            </div>
          </div>
        </div>

        {/* 自定义语法块 :::xxx 体检告警（轻量提示，不遮挡正文） */}
        {blockErrors.length > 0 && (
          <div className="px-4 py-2 bg-amber-50 border-b border-amber-200 shrink-0">
            <div className="flex items-start gap-2 text-[11px] text-amber-800">
              <AlertTriangle className="w-4 h-4 text-amber-500 shrink-0 mt-0.5" />
              <div className="flex-1 min-w-0">
                <div className="font-semibold mb-0.5">
                  检测到 {blockErrors.length} 处自定义块语法问题（已按原文渲染）：
                </div>
                <ul className="space-y-0.5">
                  {blockErrors.slice(0, 3).map((e, i) => (
                    <li key={i} className="truncate">
                      第 {e.line} 行 ·{' '}
                      <code className="bg-amber-100 px-1 rounded">:::{e.blockName}</code>{' '}
                      {e.reason === 'unclosed' ? '未闭合，缺少结尾 :::' : '不是已知块名'}
                    </li>
                  ))}
                </ul>
                {blockErrors.length > 3 && (
                  <div className="mt-0.5 text-amber-600">…等共 {blockErrors.length} 处</div>
                )}
                <div className="mt-1 text-amber-600">
                  可用块：hero · toc · quote · callout · footer
                </div>
              </div>
            </div>
          </div>
        )}

        {/* Preview Body Area */}
        <div className="flex-1 overflow-auto flex items-start justify-center p-4 sm:p-6 relative bg-[#F1F5F9]">
          {/* 1. Default Mode View */}
          {previewMode === 'default' && (
            <div
              ref={scrollContainerRef}
              className={`w-full max-w-[720px] h-full overflow-y-auto rounded-xl shadow-xs border border-[#E5E7EB] p-3 sm:p-6 ${
                darkMode ? 'bg-[#0f172a] gzh-preview-dark' : 'bg-white'
              }`}
            >
              <div
                className="gzh-preview-container"
                dangerouslySetInnerHTML={{ __html: html }}
              />
            </div>
          )}

          {/* 2. Mobile Mockup Mode View (Matching Professional Polish) */}
          {previewMode === 'mobile' && (
            <div className="flex flex-col items-center my-auto w-full">
              {!hidePhoneFrame && (
                <div className="text-xs font-bold text-[#94A3B8] uppercase tracking-widest mb-3">
                  移动端实时预览 (1:1)
                </div>
              )}
              {hidePhoneFrame ? (
                // 隐藏外壳模式：直接渲染公众号正文，释放最大可视区
                <div
                  ref={scrollContainerRef}
                  className={`w-full max-w-[720px] h-full overflow-y-auto rounded-xl shadow-xs border border-[#E5E7EB] p-3 sm:p-6 ${
                    darkMode ? 'bg-[#0f172a] gzh-preview-dark' : 'bg-white'
                  }`}
                >
                  <div
                    className="gzh-preview-container"
                    dangerouslySetInnerHTML={{ __html: html }}
                  />
                </div>
              ) : (
                // 默认外壳模式：手机样机模拟
                <div className="relative w-[310px] h-[640px] bg-white rounded-[40px] border-[8px] border-[#1E293B] shadow-2xl overflow-hidden flex flex-col shrink-0">
                  {/* Speaker top notch */}
                  <div className="absolute top-0 w-full h-6 bg-[#1E293B] flex justify-center items-end pb-1 z-20">
                    <div className="w-12 h-1 bg-[#334155] rounded-full" />
                  </div>

                  {/* Mobile Screen Container */}
                  <div className="flex-1 bg-white overflow-hidden flex flex-col pt-5">
                    {/* Status Bar */}
                    <div className="h-6 px-5 flex items-center justify-between text-[11px] font-semibold text-slate-800 shrink-0 select-none">
                      <span>09:41</span>
                      <div className="flex items-center space-x-1">
                        <span className="text-[10px] font-mono">5G</span>
                        <div className="w-4 h-2 border border-slate-700 rounded-2xs p-0.5 flex items-center">
                          <div className="w-2 h-full bg-slate-700 rounded-3xs" />
                        </div>
                      </div>
                    </div>

                    {/* WeChat Navigation Bar */}
                    <div className="h-10 bg-white border-b border-[#F1F5F9] px-3 flex items-center justify-between shrink-0 select-none">
                      <div className="flex items-center space-x-1 text-[#2C3E50]">
                        <ChevronLeft className="w-5 h-5 text-[#64748B]" />
                        <span className="text-xs font-medium truncate max-w-[170px]">
                          {articleTitle || '公众号文章'}
                        </span>
                      </div>
                      <div className="flex items-center space-x-2 text-[#64748B]">
                        <MoreHorizontal className="w-4 h-4" />
                      </div>
                    </div>

                    {/* Scrollable Article Area inside Mobile */}
                    <div
                      ref={scrollContainerRef}
                      className={`flex-1 min-w-0 overflow-y-auto overflow-x-hidden px-3.5 py-3 ${
                        darkMode ? 'bg-[#0f172a] gzh-preview-dark' : ''
                      }`}
                    >
                      {/* Header in mobile preview */}
                      <div className="mb-3">
                        <div className="text-base font-bold leading-snug text-[#1E293B] mb-1.5">
                          {articleTitle || '欢迎使用宝藏排版器 Pro'}
                        </div>
                        <div className="flex items-center gap-2 text-[#94A3B8] text-[11px]">
                          <span className="text-[#576B95] font-medium">公众号排版</span>
                          <span>今天</span>
                        </div>
                      </div>

                      <div
                        className="gzh-preview-container"
                        dangerouslySetInnerHTML={{ __html: html }}
                      />
                    </div>

                    {/* iPhone Bottom Home Indicator Bar */}
                    <div className="h-4 bg-white flex items-center justify-center shrink-0">
                      <div className="w-24 h-1 bg-slate-300 rounded-full" />
                    </div>
                  </div>
                </div>
              )}

              {/* Quick switch device buttons beneath */}
              {!hidePhoneFrame && (
                <div className="mt-4 flex gap-2">
                  <button
                    onClick={() => onPreviewModeChange('mobile')}
                    className="w-8 h-8 rounded-full bg-white shadow-xs flex items-center justify-center border border-[#07C160] text-[#07C160] transition-colors"
                    title="移动端样机"
                  >
                    <Smartphone className="w-4 h-4" />
                  </button>
                  <button
                    onClick={() => onPreviewModeChange('desktop')}
                    className="w-8 h-8 rounded-full bg-white shadow-xs flex items-center justify-center border border-gray-200 hover:border-[#07C160] text-[#64748B] hover:text-[#07C160] transition-colors"
                    title="电脑端样机"
                  >
                    <Monitor className="w-4 h-4" />
                  </button>
                  <button
                    onClick={() => onPreviewModeChange('default')}
                    className="w-8 h-8 rounded-full bg-white shadow-xs flex items-center justify-center border border-gray-200 hover:border-[#07C160] text-[#64748B] hover:text-[#07C160] transition-colors"
                    title="全宽视窗"
                  >
                    <Maximize2 className="w-4 h-4" />
                  </button>
                </div>
              )}
            </div>
          )}

          {/* 2.5 Tablet Mockup Mode View (中等宽度设备) */}
          {previewMode === 'tablet' && (
            <div className="flex flex-col items-center my-auto w-full">
              {!hidePhoneFrame && (
                <div className="text-xs font-bold text-[#94A3B8] uppercase tracking-widest mb-3">
                  平板端实时预览
                </div>
              )}
              {hidePhoneFrame ? (
                // 隐藏外壳模式：直接渲染公众号正文
                <div
                  ref={scrollContainerRef}
                  className={`w-full max-w-[768px] h-full overflow-y-auto rounded-xl shadow-xs border border-[#E5E7EB] p-4 sm:p-8 ${
                    darkMode ? 'bg-[#0f172a] gzh-preview-dark' : 'bg-white'
                  }`}
                >
                  <div
                    className="gzh-preview-container"
                    dangerouslySetInnerHTML={{ __html: html }}
                  />
                </div>
              ) : (
                // 默认外壳模式：平板样机模拟
                <div className="relative w-[600px] h-[820px] bg-[#1E293B] rounded-[36px] border-[14px] border-[#1E293B] shadow-2xl overflow-hidden flex flex-col shrink-0">
                  {/* 顶部摄像头点 */}
                  <div className="absolute top-2.5 left-1/2 -translate-x-1/2 w-2 h-2 rounded-full bg-[#334155] z-20" />

                  {/* Tablet Screen Container */}
                  <div className="flex-1 bg-white overflow-hidden flex flex-col pt-9">
                    {/* WeChat Navigation Bar */}
                    <div className="h-12 bg-white border-b border-[#F1F5F9] px-4 flex items-center justify-between shrink-0 select-none">
                      <div className="flex items-center space-x-1 text-[#2C3E50]">
                        <ChevronLeft className="w-5 h-5 text-[#64748B]" />
                        <span className="text-sm font-medium truncate max-w-[360px]">
                          {articleTitle || '公众号文章'}
                        </span>
                      </div>
                      <div className="flex items-center space-x-2 text-[#64748B]">
                        <MoreHorizontal className="w-4 h-4" />
                      </div>
                    </div>

                    {/* Scrollable Article Area inside Tablet */}
                    <div
                      ref={scrollContainerRef}
                      className={`flex-1 min-w-0 overflow-y-auto overflow-x-hidden px-6 py-5 ${
                        darkMode ? 'bg-[#0f172a] gzh-preview-dark' : ''
                      }`}
                    >
                      {/* Header in tablet preview */}
                      <div className="mb-4">
                        <div className="text-2xl font-bold leading-snug text-[#1E293B] mb-2">
                          {articleTitle || '欢迎使用宝藏排版器 Pro'}
                        </div>
                        <div className="flex items-center gap-2 text-[#94A3B8] text-xs">
                          <span className="text-[#576B95] font-medium">公众号排版</span>
                          <span>今天</span>
                        </div>
                      </div>

                      <div
                        className="gzh-preview-container"
                        dangerouslySetInnerHTML={{ __html: html }}
                      />
                    </div>

                    {/* Tablet Bottom Bar */}
                    <div className="h-5 bg-white flex items-center justify-center shrink-0">
                      <div className="w-28 h-1 bg-slate-300 rounded-full" />
                    </div>
                  </div>
                </div>
              )}

              {/* Quick switch device buttons beneath */}
              {!hidePhoneFrame && (
                <div className="mt-4 flex gap-2">
                  <button
                    onClick={() => onPreviewModeChange('mobile')}
                    className="w-8 h-8 rounded-full bg-white shadow-xs flex items-center justify-center border border-gray-200 hover:border-[#07C160] text-[#64748B] hover:text-[#07C160] transition-colors"
                    title="移动端样机"
                  >
                    <Smartphone className="w-4 h-4" />
                  </button>
                  <button
                    onClick={() => onPreviewModeChange('tablet')}
                    className="w-8 h-8 rounded-full bg-white shadow-xs flex items-center justify-center border border-[#6366F1] text-[#6366F1] transition-colors"
                    title="平板端样机"
                  >
                    <Tablet className="w-4 h-4" />
                  </button>
                  <button
                    onClick={() => onPreviewModeChange('desktop')}
                    className="w-8 h-8 rounded-full bg-white shadow-xs flex items-center justify-center border border-gray-200 hover:border-[#07C160] text-[#64748B] hover:text-[#07C160] transition-colors"
                    title="电脑端样机"
                  >
                    <Monitor className="w-4 h-4" />
                  </button>
                  <button
                    onClick={() => onPreviewModeChange('default')}
                    className="w-8 h-8 rounded-full bg-white shadow-xs flex items-center justify-center border border-gray-200 hover:border-[#07C160] text-[#64748B] hover:text-[#07C160] transition-colors"
                    title="全宽视窗"
                  >
                    <Maximize2 className="w-4 h-4" />
                  </button>
                </div>
              )}
            </div>
          )}

          {/* 3. Desktop Client Mockup Mode View */}
          {previewMode === 'desktop' && (
            <div className="w-full max-w-[840px] h-full flex flex-col bg-white rounded-xl shadow-md border border-[#E5E7EB] overflow-hidden">
              {/* WeChat Desktop Window Topbar */}
              <div className="h-9 bg-[#F8FAFC] border-b border-[#E5E7EB] px-3 flex items-center justify-between select-none shrink-0">
                <div className="flex items-center space-x-2">
                  <div className="w-3 h-3 rounded-full bg-[#FF5F56]" />
                  <div className="w-3 h-3 rounded-full bg-[#FFBD2E]" />
                  <div className="w-3 h-3 rounded-full bg-[#27C93F]" />
                  <span className="text-xs text-[#64748B] font-medium ml-2">
                    微信公众平台 · 电脑端文章阅读
                  </span>
                </div>
                <span className="text-[11px] text-[#94A3B8]">只读预览</span>
              </div>

              {/* Desktop Article Content */}
              <div
                ref={scrollContainerRef}
                className={`flex-1 overflow-y-auto p-6 sm:p-8 ${darkMode ? 'bg-[#0f172a] gzh-preview-dark' : ''}`}
              >
                <div
                  className="gzh-preview-container"
                  dangerouslySetInnerHTML={{ __html: html }}
                />
              </div>
            </div>
          )}

          {/* Floating Back-to-Top Action (复制按钮已移至预览头部) */}
          <div className="absolute bottom-5 right-5 z-20">
            <button
              onClick={scrollToTop}
              className="p-2 rounded-full bg-white/80 backdrop-blur-sm text-[#94A3B8] hover:text-[#07C160] shadow-sm border border-[#E2E8F0] hover:bg-white hover:shadow-md transition-all"
              title="回到顶部"
            >
              <ArrowUp className="w-4 h-4" />
            </button>
          </div>
        </div>
      </div>
    );
  }
);
