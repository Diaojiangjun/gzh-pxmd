/**
 * 图床服务封装（渲染进程侧）
 * 统一 Electron 桌面端与 Web 预览两种环境的差异。
 */

import type { ImageHostConfig } from '../../electron/imageHost';

export type { ImageHostConfig };

export interface ImageHostPreset {
  type: string;
  name: string;
  hint: string;
}

export interface ImageHostState {
  config: ImageHostConfig;
  presets: ImageHostPreset[];
}

const NOT_ELECTRON_RESULT = { ok: false, error: '图床功能仅在桌面端（Electron）可用' };

const EMPTY_STATE: ImageHostState = {
  config: { type: 'none' },
  presets: [{ type: 'none', name: '不启用（仅本地）', hint: '' }],
};

export const imageHostService = {
  async getConfig(): Promise<ImageHostState> {
    if (!window.electronAPI) return EMPTY_STATE;
    return await window.electronAPI.imageHostGetConfig();
  },

  async setConfig(config: Partial<ImageHostConfig>): Promise<ImageHostConfig> {
    if (!window.electronAPI) return { type: 'none' };
    const res = await window.electronAPI.imageHostSetConfig(config);
    return res.config;
  },

  /** 上传 base64 dataUrl 到图床，返回 https 外链 */
  async upload(dataUrl: string, fileName?: string): Promise<{ ok: boolean; url?: string; error?: string }> {
    if (!window.electronAPI) return NOT_ELECTRON_RESULT;
    return await window.electronAPI.imageHostUpload({ dataUrl, fileName });
  },
};
