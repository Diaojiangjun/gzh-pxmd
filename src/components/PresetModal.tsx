import React, { useState } from 'react';
import { X, Bookmark, Plus, Trash2, Check, Sparkles } from 'lucide-react';
import { LocalPreset, ThemeConfig, BackgroundSettings } from '../types';

interface PresetModalProps {
  isOpen: boolean;
  onClose: () => void;
  presets: LocalPreset[];
  currentTheme: ThemeConfig;
  currentBackground: BackgroundSettings;
  onSaveCurrentAsPreset: (name: string, signature: string) => void;
  onApplyPreset: (preset: LocalPreset) => void;
  onDeletePreset: (id: string) => void;
}

export const PresetModal: React.FC<PresetModalProps> = ({
  isOpen,
  onClose,
  presets,
  currentTheme,
  currentBackground,
  onSaveCurrentAsPreset,
  onApplyPreset,
  onDeletePreset,
}) => {
  const [newPresetName, setNewPresetName] = useState('');
  const [newSignature, setNewSignature] = useState('作者：设计研究所 · 欢迎关注专栏');
  const [isAdding, setIsAdding] = useState(false);

  React.useEffect(() => {
    if (!isOpen) return;
    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.key === 'Escape') onClose();
    };
    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [isOpen, onClose]);

  if (!isOpen) return null;

  const handleSave = () => {
    if (!newPresetName.trim()) return;
    onSaveCurrentAsPreset(newPresetName.trim(), newSignature);
    setNewPresetName('');
    setIsAdding(false);
  };

  return (
    <div
      className="fixed inset-0 bg-black/40 backdrop-blur-xs flex items-center justify-center z-50 p-4"
      onClick={onClose}
    >
      <div
        className="bg-white rounded-2xl shadow-2xl border border-slate-200 w-full max-w-md overflow-hidden flex flex-col max-h-[85vh] animate-in fade-in zoom-in-95 duration-150"
        onClick={(e) => e.stopPropagation()}
      >
        {/* Header */}
        <div className="px-5 py-4 border-b border-slate-100 flex items-center justify-between">
          <div className="flex items-center space-x-2">
            <div className="w-8 h-8 rounded-full bg-blue-100 text-blue-600 flex items-center justify-center">
              <Bookmark className="w-4 h-4" />
            </div>
            <div>
              <h3 className="text-sm font-bold text-slate-800">排版预设中心</h3>
              <p className="text-[11px] text-slate-400">将色彩、字号、底纹与签名保存为模板快速复用</p>
            </div>
          </div>
          <button
            onClick={onClose}
            className="p-1 rounded-lg text-slate-400 hover:text-slate-700 hover:bg-slate-100 transition-colors"
          >
            <X className="w-4 h-4" />
          </button>
        </div>

        <div className="p-5 overflow-y-auto space-y-4">
          {/* Add Current Config as Preset Form */}
          {!isAdding ? (
            <button
              onClick={() => setIsAdding(true)}
              className="w-full py-2.5 px-4 rounded-xl border-2 border-dashed border-blue-200 hover:border-blue-400 bg-blue-50/50 hover:bg-blue-50 text-blue-700 text-xs font-semibold flex items-center justify-center space-x-1.5 transition-colors"
            >
              <Plus className="w-4 h-4" />
              <span>保存当前排版样式为新预设</span>
            </button>
          ) : (
            <div className="bg-slate-50 border border-slate-200 rounded-xl p-3.5 space-y-2.5 text-xs">
              <div>
                <label className="text-slate-700 font-bold block mb-1">预设名称</label>
                <input
                  type="text"
                  value={newPresetName}
                  onChange={(e) => setNewPresetName(e.target.value)}
                  placeholder="例如：极客周刊风格 / 情感专栏预设"
                  className="w-full px-3 py-1.5 border border-slate-200 rounded-lg bg-white outline-none focus:ring-1 focus:ring-blue-500"
                />
              </div>

              <div>
                <label className="text-slate-700 font-bold block mb-1">默认作者署名</label>
                <input
                  type="text"
                  value={newSignature}
                  onChange={(e) => setNewSignature(e.target.value)}
                  className="w-full px-3 py-1.5 border border-slate-200 rounded-lg bg-white outline-none focus:ring-1 focus:ring-blue-500"
                />
              </div>

              <div className="flex justify-end space-x-2 pt-1">
                <button
                  onClick={() => setIsAdding(false)}
                  className="px-3 py-1 rounded-lg text-slate-500 hover:bg-slate-200 transition-colors"
                >
                  取消
                </button>
                <button
                  onClick={handleSave}
                  disabled={!newPresetName.trim()}
                  className="px-3 py-1 rounded-lg bg-blue-600 hover:bg-blue-700 disabled:opacity-50 text-white font-medium transition-colors"
                >
                  保存预设
                </button>
              </div>
            </div>
          )}

          {/* List of Presets */}
          <div className="space-y-2">
            <span className="text-xs font-bold text-slate-700 block">已存预设列表 ({presets.length})</span>
            {presets.length === 0 ? (
              <div className="py-8 text-center text-slate-400 text-xs">
                暂无保存的预设，点击上方按钮即可将当前配置保存为预设。
              </div>
            ) : (
              presets.map((preset) => (
                <div
                  key={preset.id}
                  className="border border-slate-200 rounded-xl p-3.5 bg-white hover:border-slate-300 hover:shadow-2xs transition-all flex items-center justify-between"
                >
                  <div>
                    <div className="flex items-center space-x-2">
                      <span className="text-xs font-bold text-slate-800">{preset.name}</span>
                      <span
                        className="w-2.5 h-2.5 rounded-full"
                        style={{ backgroundColor: preset.theme.primaryColor }}
                      />
                    </div>
                    <div className="text-[11px] text-slate-400 mt-1">
                      主题: {preset.theme.name} · 底纹: {preset.background.type} · 字号:{' '}
                      {preset.theme.fontSize}
                    </div>
                  </div>

                  <div className="flex items-center space-x-1.5">
                    <button
                      onClick={() => {
                        onApplyPreset(preset);
                        onClose();
                      }}
                      className="px-2.5 py-1 rounded-lg bg-slate-900 hover:bg-slate-800 text-white text-xs font-medium transition-colors"
                    >
                      套用
                    </button>
                    <button
                      onClick={() => onDeletePreset(preset.id)}
                      className="p-1 text-slate-300 hover:text-rose-600 transition-colors"
                      title="删除该预设"
                    >
                      <Trash2 className="w-3.5 h-3.5" />
                    </button>
                  </div>
                </div>
              ))
            )}
          </div>
        </div>
      </div>
    </div>
  );
};
