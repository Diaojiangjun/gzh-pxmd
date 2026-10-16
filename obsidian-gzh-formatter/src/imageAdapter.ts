import { App, TFile } from 'obsidian';

/**
 * 把 Obsidian 笔记里的图片引用，改写成编译器能用的形式。
 *
 * ── 为什么要这一层 ──
 * 标准 Markdown 只认 `![](a.png)`，但 Obsidian 里实际会碰到三种写法，
 * 直接丢给编译器会导致公众号里图片全裂：
 *
 *  1. `![[image.png]]`            wikilink —— Obsidian 默认的插入格式
 *  2. `![[image.png|300]]`       带尺寸
 *  3. `![alt](attachments/a.png)` 标准 Markdown，vault 相对路径
 *
 * 另外 Obsidian 的 `![](x.png)` 路径是相对**当前笔记**的，而标准 Markdown 期望相对
 * vault 根 —— 只有走 `vault.getAbstractFileByPath()` 才能解析对。
 *
 * ── 两种输出模式 ──
 *  - `inline`（默认）：转成 base64 data URI 直接内嵌。
 *    好处是粘贴到公众号一定能显示，不依赖图床可用性；
 *    代价是 HTML 变大 —— 公众号对粘贴内容有体积限制，所以大图要提示用户。
 *  - `upload`：先上传图床换外链，体积小但依赖图床配置可用。
 */

export type ImageMode = 'inline' | 'upload';

export interface ImageResolveOptions {
  app: App;
  /** 当前笔记路径，用于解析相对路径 */
  sourcePath: string;
  mode: ImageMode;
  /** 单张图片超过这个字节数就跳过内嵌（否则 HTML 会大到公众号拒绝粘贴） */
  maxInlineBytes?: number;
  /** mode=upload 时由调用方注入的上传函数；失败时返回 null */
  uploader?: (file: TFile, data: ArrayBuffer) => Promise<string | null>;
  /** 上传失败的回调（带原因），用于给用户明确反馈 */
  onUploadError?: (fileName: string, reason: string) => void;
}

export interface ImageResolveResult {
  /** 改写后的 Markdown */
  markdown: string;
  /** 内嵌成功的图片数 */
  inlined: number;
  /** 走了图床的图片数 */
  uploaded: number;
  /** 因超过体积上限被跳过的图片（文件名列表） */
  oversized: string[];
  /** 找不到对应文件的图片（文件名列表） */
  missing: string[];
  /** 上传图床失败的图片（文件名列表）—— 已退回内嵌，但必须让用户知道 */
  failed: string[];
  /** 内嵌图片占用的总字节（base64 膨胀约 4/3，这里统计原始字节） */
  inlineBytes: number;
}

const DEFAULT_MAX_INLINE = 400 * 1024;

/** base64 编码 —— 不用 btoa 是因为它对非 Latin1 字符会抛异常 */
function arrayBufferToBase64(buf: ArrayBuffer): string {
  const bytes = new Uint8Array(buf);
  const CHUNK = 0x8000; // 分片避免 apply 参数过多爆栈
  let binary = '';
  for (let i = 0; i < bytes.length; i += CHUNK) {
    binary += String.fromCharCode(...bytes.subarray(i, i + CHUNK));
  }
  return btoa(binary);
}

function mimeOf(path: string): string {
  const ext = path.split('.').pop()?.toLowerCase() || '';
  const map: Record<string, string> = {
    png: 'image/png',
    jpg: 'image/jpeg',
    jpeg: 'image/jpeg',
    gif: 'image/gif',
    webp: 'image/webp',
    svg: 'image/svg+xml',
    avif: 'image/avif',
    bmp: 'image/bmp',
  };
  return map[ext] || 'application/octet-stream';
}

/**
 * 解析图片引用到 TFile。
 *
 * 依次尝试：
 *  1. 原样当 vault 根相对路径（`attachments/a.png`）
 *  2. 仅文件名在 vault 里搜（Obsidian 允许同名文件多份，取最新的）
 *  3. 相对当前笔记所在目录（`./a.png` → `notes/a.png`）
 */
function resolveFile(app: App, sourcePath: string, ref: string): TFile | null {
  const clean = ref.trim();
  if (!clean || /^(https?:)?\/\//i.test(clean) || clean.startsWith('data:')) return null;

  // 1. vault 根相对
  const direct = app.vault.getAbstractFileByPath(clean);
  if (direct instanceof TFile) return direct;

  // 3. 相对当前笔记目录
  const dir = sourcePath.includes('/') ? sourcePath.slice(0, sourcePath.lastIndexOf('/')) : '';
  if (clean.startsWith('./') || clean.startsWith('../') || dir) {
    const rel = clean.replace(/^\.\//, '');
    const candidates = dir ? [`${dir}/${rel}`] : [];
    for (const c of candidates) {
      const f = app.vault.getAbstractFileByPath(c);
      if (f instanceof TFile) return f;
    }
  }

  // 2. 按文件名全库搜索（取最近修改的，符合直觉）
  const base = clean.split('/').pop() || clean;
  const found = app.vault.getFiles().filter((f) => f.name === base);
  if (found.length === 1) return found[0];
  if (found.length > 1) {
    return found.sort((a, b) => b.stat.mtime - a.stat.mtime)[0];
  }
  return null;
}

/**
 * 逐个替换图片引用。
 *
 * 用正则匹配后再逐条处理，而不是直接整体正则替换 —— 因为每张图的替换结果
 * （data URI / 外链）长度都不一样，且需要异步读取文件内容。
 */
export async function resolveImages(
  markdown: string,
  opts: ImageResolveOptions
): Promise<ImageResolveResult> {
  const {
    app,
    sourcePath,
    mode,
    maxInlineBytes = DEFAULT_MAX_INLINE,
    uploader,
  } = opts;

  const result: ImageResolveResult = {
    markdown,
    inlined: 0,
    uploaded: 0,
    oversized: [],
    missing: [],
    failed: [],
    inlineBytes: 0,
  };

  // 统一处理两种语法：
  //  A. wikilink：![[路径|尺寸]]
  //  B. 标准md ：![alt](路径 "title")
  // 两种都用带 s 标志的非贪婪匹配，链接名里带括号也不会截错。
  const patterns = [
    { re: /!\[\[([^\]|]+?)(?:\|(\d+))?\]\]/g, wikilink: true },
    { re: /!\[([^\]]*)\]\(\s*([^)\s]+?)(?:\s+"[^"]*")?\s*\)/g, wikilink: false },
  ];

  /** 收集所有替换任务，最后一次性应用，避免边遍历边改 */
  const edits: Array<{ start: number; end: number; text: string }> = [];

  for (const { re, wikilink } of patterns) {
    re.lastIndex = 0;
    let m: RegExpExecArray | null;

    while ((m = re.exec(markdown)) !== null) {
      const ref = wikilink ? m[1] : m[2];
      const alt = wikilink ? '' : m[1];
      const width = wikilink && m[2] ? parseInt(m[2], 10) : 0;
      const file = resolveFile(app, sourcePath, ref);

      if (!file) {
        result.missing.push(ref);
        continue;
      }

      let data: ArrayBuffer;
      try {
        data = await app.vault.readBinary(file);
      } catch {
        result.missing.push(ref);
        continue;
      }

      const size = data.byteLength;
      const label = alt || file.name;

      // 图床模式优先
      if (mode === 'upload' && uploader) {
        const url = await uploader(file, data);
        if (url) {
          edits.push({
            start: m.index,
            end: m.index + m[0].length,
            text: `![${label}](${url})`,
          });
          result.uploaded++;
          continue;
        }
        // 上传失败：明确告知，不静默退回 —— 用户需要知道哪些图没上外链
        result.failed.push(file.name);
        opts.onUploadError?.(file.name, '图床接口未返回可用链接');
      }

      // 超过体积上限就不内嵌 —— 否则粘贴到公众号会被拒
      if (size > maxInlineBytes) {
        result.oversized.push(`${file.name}（${(size / 1024).toFixed(0)}KB）`);
        continue;
      }

      const mime = mimeOf(file.extension || file.name);
      const dataUri = `data:${mime};base64,${arrayBufferToBase64(data)}`;
      const attrs = width ? ` "${width}"` : '';
      edits.push({
        start: m.index,
        end: m.index + m[0].length,
        text: `![${label}](${dataUri}${attrs})`,
      });
      result.inlined++;
      result.inlineBytes += size;
    }
  }

  // 从后往前应用，避免前面的替换影响后面的偏移量
  edits.sort((a, b) => b.start - a.start);
  let out = markdown;
  for (const e of edits) {
    out = out.slice(0, e.start) + e.text + out.slice(e.end);
  }
  result.markdown = out;
  return result;
}
