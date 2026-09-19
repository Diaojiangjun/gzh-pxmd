import { contextBridge, ipcRenderer } from 'electron';
import type { ImageHostConfig } from './imageHost';
// AI 服务预设的类型统一从 ai.ts 复用，避免两处定义漂移
import type { AIServicePreset } from './ai';

export type { AIServicePreset };

export interface AIImageConfigInfo {
  configured: boolean;
  apiKeyMasked: string;
  type: string;
  endpoint: string;
  model: string;
}

export interface AIConfigInfo {
  configured: boolean;
  apiKeyMasked: string;
  type: string;
  endpoint: string;
  model: string;
  temperature: number;
  maxToken: number;
  image: AIImageConfigInfo;
}

/** 配置补丁：apiKey 传掩码值表示「未修改」，传空串表示「清空」 */
export interface AIConfigPatch {
  type?: string;
  endpoint?: string;
  apiKey?: string;
  model?: string;
  temperature?: number;
  maxToken?: number;
  image?: { type?: string; endpoint?: string; apiKey?: string; model?: string };
}

export interface ChatMessage {
  role: 'system' | 'user' | 'assistant';
  content: string;
}

/** 流式增量事件（主进程 → 渲染层） */
export interface AIStreamEvent {
  requestId: string;
  type: 'delta' | 'reasoning' | 'done' | 'error' | 'aborted';
  text?: string;
  code?: string;
  error?: string;
}

export interface AIStreamResult {
  ok: boolean;
  text?: string;
  code?: string;
  error?: string;
}

export interface ElectronAPI {
  platform: string;
  isElectron: boolean;
  openFile: () => Promise<{ canceled: boolean; filePath?: string; content?: string }>;
  saveFile: (content: string, defaultPath?: string) => Promise<{ canceled: boolean; filePath?: string }>;
  exportHtml: (htmlContent: string, defaultName?: string) => Promise<{ canceled: boolean; filePath?: string }>;
  exportPdf: (htmlContent: string, title?: string, defaultName?: string) => Promise<{ canceled: boolean; filePath?: string; error?: string }>;
  copyToWechat: (html: string, plainText: string) => Promise<boolean>;
  selectImages: () => Promise<Array<{ name: string; path: string; dataUrl: string; size: number }>>;
  selectStickerFolder: () => Promise<Array<{ name: string; path: string; dataUrl: string; isGif: boolean }>>;
  aiGetConfig: () => Promise<AIConfigInfo>;
  aiSetConfig: (patch: AIConfigPatch) => Promise<AIConfigInfo>;
  aiGetServices: () => Promise<{ services: AIServicePreset[]; imageServices: AIServicePreset[] }>;
  aiListModels: (opts?: { image?: boolean }) => Promise<{ ok: boolean; models: string[]; error?: string }>;
  aiTestConnection: () => Promise<{ ok: boolean; message: string }>;
  aiGenerateImage: (options: {
    prompt: string;
    size?: string;
    quality?: string;
    style?: string;
    n?: number;
  }) => Promise<{ ok: boolean; dataUrl?: string; url?: string; code?: string; error?: string }>;
  aiStreamChat: (requestId: string, messages: ChatMessage[]) => Promise<AIStreamResult>;
  aiAbort: (requestId: string) => Promise<{ ok: boolean }>;
  aiOnStream: (callback: (event: AIStreamEvent) => void) => () => void;
  imageHostGetConfig: () => Promise<{
    config: ImageHostConfig;
    presets: Array<{ type: string; name: string; hint: string }>;
  }>;
  imageHostSetConfig: (config: Partial<ImageHostConfig>) => Promise<{ config: ImageHostConfig }>;
  imageHostUpload: (data: {
    dataUrl: string;
    fileName?: string;
  }) => Promise<{ ok: boolean; url?: string; error?: string }>;
  openDataDirectory: () => Promise<{ ok: boolean; path: string; error?: string }>;
  // ---- 文章存储模式（browser = 本地存储 / folder = 本地文件夹）----
  /** 同步读取（配合渲染层同步接口，见 main.ts 注释） */
  storageGetConfigSync: () => {
    mode: 'browser' | 'folder';
    folderPath: string;
    folderUsable: boolean;
    fileCount: number;
  };
  /** 同步读取文件夹中的文章列表（非文件夹模式返回空数组） */
  storageListArticlesSync: () => Array<{
    id: string;
    title: string;
    content: string;
    createdAt: number;
    updatedAt: number;
    wordCount: number;
  }>;
  storagePickFolder: () => Promise<{ canceled: boolean; path: string; fileCount: number }>;
  storageSetMode: (payload: {
    mode: 'browser' | 'folder';
    folderPath?: string;
    migrate?: Array<{ title: string; content: string }>;
  }) => Promise<{
    ok: boolean;
    mode?: 'browser' | 'folder';
    folderPath?: string;
    migrated?: number;
    skipped?: number;
    fileCount?: number;
    error?: string;
  }>;
  storageRescan: () => Promise<{ ok: boolean; count: number }>;
  storageSaveArticle: (article: {
    id?: string;
    title: string;
    content: string;
  }) => Promise<{ ok: boolean; id?: string; skipped?: boolean; error?: string }>;
  storageDeleteArticle: (id: string) => Promise<{ ok: boolean; skipped?: boolean; error?: string }>;
  /** 同步为新文章取一个不冲突的文件名（渲染层新建时用作 id，从源头避免重复文件） */
  storageResolveArticleIdSync: (title: string) => string;
  /** 重命名文章文件，返回新文件名（渲染层需同步更新 id） */
  storageRenameArticle: (payload: {
    id: string;
    title: string;
  }) => Promise<{ ok: boolean; id?: string; error?: string }>;
  /** 扫描重复文件（只读，不改动任何文件） */
  storageScanDuplicates: () => Promise<{
    ok: boolean;
    groups: Array<{
      base: string;
      files: Array<{ id: string; size: number; mtime: number; preview: string }>;
    }>;
    error?: string;
  }>;
  /** 把重复文件移入系统回收站（可恢复） */
  storageTrashDuplicates: (
    ids: string[]
  ) => Promise<{ ok: boolean; trashed: number; failed: string[]; error?: string }>;
  storageOpenFolder: () => Promise<{ ok: boolean; error?: string }>;
  // ---- 文件级模板（<文章文件夹>/_templates/*.md）----
  storageListTemplatesSync: () => {
    available: boolean;
    dir: string;
    templates: Array<{ id: string; name: string; content: string }>;
  };
  storageSaveTemplate: (payload: {
    name: string;
    content: string;
  }) => Promise<{ ok: boolean; id?: string; error?: string }>;
  storageDeleteTemplate: (id: string) => Promise<{ ok: boolean; error?: string }>;
  storageOpenTemplatesDir: () => Promise<{ ok: boolean; error?: string }>;
  minimizeWindow: () => void;
  maximizeWindow: () => void;
  closeWindow: () => void;
  isMaximized: () => Promise<boolean>;
  onMenuAction: (callback: (action: string) => void) => () => void;
}

const electronAPI: ElectronAPI = {
  platform: process.platform,
  isElectron: true,
  openFile: () => ipcRenderer.invoke('dialog:openFile'),
  saveFile: (content, defaultPath) => ipcRenderer.invoke('dialog:saveFile', { content, defaultPath }),
  exportHtml: (htmlContent, defaultName) => ipcRenderer.invoke('dialog:exportHtml', { htmlContent, defaultName }),
  exportPdf: (htmlContent, title, defaultName) => ipcRenderer.invoke('dialog:exportPdf', { htmlContent, title, defaultName }),
  copyToWechat: (html, plainText) => ipcRenderer.invoke('clipboard:copyToWechat', { html, plainText }),
  selectImages: () => ipcRenderer.invoke('dialog:selectImages'),
  selectStickerFolder: () => ipcRenderer.invoke('dialog:selectStickerFolder'),
  aiGetConfig: () => ipcRenderer.invoke('ai:getConfig'),
  aiSetConfig: (patch) => ipcRenderer.invoke('ai:setConfig', patch),
  aiGetServices: () => ipcRenderer.invoke('ai:getServices'),
  aiListModels: (opts) => ipcRenderer.invoke('ai:listModels', opts),
  aiTestConnection: () => ipcRenderer.invoke('ai:testConnection'),
  aiGenerateImage: (options) => ipcRenderer.invoke('ai:generateImage', options),
  aiStreamChat: (requestId, messages) => ipcRenderer.invoke('ai:streamChat', { requestId, messages }),
  aiAbort: (requestId) => ipcRenderer.invoke('ai:abort', requestId),
  aiOnStream: (callback) => {
    const subscription = (_event: unknown, payload: AIStreamEvent) => callback(payload);
    ipcRenderer.on('ai:stream', subscription);
    return () => ipcRenderer.removeListener('ai:stream', subscription);
  },
  imageHostGetConfig: () => ipcRenderer.invoke('imageHost:getConfig'),
  imageHostSetConfig: (config) => ipcRenderer.invoke('imageHost:setConfig', config),
  imageHostUpload: (data) => ipcRenderer.invoke('imageHost:upload', data),
  openDataDirectory: () => ipcRenderer.invoke('app:openDataDirectory'),
  storageGetConfigSync: () => ipcRenderer.sendSync('storage:getConfigSync'),
  storageListArticlesSync: () => ipcRenderer.sendSync('storage:listArticlesSync'),
  storagePickFolder: () => ipcRenderer.invoke('storage:pickFolder'),
  storageSetMode: (payload) => ipcRenderer.invoke('storage:setMode', payload),
  storageRescan: () => ipcRenderer.invoke('storage:rescan'),
  storageSaveArticle: (article) => ipcRenderer.invoke('storage:saveArticle', article),
  storageDeleteArticle: (id) => ipcRenderer.invoke('storage:deleteArticle', id),
  storageResolveArticleIdSync: (title) => ipcRenderer.sendSync('storage:resolveArticleIdSync', title),
  storageRenameArticle: (payload) => ipcRenderer.invoke('storage:renameArticle', payload),
  storageScanDuplicates: () => ipcRenderer.invoke('storage:scanDuplicates'),
  storageTrashDuplicates: (ids) => ipcRenderer.invoke('storage:trashDuplicates', ids),
  storageOpenFolder: () => ipcRenderer.invoke('storage:openFolder'),
  storageListTemplatesSync: () => ipcRenderer.sendSync('storage:listTemplatesSync'),
  storageSaveTemplate: (payload) => ipcRenderer.invoke('storage:saveTemplate', payload),
  storageDeleteTemplate: (id) => ipcRenderer.invoke('storage:deleteTemplate', id),
  storageOpenTemplatesDir: () => ipcRenderer.invoke('storage:openTemplatesDir'),
  minimizeWindow: () => ipcRenderer.send('window:minimize'),
  maximizeWindow: () => ipcRenderer.send('window:maximize'),
  closeWindow: () => ipcRenderer.send('window:close'),
  isMaximized: () => ipcRenderer.invoke('window:isMaximized'),
  onMenuAction: (callback) => {
    const subscription = (_event: any, action: string) => callback(action);
    ipcRenderer.on('menu:action', subscription);
    return () => ipcRenderer.removeListener('menu:action', subscription);
  },
};

contextBridge.exposeInMainWorld('electronAPI', electronAPI);
