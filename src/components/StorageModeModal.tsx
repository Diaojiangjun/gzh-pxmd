import React from 'react';
import {
  X,
  FolderOpen,
  Database,
  Check,
  AlertCircle,
  Loader2,
  ExternalLink,
  ScanSearch,
  Trash2,
  TriangleAlert,
} from 'lucide-react';
import { useEscapeKey } from '../hooks/useEscapeKey';
import { storageService } from '../services/storageService';

interface StorageConfigInfo {
  mode: 'browser' | 'folder';
  folderPath: string;
  folderUsable: boolean;
  fileCount: number;
}

interface StorageModeModalProps {
  isOpen: boolean;
  onClose: () => void;
  /** 当前文章，用于首次启用文件夹模式时迁移 */
  articles: Array<{ title: string; content: string }>;
}

/**
 * 存储模式设置
 *
 * 对标 WeMD：文章可以存在软件内置存储里，也可以直接读写本地文件夹中的 Markdown 文件。
 * 差异：WeMD 是 Web 版，靠浏览器授权目录；这里是 Electron，直接用系统文件夹选择器，
 * 定位与读写都更可靠，也不会因为「清理站点数据」而失效。
 */
export const StorageModeModal: React.FC<StorageModeModalProps> = ({ isOpen, onClose, articles }) => {
  const [config, setConfig] = React.useState<StorageConfigInfo>({
    mode: 'browser',
    folderPath: '',
    folderUsable: false,
    fileCount: 0,
  });
  const [busy, setBusy] = React.useState(false);
  const [msg, setMsg] = React.useState<{ type: 'success' | 'error'; text: string } | null>(null);

  // ---- 重复文件清理（只处理历史遗留的 `X (2).md` 之类）----
  const [dupGroups, setDupGroups] = React.useState<Array<{
    base: string;
    files: Array<{ id: string; size: number; mtime: number; preview: string }>;
  }> | null>(null);
  const [dupChecked, setDupChecked] = React.useState<Set<string>>(new Set());
  const [dupScanning, setDupScanning] = React.useState(false);
  const [dupBusy, setDupBusy] = React.useState(false);
  const [dupConfirm, setDupConfirm] = React.useState(false);
  const [dupMsg, setDupMsg] = React.useState<string | null>(null);

  // Esc 关闭。注意：hook 必须早于下面的条件早退，否则弹窗开合会改变 hook 数量导致崩溃
  useEscapeKey(isOpen, onClose);

  React.useEffect(() => {
    if (!isOpen) return;
    try {
      const cfg = window.electronAPI?.storageGetConfigSync?.();
      if (cfg) setConfig(cfg);
    } catch {
      // 读取失败时保持默认（浏览器存储）
    }
    setMsg(null);
    setDupGroups(null);
    setDupChecked(new Set());
    setDupConfirm(false);
    setDupMsg(null);
  }, [isOpen]);

  if (!isOpen) return null;

  const isFolderMode = config.mode === 'folder';
  const folderReady = config.folderUsable && !!config.folderPath;

  /** 切换成功后的统一收尾：提示 + 重载（让启动流程重新读取文章与模式） */
  const finish = (text: string) => {
    setMsg({ type: 'success', text });
    setTimeout(() => window.location.reload(), 800);
  };

  const switchToFolder = async () => {
    if (busy) return;
    setBusy(true);
    setMsg(null);
    try {
      let folderPath = config.folderPath;

      // 尚未选择 / 原路径已失效 → 重新选一个
      if (!folderReady) {
        const picked = await window.electronAPI!.storagePickFolder();
        if (picked.canceled || !picked.path) {
          setBusy(false);
          return;
        }
        folderPath = picked.path;
      }

      const res = await window.electronAPI!.storageSetMode({
        mode: 'folder',
        folderPath,
        // 迁移现有文章：同名文件会被跳过，不覆盖文件夹里已有的内容
        migrate: articles.map((a) => ({ title: a.title, content: a.content })),
      });

      if (!res.ok) {
        setMsg({ type: 'error', text: res.error || '切换失败' });
        setBusy(false);
        return;
      }

      const parts = [`已启用本地文件夹模式，共 ${res.fileCount ?? 0} 篇 Markdown`];
      if (res.migrated) {
        parts.push(`迁移 ${res.migrated} 篇`);
        if (res.skipped) parts.push(`跳过同名 ${res.skipped} 篇`);
      }
      finish(parts.join('，'));
    } catch (e) {
      setMsg({ type: 'error', text: (e as Error)?.message || '切换失败' });
      setBusy(false);
    }
  };

  const switchToBrowser = async () => {
    if (busy) return;
    setBusy(true);
    setMsg(null);
    try {
      const res = await window.electronAPI!.storageSetMode({ mode: 'browser' });
      if (!res.ok) {
        setMsg({ type: 'error', text: res.error || '切换失败' });
        setBusy(false);
        return;
      }
      finish('已切换回软件内置存储');
    } catch (e) {
      setMsg({ type: 'error', text: (e as Error)?.message || '切换失败' });
      setBusy(false);
    }
  };

  const openFolder = () => {
    void window.electronAPI?.storageOpenFolder?.();
  };

  // ---- 重复文件清理 ----

  const formatSize = (bytes: number) => {
    if (bytes < 1024) return `${bytes} B`;
    if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`;
    return `${(bytes / 1024 / 1024).toFixed(2)} MB`;
  };

  const formatTime = (ms: number) => {
    if (!ms) return '—';
    const d = new Date(ms);
    const p = (n: number) => String(n).padStart(2, '0');
    return `${d.getFullYear()}-${p(d.getMonth() + 1)}-${p(d.getDate())} ${p(d.getHours())}:${p(d.getMinutes())}`;
  };

  /** 扫描重复文件（只读）。默认勾选「每组里除最晚修改之外」的文件 */
  const scanDup = async () => {
    if (dupScanning) return;
    setDupScanning(true);
    setDupMsg(null);
    setDupConfirm(false);
    try {
      const groups = await storageService.scanDuplicates();
      setDupGroups(groups);
      const checked = new Set<string>();
      for (const g of groups) {
        const newest = g.files.reduce((a, b) => (b.mtime > a.mtime ? b : a), g.files[0]);
        for (const f of g.files) if (f.id !== newest.id) checked.add(f.id);
      }
      setDupChecked(checked);
      setDupMsg(groups.length === 0 ? '未发现重复文件 ✓' : null);
    } finally {
      setDupScanning(false);
    }
  };

  const toggleDup = (id: string) => {
    setDupConfirm(false);
    setDupChecked((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  };

  const trashChecked = async () => {
    const ids = Array.from(dupChecked);
    if (ids.length === 0 || dupBusy) return;
    setDupBusy(true);
    setDupMsg(null);
    try {
      const res = await storageService.trashDuplicates(ids);
      if (res.trashed === 0 && !res.ok) {
        setDupMsg(`清理失败：${res.error || '未知错误'}`);
      } else {
        setDupMsg(
          `已移入系统回收站 ${res.trashed} 个文件（可从回收站恢复）` +
            (res.failed.length ? `，${res.failed.length} 个失败` : '')
        );
      }
    } catch (e) {
      setDupMsg(`清理失败：${(e as Error)?.message || '未知错误'}`);
    } finally {
      setDupBusy(false);
      setDupConfirm(false);
      // 重新扫描，刷新列表
      try {
        const groups = await storageService.scanDuplicates();
        setDupGroups(groups);
        setDupChecked(new Set());
      } catch {
        setDupGroups(null);
      }
    }
  };

  return (
    <div
      role="dialog"
      aria-modal="true"
      aria-label="存储模式"
      onClick={onClose}
      className="fixed inset-0 z-[70] flex items-center justify-center bg-black/50 backdrop-blur-xs p-4"
    >
      <div
        onClick={(e) => e.stopPropagation()}
        className="bg-white rounded-2xl shadow-2xl border border-gray-200 w-full max-w-xl max-h-[88vh] flex flex-col overflow-hidden"
      >
        {/* Header */}
        <div className="flex items-start justify-between px-6 pt-5 pb-4 border-b border-gray-100 shrink-0">
          <div>
            <h2 className="text-base font-bold text-slate-800">存储模式</h2>
            <p className="text-xs text-slate-500 mt-1">
              选择文章保存在本地文件夹中，或直接使用软件内置存储
            </p>
          </div>
          <button
            onClick={onClose}
            aria-label="关闭"
            className="p-1.5 -mr-1 rounded-lg text-slate-400 hover:text-slate-600 hover:bg-slate-100 transition-colors"
          >
            <X className="w-4 h-4" />
          </button>
        </div>

        {/* Body */}
        <div className="px-6 py-5 space-y-3 overflow-y-auto">
          {/* 本地文件夹 */}
          <button
            onClick={switchToFolder}
            disabled={busy}
            className={`w-full text-left p-4 rounded-xl border transition-all disabled:opacity-60 ${
              isFolderMode
                ? 'border-emerald-500 bg-emerald-50/40 ring-1 ring-emerald-400'
                : 'border-slate-200 hover:border-slate-300 hover:bg-slate-50/60'
            }`}
          >
            <div className="flex items-start gap-3">
              <span className="shrink-0 w-9 h-9 rounded-lg bg-slate-100 flex items-center justify-center text-slate-600">
                <FolderOpen className="w-4.5 h-4.5" />
              </span>
              <div className="flex-1 min-w-0">
                <div className="flex items-center gap-2">
                  <span className="text-sm font-bold text-slate-800">本地文件夹</span>
                  {isFolderMode && (
                    <span className="px-1.5 py-0.5 rounded bg-emerald-600 text-white text-[10px] font-medium">
                      当前
                    </span>
                  )}
                </div>
                <p className="text-xs text-slate-600 mt-1.5 leading-relaxed">
                  直接读写指定文件夹中的 Markdown 文件，每篇文章一个 <code className="text-slate-500">.md</code>
                  ，可以用 Git 或任意编辑器管理。
                </p>
                <p className="flex items-start gap-1 text-[11px] text-slate-400 mt-2 leading-relaxed">
                  <AlertCircle className="w-3 h-3 mt-0.5 shrink-0" />
                  文件夹被移动、重命名或删除后，需要重新选择。
                </p>

                {folderReady && (
                  <div className="mt-3 flex items-center gap-2 flex-wrap">
                    <span className="px-2 py-1 rounded bg-slate-100 text-[11px] text-slate-600 font-mono truncate max-w-[320px]">
                      {config.folderPath}
                    </span>
                    <span className="text-[11px] text-slate-400">{config.fileCount} 个文件</span>
                    <span
                      role="button"
                      tabIndex={0}
                      onClick={(e) => {
                        e.stopPropagation();
                        openFolder();
                      }}
                      onKeyDown={(e) => {
                        if (e.key === 'Enter' || e.key === ' ') {
                          e.stopPropagation();
                          openFolder();
                        }
                      }}
                      className="inline-flex items-center gap-1 text-[11px] text-emerald-700 hover:text-emerald-800 font-medium cursor-pointer"
                    >
                      <ExternalLink className="w-3 h-3" />
                      打开文件夹
                    </span>
                  </div>
                )}
              </div>
              {isFolderMode && <Check className="w-4 h-4 text-emerald-600 shrink-0 mt-1" />}
            </div>
          </button>

          {/* 软件内置存储 */}
          <button
            onClick={switchToBrowser}
            disabled={busy}
            className={`w-full text-left p-4 rounded-xl border transition-all disabled:opacity-60 ${
              !isFolderMode
                ? 'border-emerald-500 bg-emerald-50/40 ring-1 ring-emerald-400'
                : 'border-slate-200 hover:border-slate-300 hover:bg-slate-50/60'
            }`}
          >
            <div className="flex items-start gap-3">
              <span className="shrink-0 w-9 h-9 rounded-lg bg-slate-100 flex items-center justify-center text-slate-600">
                <Database className="w-4.5 h-4.5" />
              </span>
              <div className="flex-1 min-w-0">
                <div className="flex items-center gap-2">
                  <span className="text-sm font-bold text-slate-800">软件内置存储</span>
                  {!isFolderMode && (
                    <span className="px-1.5 py-0.5 rounded bg-emerald-600 text-white text-[10px] font-medium">
                      当前
                    </span>
                  )}
                </div>
                <p className="text-xs text-slate-600 mt-1.5 leading-relaxed">
                  文章保存在软件自身的本地数据中，关闭软件后仍会保留，无需额外指定位置。
                </p>
                <p className="flex items-start gap-1 text-[11px] text-slate-400 mt-2 leading-relaxed">
                  <AlertCircle className="w-3 h-3 mt-0.5 shrink-0" />
                  卸载软件或清理应用数据会删除文章，请定期导出备份。
                </p>
              </div>
              {!isFolderMode && <Check className="w-4 h-4 text-emerald-600 shrink-0 mt-1" />}
            </div>
          </button>

          {/* 状态条 */}
          {msg ? (
            <div
              className={`px-4 py-3 rounded-xl text-xs font-medium ${
                msg.type === 'success'
                  ? 'bg-emerald-50 text-emerald-800 border border-emerald-200'
                  : 'bg-red-50 text-red-700 border border-red-200'
              }`}
            >
              {msg.text}
            </div>
          ) : (
            <div className="px-4 py-3 rounded-xl bg-emerald-50 text-xs text-emerald-800 border border-emerald-200 flex items-center gap-2">
              {busy && <Loader2 className="w-3.5 h-3.5 animate-spin" />}
              {busy
                ? '正在切换存储模式…'
                : isFolderMode
                  ? `已启用本地文件夹模式${folderReady ? `：${config.folderPath}` : ''}`
                  : '已启用软件内置存储模式'}
            </div>
          )}

          {/* 重复文件清理（仅本地文件夹模式） */}
          {isFolderMode && folderReady && (
            <div className="rounded-xl border border-slate-200 overflow-hidden">
              <div className="flex items-start justify-between gap-3 px-4 py-3 bg-slate-50/70">
                <div className="min-w-0">
                  <div className="text-xs font-bold text-slate-700">重复文件清理</div>
                  <p className="text-[11px] text-slate-500 mt-0.5 leading-relaxed">
                    旧版本曾把同一篇文章存成{' '}
                    <code className="text-slate-500">标题.md</code>、
                    <code className="text-slate-500">标题 (2).md</code> … 这里可以扫出来清理。
                  </p>
                </div>
                <button
                  onClick={scanDup}
                  disabled={dupScanning || dupBusy}
                  className="shrink-0 inline-flex items-center gap-1 px-2.5 py-1.5 rounded-lg bg-white border border-slate-300 text-[11px] font-medium text-slate-700 hover:bg-slate-50 disabled:opacity-60 transition-colors"
                >
                  {dupScanning ? (
                    <Loader2 className="w-3 h-3 animate-spin" />
                  ) : (
                    <ScanSearch className="w-3 h-3" />
                  )}
                  扫描
                </button>
              </div>

              {dupGroups !== null && dupGroups.length > 0 && (
                <div className="px-4 py-3 space-y-3 border-t border-slate-100">
                  {dupGroups.map((group) => {
                    const newest = group.files.reduce(
                      (a, b) => (b.mtime > a.mtime ? b : a),
                      group.files[0]
                    );
                    return (
                      <div key={group.base} className="space-y-1.5">
                        <div className="text-[11px] font-semibold text-slate-600 truncate">
                          {group.base}
                        </div>
                        {group.files.map((file) => {
                          const isKept = file.id === newest.id;
                          return (
                            <label
                              key={file.id}
                              className="flex items-start gap-2 text-[11px] cursor-pointer"
                            >
                              <input
                                type="checkbox"
                                checked={isKept ? false : dupChecked.has(file.id)}
                                disabled={isKept || dupBusy}
                                onChange={() => toggleDup(file.id)}
                                className="mt-0.5 accent-red-600"
                              />
                              <div className="flex-1 min-w-0">
                                <div className="flex items-center gap-2">
                                  <span
                                    className={`font-mono truncate flex-1 ${
                                      isKept ? 'text-emerald-700' : 'text-slate-600'
                                    }`}
                                  >
                                    {file.id}
                                  </span>
                                  <span className="text-slate-400 shrink-0">
                                    {formatSize(file.size)}
                                  </span>
                                  <span className="text-slate-400 shrink-0">
                                    {formatTime(file.mtime)}
                                  </span>
                                  {isKept && (
                                    <span className="shrink-0 text-emerald-600 font-medium">
                                      保留
                                    </span>
                                  )}
                                </div>
                                <div className="text-slate-400 mt-0.5 truncate">
                                  {file.preview || '（空文件）'}
                                </div>
                              </div>
                            </label>
                          );
                        })}
                      </div>
                    );
                  })}

                  <div className="pt-1">
                    {dupConfirm ? (
                      <div className="rounded-lg border border-red-200 bg-red-50 px-3 py-2.5 space-y-2">
                        <p className="text-[11px] font-bold text-red-700 leading-relaxed">
                          ⚠️ 即将把 {dupChecked.size} 个文件移入系统回收站（可恢复）。
                          请先确认勾选的确实是同一篇文章的历史副本——若两篇正文内容不同，请取消勾选。
                        </p>
                        <div className="flex items-center gap-2">
                          <button
                            onClick={trashChecked}
                            disabled={dupBusy}
                            className="inline-flex items-center gap-1 px-2.5 py-1.5 rounded-lg bg-red-600 text-white text-[11px] font-medium hover:bg-red-700 disabled:opacity-60 transition-colors"
                          >
                            {dupBusy ? (
                              <Loader2 className="w-3 h-3 animate-spin" />
                            ) : (
                              <Trash2 className="w-3 h-3" />
                            )}
                            确认移入回收站
                          </button>
                          <button
                            onClick={() => setDupConfirm(false)}
                            disabled={dupBusy}
                            className="px-2.5 py-1.5 rounded-lg text-[11px] text-slate-600 hover:bg-slate-100 transition-colors"
                          >
                            取消
                          </button>
                        </div>
                      </div>
                    ) : (
                      <div className="flex items-center gap-3 flex-wrap">
                        <button
                          onClick={() => setDupConfirm(true)}
                          disabled={dupChecked.size === 0 || dupBusy}
                          className="inline-flex items-center gap-1 px-2.5 py-1.5 rounded-lg bg-white border border-slate-300 text-[11px] font-medium text-slate-700 hover:bg-slate-50 disabled:opacity-50 transition-colors"
                        >
                          <Trash2 className="w-3 h-3" />
                          移入回收站（{dupChecked.size}）
                        </button>
                        <span className="inline-flex items-center gap-1 text-[11px] text-slate-400">
                          <TriangleAlert className="w-3 h-3" />
                          默认保留每组里最新修改的那个
                        </span>
                      </div>
                    )}
                  </div>
                </div>
              )}

              {dupMsg && (
                <div className="px-4 py-2.5 border-t border-slate-100 text-[11px] text-slate-600">
                  {dupMsg}
                </div>
              )}
            </div>
          )}
        </div>
      </div>
    </div>
  );
};
