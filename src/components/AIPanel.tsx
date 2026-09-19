import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import {
  Sparkles,
  X,
  Settings,
  Wand2,
  Image as ImageIcon,
  Key,
  Loader2,
  Pause,
  Check,
  RotateCcw,
  Download,
  Search,
  Plug,
  Save,
} from 'lucide-react';
import { aiService, newAIRequestId } from '../services/aiService';
import { imageHostService } from '../services/imageHostService';
import type { AIConfigInfo, AIServicePreset } from '../services/aiService';
import {
  TOOLBOX_ACTIONS,
  buildToolboxMessages,
  IMAGE_SIZES,
  IMAGE_QUALITIES,
  IMAGE_STYLES,
  type ToolboxActionKey,
} from '../services/aiPrompts';

/** 应用到编辑器的目标位置 */
export type ApplyTarget = 'replace-all' | 'replace-selection' | 'insert-at-cursor' | 'insert-as-title';

interface AIPanelProps {
  open: boolean;
  onClose: () => void;
  markdown: string;
  selectedText: string;
  onApply: (text: string, target: ApplyTarget) => void;
}

type Tab = 'toolbox' | 'image';
type View = 'main' | 'config';

const EMPTY_SERVICES: AIServicePreset[] = [];

export const AIPanel: React.FC<AIPanelProps> = ({
  open,
  onClose,
  markdown,
  selectedText,
  onApply,
}) => {
  // ---------- 通用 ----------
  const [tab, setTab] = useState<Tab>('toolbox');
  const [view, setView] = useState<View>('main');
  const [config, setConfig] = useState<AIConfigInfo | null>(null);
  const [services, setServices] = useState<AIServicePreset[]>(EMPTY_SERVICES);
  const [imageServices, setImageServices] = useState<AIServicePreset[]>(EMPTY_SERVICES);

  // ---------- 工具箱 ----------
  const [action, setAction] = useState<ToolboxActionKey>('optimize');
  const [customPrompts, setCustomPrompts] = useState<string[]>([]);
  const [customInput, setCustomInput] = useState('');
  const [useSelection, setUseSelection] = useState(false);
  const [result, setResult] = useState('');
  const [reasoning, setReasoning] = useState('');
  const [streaming, setStreaming] = useState(false);
  const [error, setError] = useState('');
  const requestIdRef = useRef('');
  const resultRef = useRef('');
  /** 同步的 in-flight 守卫（state 在同一帧内不可靠） */
  const inFlightRef = useRef(false);
  /** 固化「本次结果来自选中文字还是全文」，避免中途切换来源导致应用错位 */
  const appliedSelectionRef = useRef(false);

  // ---------- AI 配图 ----------
  const [imgPrompt, setImgPrompt] = useState('');
  const [imgSize, setImgSize] = useState(IMAGE_SIZES[0].value);
  const [imgQuality, setImgQuality] = useState(IMAGE_QUALITIES[0].value);
  const [imgStyle, setImgStyle] = useState(IMAGE_STYLES[0].value);
  const [imgLoading, setImgLoading] = useState(false);
  const [imgError, setImgError] = useState('');
  const [imgResult, setImgResult] = useState<{ dataUrl?: string; url?: string } | null>(null);

  // ---------- 配置表单 ----------
  const [cfgType, setCfgType] = useState('');
  const [cfgEndpoint, setCfgEndpoint] = useState('');
  const [cfgApiKey, setCfgApiKey] = useState('');
  const [cfgModel, setCfgModel] = useState('');
  const [cfgTemperature, setCfgTemperature] = useState('1');
  const [cfgMaxToken, setCfgMaxToken] = useState('2048');
  const [imgCfgType, setImgCfgType] = useState('');
  const [imgCfgEndpoint, setImgCfgEndpoint] = useState('');
  const [imgCfgApiKey, setImgCfgApiKey] = useState('');
  const [imgCfgModel, setImgCfgModel] = useState('');
  const [discovered, setDiscovered] = useState<string[]>([]);
  const [discovering, setDiscovering] = useState(false);
  const [cfgMsg, setCfgMsg] = useState('');
  const [saving, setSaving] = useState(false);
  const [testing, setTesting] = useState(false);

  const textToProcess = useMemo(() => {
    if (useSelection && selectedText.trim()) return selectedText.trim();
    return markdown;
  }, [useSelection, selectedText, markdown]);

  // ---------- 加载配置 / 服务 ----------
  const loadAll = useCallback(async () => {
    try {
      const [svc, cfg] = await Promise.all([aiService.getServices(), aiService.getConfig()]);
      setServices(svc.services);
      setImageServices(svc.imageServices);
      setConfig(cfg);
      setCfgType(cfg.type);
      setCfgEndpoint(cfg.endpoint);
      setCfgModel(cfg.model);
      setCfgTemperature(String(cfg.temperature));
      setCfgMaxToken(String(cfg.maxToken));
      setCfgApiKey('');
      setImgCfgType(cfg.image.type);
      setImgCfgEndpoint(cfg.image.endpoint);
      setImgCfgModel(cfg.image.model);
      setImgCfgApiKey('');
    } catch (e) {
      console.error('加载 AI 配置失败:', e);
      setCfgMsg('配置加载失败，请重试');
    }
  }, []);

  useEffect(() => {
    if (open) {
      void loadAll();
      // 打开时若已有选中文字，默认处理选中内容（对齐 doocs/md）
      setUseSelection(!!selectedText.trim());
      setResult('');
      setReasoning('');
      setError('');
      resultRef.current = '';
    } else if (requestIdRef.current) {
      // 关闭面板即终止仍在进行的流式请求（避免旧 delta 串入下次结果、白耗额度）
      void aiService.abort(requestIdRef.current).catch(() => {});
      requestIdRef.current = '';
      inFlightRef.current = false;
      setStreaming(false);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [open]);

  // ---------- 订阅流式增量 ----------
  useEffect(() => {
    const off = aiService.onStream((evt) => {
      if (evt.requestId !== requestIdRef.current) return;
      if (evt.type === 'delta') {
        resultRef.current += evt.text || '';
        setResult(resultRef.current);
      } else if (evt.type === 'reasoning') {
        setReasoning((p) => p + (evt.text || ''));
      } else if (evt.type === 'error') {
        setError(evt.error || '请求失败');
        setStreaming(false);
      } else if (evt.type === 'done' || evt.type === 'aborted') {
        setStreaming(false);
      }
    });
    return off;
  }, []);

  // ---------- 工具箱 ----------
  const runToolbox = async () => {
    // 用 ref 同步防重入（streaming state 在同一帧内是旧值，挡不住双击）
    if (inFlightRef.current) return;
    const text = textToProcess.trim();
    if (!text) {
      setError('没有可处理的文本，请先在编辑器中选中内容或输入正文');
      return;
    }

    inFlightRef.current = true;
    appliedSelectionRef.current = useSelection && !!selectedText.trim();
    setResult('');
    setReasoning('');
    setError('');
    resultRef.current = '';
    setStreaming(true);

    try {
      const id = newAIRequestId();
      requestIdRef.current = id;
      // 自定义提示词只在「自定义」动作下生效
      const messages = buildToolboxMessages(action, action === 'custom' ? customPrompts : [], text);
      const res = await aiService.streamChat(id, messages);
      if (!res.ok && res.code !== 'ABORTED' && !resultRef.current) {
        setError(res.error || '请求失败');
      }
    } catch (e) {
      if (!resultRef.current) setError((e as Error)?.message || '请求失败');
    } finally {
      inFlightRef.current = false;
      setStreaming(false);
    }
  };

  const stopToolbox = async () => {
    if (!requestIdRef.current) return;
    try {
      await aiService.abort(requestIdRef.current);
    } catch (e) {
      console.warn('终止请求失败:', e);
    } finally {
      inFlightRef.current = false;
      setStreaming(false);
    }
  };

  const acceptResult = () => {
    if (!result.trim()) return;
    // 使用发起时的来源，而不是「此刻」的 useSelection
    onApply(result, appliedSelectionRef.current ? 'replace-selection' : 'replace-all');
    setResult('');
    resultRef.current = '';
    setReasoning('');
  };

  const addCustomPrompt = () => {
    const v = customInput.trim();
    if (v && !customPrompts.includes(v)) setCustomPrompts((p) => [...p, v]);
    setCustomInput('');
  };

  // ---------- 配置 ----------
  const handleServiceChange = (key: string) => {
    setCfgType(key);
    const preset = services.find((s) => s.key === key);
    if (preset) {
      if (preset.endpoint) setCfgEndpoint(preset.endpoint);
      if (preset.models.length) setCfgModel(preset.models[0]);
    }
    setDiscovered([]);
  };

  const handleDiscover = async () => {
    setDiscovering(true);
    setCfgMsg('');
    try {
      const res = await aiService.listModels();
      if (res.ok) {
        setDiscovered(res.models);
        setCfgMsg(res.models.length ? `已发现 ${res.models.length} 个模型` : '未发现可用模型');
      } else {
        setCfgMsg(res.error || '模型发现失败');
      }
    } catch (e) {
      setCfgMsg((e as Error)?.message || '模型发现失败');
    } finally {
      setDiscovering(false);
    }
  };

  const handleSaveConfig = async () => {
    setSaving(true);
    setCfgMsg('');
    try {
      // 关键：输入框为空时**不发送** apiKey 字段（undefined = 保留原值），
      // 否则主进程会把空串当作「清空」，改个温度就把 Key 抹掉了
      const next = await aiService.setConfig({
        type: cfgType,
        endpoint: cfgEndpoint,
        apiKey: cfgApiKey.trim() ? cfgApiKey : undefined,
        model: cfgModel,
        temperature: Number(cfgTemperature) || 0,
        maxToken: Number(cfgMaxToken) || 2048,
        image: {
          type: imgCfgType,
          endpoint: imgCfgEndpoint,
          apiKey: imgCfgApiKey.trim() ? imgCfgApiKey : undefined,
          model: imgCfgModel,
        },
      });
      setConfig(next);
      setCfgApiKey('');
      setImgCfgApiKey('');
      setCfgMsg('配置已保存 ✓');
    } catch (e) {
      setCfgMsg((e as Error)?.message || '保存失败，请重试');
    } finally {
      setSaving(false);
    }
  };

  const handleTest = async () => {
    setTesting(true);
    setCfgMsg('');
    try {
      const res = await aiService.testConnection();
      setCfgMsg(res.message);
    } catch (e) {
      setCfgMsg((e as Error)?.message || '测试失败');
    } finally {
      setTesting(false);
    }
  };

  // ---------- AI 配图 ----------
  const runImageGen = async () => {
    if (imgLoading) return;
    if (!imgPrompt.trim()) {
      setImgError('请输入提示词');
      return;
    }
    setImgLoading(true);
    setImgError('');
    setImgResult(null);
    try {
      const res = await aiService.generateImage({
        prompt: imgPrompt.trim(),
        size: imgSize,
        quality: imgQuality,
        style: imgStyle,
      });
      if (res.ok && (res.dataUrl || res.url)) {
        setImgResult({ dataUrl: res.dataUrl, url: res.url });
      } else {
        setImgError(res.error || '图像生成失败');
      }
    } catch (e) {
      setImgError((e as Error)?.message || '图像生成失败');
    } finally {
      setImgLoading(false);
    }
  };

  const insertImage = async () => {
    const src = imgResult?.url || imgResult?.dataUrl;
    if (!src) return;
    try {
      // base64 图片直接写进正文会落到 localStorage（~5MB 上限），
      // 图床可用时优先上传换成 https 外链，避免撑爆本地存储
      if (!imgResult?.url && imgResult?.dataUrl) {
        const uploaded = await imageHostService.upload(
          imgResult.dataUrl,
          `ai-image-${Date.now()}.png`
        );
        if (uploaded.ok && uploaded.url) {
          onApply(`\n![](${uploaded.url})\n`, 'insert-at-cursor');
          return;
        }
      }
    } catch (e) {
      console.warn('图床上传失败，改为内嵌图片:', e);
    }
    onApply(`\n![](${src})\n`, 'insert-at-cursor');
  };

  const downloadImage = () => {
    const src = imgResult?.url || imgResult?.dataUrl;
    if (!src) return;
    const a = document.createElement('a');
    a.href = src;
    a.download = `ai-image-${Date.now()}.png`;
    a.target = '_blank';
    a.rel = 'noreferrer';
    document.body.appendChild(a);
    a.click();
    a.remove();
  };

  if (!open) return null;

  const modelOptions = discovered.length ? discovered : services.find((s) => s.key === cfgType)?.models ?? [];

  return (
    <div className="fixed inset-0 z-50 flex justify-end">
      <div className="absolute inset-0 bg-black/20" onClick={onClose} />
      <div className="relative w-full max-w-[440px] h-full bg-white shadow-2xl flex flex-col">
        {/* Header */}
        <div className="px-5 py-4 border-b border-[#F1F5F9] flex items-center justify-between shrink-0">
          <div className="flex items-center gap-2.5">
            <div className="w-8 h-8 rounded-lg bg-gradient-to-br from-[#07C160] to-[#05a050] flex items-center justify-center">
              <Sparkles className="w-4 h-4 text-white" />
            </div>
            <div>
              <div className="text-sm font-semibold text-[#1E293B]">AI 助手</div>
              <div className="text-[11px] text-[#94A3B8]">
                {config?.configured
                  ? `${services.find((s) => s.key === config.type)?.label ?? config.type} · ${config.model}`
                  : '尚未配置 API Key'}
              </div>
            </div>
          </div>
          <div className="flex items-center gap-1">
            <button
              onClick={() => setView(view === 'config' ? 'main' : 'config')}
              title={view === 'config' ? '返回' : '配置'}
              aria-label={view === 'config' ? '返回' : 'AI 服务配置'}
              className={`p-2 rounded-lg transition-colors ${
                view === 'config' ? 'bg-[#07C160]/10 text-[#07C160]' : 'text-[#64748B] hover:bg-[#F1F5F9]'
              }`}
            >
              {view === 'config' ? <Wand2 className="w-4 h-4" /> : <Settings className="w-4 h-4" />}
            </button>
            <button
              onClick={onClose}
              aria-label="关闭 AI 助手"
              className="p-2 rounded-lg text-[#64748B] hover:bg-[#F1F5F9]"
            >
              <X className="w-4 h-4" />
            </button>
          </div>
        </div>

        {/* Tabs */}
        {view === 'main' && (
          <div className="px-5 pt-3 shrink-0">
            <div className="flex gap-1 p-1 bg-[#F1F5F9] rounded-lg">
              {(
                [
                  { key: 'toolbox' as Tab, label: '工具箱', icon: Wand2 },
                  { key: 'image' as Tab, label: 'AI 配图', icon: ImageIcon },
                ]
              ).map((t) => (
                <button
                  key={t.key}
                  onClick={() => setTab(t.key)}
                  className={`flex-1 flex items-center justify-center gap-1.5 py-1.5 rounded-md text-xs font-medium transition-colors ${
                    tab === t.key ? 'bg-white text-[#1E293B] shadow-sm' : 'text-[#64748B] hover:text-[#1E293B]'
                  }`}
                >
                  <t.icon className="w-3.5 h-3.5" />
                  {t.label}
                </button>
              ))}
            </div>
          </div>
        )}

        {/* Body */}
        <div className="flex-1 overflow-y-auto px-5 py-4 space-y-4">
          {view === 'config' ? (
            /* ---------------- 配置视图 ---------------- */
            <div className="space-y-4">
              <div>
                <label className="block text-[11px] text-[#64748B] mb-1">服务类型</label>
                <select
                  value={cfgType}
                  onChange={(e) => handleServiceChange(e.target.value)}
                  className="w-full rounded-lg border border-[#E2E8F0] bg-white px-3 py-2 text-xs focus:outline-none focus:ring-2 focus:ring-[#07C160]/30"
                >
                  {services.map((s) => (
                    <option key={s.key} value={s.key}>
                      {s.label}
                    </option>
                  ))}
                </select>
              </div>

              <div>
                <label className="block text-[11px] text-[#64748B] mb-1">API 端点</label>
                <input
                  type="text"
                  value={cfgEndpoint}
                  onChange={(e) => setCfgEndpoint(e.target.value)}
                  placeholder="https://api.deepseek.com"
                  className="w-full rounded-lg border border-[#E2E8F0] bg-white px-3 py-2 text-xs font-mono focus:outline-none focus:ring-2 focus:ring-[#07C160]/30"
                />
                <div className="mt-1 text-[10.5px] text-[#94A3B8]">
                  只需填到版本号，系统自动补 /chat/completions
                </div>
              </div>

              <div>
                <label className="block text-[11px] text-[#64748B] mb-1">
                  <Key className="w-3 h-3 inline mr-1" />
                  API 密钥
                </label>
                <input
                  type="password"
                  value={cfgApiKey}
                  onChange={(e) => setCfgApiKey(e.target.value)}
                  placeholder={config?.configured ? `留空则保留原 Key（${config.apiKeyMasked}）` : 'sk-...'}
                  className="w-full rounded-lg border border-[#E2E8F0] bg-white px-3 py-2 text-xs focus:outline-none focus:ring-2 focus:ring-[#07C160]/30"
                />
              </div>

              <div>
                <div className="flex items-center justify-between mb-1">
                  <label className="text-[11px] text-[#64748B]">模型名称</label>
                  <button
                    onClick={handleDiscover}
                    disabled={discovering}
                    className="flex items-center gap-1 text-[11px] text-[#2563EB] hover:underline disabled:opacity-50"
                  >
                    {discovering ? <Loader2 className="w-3 h-3 animate-spin" /> : <Search className="w-3 h-3" />}
                    {discovering ? '发现中…' : '发现模型'}
                  </button>
                </div>
                <input
                  list="ai-model-options"
                  type="text"
                  value={cfgModel}
                  onChange={(e) => setCfgModel(e.target.value)}
                  placeholder="输入或选择模型名称"
                  className="w-full rounded-lg border border-[#E2E8F0] bg-white px-3 py-2 text-xs focus:outline-none focus:ring-2 focus:ring-[#07C160]/30"
                />
                <datalist id="ai-model-options">
                  {modelOptions.map((m) => (
                    <option key={m} value={m} />
                  ))}
                </datalist>
              </div>

              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="block text-[11px] text-[#64748B] mb-1">温度（0~2）</label>
                  <input
                    type="number"
                    min="0"
                    max="2"
                    step="0.1"
                    value={cfgTemperature}
                    onChange={(e) => setCfgTemperature(e.target.value)}
                    className="w-full rounded-lg border border-[#E2E8F0] bg-white px-3 py-2 text-xs focus:outline-none focus:ring-2 focus:ring-[#07C160]/30"
                  />
                </div>
                <div>
                  <label className="block text-[11px] text-[#64748B] mb-1">最大 Token</label>
                  <input
                    type="number"
                    min="1"
                    step="128"
                    value={cfgMaxToken}
                    onChange={(e) => setCfgMaxToken(e.target.value)}
                    className="w-full rounded-lg border border-[#E2E8F0] bg-white px-3 py-2 text-xs focus:outline-none focus:ring-2 focus:ring-[#07C160]/30"
                  />
                </div>
              </div>

              <div className="flex gap-2 pt-1">
                <button
                  onClick={handleTest}
                  disabled={testing}
                  className="flex-1 flex items-center justify-center gap-1.5 py-2 rounded-lg border border-[#E2E8F0] text-xs font-medium text-[#475569] hover:bg-[#F8FAFC] disabled:opacity-60"
                >
                  {testing ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : <Plug className="w-3.5 h-3.5" />}
                  测试连接
                </button>
                <button
                  onClick={handleSaveConfig}
                  disabled={saving}
                  className="flex-1 flex items-center justify-center gap-1.5 py-2 rounded-lg bg-[#07C160] hover:bg-[#06ad56] text-white text-xs font-medium disabled:opacity-60"
                >
                  {saving ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : <Save className="w-3.5 h-3.5" />}
                  保存配置
                </button>
              </div>

              {cfgMsg && <div className="text-[11px] text-[#07C160] leading-snug">{cfgMsg}</div>}

              {/* 生图配置 */}
              <div className="pt-3 border-t border-[#F1F5F9] space-y-3">
                <div className="text-[11px] font-semibold text-[#475569]">AI 配图配置</div>
                <select
                  value={imgCfgType}
                  onChange={(e) => {
                    const key = e.target.value;
                    setImgCfgType(key);
                    const preset = imageServices.find((s) => s.key === key);
                    if (preset) {
                      if (preset.endpoint) setImgCfgEndpoint(preset.endpoint);
                      if (preset.models.length) setImgCfgModel(preset.models[0]);
                    }
                  }}
                  className="w-full rounded-lg border border-[#E2E8F0] bg-white px-3 py-2 text-xs focus:outline-none focus:ring-2 focus:ring-[#07C160]/30"
                >
                  {imageServices.map((s) => (
                    <option key={s.key} value={s.key}>
                      {s.label}
                    </option>
                  ))}
                </select>
                <input
                  type="text"
                  value={imgCfgEndpoint}
                  onChange={(e) => setImgCfgEndpoint(e.target.value)}
                  placeholder="生图 API 端点"
                  className="w-full rounded-lg border border-[#E2E8F0] bg-white px-3 py-2 text-xs font-mono focus:outline-none focus:ring-2 focus:ring-[#07C160]/30"
                />
                <input
                  type="password"
                  value={imgCfgApiKey}
                  onChange={(e) => setImgCfgApiKey(e.target.value)}
                  placeholder={config?.image.configured ? `留空则保留原 Key` : '生图 API 密钥'}
                  className="w-full rounded-lg border border-[#E2E8F0] bg-white px-3 py-2 text-xs focus:outline-none focus:ring-2 focus:ring-[#07C160]/30"
                />
                <input
                  list="ai-image-model-options"
                  type="text"
                  value={imgCfgModel}
                  onChange={(e) => setImgCfgModel(e.target.value)}
                  placeholder="生图模型，如 dall-e-3"
                  className="w-full rounded-lg border border-[#E2E8F0] bg-white px-3 py-2 text-xs focus:outline-none focus:ring-2 focus:ring-[#07C160]/30"
                />
                <datalist id="ai-image-model-options">
                  {imageServices
                    .find((s) => s.key === imgCfgType)
                    ?.models.map((m) => <option key={m} value={m} />)}
                </datalist>
              </div>

              <div className="text-[10.5px] text-[#94A3B8] leading-snug pt-1">
                Key 仅保存在本机（Electron 主进程），不会上传或写入前端代码。
              </div>
            </div>
          ) : tab === 'toolbox' ? (
            /* ---------------- 工具箱 ---------------- */
            <>
              <div>
                <div className="flex items-center justify-between mb-1.5">
                  <label className="text-[11px] text-[#64748B]">选择操作</label>
                  <div className="flex gap-1 p-0.5 bg-[#F1F5F9] rounded-md">
                    {[
                      { v: true, label: '选中文字' },
                      { v: false, label: '全文' },
                    ].map((o) => (
                      <button
                        key={String(o.v)}
                        onClick={() => setUseSelection(o.v)}
                        disabled={o.v && !selectedText.trim()}
                        className={`px-2 py-0.5 rounded text-[10.5px] font-medium transition-colors disabled:opacity-40 ${
                          useSelection === o.v ? 'bg-white text-[#1E293B] shadow-sm' : 'text-[#64748B]'
                        }`}
                      >
                        {o.label}
                      </button>
                    ))}
                  </div>
                </div>
                <select
                  value={action}
                  onChange={(e) => setAction(e.target.value as ToolboxActionKey)}
                  className="w-full rounded-lg border border-[#E2E8F0] bg-white px-3 py-2 text-xs focus:outline-none focus:ring-2 focus:ring-[#07C160]/30"
                >
                  {TOOLBOX_ACTIONS.map((a) => (
                    <option key={a.key} value={a.key}>
                      {a.label}
                    </option>
                  ))}
                </select>
              </div>

              <div>
                <label className="block text-[11px] text-[#64748B] mb-1">原文</label>
                <div className="max-h-28 overflow-y-auto rounded-lg border border-[#E2E8F0] bg-[#F8FAFC] px-3 py-2 text-[11.5px] text-[#64748B] whitespace-pre-wrap leading-relaxed">
                  {textToProcess.trim() || (
                    <span className="text-[#94A3B8]">在编辑器中选中文字，或切到「全文」</span>
                  )}
                </div>
              </div>

              {action === 'custom' && (
                <div>
                  <label className="block text-[11px] text-[#64748B] mb-1">自定义提示词（可选）</label>
                  <div className="min-h-[40px] rounded-lg border border-[#E2E8F0] px-2 py-1.5 flex flex-wrap gap-1.5 items-center">
                    {customPrompts.map((p, i) => (
                      <span
                        key={`${p}-${i}`}
                        className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full bg-[#F1F5F9] text-[11px] text-[#475569]"
                      >
                        {p}
                        <button
                          onClick={() => setCustomPrompts((prev) => prev.filter((_, idx) => idx !== i))}
                          className="hover:text-[#EF4444]"
                        >
                          <X className="w-3 h-3" />
                        </button>
                      </span>
                    ))}
                    <input
                      value={customInput}
                      onChange={(e) => setCustomInput(e.target.value)}
                      onKeyDown={(e) => {
                        if (e.key === 'Enter') {
                          e.preventDefault();
                          addCustomPrompt();
                        }
                      }}
                      placeholder="输入提示词后按回车"
                      className="flex-1 min-w-[110px] text-[11.5px] py-0.5 focus:outline-none bg-transparent"
                    />
                  </div>
                </div>
              )}

              {error && <div className="text-[11px] text-[#EF4444] leading-snug">{error}</div>}

              {reasoning && (
                <div>
                  <label className="block text-[11px] text-[#94A3B8] mb-1">思考过程</label>
                  <div className="max-h-24 overflow-y-auto rounded-lg border border-dashed border-[#E2E8F0] px-3 py-2 text-[11px] text-[#94A3B8] whitespace-pre-wrap">
                    {reasoning}
                  </div>
                </div>
              )}

              {(result || streaming) && (
                <div>
                  <label className="block text-[11px] text-[#64748B] mb-1">处理结果</label>
                  <div className="max-h-52 overflow-y-auto rounded-lg border border-[#E2E8F0] bg-white px-3 py-2 text-[12.5px] text-[#1E293B] whitespace-pre-wrap leading-relaxed">
                    {result || <span className="text-[#94A3B8]">正在生成…</span>}
                  </div>
                </div>
              )}
            </>
          ) : (
            /* ---------------- AI 配图 ---------------- */
            <>
              <div>
                <label className="block text-[11px] text-[#64748B] mb-1">提示词</label>
                <textarea
                  value={imgPrompt}
                  onChange={(e) => setImgPrompt(e.target.value)}
                  rows={3}
                  placeholder="描述你想要生成的图像…（Enter 生成，Shift+Enter 换行）"
                  onKeyDown={(e) => {
                    if (e.key === 'Enter' && !e.shiftKey) {
                      e.preventDefault();
                      void runImageGen();
                    }
                  }}
                  className="w-full rounded-lg border border-[#E2E8F0] px-3 py-2 text-xs resize-none focus:outline-none focus:ring-2 focus:ring-[#07C160]/30"
                />
              </div>

              <div className="grid grid-cols-3 gap-2">
                <select
                  value={imgSize}
                  onChange={(e) => setImgSize(e.target.value)}
                  className="rounded-lg border border-[#E2E8F0] bg-white px-2 py-1.5 text-[11px] focus:outline-none"
                >
                  {IMAGE_SIZES.map((s) => (
                    <option key={s.value} value={s.value}>
                      {s.label}
                    </option>
                  ))}
                </select>
                <select
                  value={imgQuality}
                  onChange={(e) => setImgQuality(e.target.value)}
                  className="rounded-lg border border-[#E2E8F0] bg-white px-2 py-1.5 text-[11px] focus:outline-none"
                >
                  {IMAGE_QUALITIES.map((s) => (
                    <option key={s.value} value={s.value}>
                      {s.label}
                    </option>
                  ))}
                </select>
                <select
                  value={imgStyle}
                  onChange={(e) => setImgStyle(e.target.value)}
                  className="rounded-lg border border-[#E2E8F0] bg-white px-2 py-1.5 text-[11px] focus:outline-none"
                >
                  {IMAGE_STYLES.map((s) => (
                    <option key={s.value} value={s.value}>
                      {s.label}
                    </option>
                  ))}
                </select>
              </div>

              {imgError && <div className="text-[11px] text-[#EF4444] leading-snug">{imgError}</div>}

              {imgLoading && (
                <div className="flex items-center gap-2 text-[11.5px] text-[#64748B]">
                  <Loader2 className="w-3.5 h-3.5 animate-spin" />
                  正在生成图像…
                </div>
              )}

              {imgResult && (
                <div className="space-y-2">
                  <img
                    src={imgResult.url || imgResult.dataUrl}
                    alt="AI 生成的图像"
                    className="w-full rounded-lg border border-[#E2E8F0]"
                  />
                  <div className="flex gap-2">
                    <button
                      onClick={() => void insertImage()}
                      className="flex-1 py-1.5 rounded-lg bg-[#07C160] hover:bg-[#06ad56] text-white text-[11px] font-medium"
                    >
                      插入到编辑器
                    </button>
                    <button
                      onClick={downloadImage}
                      className="flex-1 flex items-center justify-center gap-1 py-1.5 rounded-lg border border-[#E2E8F0] text-[11px] text-[#475569] hover:bg-[#F8FAFC]"
                    >
                      <Download className="w-3 h-3" />
                      下载
                    </button>
                  </div>
                </div>
              )}
            </>
          )}
        </div>

        {/* Footer actions */}
        {view === 'main' && tab === 'toolbox' && (
          <div className="px-5 py-3.5 border-t border-[#F1F5F9] flex items-center justify-end gap-2 shrink-0">
            {streaming && (
              <button
                onClick={stopToolbox}
                className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg border border-[#E2E8F0] text-xs font-medium text-[#475569] hover:bg-[#F8FAFC]"
              >
                <Pause className="w-3.5 h-3.5" />
                终止
              </button>
            )}
            {!!result && !streaming && (
              <button
                onClick={acceptResult}
                className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg bg-[#07C160] hover:bg-[#06ad56] text-white text-xs font-medium"
              >
                <Check className="w-3.5 h-3.5" />
                接受
              </button>
            )}
            <button
              onClick={runToolbox}
              disabled={streaming}
              className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg border border-[#E2E8F0] text-xs font-medium text-[#475569] hover:bg-[#F8FAFC] disabled:opacity-60"
            >
              {streaming ? (
                <Loader2 className="w-3.5 h-3.5 animate-spin" />
              ) : result ? (
                <RotateCcw className="w-3.5 h-3.5" />
              ) : (
                <Sparkles className="w-3.5 h-3.5" />
              )}
              {result ? '重试' : 'AI 处理'}
            </button>
          </div>
        )}

        {view === 'main' && tab === 'image' && (
          <div className="px-5 py-3.5 border-t border-[#F1F5F9] flex items-center justify-end shrink-0">
            <button
              onClick={runImageGen}
              disabled={imgLoading}
              className="flex items-center gap-1.5 px-4 py-1.5 rounded-lg bg-[#07C160] hover:bg-[#06ad56] text-white text-xs font-medium disabled:opacity-60"
            >
              {imgLoading ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : <ImageIcon className="w-3.5 h-3.5" />}
              生成
            </button>
          </div>
        )}
      </div>
    </div>
  );
};

export default AIPanel;
