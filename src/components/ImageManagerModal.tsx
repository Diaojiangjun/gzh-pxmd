import React from 'react';
import { X, Image as ImageIcon, Plus, Trash2, Check, Copy, AlertCircle } from 'lucide-react';
import { ImageAttachment } from '../types';
import { electronBridge } from '../services/electronBridge';

interface ImageManagerModalProps {
  isOpen: boolean;
  onClose: () => void;
  images: ImageAttachment[];
  markdown: string;
  onImportImages: (newImages: ImageAttachment[]) => void;
  onDeleteImage: (id: string) => void;
  onCleanUnreferencedImages: () => void;
  onInsertImageSyntax: (image: ImageAttachment) => void;
}

export const ImageManagerModal: React.FC<ImageManagerModalProps> = ({
  isOpen,
  onClose,
  images,
  markdown,
  onImportImages,
  onDeleteImage,
  onCleanUnreferencedImages,
  onInsertImageSyntax,
}) => {
  const [copiedId, setCopiedId] = React.useState<string | null>(null);

  React.useEffect(() => {
    if (!isOpen) return;
    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.key === 'Escape') onClose();
    };
    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [isOpen, onClose]);

  if (!isOpen) return null;

  const handleSelectImages = async () => {
    try {
      const selected = await electronBridge.selectImages();
      if (selected && selected.length > 0) {
        const newAttachments: ImageAttachment[] = selected.map((s, idx) => ({
          id: `img-${Date.now()}-${idx}`,
          name: s.name,
          url: s.dataUrl,
          size: s.size,
          createdAt: Date.now(),
        }));
        onImportImages(newAttachments);
      }
    } catch (e) {
      console.error('Failed to import images:', e);
    }
  };

  const handleCopySyntax = (img: ImageAttachment) => {
    onInsertImageSyntax(img);
    setCopiedId(img.id);
    setTimeout(() => setCopiedId(null), 1000);
  };

  // Check which images are referenced in markdown
  const unreferencedCount = images.filter((img) => !markdown.includes(img.url)).length;

  return (
    <div
      className="fixed inset-0 bg-black/40 backdrop-blur-xs flex items-center justify-center z-50 p-4"
      onClick={onClose}
    >
      <div
        className="bg-white rounded-2xl shadow-2xl border border-slate-200 w-full max-w-xl overflow-hidden flex flex-col max-h-[85vh] animate-in fade-in zoom-in-95 duration-150"
        onClick={(e) => e.stopPropagation()}
      >
        {/* Header */}
        <div className="px-5 py-4 border-b border-slate-100 flex items-center justify-between">
          <div className="flex items-center space-x-2">
            <div className="w-8 h-8 rounded-full bg-emerald-100 text-emerald-600 flex items-center justify-center">
              <ImageIcon className="w-4 h-4" />
            </div>
            <div>
              <h3 className="text-sm font-bold text-slate-800">图片附件与缓存管理</h3>
              <p className="text-[11px] text-slate-400">
                支持截图直接粘贴、本地图片导入与孤立文件清理
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

        {/* Action Toolbar */}
        <div className="px-5 py-3 bg-slate-50 border-b border-slate-100 flex items-center justify-between">
          <button
            onClick={handleSelectImages}
            className="flex items-center space-x-1.5 px-3 py-1.5 rounded-lg bg-emerald-600 hover:bg-emerald-700 text-white text-xs font-semibold shadow-xs transition-colors"
          >
            <Plus className="w-3.5 h-3.5" />
            <span>导入本地图片</span>
          </button>

          {unreferencedCount > 0 && (
            <button
              onClick={onCleanUnreferencedImages}
              className="flex items-center space-x-1 px-3 py-1.5 rounded-lg text-xs font-medium text-rose-600 hover:bg-rose-50 border border-rose-200 transition-colors"
              title="清理文中已删除或未引用的图片缓存"
            >
              <Trash2 className="w-3.5 h-3.5" />
              <span>一键清理未引用图片 ({unreferencedCount})</span>
            </button>
          )}
        </div>

        {/* Image Grid / List */}
        <div className="flex-1 p-5 overflow-y-auto min-h-[300px]">
          {images.length === 0 ? (
            <div className="h-48 flex flex-col items-center justify-center text-slate-400 space-y-2">
              <ImageIcon className="w-8 h-8 stroke-1 text-slate-300" />
              <p className="text-xs">暂无图片附件</p>
              <p className="text-[11px] text-slate-400">
                可直接在左侧编辑器中按 Ctrl+V 粘贴截图，或点击上方导入
              </p>
            </div>
          ) : (
            <div className="grid grid-cols-2 sm:grid-cols-3 gap-3">
              {images.map((img) => {
                const isReferenced = markdown.includes(img.url);
                const isCopied = copiedId === img.id;
                return (
                  <div
                    key={img.id}
                    className="border border-slate-200 rounded-xl overflow-hidden bg-white hover:shadow-sm transition-all flex flex-col justify-between group"
                  >
                    <div className="h-28 bg-slate-100 flex items-center justify-center overflow-hidden relative">
                      <img
                        src={img.url}
                        alt={img.name}
                        className="max-h-full max-w-full object-contain"
                      />
                      <span
                        className={`absolute top-1.5 left-1.5 text-[9px] px-1.5 py-0.5 rounded font-medium ${
                          isReferenced
                            ? 'bg-emerald-100 text-emerald-700'
                            : 'bg-amber-100 text-amber-700'
                        }`}
                      >
                        {isReferenced ? '已引用' : '未引用'}
                      </span>
                    </div>

                    <div className="p-2.5">
                      <div className="text-xs font-medium text-slate-800 truncate" title={img.name}>
                        {img.name}
                      </div>
                      <div className="text-[10px] text-slate-400 mt-0.5">
                        {img.size ? `${Math.round(img.size / 1024)} KB` : '本地缓存'}
                      </div>

                      <div className="flex items-center space-x-1.5 mt-2.5 pt-2 border-t border-slate-100">
                        <button
                          onClick={() => handleCopySyntax(img)}
                          className={`flex-1 py-1 px-1.5 rounded text-[11px] font-medium flex items-center justify-center space-x-1 transition-colors ${
                            isCopied
                              ? 'bg-emerald-600 text-white'
                              : 'bg-slate-100 hover:bg-slate-200 text-slate-700'
                          }`}
                        >
                          {isCopied ? (
                            <>
                              <Check className="w-3 h-3" />
                              <span>已插入</span>
                            </>
                          ) : (
                            <>
                              <Plus className="w-3 h-3" />
                              <span>插入文章</span>
                            </>
                          )}
                        </button>

                        <button
                          onClick={() => onDeleteImage(img.id)}
                          className="p-1 text-slate-400 hover:text-rose-600 rounded hover:bg-rose-50 transition-colors"
                          title="删除附件"
                        >
                          <Trash2 className="w-3.5 h-3.5" />
                        </button>
                      </div>
                    </div>
                  </div>
                );
              })}
            </div>
          )}
        </div>
      </div>
    </div>
  );
};
