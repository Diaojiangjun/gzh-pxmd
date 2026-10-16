/**
 * 来自主项目 electron/imageHost.ts
 * 由 scripts/sync-core.mjs 生成 —— 请在主项目修改后重新同步，不要手改这里。
 */
/**
 * 图床上传服务（运行在 Electron 主进程）
 *
 * 为什么放主进程：
 * - 图床密钥（token / secretKey）属于敏感凭证，与主进程 userData 配置一起保存，不进前端 bundle；
 * - 公众号文章的图片必须是 https 外链，本地 base64 粘贴到公众号容易失效或超大卡顿。
 *
 * 实现依赖：Node 18+ 内置 fetch / FormData / Blob / crypto，不引入任何第三方包。
 */


export type ImageHostType = 'none' | 'github' | 'custom' | 's3' | 'aliyun' | 'tencent';

export interface ImageHostConfig {
  type: ImageHostType;
  github?: { repo: string; token: string; branch: string; path: string };
  custom?: {
    url: string;
    method: string;
    fieldName: string;
    headers: string;
    responsePath: string;
    /**
     * 图片访问域名。留空则自动取「上传接口 URL」的 origin。
     * 部分图床（如自建 / PicGo）返回的是 `/file/xxx.jpg` 这类相对路径，
     * 公众号里会直接裂图，必须补成绝对地址。
     */
    domain: string;
    /**
     * 部分图床需要追加查询参数（如 `returnFormat=full`）才会返回完整链接。
     * 留空则不追加；绝对化逻辑会自动处理相对路径，所以多数情况无需填写。
     */
    extraQuery: string;
  };
  s3?: { endpoint: string; region: string; bucket: string; accessKey: string; secretKey: string; domain: string };
  aliyun?: { accessKeyId: string; accessKeySecret: string; bucket: string; region: string; domain: string };
  tencent?: { secretId: string; secretKey: string; bucket: string; region: string; domain: string };
}

export interface UploadImageData {
  /** 纯 base64（不含 data:image/...;base64, 前缀） */
  base64: string;
  fileName: string;
  mimeType: string;
}

export interface UploadResult {
  ok: boolean;
  url?: string;
  error?: string;
}

export const IMAGE_HOST_PRESETS: Array<{ type: ImageHostType; name: string; hint: string }> = [
  { type: 'none', name: '不启用（仅本地）', hint: '图片以 base64 内嵌，图多时粘贴到公众号可能卡顿' },
  { type: 'github', name: 'GitHub 图床', hint: '免费，需 repo 与 token；国内访问建议配合 CDN' },
  { type: 'custom', name: '自定义上传接口', hint: '填写你自己的上传 API（如 PicGo / Cloudflare Worker）' },
  { type: 's3', name: 'S3 兼容（AWS / R2 / MinIO）', hint: '需 endpoint、bucket、accessKey / secretKey' },
  { type: 'aliyun', name: '阿里云 OSS', hint: '需 AccessKey ID / Secret、Bucket、Region' },
  { type: 'tencent', name: '腾讯云 COS', hint: '需 SecretId / SecretKey、Bucket、Region' },
];

// ---------- 工具函数 ----------




/**
 * 按点分路径从对象中取值，如 "data.url"。
 *
 * 支持数组下标：响应顶层是数组时，`0.src` 等价于 `json[0].src`。
 * 各家图床的响应结构差异很大 —— 有的返回对象 `{data:{url}}`，
 * 有的直接返回数组 `[{src:"..."}]`（上传后返回文件数组的那种）。
 * 只支持对象路径的话，用户遇到数组结构就只能干瞪眼。
 */
export function getByPath(obj: any, path: string): string | undefined {
  if (!path) return undefined;
  const value = path
    .split('.')
    // 去掉 `[0]` / `[0][1]` 写法里的括号，两种语法归一化成点分
    .map((seg) => seg.replace(/\[(\d+)\]/g, '.$1'))
    .join('.')
    .split('.')
    .filter((seg) => seg !== '')
    .reduce((acc: any, key: string) => (acc == null ? undefined : acc[key]), obj);
  return typeof value === 'string' ? value : undefined;
}

/**
 * 把图床返回的图片路径补成可直接用于公众号的绝对地址。
 *
 * 为什么必须做这一步：不少图床默认只返回 `/file/xxx.jpg` 这种**相对路径**
 * （有的需要加 `?returnFormat=full` 才给完整链接，但那是图床自己的行为，
 * 我们不该要求用户去猜）。公众号编辑器拿到相对路径，浏览器会按公众号域名去
 * 请求 `/file/xxx.jpg` —— 结果必然是裂图，而且预览里看正常，粘过去才发现，
 * 很难排查。
 *
 * 补全优先级：
 *  1. 已经是 http(s) 绝对地址 → 原样返回
 *  2. 配置了「图片域名」→ 用它
 *  3. 否则取上传接口 URL 的 origin（多数图床与文件访问同源）
 */
export function absolutizeUrl(
  rawUrl: string,
  opts: { domain?: string; uploadUrl?: string }
): string {
  const raw = (rawUrl || '').trim();
  if (!raw) return '';

  // 已是绝对地址（http/https），无需处理
  if (/^https?:\/\//i.test(raw)) return raw;

  // 协议相对地址（//cdn.example.com/a.jpg）→ 继承上传地址的协议
  if (raw.startsWith('//')) {
    const scheme = safeProtocol(opts.uploadUrl || '');
    return `${scheme}${raw}`;
  }

  // 拼出基准：优先自定义域名，其次上传地址的 origin
  let base = (opts.domain || '').trim();
  if (!base) base = safeOrigin(opts.uploadUrl || '') || '';
  if (!base) {
    // 兜底：不给域名总比给个错的强，但要让调用方知道没补成
    return raw;
  }
  base = base.replace(/\/+$/, '');

  return raw.startsWith('/') ? `${base}${raw}` : `${base}/${raw}`;
}

/** 取 URL 的 origin，非法输入返回空串而不是抛错 */
function safeOrigin(url: string): string {
  try {
    return new URL(url).origin;
  } catch {
    return '';
  }
}

/** 取 URL 的协议（含尾冒号），非法输入按 https 处理 —— 公众号只收 https */
function safeProtocol(url: string): string {
  try {
    return new URL(url).protocol;
  } catch {
    return 'https:';
  }
}

/**
 * 给上传地址追加查询参数。
 *
 * 存在的意义：部分图床（如某些自建服务）默认只返回相对路径，加
 * `?returnFormat=full` 才返回完整链接。用户不该为此去手动改 URL 字符串，
 * 而且参数和地址写在一起，删参数时容易把地址也改坏。
 */
export function appendQuery(url: string, extraQuery: string): string {
  const q = (extraQuery || '').trim().replace(/^[?&]+/, '').replace(/&+$/, '');
  if (!q) return url;
  return url + (url.includes('?') ? '&' : '?') + q;
}

function randomFileName(ext: string): string {
  const now = new Date();
  const pad = (n: number) => String(n).padStart(2, '0');
  const stamp = `${now.getFullYear()}${pad(now.getMonth() + 1)}${pad(now.getDate())}-${pad(now.getHours())}${pad(now.getMinutes())}${pad(now.getSeconds())}`;
  const rand = Math.random().toString(36).slice(2, 8);
  return `gzh-${stamp}-${rand}${ext}`;
}

function normalizeExt(mimeType: string): string {
  const map: Record<string, string> = {
    'image/png': '.png',
    'image/jpeg': '.jpg',
    'image/jpg': '.jpg',
    'image/gif': '.gif',
    'image/webp': '.webp',
    'image/svg+xml': '.svg',
    'image/bmp': '.bmp',
    'image/x-icon': '.ico',
  };
  return map[mimeType] || '.png';
}

// ---------- 各家实现 ----------
// （同步脚本已截断：S3 / OSS / COS 的签名依赖 Node crypto 与 Buffer，
//   Obsidian 渲染进程用不到，只保留上面的 URL 解析与补全纯函数。）
