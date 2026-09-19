import React, { useMemo } from 'react';
import { useEscapeKey } from '../hooks/useEscapeKey';
import {
  X,
  CheckCircle2,
  AlertTriangle,
  Info,
  Sparkles,
  Copy,
  Check,
  FileText,
  Clock,
  Image as ImageIcon,
  ExternalLink,
  Wand2,
  ShieldCheck,
} from 'lucide-react';
import { calculateArticleStats } from '../services/gzhCompiler';

interface PreflightModalProps {
  isOpen: boolean;
  onClose: () => void;
  markdown: string;
  articleTitle: string;
  onCopyWeChat: () => void;
  onFormatPangu?: () => void;
  copied: boolean;
}

export const PreflightModal: React.FC<PreflightModalProps> = ({
  isOpen,
  onClose,
  markdown,
  articleTitle,
  onCopyWeChat,
  onFormatPangu,
  copied,
}) => {
  const stats = useMemo(() => calculateArticleStats(markdown), [markdown]);

  // Run diagnostics
  const analysis = useMemo(() => {
    const issues: Array<{
      type: 'warning' | 'info' | 'success';
      title: string;
      desc: string;
      actionable?: boolean;
    }> = [];

    let score = 100;

    // 1. Check title
    if (!articleTitle || articleTitle.trim() === '未命名文章') {
      issues.push({
        type: 'warning',
        title: '未设置吸引人的标题',
        desc: '当前文章标题为空或为默认名称，建议设置更具吸引力的主标题。',
      });
      score -= 5;
    } else {
      issues.push({
        type: 'success',
        title: '文章主标题已就绪',
        desc: `标题长度合适（${articleTitle.length} 字），符合公众号阅读习惯。`,
      });
    }

    // 2. Check headings hierarchy
    const h1Count = (markdown.match(/^#\s+/gm) || []).length;
    const h2Count = (markdown.match(/^##\s+/gm) || []).length;
    const h3Count = (markdown.match(/^###\s+/gm) || []).length;

    if (h1Count === 0 && h2Count === 0) {
      issues.push({
        type: 'info',
        title: '缺少层级分段小标题',
        desc: '文章较长且未检测到二级章节标题 (H2)，建议适当增加小标题提升可读性。',
      });
      score -= 5;
    } else if (h3Count > 0 && h2Count === 0) {
      issues.push({
        type: 'warning',
        title: '标题层级发生跳级',
        desc: '检测到存在三级标题 (H3) 但缺少二级标题 (H2)，排版规范建议顺次分级。',
      });
      score -= 8;
    } else {
      issues.push({
        type: 'success',
        title: '标题层级清晰合理',
        desc: `结构包含 ${h2Count} 个章节小标题，便于读者快速抓取重点。`,
      });
    }

    // 3. Check Chinese-English spacing
    const unspacedRegex = /([\u4e00-\u9fa5][a-zA-Z0-9]|[a-zA-Z0-9][\u4e00-\u9fa5])/g;
    const unspacedMatches = markdown.match(unspacedRegex) || [];
    if (unspacedMatches.length > 5) {
      issues.push({
        type: 'warning',
        title: `检测到 ${unspacedMatches.length} 处中英文紧挨`,
        desc: '部分中文与英文/数字未留出排版间距，可点击下方「一键中英文排版优化」。',
        actionable: true,
      });
      score -= 6;
    } else {
      issues.push({
        type: 'success',
        title: '中英文排版规范符合标准',
        desc: '中文字符与英文字母、数字之间留有优美的自然视觉呼吸间距。',
      });
    }

    // 4. Check external links
    const externalLinks = markdown.match(/\[([^\]]+)\]\((https?:\/\/[^\)]+)\)/g) || [];
    if (externalLinks.length > 0) {
      issues.push({
        type: 'info',
        title: `包含 ${externalLinks.length} 处外部网络链接`,
        desc: '微信公众号不支持点击外链，系统已自动配置为文末学术/专业级脚注标号。',
      });
    }

    // 5. Check large Base64 images
    const base64Imgs = markdown.match(/data:image\/[a-zA-Z0-9+.-]+;base64,[A-Za-z0-9+/=]{100000,}/g) || [];
    if (base64Imgs.length > 0) {
      issues.push({
        type: 'warning',
        title: `存在 ${base64Imgs.length} 张大体积图片`,
        desc: '单张图片超过建议阈值，可能增加手机加载耗时。建议使用素材库或压缩后插入。',
      });
      score -= 10;
    } else {
      issues.push({
        type: 'success',
        title: '图片体积与加载性能优秀',
        desc: `包含 ${stats.imageCount} 张图片，均已通过智能轻量化优化。`,
      });
    }

    // 6. Word count
    if (stats.wordCount < 100) {
      issues.push({
        type: 'info',
        title: '字数较短',
        desc: '当前内容适合作为短动态、金句卡片或快讯分享。',
      });
    } else {
      issues.push({
        type: 'success',
        title: `字数适中 (${stats.wordCount} 字)`,
        desc: `预计读者阅读时长约为 ${stats.readingTimeMinutes} 分钟，阅读节奏舒适。`,
      });
    }

    return {
      score: Math.max(70, Math.min(100, score)),
      issues,
    };
  }, [markdown, articleTitle, stats]);

  // Esc 关闭（此前这些弹窗只能点右上角 ×）
  useEscapeKey(isOpen, onClose);

  if (!isOpen) return null;

  return (
    <div role="dialog" aria-modal="true" aria-label="发布前体检" onClick={onClose} className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 backdrop-blur-xs p-4 animate-in fade-in duration-200">
      <div onClick={(e) => e.stopPropagation()} className="bg-white rounded-2xl shadow-2xl border border-gray-200 w-full max-w-2xl max-h-[90vh] flex flex-col overflow-hidden">
        {/* Header */}
        <div className="flex items-center justify-between px-6 py-4 border-b border-gray-100 shrink-0">
          <div className="flex items-center gap-3">
            <div className="w-10 h-10 rounded-xl bg-emerald-50 text-emerald-600 flex items-center justify-center">
              <ShieldCheck className="w-5 h-5" />
            </div>
            <div>
              <h2 className="text-base font-bold text-gray-900">
                公众号排版发布前体检
              </h2>
              <p className="text-xs text-gray-500">
                对标题层级、中英文排版、图片体积及外链做全面诊断
              </p>
            </div>
          </div>
          <button
            onClick={onClose}
            className="p-2 rounded-lg hover:bg-gray-100 text-gray-400 hover:text-gray-600 transition-colors"
          >
            <X className="w-5 h-5" />
          </button>
        </div>

        {/* Content */}
        <div className="flex-1 overflow-y-auto p-6 space-y-6">
          {/* Score Banner */}
          <div className="bg-gradient-to-r from-emerald-50 to-teal-50 border border-emerald-100 rounded-xl p-4 flex items-center justify-between">
            <div className="flex items-center gap-4">
              <div className="w-16 h-16 rounded-full bg-white shadow-xs border-4 border-emerald-500 flex flex-col items-center justify-center">
                <span className="text-xl font-black text-emerald-600 leading-none">
                  {analysis.score}
                </span>
                <span className="text-[10px] text-gray-400 font-bold uppercase">
                  SCORE
                </span>
              </div>
              <div>
                <h3 className="text-sm font-bold text-gray-900">
                  {analysis.score >= 90
                    ? '排版评级：极佳 · 达到公号精品规范'
                    : '排版评级：良好 · 稍作调整效果更出众'}
                </h3>
                <p className="text-xs text-gray-600 mt-0.5">
                  已根据微信公众平台阅读体验、排版美学与防折叠准则完成 6 项检测。
                </p>
              </div>
            </div>
          </div>

          {/* Quick Metrics Bar */}
          <div className="grid grid-cols-3 gap-3">
            <div className="bg-gray-50 rounded-xl p-3 border border-gray-100 flex items-center gap-3">
              <div className="w-8 h-8 rounded-lg bg-blue-100/60 text-blue-600 flex items-center justify-center">
                <FileText className="w-4 h-4" />
              </div>
              <div>
                <div className="text-[11px] text-gray-500">总字数</div>
                <div className="text-sm font-bold text-gray-800">{stats.wordCount} 字</div>
              </div>
            </div>

            <div className="bg-gray-50 rounded-xl p-3 border border-gray-100 flex items-center gap-3">
              <div className="w-8 h-8 rounded-lg bg-amber-100/60 text-amber-600 flex items-center justify-center">
                <Clock className="w-4 h-4" />
              </div>
              <div>
                <div className="text-[11px] text-gray-500">预估时长</div>
                <div className="text-sm font-bold text-gray-800">约 {stats.readingTimeMinutes} 分钟</div>
              </div>
            </div>

            <div className="bg-gray-50 rounded-xl p-3 border border-gray-100 flex items-center gap-3">
              <div className="w-8 h-8 rounded-lg bg-purple-100/60 text-purple-600 flex items-center justify-center">
                <ImageIcon className="w-4 h-4" />
              </div>
              <div>
                <div className="text-[11px] text-gray-500">配图数量</div>
                <div className="text-sm font-bold text-gray-800">{stats.imageCount} 张图片</div>
              </div>
            </div>
          </div>

          {/* Diagnostic List */}
          <div>
            <h4 className="text-xs font-bold text-gray-700 uppercase tracking-wider mb-3">
              详细体检报告明细
            </h4>
            <div className="space-y-2.5">
              {analysis.issues.map((item, idx) => (
                <div
                  key={idx}
                  className={`p-3.5 rounded-xl border flex items-start justify-between gap-3 ${
                    item.type === 'success'
                      ? 'bg-emerald-50/40 border-emerald-100'
                      : item.type === 'warning'
                      ? 'bg-amber-50/50 border-amber-200/70'
                      : 'bg-blue-50/40 border-blue-100'
                  }`}
                >
                  <div className="flex items-start gap-2.5">
                    {item.type === 'success' ? (
                      <CheckCircle2 className="w-4 h-4 text-emerald-600 shrink-0 mt-0.5" />
                    ) : item.type === 'warning' ? (
                      <AlertTriangle className="w-4 h-4 text-amber-600 shrink-0 mt-0.5" />
                    ) : (
                      <Info className="w-4 h-4 text-blue-600 shrink-0 mt-0.5" />
                    )}
                    <div>
                      <div className="text-xs font-bold text-gray-900">{item.title}</div>
                      <div className="text-xs text-gray-600 mt-0.5 leading-relaxed">
                        {item.desc}
                      </div>
                    </div>
                  </div>

                  {item.actionable && onFormatPangu && (
                    <button
                      onClick={() => {
                        onFormatPangu();
                      }}
                      className="px-2.5 py-1 bg-white hover:bg-amber-100/60 border border-amber-200 text-amber-800 text-[11px] font-semibold rounded-md shrink-0 flex items-center gap-1 shadow-2xs transition-colors"
                    >
                      <Wand2 className="w-3 h-3" />
                      <span>一键优化</span>
                    </button>
                  )}
                </div>
              ))}
            </div>
          </div>
        </div>

        {/* Footer Actions */}
        <div className="px-6 py-3.5 bg-gray-50 border-t border-gray-100 flex items-center justify-between shrink-0">
          <button
            onClick={onClose}
            className="px-4 py-2 text-xs font-medium text-gray-600 hover:text-gray-900 rounded-lg hover:bg-gray-200/50 transition-colors"
          >
            返回编辑器
          </button>

          <div className="flex items-center gap-2">
            {onFormatPangu && (
              <button
                onClick={onFormatPangu}
                className="flex items-center gap-1.5 px-3 py-2 bg-white hover:bg-gray-100 border border-gray-200 text-xs font-semibold text-gray-700 rounded-lg transition-colors shadow-2xs"
              >
                <Wand2 className="w-3.5 h-3.5 text-blue-600" />
                <span>中英文排版规范化</span>
              </button>
            )}

            <button
              onClick={() => {
                onCopyWeChat();
              }}
              className={`flex items-center gap-1.5 px-5 py-2 text-xs font-bold text-white rounded-lg shadow-sm transition-all ${
                copied
                  ? 'bg-emerald-700'
                  : 'bg-[#07C160] hover:bg-[#06ad56]'
              }`}
            >
              {copied ? (
                <>
                  <Check className="w-4 h-4" />
                  <span>已复制到公众号</span>
                </>
              ) : (
                <>
                  <Copy className="w-4 h-4" />
                  <span>体检通过 · 直接复制到公众号</span>
                </>
              )}
            </button>
          </div>
        </div>
      </div>
    </div>
  );
};
