import { StrictMode } from 'react';
import { createRoot } from 'react-dom/client';
import App from './App.tsx';
import { ErrorBoundary } from './components/ErrorBoundary.tsx';
import './index.css';

/**
 * 摘掉首屏骨架屏
 *
 * 用 MutationObserver 而不是 `render()` 之后立刻移除：React 19 的并发模式下
 * `createRoot().render()` 是异步的，立刻移除会出现「骨架闪一下、界面再出现」的抖动。
 *
 * 加一个兜底定时器：万一 React 挂载过程中抛错（ErrorBoundary 也接管不了的情况），
 * 骨架不会永远停在屏幕上，而是切成错误提示 —— 用户能看懂发生了什么，
 * 而不是对着一个永远转圈的加载动画发呆。
 */
function dismissBootSkeleton(root: HTMLElement) {
  const skeleton = document.getElementById('boot-skeleton');
  if (!skeleton) return;

  const remove = () => {
    // 淡出再移除，避免硬切造成的闪白
    skeleton.style.transition = 'opacity 0.18s ease-out';
    skeleton.style.opacity = '0';
    setTimeout(() => skeleton.remove(), 200);
  };

  const observer = new MutationObserver(() => {
    if (root.childElementCount > 0) {
      observer.disconnect();
      remove();
    }
  });
  observer.observe(root, { childList: true });

  // 兜底：8 秒还没挂载上，多半是出错了，把提示改成可读的文案
  setTimeout(() => {
    if (!document.getElementById('boot-skeleton')) return;
    if (root.childElementCount > 0) return;
    const status = skeleton.querySelector('.bs-status span');
    if (status) status.textContent = '启动耗时较长，请稍候…（若持续无响应请查看终端日志）';
  }, 8000);
}

const rootEl = document.getElementById('root')!;
dismissBootSkeleton(rootEl);

createRoot(rootEl).render(
  <StrictMode>
    <ErrorBoundary>
      <App />
    </ErrorBoundary>
  </StrictMode>,
);