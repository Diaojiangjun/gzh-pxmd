/**
 * AI 提示词与动作定义
 *
 * **提示词原文照搬 doocs/md**（`apps/web/src/i18n/messages/zh-CN/ai.ts`），
 * 请求组装逻辑对齐 `components/ai/tool-box/ToolBoxPopover.vue` 的 runAIAction。
 */
import type { ChatMessage } from './aiService';

// ---------- 系统提示词 ----------

/** 工具箱系统提示词 */
export const TOOLBOX_SYSTEM_PROMPT =
  '你是一名专业的多语言文本助手，请根据用户的指令处理下列内容。在输出时，不要输出任何额外的信息，只输出处理后的文本。';

/** AI 助手（对话）系统提示词 */
export const CHAT_SYSTEM_PROMPT = '你是一个专业的 Markdown 编辑器助手，请用简洁中文回答。';

/** 引用全文时的包装（对齐 doocs/md chat.systemQuote） */
export const chatQuoteTemplate = (content: string): string =>
  `下面是一篇 Markdown 文章全文，请严格以此为主完成后续指令：\n\n${content}`;

/** 待处理文本包装 */
export const textToProcessTemplate = (text: string): string => `待处理文本：\n${text}`;

/** 附加要求包装 */
export const satisfyRequirementsTemplate = (requirements: string): string =>
  `请同时满足以下要求：${requirements}。`;

/** 未选择动作时的兜底指令 */
export const OPTIMIZE_DEFAULT_PROMPT = '请根据最佳实践优化文本。';

// ---------- 工具箱动作（7 内置 + 自定义） ----------

export type ToolboxActionKey =
  | 'optimize'
  | 'summarize'
  | 'spellcheck'
  | 'translate-zh'
  | 'translate-en'
  | 'expand'
  | 'continue'
  | 'custom';

export interface ToolboxAction {
  key: ToolboxActionKey;
  label: string;
  prompt: string;
}

export const TOOLBOX_ACTIONS: ToolboxAction[] = [
  { key: 'optimize', label: '优化文本', prompt: '请优化文本，使其更通顺易读。' },
  { key: 'summarize', label: '文章总结', prompt: '请对文本进行摘要，输出主要观点和结论。' },
  {
    key: 'spellcheck',
    label: '错别字纠正',
    prompt: '请找出并纠正文本中的错别字、标点和语法错误。',
  },
  { key: 'translate-zh', label: '翻译为中文', prompt: '请将文本翻译为地道的中文。' },
  { key: 'translate-en', label: '翻译为英文', prompt: '请将文本翻译为自然流畅的英文。' },
  {
    key: 'expand',
    label: '扩写',
    prompt: '请对文本进行扩写，丰富细节、充实内容，保持原有风格和意图。',
  },
  {
    key: 'continue',
    label: '续写',
    prompt: '请根据文本内容，以相同风格继续向下补充撰写，保持语言连贯。',
  },
  { key: 'custom', label: '自定义', prompt: '' },
];

/**
 * 组装工具箱请求消息（对齐 doocs/md runAIAction）
 */
export function buildToolboxMessages(
  action: ToolboxActionKey,
  customPrompts: string[],
  text: string
): ChatMessage[] {
  const picked = TOOLBOX_ACTIONS.find((a) => a.key === action);
  const parts: string[] = [];

  if (picked?.prompt) parts.push(picked.prompt);
  if (customPrompts.length) parts.push(satisfyRequirementsTemplate(customPrompts.join('、')));
  if (!parts.length) parts.push(OPTIMIZE_DEFAULT_PROMPT);

  const userCommand = parts.join(' ');
  return [
    { role: 'system', content: TOOLBOX_SYSTEM_PROMPT },
    { role: 'user', content: `${userCommand}\n\n${textToProcessTemplate(text)}` },
  ];
}

// ---------- 生图参数（对齐 doocs/md imageConfig） ----------

export const IMAGE_SIZES = [
  { value: '1024x1024', label: '正方形 1024×1024' },
  { value: '1792x1024', label: '横版 1792×1024' },
  { value: '1024x1792', label: '竖版 1024×1792' },
];

export const IMAGE_QUALITIES = [
  { value: 'standard', label: '标准' },
  { value: 'hd', label: '高清' },
];

export const IMAGE_STYLES = [
  { value: 'natural', label: '自然' },
  { value: 'vivid', label: '鲜明' },
];
