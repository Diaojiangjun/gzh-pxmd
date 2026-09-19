import { app, BrowserWindow, ipcMain, dialog, clipboard, shell, ClipboardItem } from 'electron';
import path from 'path';
import fs from 'fs';
import { setupApplicationMenu } from './menu';
import {
  chatStream,
  listModels,
  generateImage,
  testAIConnection,
  classifyAIError,
  AI_SERVICES,
  IMAGE_SERVICES,
  DEFAULT_AI_CONFIG,
  DEFAULT_IMAGE_CONFIG,
  AIConfig,
  AIImageConfig,
  ChatMessage,
} from './ai';
import {
  uploadImage,
  ImageHostConfig,
  ImageHostType,
  IMAGE_HOST_PRESETS,
  buildFileName,
} from './imageHost';
import { registerStorageIpc } from './articleStore';

let mainWindow: BrowserWindow | null = null;

// ---------- AI 配置存储（API Key 只存主进程可读的 userData 目录） ----------
function getAIConfigPath(): string {
  return path.join(app.getPath('userData'), 'ai-config.json');
}

/** 旧版 provider key → 新版服务 key 的迁移映射 */
const LEGACY_PROVIDER_MAP: Record<string, string> = {
  gemini: 'google',
  anthropic: 'anthropic',
  openai: 'openai',
  deepseek: 'deepseek',
  qwen: 'qwen',
  doubao: 'doubao',
  bigmodel: 'bigmodel',
  moonshot: 'moonshot',
  openrouter: 'openrouter',
  custom: 'custom',
};

function readAIConfig(): AIConfig {
  try {
    const raw = fs.readFileSync(getAIConfigPath(), 'utf-8');
    const p = JSON.parse(raw);

    // 兼容旧版配置：{ provider, baseURL } → { type, endpoint }
    let type = typeof p.type === 'string' ? p.type : '';
    if (!type && typeof p.provider === 'string') {
      type = LEGACY_PROVIDER_MAP[p.provider] ?? p.provider;
    }
    if (!AI_SERVICES.some((s) => s.key === type)) type = DEFAULT_AI_CONFIG.type;
    const preset = AI_SERVICES.find((s) => s.key === type);

    const legacyEndpoint = typeof p.baseURL === 'string' ? p.baseURL : '';
    const endpoint =
      typeof p.endpoint === 'string' && p.endpoint
        ? p.endpoint
        : legacyEndpoint || preset?.endpoint || '';

    return {
      type,
      endpoint,
      apiKey: typeof p.apiKey === 'string' ? p.apiKey : '',
      model:
        typeof p.model === 'string' && p.model
          ? p.model
          : preset?.models[0] || DEFAULT_AI_CONFIG.model,
      temperature:
        typeof p.temperature === 'number' ? p.temperature : DEFAULT_AI_CONFIG.temperature,
      maxToken:
        typeof p.maxToken === 'number' && p.maxToken > 0 ? p.maxToken : DEFAULT_AI_CONFIG.maxToken,
    };
  } catch {
    return { ...DEFAULT_AI_CONFIG };
  }
}

function getImageConfigPath(): string {
  return path.join(app.getPath('userData'), 'ai-image-config.json');
}

function readImageConfig(): AIImageConfig {
  try {
    const raw = fs.readFileSync(getImageConfigPath(), 'utf-8');
    const p = JSON.parse(raw);
    const type = IMAGE_SERVICES.some((s) => s.key === p.type) ? p.type : DEFAULT_IMAGE_CONFIG.type;
    const preset = IMAGE_SERVICES.find((s) => s.key === type);
    return {
      type,
      endpoint: typeof p.endpoint === 'string' && p.endpoint ? p.endpoint : preset?.endpoint || '',
      apiKey: typeof p.apiKey === 'string' ? p.apiKey : '',
      model:
        typeof p.model === 'string' && p.model ? p.model : preset?.models[0] || DEFAULT_IMAGE_CONFIG.model,
    };
  } catch {
    return { ...DEFAULT_IMAGE_CONFIG };
  }
}

function writeAIConfig(config: AIConfig): void {
  // 写失败要抛出去：否则 IPC 仍返回「已保存」，用户以为密钥落盘了
  fs.mkdirSync(app.getPath('userData'), { recursive: true });
  fs.writeFileSync(getAIConfigPath(), JSON.stringify(config, null, 2), {
    encoding: 'utf-8',
    // 密钥文件仅本用户可读写
    mode: 0o600,
  });
}

function writeImageConfig(config: AIImageConfig): void {
  fs.mkdirSync(app.getPath('userData'), { recursive: true });
  fs.writeFileSync(getImageConfigPath(), JSON.stringify(config, null, 2), {
    encoding: 'utf-8',
    mode: 0o600,
  });
}

/** 返回给渲染进程的配置信息（不泄露完整 Key，只给掩码） */
function maskApiKey(apiKey: string): string {
  if (!apiKey) return '';
  // 短密钥直接全掩码——否则「前4+后4」的掩码反而会暴露大部分字符
  if (apiKey.length < 16) return '••••••••';
  return apiKey.slice(0, 4) + '••••••••' + apiKey.slice(-4);
}

function createWindow() {
  mainWindow = new BrowserWindow({
    width: 1280,
    height: 860,
    minWidth: 960,
    minHeight: 640,
    title: '宝藏排版器 - 微信公众号排版工具',
    titleBarStyle: process.platform === 'darwin' ? 'hiddenInset' : 'default',
    frame: process.platform === 'darwin' ? false : true,
    backgroundColor: '#f8fafc',
    webPreferences: {
      preload: path.join(__dirname, 'preload.js'),
      nodeIntegration: false,
      contextIsolation: true,
      webSecurity: true,
      // 渲染层不需要 Node 能力，沙箱再收一层
      sandbox: true,
    },
  });

  // 安全：把所有弹窗/跳转拦下来，外链交给系统浏览器，防止应用窗口被导航到外部页面
  mainWindow.webContents.setWindowOpenHandler(({ url }) => {
    if (/^https?:/i.test(url)) void shell.openExternal(url);
    return { action: 'deny' };
  });
  mainWindow.webContents.on('will-navigate', (event, url) => {
    const allowDev = process.env.NODE_ENV === 'development' || !app.isPackaged;
    const isLocalDev = allowDev && /^http:\/\/localhost:\d+/.test(url);
    const isLocalFile = url.startsWith('file://');
    if (!isLocalDev && !isLocalFile) {
      event.preventDefault();
      if (/^https?:/i.test(url)) void shell.openExternal(url);
    }
  });

  setupApplicationMenu(mainWindow);

  const isDev = process.env.NODE_ENV === 'development' || !app.isPackaged;
  const devUrl = process.env.VITE_DEV_SERVER_URL || 'http://localhost:3000';
  const prodIndex = path.join(__dirname, '../dist/index.html');

  // 用局部常量持有窗口引用：下面的重试定时器在闭包里使用，避免 mainWindow 被置空后的类型/空值问题
  const win = mainWindow;

  const loadApp = () => {
    if (win.isDestroyed()) return;
    if (isDev) void win.loadURL(devUrl);
    else void win.loadFile(prodIndex);
  };

  /**
   * 白屏兜底：dev server 在「依赖预打包尚未完成」时会拒绝模块请求，
   * 此时窗口加载失败并且**不会自愈**——用户看到的就是一片空白。
   * 这里监听加载失败并退避重试，让窗口自己恢复，而不是留给用户一个白屏。
   */
  let loadRetries = 0;
  const MAX_LOAD_RETRIES = 20;

  win.webContents.on('did-fail-load', (_event, errorCode, errorDescription, _url, isMainFrame) => {
    if (!isMainFrame) return;
    // -3 = ERR_ABORTED：通常是我们自己的重载/导航，不是故障
    if (errorCode === -3) return;
    if (loadRetries >= MAX_LOAD_RETRIES) {
      console.error(`[main] 页面加载失败，已重试 ${loadRetries} 次仍不成功：${errorDescription}`);
      return;
    }
    loadRetries += 1;
    const delay = Math.min(400 * loadRetries, 3000);
    console.warn(`[main] 页面加载失败（${errorDescription}），${delay}ms 后进行第 ${loadRetries} 次重试…`);
    setTimeout(loadApp, delay);
  });

  // 加载成功即清零，避免「早期失败次数」影响后续偶发重试的判断
  win.webContents.on('did-finish-load', () => {
    loadRetries = 0;
  });

  loadApp();

  mainWindow.on('closed', () => {
    mainWindow = null;
  });
}

// Dialog: Open Markdown file
ipcMain.handle('dialog:openFile', async () => {
  if (!mainWindow) return { canceled: true };
  const { canceled, filePaths } = await dialog.showOpenDialog(mainWindow, {
    title: '打开 Markdown 文章',
    properties: ['openFile'],
    filters: [
      { name: 'Markdown 文档', extensions: ['md', 'markdown', 'txt'] },
      { name: '所有文件', extensions: ['*'] },
    ],
  });

  if (canceled || filePaths.length === 0) {
    return { canceled: true };
  }

  const filePath = filePaths[0];
  const content = fs.readFileSync(filePath, 'utf-8');
  return { canceled: false, filePath, content };
});

// Dialog: Save Markdown file
ipcMain.handle('dialog:saveFile', async (_, { content, defaultPath }: { content: string; defaultPath?: string }) => {
  if (!mainWindow) return { canceled: true };
  const { canceled, filePath } = await dialog.showSaveDialog(mainWindow, {
    title: '保存 Markdown 文章',
    defaultPath: defaultPath || 'article.md',
    filters: [{ name: 'Markdown 文档', extensions: ['md'] }],
  });

  if (canceled || !filePath) {
    return { canceled: true };
  }

  fs.writeFileSync(filePath, content, 'utf-8');
  return { canceled: false, filePath };
});

// Dialog: Export HTML
ipcMain.handle('dialog:exportHtml', async (_, { htmlContent, defaultName }: { htmlContent: string; defaultName?: string }) => {
  if (!mainWindow) return { canceled: true };
  const { canceled, filePath } = await dialog.showSaveDialog(mainWindow, {
    title: '导出公众号富文本 HTML',
    defaultPath: defaultName || 'wechat-article.html',
    filters: [{ name: 'HTML 网页', extensions: ['html', 'htm'] }],
  });

  if (canceled || !filePath) {
    return { canceled: true };
  }

  const fullHtml = `<!DOCTYPE html>
<html>
<head>
  <meta charset="utf-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  <title>${path.basename(filePath, '.html')}</title>
</head>
<body style="margin: 0; padding: 20px; background-color: #f1f2f5;">
  <div style="max-width: 677px; margin: 0 auto;">
    ${htmlContent}
  </div>
</body>
</html>`;

  fs.writeFileSync(filePath, fullHtml, 'utf-8');
  return { canceled: false, filePath };
});

// Export PDF（用隐藏窗口渲染文章 HTML 后 printToPDF）
ipcMain.handle('dialog:exportPdf', async (_, { htmlContent, title, defaultName }: { htmlContent: string; title?: string; defaultName?: string }) => {
  if (!mainWindow) return { canceled: true };
  const { canceled, filePath } = await dialog.showSaveDialog(mainWindow, {
    title: '导出 PDF',
    defaultPath: defaultName || 'wechat-article.pdf',
    filters: [{ name: 'PDF 文件', extensions: ['pdf'] }],
  });

  if (canceled || !filePath) {
    return { canceled: true };
  }

  const safeTitle = String(title || '公众号文章')
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;');

  const fullHtml = `<!DOCTYPE html>
<html>
<head>
  <meta charset="utf-8">
  <title>${safeTitle}</title>
  <style>
    * { box-sizing: border-box; }
    body { margin: 0; padding: 32px; background-color: #ffffff; font-family: -apple-system, "PingFang SC", "Microsoft YaHei", sans-serif; }
    .paper { max-width: 640px; margin: 0 auto; }
    img { max-width: 100%; height: auto; }
    pre { white-space: pre-wrap; word-wrap: break-word; }
  </style>
</head>
<body>
  <div class="paper">${htmlContent}</div>
</body>
</html>`;

  const printWin = new BrowserWindow({
    show: false,
    width: 800,
    height: 1000,
    webPreferences: {
      offscreen: true,
      nodeIntegration: false,
      contextIsolation: true,
      sandbox: true,
      // 离屏窗口只用于排版，强制关掉 JS —— 即便内容里混入脚本也不会执行
      javascript: false,
    },
  });

  try {
    await printWin.loadURL('data:text/html;charset=utf-8,' + encodeURIComponent(fullHtml));
    // 等字体/图片渲染完成
    await new Promise((r) => setTimeout(r, 400));
    const pdfBuffer = await printWin.webContents.printToPDF({
      printBackground: true,
      pageSize: 'A4',
      margins: { top: 0.4, bottom: 0.4, left: 0.4, right: 0.4 },
    });
    fs.writeFileSync(filePath, pdfBuffer);
    return { canceled: false, filePath };
  } catch (err: any) {
    console.error('PDF export failed:', err);
    return { canceled: false, filePath, error: err?.message || String(err) };
  } finally {
    printWin.destroy();
  }
});

// Clipboard: Copy to WeChat
ipcMain.handle('clipboard:copyToWechat', async (_, { html, plainText }: { html: string; plainText: string }) => {
  try {
    // Electron 44 起 clipboard.write 需要 ClipboardItem[]（不再接受 {text, html} 对象）
    await clipboard.write([
      new ClipboardItem({
        'text/plain': plainText,
        'text/html': html,
      }),
    ]);
    return true;
  } catch (error) {
    console.error('Clipboard write failed:', error);
    return false;
  }
});

// Dialog: Select Images
ipcMain.handle('dialog:selectImages', async () => {
  if (!mainWindow) return [];
  const { canceled, filePaths } = await dialog.showOpenDialog(mainWindow, {
    title: '选择文章插图',
    properties: ['openFile', 'multiSelections'],
    filters: [
      { name: '图片文件', extensions: ['jpg', 'jpeg', 'png', 'gif', 'webp', 'svg'] },
    ],
  });

  if (canceled || filePaths.length === 0) {
    return [];
  }

  // 单文件 20MB 上限：避免误选超大文件时 readFileSync 直接把主进程撑爆
  const MAX_IMAGE_BYTES = 20 * 1024 * 1024;
  const results: Array<{ name: string; path: string; dataUrl: string; size: number }> = [];
  for (const fp of filePaths.slice(0, 50)) {
    try {
      const stat = fs.statSync(fp);
      if (stat.size > MAX_IMAGE_BYTES) {
        console.warn('跳过超大图片:', fp, stat.size);
        continue;
      }
      const buffer = fs.readFileSync(fp);
      const ext = path.extname(fp).slice(1).toLowerCase();
      const mime = ext === 'svg' ? 'image/svg+xml' : `image/${ext === 'jpg' ? 'jpeg' : ext}`;
      results.push({
        name: path.basename(fp),
        path: fp,
        dataUrl: `data:${mime};base64,${buffer.toString('base64')}`,
        size: buffer.length,
      });
    } catch (err) {
      console.error('读取图片失败:', fp, err);
    }
  }
  return results;
});

// Dialog: Select Sticker Folder
ipcMain.handle('dialog:selectStickerFolder', async () => {
  if (!mainWindow) return [];
  const { canceled, filePaths } = await dialog.showOpenDialog(mainWindow, {
    title: '选择表情包目录',
    properties: ['openDirectory'],
  });

  if (canceled || filePaths.length === 0) {
    return [];
  }

  const dirPath = filePaths[0];
  const files = fs.readdirSync(dirPath);
  const imageExtensions = ['.png', '.jpg', '.jpeg', '.gif', '.webp', '.svg'];

  const results: Array<{ name: string; path: string; dataUrl: string; isGif: boolean }> = [];

  for (const file of files) {
    const ext = path.extname(file).toLowerCase();
    if (imageExtensions.includes(ext)) {
      const fullPath = path.join(dirPath, file);
      const stat = fs.statSync(fullPath);
      if (stat.isFile() && stat.size < 5 * 1024 * 1024) {
        const buffer = fs.readFileSync(fullPath);
        const mime = ext === '.gif' ? 'image/gif' : ext === '.svg' ? 'image/svg+xml' : `image/${ext.replace('.', '')}`;
        results.push({
          name: path.parse(file).name,
          path: fullPath,
          dataUrl: `data:${mime};base64,${buffer.toString('base64')}`,
          isGif: ext === '.gif',
        });
      }
    }
  }

  return results;
});

// Window controls
ipcMain.on('window:minimize', () => {
  mainWindow?.minimize();
});

ipcMain.on('window:maximize', () => {
  if (mainWindow?.isMaximized()) {
    mainWindow.unmaximize();
  } else {
    mainWindow?.maximize();
  }
});

ipcMain.on('window:close', () => {
  mainWindow?.close();
});

ipcMain.handle('window:isMaximized', () => {
  return mainWindow?.isMaximized() || false;
});

// ---------- AI 相关 IPC ----------
// 进行中的流式请求（支持中途取消）
const aiAbortControllers = new Map<string, AbortController>();

/** 配置对外视图：Key 只返回掩码，明文不出主进程 */
function toAIConfigView(config: AIConfig) {
  return {
    configured: !!config.apiKey,
    apiKeyMasked: maskApiKey(config.apiKey),
    type: config.type,
    endpoint: config.endpoint,
    model: config.model,
    temperature: config.temperature,
    maxToken: config.maxToken,
  };
}

function toImageConfigView(config: AIImageConfig) {
  return {
    configured: !!config.apiKey,
    apiKeyMasked: maskApiKey(config.apiKey),
    type: config.type,
    endpoint: config.endpoint,
    model: config.model,
  };
}

/** 只接受字符串；null / 数字 / 对象一律视为「未提供」，避免后续 .trim() 抛 TypeError */
function normStr(v: unknown): string | undefined {
  return typeof v === 'string' ? v.trim() : undefined;
}

/**
 * apiKey 补丁处理：
 *  - undefined（或非字符串）→ 保留原值
 *  - 空串 → 清空
 *  - 与当前掩码**完全一致** → 视为未修改，保留原值（兼容仍回传掩码的调用方）
 *
 * 注意：渲染层未改动时应「不发送」该字段。旧实现用 `includes('••')` 判断，
 * 会把任何含该字符的合法 Key 静默丢弃。
 */
function patchSecret(incoming: unknown, current: string): string {
  const v = normStr(incoming);
  if (v === undefined) return current;
  if (!v) return '';
  if (/^.{0,8}•+.{0,8}$/.test(v) && maskApiKey(current).trim() === v) return current;
  return v;
}

// 服务预设列表（前端下拉用）
ipcMain.handle('ai:getServices', () => ({
  services: AI_SERVICES,
  imageServices: IMAGE_SERVICES,
}));

// 读取 AI 配置
ipcMain.handle('ai:getConfig', () => ({
  ...toAIConfigView(readAIConfig()),
  image: toImageConfigView(readImageConfig()),
}));

// 保存 AI 配置（API Key 明文只进入主进程内存与 userData 文件，不回传渲染层）
ipcMain.handle(
  'ai:setConfig',
  (_event, patch: Record<string, unknown>) => {
    // 入参全部经 normStr 收敛：非字符串一律当作「未提供」，避免 .trim() 抛 TypeError
    const p = patch && typeof patch === 'object' ? patch : {};

    const current = readAIConfig();
    const reqType = normStr(p.type);
    const type = reqType && AI_SERVICES.some((s) => s.key === reqType) ? reqType : current.type;
    const preset = AI_SERVICES.find((s) => s.key === type);

    const reqEndpoint = normStr(p.endpoint);
    const reqModel = normStr(p.model);
    const reqTemp = typeof p.temperature === 'number' ? p.temperature : undefined;
    const reqMax = typeof p.maxToken === 'number' ? p.maxToken : undefined;

    const next: AIConfig = {
      type,
      endpoint:
        reqEndpoint !== undefined ? reqEndpoint : current.endpoint || preset?.endpoint || '',
      apiKey: patchSecret(p.apiKey, current.apiKey),
      model: reqModel !== undefined ? reqModel : current.model,
      temperature:
        reqTemp !== undefined ? Math.max(0, Math.min(2, reqTemp)) : current.temperature,
      maxToken: reqMax !== undefined && reqMax > 0 ? Math.floor(reqMax) : current.maxToken,
    };
    writeAIConfig(next);

    let image = readImageConfig();
    const imgPatch =
      p.image && typeof p.image === 'object' ? (p.image as Record<string, unknown>) : null;
    if (imgPatch) {
      const reqImgType = normStr(imgPatch.type);
      const iType =
        reqImgType && IMAGE_SERVICES.some((s) => s.key === reqImgType) ? reqImgType : image.type;
      const iPreset = IMAGE_SERVICES.find((s) => s.key === iType);
      const reqImgEndpoint = normStr(imgPatch.endpoint);
      const reqImgModel = normStr(imgPatch.model);
      image = {
        type: iType,
        endpoint:
          reqImgEndpoint !== undefined
            ? reqImgEndpoint
            : image.endpoint || iPreset?.endpoint || '',
        apiKey: patchSecret(imgPatch.apiKey, image.apiKey),
        model: reqImgModel !== undefined ? reqImgModel : image.model,
      };
      writeImageConfig(image);
    }

    return { ...toAIConfigView(next), image: toImageConfigView(image) };
  }
);

// 发现可用模型（GET /models）
ipcMain.handle('ai:listModels', async (_event, opts?: { image?: boolean }) => {
  try {
    const cfg = opts?.image ? readImageConfig() : readAIConfig();
    if (!cfg.endpoint) return { ok: false, models: [], error: '请先填写 API 端点' };
    const models = await listModels({ endpoint: cfg.endpoint, apiKey: cfg.apiKey, type: cfg.type });
    return { ok: true, models };
  } catch (e: any) {
    const { friendly } = classifyAIError(e?.message || String(e));
    return { ok: false, models: [], error: friendly };
  }
});

// 连接测试（最小请求验证 /chat/completions）
ipcMain.handle('ai:testConnection', async () => {
  const config = readAIConfig();
  if (!config.endpoint) return { ok: false, message: '请先填写 API 端点' };
  return await testAIConnection(config);
});

// 文生图
ipcMain.handle(
  'ai:generateImage',
  async (
    _event,
    options: { prompt: string; size?: string; quality?: string; style?: string; n?: number }
  ) => {
    const config = readImageConfig();
    if (!config.apiKey) return { ok: false, code: 'NOT_CONFIGURED', error: '尚未配置生图的 API Key' };
    if (!options?.prompt?.trim()) return { ok: false, code: 'EMPTY_PROMPT', error: '请输入提示词' };
    try {
      const result = await generateImage(config, options);
      return { ok: true, ...result };
    } catch (e: any) {
      const { code, friendly } = classifyAIError(e?.message || String(e));
      return { ok: false, code, error: friendly };
    }
  }
);

// 取消进行中的流式请求
ipcMain.handle('ai:abort', (_event, requestId: string) => {
  const controller = aiAbortControllers.get(requestId);
  if (!controller) return { ok: false };
  controller.abort();
  aiAbortControllers.delete(requestId);
  return { ok: true };
});

// 流式对话：增量通过 `ai:stream` 事件推给渲染层（对齐 doocs/md 的 SSE 体验）
ipcMain.handle(
  'ai:streamChat',
  async (event, req: { requestId?: unknown; messages?: unknown }) => {
    const requestId = normStr(req?.requestId);
    if (!requestId) {
      return { ok: false, code: 'BAD_REQUEST', error: '请求标识无效' };
    }

    // 规范化消息数组：过滤非法项，防止脏数据流入请求体
    const messages: ChatMessage[] = Array.isArray(req?.messages)
      ? (req.messages as unknown[])
          .filter((m): m is ChatMessage => {
            if (!m || typeof m !== 'object') return false;
            const role = (m as ChatMessage).role;
            const content = (m as ChatMessage).content;
            return (
              (role === 'system' || role === 'user' || role === 'assistant') &&
              typeof content === 'string'
            );
          })
          .slice(0, 50)
      : [];
    if (!messages.length) {
      return { ok: false, code: 'BAD_REQUEST', error: '消息内容为空' };
    }

    const config = readAIConfig();

    if (!config.apiKey) return { ok: false, code: 'NOT_CONFIGURED', error: '尚未配置 API Key' };
    if (!config.endpoint) return { ok: false, code: 'NO_ENDPOINT', error: '请先填写 API 端点' };
    if (!config.model) return { ok: false, code: 'NO_MODEL', error: '请先选择模型' };

    const controller = new AbortController();
    aiAbortControllers.set(requestId, controller);
    const send = (payload: Record<string, unknown>) => {
      if (!event.sender.isDestroyed()) event.sender.send('ai:stream', { requestId, ...payload });
    };

    try {
      const text = await chatStream(
        config,
        messages,
        {
          onDelta: (t) => send({ type: 'delta', text: t }),
          onReasoning: (t) => send({ type: 'reasoning', text: t }),
        },
        controller.signal
      );
      send({ type: 'done' });
      return { ok: true, text };
    } catch (e: any) {
      if (controller.signal.aborted) {
        send({ type: 'aborted' });
        return { ok: false, code: 'ABORTED', error: '已终止' };
      }
      const { code, friendly } = classifyAIError(e?.message || String(e));
      send({ type: 'error', code, error: friendly });
      return { ok: false, code, error: friendly };
    } finally {
      aiAbortControllers.delete(requestId);
    }
  }
);

// ---------- 图床配置与上传 ----------
const IMAGE_HOST_PATH = () => path.join(app.getPath('userData'), 'image-host-config.json');

const DEFAULT_IMAGE_HOST: ImageHostConfig = {
  type: 'none',
  github: { repo: '', token: '', branch: 'main', path: 'images' },
  custom: { url: '', method: 'POST', fieldName: 'file', headers: '', responsePath: 'url' },
  s3: { endpoint: '', region: 'auto', bucket: '', accessKey: '', secretKey: '', domain: '' },
  aliyun: { accessKeyId: '', accessKeySecret: '', bucket: '', region: 'oss-cn-hangzhou', domain: '' },
  tencent: { secretId: '', secretKey: '', bucket: '', region: 'ap-guangzhou', domain: '' },
};

const IMAGE_HOST_SECRET_FIELDS = [
  ['github', 'token'],
  ['custom', 'headers'],
  ['s3', 'accessKey'],
  ['s3', 'secretKey'],
  ['aliyun', 'accessKeyId'],
  ['aliyun', 'accessKeySecret'],
  ['tencent', 'secretId'],
  ['tencent', 'secretKey'],
] as const;

function maskSecret(value: string): string {
  if (!value) return '';
  // 短密钥全掩码，避免「掩码」暴露大部分字符
  if (value.length < 16) return '••••••••';
  return value.slice(0, 4) + '••••••••' + value.slice(-4);
}

function readImageHostConfig(): ImageHostConfig {
  try {
    const parsed = JSON.parse(fs.readFileSync(IMAGE_HOST_PATH(), 'utf-8'));
    return {
      type: (IMAGE_HOST_PRESETS.some((p) => p.type === parsed?.type) ? parsed.type : 'none') as ImageHostType,
      github: { ...DEFAULT_IMAGE_HOST.github, ...(parsed.github || {}) },
      custom: { ...DEFAULT_IMAGE_HOST.custom, ...(parsed.custom || {}) },
      s3: { ...DEFAULT_IMAGE_HOST.s3, ...(parsed.s3 || {}) },
      aliyun: { ...DEFAULT_IMAGE_HOST.aliyun, ...(parsed.aliyun || {}) },
      tencent: { ...DEFAULT_IMAGE_HOST.tencent, ...(parsed.tencent || {}) },
    };
  } catch {
    return JSON.parse(JSON.stringify(DEFAULT_IMAGE_HOST));
  }
}

function writeImageHostConfig(cfg: ImageHostConfig): void {
  fs.mkdirSync(app.getPath('userData'), { recursive: true });
  fs.writeFileSync(IMAGE_HOST_PATH(), JSON.stringify(cfg, null, 2), {
    encoding: 'utf-8',
    mode: 0o600,
  });
}

/** 返回给渲染进程：敏感字段打码 */
function toSafeImageHostConfig(cfg: ImageHostConfig): ImageHostConfig {
  const safe: any = JSON.parse(JSON.stringify(cfg));
  for (const [group, field] of IMAGE_HOST_SECRET_FIELDS) {
    if (safe[group] && typeof safe[group][field] === 'string') {
      safe[group][field] = maskSecret(safe[group][field]);
    }
  }
  return safe;
}

ipcMain.handle('imageHost:getConfig', () => ({
  config: toSafeImageHostConfig(readImageHostConfig()),
  presets: IMAGE_HOST_PRESETS,
}));

ipcMain.handle('imageHost:setConfig', (_event, incoming: Partial<ImageHostConfig>) => {
  const current = readImageHostConfig();
  const next: ImageHostConfig = {
    type: incoming.type || current.type,
    github: { ...current.github, ...(incoming.github || {}) },
    custom: { ...current.custom, ...(incoming.custom || {}) },
    s3: { ...current.s3, ...(incoming.s3 || {}) },
    aliyun: { ...current.aliyun, ...(incoming.aliyun || {}) },
    tencent: { ...current.tencent, ...(incoming.tencent || {}) },
  };
  // 掩码语义与 AI 配置保持一致：
  //  - 与当前掩码完全一致 → 视为「未修改」，保留原值
  //  - 显式空串 → 清空（旧实现把空串也当成「保留」，导致密钥永远删不掉）
  for (const [group, field] of IMAGE_HOST_SECRET_FIELDS) {
    const val = (next as any)[group]?.[field];
    const cur = (current as any)[group]?.[field];
    if (typeof val !== 'string') continue;
    if (!val) {
      (next as any)[group][field] = '';
      continue;
    }
    if (/^.{0,8}•+.{0,8}$/.test(val.trim()) && String(cur ?? '') === val.trim()) {
      (next as any)[group][field] = cur;
    }
  }
  writeImageHostConfig(next);
  return { config: toSafeImageHostConfig(next) };
});

ipcMain.handle(
  'imageHost:upload',
  async (_event, data: { dataUrl?: unknown; fileName?: unknown }) => {
    const cfg = readImageHostConfig();
    if (cfg.type === 'none') return { ok: false, error: '未启用图床' };

    const dataUrl = typeof data?.dataUrl === 'string' ? data.dataUrl : '';
    if (!dataUrl) return { ok: false, error: '缺少图片数据' };

    // base64 长度上限（约 20MB 原图），避免渲染层传入超大字符串拖垮主进程
    const MAX_BASE64 = 28 * 1024 * 1024;
    if (dataUrl.length > MAX_BASE64) return { ok: false, error: '图片过大（超过 20MB）' };

    const match = dataUrl.match(/^data:([^;]+);base64,(.*)$/);
    if (!match) return { ok: false, error: '图片格式无效（仅支持 base64 data URL）' };

    const mimeType = match[1];
    const base64 = match[2];

    // MIME 白名单
    const ALLOWED_MIME = [
      'image/png',
      'image/jpeg',
      'image/jpg',
      'image/gif',
      'image/webp',
      'image/svg+xml',
      'image/avif',
      'image/bmp',
    ];
    if (!ALLOWED_MIME.includes(mimeType.toLowerCase())) {
      return { ok: false, error: `不支持的图片类型：${mimeType}` };
    }

    // 文件名净化：剥掉任何路径成分，防止 `../../x.png` 逃逸到目标目录之外
    let fileName = buildFileName(mimeType);
    if (typeof data?.fileName === 'string' && data.fileName.trim()) {
      const base = path.basename(data.fileName.trim()).replace(/[^\w.\-\u4e00-\u9fa5]+/g, '_');
      if (/\.\w+$/.test(base)) fileName = base;
    }

    return await uploadImage(cfg, { base64, fileName, mimeType });
  }
);

// 打开数据目录（userData）供用户备份/查看
ipcMain.handle('app:openDataDirectory', async () => {
  try {
    const dataDir = app.getPath('userData');
    const errMsg = await shell.openPath(dataDir);
    return { ok: !errMsg, path: dataDir, error: errMsg || undefined };
  } catch (err: any) {
    return { ok: false, path: '', error: err?.message || String(err) };
  }
});

// ---------- 文章存储 IPC（实现全部在 articleStore.ts，便于单独测试） ----------
registerStorageIpc(() => mainWindow);

// App Lifecycle
app.whenReady().then(createWindow);

app.on('window-all-closed', () => {
  if (process.platform !== 'darwin') {
    app.quit();
  }
});

app.on('activate', () => {
  if (BrowserWindow.getAllWindows().length === 0) {
    createWindow();
  }
});
