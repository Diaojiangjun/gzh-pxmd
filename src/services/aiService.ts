/**
 * AI 服务封装（渲染层）
 *
 * 网络请求全部走**主进程**（Electron），API Key 不进入前端内存；
 * Web 预览下所有能力降级为友好提示。
 *
 * 能力对齐 doocs/md：
 *  - 服务预设（多服务 + 自定义 OpenAI 兼容端点）
 *  - 流式对话（增量渲染 + 可终止）
 *  - 模型发现（/models）
 *  - 文生图（/images/generations）
 */
import type {
  AIConfigInfo,
  AIConfigPatch,
  AIServicePreset,
  AIStreamEvent,
  AIStreamResult,
  ChatMessage,
} from '../../electron/preload';

export type {
  AIConfigInfo,
  AIConfigPatch,
  AIServicePreset,
  AIStreamEvent,
  AIStreamResult,
  ChatMessage,
};

export interface AIImageGenOptions {
  prompt: string;
  size?: string;
  quality?: string;
  style?: string;
  n?: number;
}

export interface AIImageGenResult {
  ok: boolean;
  dataUrl?: string;
  url?: string;
  code?: string;
  error?: string;
}

const NOT_ELECTRON = 'AI 能力仅在桌面端（Electron）可用，请用 `npm run electron:dev` 启动桌面窗口';

const EMPTY_SERVICES: { services: AIServicePreset[]; imageServices: AIServicePreset[] } = {
  services: [],
  imageServices: [],
};

const EMPTY_CONFIG: AIConfigInfo = {
  configured: false,
  apiKeyMasked: '',
  type: '',
  endpoint: '',
  model: '',
  temperature: 1,
  maxToken: 2048,
  image: { configured: false, apiKeyMasked: '', type: '', endpoint: '', model: '' },
};

const ERROR_STREAM: AIStreamResult = { ok: false, code: 'NOT_ELECTRON', error: NOT_ELECTRON };

export const aiService = {
  async getServices() {
    if (!window.electronAPI?.aiGetServices) return EMPTY_SERVICES;
    return await window.electronAPI.aiGetServices();
  },

  async getConfig(): Promise<AIConfigInfo> {
    if (!window.electronAPI?.aiGetConfig) return EMPTY_CONFIG;
    return await window.electronAPI.aiGetConfig();
  },

  async setConfig(patch: AIConfigPatch): Promise<AIConfigInfo> {
    if (!window.electronAPI?.aiSetConfig) return EMPTY_CONFIG;
    return await window.electronAPI.aiSetConfig(patch);
  },

  async listModels(opts?: { image?: boolean }): Promise<{ ok: boolean; models: string[]; error?: string }> {
    if (!window.electronAPI?.aiListModels) {
      return { ok: false, models: [], error: NOT_ELECTRON };
    }
    return await window.electronAPI.aiListModels(opts);
  },

  async testConnection(): Promise<{ ok: boolean; message: string }> {
    if (!window.electronAPI?.aiTestConnection) return { ok: false, message: NOT_ELECTRON };
    return await window.electronAPI.aiTestConnection();
  },

  async generateImage(options: AIImageGenOptions): Promise<AIImageGenResult> {
    if (!window.electronAPI?.aiGenerateImage) {
      return { ok: false, code: 'NOT_ELECTRON', error: NOT_ELECTRON };
    }
    return await window.electronAPI.aiGenerateImage(options);
  },

  /** 流式对话：增量通过 onStream 回调推送 */
  async streamChat(requestId: string, messages: ChatMessage[]): Promise<AIStreamResult> {
    if (!window.electronAPI?.aiStreamChat) return ERROR_STREAM;
    return await window.electronAPI.aiStreamChat(requestId, messages);
  },

  async abort(requestId: string): Promise<{ ok: boolean }> {
    if (!window.electronAPI?.aiAbort) return { ok: false };
    return await window.electronAPI.aiAbort(requestId);
  },

  /** 订阅流式增量事件，返回取消订阅函数 */
  onStream(callback: (event: AIStreamEvent) => void): () => void {
    if (!window.electronAPI?.aiOnStream) return () => {};
    return window.electronAPI.aiOnStream(callback);
  },
};

/** 生成请求 id */
export function newAIRequestId(): string {
  return `ai-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;
}
