import { StickerItem, ImageAttachment, ArticleItem, HistorySnapshot, LocalPreset, GzhComponentItem, ThemeConfig, BackgroundSettings } from '../types';

const DB_NAME = 'treasure_gzh_editor_idb';
const DB_VERSION = 1;

export interface FullBackupData {
  version: string;
  exportedAt: number;
  articles: ArticleItem[];
  currentArticleId?: string | null;
  snapshots: HistorySnapshot[];
  presets: LocalPreset[];
  customComponents: GzhComponentItem[];
  stickers: StickerItem[];
  images: ImageAttachment[];
  activeTheme?: ThemeConfig | null;
  background?: BackgroundSettings | null;
}

let dbInstance: IDBDatabase | null = null;

function openDatabase(): Promise<IDBDatabase> {
  if (dbInstance) return Promise.resolve(dbInstance);

  return new Promise((resolve, reject) => {
    if (typeof window === 'undefined' || !window.indexedDB) {
      reject(new Error('IndexedDB is not supported in this environment'));
      return;
    }

    const request = window.indexedDB.open(DB_NAME, DB_VERSION);

    request.onupgradeneeded = (event) => {
      const db = (event.target as IDBOpenDBRequest).result;
      if (!db.objectStoreNames.contains('stickers')) {
        db.createObjectStore('stickers', { keyPath: 'id' });
      }
      if (!db.objectStoreNames.contains('images')) {
        db.createObjectStore('images', { keyPath: 'id' });
      }
      if (!db.objectStoreNames.contains('meta')) {
        db.createObjectStore('meta', { keyPath: 'key' });
      }
    };

    request.onsuccess = (event) => {
      dbInstance = (event.target as IDBOpenDBRequest).result;
      resolve(dbInstance);
    };

    request.onerror = (event) => {
      console.warn('Failed to open IndexedDB:', (event.target as IDBOpenDBRequest).error);
      reject((event.target as IDBOpenDBRequest).error);
    };
  });
}

export const dbService = {
  /**
   * Save all custom stickers to IndexedDB
   */
  async saveStickers(stickers: StickerItem[]): Promise<void> {
    try {
      const db = await openDatabase();
      const tx = db.transaction(['stickers'], 'readwrite');
      const store = tx.objectStore('stickers');
      await new Promise<void>((resolve, reject) => {
        const clearReq = store.clear();
        // 少了这一句时，clear 失败会让 Promise 永远悬挂，后续保存链路静默卡死
        clearReq.onerror = () => reject(clearReq.error);
        clearReq.onsuccess = () => {
          for (const s of stickers) {
            store.put(s);
          }
        };
        tx.oncomplete = () => resolve();
        tx.onerror = () => reject(tx.error);
      });
    } catch (e) {
      console.warn('dbService.saveStickers falling back to localStorage:', e);
    }
  },

  /**
   * Load all custom stickers from IndexedDB
   */
  async loadStickers(): Promise<StickerItem[]> {
    try {
      const db = await openDatabase();
      const tx = db.transaction(['stickers'], 'readonly');
      const store = tx.objectStore('stickers');
      return new Promise<StickerItem[]>((resolve, reject) => {
        const req = store.getAll();
        req.onsuccess = () => resolve(req.result || []);
        req.onerror = () => reject(req.error);
      });
    } catch (e) {
      console.warn('dbService.loadStickers fallback to empty:', e);
      return [];
    }
  },

  /**
   * Save image attachments to IndexedDB
   */
  async saveImages(images: ImageAttachment[]): Promise<void> {
    try {
      const db = await openDatabase();
      const tx = db.transaction(['images'], 'readwrite');
      const store = tx.objectStore('images');
      await new Promise<void>((resolve, reject) => {
        const clearReq = store.clear();
        // 少了这一句时，clear 失败会让 Promise 永远悬挂，后续保存链路静默卡死
        clearReq.onerror = () => reject(clearReq.error);
        clearReq.onsuccess = () => {
          for (const img of images) {
            store.put(img);
          }
        };
        tx.oncomplete = () => resolve();
        tx.onerror = () => reject(tx.error);
      });
    } catch (e) {
      console.warn('dbService.saveImages falling back to localStorage:', e);
    }
  },

  /**
   * Load image attachments from IndexedDB
   */
  async loadImages(): Promise<ImageAttachment[]> {
    try {
      const db = await openDatabase();
      const tx = db.transaction(['images'], 'readonly');
      const store = tx.objectStore('images');
      return new Promise<ImageAttachment[]>((resolve, reject) => {
        const req = store.getAll();
        req.onsuccess = () => resolve(req.result || []);
        req.onerror = () => reject(req.error);
      });
    } catch (e) {
      console.warn('dbService.loadImages fallback to empty:', e);
      return [];
    }
  },

  /**
   * Get approximate storage usage via navigator.storage.estimate()
   */
  async getStorageEstimate(): Promise<{
    usedBytes: number;
    quotaBytes: number;
    formattedUsed: string;
    formattedQuota: string;
    percentage: number;
  }> {
    try {
      if (typeof navigator !== 'undefined' && navigator.storage && navigator.storage.estimate) {
        const est = await navigator.storage.estimate();
        const used = est.usage || 0;
        const quota = est.quota || 1024 * 1024 * 1024; // fallback 1GB
        const pct = quota > 0 ? (used / quota) * 100 : 0;

        const formatSize = (bytes: number) => {
          if (bytes < 1024) return bytes + ' B';
          if (bytes < 1024 * 1024) return (bytes / 1024).toFixed(1) + ' KB';
          if (bytes < 1024 * 1024 * 1024) return (bytes / (1024 * 1024)).toFixed(1) + ' MB';
          return (bytes / (1024 * 1024 * 1024)).toFixed(2) + ' GB';
        };

        return {
          usedBytes: used,
          quotaBytes: quota,
          formattedUsed: formatSize(used),
          formattedQuota: formatSize(quota),
          percentage: Math.min(100, Math.max(0, Math.round(pct * 10) / 10)),
        };
      }
    } catch (err) {
      console.warn('Failed to get storage estimate:', err);
    }

    return {
      usedBytes: 0,
      quotaBytes: 1024 * 1024 * 500,
      formattedUsed: '正常',
      formattedQuota: '充足',
      percentage: 2,
    };
  },
};
