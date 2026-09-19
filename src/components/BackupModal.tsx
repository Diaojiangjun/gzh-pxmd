import React, { useState, useEffect, useRef } from 'react';
import { useEscapeKey } from '../hooks/useEscapeKey';
import {
  X,
  Download,
  Upload,
  Database,
  HardDrive,
  FileJson,
  CheckCircle2,
  AlertCircle,
  FileText,
  Smile,
  Image as ImageIcon,
  Bookmark,
  Layers,
  Sparkles,
  RefreshCw,
  FolderOpen,
} from 'lucide-react';
import { storageService } from '../services/storageService';
import { dbService, FullBackupData } from '../services/dbService';
import { electronBridge } from '../services/electronBridge';

interface BackupModalProps {
  isOpen: boolean;
  onClose: () => void;
  onDataRestored?: () => void;
}

export const BackupModal: React.FC<BackupModalProps> = ({
  isOpen,
  onClose,
  onDataRestored,
}) => {
  const [storageStats, setStorageStats] = useState<{
    usedBytes: number;
    quotaBytes: number;
    formattedUsed: string;
    formattedQuota: string;
    percentage: number;
  }>({
    usedBytes: 0,
    quotaBytes: 0,
    formattedUsed: '检测中...',
    formattedQuota: '...',
    percentage: 0,
  });

  const [articlesCount, setArticlesCount] = useState(0);
  const [stickersCount, setStickersCount] = useState(0);
  const [imagesCount, setImagesCount] = useState(0);
  const [presetsCount, setPresetsCount] = useState(0);
  const [componentsCount, setComponentsCount] = useState(0);
  const [snapshotsCount, setSnapshotsCount] = useState(0);

  const [isImporting, setIsImporting] = useState(false);
  const [importStatus, setImportStatus] = useState<{
    type: 'success' | 'error' | null;
    message: string;
  }>({ type: null, message: '' });

  const [dataDirMsg, setDataDirMsg] = useState('');

  const fileInputRef = useRef<HTMLInputElement>(null);

  // 打开数据目录（userData）
  const handleOpenDataDirectory = async () => {
    const result = await electronBridge.openDataDirectory();
    if (result.ok) {
      setDataDirMsg(`已打开数据目录：${result.path}`);
    } else {
      setDataDirMsg(result.error || '打开数据目录失败');
    }
  };

  // Load current stats
  const refreshStats = async () => {
    try {
      const articles = storageService.getArticles();
      const stickers = storageService.getCustomStickers();
      const images = storageService.getImageAttachments();
      const presets = storageService.getSavedPresets();
      const components = storageService.getCustomComponents();
      const snapshots = storageService.getSnapshots();

      setArticlesCount(articles.length);
      setStickersCount(stickers.length);
      setImagesCount(images.length);
      setPresetsCount(presets.length);
      setComponentsCount(components.length);
      setSnapshotsCount(snapshots.length);

      const est = await dbService.getStorageEstimate();
      setStorageStats(est);
    } catch (e) {
      console.warn('Failed to refresh backup stats:', e);
    }
  };

  useEffect(() => {
    if (isOpen) {
      refreshStats();
      setImportStatus({ type: null, message: '' });
    }
  }, [isOpen]);

  // Export full backup
  const handleExport = () => {
    try {
      const backup = storageService.exportFullBackup();
      const jsonStr = JSON.stringify(backup, null, 2);
      const blob = new Blob([jsonStr], { type: 'application/json;charset=utf-8' });
      const url = URL.createObjectURL(blob);
      const link = document.createElement('a');
      const date = new Date().toISOString().slice(0, 10);
      link.download = `wechat-editor-backup-${date}.json`;
      link.href = url;
      link.click();
      URL.revokeObjectURL(url);
      setImportStatus({
        type: 'success',
        message: '数据备份包导出成功！请妥善保存该 JSON 文件。',
      });
    } catch (err: any) {
      setImportStatus({
        type: 'error',
        message: `导出备份失败: ${err?.message || '未知错误'}`,
      });
    }
  };

  // Trigger file selection for restore
  const handleFileSelect = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;

    const reader = new FileReader();
    reader.onload = async (event) => {
      try {
        setIsImporting(true);
        const text = event.target?.result as string;
        const data: FullBackupData = JSON.parse(text);

        if (!data || !Array.isArray(data.articles)) {
          throw new Error('无效的备份文件结构，请确保上传有效的备份包');
        }

        // Merge import
        await storageService.importFullBackup(data, 'merge');
        await refreshStats();

        setImportStatus({
          type: 'success',
          message: `恢复成功！已合并导入 ${data.articles.length} 篇文章、${data.stickers?.length || 0} 个表情包及相关配置。`,
        });

        if (onDataRestored) {
          onDataRestored();
        }
      } catch (err: any) {
        setImportStatus({
          type: 'error',
          message: `导入失败: ${err?.message || '文件损坏或解析错误'}`,
        });
      } finally {
        setIsImporting(false);
        if (fileInputRef.current) fileInputRef.current.value = '';
      }
    };
    reader.readAsText(file);
  };

  // Esc 关闭（此前这些弹窗只能点右上角 ×）
  useEscapeKey(isOpen, onClose);

  if (!isOpen) return null;

  return (
    <div role="dialog" aria-modal="true" aria-label="数据备份与恢复" onClick={onClose} className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 backdrop-blur-xs p-4 animate-in fade-in duration-200">
      <div onClick={(e) => e.stopPropagation()} className="bg-white rounded-2xl shadow-2xl border border-gray-200 w-full max-w-2xl max-h-[90vh] flex flex-col overflow-hidden">
        {/* Header */}
        <div className="flex items-center justify-between px-6 py-4 border-b border-gray-100 shrink-0">
          <div className="flex items-center gap-3">
            <div className="w-10 h-10 rounded-xl bg-blue-50 text-blue-600 flex items-center justify-center">
              <Database className="w-5 h-5" />
            </div>
            <div>
              <h2 className="text-base font-bold text-gray-900">
                数据备份与全量迁移
              </h2>
              <p className="text-xs text-gray-500">
                支持文章库、历史快照、表情素材与自定义排版的一键备份与还原
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
        <div className="flex-1 overflow-y-auto p-6 space-y-6">
          {/* Status Alert if any */}
          {importStatus.type && (
            <div
              className={`p-3.5 rounded-xl border flex items-center gap-2.5 text-xs font-medium ${
                importStatus.type === 'success'
                  ? 'bg-emerald-50 text-emerald-800 border-emerald-200'
                  : 'bg-rose-50 text-rose-800 border-rose-200'
              }`}
            >
              {importStatus.type === 'success' ? (
                <CheckCircle2 className="w-4 h-4 text-emerald-600 shrink-0" />
              ) : (
                <AlertCircle className="w-4 h-4 text-rose-600 shrink-0" />
              )}
              <span>{importStatus.message}</span>
            </div>
          )}

          {/* Storage Capacity Gauge Card */}
          <div className="bg-gradient-to-br from-slate-50 to-blue-50/40 rounded-xl border border-slate-200/80 p-4">
            <div className="flex items-center justify-between mb-3">
              <div className="flex items-center gap-2">
                <HardDrive className="w-4 h-4 text-blue-600" />
                <span className="text-xs font-bold text-slate-800">
                  本地持久存储状态 (IndexedDB & LocalStorage)
                </span>
              </div>
              <span className="text-[11px] font-semibold text-blue-700 bg-blue-100/60 px-2 py-0.5 rounded">
                存储安全保障
              </span>
            </div>

            <div className="flex items-center justify-between text-xs text-slate-600 mb-2">
              <span>已用空间：{storageStats.formattedUsed}</span>
              <span>配额上限：{storageStats.formattedQuota}</span>
            </div>

            <div className="w-full h-2 bg-slate-200/80 rounded-full overflow-hidden">
              <div
                className="h-full bg-blue-500 rounded-full transition-all duration-500"
                style={{ width: `${Math.max(2, storageStats.percentage)}%` }}
              />
            </div>
          </div>

          {/* Data Assets Breakdown */}
          <div>
            <div className="flex items-center justify-between mb-3">
              <h4 className="text-xs font-bold text-gray-700 uppercase tracking-wider">
                当前数据资产概览
              </h4>
              <button
                onClick={refreshStats}
                className="text-xs text-blue-600 hover:underline flex items-center gap-1"
              >
                <RefreshCw className="w-3 h-3" />
                <span>刷新</span>
              </button>
            </div>

            <div className="grid grid-cols-3 gap-3">
              <div className="p-3 bg-white rounded-xl border border-gray-100 shadow-2xs flex items-center gap-3">
                <div className="w-8 h-8 rounded-lg bg-emerald-50 text-emerald-600 flex items-center justify-center">
                  <FileText className="w-4 h-4" />
                </div>
                <div>
                  <div className="text-[11px] text-gray-400 font-medium">文章库</div>
                  <div className="text-sm font-bold text-gray-800">{articlesCount} 篇</div>
                </div>
              </div>

              <div className="p-3 bg-white rounded-xl border border-gray-100 shadow-2xs flex items-center gap-3">
                <div className="w-8 h-8 rounded-lg bg-amber-50 text-amber-600 flex items-center justify-center">
                  <Smile className="w-4 h-4" />
                </div>
                <div>
                  <div className="text-[11px] text-gray-400 font-medium">表情素材</div>
                  <div className="text-sm font-bold text-gray-800">{stickersCount} 个</div>
                </div>
              </div>

              <div className="p-3 bg-white rounded-xl border border-gray-100 shadow-2xs flex items-center gap-3">
                <div className="w-8 h-8 rounded-lg bg-purple-50 text-purple-600 flex items-center justify-center">
                  <ImageIcon className="w-4 h-4" />
                </div>
                <div>
                  <div className="text-[11px] text-gray-400 font-medium">本地图库</div>
                  <div className="text-sm font-bold text-gray-800">{imagesCount} 张</div>
                </div>
              </div>

              <div className="p-3 bg-white rounded-xl border border-gray-100 shadow-2xs flex items-center gap-3">
                <div className="w-8 h-8 rounded-lg bg-blue-50 text-blue-600 flex items-center justify-center">
                  <Bookmark className="w-4 h-4" />
                </div>
                <div>
                  <div className="text-[11px] text-gray-400 font-medium">排版预设</div>
                  <div className="text-sm font-bold text-gray-800">{presetsCount} 套</div>
                </div>
              </div>

              <div className="p-3 bg-white rounded-xl border border-gray-100 shadow-2xs flex items-center gap-3">
                <div className="w-8 h-8 rounded-lg bg-pink-50 text-pink-600 flex items-center justify-center">
                  <Layers className="w-4 h-4" />
                </div>
                <div>
                  <div className="text-[11px] text-gray-400 font-medium">自定义组件</div>
                  <div className="text-sm font-bold text-gray-800">{componentsCount} 个</div>
                </div>
              </div>

              <div className="p-3 bg-white rounded-xl border border-gray-100 shadow-2xs flex items-center gap-3">
                <div className="w-8 h-8 rounded-lg bg-indigo-50 text-indigo-600 flex items-center justify-center">
                  <Sparkles className="w-4 h-4" />
                </div>
                <div>
                  <div className="text-[11px] text-gray-400 font-medium">版本时光机快照</div>
                  <div className="text-sm font-bold text-gray-800">{snapshotsCount} 条</div>
                </div>
              </div>
            </div>
          </div>

          {/* Backup & Restore Action Buttons */}
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-4 pt-2">
            {/* Export Card */}
            <div className="border border-gray-200 rounded-xl p-4 bg-white hover:border-[#07C160] transition-colors flex flex-col justify-between">
              <div>
                <div className="flex items-center gap-2 mb-2">
                  <div className="w-8 h-8 rounded-lg bg-emerald-50 text-[#07C160] flex items-center justify-center">
                    <Download className="w-4 h-4" />
                  </div>
                  <div className="font-bold text-xs text-gray-900">
                    一键导出完整数据包
                  </div>
                </div>
                <p className="text-[11px] text-gray-500 leading-relaxed">
                  将当前所有的文章内容、历史回滚快照、自定义表情包与排版主题打包为一个标准的 JSON 文件导出至本地。
                </p>
              </div>

              <button
                onClick={handleExport}
                className="mt-4 w-full py-2 bg-[#07C160] hover:bg-[#06ad56] text-white text-xs font-semibold rounded-lg flex items-center justify-center gap-2 shadow-xs transition-colors"
              >
                <Download className="w-3.5 h-3.5" />
                <span>立即下载备份包 (JSON)</span>
              </button>
            </div>

            {/* Import Card */}
            <div className="border border-gray-200 rounded-xl p-4 bg-white hover:border-blue-500 transition-colors flex flex-col justify-between">
              <div>
                <div className="flex items-center gap-2 mb-2">
                  <div className="w-8 h-8 rounded-lg bg-blue-50 text-blue-600 flex items-center justify-center">
                    <Upload className="w-4 h-4" />
                  </div>
                  <div className="font-bold text-xs text-gray-900">
                    恢复 / 迁移数据包
                  </div>
                </div>
                <p className="text-[11px] text-gray-500 leading-relaxed">
                  选择以前导出的 JSON 备份文件，系统将安全地与现有数据合并，支持在不同电脑或浏览器之间无损迁移。
                </p>
              </div>

              <input
                ref={fileInputRef}
                type="file"
                accept=".json"
                onChange={handleFileSelect}
                className="hidden"
              />

              <button
                onClick={() => fileInputRef.current?.click()}
                disabled={isImporting}
                className="mt-4 w-full py-2 bg-white hover:bg-blue-50/50 text-blue-600 border border-blue-200 text-xs font-semibold rounded-lg flex items-center justify-center gap-2 transition-colors disabled:opacity-50"
              >
                <Upload className="w-3.5 h-3.5" />
                <span>{isImporting ? '正在解析导入...' : '选择备份文件恢复'}</span>
              </button>
            </div>
          </div>
        </div>

        {/* Footer */}
        <div className="px-6 py-3.5 bg-gray-50 border-t border-gray-100 shrink-0">
          {dataDirMsg && (
            <div className="text-[11px] text-blue-600 mb-2 break-all">{dataDirMsg}</div>
          )}
          <div className="flex items-center justify-between">
            <span className="text-xs text-gray-400">
              纯前端本地持久化，隐私绝对安全，数据不经过任何第三方云端
            </span>
            <div className="flex items-center gap-2 shrink-0">
              <button
                onClick={handleOpenDataDirectory}
                className="flex items-center gap-1.5 px-3 py-1.5 text-xs font-medium text-blue-600 border border-blue-200 rounded-lg hover:bg-blue-50/60 transition-colors"
                title="打开本地数据存储目录，方便手动备份或查看"
              >
                <FolderOpen className="w-3.5 h-3.5" />
                打开数据目录
              </button>
              <button
                onClick={onClose}
                className="px-4 py-1.5 text-xs font-medium text-gray-600 hover:text-gray-900 rounded-lg hover:bg-gray-200/50 transition-colors"
              >
                关闭
              </button>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
};
