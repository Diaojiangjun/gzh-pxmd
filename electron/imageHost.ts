/**
 * 图床上传服务（运行在 Electron 主进程）
 *
 * 为什么放主进程：
 * - 图床密钥（token / secretKey）属于敏感凭证，与主进程 userData 配置一起保存，不进前端 bundle；
 * - 公众号文章的图片必须是 https 外链，本地 base64 粘贴到公众号容易失效或超大卡顿。
 *
 * 实现依赖：Node 18+ 内置 fetch / FormData / Blob / crypto，不引入任何第三方包。
 */

import crypto from 'crypto';

export type ImageHostType = 'none' | 'github' | 'custom' | 's3' | 'aliyun' | 'tencent';

export interface ImageHostConfig {
  type: ImageHostType;
  github?: { repo: string; token: string; branch: string; path: string };
  custom?: { url: string; method: string; fieldName: string; headers: string; responsePath: string };
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

function hmacSha256(key: crypto.BinaryLike, data: string): Buffer {
  return crypto.createHmac('sha256', key).update(data, 'utf8').digest();
}

function sha256Hex(data: crypto.BinaryLike): string {
  return crypto.createHash('sha256').update(data).digest('hex');
}

function sha1Hex(data: string): string {
  return crypto.createHash('sha1').update(data, 'utf8').digest('hex');
}

/** 按点分路径从对象中取值，如 "data.url" */
function getByPath(obj: any, path: string): string | undefined {
  if (!path) return undefined;
  const value = path
    .split('.')
    .reduce((acc: any, key: string) => (acc == null ? undefined : acc[key]), obj);
  return typeof value === 'string' ? value : undefined;
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

async function uploadToGitHub(cfg: ImageHostConfig, data: UploadImageData): Promise<string> {
  const gh = cfg.github!;
  if (!gh.repo || !gh.token) throw new Error('GitHub 图床未配置完整（需要 repo 与 token）');

  const [owner, repo] = gh.repo.replace(/^https?:\/\/github\.com\//, '').replace(/\.git$/, '').split('/');
  if (!owner || !repo) throw new Error('repo 格式应为 owner/repo 或完整 GitHub 地址');

  const fileName = data.fileName || randomFileName(normalizeExt(data.mimeType));
  const dir = (gh.path || '').replace(/^\/+|\/+$/g, '');
  const filePath = dir ? `${dir}/${fileName}` : fileName;
  const branch = gh.branch || 'main';

  const res = await fetch(`https://api.github.com/repos/${owner}/${repo}/contents/${filePath}`, {
    method: 'PUT',
    headers: {
      Authorization: `Bearer ${gh.token}`,
      'Content-Type': 'application/json',
      Accept: 'application/vnd.github+json',
      'User-Agent': 'treasure-gzh-editor',
    },
    body: JSON.stringify({
      message: `upload image ${fileName}`,
      content: data.base64,
      branch,
    }),
  });

  const json: any = await res.json().catch(() => ({}));
  if (!res.ok) throw new Error(json?.message || `GitHub 上传失败 HTTP ${res.status}`);

  // jsdelivr CDN 对国内更友好，raw.githubusercontent.com 可能不稳定
  return `https://cdn.jsdelivr.net/gh/${owner}/${repo}@${branch}/${filePath}`;
}

async function uploadToCustom(cfg: ImageHostConfig, data: UploadImageData): Promise<string> {
  const cu = cfg.custom!;
  if (!cu.url) throw new Error('自定义图床未填写上传地址');

  const buffer = Buffer.from(data.base64, 'base64');
  const fileName = data.fileName || randomFileName(normalizeExt(data.mimeType));
  const form = new FormData();
  form.append(cu.fieldName || 'file', new Blob([buffer], { type: data.mimeType }), fileName);

  const headers: Record<string, string> = {};
  if (cu.headers) {
    try {
      Object.assign(headers, JSON.parse(cu.headers));
    } catch {
      throw new Error('自定义请求头不是合法 JSON');
    }
  }

  const res = await fetch(cu.url, {
    method: (cu.method || 'POST').toUpperCase(),
    headers,
    body: form,
  });

  const text = await res.text();
  let json: any;
  try {
    json = JSON.parse(text);
  } catch {
    throw new Error(`上传接口返回的不是 JSON：${text.slice(0, 200)}`);
  }
  if (!res.ok) throw new Error(`上传失败 HTTP ${res.status}：${text.slice(0, 200)}`);

  const url = getByPath(json, cu.responsePath || 'url') || getByPath(json, 'data.url');
  if (!url) throw new Error(`未能从响应中解析图片 URL，请检查「URL 字段路径」（当前：${cu.responsePath || 'url'}）`);
  return url;
}

async function uploadToS3(cfg: ImageHostConfig, data: UploadImageData): Promise<string> {
  const s3 = cfg.s3!;
  if (!s3.endpoint || !s3.bucket || !s3.accessKey || !s3.secretKey) {
    throw new Error('S3 图床未配置完整（endpoint / bucket / accessKey / secretKey）');
  }

  const buffer = Buffer.from(data.base64, 'base64');
  const key = data.fileName || randomFileName(normalizeExt(data.mimeType));
  const region = s3.region || 'us-east-1';
  const endpoint = s3.endpoint.replace(/\/+$/, '');
  const { host } = new URL(endpoint);
  const pathname = `/${s3.bucket}/${key}`;

  const amzDate = new Date().toISOString().replace(/[:-]|\.\d{3}/g, '');
  const dateStamp = amzDate.slice(0, 8);
  const payloadHash = sha256Hex(buffer);

  const canonicalHeaders = `host:${host}\nx-amz-content-sha256:${payloadHash}\nx-amz-date:${amzDate}\n`;
  const signedHeaders = 'host;x-amz-content-sha256;x-amz-date';
  const canonicalRequest = ['PUT', pathname, '', canonicalHeaders, signedHeaders, payloadHash].join('\n');

  const algorithm = 'AWS4-HMAC-SHA256';
  const credentialScope = `${dateStamp}/${region}/s3/aws4_request`;
  const stringToSign = [algorithm, amzDate, credentialScope, sha256Hex(canonicalRequest)].join('\n');

  const kDate = hmacSha256(`AWS4${s3.secretKey}`, dateStamp);
  const kRegion = hmacSha256(kDate, region);
  const kService = hmacSha256(kRegion, 's3');
  const kSigning = hmacSha256(kService, 'aws4_request');
  const signature = crypto.createHmac('sha256', kSigning).update(stringToSign, 'utf8').digest('hex');

  const authorization = `${algorithm} Credential=${s3.accessKey}/${credentialScope}, SignedHeaders=${signedHeaders}, Signature=${signature}`;

  const res = await fetch(`${endpoint}${pathname}`, {
    method: 'PUT',
    headers: {
      Host: host,
      'x-amz-content-sha256': payloadHash,
      'x-amz-date': amzDate,
      Authorization: authorization,
      'Content-Type': data.mimeType,
    },
    body: buffer,
  });

  if (!res.ok) throw new Error(`S3 上传失败 HTTP ${res.status}：${(await res.text()).slice(0, 200)}`);
  return s3.domain ? `${s3.domain.replace(/\/+$/, '')}/${key}` : `${endpoint}${pathname}`;
}

async function uploadToAliyun(cfg: ImageHostConfig, data: UploadImageData): Promise<string> {
  const os = cfg.aliyun!;
  if (!os.accessKeyId || !os.accessKeySecret || !os.bucket || !os.region) {
    throw new Error('阿里云 OSS 未配置完整（AccessKey ID / Secret / Bucket / Region）');
  }

  const buffer = Buffer.from(data.base64, 'base64');
  const key = data.fileName || randomFileName(normalizeExt(data.mimeType));
  const date = new Date().toUTCString();
  const contentType = data.mimeType;
  const canonicalResource = `/${os.bucket}/${key}`;

  const stringToSign = `PUT\n\n${contentType}\n${date}\n${canonicalResource}`;
  const signature = crypto.createHmac('sha1', os.accessKeySecret).update(stringToSign, 'utf8').digest('base64');
  const authorization = `OSS ${os.accessKeyId}:${signature}`;

  const host = `${os.bucket}.${os.region}.aliyuncs.com`;
  const res = await fetch(`https://${host}/${key}`, {
    method: 'PUT',
    headers: {
      Date: date,
      'Content-Type': contentType,
      Authorization: authorization,
    },
    body: buffer,
  });

  if (!res.ok) throw new Error(`OSS 上传失败 HTTP ${res.status}：${(await res.text()).slice(0, 200)}`);
  return os.domain ? `${os.domain.replace(/\/+$/, '')}/${key}` : `https://${host}/${key}`;
}

async function uploadToTencent(cfg: ImageHostConfig, data: UploadImageData): Promise<string> {
  const cos = cfg.tencent!;
  if (!cos.secretId || !cos.secretKey || !cos.bucket || !cos.region) {
    throw new Error('腾讯云 COS 未配置完整（SecretId / SecretKey / Bucket / Region）');
  }

  const buffer = Buffer.from(data.base64, 'base64');
  const key = data.fileName || randomFileName(normalizeExt(data.mimeType));
  const keyPath = `/${key}`;

  const now = Math.floor(Date.now() / 1000);
  const keyTime = `${now - 60};${now + 3600}`;
  const signKey = crypto.createHmac('sha1', cos.secretKey).update(keyTime).digest('hex');
  // COS 签名：HTTPMethod\nKeyPath\nHttpParameters\nHttpHeaders\n
  const httpString = `put\n${keyPath}\n\n\n`;
  const stringToSign = `sha1\n${keyTime}\n${sha1Hex(httpString)}\n`;
  const signature = crypto.createHmac('sha1', signKey).update(stringToSign, 'utf8').digest('hex');

  const authorization = [
    'q-sign-algorithm=sha1',
    `q-ak=${cos.secretId}`,
    `q-sign-time=${keyTime}`,
    `q-key-time=${keyTime}`,
    'q-header-list=',
    'q-url-param-list=',
    `q-signature=${signature}`,
  ].join('&');

  const host = `${cos.bucket}.cos.${cos.region}.myqcloud.com`;
  const res = await fetch(`https://${host}${keyPath}`, {
    method: 'PUT',
    headers: {
      Authorization: authorization,
      'Content-Type': data.mimeType,
    },
    body: buffer,
  });

  if (!res.ok) throw new Error(`COS 上传失败 HTTP ${res.status}：${(await res.text()).slice(0, 200)}`);
  return cos.domain ? `${cos.domain.replace(/\/+$/, '')}/${key}` : `https://${host}${keyPath}`;
}

// ---------- 入口 ----------

const HANDLERS: Record<Exclude<ImageHostType, 'none'>, (cfg: ImageHostConfig, data: UploadImageData) => Promise<string>> = {
  github: uploadToGitHub,
  custom: uploadToCustom,
  s3: uploadToS3,
  aliyun: uploadToAliyun,
  tencent: uploadToTencent,
};

export async function uploadImage(config: ImageHostConfig, data: UploadImageData): Promise<UploadResult> {
  if (!config || config.type === 'none') {
    return { ok: false, error: '未启用图床' };
  }
  const handler = HANDLERS[config.type];
  if (!handler) return { ok: false, error: `不支持的图床类型：${config.type}` };

  try {
    const url = await handler(config, data);
    return { ok: true, url };
  } catch (err: any) {
    return { ok: false, error: err?.message || String(err) };
  }
}

/** 生成默认文件名（供前端上传前使用） */
export function buildFileName(mimeType: string): string {
  return randomFileName(normalizeExt(mimeType));
}
