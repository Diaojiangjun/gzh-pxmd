import React from 'react';
import {
  X,
  Sparkles,
  Search,
  Copy,
  Check,
  ClipboardCheck,
  BookOpen,
  Info,
  Megaphone,
  ShieldCheck,
  Palette,
  SlidersHorizontal,
  Blocks,
  Sigma,
  FolderTree,
  History,
  Smartphone,
  Image as ImageIcon,
  ExternalLink,
  HeartHandshake,
  Upload,
  Trash2,
  Code2,
  QrCode,
  MessageCircle,
  Users,
  Radio,
  Mail,
  Github,
  Globe,
  Tv,
  AtSign,
  Link2,
} from 'lucide-react';
import { SYNTAX_GROUPS, type SyntaxItem } from '../data/syntaxReference';
import {
  APP_INFO,
  APP_FEATURES,
  APP_STACK,
  APP_CREDITS,
  APP_OWNER,
  getContacts,
  type ContactItem,
  type ContactType,
} from '../data/appInfo';
import {
  getPromoConfig,
  savePromoConfig,
  buildPromoMarkdown,
  promoSummary,
  QR_MAX_BYTES,
  DEFAULT_PROMO,
  type PromoConfig,
} from '../services/promoService';
import { compileWeChatMarkdown } from '../services/gzhCompiler';
import type { ThemeConfig, BackgroundSettings } from '../types';
import { useEscapeKey } from '../hooks/useEscapeKey';

type TabId = 'syntax' | 'about' | 'promo';

interface AboutModalProps {
  isOpen: boolean;
  onClose: () => void;
  /** 用于推广位预览的当前主题与背景（可选，不传则只给源码预览） */
  theme?: ThemeConfig;
  background?: BackgroundSettings;
  /** 直接打开某个 Tab（从「插入推广位」跳过来时用） */
  initialTab?: TabId;
}

const FEATURE_ICONS: Record<string, React.ElementType> = {
  shield: ShieldCheck,
  palette: Palette,
  sliders: SlidersHorizontal,
  blocks: Blocks,
  function: Sigma,
  clipboard: ClipboardCheck,
  folder: FolderTree,
  history: History,
  smartphone: Smartphone,
  sparkles: Sparkles,
};

/** 联系方式类型 → 图标 */
const CONTACT_ICONS: Record<ContactType, React.ElementType> = {
  'wechat-mp': QrCode,
  wechat: MessageCircle,
  'qq-group': Users,
  'qq-channel': Radio,
  qq: MessageCircle,
  email: Mail,
  github: Github,
  website: Globe,
  bilibili: Tv,
  x: AtSign,
  custom: Link2,
};

/**
 * 「使用说明」弹窗，三个 Tab：
 *  1. 语法速查 —— 随用随查的语法手册（内容主体）
 *  2. 关于本器 —— 产品定位、核心特性、技术栈、来源致谢、支持与反馈
 *  3. 我的推广位 —— 公众号关注引导的配置与生成，一键插入文末
 */
export const AboutModal: React.FC<AboutModalProps> = ({
  isOpen,
  onClose,
  theme,
  background,
  initialTab = 'syntax',
}) => {
  const [tab, setTab] = React.useState<TabId>(initialTab);
  const [groupId, setGroupId] = React.useState(SYNTAX_GROUPS[0].id);
  const [query, setQuery] = React.useState('');
  const [copied, setCopied] = React.useState<string | null>(null);
  const [promo, setPromo] = React.useState<PromoConfig>(() => getPromoConfig());
  const [promoMsg, setPromoMsg] = React.useState<string | null>(null);
  /** 联系方式里的配图放大预览 */
  const [previewImage, setPreviewImage] = React.useState<{ src: string; alt: string } | null>(null);

  // 图片预览打开时，Esc 先关预览、不关弹窗（否则一按 Esc 整个窗口都没了）
  useEscapeKey(isOpen && !previewImage, onClose);

  React.useEffect(() => {
    if (!previewImage) return;
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') {
        e.stopPropagation();
        setPreviewImage(null);
      }
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [previewImage]);

  React.useEffect(() => {
    if (!isOpen) return;
    setTab(initialTab);
    setGroupId(SYNTAX_GROUPS[0].id);
    setQuery('');
    setCopied(null);
    setPromo(getPromoConfig());
    setPromoMsg(null);
  }, [isOpen, initialTab]);

  /* ── 推广位预览：跟着当前主题渲染，所见即所得 ── */
  const promoMarkdown = React.useMemo(() => buildPromoMarkdown(promo), [promo]);
  const promoHtml = React.useMemo(() => {
    if (!isOpen || !theme || !background) return '';
    try {
      return compileWeChatMarkdown(promoMarkdown, theme, background, { convertLinksToFootnotes: false });
    } catch {
      return '';
    }
  }, [isOpen, promoMarkdown, theme, background]);

  /**
   * 开发者联系方式。
   *
   * ⚠️ 刻意**不**和「我的推广位」做任何联动：推广位是**使用者**自己的公众号
   * （随文章发给读者），这里是**开发者**的联系方式（随软件给别人看），
   * 归属不同的人，共用数据只会互相污染。
   */
  const contacts = React.useMemo<ContactItem[]>(
    () =>
      getContacts().filter(
        (c) => (c.label ?? '').trim().length > 0 || (c.value ?? '').trim().length > 0
      ),
    // isOpen 变化时重新读取：调试时在控制台改了 override 能立刻看到效果
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [isOpen]
  );

  if (!isOpen) return null;

  const flash = (msg: string) => {
    setPromoMsg(msg);
    setTimeout(() => setPromoMsg(null), 2200);
  };

  const copyToClipboard = async (text: string, key: string) => {
    try {
      await navigator.clipboard.writeText(text);
      setCopied(key);
      setTimeout(() => setCopied(null), 1600);
      return true;
    } catch {
      return false;
    }
  };

  const updatePromo = (patch: Partial<PromoConfig>) => {
    const next: PromoConfig = { ...promo, ...patch, enabled: true };
    setPromo(next);
    savePromoConfig(next);
  };

  /** 二维码图片：读成 dataURL 存本地，超限直接拒绝（localStorage 只有 5MB） */
  const handleQrUpload = (file: File) => {
    if (!file.type.startsWith('image/')) {
      flash('请选择图片文件');
      return;
    }
    const reader = new FileReader();
    reader.onload = () => {
      const dataUrl = String(reader.result || '');
      if (dataUrl.length > QR_MAX_BYTES) {
        flash(`图片约 ${Math.round(dataUrl.length / 1024)}KB，超过 ${QR_MAX_BYTES / 1024}KB 上限，请先压缩`);
        return;
      }
      updatePromo({ qrImage: dataUrl });
      flash('二维码已保存到本地');
    };
    reader.onerror = () => flash('图片读取失败');
    reader.readAsDataURL(file);
  };

  const promoStat = promoSummary(promo);

  /* ────────────────── Tab 1：语法速查 ────────────────── */

  const kw = query.trim().toLowerCase();
  const searchResults =
    kw.length > 0
      ? SYNTAX_GROUPS.flatMap((g) =>
          g.items
            .filter((it) => [it.label, it.desc, it.syntax].some((s) => s.toLowerCase().includes(kw)))
            .map((it) => ({ ...it, groupId: g.id, groupTitle: g.title }))
        )
      : null;

  const currentGroup = SYNTAX_GROUPS.find((g) => g.id === groupId) ?? SYNTAX_GROUPS[0];
  const syntaxItems =
    searchResults ??
    currentGroup.items.map((it) => ({ ...it, groupId: currentGroup.id, groupTitle: currentGroup.title }));

  const renderSyntaxTab = () => (
    <div className="flex-1 flex min-h-0">
      <div className="w-40 shrink-0 border-r border-slate-100 py-2 overflow-y-auto">
        {SYNTAX_GROUPS.map((g) => {
          const active = !searchResults && g.id === groupId;
          return (
            <button
              key={g.id}
              onClick={() => {
                setGroupId(g.id);
                setQuery('');
              }}
              className={`text-left mx-2 mb-0.5 px-2.5 py-2 rounded-lg flex items-center justify-between gap-2 w-[calc(100%-16px)] transition-colors ${
                active ? 'bg-emerald-50 text-emerald-800' : 'text-slate-600 hover:bg-slate-50'
              }`}
            >
              <span className={`text-[11px] ${active ? 'font-bold' : 'font-medium'}`}>{g.title}</span>
              <span className="text-[10px] text-slate-400">{g.items.length}</span>
            </button>
          );
        })}
      </div>

      <div className="flex-1 overflow-y-auto min-w-0">
        <div className="px-4 pt-3.5 pb-2 flex items-start justify-between gap-3">
          <div className="min-w-0">
            <div className="text-xs font-bold text-slate-800">
              {searchResults ? `搜索结果（${syntaxItems.length}）` : currentGroup.title}
            </div>
            <div className="text-[10px] text-slate-400 mt-0.5">
              {searchResults ? `在所有分类中匹配「${query.trim()}」` : currentGroup.hint}
            </div>
          </div>
          <div className="relative w-52 shrink-0">
            <Search className="w-3.5 h-3.5 text-slate-400 absolute left-2.5 top-1/2 -translate-y-1/2 pointer-events-none" />
            <input
              type="text"
              value={query}
              onChange={(e) => setQuery(e.target.value)}
              placeholder="搜索语法，如 表格 / 公式"
              className="w-full pl-8 pr-7 py-1.5 rounded-lg border border-slate-200 bg-white text-[11px] text-slate-700 placeholder:text-slate-400 focus:outline-none focus:border-emerald-500 focus:ring-2 focus:ring-emerald-500/15"
            />
            {query && (
              <button
                onClick={() => setQuery('')}
                aria-label="清空搜索"
                className="absolute right-1.5 top-1/2 -translate-y-1/2 p-1 rounded text-slate-400 hover:text-slate-600"
              >
                <X className="w-3 h-3" />
              </button>
            )}
          </div>
        </div>

        {syntaxItems.length === 0 ? (
          <div className="px-4 py-8 text-center text-[11px] text-slate-400">
            没有找到匹配的语法。试试「表格」「公式」「目录」「注音」这些关键词。
          </div>
        ) : (
          <div className="px-4 pb-4 space-y-2">
            {syntaxItems.map((item) => (
              <div
                key={`${item.groupId}-${item.label}`}
                className="rounded-lg border border-slate-200 hover:border-emerald-300 transition-colors overflow-hidden"
              >
                <div className="flex items-center justify-between gap-2 px-3 py-1.5 bg-slate-50 border-b border-slate-100">
                  <span className="text-[11px] font-bold text-slate-700 truncate">
                    {item.label}
                    {searchResults && (
                      <span className="ml-1.5 text-[9px] font-normal text-slate-400">{item.groupTitle}</span>
                    )}
                  </span>
                  <button
                    onClick={() => copyToClipboard(item.syntax, item.syntax)}
                    title="复制这段语法"
                    className="shrink-0 px-1.5 py-0.5 rounded text-[10px] font-medium text-slate-500 hover:text-emerald-700 hover:bg-emerald-50 flex items-center gap-1 transition-colors"
                  >
                    {copied === item.syntax ? (
                      <>
                        <Check className="w-3 h-3 text-emerald-600" />
                        已复制
                      </>
                    ) : (
                      <>
                        <Copy className="w-3 h-3" />
                        复制
                      </>
                    )}
                  </button>
                </div>
                <pre className="m-0 px-3 py-2 bg-slate-900 text-emerald-300 font-mono text-[10px] leading-relaxed whitespace-pre-wrap break-words">
                  {item.syntax}
                </pre>
                <p className="px-3 py-2 text-[10px] text-slate-500 leading-relaxed">{item.desc}</p>
              </div>
            ))}
          </div>
        )}
      </div>
    </div>
  );

  /* ────────────────── Tab 2：关于本器 ────────────────── */

  /** 诊断信息：用户反馈问题时直接贴给开发者，省掉来回问环境 */
  const buildDiagnostics = () =>
    [
      `${APP_INFO.name} v${APP_INFO.version}`,
      `平台：${navigator.userAgent}`,
      `主题：${theme?.name ?? '未知'}`,
      `主题令牌：${theme?.tokens ? Object.keys(theme.tokens).length : 0} 项`,
      `时间：${new Date().toLocaleString('zh-CN')}`,
    ].join('\n');

  const renderAboutTab = () => (
    <div className="flex-1 overflow-y-auto min-w-0 px-6 py-5 space-y-6">
      {/* 产品头 */}
      <div className="flex items-start gap-4">
        <div className="w-12 h-12 rounded-2xl bg-emerald-100 text-emerald-600 flex items-center justify-center shrink-0">
          <Sparkles className="w-6 h-6" />
        </div>
        <div className="min-w-0">
          <div className="flex items-baseline gap-2 flex-wrap">
            <h4 className="text-base font-bold text-slate-800">{APP_INFO.name}</h4>
            <span className="text-[10px] text-slate-400 font-mono">v{APP_INFO.version}</span>
          </div>
          <p className="text-[11px] text-emerald-700 font-medium mt-0.5">{APP_INFO.tagline}</p>
          <p className="text-[11px] text-slate-500 leading-relaxed mt-2">{APP_INFO.intro}</p>
          {APP_OWNER.author && (
            <p className="text-[10px] text-slate-400 mt-1.5">作者：{APP_OWNER.author}</p>
          )}
        </div>
      </div>

      {/* 隐私声明 */}
      <div className="bg-emerald-50/60 border border-emerald-200/80 rounded-xl p-3.5 flex items-start gap-2.5">
        <ShieldCheck className="w-4 h-4 text-emerald-600 shrink-0 mt-0.5" />
        <div>
          <div className="font-bold text-emerald-900 text-xs mb-0.5">100% 离线与隐私安全</div>
          <p className="text-[11px] text-emerald-700 leading-relaxed">
            排版规范、主题与组件资源全部内置于本地，不依赖任何云端接口。写作内容、图片与截图
            只保存在你自己的电脑上，不会上传到任何服务器。
          </p>
        </div>
      </div>

      {/* 核心特性 */}
      <div>
        <h5 className="text-xs font-bold text-slate-800 mb-2.5">核心能力</h5>
        <div className="grid grid-cols-2 gap-2.5">
          {APP_FEATURES.map((f) => {
            const Icon = FEATURE_ICONS[f.icon] ?? Sparkles;
            return (
              <div key={f.title} className="rounded-xl border border-slate-200 p-3 hover:border-emerald-300 transition-colors">
                <div className="flex items-center gap-1.5 mb-1">
                  <Icon className="w-3.5 h-3.5 text-emerald-600 shrink-0" />
                  <span className="text-[11px] font-bold text-slate-800">{f.title}</span>
                </div>
                <p className="text-[10px] text-slate-500 leading-relaxed">{f.desc}</p>
              </div>
            );
          })}
        </div>
      </div>

      {/* 技术栈 */}
      <div>
        <h5 className="text-xs font-bold text-slate-800 mb-2">技术栈</h5>
        <div className="flex flex-wrap gap-1.5">
          {APP_STACK.map((s) => (
            <span key={s} className="px-2 py-0.5 rounded-full bg-slate-100 text-[10px] font-medium text-slate-600">
              {s}
            </span>
          ))}
        </div>
      </div>

      {/* 来源与致谢 */}
      <div>
        <h5 className="text-xs font-bold text-slate-800 mb-2">来源与致谢</h5>
        <div className="space-y-1.5">
          {APP_CREDITS.map((c) => (
            <div key={c.name} className="flex items-start gap-2 text-[10px] leading-relaxed">
              <span className="w-1 h-1 rounded-full bg-slate-300 mt-1.5 shrink-0" />
              <span className="text-slate-500">
                {c.url ? (
                  <a
                    href={c.url}
                    target="_blank"
                    rel="noopener noreferrer"
                    className="font-medium text-emerald-700 hover:underline inline-flex items-center gap-0.5"
                  >
                    {c.name}
                    <ExternalLink className="w-2.5 h-2.5" />
                  </a>
                ) : (
                  <span className="font-medium text-slate-700">{c.name}</span>
                )}
                <span className="mx-1 text-slate-300">·</span>
                {c.desc}
              </span>
            </div>
          ))}
        </div>
      </div>

      {/* 开发者 / 联系我 */}
      <div>
        <h5 className="text-xs font-bold text-slate-800 mb-2 flex items-center gap-1.5">
          <MessageCircle className="w-3.5 h-3.5 text-emerald-600" />
          开发者 / 联系我
        </h5>

        {contacts.length === 0 ? (
          <div className="rounded-xl border border-dashed border-slate-200 p-3.5 text-[10px] text-slate-400 leading-relaxed">
            还没有填写联系方式。打开{' '}
            <code className="px-1 rounded bg-slate-100 text-slate-600 font-mono">src/data/appInfo.ts</code> 里的{' '}
            <code className="px-1 rounded bg-slate-100 text-slate-600 font-mono">APP_CONTACTS</code>
            ，填上公众号、QQ 群、邮箱等，保存后就会显示在这里。
            <br />
            公众号二维码用 <code className="px-1 rounded bg-slate-100 text-slate-600 font-mono">image</code>{' '}
            字段配图（如 <code className="px-1 rounded bg-slate-100 text-slate-600 font-mono">/assets/qr-mp.png</code>
            ），卡片里会显示缩略图、点击可放大。
          </div>
        ) : (
          <div className="grid grid-cols-2 gap-2.5">
            {contacts.map((c, i) => {
              const Icon = CONTACT_ICONS[c.type] ?? Link2;
              const copyKey = `contact-${i}`;
              const openPreview = (e: React.MouseEvent | React.KeyboardEvent) => {
                e.stopPropagation();
                e.preventDefault();
                if (c.image) setPreviewImage({ src: c.image, alt: c.label || '图片' });
              };

              // 缩略图用 span+role 而不是 button：卡片外层本身可能是 <button> / <a>，
              // 里面再嵌 <button> 是非法嵌套（React 会报 validateDOMNesting 警告）
              const thumb = c.image ? (
                <span
                  role="button"
                  tabIndex={0}
                  title="点击查看大图"
                  onClick={openPreview}
                  onKeyDown={(e) => {
                    if (e.key === 'Enter' || e.key === ' ') openPreview(e);
                  }}
                  className="shrink-0 rounded-lg border border-slate-200 bg-white overflow-hidden cursor-zoom-in hover:border-emerald-400 hover:shadow-xs transition-all"
                >
                  <img src={c.image} alt={c.label || '联系方式配图'} className="w-14 h-14 object-contain" />
                </span>
              ) : null;

              const body = (
                <>
                  <Icon className="w-4 h-4 text-emerald-600 shrink-0 mt-0.5" />
                  <div className="min-w-0 flex-1">
                    <div className="text-[11px] font-bold text-slate-800 truncate">{c.label || c.value}</div>
                    {c.value && c.label && (
                      <div className="text-[10px] font-mono text-slate-500 truncate mt-0.5">{c.value}</div>
                    )}
                    {c.note && <div className="text-[10px] text-slate-400 mt-0.5">{c.note}</div>}
                  </div>
                </>
              );

              if (c.href) {
                return (
                  <a
                    key={`${c.type}-${i}`}
                    href={c.href}
                    target="_blank"
                    rel="noopener noreferrer"
                    className="rounded-xl border border-slate-200 p-3 flex items-start gap-2.5 hover:border-emerald-300 hover:bg-emerald-50/30 transition-colors"
                  >
                    {body}
                    {thumb}
                    <ExternalLink className="w-3 h-3 text-slate-300 shrink-0 mt-0.5" />
                  </a>
                );
              }

              return (
                <button
                  key={`${c.type}-${i}`}
                  onClick={() => copyToClipboard(c.value || c.label, copyKey)}
                  title={c.value ? `点击复制：${c.value}` : c.label}
                  className="rounded-xl border border-slate-200 p-3 flex items-start gap-2.5 hover:border-emerald-300 hover:bg-emerald-50/30 transition-colors text-left"
                >
                  {body}
                  {thumb}
                  {copied === copyKey ? (
                    <Check className="w-3.5 h-3.5 text-emerald-600 shrink-0 mt-0.5" />
                  ) : (
                    <Copy className="w-3.5 h-3.5 text-slate-300 shrink-0 mt-0.5" />
                  )}
                </button>
              );
            })}
          </div>
        )}
      </div>

      {/* 支持与反馈 */}
      <div>
        <h5 className="text-xs font-bold text-slate-800 mb-2 flex items-center gap-1.5">
          <HeartHandshake className="w-3.5 h-3.5 text-emerald-600" />
          支持与反馈
        </h5>
        <div className="flex flex-wrap gap-2">
          <button
            onClick={async () => {
              const ok = await copyToClipboard(buildDiagnostics(), 'diag');
              setPromoMsg(ok ? '诊断信息已复制，可直接粘贴给开发者' : '剪贴板不可用');
              setTimeout(() => setPromoMsg(null), 2400);
            }}
            className="px-3 py-1.5 rounded-lg border border-slate-200 hover:bg-slate-50 text-[11px] font-medium text-slate-600 flex items-center gap-1.5 transition-colors"
          >
            {copied === 'diag' ? <Check className="w-3 h-3 text-emerald-600" /> : <Copy className="w-3 h-3" />}
            复制诊断信息
          </button>

          {APP_OWNER.feedbackUrl && (
            <a
              href={APP_OWNER.feedbackUrl}
              target="_blank"
              rel="noopener noreferrer"
              className="px-3 py-1.5 rounded-lg border border-slate-200 hover:bg-slate-50 text-[11px] font-medium text-slate-600 flex items-center gap-1.5 transition-colors"
            >
              <ExternalLink className="w-3 h-3" />
              问题反馈
            </a>
          )}
          {APP_OWNER.repoUrl && (
            <a
              href={APP_OWNER.repoUrl}
              target="_blank"
              rel="noopener noreferrer"
              className="px-3 py-1.5 rounded-lg border border-slate-200 hover:bg-slate-50 text-[11px] font-medium text-slate-600 flex items-center gap-1.5 transition-colors"
            >
              <ExternalLink className="w-3 h-3" />
              项目源码
            </a>
          )}
          {APP_OWNER.donateUrl && (
            <a
              href={APP_OWNER.donateUrl}
              target="_blank"
              rel="noopener noreferrer"
              className="px-3 py-1.5 rounded-lg border border-amber-200 bg-amber-50 hover:bg-amber-100 text-[11px] font-medium text-amber-700 flex items-center gap-1.5 transition-colors"
            >
              <HeartHandshake className="w-3 h-3" />
              赞赏支持
            </a>
          )}
        </div>
        {promoMsg && <p className="text-[10px] text-emerald-700 mt-2">{promoMsg}</p>}
      </div>
    </div>
  );

  /* ────────────────── Tab 3：我的推广位 ────────────────── */

  const renderPromoTab = () => (
    <div className="flex-1 flex min-h-0">
      {/* 左：配置 */}
      <div className="w-[380px] shrink-0 border-r border-slate-100 overflow-y-auto px-4 py-4 space-y-4">
        <div className="flex items-start gap-2 px-3 py-2.5 rounded-lg bg-slate-50 border border-slate-200 text-[10px] text-slate-500 leading-relaxed">
          <Info className="w-3.5 h-3.5 mt-0.5 shrink-0 text-slate-400" />
          <span>
            配好一次，之后在编辑器工具栏点「推广位」就能插入到光标处。内容保存在本地，随时可改。
          </span>
        </div>

        <div>
          <label className="block text-[11px] font-semibold text-slate-700 mb-1.5">公众号名称</label>
          <input
            type="text"
            value={promo.accountName}
            onChange={(e) => updatePromo({ accountName: e.target.value })}
            placeholder="例：宝藏排版研究所"
            className="w-full px-2.5 py-2 rounded-lg border border-slate-200 bg-white text-[11px] text-slate-700 placeholder:text-slate-400 focus:outline-none focus:border-emerald-500 focus:ring-2 focus:ring-emerald-500/15"
          />
        </div>

        <div>
          <label className="block text-[11px] font-semibold text-slate-700 mb-1.5">
            公众号二维码
            <span className="ml-1.5 font-normal text-slate-400">不超过 {QR_MAX_BYTES / 1024}KB</span>
          </label>
          {promo.qrImage ? (
            <div className="flex items-center gap-3 p-2.5 rounded-lg border border-slate-200 bg-slate-50">
              <img
                src={promo.qrImage}
                alt="公众号二维码"
                className="w-16 h-16 rounded object-contain bg-white border border-slate-200 shrink-0"
              />
              <div className="min-w-0 flex-1">
                <div className="text-[10px] text-slate-500">
                  已保存（约 {Math.round(promo.qrImage.length / 1024)}KB）
                </div>
                <div className="flex gap-1.5 mt-1.5">
                  <label className="cursor-pointer px-2 py-1 rounded border border-slate-200 bg-white hover:bg-slate-50 text-[10px] font-medium text-slate-600 flex items-center gap-1 transition-colors">
                    <Upload className="w-3 h-3" />
                    更换
                    <input
                      type="file"
                      accept="image/*"
                      className="hidden"
                      onChange={(e) => {
                        const f = e.target.files?.[0];
                        if (f) handleQrUpload(f);
                        e.target.value = '';
                      }}
                    />
                  </label>
                  <button
                    onClick={() => updatePromo({ qrImage: '' })}
                    className="px-2 py-1 rounded border border-slate-200 bg-white hover:bg-red-50 hover:text-red-600 hover:border-red-200 text-[10px] font-medium text-slate-600 flex items-center gap-1 transition-colors"
                  >
                    <Trash2 className="w-3 h-3" />
                    移除
                  </button>
                </div>
              </div>
            </div>
          ) : (
            <label className="cursor-pointer w-full py-4 rounded-lg border-2 border-dashed border-slate-200 hover:border-emerald-400 hover:bg-emerald-50/40 flex flex-col items-center gap-1.5 transition-colors">
              <ImageIcon className="w-5 h-5 text-slate-300" />
              <span className="text-[10px] text-slate-500">点击选择二维码图片</span>
              <input
                type="file"
                accept="image/*"
                className="hidden"
                onChange={(e) => {
                  const f = e.target.files?.[0];
                  if (f) handleQrUpload(f);
                  e.target.value = '';
                }}
              />
            </label>
          )}
        </div>

        <div>
          <label className="block text-[11px] font-semibold text-slate-700 mb-1.5">顶部标题</label>
          <input
            type="text"
            value={promo.footerTitle}
            onChange={(e) => updatePromo({ footerTitle: e.target.value })}
            placeholder={DEFAULT_PROMO.footerTitle}
            className="w-full px-2.5 py-2 rounded-lg border border-slate-200 bg-white text-[11px] text-slate-700 placeholder:text-slate-400 focus:outline-none focus:border-emerald-500"
          />
        </div>

        <div>
          <label className="block text-[11px] font-semibold text-slate-700 mb-1.5">
            引导语
            <span className="ml-1.5 font-normal text-slate-400">支持 **加粗**</span>
          </label>
          <textarea
            value={promo.guideText}
            rows={3}
            onChange={(e) => updatePromo({ guideText: e.target.value })}
            placeholder={DEFAULT_PROMO.guideText}
            className="w-full px-2.5 py-2 rounded-lg border border-slate-200 bg-white text-[11px] leading-relaxed text-slate-700 placeholder:text-slate-400 resize-none focus:outline-none focus:border-emerald-500"
          />
        </div>

        <div>
          <label className="block text-[11px] font-semibold text-slate-700 mb-1.5">二维码下方一句话</label>
          <input
            type="text"
            value={promo.slogan}
            onChange={(e) => updatePromo({ slogan: e.target.value })}
            placeholder={DEFAULT_PROMO.slogan}
            className="w-full px-2.5 py-2 rounded-lg border border-slate-200 bg-white text-[11px] text-slate-700 placeholder:text-slate-400 focus:outline-none focus:border-emerald-500"
          />
        </div>

        <div className="flex items-center gap-2 pt-1">
          <button
            onClick={() => {
              const ok = copyToClipboard(promoMarkdown, 'promo-md');
              flash(ok ? 'Markdown 已复制' : '剪贴板不可用');
            }}
            className="flex-1 py-2 rounded-lg border border-slate-200 hover:bg-slate-50 text-[11px] font-medium text-slate-600 flex items-center justify-center gap-1.5 transition-colors"
          >
            {copied === 'promo-md' ? <Check className="w-3 h-3 text-emerald-600" /> : <Code2 className="w-3 h-3" />}
            复制 Markdown
          </button>
          <button
            onClick={() => {
              setPromo({ ...DEFAULT_PROMO });
              savePromoConfig({ ...DEFAULT_PROMO });
              flash('已恢复默认文案');
            }}
            className="px-3 py-2 rounded-lg border border-slate-200 hover:bg-slate-50 text-[11px] font-medium text-slate-600 transition-colors"
          >
            恢复默认
          </button>
        </div>

        <div className="flex items-center gap-1.5 text-[10px]">
          <span
            className={`w-1.5 h-1.5 rounded-full ${promoStat.configured ? 'bg-emerald-500' : 'bg-amber-400'}`}
          />
          <span className="text-slate-500">
            {promoStat.configured
              ? `已配置${promoStat.hasQr ? '（含二维码）' : '（未上传二维码）'}`
              : '尚未配置：填公众号名或上传二维码后才可插入'}
          </span>
        </div>
        {promoMsg && <p className="text-[10px] text-emerald-700">{promoMsg}</p>}
      </div>

      {/* 右：预览 */}
      <div className="flex-1 flex flex-col min-w-0 bg-slate-50/60">
        <div className="flex items-center justify-between px-4 py-3 shrink-0">
          <span className="text-[11px] font-bold text-slate-700">效果预览</span>
          <span className="text-[10px] text-slate-400">
            {theme ? `按当前主题「${theme.name}」渲染` : '未提供主题，仅预览源码'}
          </span>
        </div>

        <div className="flex-1 overflow-y-auto px-4 pb-4 min-h-0">
          {promoHtml ? (
            <div className="bg-white rounded-xl border border-slate-200 shadow-xs">
              <div className="gzh-preview-container" dangerouslySetInnerHTML={{ __html: promoHtml }} />
            </div>
          ) : (
            <pre className="m-0 p-3 rounded-xl bg-slate-900 text-emerald-300 font-mono text-[10px] leading-relaxed whitespace-pre-wrap break-words">
              {promoMarkdown}
            </pre>
          )}

          <div className="mt-3">
            <div className="text-[10px] font-semibold text-slate-400 mb-1">生成的 Markdown</div>
            <pre className="m-0 p-3 rounded-xl bg-slate-900 text-slate-300 font-mono text-[10px] leading-relaxed whitespace-pre-wrap break-words">
              {promoMarkdown}
            </pre>
          </div>
        </div>
      </div>
    </div>
  );

  /* ────────────────── 组装 ────────────────── */

  const TABS: Array<{ id: TabId; label: string; icon: React.ElementType }> = [
    { id: 'syntax', label: '语法速查', icon: BookOpen },
    { id: 'about', label: '关于本器', icon: Info },
    { id: 'promo', label: '我的推广位', icon: Megaphone },
  ];

  return (
    <div
      role="dialog"
      aria-modal="true"
      aria-label="使用说明"
      className="fixed inset-0 bg-black/40 backdrop-blur-xs flex items-center justify-center z-[85] p-4"
      onClick={onClose}
    >
      <div
        className="bg-white rounded-2xl shadow-2xl border border-slate-200 w-full max-w-[980px] h-[87vh] flex flex-col overflow-hidden animate-in fade-in zoom-in-95 duration-150"
        onClick={(e) => e.stopPropagation()}
      >
        {/* Header */}
        <div className="px-5 pt-4 pb-0 border-b border-slate-100 shrink-0">
          <div className="flex items-center justify-between gap-4">
            <div className="flex items-center gap-2.5">
              <div className="w-8 h-8 rounded-full bg-emerald-100 text-emerald-600 flex items-center justify-center">
                <Sparkles className="w-4 h-4" />
              </div>
              <div>
                <h3 className="text-sm font-bold text-slate-800">使用说明</h3>
                <p className="text-[11px] text-slate-400">
                  语法速查 · 产品信息 · 我的推广位
                </p>
              </div>
            </div>
            <button
              onClick={onClose}
              aria-label="关闭"
              className="p-1 rounded-lg text-slate-400 hover:text-slate-700 hover:bg-slate-100 transition-colors"
            >
              <X className="w-4 h-4" />
            </button>
          </div>

          {/* Tab 栏 */}
          <div className="flex items-center gap-1 mt-3">
            {TABS.map((t) => {
              const Icon = t.icon;
              const active = tab === t.id;
              return (
                <button
                  key={t.id}
                  onClick={() => setTab(t.id)}
                  className={`px-3 py-2 rounded-t-lg text-[11px] font-semibold flex items-center gap-1.5 border-b-2 transition-colors ${
                    active
                      ? 'border-emerald-500 text-emerald-700 bg-emerald-50/50'
                      : 'border-transparent text-slate-500 hover:text-slate-700 hover:bg-slate-50'
                  }`}
                >
                  <Icon className="w-3.5 h-3.5" />
                  {t.label}
                  {t.id === 'promo' && promoStat.configured && (
                    <span className="w-1.5 h-1.5 rounded-full bg-emerald-500" />
                  )}
                </button>
              );
            })}
          </div>
        </div>

        {/* 粘贴指引：只在语法 Tab 显示（跟写作直接相关） */}
        {tab === 'syntax' && (
          <div className="px-5 py-2 bg-emerald-50/70 border-b border-emerald-100 flex items-center gap-2 text-[11px] text-emerald-800 shrink-0">
            <ClipboardCheck className="w-3.5 h-3.5 shrink-0" />
            <span>
              写完后点右上角绿色 <strong>「复制到公众号」</strong>，在 mp.weixin.qq.com 的正文区直接
              <code className="mx-1 px-1 rounded bg-white/70 font-mono">Ctrl + V</code>
              粘贴，字号、行高、代码框、卡片与底纹都会原样还原。
            </span>
          </div>
        )}

        {/* Body */}
        {tab === 'syntax' && renderSyntaxTab()}
        {tab === 'about' && renderAboutTab()}
        {tab === 'promo' && renderPromoTab()}

        {/* Footer */}
        <div className="px-5 py-3 bg-slate-50 border-t border-slate-100 flex items-center justify-between gap-4 shrink-0">
          <span className="text-[10px] text-slate-400 leading-relaxed">
            全部离线运行 · 写作内容只保存在你的电脑上 · {APP_INFO.name} v{APP_INFO.version}
          </span>
          <button
            onClick={onClose}
            className="shrink-0 px-4 py-1.5 rounded-lg bg-slate-900 hover:bg-slate-800 text-white text-xs font-medium transition-colors"
          >
            知道了
          </button>
        </div>

        {/* 图片放大预览 */}
        {previewImage && (
          <div
            role="dialog"
            aria-modal="true"
            aria-label="图片预览"
            className="fixed inset-0 z-[95] bg-black/75 flex items-center justify-center p-8"
            // 必须阻断冒泡：外层容器点的就是「关闭整个使用说明」
            onClick={(e) => {
              e.stopPropagation();
              setPreviewImage(null);
            }}
          >
            <div className="max-w-[420px] w-full" onClick={(e) => e.stopPropagation()}>
              <img
                src={previewImage.src}
                alt={previewImage.alt}
                className="w-full max-h-[62vh] object-contain rounded-2xl bg-white p-3 shadow-2xl"
              />
              <div className="mt-3 flex items-center justify-center gap-3">
                <span className="text-xs text-white/90 truncate max-w-[240px]">{previewImage.alt}</span>
                <button
                  onClick={() => setPreviewImage(null)}
                  className="px-4 py-1.5 rounded-lg bg-white/15 hover:bg-white/25 text-white text-xs font-medium transition-colors"
                >
                  关闭
                </button>
              </div>
            </div>
          </div>
        )}
      </div>
    </div>
  );
};
