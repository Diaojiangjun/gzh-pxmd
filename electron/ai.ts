/**
 * AI 能力 —— 主进程网络层
 *
 * **实现逻辑全面对齐 doocs/md**：
 *  - 参考 `packages/shared/src/configs/ai-service-options.ts`：统一的服务预设（每个服务带 endpoint + 模型列表）
 *  - 参考 `apps/web/src/composables/useAIFetch.ts`：所有服务**统一走 OpenAI 兼容协议**
 *      · 对话：POST {endpoint}/chat/completions（stream: true，SSE）
 *      · 生图：POST {endpoint}/images/generations
 *      · 模型发现：GET {endpoint}/models
 *      · `resolveEndpointUrl` 自动补全路径、`buildAIHeaders` 统一鉴权头
 *      · `AbortController` 支持中途取消
 *
 * 与 doocs/md 的差异：网络请求放在 **主进程**（而非渲染进程），
 * 这样 API Key 不进入前端内存，也没有跨域限制。
 */
export interface AIServicePreset {
  /** 服务标识 */
  key: string;
  /** 展示名 */
  label: string;
  /** API 端点（不含 /chat/completions） */
  endpoint: string;
  /** 常用模型列表（UI 下拉候选） */
  models: string[];
}

/** 服务预设（对齐 doocs/md，全部为 OpenAI 兼容端点） */
export const AI_SERVICES: AIServicePreset[] = [
  {
    key: 'deepseek',
    label: 'DeepSeek',
    endpoint: 'https://api.deepseek.com',
    models: ['deepseek-v4-pro', 'deepseek-v4-flash', 'deepseek-chat', 'deepseek-reasoner'],
  },
  {
    key: 'openai',
    label: 'OpenAI',
    endpoint: 'https://api.openai.com/v1',
    models: [
      'gpt-5.5', 'gpt-5.4', 'gpt-5.4-mini', 'gpt-5.4-nano', 'gpt-5-mini', 'gpt-5-nano',
      'o3', 'o3-mini', 'o4-mini', 'gpt-4.1', 'gpt-4.1-mini', 'gpt-4.1-nano',
      'gpt-4o', 'gpt-4o-mini', 'gpt-4-turbo',
    ],
  },
  {
    key: 'google',
    label: 'Google Gemini',
    endpoint: 'https://generativelanguage.googleapis.com/v1beta/openai/',
    models: [
      'gemini-3.5-flash', 'gemini-3.1-flash-lite', 'gemini-2.5-pro',
      'gemini-2.5-flash', 'gemini-2.5-flash-lite', 'gemini-2.0-flash',
    ],
  },
  {
    key: 'anthropic',
    label: 'Anthropic Claude',
    // Anthropic 官方的 OpenAI 兼容端点
    endpoint: 'https://api.anthropic.com/v1',
    models: ['claude-opus-4-8', 'claude-sonnet-4-6', 'claude-haiku-4-5-20251001', 'claude-3-5-sonnet-latest'],
  },
  {
    key: 'xai',
    label: 'xAI Grok',
    endpoint: 'https://api.x.ai/v1',
    models: ['grok-4', 'grok-3', 'grok-3-mini', 'grok-3-fast', 'grok-2', 'grok-2-vision-1212'],
  },
  {
    key: 'mistral',
    label: 'Mistral AI',
    endpoint: 'https://api.mistral.ai/v1',
    models: [
      'mistral-large-latest', 'mistral-medium-latest', 'mistral-small-latest',
      'codestral-latest', 'ministral-8b-latest', 'ministral-3b-latest', 'pixtral-large-latest',
    ],
  },
  {
    key: 'openrouter',
    label: 'OpenRouter',
    endpoint: 'https://openrouter.ai/api/v1',
    models: [
      'openai/gpt-5.4', 'anthropic/claude-sonnet-4-6', 'anthropic/claude-opus-4-8',
      'google/gemini-2.5-pro', 'google/gemini-2.5-flash',
      'deepseek/deepseek-v4-pro', 'deepseek/deepseek-v4-flash',
      'meta-llama/llama-4-maverick', 'x-ai/grok-3',
      'mistralai/mistral-large-latest', 'qwen/qwen3-235b-a22b',
    ],
  },
  {
    key: 'groq',
    label: 'Groq',
    endpoint: 'https://api.groq.com/openai/v1',
    models: [
      'llama-3.3-70b-versatile', 'llama-3.1-8b-instant',
      'openai/gpt-oss-120b', 'openai/gpt-oss-20b', 'mixtral-8x7b-32768', 'gemma2-9b-it',
    ],
  },
  {
    key: 'qwen',
    label: '通义千问',
    endpoint: 'https://dashscope.aliyuncs.com/compatible-mode/v1',
    models: [
      'qwen3-max', 'qwen3-plus', 'qwen3-flash', 'qwen-max-latest', 'qwen-plus-latest',
      'qwen-turbo-latest', 'qwen-long', 'qwen-vl-max-latest', 'qwen-vl-plus-latest',
      'qwen-coder-plus-latest', 'qwen-coder-turbo-latest',
      'qwen2.5-72b-instruct', 'qwen2.5-32b-instruct', 'qwen2.5-14b-instruct', 'qwen2.5-7b-instruct',
      'qwen2.5-coder-32b-instruct', 'qwen2.5-coder-7b-instruct', 'deepseek-v3', 'deepseek-r1',
    ],
  },
  {
    key: 'hunyuan',
    label: '腾讯混元',
    endpoint: 'https://api.hunyuan.cloud.tencent.com/v1',
    models: [
      'hunyuan-turbos-latest', 'hunyuan-t1-latest', 'hunyuan-pro', 'hunyuan-turbo',
      'hunyuan-standard-256k', 'hunyuan-standard-32K', 'hunyuan-standard', 'hunyuan-lite',
      'hunyuan-code', 'hunyuan-vision', 'hunyuan-role', 'hunyuan-functioncall', 'hunyuan-turbo-vision',
    ],
  },
  {
    key: 'doubao',
    label: '火山方舟（豆包）',
    endpoint: 'https://ark.cn-beijing.volces.com/api/v3',
    models: [
      'doubao-seed-1-6-250615', 'doubao-seed-1-6-flash-250615',
      'doubao-1-5-thinking-pro-250415', 'doubao-1-5-thinking-pro-m-250415',
      'doubao-1-5-pro-256k-250115', 'doubao-1-5-pro-32k-250115', 'doubao-1-5-lite-32k-250115',
      'doubao-1-5-vision-pro-250328', 'doubao-1-5-vision-lite-250315',
      'deepseek-v3-250324', 'deepseek-r1-250120', 'kimi-k2-250711',
    ],
  },
  {
    key: 'siliconflow',
    label: '硅基流动',
    endpoint: 'https://api.siliconflow.cn/v1',
    models: [
      'deepseek-ai/DeepSeek-V3.2', 'deepseek-ai/DeepSeek-R1', 'deepseek-ai/DeepSeek-V3',
      'Qwen/Qwen3-235B-A22B', 'Qwen/Qwen3-32B', 'Qwen/Qwen3-30B-A3B', 'Qwen/Qwen3-14B', 'Qwen/Qwen3-8B',
      'THUDM/GLM-Z1-32B-0414', 'THUDM/GLM-4-32B-0414', 'THUDM/GLM-4-9B-0414', 'Qwen/QwQ-32B',
      'Qwen/Qwen2.5-72B-Instruct', 'Qwen/Qwen2.5-32B-Instruct', 'Qwen/Qwen2.5-14B-Instruct', 'Qwen/Qwen2.5-7B-Instruct',
      'Qwen/Qwen2.5-Coder-32B-Instruct', 'Qwen/Qwen2.5-Coder-7B-Instruct',
      'Pro/deepseek-ai/DeepSeek-R1', 'Pro/deepseek-ai/DeepSeek-V3',
      'internlm/internlm2_5-20b-chat', 'internlm/internlm2_5-7b-chat',
    ],
  },
  {
    key: '302ai',
    label: '302.AI',
    endpoint: 'https://api.302.ai/v1',
    models: [
      'gpt-5.4', 'gpt-5.4-mini', 'gpt-4.1', 'gpt-4o', 'gpt-4o-mini', 'o3', 'o4-mini',
      'claude-sonnet-4-6', 'claude-opus-4-8', 'claude-haiku-4-5-20251001',
      'gemini-2.5-pro', 'gemini-2.5-flash', 'deepseek-v4-pro', 'deepseek-v4-flash', 'grok-3', 'grok-3-mini',
    ],
  },
  {
    key: 'bigmodel',
    label: '智谱 AI',
    endpoint: 'https://open.bigmodel.cn/api/paas/v4',
    models: [
      'glm-4.7', 'glm-4.7-flashx', 'glm-4.7-flash', 'glm-4.6',
      'glm-4.5-air', 'glm-4.5-airx', 'glm-4-long', 'glm-4-flash-250414', 'glm-4-flashx-250414',
    ],
  },
  {
    key: 'baichuan',
    label: '百川智能',
    endpoint: 'https://api.baichuan-ai.com/v1',
    models: ['Baichuan4-Turbo', 'Baichuan4-Air', 'Baichuan4', 'Baichuan3-Turbo-128k', 'Baichuan3-Turbo'],
  },
  {
    key: 'lingyiwanwu',
    label: '零一万物',
    endpoint: 'https://api.lingyiwanwu.com/v1',
    models: ['yi-lightning', 'yi-large', 'yi-medium', 'yi-spark'],
  },
  {
    key: 'moonshot',
    label: '月之暗面（Kimi）',
    endpoint: 'https://api.moonshot.cn/v1',
    models: [
      'kimi-k2.7-code', 'kimi-k2.7-code-highspeed', 'kimi-k2.6', 'kimi-k2.5',
      'moonshot-v1-128k-vision-preview', 'moonshot-v1-32k-vision-preview', 'moonshot-v1-8k-vision-preview',
      'moonshot-v1-128k', 'moonshot-v1-32k', 'moonshot-v1-8k',
    ],
  },
  {
    key: 'minimax',
    label: 'MiniMax',
    endpoint: 'https://api.minimaxi.com/v1',
    models: [
      'MiniMax-M2.5', 'MiniMax-M2.5-highspeed', 'MiniMax-M2.1', 'MiniMax-M2.1-highspeed',
      'MiniMax-Text-01', 'abab6.5s-chat', 'abab6.5g-chat', 'abab6.5t-chat',
    ],
  },
  {
    key: 'stepfun',
    label: '阶跃星辰',
    endpoint: 'https://api.stepfun.com/v1',
    models: ['step-2-16k', 'step-2-mini', 'step-1-8k', 'step-1-flash'],
  },
  {
    key: 'ernie',
    label: '百度千帆',
    endpoint: 'https://qianfan.baidubce.com/v2',
    models: [
      'ernie-4.5-turbo-128k', 'ernie-4.5-turbo-32k', 'ernie-4.5-8k-preview',
      'ernie-4.0-turbo-128k', 'ernie-4.0-turbo-8k', 'ernie-4.0-8k',
      'ernie-speed-pro-128k', 'ernie-speed-128k', 'ernie-lite-pro-128k', 'ernie-lite-8k', 'ernie-tiny-8k',
    ],
  },
  {
    key: 'custom',
    label: '自定义 OpenAI 兼容服务',
    endpoint: '',
    models: [],
  },
];

/** 生图服务预设（对齐 doocs/md imageServiceOptions） */
export const IMAGE_SERVICES: AIServicePreset[] = [
  {
    key: 'openai',
    label: 'OpenAI',
    endpoint: 'https://api.openai.com/v1',
    models: ['gpt-image-1', 'gpt-image-1-mini', 'dall-e-3', 'dall-e-2'],
  },
  {
    key: 'google',
    label: 'Google Gemini',
    endpoint: 'https://generativelanguage.googleapis.com/v1beta/openai/',
    models: ['gemini-2.5-flash-image', 'gemini-3-pro-image', 'gemini-3.1-flash-image'],
  },
  {
    key: 'siliconflow',
    label: '硅基流动',
    endpoint: 'https://api.siliconflow.cn/v1',
    models: ['Kwai-Kolors/Kolors', 'Qwen/Qwen-Image', 'Qwen/Qwen-Image-Plus'],
  },
  {
    key: '302ai',
    label: '302.AI',
    endpoint: 'https://api.302.ai/302',
    models: [
      'gpt-image-1', 'gemini-2.5-flash-image', 'doubao-seedream-4-0-250828',
      'flux-kontext-max', 'flux-kontext-pro', 'midjourney-v7', 'ideogram-v3',
      'wan2.5-t2i-preview', 'official-qwen-image-plus', 'dall-e-3',
    ],
  },
  {
    key: 'custom',
    label: '自定义 OpenAI 兼容服务',
    endpoint: '',
    models: [],
  },
];

// ---------- 配置 ----------
export interface AIConfig {
  /** 服务类型 key */
  type: string;
  /** API 端点（不含 /chat/completions） */
  endpoint: string;
  /** API Key（仅存主进程） */
  apiKey: string;
  /** 模型名 */
  model: string;
  /** 温度 0~2 */
  temperature: number;
  /** 最大 token */
  maxToken: number;
}

/** 生图配置 */
export interface AIImageConfig {
  type: string;
  endpoint: string;
  apiKey: string;
  model: string;
}

export const DEFAULT_AI_CONFIG: AIConfig = {
  type: 'deepseek',
  endpoint: 'https://api.deepseek.com',
  apiKey: '',
  model: 'deepseek-chat',
  temperature: 1,
  maxToken: 2048,
};

export const DEFAULT_IMAGE_CONFIG: AIImageConfig = {
  type: 'openai',
  endpoint: 'https://api.openai.com/v1',
  apiKey: '',
  model: 'dall-e-3',
};

// ---------- 请求工具（对齐 doocs/md useAIFetch.ts） ----------

const CHAT_COMPLETIONS_PATH = '/chat/completions';
const IMAGE_GENERATIONS_PATH = '/images/generations';
const MODELS_PATH = '/models';

function stripSuffix(pathname: string, suffix: string): string {
  return pathname.endsWith(suffix) ? pathname.slice(0, -suffix.length) : pathname;
}

/**
 * 归一化端点：自动补上 /chat/completions、/images/generations、/models
 * （对齐 doocs/md resolveEndpointUrl）
 */
export function resolveEndpointUrl(endpoint: string, kind: 'chat' | 'image' | 'models'): string {
  const raw = (endpoint || '').trim();
  if (!raw) throw new Error('请先填写 API 端点');

  let url: URL;
  try {
    url = new URL(raw);
  } catch {
    throw new Error(`端点格式有误：${raw}`);
  }

  let pathname = url.pathname.replace(/\/+$/, '');
  if (kind === 'chat') {
    if (!pathname.endsWith(CHAT_COMPLETIONS_PATH)) pathname += CHAT_COMPLETIONS_PATH;
  } else if (kind === 'image') {
    if (!pathname.includes('/images/') && !pathname.endsWith(IMAGE_GENERATIONS_PATH)) {
      pathname += IMAGE_GENERATIONS_PATH;
    }
  } else {
    pathname = stripSuffix(pathname, CHAT_COMPLETIONS_PATH);
    pathname = stripSuffix(pathname, IMAGE_GENERATIONS_PATH);
    if (!pathname.endsWith(MODELS_PATH)) pathname += MODELS_PATH;
  }
  url.pathname = pathname || '/';
  return url.toString();
}

/** 统一鉴权头（对齐 doocs/md buildAIHeaders） */
export function buildAIHeaders(apiKey: string, type: string): Record<string, string> {
  const headers: Record<string, string> = { 'Content-Type': 'application/json' };
  if (apiKey && type !== 'default') headers.Authorization = `Bearer ${apiKey}`;
  return headers;
}

/** 从任意文本中抹掉形似密钥的片段（防止服务端回显 Key 后被展示给用户） */
export function redactSecret(text: string): string {
  return String(text ?? '')
    .replace(/(Bearer\s+)[A-Za-z0-9._-]{8,}/gi, '$1***')
    .replace(/\b(sk|ak|api[_-]?key|token)[-_:=\s]{0,3}[A-Za-z0-9._-]{8,}/gi, '$1***');
}

/** 错误友好化 */
export function classifyAIError(message: string): { code: string; friendly: string } {
  const m = message || '';
  if (/401|invalid.*key|unauthorized|api key/i.test(m)) {
    return { code: 'BAD_KEY', friendly: 'API Key 无效或未授权，请检查密钥是否正确' };
  }
  if (/402|429|quota|insufficient|balance|rate limit/i.test(m)) {
    return { code: 'QUOTA', friendly: '配额不足或请求过于频繁，请稍后再试或充值' };
  }
  if (/404|model.*not.*found|no such model|未开通/i.test(m)) {
    return { code: 'BAD_MODEL', friendly: '模型不存在或未开通，请检查模型名称' };
  }
  if (/ENOTFOUND|ECONNREFUSED|ETIMEDOUT|fetch failed|network|socket hang up/i.test(m)) {
    return { code: 'NETWORK', friendly: '网络连接失败，请检查网络或端点地址' };
  }
  if (/端点格式|请先填写 API 端点/i.test(m)) {
    return { code: 'BAD_URL', friendly: redactSecret(m) };
  }
  // 未知错误绝不回传原始报文——服务端可能把请求头里的 Key 回显在错误体里
  return { code: 'UNKNOWN', friendly: redactSecret(m).slice(0, 200) || '请求失败，请稍后重试' };
}

export interface ChatMessage {
  role: 'system' | 'user' | 'assistant';
  content: string;
}

/**
 * 把「调用方传入的 AbortSignal」与「超时」合并成一个 signal。
 * 任一触发都会中止请求，返回 cleanup 用于清理监听与定时器。
 */
function withTimeout(
  outer: AbortSignal | undefined,
  ms: number
): { signal: AbortSignal; cleanup: () => void } {
  const controller = new AbortController();
  const onAbort = () => controller.abort();
  if (outer) {
    if (outer.aborted) controller.abort();
    else outer.addEventListener('abort', onAbort, { once: true });
  }
  const timer = setTimeout(() => controller.abort(), ms);
  return {
    signal: controller.signal,
    cleanup: () => {
      clearTimeout(timer);
      outer?.removeEventListener('abort', onAbort);
    },
  };
}

export interface StreamCallbacks {
  onDelta?: (text: string) => void;
  /** 思考链增量（deepseek-reasoner 等推理模型） */
  onReasoning?: (text: string) => void;
}

/**
 * 流式对话（SSE）。返回完整文本。
 * 对齐 doocs/md fetchSSE：解析 `data:` 行的 choices[0].delta.content / reasoning_content
 */
export async function chatStream(
  config: AIConfig,
  messages: ChatMessage[],
  callbacks: StreamCallbacks,
  signal: AbortSignal
): Promise<string> {
  const url = resolveEndpointUrl(config.endpoint, 'chat');
  const headers = buildAIHeaders(config.apiKey, config.type);

  const payload = {
    model: config.model,
    messages,
    temperature: config.temperature,
    max_tokens: config.maxToken,
    stream: true,
  };

  const timeout = withTimeout(signal, 180_000);
  let res: Response;
  try {
    res = await fetch(url, {
      method: 'POST',
      headers,
      body: JSON.stringify(payload),
      signal: timeout.signal,
    });

    if (!res.ok || !res.body) {
      const errText = await res.text().catch(() => '');
      throw new Error(
        `响应错误：${res.status} ${res.statusText}${errText ? ` ${redactSecret(errText.slice(0, 300))}` : ''}`
      );
    }
  } catch (e) {
    timeout.cleanup();
    throw e;
  }

  const reader = res.body.getReader();
  const decoder = new TextDecoder('utf-8');
  let buffer = '';
  let full = '';

  /** 解析单行 SSE 数据 */
  const handleLine = (line: string) => {
    const trimmed = line.trim();
    if (!trimmed) return;
    // 规范允许 `data:{...}`（冒号后无空格），这里统一剥离前缀
    const data = trimmed.replace(/^data:\s?/, '');
    if (!data || data === '[DONE]') return;
    try {
      const json = JSON.parse(data);
      const delta = json?.choices?.[0]?.delta || {};
      if (delta.content) {
        full += delta.content;
        callbacks.onDelta?.(delta.content);
      }
      if (delta.reasoning_content) {
        callbacks.onReasoning?.(delta.reasoning_content);
      }
    } catch {
      // 忽略非 JSON 行
    }
  };

  try {
    for (;;) {
      const { value, done } = await reader.read();
      if (done) break;

      buffer += decoder.decode(value, { stream: true });
      const lines = buffer.split('\n');
      buffer = lines.pop() || '';
      for (const line of lines) handleLine(line);
    }

    // 收尾：flush 解码器内部残留的多字节序列，
    // 并处理最后一个「没有以换行结尾」的数据块（否则会丢最后一个 token）
    buffer += decoder.decode();
    if (buffer) {
      for (const line of buffer.split('\n')) handleLine(line);
    }
  } finally {
    timeout.cleanup();
  }

  return full;
}

/** 发现可用模型（GET /models） */
export async function listModels(config: {
  endpoint: string;
  apiKey: string;
  type: string;
}): Promise<string[]> {
  const url = resolveEndpointUrl(config.endpoint, 'models');
  const headers = buildAIHeaders(config.apiKey, config.type);
  const res = await fetch(url, {
    method: 'GET',
    headers,
    signal: AbortSignal.timeout(30_000),
  });
  const body = await res.text();
  if (!res.ok) {
    throw new Error(`${res.status} ${res.statusText} ${redactSecret(body.slice(0, 200))}`);
  }
  const data = JSON.parse(body);
  const list: unknown = data?.data ?? data?.models ?? [];
  if (!Array.isArray(list)) return [];
  return list
    .map((it: any) => (typeof it === 'string' ? it : it?.id ?? it?.name ?? ''))
    .filter((s: string) => !!s)
    .sort();
}

export interface ImageGenOptions {
  prompt: string;
  size?: string;
  quality?: string;
  style?: string;
  n?: number;
}

/** 文生图（POST /images/generations），返回 base64 dataURL 或远程 URL */
export async function generateImage(
  config: AIImageConfig,
  options: ImageGenOptions
): Promise<{ dataUrl?: string; url?: string }> {
  const url = resolveEndpointUrl(config.endpoint, 'image');
  const headers = buildAIHeaders(config.apiKey, config.type);

  const payload: Record<string, unknown> = {
    model: config.model,
    prompt: options.prompt,
    n: options.n ?? 1,
  };
  if (options.size) payload.size = options.size;

  // quality / style 是 OpenAI 图像模型专有参数，其他服务（Gemini / 硅基流动等）传了会直接 400
  const model = String(config.model || '').toLowerCase();
  const openaiStyleModel = config.type === 'openai' || /^(official-)?(dall-e|gpt-image)/.test(model);
  if (openaiStyleModel) {
    if (options.quality) payload.quality = options.quality;
    if (options.style) payload.style = options.style;
  }

  const res = await fetch(url, {
    method: 'POST',
    headers,
    body: JSON.stringify(payload),
    signal: AbortSignal.timeout(180_000),
  });

  const body = await res.text();
  if (!res.ok) {
    throw new Error(
      `响应错误：${res.status} ${res.statusText} ${redactSecret(body.slice(0, 300))}`
    );
  }

  const data = JSON.parse(body);
  const first = data?.data?.[0];
  if (!first) throw new Error('未收到有效的图像数据');

  if (first.b64_json) {
    // 部分服务返回 jpeg/webp，按响应里的 mime 推断，缺省才用 png
    const mime = String(first.mime_type || data?.mime_type || 'image/png');
    return { dataUrl: `data:${mime};base64,${first.b64_json}` };
  }
  if (first.url) {
    return { url: first.url };
  }
  throw new Error('未收到有效的图像数据');
}

/** 连接测试：最小化请求验证 /chat/completions 可用 */
export async function testAIConnection(config: AIConfig): Promise<{ ok: boolean; message: string }> {
  try {
    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), 20_000);
    try {
      await chatStream(
        { ...config, maxToken: 8, temperature: 0 },
        [{ role: 'user', content: 'hi' }],
        {},
        controller.signal
      );
      return { ok: true, message: '测试成功，/chat/completions 可用' };
    } finally {
      clearTimeout(timer);
    }
  } catch (e: any) {
    const { friendly } = classifyAIError(e?.message || String(e));
    return { ok: false, message: `测试失败：${friendly}` };
  }
}
