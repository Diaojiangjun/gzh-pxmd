/**
 * MathJax 加载 + Mermaid 图表渲染
 *
 * 公式的 **Markdown 解析与渲染** 已迁移到 `mathExtension.ts`（marked 扩展）；
 * 本模块只保留两件事：
 *  1. 加载 MathJax（tex-svg 组件，加载流程对齐 doocs/md `utils/mathjax.ts`）
 *  2. 把 ```mermaid 代码块渲染为 PNG（微信公众号不认复杂 SVG）
 *
 * 注意：**不要**在文件顶部 `import mermaid from 'mermaid'`。
 * mermaid 及其图表定义（架构图/时序图/泳道图…）合计数百个 chunk、数 MB 体积，
 * 静态导入会让它们全部进入首屏加载路径，把启动时间拖长数秒。
 * 这里改为「正文里真的出现 ```mermaid 时」才 `await import('mermaid')`。
 */

// ---------- MathJax 加载 ----------

export interface MathJaxGlobal {
  tex2svg: (input: string, options?: { display?: boolean }) => HTMLElement;
  texReset: () => void;
  startup?: { promise?: Promise<void> };
}

const MATHJAX_SCRIPT_ID = 'MathJax-script';
let mathjaxLoadPromise: Promise<void> | null = null;

function getMathJax(): MathJaxGlobal | undefined {
  return (window as unknown as { MathJax?: MathJaxGlobal }).MathJax;
}

/** 就绪判断：tex2svg 是函数（对齐 doocs/md isMathJaxReady） */
export function isMathJaxReady(): boolean {
  return typeof window !== 'undefined' && typeof getMathJax()?.tex2svg === 'function';
}

/** 加载 MathJax（tex-svg 组件），首次异步，之后幂等 */
export function loadMathJax(): Promise<void> {
  if (typeof window === 'undefined') return Promise.resolve();
  if (isMathJaxReady()) return Promise.resolve();
  if (mathjaxLoadPromise) return mathjaxLoadPromise;

  mathjaxLoadPromise = new Promise<void>((resolve, reject) => {
    // 1. 加载前必须先设置配置（对齐 doocs/md）——缺少这一步 tex-svg.js 不会挂载 tex2svg
    (window as unknown as { MathJax?: unknown }).MathJax = {
      tex: { tags: 'ams' },
      svg: { fontCache: 'none' },
      // 关闭页面自动扫描，避免干扰编辑器/预览
      startup: { typeset: false },
      options: { enableMenu: false },
    };

    // 2. 注入 script（tex-svg.js 位于 public/mathjax/，dev 与打包后均可解析）
    document.getElementById(MATHJAX_SCRIPT_ID)?.remove();
    const script = document.createElement('script');
    script.id = MATHJAX_SCRIPT_ID;
    script.src = new URL('mathjax/tex-svg.js', document.baseURI).href;
    script.onload = () => {
      // 3. 等 startup 完成
      const startup = getMathJax()?.startup?.promise ?? Promise.resolve();
      startup
        .then(() => {
          if (isMathJaxReady()) {
            resolve();
          } else {
            reject(new Error('MathJax 加载完成但 tex2svg 不可用'));
          }
        })
        .catch((err) => {
          mathjaxLoadPromise = null;
          reject(err);
        });
    };
    script.onerror = () => {
      script.remove();
      mathjaxLoadPromise = null;
      reject(new Error('MathJax 脚本加载失败'));
    };
    document.head.appendChild(script);
  });

  return mathjaxLoadPromise;
}

/** 应用启动时可调用，提前加载 MathJax（失败仅告警，不阻塞） */
export function preloadMathJax(): void {
  loadMathJax().catch((e) => console.warn('MathJax 预加载失败:', e));
}

// ---------- Mermaid（按需动态加载）----------

type MermaidApi = (typeof import('mermaid'))['default'];

/** 模块级单例：整个进程内 mermaid 只会被加载/初始化一次 */
let mermaidModulePromise: Promise<MermaidApi> | null = null;
let mermaidInitialized = false;

/**
 * 懒加载 mermaid 并完成初始化（幂等）。
 * 首次调用会触发动态 import，之后复用同一 Promise。
 */
async function ensureMermaid(): Promise<MermaidApi> {
  if (!mermaidModulePromise) {
    mermaidModulePromise = import('mermaid').then((mod) => mod.default);
  }
  const mermaid = await mermaidModulePromise;

  if (!mermaidInitialized) {
    mermaid.initialize({
      startOnLoad: false,
      theme: 'default',
      fontFamily: '-apple-system, "PingFang SC", "Microsoft YaHei", sans-serif',
      securityLevel: 'strict',
    });
    mermaidInitialized = true;
  }
  return mermaid;
}

async function svgToPng(svg: string): Promise<string> {
  const svgDataUrl = 'data:image/svg+xml;charset=utf-8,' + encodeURIComponent(svg);
  return new Promise((resolve, reject) => {
    const img = new Image();
    img.onload = () => {
      const canvas = document.createElement('canvas');
      canvas.width = img.width || 800;
      canvas.height = img.height || 600;
      const ctx = canvas.getContext('2d');
      if (!ctx) return reject(new Error('canvas 不可用'));
      ctx.fillStyle = '#ffffff';
      ctx.fillRect(0, 0, canvas.width, canvas.height);
      ctx.drawImage(img, 0, 0);
      resolve(canvas.toDataURL('image/png'));
    };
    img.onerror = () => reject(new Error('SVG 加载失败'));
    img.src = svgDataUrl;
  });
}

/** 把 ```mermaid 代码块替换为 PNG 图片（失败时保留原代码块） */
/** 已渲染的 mermaid 图缓存：同一段图形代码只渲染一次（编辑正文时可直接命中） */
const mermaidPngCache = new Map<string, string>();
const MERMAID_CACHE_LIMIT = 20;

export async function processMermaid(markdown: string): Promise<string> {
  let result = markdown;
  const matches = [...markdown.matchAll(/```mermaid\s*\n([\s\S]*?)```/g)];
  if (matches.length === 0) return result;

  // 走到这里说明正文确实有 mermaid 代码块，此时才动态加载 mermaid
  const mermaid = await ensureMermaid();
  for (const m of matches) {
    try {
      const code = m[1].trim();
      let png = mermaidPngCache.get(code);
      if (!png) {
        const id = 'gzh-mermaid-' + Date.now() + '-' + Math.random().toString(36).slice(2, 6);
        const { svg } = await mermaid.render(id, code);
        png = await svgToPng(svg);
        if (mermaidPngCache.size >= MERMAID_CACHE_LIMIT) {
          const firstKey = mermaidPngCache.keys().next().value;
          if (firstKey !== undefined) mermaidPngCache.delete(firstKey);
        }
        mermaidPngCache.set(code, png);
      }
      result = result.split(m[0]).join(`\n![](${png})\n`);
    } catch (e) {
      console.warn('Mermaid 渲染失败，保留原文:', e);
    }
  }
  return result;
}

/** 检测是否包含 Mermaid 图表 */
export function hasMermaid(markdown: string): boolean {
  return /```mermaid\s*\n/.test(markdown);
}
