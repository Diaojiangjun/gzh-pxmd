import React, { useState } from 'react';
import {
  History,
  Clock,
  RotateCcw,
  Copy,
  Check,
  Trash2,
  Plus,
  Eye,
  FileCode,
  Sparkles,
  X,
  AlertCircle,
  FileText,
} from 'lucide-react';
import { HistorySnapshot, SnapshotTrigger } from '../types';

interface HistoryModalProps {
  isOpen: boolean;
  onClose: () => void;
  snapshots: HistorySnapshot[];
  currentArticleId: string;
  currentArticleTitle: string;
  onRestoreSnapshot: (snapshot: HistorySnapshot) => void;
  onCreateManualSnapshot: (note?: string) => void;
  onDeleteSnapshot: (id: string) => void;
  onClearSnapshots: (articleId?: string) => void;
}

export const HistoryModal: React.FC<HistoryModalProps> = ({
  isOpen,
  onClose,
  snapshots,
  currentArticleId,
  currentArticleTitle,
  onRestoreSnapshot,
  onCreateManualSnapshot,
  onDeleteSnapshot,
  onClearSnapshots,
}) => {
  const [selectedSnapshotId, setSelectedSnapshotId] = useState<string | null>(null);
  const [filterMode, setFilterMode] = useState<'current' | 'all'>('current');
  const [copied, setCopied] = useState(false);
  const [snapshotNote, setSnapshotNote] = useState('');
  const [isCreatingSnapshot, setIsCreatingSnapshot] = useState(false);

  React.useEffect(() => {
    if (!isOpen) return;
    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.key === 'Escape') onClose();
    };
    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [isOpen, onClose]);

  if (!isOpen) return null;

  const filteredSnapshots = snapshots.filter((s) => {
    if (filterMode === 'current') {
      return s.articleId === currentArticleId;
    }
    return true;
  });

  const activeSnapshot =
    filteredSnapshots.find((s) => s.id === selectedSnapshotId) ||
    filteredSnapshots[0] ||
    null;

  const getTriggerBadge = (trigger: SnapshotTrigger) => {
    switch (trigger) {
      case 'copy':
        return {
          label: '复制前快照',
          bg: 'bg-[#F0FAF5] text-[#07C160] border-[#07C160]/30',
        };
      case 'manual':
        return {
          label: '手动保存',
          bg: 'bg-blue-50 text-blue-600 border-blue-200',
        };
      case 'switch':
        return {
          label: '切换文章前',
          bg: 'bg-purple-50 text-purple-600 border-purple-200',
        };
      case 'rollback':
        return {
          label: '回滚前归档',
          bg: 'bg-amber-50 text-amber-600 border-amber-200',
        };
      case 'ai':
        return {
          label: 'AI 排版前快照',
          bg: 'bg-emerald-50 text-emerald-600 border-emerald-200',
        };
      case 'auto':
      default:
        return {
          label: '自动快照',
          bg: 'bg-slate-100 text-slate-600 border-slate-200',
        };
    }
  };

  const formatTimeAgo = (timestamp: number) => {
    const seconds = Math.floor((Date.now() - timestamp) / 1000);
    if (seconds < 60) return '刚刚';
    const minutes = Math.floor(seconds / 60);
    if (minutes < 60) return `${minutes} 分钟前`;
    const hours = Math.floor(minutes / 60);
    if (hours < 24) return `${hours} 小时前`;
    const days = Math.floor(hours / 24);
    if (days < 7) return `${days} 天前`;
    const d = new Date(timestamp);
    return `${d.getMonth() + 1}月${d.getDate()}日`;
  };

  const handleCopyContent = async (content: string) => {
    try {
      await navigator.clipboard.writeText(content);
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
    } catch (e) {
      console.warn('复制失败:', e);
    }
  };

  const handleCreateSnapshot = () => {
    onCreateManualSnapshot(snapshotNote || '用户手动备份快照');
    setSnapshotNote('');
    setIsCreatingSnapshot(false);
  };

  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 backdrop-blur-xs p-4 animate-in fade-in select-none font-sans"
      onClick={onClose}
    >
      <div
        className="w-full max-w-4xl h-[620px] bg-white rounded-2xl shadow-2xl flex flex-col overflow-hidden border border-[#E5E7EB]"
        onClick={(e) => e.stopPropagation()}
      >
        {/* Header */}
        <div className="px-6 py-3.5 bg-[#F8FAFC] border-b border-[#E5E7EB] flex items-center justify-between shrink-0">
          <div className="flex items-center gap-2.5">
            <div className="p-2 bg-[#F0FAF5] text-[#07C160] rounded-xl">
              <History className="w-5 h-5" />
            </div>
            <div>
              <div className="flex items-center gap-2">
                <h2 className="text-sm font-bold text-[#2C3E50]">版本时光机 · 历史记录</h2>
                <span className="text-[10px] bg-slate-100 text-slate-600 px-2 py-0.5 rounded font-mono font-medium">
                  {filteredSnapshots.length} 个快照
                </span>
              </div>
              <p className="text-[11px] text-[#94A3B8]">
                自动记录写作编辑足迹，可随时对比预览并一键无损回滚
              </p>
            </div>
          </div>

          <div className="flex items-center gap-2">
            {/* Create manual snapshot button */}
            <button
              onClick={() => setIsCreatingSnapshot(true)}
              className="px-3 py-1.5 bg-white border border-[#E2E8F0] hover:border-[#07C160] hover:text-[#07C160] text-xs font-medium text-[#2C3E50] rounded-lg shadow-2xs flex items-center gap-1.5 transition-colors"
            >
              <Plus className="w-3.5 h-3.5 text-[#07C160]" />
              <span>保存当前为新快照</span>
            </button>

            <button
              onClick={onClose}
              className="p-1.5 text-[#94A3B8] hover:text-[#2C3E50] hover:bg-slate-200/50 rounded-lg transition-colors"
            >
              <X className="w-4 h-4" />
            </button>
          </div>
        </div>

        {/* Modal Body: Two Columns */}
        <div className="flex-1 flex overflow-hidden">
          {/* Left Column: Snapshot List */}
          <div className="w-80 border-r border-[#E5E7EB] bg-[#F8FAFC] flex flex-col shrink-0">
            {/* Filter Toggle */}
            <div className="p-3 border-b border-[#E5E7EB] flex items-center justify-between gap-2 bg-white">
              <div className="flex bg-[#F1F5F9] p-0.5 rounded-lg text-xs font-medium w-full">
                <button
                  onClick={() => setFilterMode('current')}
                  className={`flex-1 py-1 rounded-md transition-all text-center ${
                    filterMode === 'current'
                      ? 'bg-white text-[#07C160] font-semibold shadow-2xs'
                      : 'text-[#64748B] hover:text-[#1E293B]'
                  }`}
                >
                  当前文章
                </button>
                <button
                  onClick={() => setFilterMode('all')}
                  className={`flex-1 py-1 rounded-md transition-all text-center ${
                    filterMode === 'all'
                      ? 'bg-white text-[#2C3E50] font-semibold shadow-2xs'
                      : 'text-[#64748B] hover:text-[#1E293B]'
                  }`}
                >
                  全部历史
                </button>
              </div>
            </div>

            {/* Manual snapshot creation mini panel */}
            {isCreatingSnapshot && (
              <div className="p-3 bg-[#F0FAF5] border-b border-[#07C160]/20 space-y-2 animate-in fade-in">
                <div className="text-xs font-semibold text-[#07C160]">添加快照备注说明：</div>
                <input
                  type="text"
                  value={snapshotNote}
                  onChange={(e) => setSnapshotNote(e.target.value)}
                  placeholder="如：完成首段排版 / 修改配图..."
                  className="w-full text-xs px-2.5 py-1.5 bg-white border border-[#07C160]/40 rounded-lg outline-none text-[#2C3E50]"
                  autoFocus
                />
                <div className="flex justify-end gap-1.5">
                  <button
                    onClick={() => setIsCreatingSnapshot(false)}
                    className="px-2 py-1 text-[11px] text-[#64748B] hover:bg-white rounded"
                  >
                    取消
                  </button>
                  <button
                    onClick={handleCreateSnapshot}
                    className="px-2.5 py-1 text-[11px] bg-[#07C160] text-white rounded font-medium hover:bg-[#06ad56]"
                  >
                    确定保存
                  </button>
                </div>
              </div>
            )}

            {/* List */}
            <div className="flex-1 overflow-y-auto p-2 space-y-1.5">
              {filteredSnapshots.length === 0 ? (
                <div className="h-48 flex flex-col items-center justify-center text-center p-4 text-[#94A3B8]">
                  <Clock className="w-8 h-8 stroke-1 text-[#CBD5E1] mb-2" />
                  <p className="text-xs font-medium text-[#64748B]">暂无历史快照记录</p>
                  <p className="text-[11px] mt-1 text-[#94A3B8]">
                    编辑修改、复制到公众号或手动保存时，系统将自动生成版本快照。
                  </p>
                </div>
              ) : (
                filteredSnapshots.map((item) => {
                  const isSelected = activeSnapshot?.id === item.id;
                  const badge = getTriggerBadge(item.trigger);

                  return (
                    <div
                      key={item.id}
                      onClick={() => setSelectedSnapshotId(item.id)}
                      className={`group p-2.5 rounded-xl border transition-all cursor-pointer relative ${
                        isSelected
                          ? 'bg-white border-[#07C160] shadow-xs'
                          : 'bg-white/60 hover:bg-white border-[#E5E7EB] hover:border-[#CBD5E1]'
                      }`}
                    >
                      <div className="flex items-center justify-between gap-1 mb-1">
                        <span
                          className={`text-[10px] px-1.5 py-0.5 rounded border font-medium ${badge.bg}`}
                        >
                          {badge.label}
                        </span>
                        <span className="text-[11px] text-[#94A3B8] font-mono">
                          {formatTimeAgo(item.timestamp)}
                        </span>
                      </div>

                      <div className="text-xs font-medium text-[#2C3E50] truncate mb-1">
                        {item.note || item.articleTitle || '未命名文章'}
                      </div>

                      <div className="flex items-center justify-between text-[10px] text-[#94A3B8]">
                        <span>
                          {item.charCount} 字符 · {item.lineCount} 行
                        </span>
                        <button
                          onClick={(e) => {
                            e.stopPropagation();
                            onDeleteSnapshot(item.id);
                          }}
                          className="opacity-0 group-hover:opacity-100 text-[#94A3B8] hover:text-[#EF4444] p-0.5 transition-opacity"
                          title="删除此快照"
                        >
                          <Trash2 className="w-3 h-3" />
                        </button>
                      </div>
                    </div>
                  );
                })
              )}
            </div>

            {/* Bottom Clear Option */}
            {filteredSnapshots.length > 0 && (
              <div className="p-2.5 bg-white border-t border-[#E5E7EB] flex items-center justify-between text-[11px]">
                <button
                  onClick={() => {
                    if (confirm('确定清空当前文章的所有历史快照吗？')) {
                      onClearSnapshots(filterMode === 'current' ? currentArticleId : undefined);
                    }
                  }}
                  className="text-[#94A3B8] hover:text-[#EF4444] transition-colors flex items-center gap-1"
                >
                  <Trash2 className="w-3 h-3" />
                  <span>清空历史快照</span>
                </button>
              </div>
            )}
          </div>

          {/* Right Column: Snapshot Detail & Preview */}
          <div className="flex-1 flex flex-col bg-white overflow-hidden">
            {activeSnapshot ? (
              <>
                {/* Snapshot Meta & Actions Bar */}
                <div className="p-4 border-b border-[#E5E7EB] flex items-center justify-between bg-white shrink-0">
                  <div>
                    <div className="flex items-center gap-2 mb-1">
                      <h3 className="text-sm font-bold text-[#2C3E50]">
                        {activeSnapshot.note || activeSnapshot.articleTitle || '快照内容详情'}
                      </h3>
                      <span
                        className={`text-[10px] px-2 py-0.5 rounded border font-medium ${
                          getTriggerBadge(activeSnapshot.trigger).bg
                        }`}
                      >
                        {getTriggerBadge(activeSnapshot.trigger).label}
                      </span>
                    </div>
                    <div className="flex items-center gap-3 text-xs text-[#94A3B8]">
                      <span>
                        保存时间：
                        {new Date(activeSnapshot.timestamp).toLocaleString('zh-CN', {
                          hour12: false,
                        })}
                      </span>
                      <span>·</span>
                      <span>{activeSnapshot.charCount} 字符</span>
                      <span>·</span>
                      <span>{activeSnapshot.lineCount} 行</span>
                    </div>
                  </div>

                  <div className="flex items-center gap-2">
                    {/* Copy snapshot content */}
                    <button
                      onClick={() => handleCopyContent(activeSnapshot.content)}
                      className="px-3 py-1.5 text-xs font-medium border border-[#E2E8F0] rounded-lg hover:bg-[#F8FAFC] text-[#2C3E50] shadow-2xs flex items-center gap-1.5 transition-colors"
                      title="复制此版本快照内容"
                    >
                      {copied ? (
                        <>
                          <Check className="w-3.5 h-3.5 text-[#07C160]" />
                          <span className="text-[#07C160]">已复制</span>
                        </>
                      ) : (
                        <>
                          <Copy className="w-3.5 h-3.5 text-[#64748B]" />
                          <span>复制内容</span>
                        </>
                      )}
                    </button>

                    {/* Restore button */}
                    <button
                      onClick={() => {
                        if (
                          confirm(
                            `确认将当前文章恢复到该历史版本（${new Date(
                              activeSnapshot.timestamp
                            ).toLocaleTimeString()}）吗？当前正在编辑的内容将自动备份保存为新快照。`
                          )
                        ) {
                          onRestoreSnapshot(activeSnapshot);
                          onClose();
                        }
                      }}
                      className="px-4 py-1.5 text-xs font-semibold bg-[#07C160] hover:bg-[#06ad56] text-white rounded-lg shadow-xs flex items-center gap-1.5 transition-colors"
                      title="恢复回滚到此历史版本"
                    >
                      <RotateCcw className="w-3.5 h-3.5" />
                      <span>恢复此版本</span>
                    </button>
                  </div>
                </div>

                {/* View Tabs：目前只有 Markdown 源码一种视图，去掉不可交互的假按钮 */}
                <div className="px-4 py-2 bg-[#F8FAFC] border-b border-[#F1F5F9] flex items-center justify-between text-xs">
                  <div className="flex items-center gap-2">
                    <span className="text-[#64748B] font-medium">查看方式：</span>
                    <span className="px-2.5 py-1 rounded-md bg-white text-[#2C3E50] font-semibold shadow-2xs border border-[#E2E8F0]">
                      Markdown 源码
                    </span>
                  </div>

                  <span className="text-[11px] text-[#94A3B8]">
                    恢复后会无缝载入编辑器，且自动备份当前草稿
                  </span>
                </div>

                {/* Content View Container */}
                <div className="flex-1 overflow-y-auto p-4 font-mono text-xs text-[#1E293B] leading-relaxed bg-white">
                  <pre className="whitespace-pre-wrap font-mono select-text">
                    {activeSnapshot.content}
                  </pre>
                </div>
              </>
            ) : (
              <div className="flex-1 flex flex-col items-center justify-center text-[#94A3B8]">
                <FileText className="w-10 h-10 text-[#CBD5E1] stroke-1 mb-2" />
                <p className="text-xs font-medium text-[#64748B]">请在左侧选择一个历史快照进行查看</p>
              </div>
            )}
          </div>
        </div>

        {/* Footer info */}
        <div className="px-6 py-2.5 bg-[#F8FAFC] border-t border-[#E5E7EB] text-[11px] text-[#94A3B8] flex items-center justify-between shrink-0">
          <span>
            提示：每次点击“复制到公众号”或切换文章时，系统均会自动留存版本快照，无需担心内容丢失。
          </span>
          <button
            onClick={onClose}
            className="px-3 py-1 bg-white border border-[#E2E8F0] hover:bg-gray-100 rounded text-[#2C3E50] font-medium transition-colors"
          >
            关闭
          </button>
        </div>
      </div>
    </div>
  );
};
