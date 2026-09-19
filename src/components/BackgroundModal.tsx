import React from 'react';
import { X, Layers, Check, Palette } from 'lucide-react';
import { BackgroundSettings, BackgroundType } from '../types';
import { generateBackgroundCss } from '../services/gzhCompiler';

interface BackgroundModalProps {
  isOpen: boolean;
  onClose: () => void;
  background: BackgroundSettings;
  onChange: (bg: BackgroundSettings) => void;
}

export const BackgroundModal: React.FC<BackgroundModalProps> = ({
  isOpen,
  onClose,
  background,
  onChange,
}) => {
  React.useEffect(() => {
    if (!isOpen) return;
    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.key === 'Escape') onClose();
    };
    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [isOpen, onClose]);

  if (!isOpen) return null;

  const bgPresets: Array<{ id: BackgroundType; name: string; desc: string }> = [
    { id: 'none', name: '纯净底色', desc: '纯色背景，不叠加纹理图案' },
    { id: 'dot-grid', name: '优雅点阵', desc: '规则微小圆点阵列，科技现代感' },
    { id: 'clean-grid', name: '透明方格', desc: '浅淡微格纹，理性工整笔记本感' },
    { id: 'paper-texture', name: '复古纸感', desc: '宣纸/水彩画纸细腻肌理质感' },
    { id: 'diagonal-stripes', name: '极简斜线', desc: '细密对角斜纹，层次丰富' },
    { id: 'warm-grain', name: '柔和微噪', desc: '漫反射暖光微粒，温润护眼' },
  ];

  const quickColors = [
    { name: '纯白', hex: '#ffffff' },
    { name: '微暖象牙', hex: '#fdfbf7' },
    { name: '竹纸微青', hex: '#f6f9f6' },
    { name: '冰霜淡蓝', hex: '#f4f8fc' },
    { name: '暖调宣纸', hex: '#fcf8f2' },
    { name: '极简浅灰', hex: '#f8fafc' },
  ];

  const previewCss = generateBackgroundCss(background);

  return (
    <div
      className="fixed inset-0 bg-black/40 backdrop-blur-xs flex items-center justify-center z-50 p-4"
      onClick={onClose}
    >
      <div
        className="bg-white rounded-2xl shadow-2xl border border-slate-200 w-full max-w-lg overflow-hidden flex flex-col max-h-[90vh] animate-in fade-in zoom-in-95 duration-150"
        onClick={(e) => e.stopPropagation()}
      >
        {/* Header */}
        <div className="px-5 py-4 border-b border-slate-100 flex items-center justify-between">
          <div className="flex items-center space-x-2">
            <div className="w-8 h-8 rounded-full bg-amber-100 text-amber-600 flex items-center justify-center">
              <Layers className="w-4 h-4" />
            </div>
            <div>
              <h3 className="text-sm font-bold text-slate-800">文章背景与底纹设置</h3>
              <p className="text-[11px] text-slate-400">
                支持纸感、点阵与方格纹理，可完整写入正文带入微信后台
              </p>
            </div>
          </div>
          <button
            onClick={onClose}
            className="p-1 rounded-lg text-slate-400 hover:text-slate-700 hover:bg-slate-100 transition-colors"
          >
            <X className="w-4 h-4" />
          </button>
        </div>

        <div className="p-5 overflow-y-auto space-y-5">
          {/* Live Preview Card */}
          <div>
            <label className="text-xs font-bold text-slate-700 block mb-2">实时效果预览</label>
            <div
              className="w-full h-32 rounded-xl border border-slate-200 p-4 flex flex-col justify-center transition-all shadow-inner"
              style={{
                backgroundColor: previewCss.backgroundColor,
                backgroundImage: previewCss.backgroundImage,
                backgroundSize: previewCss.backgroundSize,
              }}
            >
              <div className="text-xs font-bold text-slate-800 flex items-center space-x-1.5 mb-1">
                <span className="w-2 h-2 rounded-full bg-emerald-500" />
                <span>排版样章标题：底纹质感展示</span>
              </div>
              <p className="text-[11px] text-slate-600 line-clamp-2 leading-relaxed">
                底纹纹理作为外层容器的背景样式，在点击「复制到公众号」后会转化为合规的内联样式，完整保留至微信官方编辑器中。
              </p>
            </div>
          </div>

          {/* Preset Styles */}
          <div>
            <label className="text-xs font-bold text-slate-700 block mb-2">底纹纹理类型</label>
            <div className="grid grid-cols-2 sm:grid-cols-3 gap-2">
              {bgPresets.map((preset) => {
                const isSelected = background.type === preset.id;
                return (
                  <button
                    key={preset.id}
                    onClick={() => onChange({ ...background, type: preset.id })}
                    className={`p-3 rounded-xl border text-left transition-all relative ${
                      isSelected
                        ? 'border-amber-500 bg-amber-50/50 ring-1 ring-amber-400'
                        : 'border-slate-200 hover:border-slate-300 bg-white'
                    }`}
                  >
                    {isSelected && (
                      <Check className="w-3.5 h-3.5 text-amber-600 absolute top-2 right-2" />
                    )}
                    <div className="text-xs font-bold text-slate-800 mb-0.5">{preset.name}</div>
                    <div className="text-[10px] text-slate-400 line-clamp-1">{preset.desc}</div>
                  </button>
                );
              })}
            </div>
          </div>

          {/* Color Pickers */}
          <div>
            <label className="text-xs font-bold text-slate-700 block mb-2">背景基底色调</label>
            <div className="flex flex-wrap gap-2 mb-3">
              {quickColors.map((c) => (
                <button
                  key={c.hex}
                  onClick={() => onChange({ ...background, color: c.hex })}
                  className={`flex items-center space-x-1.5 px-2.5 py-1 rounded-lg border text-xs transition-all ${
                    background.color === c.hex
                      ? 'border-slate-800 bg-slate-100 font-semibold'
                      : 'border-slate-200 bg-white text-slate-600'
                  }`}
                >
                  <span
                    className="w-3.5 h-3.5 rounded-full border border-slate-300 shrink-0"
                    style={{ backgroundColor: c.hex }}
                  />
                  <span>{c.name}</span>
                </button>
              ))}
            </div>

            <div className="flex items-center space-x-3 text-xs">
              <div className="flex items-center space-x-1.5">
                <span className="text-slate-500">自定义底色:</span>
                <input
                  type="color"
                  value={background.color}
                  onChange={(e) => onChange({ ...background, color: e.target.value })}
                  className="w-7 h-7 rounded border border-slate-300 cursor-pointer p-0.5"
                />
              </div>

              {background.type !== 'none' && (
                <div className="flex items-center space-x-1.5">
                  <span className="text-slate-500">纹理颜色:</span>
                  <input
                    type="color"
                    value={background.patternColor}
                    onChange={(e) => onChange({ ...background, patternColor: e.target.value })}
                    className="w-7 h-7 rounded border border-slate-300 cursor-pointer p-0.5"
                  />
                </div>
              )}
            </div>
          </div>

          {/* Sliders: Opacity & Scale */}
          {background.type !== 'none' && (
            <div className="space-y-3 bg-slate-50 p-3 rounded-xl border border-slate-100 text-xs">
              <div>
                <div className="flex justify-between text-slate-600 mb-1">
                  <span>纹理深浅 (透明度)</span>
                  <span className="font-mono font-medium">{Math.round(background.opacity * 100)}%</span>
                </div>
                <input
                  type="range"
                  min="0.1"
                  max="1.0"
                  step="0.05"
                  value={background.opacity}
                  onChange={(e) =>
                    onChange({ ...background, opacity: parseFloat(e.target.value) })
                  }
                  className="w-full accent-amber-500"
                />
              </div>

              <div>
                <div className="flex justify-between text-slate-600 mb-1">
                  <span>纹理密度 (缩放尺寸)</span>
                  <span className="font-mono font-medium">{background.scale}px</span>
                </div>
                <input
                  type="range"
                  min="12"
                  max="48"
                  step="2"
                  value={background.scale}
                  onChange={(e) => onChange({ ...background, scale: parseInt(e.target.value) })}
                  className="w-full accent-amber-500"
                />
              </div>
            </div>
          )}

          {/* Toggle write into WeChat HTML */}
          <div className="flex items-center space-x-2 pt-1">
            <input
              type="checkbox"
              id="applyToWechat"
              checked={background.applyToWechat}
              onChange={(e) => onChange({ ...background, applyToWechat: e.target.checked })}
              className="rounded text-amber-600 focus:ring-amber-500 w-4 h-4 cursor-pointer"
            />
            <label htmlFor="applyToWechat" className="text-xs text-slate-700 cursor-pointer select-none">
              将背景纹理写入文章正文（复制到微信公众号时完整带入）
            </label>
          </div>
        </div>

        {/* Footer */}
        <div className="px-5 py-3 bg-slate-50 border-t border-slate-100 flex justify-end">
          <button
            onClick={onClose}
            className="px-4 py-1.5 rounded-lg bg-slate-900 hover:bg-slate-800 text-white text-xs font-medium transition-colors"
          >
            完成设置
          </button>
        </div>
      </div>
    </div>
  );
};
