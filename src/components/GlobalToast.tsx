import React, { useEffect, useRef, useState } from 'react';

/**
 * 全局浮层提示（Toast）。
 *
 * 为什么单独做，而不是复用 App.tsx 里已有的 toastMessage：
 *  1. 层级冲突 —— 那个是 z-50，而图床设置这类弹窗是 z-60。弹窗打开时
 *     复用它会被压在下面，用户根本看不到（这正是之前「保存成功提示要
 *     滚动到最上面才能看到」的根因）。
 *  2. 能力不足 —— 它只有「一条文字 + 一个小圆点」，承载不了
 *     上传进度、成功对勾、失败原因这类结构化内容。
 *
 * 用**纯 CSS 动画**而非 gif 图片资源：
 *  - 矢量清晰，不会在高分屏发虚
 *  - 可跟随主题色
 *  - 零网络请求，不拖慢首屏
 *  - 成功/失败用图形符号表达，比 gif 更直白
 */

export type ToastKind = 'info' | 'success' | 'error' | 'progress';

export interface ToastItem {
  id: string;
  kind: ToastKind;
  text: string;
  /** 失败时的补充说明（如具体原因） */
  detail?: string;
}

interface Props {
  toasts: ToastItem[];
  onDismiss: (id: string) => void;
  /** 进度类提示不自动消失（上传中不该自己跑掉） */
  stickyKinds?: ToastKind[];
}

let seq = 0;

/** 供外部快速发一条提示 */
export function makeToast(kind: ToastKind, text: string, detail?: string): ToastItem {
  return { id: `t${++seq}`, kind, text, detail };
}

const KIND_STYLES: Record<ToastKind, { bar: string; ring: string }> = {
  info: { bar: 'bg-slate-400', ring: 'text-slate-400' },
  success: { bar: 'bg-emerald-500', ring: 'text-emerald-500' },
  error: { bar: 'bg-rose-500', ring: 'text-rose-500' },
  progress: { bar: 'bg-sky-500', ring: 'text-sky-500' },
};

export const GlobalToast: React.FC<Props> = ({ toasts, onDismiss, stickyKinds = ['progress'] }) => {
  // 只渲染最近 3 条，堆太多会挡住界面
  const visible = toasts.slice(-3);

  return (
    <>
      <style>{TOAST_STYLE}</style>
      <div className="fixed top-4 right-4 z-[200] flex flex-col gap-2 pointer-events-none max-w-[min(92vw,380px)]">
        {visible.map((t) => (
          <ToastRow key={t.id} toast={t} onDismiss={onDismiss} sticky={stickyKinds.includes(t.kind)} />
        ))}
      </div>
    </>
  );
};

const ToastRow: React.FC<{ toast: ToastItem; onDismiss: (id: string) => void; sticky: boolean }> = ({
  toast,
  onDismiss,
  sticky,
}) => {
  const [leaving, setLeaving] = useState(false);
  const timerRef = useRef<number | null>(null);

  useEffect(() => {
    // 上传中 / 需要用户注意的不自动消失
    if (sticky) return;
    timerRef.current = window.setTimeout(() => {
      setLeaving(true);
      window.setTimeout(() => onDismiss(toast.id), 200);
    }, toast.kind === 'error' ? 6000 : 3200);
    return () => {
      if (timerRef.current) window.clearTimeout(timerRef.current);
    };
  }, [sticky, toast.id, toast.kind, onDismiss]);

  const style = KIND_STYLES[toast.kind];

  return (
    <div
      role="status"
      aria-live="polite"
      className={`pointer-events-auto relative overflow-hidden rounded-xl bg-white/95 backdrop-blur-md
        border border-slate-200 shadow-xl shadow-slate-900/10 pl-3.5 pr-3 py-2.5
        flex items-start gap-2.5 min-w-[240px]
        transition-all duration-200
        ${leaving ? 'opacity-0 translate-x-3' : 'gzh-toast-in'}`}
    >
      {/* 左侧色条：用颜色区分类型，比图标更省视觉空间 */}
      <span className={`absolute left-0 top-0 bottom-0 w-[3px] ${style.bar}`} />

      <span className="shrink-0 mt-0.5">
        {toast.kind === 'progress' && <UploadSpinner className={style.ring} />}
        {toast.kind === 'success' && <CheckMark className={style.ring} />}
        {toast.kind === 'error' && <ErrorMark className={style.ring} />}
        {toast.kind === 'info' && <InfoMark className={style.ring} />}
      </span>

      <div className="min-w-0 flex-1">
        <div className="text-xs font-medium text-slate-800 break-words leading-snug">{toast.text}</div>
        {toast.detail && (
          <div className="text-[11px] text-slate-500 mt-0.5 break-words leading-relaxed">{toast.detail}</div>
        )}
      </div>

      {!sticky && (
        <button
          onClick={() => onDismiss(toast.id)}
          aria-label="关闭提示"
          className="shrink-0 text-slate-300 hover:text-slate-600 transition-colors mt-0.5"
        >
          <svg viewBox="0 0 16 16" className="w-3 h-3" fill="none" stroke="currentColor" strokeWidth="2">
            <path d="M4 4l8 8M12 4l-8 8" strokeLinecap="round" />
          </svg>
        </button>
      )}
    </div>
  );
};

/* ── 图形符号（内联 SVG，无外部资源） ── */

/**
 * 入场动画用原生 keyframes 而非 Tailwind 的 animate-in / slide-in-from-*。
 * 后者依赖 tailwindcss-animate 插件，本项目没装 —— 原来的 toast 一直
 * 挂着 `animate-in` 类却没有任何动画，就是这个原因。不为一个入场效果
 * 引入新依赖，直接用 keyframes 更可控。
 */
const TOAST_STYLE = `
@keyframes gzh-toast-in {
  from { opacity: 0; transform: translateX(24px); }
  to   { opacity: 1; transform: translateX(0); }
}
.gzh-toast-in { animation: gzh-toast-in 220ms cubic-bezier(0.16, 1, 0.3, 1); }
@media (prefers-reduced-motion: reduce) {
  .gzh-toast-in { animation: none; }
}
`;

const UploadSpinner: React.FC<{ className?: string }> = ({ className }) => (
  <svg viewBox="0 0 24 24" className={`w-4 h-4 animate-spin ${className}`} fill="none">
    <circle cx="12" cy="12" r="9" stroke="currentColor" strokeWidth="2.5" opacity="0.2" />
    <path
      d="M21 12a9 9 0 0 0-9-9"
      stroke="currentColor"
      strokeWidth="2.5"
      strokeLinecap="round"
    />
  </svg>
);

const CheckMark: React.FC<{ className?: string }> = ({ className }) => (
  <svg viewBox="0 0 24 24" className={`w-4 h-4 ${className}`} fill="none" stroke="currentColor" strokeWidth="3">
    <path d="M4 12.5l5.5 5.5L20 7" strokeLinecap="round" strokeLinejoin="round" />
  </svg>
);

const ErrorMark: React.FC<{ className?: string }> = ({ className }) => (
  <svg viewBox="0 0 24 24" className={`w-4 h-4 ${className}`} fill="none" stroke="currentColor" strokeWidth="2.5">
    <circle cx="12" cy="12" r="9" />
    <path d="M12 7.5v6M12 16.5v.5" strokeLinecap="round" />
  </svg>
);

const InfoMark: React.FC<{ className?: string }> = ({ className }) => (
  <svg viewBox="0 0 24 24" className={`w-4 h-4 ${className}`} fill="none" stroke="currentColor" strokeWidth="2.5">
    <circle cx="12" cy="12" r="9" />
    <path d="M12 11v5.5M12 7.5v.5" strokeLinecap="round" />
  </svg>
);