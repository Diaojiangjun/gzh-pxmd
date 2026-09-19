import React, { useState } from 'react';
import {
  X,
  Smile,
  Plus,
  FolderPlus,
  Trash2,
  RefreshCw,
  Sparkles,
  Check,
  Search,
  Loader2,
  Upload,
} from 'lucide-react';
import { StickerItem } from '../types';
import { electronBridge } from '../services/electronBridge';
import { optimizeStickerFile, cleanDataUri } from '../utils/imageOptimizer';

interface StickerModalProps {
  isOpen: boolean;
  onClose: () => void;
  stickers: StickerItem[];
  onInsertSticker: (sticker: StickerItem, mode: 'small' | 'original') => void;
  onAddCustomStickers: (newStickers: StickerItem[]) => void;
  onDeleteSticker: (id: string) => void;
  onResetDefaultStickers: () => void;
}

export const StickerModal: React.FC<StickerModalProps> = ({
  isOpen,
  onClose,
  stickers,
  onInsertSticker,
  onAddCustomStickers,
  onDeleteSticker,
  onResetDefaultStickers,
}) => {
  const [activeTab, setActiveTab] = useState<'picker' | 'manage'>('picker');
  const [insertMode, setInsertMode] = useState<'small' | 'original'>('small');
  const [selectedCategory, setSelectedCategory] = useState<string>('全部');
  const [searchKeyword, setSearchKeyword] = useState<string>('');
  const [justInsertedId, setJustInsertedId] = useState<string | null>(null);
  const [isImporting, setIsImporting] = useState<boolean>(false);
  const [importStatus, setImportStatus] = useState<string | null>(null);
  const [isDraggingOver, setIsDraggingOver] = useState<boolean>(false);

  React.useEffect(() => {
    if (!isOpen) return;
    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.key === 'Escape') onClose();
    };
    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [isOpen, onClose]);

  if (!isOpen) return null;

  const categories = ['全部', '搞怪', '职场', '萌宠', '互动', '干货', '自定义'];

  const filteredStickers = stickers.filter((s) => {
    const matchesCategory =
      selectedCategory === '全部'
        ? true
        : selectedCategory === '自定义'
        ? s.category === '自定义' || s.id.startsWith('custom-')
        : s.category === selectedCategory;

    const matchesSearch =
      searchKeyword.trim() === ''
        ? true
        : s.name.toLowerCase().includes(searchKeyword.toLowerCase().trim());

    return matchesCategory && matchesSearch;
  });

  const handleStickerClick = (sticker: StickerItem) => {
    onInsertSticker(sticker, insertMode);
    setJustInsertedId(sticker.id);
    setTimeout(() => {
      setJustInsertedId(null);
    }, 1200);
  };

  // Process a list of File objects into stickers
  const processFilesToStickers = async (files: File[]) => {
    const imageFiles = files.filter(
      (f) => f.type.startsWith('image/') || /\.(png|jpe?g|gif|webp|svg|ico|bmp)$/i.test(f.name)
    );
    if (imageFiles.length === 0) {
      setImportStatus('未检测到有效的图片文件（支持 WebP、PNG、JPG、GIF、SVG）');
      setTimeout(() => setImportStatus(null), 3000);
      return;
    }

    setIsImporting(true);
    setImportStatus(`正在处理优化 ${imageFiles.length} 个表情...`);

    try {
      const newStickers: StickerItem[] = [];
      for (let i = 0; i < imageFiles.length; i++) {
        const file = imageFiles[i];
        const opt = await optimizeStickerFile(file, 360);
        newStickers.push({
          id: `custom-${Date.now()}-${i}-${Math.random().toString(36).substring(2, 6)}`,
          name: opt.name,
          category: '自定义',
          url: cleanDataUri(opt.dataUrl),
          isGif: opt.isGif,
        });
      }

      if (newStickers.length > 0) {
        onAddCustomStickers(newStickers);
        setSelectedCategory('自定义');
        setImportStatus(`成功导入 ${newStickers.length} 个表情！已切换至自定义分类`);
        setTimeout(() => setImportStatus(null), 3000);
      }
    } catch (err: any) {
      console.error('Failed to process sticker files:', err);
      setImportStatus(`导入失败: ${err?.message || '未知错误'}`);
      setTimeout(() => setImportStatus(null), 4000);
    } finally {
      setIsImporting(false);
    }
  };

  // Import single or multiple image files
  const handleImportImages = async () => {
    setIsImporting(true);
    setImportStatus('正在选择图片...');
    try {
      const results = await electronBridge.selectImages();
      if (results && results.length > 0) {
        const newStickers: StickerItem[] = results.map((r, idx) => ({
          id: `custom-${Date.now()}-${idx}-${Math.random().toString(36).substring(2, 6)}`,
          name: r.name.replace(/\.[^/.]+$/, ''),
          category: '自定义',
          url: cleanDataUri(r.dataUrl),
          isGif: r.name.toLowerCase().endsWith('.gif'),
        }));
        onAddCustomStickers(newStickers);
        setSelectedCategory('自定义');
        setImportStatus(`成功导入 ${newStickers.length} 个表情！`);
        setTimeout(() => setImportStatus(null), 3000);
      } else {
        setImportStatus(null);
      }
    } catch (err: any) {
      console.error('Failed to import sticker images:', err);
      setImportStatus(`导入失败: ${err?.message || '未知错误'}`);
      setTimeout(() => setImportStatus(null), 4000);
    } finally {
      setIsImporting(false);
    }
  };

  // Import entire folder of stickers
  const handleImportFolder = async () => {
    setIsImporting(true);
    setImportStatus('正在读取表情包文件夹...');
    try {
      const results = await electronBridge.selectStickerFolder();
      if (results && results.length > 0) {
        const newStickers: StickerItem[] = results.map((r, idx) => ({
          id: `custom-folder-${Date.now()}-${idx}-${Math.random().toString(36).substring(2, 6)}`,
          name: r.name,
          category: '自定义',
          url: cleanDataUri(r.dataUrl),
          isGif: r.isGif,
        }));
        onAddCustomStickers(newStickers);
        setSelectedCategory('自定义');
        setImportStatus(`成功导入文件夹中 ${newStickers.length} 个表情！`);
        setTimeout(() => setImportStatus(null), 3000);
      } else {
        setImportStatus(null);
      }
    } catch (err: any) {
      console.error('Failed to import sticker folder:', err);
      setImportStatus(`导入失败: ${err?.message || '未知错误'}`);
      setTimeout(() => setImportStatus(null), 4000);
    } finally {
      setIsImporting(false);
    }
  };

  // Drag and drop handler
  const handleDrop = async (e: React.DragEvent) => {
    e.preventDefault();
    setIsDraggingOver(false);
    const files = Array.from(e.dataTransfer.files || []);
    if (files.length > 0) {
      await processFilesToStickers(files);
    }
  };

  return (
    <div
      className="fixed inset-0 bg-black/40 backdrop-blur-xs flex items-center justify-center z-50 p-4"
      onClick={onClose}
    >
      <div
        className="bg-white rounded-2xl shadow-2xl border border-slate-200 w-full max-w-xl overflow-hidden flex flex-col max-h-[85vh] animate-in fade-in zoom-in-95 duration-150 relative"
        onClick={(e) => e.stopPropagation()}
        onDragOver={(e) => {
          e.preventDefault();
          setIsDraggingOver(true);
        }}
        onDragLeave={() => setIsDraggingOver(false)}
        onDrop={handleDrop}
      >
        {/* Drag Overlay */}
        {isDraggingOver && (
          <div className="absolute inset-0 bg-pink-500/10 backdrop-blur-xs border-2 border-dashed border-pink-500 rounded-2xl z-50 flex flex-col items-center justify-center p-6 text-center animate-in fade-in">
            <div className="w-14 h-14 rounded-full bg-pink-100 text-pink-600 flex items-center justify-center mb-3">
              <Upload className="w-7 h-7" />
            </div>
            <p className="text-sm font-bold text-pink-700">释放文件即可一键导入表情包</p>
            <p className="text-xs text-pink-500 mt-1">支持 WebP、PNG、JPG、GIF、SVG 等图片格式</p>
          </div>
        )}

        {/* Modal Top Header */}
        <div className="px-5 py-4 border-b border-slate-100 flex items-center justify-between">
          <div className="flex items-center space-x-2">
            <div className="w-8 h-8 rounded-full bg-pink-100 text-pink-600 flex items-center justify-center">
              <Smile className="w-4 h-4" />
            </div>
            <div>
              <h3 className="text-sm font-bold text-slate-800">表情包素材中心</h3>
              <p className="text-[11px] text-slate-400">
                像聊天一样快捷插入表情，支持 GIF 动图与自定义本地库
              </p>
            </div>
          </div>

          <div className="flex items-center space-x-2">
            {/* Tab switch */}
            <div className="flex items-center bg-slate-100 p-0.5 rounded-lg text-xs">
              <button
                onClick={() => setActiveTab('picker')}
                className={`px-3 py-1 rounded-md transition-all ${
                  activeTab === 'picker'
                    ? 'bg-white text-slate-900 font-medium shadow-xs'
                    : 'text-slate-500 hover:text-slate-800'
                }`}
              >
                表情选择
              </button>
              <button
                onClick={() => setActiveTab('manage')}
                className={`px-3 py-1 rounded-md transition-all ${
                  activeTab === 'manage'
                    ? 'bg-white text-slate-900 font-medium shadow-xs'
                    : 'text-slate-500 hover:text-slate-800'
                }`}
              >
                素材管理
              </button>
            </div>

            <button
              onClick={onClose}
              className="p-1 rounded-lg text-slate-400 hover:text-slate-700 hover:bg-slate-100 transition-colors"
            >
              <X className="w-4 h-4" />
            </button>
          </div>
        </div>

        {/* Import Status Banner */}
        {importStatus && (
          <div className="bg-pink-50 border-b border-pink-100 px-5 py-2.5 text-xs text-pink-700 flex items-center justify-between animate-in fade-in duration-150">
            <div className="flex items-center space-x-2">
              {isImporting && <Loader2 className="w-3.5 h-3.5 animate-spin text-pink-600" />}
              <span className="font-medium">{importStatus}</span>
            </div>
            {!isImporting && (
              <button
                onClick={() => setImportStatus(null)}
                className="text-pink-400 hover:text-pink-600 p-0.5 rounded"
              >
                <X className="w-3.5 h-3.5" />
              </button>
            )}
          </div>
        )}

        {/* Tab 1: Sticker Picker */}
        {activeTab === 'picker' && (
          <div className="flex flex-col flex-1 overflow-hidden">
            {/* Mode Toggle Bar: Small (inline) vs Original (centered) */}
            <div className="px-5 py-2.5 bg-slate-50/70 border-b border-slate-100 flex items-center justify-between">
              <div className="flex items-center space-x-2 text-xs">
                <span className="text-slate-500 font-medium">插入模式：</span>
                <div className="inline-flex bg-slate-200/70 p-0.5 rounded-md">
                  <button
                    onClick={() => setInsertMode('small')}
                    className={`px-2.5 py-1 rounded text-xs transition-all ${
                      insertMode === 'small'
                        ? 'bg-white text-pink-600 font-semibold shadow-2xs'
                        : 'text-slate-600 hover:text-slate-900'
                    }`}
                    title="小图模式：24px 行内表情，与正文文字平齐紧随"
                  >
                    小图模式 (行内 24px)
                  </button>
                  <button
                    onClick={() => setInsertMode('original')}
                    className={`px-2.5 py-1 rounded text-xs transition-all ${
                      insertMode === 'original'
                        ? 'bg-white text-pink-600 font-semibold shadow-2xs'
                        : 'text-slate-600 hover:text-slate-900'
                    }`}
                    title="原图模式：居中卡片展示，适合表情包配图插画"
                  >
                    原图模式 (居中大图)
                  </button>
                </div>
              </div>

              {/* Search input */}
              <div className="relative w-36">
                <Search className="w-3.5 h-3.5 absolute left-2 top-2 text-slate-400" />
                <input
                  type="text"
                  placeholder="搜索表情..."
                  value={searchKeyword}
                  onChange={(e) => setSearchKeyword(e.target.value)}
                  className="w-full pl-7 pr-2 py-1 text-xs border border-slate-200 rounded-md bg-white focus:outline-none focus:ring-1 focus:ring-pink-500"
                />
              </div>
            </div>

            {/* Category tabs */}
            <div className="px-5 pt-2 pb-1 border-b border-slate-100 flex items-center space-x-1 overflow-x-auto text-xs">
              {categories.map((cat) => (
                <button
                  key={cat}
                  onClick={() => setSelectedCategory(cat)}
                  className={`px-2.5 py-1 rounded-full whitespace-nowrap transition-colors ${
                    selectedCategory === cat
                      ? 'bg-pink-500 text-white font-medium'
                      : 'text-slate-600 hover:bg-slate-100'
                  }`}
                >
                  {cat}
                </button>
              ))}
            </div>

            {/* Sticker Grid List */}
            <div className="flex-1 p-5 overflow-y-auto min-h-[300px]">
              {filteredStickers.length === 0 ? (
                <div className="h-48 flex flex-col items-center justify-center text-slate-400 space-y-2">
                  <Smile className="w-8 h-8 stroke-1 text-slate-300" />
                  <p className="text-xs">暂无匹配的表情包</p>
                  <button
                    onClick={handleImportImages}
                    className="text-xs text-pink-600 hover:underline flex items-center space-x-1"
                  >
                    <Plus className="w-3.5 h-3.5" />
                    <span>立即导入自定义图片</span>
                  </button>
                </div>
              ) : (
                <div className="grid grid-cols-4 sm:grid-cols-6 gap-3">
                  {filteredStickers.map((sticker) => {
                    const isJustInserted = justInsertedId === sticker.id;
                    return (
                      <button
                        key={sticker.id}
                        onClick={() => handleStickerClick(sticker)}
                        className={`group p-2 rounded-xl border transition-all flex flex-col items-center justify-center relative hover:scale-105 hover:shadow-md ${
                          isJustInserted
                            ? 'border-pink-500 bg-pink-50 ring-2 ring-pink-200'
                            : 'border-slate-100 hover:border-pink-200 bg-white'
                        }`}
                        title={`点击插入: ${sticker.name} (${insertMode === 'small' ? '小图' : '原图'})`}
                      >
                        {sticker.isGif && (
                          <span className="absolute top-1 right-1 text-[9px] font-bold px-1 rounded bg-slate-800 text-white leading-tight">
                            GIF
                          </span>
                        )}

                        {isJustInserted && (
                          <span className="absolute inset-0 bg-pink-500/80 rounded-xl flex items-center justify-center text-white font-bold text-xs animate-in fade-in">
                            <Check className="w-4 h-4" />
                          </span>
                        )}

                        <div className="w-14 h-14 flex items-center justify-center overflow-hidden">
                          <img
                            src={sticker.url}
                            alt={sticker.name}
                            className="max-w-full max-h-full object-contain pointer-events-none"
                            loading="lazy"
                          />
                        </div>
                        <span className="text-[11px] text-slate-600 group-hover:text-pink-600 truncate w-full text-center mt-1 font-medium">
                          {sticker.name}
                        </span>
                      </button>
                    );
                  })}
                </div>
              )}
            </div>

            {/* Bottom Tip */}
            <div className="px-5 py-2.5 bg-slate-50 border-t border-slate-100 flex items-center justify-between text-[11px] text-slate-500">
              <span>💡 提示：点击即可插入到光标所在处，表情包完全离线加载。</span>
              <button
                onClick={() => setActiveTab('manage')}
                className="text-pink-600 hover:underline font-medium"
              >
                + 导入更多表情
              </button>
            </div>
          </div>
        )}

        {/* Tab 2: Sticker Management */}
        {activeTab === 'manage' && (
          <div className="flex flex-col flex-1 p-5 overflow-y-auto">
            {/* Import Actions Bar */}
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-3 mb-5">
              <button
                onClick={handleImportImages}
                disabled={isImporting}
                className="p-4 rounded-xl border border-dashed border-pink-300 hover:border-pink-500 bg-pink-50/50 hover:bg-pink-50 text-pink-700 flex items-center justify-center space-x-2 transition-colors disabled:opacity-50 disabled:cursor-not-allowed cursor-pointer"
              >
                {isImporting ? <Loader2 className="w-4 h-4 animate-spin" /> : <Plus className="w-4 h-4" />}
                <span className="text-xs font-semibold">导入本地表情图片 (WebP/PNG/JPG/GIF/SVG)</span>
              </button>

              <button
                onClick={handleImportFolder}
                disabled={isImporting}
                className="p-4 rounded-xl border border-dashed border-slate-300 hover:border-slate-500 bg-slate-50/50 hover:bg-slate-100 text-slate-700 flex items-center justify-center space-x-2 transition-colors disabled:opacity-50 disabled:cursor-not-allowed cursor-pointer"
              >
                {isImporting ? <Loader2 className="w-4 h-4 animate-spin text-amber-500" /> : <FolderPlus className="w-4 h-4 text-amber-500" />}
                <span className="text-xs font-semibold">导入整个表情包文件夹</span>
              </button>
            </div>

            {/* Existing Custom Stickers List */}
            <div className="flex items-center justify-between mb-2">
              <h4 className="text-xs font-bold text-slate-700">
                素材库清单 (共 {stickers.length} 个表情)
              </h4>
              <button
                onClick={onResetDefaultStickers}
                className="text-xs text-slate-400 hover:text-rose-600 flex items-center space-x-1"
                title="恢复为初始官方精选表情包"
              >
                <RefreshCw className="w-3 h-3" />
                <span>恢复默认素材</span>
              </button>
            </div>

            <div className="flex-1 border border-slate-100 rounded-xl overflow-hidden divide-y divide-slate-100 max-h-72 overflow-y-auto">
              {stickers.map((st) => (
                <div
                  key={st.id}
                  className="px-3 py-2 flex items-center justify-between hover:bg-slate-50 transition-colors"
                >
                  <div className="flex items-center space-x-3">
                    <img
                      src={st.url}
                      alt={st.name}
                      className="w-8 h-8 object-contain rounded bg-slate-100"
                    />
                    <div>
                      <div className="text-xs font-medium text-slate-800">{st.name}</div>
                      <div className="text-[10px] text-slate-400">分类: {st.category}</div>
                    </div>
                  </div>

                  <button
                    onClick={() => onDeleteSticker(st.id)}
                    className="p-1.5 text-slate-300 hover:text-rose-600 rounded hover:bg-rose-50 transition-colors"
                    title="删除该表情"
                  >
                    <Trash2 className="w-3.5 h-3.5" />
                  </button>
                </div>
              ))}
            </div>
          </div>
        )}
      </div>
    </div>
  );
};
