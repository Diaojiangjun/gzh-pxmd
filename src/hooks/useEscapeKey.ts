import { useEffect, useRef } from 'react';

/**
 * 弹层通用：Esc 关闭。
 *
 * 抽出来之前，这段 `window.addEventListener('keydown')` 样板在 9 个组件里各写了一遍，
 * 而且有 4 个弹窗干脆漏了实现（只能用鼠标点右上角 × 关闭）。
 */
export function useEscapeKey(active: boolean, onClose: () => void): void {
  // 用 ref 持有最新回调，避免调用方传入内联箭头函数时每次渲染都重新订阅
  const handlerRef = useRef(onClose);
  handlerRef.current = onClose;

  useEffect(() => {
    if (!active) return;
    const onKeyDown = (e: KeyboardEvent) => {
      if (e.key === 'Escape') {
        e.stopPropagation();
        handlerRef.current();
      }
    };
    window.addEventListener('keydown', onKeyDown);
    return () => window.removeEventListener('keydown', onKeyDown);
  }, [active]);
}
