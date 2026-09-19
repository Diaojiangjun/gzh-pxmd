import React, { useState, useRef, useEffect } from 'react';
import { useEscapeKey } from '../hooks/useEscapeKey';
import {
  X,
  Download,
  Copy,
  Check,
  Sparkles,
  Layout,
  Palette,
  Image as ImageIcon,
  Type,
  FileDown,
} from 'lucide-react';
import { ThemeConfig } from '../types';

interface CoverGeneratorModalProps {
  isOpen: boolean;
  onClose: () => void;
  articleTitle: string;
  activeTheme: ThemeConfig;
  onInsertCoverToArticle?: (dataUri: string) => void;
}

type AspectRatio = '2.35:1' | '1:1';
type StylePreset = 'minimal' | 'bold' | 'gradient' | 'magazine' | 'dark-tech';

export const CoverGeneratorModal: React.FC<CoverGeneratorModalProps> = ({
  isOpen,
  onClose,
  articleTitle,
  activeTheme,
  onInsertCoverToArticle,
}) => {
  const [ratio, setRatio] = useState<AspectRatio>('2.35:1');
  const [title, setTitle] = useState(articleTitle || '在这里输入封面大标题');
  const [subtitle, setSubtitle] = useState('副标题或文章核心导读精炼一句话');
  const [tag, setTag] = useState('干货分享');
  const [author, setAuthor] = useState('排版美学指南');
  const [stylePreset, setStylePreset] = useState<StylePreset>('minimal');
  const [primaryColor, setPrimaryColor] = useState(activeTheme.primaryColor || '#07C160');
  const [accentColor, setAccentColor] = useState(activeTheme.accentColor || '#10B981');
  const [copied, setCopied] = useState(false);
  const [inserted, setInserted] = useState(false);

  const canvasRef = useRef<HTMLCanvasElement>(null);

  // Sync title when articleTitle changes
  useEffect(() => {
    if (articleTitle) {
      setTitle(articleTitle);
    }
  }, [articleTitle]);

  // Sync colors when activeTheme changes
  useEffect(() => {
    if (activeTheme.primaryColor) setPrimaryColor(activeTheme.primaryColor);
    if (activeTheme.accentColor) setAccentColor(activeTheme.accentColor);
  }, [activeTheme]);

  // Draw canvas whenever inputs change
  useEffect(() => {
    if (!isOpen) return;
    const canvas = canvasRef.current;
    if (!canvas) return;

    const ctx = canvas.getContext('2d');
    if (!ctx) return;

    // Retina resolution
    const width = ratio === '2.35:1' ? 1800 : 1200;
    const height = ratio === '2.35:1' ? 766 : 1200;
    canvas.width = width;
    canvas.height = height;

    ctx.clearRect(0, 0, width, height);

    // Render based on stylePreset
    if (stylePreset === 'minimal') {
      // Background
      ctx.fillStyle = '#FAFAFA';
      ctx.fillRect(0, 0, width, height);

      // Subtle geometric grid
      ctx.strokeStyle = '#F1F5F9';
      ctx.lineWidth = 2;
      for (let x = 60; x < width; x += 80) {
        ctx.beginPath();
        ctx.moveTo(x, 0);
        ctx.lineTo(x, height);
        ctx.stroke();
      }

      // Decorative top border bar
      ctx.fillStyle = primaryColor;
      ctx.fillRect(0, 0, width, 14);

      // Tag badge
      if (tag) {
        ctx.fillStyle = accentColor;
        ctx.beginPath();
        ctx.roundRect(100, 100, 200, 52, 26);
        ctx.fill();

        ctx.fillStyle = '#FFFFFF';
        ctx.font = 'bold 24px -apple-system, BlinkMacSystemFont, "PingFang SC", sans-serif';
        ctx.textAlign = 'center';
        ctx.textBaseline = 'middle';
        ctx.fillText(tag, 200, 126);
      }

      // Main Title
      ctx.textAlign = 'left';
      ctx.fillStyle = '#1E293B';
      ctx.font = 'bold 76px -apple-system, BlinkMacSystemFont, "PingFang SC", sans-serif';
      wrapText(ctx, title, 100, tag ? 230 : 180, width - 200, 96, 3);

      // Subtitle
      if (subtitle) {
        ctx.fillStyle = '#64748B';
        ctx.font = '36px -apple-system, BlinkMacSystemFont, "PingFang SC", sans-serif';
        wrapText(ctx, subtitle, 100, height - 160, width - 200, 50, 2);
      }

      // Author & Branding
      ctx.fillStyle = '#94A3B8';
      ctx.font = '500 28px -apple-system, BlinkMacSystemFont, sans-serif';
      ctx.fillText(`✦ ${author}`, 100, height - 70);

      // Right decorative circle
      ctx.beginPath();
      ctx.arc(width - 140, height / 2, 80, 0, Math.PI * 2);
      ctx.strokeStyle = `${accentColor}33`;
      ctx.lineWidth = 16;
      ctx.stroke();
    } else if (stylePreset === 'bold') {
      // Bold Card Contrast Style
      ctx.fillStyle = primaryColor;
      ctx.fillRect(0, 0, width, height);

      // Inner card
      const pad = 60;
      ctx.fillStyle = '#FFFFFF';
      ctx.beginPath();
      ctx.roundRect(pad, pad, width - pad * 2, height - pad * 2, 32);
      ctx.fill();

      // Tag pill
      if (tag) {
        ctx.fillStyle = '#F1F5F9';
        ctx.beginPath();
        ctx.roundRect(120, 120, 180, 48, 12);
        ctx.fill();

        ctx.fillStyle = primaryColor;
        ctx.font = 'bold 22px -apple-system, BlinkMacSystemFont, sans-serif';
        ctx.textAlign = 'center';
        ctx.textBaseline = 'middle';
        ctx.fillText(tag, 210, 144);
      }

      // Title
      ctx.textAlign = 'left';
      ctx.fillStyle = '#0F172A';
      ctx.font = 'bold 78px -apple-system, BlinkMacSystemFont, "PingFang SC", sans-serif';
      wrapText(ctx, title, 120, 240, width - 240, 98, 3);

      // Bottom bar with accent
      ctx.fillStyle = accentColor;
      ctx.fillRect(120, height - 160, 80, 8);

      // Subtitle
      if (subtitle) {
        ctx.fillStyle = '#475569';
        ctx.font = '34px -apple-system, BlinkMacSystemFont, sans-serif';
        ctx.fillText(subtitle, 120, height - 100);
      }
    } else if (stylePreset === 'gradient') {
      // Gradient glow
      const grad = ctx.createLinearGradient(0, 0, width, height);
      grad.addColorStop(0, primaryColor);
      grad.addColorStop(1, '#0F172A');
      ctx.fillStyle = grad;
      ctx.fillRect(0, 0, width, height);

      // Radiant glow circle
      const radial = ctx.createRadialGradient(
        width * 0.8,
        height * 0.2,
        20,
        width * 0.8,
        height * 0.2,
        400
      );
      radial.addColorStop(0, `${accentColor}88`);
      radial.addColorStop(1, 'transparent');
      ctx.fillStyle = radial;
      ctx.fillRect(0, 0, width, height);

      // Tag
      if (tag) {
        ctx.fillStyle = 'rgba(255,255,255,0.15)';
        ctx.beginPath();
        ctx.roundRect(100, 100, 180, 48, 24);
        ctx.fill();

        ctx.fillStyle = '#FFFFFF';
        ctx.font = '600 22px -apple-system, BlinkMacSystemFont, sans-serif';
        ctx.textAlign = 'center';
        ctx.textBaseline = 'middle';
        ctx.fillText(tag, 190, 124);
      }

      // Title
      ctx.textAlign = 'left';
      ctx.fillStyle = '#FFFFFF';
      ctx.font = 'bold 80px -apple-system, BlinkMacSystemFont, "PingFang SC", sans-serif';
      wrapText(ctx, title, 100, 230, width - 200, 100, 3);

      // Subtitle
      if (subtitle) {
        ctx.fillStyle = 'rgba(255,255,255,0.8)';
        ctx.font = '34px -apple-system, BlinkMacSystemFont, sans-serif';
        wrapText(ctx, subtitle, 100, height - 150, width - 200, 50, 2);
      }

      ctx.fillStyle = 'rgba(255,255,255,0.5)';
      ctx.font = '26px sans-serif';
      ctx.fillText(`PUBLISHED BY ${author.toUpperCase()}`, 100, height - 70);
    } else if (stylePreset === 'magazine') {
      // Editorial Magazine
      ctx.fillStyle = '#FAF7F2';
      ctx.fillRect(0, 0, width, height);

      // Border frame
      ctx.strokeStyle = '#D5CEC5';
      ctx.lineWidth = 3;
      ctx.strokeRect(50, 50, width - 100, height - 100);

      // Top line
      ctx.fillStyle = primaryColor;
      ctx.font = 'bold 22px Georgia, serif';
      ctx.textAlign = 'left';
      ctx.fillText(tag.toUpperCase() || 'COLLECTION', 100, 110);

      ctx.textAlign = 'right';
      ctx.fillStyle = '#8C827A';
      ctx.font = '18px Georgia, serif';
      ctx.fillText(new Date().toLocaleDateString('zh-CN'), width - 100, 110);

      // Center divider
      ctx.beginPath();
      ctx.moveTo(100, 130);
      ctx.lineTo(width - 100, 130);
      ctx.strokeStyle = '#E8E2D9';
      ctx.lineWidth = 2;
      ctx.stroke();

      // Title in serif
      ctx.textAlign = 'left';
      ctx.fillStyle = '#2C2623';
      ctx.font = 'bold 74px "Songti SC", Georgia, serif';
      wrapText(ctx, title, 100, 250, width - 200, 96, 3);

      // Subtitle
      if (subtitle) {
        ctx.fillStyle = '#6E645D';
        ctx.font = 'italic 34px Georgia, serif';
        wrapText(ctx, subtitle, 100, height - 150, width - 200, 48, 2);
      }

      ctx.fillStyle = primaryColor;
      ctx.font = 'bold 24px Georgia, serif';
      ctx.fillText(`— ${author}`, 100, height - 80);
    } else {
      // Dark tech
      ctx.fillStyle = '#0F172A';
      ctx.fillRect(0, 0, width, height);

      // Grid dots
      ctx.fillStyle = 'rgba(255,255,255,0.06)';
      for (let x = 40; x < width; x += 40) {
        for (let y = 40; y < height; y += 40) {
          ctx.beginPath();
          ctx.arc(x, y, 1.5, 0, Math.PI * 2);
          ctx.fill();
        }
      }

      // Accent pill
      if (tag) {
        ctx.strokeStyle = accentColor;
        ctx.lineWidth = 2;
        ctx.strokeRect(100, 90, 180, 44);

        ctx.fillStyle = accentColor;
        ctx.font = 'bold 20px "Courier New", monospace';
        ctx.textAlign = 'center';
        ctx.fillText(`// ${tag}`, 190, 118);
      }

      // Title
      ctx.textAlign = 'left';
      ctx.fillStyle = '#F8FAFC';
      ctx.font = 'bold 76px -apple-system, BlinkMacSystemFont, monospace';
      wrapText(ctx, title, 100, 220, width - 200, 94, 3);

      // Subtitle
      if (subtitle) {
        ctx.fillStyle = '#94A3B8';
        ctx.font = '32px -apple-system, BlinkMacSystemFont, sans-serif';
        wrapText(ctx, subtitle, 100, height - 150, width - 200, 48, 2);
      }

      ctx.fillStyle = '#38BDF8';
      ctx.font = 'bold 24px monospace';
      ctx.fillText(`> ${author}`, 100, height - 80);
    }
  }, [isOpen, ratio, title, subtitle, tag, author, stylePreset, primaryColor, accentColor]);

  // Helper function to wrap text neatly on canvas
  function wrapText(
    ctx: CanvasRenderingContext2D,
    text: string,
    x: number,
    y: number,
    maxWidth: number,
    lineHeight: number,
    maxLines: number = 3
  ) {
    if (!text) return;
    const chars = Array.from(text);
    let line = '';
    let currentY = y;
    let lineCount = 0;

    for (let i = 0; i < chars.length; i++) {
      const testLine = line + chars[i];
      const metrics = ctx.measureText(testLine);
      if (metrics.width > maxWidth && i > 0) {
        lineCount++;
        if (lineCount >= maxLines) {
          ctx.fillText(line + '...', x, currentY);
          return;
        }
        ctx.fillText(line, x, currentY);
        line = chars[i];
        currentY += lineHeight;
      } else {
        line = testLine;
      }
    }
    if (line) {
      ctx.fillText(line, x, currentY);
    }
  }

  const handleDownload = () => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    const link = document.createElement('a');
    link.download = `wechat-cover-${ratio === '2.35:1' ? 'banner' : 'square'}-${Date.now()}.png`;
    link.href = canvas.toDataURL('image/png');
    link.click();
  };

  const handleCopy = async () => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    try {
      canvas.toBlob(async (blob) => {
        if (!blob) return;
        if (navigator.clipboard && (window as any).ClipboardItem) {
          await navigator.clipboard.write([
            new ClipboardItem({ 'image/png': blob }),
          ]);
          setCopied(true);
          setTimeout(() => setCopied(false), 2000);
        } else {
          handleDownload();
        }
      });
    } catch {
      handleDownload();
    }
  };

  const handleInsert = () => {
    const canvas = canvasRef.current;
    if (!canvas || !onInsertCoverToArticle) return;
    const dataUri = canvas.toDataURL('image/png');
    onInsertCoverToArticle(dataUri);
    setInserted(true);
    setTimeout(() => {
      setInserted(false);
      onClose();
    }, 1200);
  };

  // Esc 关闭（此前这些弹窗只能点右上角 ×）
  useEscapeKey(isOpen, onClose);

  if (!isOpen) return null;

  return (
    <div role="dialog" aria-modal="true" aria-label="封面生成" onClick={onClose} className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 backdrop-blur-xs p-4 animate-in fade-in duration-200">
      <div onClick={(e) => e.stopPropagation()} className="bg-white rounded-2xl shadow-2xl border border-gray-200 w-full max-w-5xl max-h-[92vh] flex flex-col overflow-hidden">
        {/* Header */}
        <div className="flex items-center justify-between px-6 py-4 border-b border-gray-100 shrink-0">
          <div className="flex items-center gap-3">
            <div className="w-9 h-9 rounded-xl bg-[#07C160]/10 flex items-center justify-center text-[#07C160]">
              <ImageIcon className="w-5 h-5" />
            </div>
            <div>
              <h2 className="text-base font-bold text-[#1E293B]">
                公众号标准尺寸封面生成器
              </h2>
              <p className="text-xs text-[#64748B]">
                支持 2.35:1 头条封面与 1:1 次条方图，支持一键下载或插入正文
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

        {/* Content Body */}
        <div className="flex-1 overflow-y-auto p-6 grid grid-cols-1 lg:grid-cols-12 gap-6">
          {/* Left Canvas Preview (7 cols) */}
          <div className="lg:col-span-7 flex flex-col items-center justify-center bg-[#F8FAFC] rounded-xl p-4 border border-gray-100">
            <div className="w-full flex items-center justify-between mb-3 px-2">
              <span className="text-xs font-semibold text-gray-500 flex items-center gap-1.5">
                <Sparkles className="w-3.5 h-3.5 text-[#07C160]" />
                实时高清预览 ({ratio === '2.35:1' ? '900 × 383 px 头条' : '500 × 500 px 次条'})
              </span>
              <span className="text-[11px] px-2 py-0.5 bg-gray-200/60 rounded text-gray-600 font-mono">
                Retina 2x 采样
              </span>
            </div>

            <div className="w-full flex items-center justify-center min-h-[300px] overflow-hidden">
              <canvas
                ref={canvasRef}
                className="max-w-full max-h-[360px] object-contain rounded-lg shadow-md border border-gray-200 transition-all"
              />
            </div>

            {/* Quick Actions under canvas */}
            <div className="flex items-center gap-3 mt-4 w-full justify-center">
              <button
                onClick={handleDownload}
                className="flex items-center gap-1.5 px-4 py-2 bg-[#07C160] hover:bg-[#06ad56] text-white text-xs font-semibold rounded-lg shadow-xs transition-colors"
              >
                <Download className="w-4 h-4" />
                <span>下载高清封面 (PNG)</span>
              </button>

              <button
                onClick={handleCopy}
                className="flex items-center gap-1.5 px-4 py-2 bg-white hover:bg-gray-50 text-gray-700 text-xs font-semibold border border-gray-200 rounded-lg shadow-2xs transition-colors"
              >
                {copied ? <Check className="w-4 h-4 text-emerald-600" /> : <Copy className="w-4 h-4" />}
                <span>{copied ? '已复制到剪贴板' : '复制到剪贴板'}</span>
              </button>

              {onInsertCoverToArticle && (
                <button
                  onClick={handleInsert}
                  className="flex items-center gap-1.5 px-4 py-2 bg-blue-50 hover:bg-blue-100 text-blue-600 text-xs font-semibold border border-blue-200 rounded-lg transition-colors"
                >
                  {inserted ? <Check className="w-4 h-4" /> : <FileDown className="w-4 h-4" />}
                  <span>{inserted ? '已插入文章开头' : '插入到文章开头'}</span>
                </button>
              )}
            </div>
          </div>

          {/* Right Controls Panel (5 cols) */}
          <div className="lg:col-span-5 flex flex-col space-y-4">
            {/* Ratio selection */}
            <div>
              <label className="text-xs font-bold text-gray-700 block mb-2">
                封面规格尺寸
              </label>
              <div className="grid grid-cols-2 gap-2">
                <button
                  type="button"
                  onClick={() => setRatio('2.35:1')}
                  className={`py-2 px-3 rounded-lg border text-xs font-medium flex items-center justify-center gap-2 transition-all ${
                    ratio === '2.35:1'
                      ? 'border-[#07C160] bg-[#07C160]/10 text-[#07C160] font-bold'
                      : 'border-gray-200 bg-white text-gray-600 hover:bg-gray-50'
                  }`}
                >
                  <Layout className="w-3.5 h-3.5" />
                  <span>头条封面 (2.35:1)</span>
                </button>

                <button
                  type="button"
                  onClick={() => setRatio('1:1')}
                  className={`py-2 px-3 rounded-lg border text-xs font-medium flex items-center justify-center gap-2 transition-all ${
                    ratio === '1:1'
                      ? 'border-[#07C160] bg-[#07C160]/10 text-[#07C160] font-bold'
                      : 'border-gray-200 bg-white text-gray-600 hover:bg-gray-50'
                  }`}
                >
                  <Layout className="w-3.5 h-3.5" />
                  <span>次条方图 (1:1)</span>
                </button>
              </div>
            </div>

            {/* Visual Presets */}
            <div>
              <label className="text-xs font-bold text-gray-700 block mb-2">
                视觉风格模板
              </label>
              <div className="grid grid-cols-3 gap-1.5">
                {(
                  [
                    { id: 'minimal', name: '极简雅致' },
                    { id: 'bold', name: '撞色卡片' },
                    { id: 'gradient', name: '光影弥散' },
                    { id: 'magazine', name: '文艺杂志' },
                    { id: 'dark-tech', name: '极客深色' },
                  ] as const
                ).map((preset) => (
                  <button
                    key={preset.id}
                    type="button"
                    onClick={() => setStylePreset(preset.id)}
                    className={`py-1.5 px-2 rounded-md border text-[11px] transition-all ${
                      stylePreset === preset.id
                        ? 'border-[#07C160] bg-[#07C160]/10 text-[#07C160] font-bold'
                        : 'border-gray-200 bg-white text-gray-600 hover:bg-gray-50'
                    }`}
                  >
                    {preset.name}
                  </button>
                ))}
              </div>
            </div>

            {/* Inputs */}
            <div className="space-y-3">
              <div>
                <label className="text-xs font-bold text-gray-700 block mb-1">
                  文章主标题
                </label>
                <input
                  type="text"
                  value={title}
                  onChange={(e) => setTitle(e.target.value)}
                  className="w-full px-3 py-1.5 text-xs rounded-lg border border-gray-200 focus:outline-none focus:ring-2 focus:ring-[#07C160]"
                  placeholder="输入封面大标题..."
                />
              </div>

              <div>
                <label className="text-xs font-bold text-gray-700 block mb-1">
                  副标题 / 导语精炼
                </label>
                <input
                  type="text"
                  value={subtitle}
                  onChange={(e) => setSubtitle(e.target.value)}
                  className="w-full px-3 py-1.5 text-xs rounded-lg border border-gray-200 focus:outline-none focus:ring-2 focus:ring-[#07C160]"
                  placeholder="输入副标题..."
                />
              </div>

              <div className="grid grid-cols-2 gap-2">
                <div>
                  <label className="text-xs font-bold text-gray-700 block mb-1">
                    分类标签
                  </label>
                  <input
                    type="text"
                    value={tag}
                    onChange={(e) => setTag(e.target.value)}
                    className="w-full px-3 py-1.5 text-xs rounded-lg border border-gray-200 focus:outline-none focus:ring-2 focus:ring-[#07C160]"
                    placeholder="如：干货分享"
                  />
                </div>

                <div>
                  <label className="text-xs font-bold text-gray-700 block mb-1">
                    作者 / 公众号名
                  </label>
                  <input
                    type="text"
                    value={author}
                    onChange={(e) => setAuthor(e.target.value)}
                    className="w-full px-3 py-1.5 text-xs rounded-lg border border-gray-200 focus:outline-none focus:ring-2 focus:ring-[#07C160]"
                    placeholder="如：排版美学"
                  />
                </div>
              </div>
            </div>

            {/* Colors */}
            <div>
              <label className="text-xs font-bold text-gray-700 block mb-1.5">
                主色与辅助色调
              </label>
              <div className="flex items-center gap-3">
                <div className="flex items-center gap-1.5">
                  <input
                    type="color"
                    value={primaryColor}
                    onChange={(e) => setPrimaryColor(e.target.value)}
                    className="w-7 h-7 rounded border border-gray-200 cursor-pointer p-0.5"
                  />
                  <span className="text-xs text-gray-600 font-mono">{primaryColor}</span>
                </div>

                <div className="flex items-center gap-1.5">
                  <input
                    type="color"
                    value={accentColor}
                    onChange={(e) => setAccentColor(e.target.value)}
                    className="w-7 h-7 rounded border border-gray-200 cursor-pointer p-0.5"
                  />
                  <span className="text-xs text-gray-600 font-mono">{accentColor}</span>
                </div>
              </div>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
};
