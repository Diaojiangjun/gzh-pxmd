import React, { useState, useEffect, useCallback } from 'react';
import { useEscapeKey } from '../hooks/useEscapeKey';
import { X, Cloud, Save, Loader2, CheckCircle2, AlertCircle, Eye, EyeOff } from 'lucide-react';
import { imageHostService, ImageHostConfig } from '../services/imageHostService';

type HostType = ImageHostConfig['type'];

/** 各图床需要填写的字段（secret 字段会显示为密码框并打码返回） */
const FIELD_GROUPS: Record<
  string,
  Array<{ key: string; label: string; placeholder?: string; secret?: boolean }>
> = {
  github: [
    { key: 'repo', label: '仓库 (owner/repo)', placeholder: 'username/repo' },
    { key: 'token', label: 'Personal Access Token', secret: true },
    { key: 'branch', label: '分支', placeholder: 'main' },
    { key: 'path', label: '存储目录', placeholder: 'images' },
  ],
  custom: [
    { key: 'url', label: '上传接口 URL', placeholder: 'https://api.example.com/upload' },
    { key: 'method', label: '请求方法', placeholder: 'POST' },
    { key: 'fieldName', label: '文件字段名', placeholder: 'file' },
    { key: 'headers', label: '额外请求头 (JSON)', placeholder: '{"Authorization":"Bearer xxx"}' },
    { key: 'responsePath', label: 'URL 字段路径', placeholder: 'data.url' },
  ],
  s3: [
    { key: 'endpoint', label: 'Endpoint', placeholder: 'https://s3.amazonaws.com' },
    { key: 'region', label: 'Region', placeholder: 'auto' },
    { key: 'bucket', label: 'Bucket' },
    { key: 'accessKey', label: 'Access Key', secret: true },
    { key: 'secretKey', label: 'Secret Key', secret: true },
    { key: 'domain', label: '自定义域名（可选）', placeholder: 'https://cdn.example.com' },
  ],
  aliyun: [
    { key: 'accessKeyId', label: 'AccessKey ID', secret: true },
    { key: 'accessKeySecret', label: 'AccessKey Secret', secret: true },
    { key: 'bucket', label: 'Bucket' },
    { key: 'region', label: 'Region', placeholder: 'oss-cn-hangzhou' },
    { key: 'domain', label: '自定义域名（可选）' },
  ],
  tencent: [
    { key: 'secretId', label: 'SecretId', secret: true },
    { key: 'secretKey', label: 'SecretKey', secret: true },
    { key: 'bucket', label: 'Bucket' },
    { key: 'region', label: 'Region', placeholder: 'ap-guangzhou' },
    { key: 'domain', label: '自定义域名（可选）' },
  ],
};

const EMPTY: ImageHostConfig = {
  type: 'none',
  github: { repo: '', token: '', branch: 'main', path: 'images' },
  custom: { url: '', method: 'POST', fieldName: 'file', headers: '', responsePath: 'url' },
  s3: { endpoint: '', region: 'auto', bucket: '', accessKey: '', secretKey: '', domain: '' },
  aliyun: { accessKeyId: '', accessKeySecret: '', bucket: '', region: 'oss-cn-hangzhou', domain: '' },
  tencent: { secretId: '', secretKey: '', bucket: '', region: 'ap-guangzhou', domain: '' },
};

interface ImageHostModalProps {
  isOpen: boolean;
  onClose: () => void;
}

export const ImageHostModal: React.FC<ImageHostModalProps> = ({ isOpen, onClose }) => {
  const [config, setConfig] = useState<ImageHostConfig>(EMPTY);
  const [presets, setPresets] = useState<Array<{ type: string; name: string; hint: string }>>([]);
  const [saving, setSaving] = useState(false);
  const [testing, setTesting] = useState(false);
  const [msg, setMsg] = useState<{ type: 'success' | 'error' | null; text: string }>({ type: null, text: '' });
  const [showSecrets, setShowSecrets] = useState<Record<string, boolean>>({});

  const load = useCallback(async () => {
    const state = await imageHostService.getConfig();
    setConfig(state.config);
    setPresets(state.presets);
  }, []);

  useEffect(() => {
    if (isOpen) {
      load();
      setMsg({ type: null, text: '' });
    }
  }, [isOpen, load]);

  const updateField = (group: keyof ImageHostConfig, key: string, value: string) => {
    setConfig((prev) => ({
      ...prev,
      [group]: { ...((prev[group] as object) || {}), [key]: value },
    }) as ImageHostConfig);
  };

  const handleSave = async () => {
    setSaving(true);
    setMsg({ type: null, text: '' });
    try {
      const saved = await imageHostService.setConfig(config);
      setConfig(saved);
      setMsg({ type: 'success', text: '图床配置已保存 ✓' });
    } catch (e: any) {
      setMsg({ type: 'error', text: e?.message || '保存失败' });
    } finally {
      setSaving(false);
    }
  };

  /** 用 1×1 透明 PNG 测试上传链路 */
  const handleTest = async () => {
    setTesting(true);
    setMsg({ type: null, text: '' });
    const tinyPng =
      'data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mP8z8BQDwAEhQGAhKmMIQAAAABJRU5ErkJggg==';
    try {
      const res = await imageHostService.upload(tinyPng, 'test.png');
      if (res.ok) {
        setMsg({ type: 'success', text: `上传测试成功 → ${res.url}` });
      } else {
        setMsg({ type: 'error', text: res.error || '上传失败' });
      }
    } catch (e: any) {
      setMsg({ type: 'error', text: e?.message || '测试失败' });
    } finally {
      setTesting(false);
    }
  };

  // Esc 关闭（此前这些弹窗只能点右上角 ×）
  // 注意：hook 必须早于 `if (!isOpen) return null`，否则弹窗开合时 hook 数量变化 →
  // "Rendered more hooks than during the previous render."
  useEscapeKey(isOpen, onClose);

  if (!isOpen) return null;

  const fields = config.type !== 'none' ? FIELD_GROUPS[config.type] || [] : [];
  const groupKey = config.type as keyof ImageHostConfig;

  const activePreset = presets.find((p) => p.type === config.type);

  return (
    <div role="dialog" aria-modal="true" aria-label="图床设置" onClick={onClose} className="fixed inset-0 z-[60] flex items-center justify-center bg-black/50 backdrop-blur-xs p-4">
      <div onClick={(e) => e.stopPropagation()} className="bg-white rounded-2xl shadow-2xl border border-gray-200 w-full max-w-lg max-h-[88vh] flex flex-col overflow-hidden">
        {/* Header */}
        <div className="flex items-center justify-between px-5 py-4 border-b border-gray-100 shrink-0">
          <div className="flex items-center gap-3">
            <div className="w-9 h-9 rounded-xl bg-sky-50 text-sky-600 flex items-center justify-center">
              <Cloud className="w-4.5 h-4.5" />
            </div>
            <div>
              <h2 className="text-sm font-bold text-gray-900">图床设置</h2>
              <p className="text-[11px] text-gray-500">图片自动上传为 https 外链，公众号粘贴更稳定</p>
            </div>
          </div>
          <button onClick={onClose} className="p-2 rounded-lg hover:bg-gray-100 text-gray-400 transition-colors">
            <X className="w-4 h-4" />
          </button>
        </div>

        {/* Body */}
        <div className="flex-1 overflow-y-auto p-5 space-y-4">
          {msg.type && (
            <div
              className={`p-3 rounded-xl border flex items-start gap-2 text-xs ${
                msg.type === 'success'
                  ? 'bg-emerald-50 text-emerald-800 border-emerald-200'
                  : 'bg-rose-50 text-rose-800 border-rose-200'
              }`}
            >
              {msg.type === 'success' ? (
                <CheckCircle2 className="w-4 h-4 text-emerald-600 shrink-0 mt-0.5" />
              ) : (
                <AlertCircle className="w-4 h-4 text-rose-600 shrink-0 mt-0.5" />
              )}
              <span className="break-all">{msg.text}</span>
            </div>
          )}

          {/* 图床类型 */}
          <div>
            <label className="block text-[11px] text-gray-500 mb-1.5">图床服务</label>
            <select
              value={config.type}
              onChange={(e) => setConfig((p) => ({ ...p, type: e.target.value as HostType }))}
              className="w-full rounded-lg border border-gray-200 px-3 py-2 text-xs focus:outline-none focus:ring-2 focus:ring-sky-500/30 focus:border-sky-400"
            >
              {presets.map((p) => (
                <option key={p.type} value={p.type}>
                  {p.name}
                </option>
              ))}
            </select>
            {activePreset?.hint && <p className="text-[11px] text-gray-400 mt-1.5">{activePreset.hint}</p>}
          </div>

          {/* 动态字段 */}
          {fields.length > 0 && (
            <div className="space-y-3 pt-1">
              {fields.map((f) => {
                const group = config[groupKey] as unknown as Record<string, string> | undefined;
                const value = group?.[f.key] ?? '';
                const isSecret = !!f.secret;
                const visible = showSecrets[f.key];
                return (
                  <div key={f.key}>
                    <label className="block text-[11px] text-gray-500 mb-1.5">{f.label}</label>
                    <div className="relative">
                      <input
                        type={isSecret && !visible ? 'password' : 'text'}
                        value={value}
                        onChange={(e) => updateField(groupKey, f.key, e.target.value)}
                        placeholder={f.placeholder}
                        className="w-full rounded-lg border border-gray-200 px-3 py-2 pr-9 text-xs focus:outline-none focus:ring-2 focus:ring-sky-500/30 focus:border-sky-400"
                      />
                      {isSecret && (
                        <button
                          type="button"
                          onClick={() => setShowSecrets((s) => ({ ...s, [f.key]: !s[f.key] }))}
                          className="absolute right-2 top-1/2 -translate-y-1/2 text-gray-400 hover:text-gray-600"
                        >
                          {visible ? <EyeOff className="w-3.5 h-3.5" /> : <Eye className="w-3.5 h-3.5" />}
                        </button>
                      )}
                    </div>
                  </div>
                );
              })}
            </div>
          )}

          {config.type === 'none' && (
            <p className="text-xs text-amber-600 bg-amber-50 border border-amber-200 rounded-xl p-3">
              当前未启用图床，图片会以 base64 内嵌。图多时文章体积膨胀，粘贴到公众号可能卡顿或图片丢失。
            </p>
          )}
        </div>

        {/* Footer */}
        <div className="px-5 py-3.5 bg-gray-50 border-t border-gray-100 flex items-center justify-between shrink-0">
          <span className="text-[11px] text-gray-400">密钥仅存本机主进程，不进前端代码</span>
          <div className="flex items-center gap-2">
            {config.type !== 'none' && (
              <button
                onClick={handleTest}
                disabled={testing}
                className="flex items-center gap-1.5 px-3 py-1.5 text-xs font-medium text-sky-600 border border-sky-200 rounded-lg hover:bg-sky-50 transition-colors disabled:opacity-50"
              >
                {testing ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : <Cloud className="w-3.5 h-3.5" />}
                测试上传
              </button>
            )}
            <button
              onClick={handleSave}
              disabled={saving}
              className="flex items-center gap-1.5 px-4 py-1.5 text-xs font-medium text-white bg-sky-600 hover:bg-sky-700 rounded-lg transition-colors disabled:opacity-50"
            >
              {saving ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : <Save className="w-3.5 h-3.5" />}
              保存配置
            </button>
          </div>
        </div>
      </div>
    </div>
  );
};
