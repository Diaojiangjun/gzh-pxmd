import { ElectronAPI } from '../../electron/preload';
import { optimizeStickerFile, cleanDataUri } from '../utils/imageOptimizer';

declare global {
  interface Window {
    electronAPI?: ElectronAPI;
  }
}

export const isElectronApp = (): boolean => {
  return typeof window !== 'undefined' && !!window.electronAPI?.isElectron;
};

/**
 * Universal bridge supporting both Electron desktop app and Web preview
 */
export const electronBridge = {
  isElectron: isElectronApp(),

  platform: typeof window !== 'undefined' && window.electronAPI ? window.electronAPI.platform : 'web',

  async openMarkdownFile(): Promise<{ canceled: boolean; filePath?: string; content?: string }> {
    if (window.electronAPI) {
      return await window.electronAPI.openFile();
    }

    return new Promise((resolve) => {
      const input = document.createElement('input');
      input.type = 'file';
      input.accept = '.md,.markdown,.txt';
      input.onchange = (e: any) => {
        const file = e.target.files?.[0];
        if (!file) {
          resolve({ canceled: true });
          return;
        }
        const reader = new FileReader();
        reader.onload = (event) => {
          resolve({
            canceled: false,
            filePath: file.name,
            content: event.target?.result as string,
          });
        };
        // 读取失败也要 resolve，否则调用方的 await 会永久挂起（表现为「点了没反应」）
        reader.onerror = () => resolve({ canceled: true });
        reader.readAsText(file);
      };
      input.click();
    });
  },

  async saveMarkdownFile(content: string, defaultPath: string = 'article.md'): Promise<{ canceled: boolean; filePath?: string }> {
    if (window.electronAPI) {
      return await window.electronAPI.saveFile(content, defaultPath);
    }

    // Web download fallback
    const blob = new Blob([content], { type: 'text/markdown;charset=utf-8' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = defaultPath;
    a.click();
    URL.revokeObjectURL(url);
    return { canceled: false, filePath: defaultPath };
  },

  async exportHtmlFile(htmlContent: string, defaultName: string = 'wechat-article.html'): Promise<{ canceled: boolean; filePath?: string }> {
    if (window.electronAPI) {
      return await window.electronAPI.exportHtml(htmlContent, defaultName);
    }

    const fullHtml = `<!DOCTYPE html>
<html>
<head>
  <meta charset="utf-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  <title>${defaultName.replace('.html', '')}</title>
</head>
<body style="margin: 0; padding: 20px; background-color: #f1f2f5;">
  <div style="max-width: 677px; margin: 0 auto;">
    ${htmlContent}
  </div>
</body>
</html>`;

    const blob = new Blob([fullHtml], { type: 'text/html;charset=utf-8' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = defaultName;
    a.click();
    URL.revokeObjectURL(url);
    return { canceled: false, filePath: defaultName };
  },

  async exportPdfFile(htmlContent: string, title: string = '公众号文章', defaultName: string = 'wechat-article.pdf'): Promise<{ canceled: boolean; filePath?: string; error?: string }> {
    if (window.electronAPI) {
      return await window.electronAPI.exportPdf(htmlContent, title, defaultName);
    }
    return { canceled: false, error: 'PDF 导出仅在桌面端可用' };
  },

  async copyToWeChat(html: string, plainText: string): Promise<boolean> {
    if (window.electronAPI) {
      return await window.electronAPI.copyToWechat(html, plainText);
    }

    try {
      if (navigator.clipboard && window.ClipboardItem) {
        const textBlob = new Blob([plainText], { type: 'text/plain' });
        const htmlBlob = new Blob([html], { type: 'text/html' });
        await navigator.clipboard.write([
          new ClipboardItem({
            'text/plain': textBlob,
            'text/html': htmlBlob,
          }),
        ]);
        return true;
      }
    } catch (e) {
      console.warn('Navigator clipboard write failed, trying fallback:', e);
    }

    // Fallback: document.execCommand
    try {
      const container = document.createElement('div');
      container.innerHTML = html;
      container.style.position = 'fixed';
      container.style.left = '-9999px';
      container.style.top = '-9999px';
      document.body.appendChild(container);

      const range = document.createRange();
      range.selectNodeContents(container);
      const selection = window.getSelection();
      selection?.removeAllRanges();
      selection?.addRange(range);

      const successful = document.execCommand('copy');
      document.body.removeChild(container);
      selection?.removeAllRanges();
      return successful;
    } catch (err) {
      console.error('All clipboard approaches failed:', err);
      return false;
    }
  },

  async selectImages(): Promise<Array<{ name: string; path: string; dataUrl: string; size: number }>> {
    if (window.electronAPI) {
      return await window.electronAPI.selectImages();
    }

    return new Promise((resolve) => {
      const input = document.createElement('input');
      input.type = 'file';
      input.accept = 'image/*,.webp,.png,.jpg,.jpeg,.gif,.svg,.ico,.bmp';
      input.multiple = true;
      input.onchange = async (e: any) => {
        const files: File[] = Array.from(e.target.files || []);
        if (files.length === 0) {
          resolve([]);
          return;
        }

        const imageFiles = files.filter(
          (file) => file.type.startsWith('image/') || /\.(png|jpe?g|gif|webp|svg|ico|bmp)$/i.test(file.name)
        );

        const results = await Promise.all(
          imageFiles.map(async (file) => {
            try {
              const opt = await optimizeStickerFile(file, 480);
              return {
                name: file.name,
                path: file.name,
                dataUrl: cleanDataUri(opt.dataUrl),
                size: opt.size,
              };
            } catch (err) {
              console.warn('Failed to optimize image file:', file.name, err);
              return null;
            }
          })
        );
        resolve(results.filter((r): r is { name: string; path: string; dataUrl: string; size: number } => r !== null));
      };
      input.click();
    });
  },

  async selectStickerFolder(): Promise<Array<{ name: string; path: string; dataUrl: string; isGif: boolean }>> {
    if (window.electronAPI) {
      return await window.electronAPI.selectStickerFolder();
    }

    // Web multi-file fallback
    return new Promise((resolve) => {
      const input = document.createElement('input');
      input.type = 'file';
      input.accept = 'image/*,.webp,.png,.jpg,.jpeg,.gif,.svg,.ico,.bmp';
      input.multiple = true;
      // Allow directory selection if browser supports webkitdirectory
      (input as any).webkitdirectory = true;
      input.onchange = async (e: any) => {
        const files: File[] = Array.from(e.target.files || []);
        if (files.length === 0) {
          resolve([]);
          return;
        }

        const imageFiles = files.filter(
          (file) => file.type.startsWith('image/') || /\.(png|jpe?g|gif|webp|svg|ico|bmp)$/i.test(file.name)
        );

        const results = await Promise.all(
          imageFiles.map(async (file) => {
            try {
              const opt = await optimizeStickerFile(file, 360);
              return {
                name: opt.name,
                path: file.name,
                dataUrl: cleanDataUri(opt.dataUrl),
                isGif: opt.isGif,
              };
            } catch (err) {
              console.warn('Failed to process sticker image:', file.name, err);
              return null;
            }
          })
        );
        resolve(results.filter((r): r is { name: string; path: string; dataUrl: string; isGif: boolean } => r !== null));
      };
      input.click();
    });
  },

  minimizeWindow() {
    window.electronAPI?.minimizeWindow();
  },

  maximizeWindow() {
    window.electronAPI?.maximizeWindow();
  },

  closeWindow() {
    window.electronAPI?.closeWindow();
  },

  /** 打开 Electron 数据目录（userData），用于查看/备份本地数据 */
  async openDataDirectory(): Promise<{ ok: boolean; path: string; error?: string }> {
    if (window.electronAPI?.openDataDirectory) {
      return await window.electronAPI.openDataDirectory();
    }
    return { ok: false, path: '', error: '仅在桌面端可用' };
  },
};
