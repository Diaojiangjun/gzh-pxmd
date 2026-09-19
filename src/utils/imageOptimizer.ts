/**
 * Utility to process, optimize and clean sticker and article images
 */

export interface OptimizedImageResult {
  name: string;
  dataUrl: string;
  size: number;
  isGif: boolean;
}

/**
 * Clean data URI to strip unwanted newlines, carriage returns, or spaces
 * that would break Markdown parsers and HTML attribute strings
 */
export function cleanDataUri(uri: string): string {
  if (!uri) return '';
  const trimmed = uri.trim();
  if (trimmed.startsWith('data:')) {
    // Keep data: prefix, strip all whitespace within the base64 or encoded part
    const commaIndex = trimmed.indexOf(',');
    if (commaIndex !== -1) {
      const header = trimmed.substring(0, commaIndex + 1);
      const body = trimmed.substring(commaIndex + 1).replace(/\s+/g, '');
      return header + body;
    }
    return trimmed.replace(/\s+/g, '');
  }
  return trimmed;
}

/**
 * Optimizes an image File for sticker or inline use.
 * For static images (PNG, WebP, JPG, BMP), resizes large images to maxDimension
 * to keep memory and storage footprint minimal (~10-40KB instead of 2-5MB).
 * For animated GIFs or SVGs, preserves raw content so animations and vectors stay crisp.
 */
export async function optimizeStickerFile(
  file: File,
  maxDimension: number = 320
): Promise<OptimizedImageResult> {
  const isGif = file.type === 'image/gif' || file.name.toLowerCase().endsWith('.gif');
  const isSvg = file.type === 'image/svg+xml' || file.name.toLowerCase().endsWith('.svg');
  const cleanName = file.name.replace(/\.[^/.]+$/, '').trim() || '表情';

  // For GIFs and SVGs, read as data URL directly to preserve animations/vectors
  if (isGif || isSvg) {
    const rawDataUrl = await readFileAsDataUrl(file);
    const cleaned = cleanDataUri(rawDataUrl);
    return {
      name: cleanName,
      dataUrl: cleaned,
      size: file.size,
      isGif,
    };
  }

  // For other images (WebP, PNG, JPG), resize down if larger than maxDimension
  try {
    const rawDataUrl = await readFileAsDataUrl(file);
    const resized = await resizeImageCanvas(rawDataUrl, maxDimension);
    return {
      name: cleanName,
      dataUrl: cleanDataUri(resized.dataUrl),
      size: resized.size,
      isGif: false,
    };
  } catch (err) {
    console.warn('Canvas resize fallback to raw image:', err);
    const rawDataUrl = await readFileAsDataUrl(file);
    return {
      name: cleanName,
      dataUrl: cleanDataUri(rawDataUrl),
      size: file.size,
      isGif: false,
    };
  }
}

/**
 * Read File as raw Data URL with robust error handling
 */
function readFileAsDataUrl(file: File): Promise<string> {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => {
      if (typeof reader.result === 'string') {
        resolve(reader.result);
      } else {
        reject(new Error('Failed to read file as text/dataUrl'));
      }
    };
    reader.onerror = () => {
      reject(reader.error || new Error('FileReader encountered an error'));
    };
    reader.readAsDataURL(file);
  });
}

/**
 * Resize image using offscreen canvas to optimize dimensions and file size
 */
function resizeImageCanvas(
  dataUrl: string,
  maxDim: number
): Promise<{ dataUrl: string; size: number }> {
  return new Promise((resolve, reject) => {
    const img = new Image();
    img.crossOrigin = 'anonymous';

    img.onload = () => {
      let { width, height } = img;

      // If already within dimensions, return original
      if (width <= maxDim && height <= maxDim) {
        resolve({ dataUrl, size: Math.round(dataUrl.length * 0.75) });
        return;
      }

      // Calculate proportional dimensions
      if (width > height) {
        if (width > maxDim) {
          height = Math.round((height * maxDim) / width);
          width = maxDim;
        }
      } else {
        if (height > maxDim) {
          width = Math.round((width * maxDim) / height);
          height = maxDim;
        }
      }

      const canvas = document.createElement('canvas');
      canvas.width = Math.max(1, width);
      canvas.height = Math.max(1, height);

      const ctx = canvas.getContext('2d');
      if (!ctx) {
        resolve({ dataUrl, size: Math.round(dataUrl.length * 0.75) });
        return;
      }

      // High quality image smoothing
      ctx.imageSmoothingEnabled = true;
      ctx.imageSmoothingQuality = 'high';
      ctx.drawImage(img, 0, 0, width, height);

      // Try WebP first for optimal compression with transparency support
      try {
        const webpUrl = canvas.toDataURL('image/webp', 0.9);
        if (webpUrl && webpUrl.startsWith('data:image/webp')) {
          resolve({
            dataUrl: webpUrl,
            size: Math.round(webpUrl.length * 0.75),
          });
          return;
        }
      } catch {
        // Fallback to PNG below
      }

      const pngUrl = canvas.toDataURL('image/png');
      resolve({
        dataUrl: pngUrl,
        size: Math.round(pngUrl.length * 0.75),
      });
    };

    img.onerror = () => {
      reject(new Error('Failed to load image for canvas scaling'));
    };

    img.src = dataUrl;
  });
}
