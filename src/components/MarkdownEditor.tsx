import React, { useRef, useEffect, useState, useMemo, useCallback } from 'react';
import { ImageAttachment } from '../types';
import { cleanDataUri, optimizeStickerFile } from '../utils/imageOptimizer';
import { Search, ArrowUp, ArrowDown, X, CaseSensitive } from 'lucide-react';

interface MarkdownEditorProps {
  content: string;
  onChange: (value: string) => void;
  onScrollSync?: (percentage: number) => void;
  onImagePasted?: (image: ImageAttachment) => void;
  textareaRef: React.RefObject<HTMLTextAreaElement | null>;
  activeThemeName?: string;
  showLineNumbers?: boolean;
  /** 编辑器深色模式 */
  dark?: boolean;
  /**
   * 图片上传钩子：传入 base64 dataUrl，返回最终写入 Markdown 的 URL。
   * 未启用图床时回传原 dataUrl；启用时由 App 上传后返回 https 外链。
   */
  onUploadImage?: (dataUrl: string, fileName: string) => Promise<string>;
}

export const MarkdownEditor: React.FC<MarkdownEditorProps> = ({
  content,
  onChange,
  onScrollSync,
  onImagePasted,
  textareaRef,
  activeThemeName = '经典黑灰',
  showLineNumbers = true,
  dark = false,
  onUploadImage,
}) => {
  const lineNumbersRef = useRef<HTMLDivElement>(null);
  const searchInputRef = useRef<HTMLInputElement>(null);

  // ---- 搜索替换状态 ----
  const [showSearch, setShowSearch] = useState(false);
  const [searchTerm, setSearchTerm] = useState('');
  const [replaceTerm, setReplaceTerm] = useState('');
  const [caseSensitive, setCaseSensitive] = useState(false);
  const [matchIndex, setMatchIndex] = useState(0);

  // Compute line numbers and stats
  const lines = content.split('\n');
  const lineCount = Math.max(lines.length, 1);
  const charCount = content.length;

  // 计算所有匹配位置
  const matchPositions = useMemo(() => {
    if (!searchTerm) return [] as number[];
    const positions: number[] = [];
    const hay = caseSensitive ? content : content.toLowerCase();
    const needle = caseSensitive ? searchTerm : searchTerm.toLowerCase();
    let idx = 0;
    while ((idx = hay.indexOf(needle, idx)) !== -1) {
      positions.push(idx);
      idx += needle.length;
    }
    return positions;
  }, [content, searchTerm, caseSensitive]);

  // 匹配数变化时重置索引
  useEffect(() => {
    setMatchIndex(0);
  }, [searchTerm, caseSensitive]);

  // 高亮跳转到第 index 个匹配
  const jumpToMatch = useCallback(
    (index: number) => {
      const target = textareaRef.current;
      if (!target || matchPositions.length === 0) return;
      const pos = matchPositions[index] ?? matchPositions[0];
      target.focus();
      target.setSelectionRange(pos, pos + searchTerm.length);
    },
    [textareaRef, matchPositions, searchTerm]
  );

  const goNext = () => {
    if (matchPositions.length === 0) return;
    const next = (matchIndex + 1) % matchPositions.length;
    setMatchIndex(next);
    jumpToMatch(next);
  };

  const goPrev = () => {
    if (matchPositions.length === 0) return;
    const prev = (matchIndex - 1 + matchPositions.length) % matchPositions.length;
    setMatchIndex(prev);
    jumpToMatch(prev);
  };

  // 替换当前匹配
  const replaceCurrent = () => {
    const target = textareaRef.current;
    if (!target || matchPositions.length === 0) return;
    const pos = matchPositions[matchIndex];
    const newVal =
      content.substring(0, pos) + replaceTerm + content.substring(pos + searchTerm.length);
    onChange(newVal);
    setTimeout(() => {
      target.focus();
      target.setSelectionRange(pos, pos + replaceTerm.length);
    }, 0);
  };

  // 全部替换
  const replaceAll = () => {
    if (!searchTerm) return;
    const hay = caseSensitive ? content : content.toLowerCase();
    const needle = caseSensitive ? searchTerm : searchTerm.toLowerCase();
    if (!hay.includes(needle)) return;
    const escaped = searchTerm.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
    const flags = caseSensitive ? 'g' : 'gi';
    // 用函数返回替换文本，避免 replaceTerm 中的 $ 被正则引擎当特殊变量解析
    const newVal = content.replace(new RegExp(escaped, flags), () => replaceTerm);
    onChange(newVal);
  };

  // 关闭搜索栏
  const closeSearch = () => {
    setShowSearch(false);
    setSearchTerm('');
    setReplaceTerm('');
    textareaRef.current?.focus();
  };

  // Synchronize scroll between textarea and line numbers gutter + preview
  const handleScroll = () => {
    if (!textareaRef.current) return;
    const { scrollTop, scrollHeight, clientHeight } = textareaRef.current;
    if (lineNumbersRef.current) {
      lineNumbersRef.current.scrollTop = scrollTop;
    }
    const maxScroll = scrollHeight - clientHeight;
    if (maxScroll > 0 && onScrollSync) {
      onScrollSync(scrollTop / maxScroll);
    }
  };

  // Handle Tab key + Markdown formatting shortcuts
  const handleKeyDown = (e: React.KeyboardEvent<HTMLTextAreaElement>) => {
    if (e.key === 'Tab') {
      e.preventDefault();
      const target = e.currentTarget;
      const start = target.selectionStart;
      const end = target.selectionEnd;
      const val = target.value;
      const newVal = val.substring(0, start) + '  ' + val.substring(end);
      onChange(newVal);

      // Restore cursor position after state update
      setTimeout(() => {
        target.selectionStart = target.selectionEnd = start + 2;
      }, 0);
      return;
    }

    const mod = e.ctrlKey || e.metaKey;
    if (!mod) return;

    const target = e.currentTarget;
    const start = target.selectionStart;
    const end = target.selectionEnd;
    const sel = target.value.substring(start, end);

    const key = e.key.toLowerCase();

    // Ctrl/Cmd + F 打开搜索栏
    if (key === 'f') {
      e.preventDefault();
      setShowSearch(true);
      setTimeout(() => searchInputRef.current?.focus(), 0);
      return;
    }
    // Ctrl/Cmd + H 打开搜索并聚焦替换框
    if (key === 'h') {
      e.preventDefault();
      setShowSearch(true);
      return;
    }

    // 在选中内容（或占位文字）两侧包裹/取消标记，如 **加粗** / *斜体* / `代码`
    const toggleMarker = (marker: string, placeholder: string) => {
      e.preventDefault();
      const before = target.value.substring(0, start);
      const after = target.value.substring(end);
      const isWrapped = before.endsWith(marker) && after.startsWith(marker);
      let newVal: string;
      let selStart: number;
      let selEnd: number;
      if (isWrapped && sel) {
        newVal = before.slice(0, before.length - marker.length) + sel + after.slice(marker.length);
        selStart = start - marker.length;
        selEnd = end - marker.length;
      } else {
        const text = sel || placeholder;
        newVal = before + marker + text + marker + after;
        selStart = start + marker.length;
        selEnd = selStart + text.length;
      }
      onChange(newVal);
      setTimeout(() => {
        target.focus();
        target.selectionStart = selStart;
        target.selectionEnd = selEnd;
      }, 0);
    };

    // Ctrl/Cmd + K 插入链接（选中内容作为链接文字，光标定位到 URL 处）
    const insertLink = () => {
      e.preventDefault();
      const text = sel || '链接文字';
      const newVal =
        target.value.substring(0, start) + `[${text}](https://)` + target.value.substring(end);
      onChange(newVal);
      const urlStart = start + text.length + 3;
      setTimeout(() => {
        target.focus();
        target.selectionStart = urlStart;
        target.selectionEnd = urlStart + 8;
      }, 0);
    };

    if (key === 'b') toggleMarker('**', '加粗文字');
    else if (key === 'i') toggleMarker('*', '斜体文字');
    else if (key === 'e') toggleMarker('`', '代码');
    else if (key === 'k') insertLink();
  };

  // Handle Ctrl+V paste (especially image screenshots)
  const handlePaste = async (e: React.ClipboardEvent<HTMLTextAreaElement>) => {
    const items = e.clipboardData.items;
    for (let i = 0; i < items.length; i++) {
      if (items[i].type.indexOf('image') !== -1) {
        e.preventDefault();
        const file = items[i].getAsFile();
        if (file) {
          try {
            const opt = await optimizeStickerFile(file, 640);
            const safeDataUrl = cleanDataUri(opt.dataUrl);
            const newImage: ImageAttachment = {
              id: 'img-' + Date.now(),
              name: `截图-${new Date().toLocaleTimeString().replace(/:/g, '')}.png`,
              url: safeDataUrl,
              size: opt.size,
              createdAt: Date.now(),
            };

            onImagePasted?.(newImage);

            // Insert markdown image syntax at cursor（启用图床时先上传为外链）
            const target = textareaRef.current;
            if (target) {
              const start = target.selectionStart;
              const end = target.selectionEnd;
              const val = target.value;
              const finalUrl = onUploadImage
                ? await onUploadImage(safeDataUrl, newImage.name)
                : safeDataUrl;
              const insertText = `\n![${newImage.name}](${finalUrl})\n`;
              const newVal = val.substring(0, start) + insertText + val.substring(end);
              onChange(newVal);

              setTimeout(() => {
                target.focus();
                target.selectionStart = target.selectionEnd = start + insertText.length;
              }, 0);
            }
          } catch (err) {
            console.error('Failed to process pasted image:', err);
          }
        }
        break;
      }
    }
  };

  // Handle Drag & Drop of image files into editor
  const handleDrop = async (e: React.DragEvent<HTMLTextAreaElement>) => {
    e.preventDefault();
    const files = Array.from(e.dataTransfer.files || []);
    if (files.length > 0) {
      const file = files[0];
      if (file.type.startsWith('image/') || /\.(png|jpe?g|gif|webp|svg|ico|bmp)$/i.test(file.name)) {
        try {
          const opt = await optimizeStickerFile(file, 640);
          const safeDataUrl = cleanDataUri(opt.dataUrl);
          const newImage: ImageAttachment = {
            id: 'img-' + Date.now(),
            name: file.name,
            url: safeDataUrl,
            size: opt.size,
            createdAt: Date.now(),
          };

          onImagePasted?.(newImage);

          const target = textareaRef.current;
          if (target) {
            const start = target.selectionStart;
            const end = target.selectionEnd;
            const val = target.value;
            const finalUrl = onUploadImage
              ? await onUploadImage(safeDataUrl, file.name)
              : safeDataUrl;
            const insertText = `\n![${file.name}](${finalUrl})\n`;
            const newVal = val.substring(0, start) + insertText + val.substring(end);
            onChange(newVal);

            setTimeout(() => {
              target.focus();
              target.selectionStart = target.selectionEnd = start + insertText.length;
            }, 0);
          }
        } catch (err) {
          console.error('Failed to process dropped image:', err);
        }
      }
    }
  };

  const handleDragOver = (e: React.DragEvent<HTMLTextAreaElement>) => {
    e.preventDefault();
  };

  return (
    <div className={`flex-1 flex flex-col overflow-hidden ${dark ? 'bg-[#0F172A]' : 'bg-white'}`}>
      {/* 搜索/替换栏 */}
      {showSearch && (
        <div
          className={`px-3 py-2 border-b flex flex-wrap items-center gap-x-2 gap-y-1.5 shrink-0 text-xs ${
            dark ? 'bg-[#1E293B] border-[#334155]' : 'bg-[#F8FAFC] border-[#F1F5F9]'
          }`}
        >
          <div className="flex items-center gap-1.5">
            <Search className={`w-3.5 h-3.5 ${dark ? 'text-[#64748B]' : 'text-[#94A3B8]'}`} />
            <input
              ref={searchInputRef}
              value={searchTerm}
              onChange={(e) => setSearchTerm(e.target.value)}
              onKeyDown={(e) => {
                if (e.key === 'Enter') (e.shiftKey ? goPrev() : goNext());
                if (e.key === 'Escape') closeSearch();
              }}
              placeholder="查找"
              className={`w-32 rounded-md border px-2 py-1 text-xs focus:outline-none focus:ring-2 focus:ring-[#07C160]/30 ${
                dark
                  ? 'bg-[#0F172A] border-[#334155] text-[#E2E8F0] placeholder-[#64748B]'
                  : 'bg-white border-[#E2E8F0] text-[#1E293B] placeholder-[#94A3B8]'
              }`}
            />
            <span className={`min-w-12 text-[11px] ${dark ? 'text-[#94A3B8]' : 'text-[#94A3B8]'}`}>
              {searchTerm ? (matchPositions.length > 0 ? `${matchIndex + 1}/${matchPositions.length}` : '无匹配') : ''}
            </span>
            <button
              onClick={goPrev}
              title="上一个 (Shift+Enter)"
              className={`p-1 rounded ${dark ? 'hover:bg-[#334155] text-[#94A3B8]' : 'hover:bg-white text-[#64748B]'} transition-colors`}
            >
              <ArrowUp className="w-3.5 h-3.5" />
            </button>
            <button
              onClick={goNext}
              title="下一个 (Enter)"
              className={`p-1 rounded ${dark ? 'hover:bg-[#334155] text-[#94A3B8]' : 'hover:bg-white text-[#64748B]'} transition-colors`}
            >
              <ArrowDown className="w-3.5 h-3.5" />
            </button>
            <button
              onClick={() => setCaseSensitive(!caseSensitive)}
              title="区分大小写"
              className={`p-1 rounded transition-colors ${
                caseSensitive
                  ? 'bg-[#F0FAF5] text-[#07C160]'
                  : dark
                  ? 'text-[#94A3B8] hover:bg-[#334155]'
                  : 'text-[#94A3B8] hover:bg-white'
              }`}
            >
              <CaseSensitive className="w-3.5 h-3.5" />
            </button>
            <button
              onClick={closeSearch}
              title="关闭 (Esc)"
              className={`p-1 rounded ${dark ? 'hover:bg-[#334155] text-[#94A3B8]' : 'hover:bg-white text-[#64748B]'} transition-colors`}
            >
              <X className="w-3.5 h-3.5" />
            </button>
          </div>

          <div className={`flex items-center gap-1.5 border-l pl-2 ${dark ? 'border-[#334155]' : 'border-[#E2E8F0]'}`}>
            <input
              value={replaceTerm}
              onChange={(e) => setReplaceTerm(e.target.value)}
              onKeyDown={(e) => {
                if (e.key === 'Enter') replaceCurrent();
                if (e.key === 'Escape') closeSearch();
              }}
              placeholder="替换为"
              className={`w-28 rounded-md border px-2 py-1 text-xs focus:outline-none focus:ring-2 focus:ring-[#07C160]/30 ${
                dark
                  ? 'bg-[#0F172A] border-[#334155] text-[#E2E8F0] placeholder-[#64748B]'
                  : 'bg-white border-[#E2E8F0] text-[#1E293B] placeholder-[#94A3B8]'
              }`}
            />
            <button
              onClick={replaceCurrent}
              className="px-2 py-1 rounded-md border border-[#E2E8F0] text-[#64748B] hover:text-[#2C3E50] transition-colors"
            >
              替换
            </button>
            <button
              onClick={replaceAll}
              className="px-2 py-1 rounded-md bg-[#07C160] text-white hover:bg-[#06ad56] font-medium transition-colors"
            >
              全部替换
            </button>
          </div>
        </div>
      )}

      {/* Editor Body */}
      <div className="flex-1 flex overflow-hidden relative">
        {/* Line Numbers Gutter */}
        <div
          ref={lineNumbersRef}
          className={`w-10 py-4 border-r select-none text-right pr-2.5 font-mono text-xs leading-6 overflow-hidden shrink-0 ${
            dark ? 'bg-[#0F172A] border-[#1E293B] text-[#475569]' : 'bg-white border-[#F1F5F9] text-[#CBD5E1]'
          } ${showLineNumbers ? 'hidden sm:block' : 'hidden'}`}
        >
          {Array.from({ length: lineCount }).map((_, idx) => (
            <div key={idx}>{idx + 1}</div>
          ))}
        </div>

        {/* Editor Main Textarea */}
        <div className="flex-1 relative h-full">
          <textarea
            ref={textareaRef}
            value={content}
            onChange={(e) => onChange(e.target.value)}
            onScroll={handleScroll}
            onKeyDown={handleKeyDown}
            onPaste={handlePaste}
            onDrop={handleDrop}
            onDragOver={handleDragOver}
            spellCheck={false}
            title="快捷键：Ctrl+F 查找 · Ctrl+H 替换 · Ctrl+B 加粗 · Ctrl+I 斜体 · Ctrl+E 行内代码 · Ctrl+K 链接 · Tab 缩进 · Ctrl+V 粘贴截图"
            placeholder="在此输入或粘贴 Markdown 内容，支持直接 Ctrl+V 粘贴截图..."
            className={`w-full h-full p-4 font-mono text-sm leading-6 bg-transparent resize-none outline-none border-none selection:bg-[#E6F7ED] selection:text-[#07C160] ${
              dark ? 'text-[#E2E8F0]' : 'text-[#1E293B]'
            }`}
          />
        </div>
      </div>

      {/* Bottom Editor Status Bar */}
      <div
        className={`px-4 py-2 border-t text-[11px] flex items-center justify-between select-none shrink-0 ${
          dark ? 'bg-[#0B1220] border-[#1E293B] text-[#64748B]' : 'bg-[#F8FAFC] border-[#F1F5F9] text-[#94A3B8]'
        }`}
      >
        <span>字符数: {charCount} | 行数: {lineCount}</span>
        <span className="truncate max-w-[200px]">当前主题: {activeThemeName}</span>
      </div>
    </div>
  );
};
