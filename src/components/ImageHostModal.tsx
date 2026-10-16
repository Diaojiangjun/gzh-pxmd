import React, { useState, useEffect, useCallback } from 'react';
import { useEscapeKey } from '../hooks/useEscapeKey';
import { X, Cloud, Save, Loader2, CheckCircle2, AlertCircle, Eye, EyeOff } from 'lucide-react';
import { imageHostService, ImageHostConfig } from '../services/imageHostService';

type HostType = ImageHostConfig['type'];

/** 各图床需要填写的字段（secret 字段会显示为密码框并打码返回） */
const FIELD_GROUPS: Record<
  string,
  Array<{ key: string; label: string; placeholder?: string; secret?: boolean; hint?: string }>
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
    {
      key: 'responsePath',
      label: 'URL 字段路径',
      placeholder: 'data.url',
      hint: '响应 JSON 里图片链接的位置。支持 data.url、0.src（顶层数组第一项）、src 等写法。',
    },
    {
      key: 'domain',
      label: '图片域名（可选）',
      placeholder: 'https://cdn.example.com',
      hint: '图床若只返回 /file/xxx.jpg 这类相对路径，会用它补全。留空则自动取上传接口的域名。',
    },
    {
      key: 'extraQuery',
      label: '附加查询参数（可选）',
      placeholder: 'returnFormat=full',
      hint: '部分图床需要加参数才返回完整链接，如 returnFormat=full。一般留空即可 —— 相对路径会自动补全。',
    },
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
  custom: { url: '', method: 'POST', fieldName: 'file', headers: '', responsePath: 'url', domain: '', extraQuery: '' },
  s3: { endpoint: '', region: 'auto', bucket: '', accessKey: '', secretKey: '', domain: '' },
  aliyun: { accessKeyId: '', accessKeySecret: '', bucket: '', region: 'oss-cn-hangzhou', domain: '' },
  tencent: { secretId: '', secretKey: '', bucket: '', region: 'ap-guangzhou', domain: '' },
};

interface ImageHostModalProps {
  isOpen: boolean;
  onClose: () => void;
  /**
   * 悬浮提示回调（由 App 传入全局浮层）。
   *
   * 之前提示渲染在弹窗 Body 顶部，字段一多就得滚动才能看到 ——
   * 用户保存完配置，第一反应是「到底存没存上」，
   * 提示却藏在需要滚动的地方。现在改为浮在右上角，视线不用移动。
   */
  onToast?: (kind: 'success' | 'error' | 'info', text: string, detail?: string) => void;
}

export const ImageHostModal: React.FC<ImageHostModalProps> = ({ isOpen, onClose, onToast }) => {
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
      const text = '图床配置已保存';
      setMsg({ type: 'success', text });
      // 有全局浮层就发一条；没有（比如被单独复用）则退回弹窗内提示
      if (onToast) onToast('success', text);
    } catch (e: any) {
      const text = e?.message || '保存失败';
      setMsg({ type: 'error', text });
      if (onToast) onToast('error', '图床配置保存失败', text);
    } finally {
      setSaving(false);
    }
  };

  /** 用 1×1 透明 PNG 测试上传链路 */
  const handleTest = async () => {
    setTesting(true);
    setMsg({ type: null, text: '' });

    onToast?.('info', '正在测试上传…');

    const tinyPng =
      'data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mP8z8BQDwAEhQGAhKmMIQAAAABJRU5ErkJggg==';
    try {
      const res = await imageHostService.upload(tinyPng, 'test.png');
      if (!res.ok || !res.url) {
        const reason = res.error || '上传失败';
        setMsg({ type: 'error', text: reason });
        onToast?.('error', '上传测试失败', reason);
        return;
      }

      // 光看返回的路径不算数 —— 公众号真正关心的是这个地址能不能取到图。
      // 之前的问题正是「上传成功但链接缺域名」，预览正常、粘过去才裂。
      // 这里主动探一次，把「能不能用」提前暴露出来。
      let reachable = true;
      let probeNote = '';
      try {
        const probe = await fetch(res.url, { method: 'GET', mode: 'no-cors' });
        // no-cors 下 opaque 响应拿不到状态码，能 resolve 就说明地址有效
        reachable = probe.type === 'opaque' || probe.ok || (probe.status >= 200 && probe.status < 400);
        if (!reachable) probeNote = `（服务器返回 ${probe.status}）`;
      } catch (e: any) {
        reachable = false;
        probeNote = `（无法访问：${e?.message || '网络错误'}）`;
      }

      if (reachable) {
        setMsg({ type: 'success', text: `上传测试成功 ✓ ${res.url}` });
        onToast?.('success', '上传测试成功', res.url);
      } else {
        const detail =
          `上传成功但链接无法访问${probeNote}：${res.url}\n` +
          '若链接以 / 开头，请填写「图片域名」补全；否则检查图床的访问权限或防盗链设置。';
        setMsg({ type: 'error', text: detail });
        onToast?.('error', '上传成功但链接无法访问', `${res.url}${probeNote}。链接以 / 开头时请填写「图片域名」补全。`);
      }
    } catch (e: any) {
      const reason = e?.message || '测试失败';
      setMsg({ type: 'error', text: reason });
      onToast?.('error', '上传测试失败', reason);
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
          {config.type === 'none' && (
            <p className="text-xs text-amber-600 bg-amber-50 border border-amber-200 rounded-xl p-3">
              当前未启用图床，图片会以 base64 内嵌。图多时文章体积膨胀，粘贴到公众号可能卡顿或图片丢失。
            </p>
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
                    {f.hint && <p className="text-[10.5px] text-gray-400 mt-1 leading-relaxed">{f.hint}</p>}
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
        <div className="px-5 py-3.5 bg-gray-50 border-t border-gray-100 flex items-center justify-between gap-3 shrink-0">
          <span className="text-[11px] text-gray-400 shrink-0">密钥仅存本机主进程，不进前端代码</span>
          <div className="flex items-center gap-2">
            {/* 结果条贴在按钮旁、位于滚动区之外 —— 保存/测试后视线不用移动。
                顶部有全局浮层时这里是冗余的，保留作为降级（比如组件被单独复用）。 */}
            {msg.type && (
              <div
                className={`flex items-center gap-1.5 px-2.5 py-1.5 rounded-lg border text-[11px] max-w-[240px] ${
                  msg.type === 'success'
                    ? 'bg-emerald-50 text-emerald-800 border-emerald-200'
                    : 'bg-rose-50 text-rose-800 border-rose-200'
                }`}
              >
                {msg.type === 'success' ? (
                  <CheckCircle2 className="w-3.5 h-3.5 shrink-0" />
                ) : (
                  <AlertCircle className="w-3.5 h-3.5 shrink-0" />
                )}
                <span className="truncate">{msg.text.split('\n')[0]}</span>
              </div>
            )}
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
