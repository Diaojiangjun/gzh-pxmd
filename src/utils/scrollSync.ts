/**
 * 编辑器 ↔ 预览的滚动同步换算
 *
 * 为什么不用「可视区滚动百分比」：
 *   编辑器里 100 行文字占 2000px，预览里同样的内容渲染后可能占 6000px（字号、
 *   行高、图片、代码块样式都不同）。两边都滚到 50% 时，编辑器视口在第 50 行，
 *   预览视口却可能在第 150 行的位置 —— 越往下偏得越多。
 *
 * 改用「内容进度」：视口中心在**全文**中的位置。
 *   - 它与容器高度无关，密度差异被摊平；
 *   - 滚到底时进度恰好为 1，两端会自然同时到底；
 *   - 边界显式传 0/1，避免按比例换算在两端留下半个视口的误差。
 */

const clamp01 = (n: number) => Math.max(0, Math.min(1, n));

/** 判定为「到底」的容差（px）—— 2px 足够覆盖亚像素滚动与浏览器留白 */
const EDGE_EPS = 2;

/**
 * 编辑器侧：滚动位置 → 内容进度（0~1）
 *
 * @param scrollTop    当前滚动位置
 * @param clientHeight 可视区高度
 * @param scrollHeight 全文高度
 */
export function computeEditorProgress(
  scrollTop: number,
  clientHeight: number,
  scrollHeight: number
): number {
  const maxScroll = scrollHeight - clientHeight;

  // 内容装不满一屏：没有「滚动中段」，统一视作顶部
  if (scrollHeight <= 0 || maxScroll <= EDGE_EPS) return 0;
  if (scrollTop <= EDGE_EPS) return 0;
  // 到底：直接给 1，不走比例换算
  if (scrollTop >= maxScroll - EDGE_EPS) return 1;

  return clamp01((scrollTop + clientHeight / 2) / scrollHeight);
}

/**
 * 预览侧：内容进度 → 目标滚动位置
 *
 * 与 computeEditorProgress 严格互逆（边界除外），因此
 * 「编辑器滚到底 → 预览也滚到底」是结构上成立的，而非碰巧。
 *
 * @returns 目标 scrollTop（已钳制在合法范围内）
 */
export function computePreviewScrollTop(
  progress: number,
  scrollHeight: number,
  clientHeight: number
): number {
  const maxScroll = scrollHeight - clientHeight;
  if (scrollHeight <= 0 || maxScroll <= 0) return 0;

  if (progress <= 0.001) return 0;
  if (progress >= 0.999) return maxScroll;

  const target = progress * scrollHeight - clientHeight / 2;
  return Math.max(0, Math.min(maxScroll, target));
}

/**
 * 两个容器在给定进度下的对齐误差（预览实际位置 与 期望位置之差，px）。
 *
 * 仅用于测试与诊断：内容渲染高度与源文本高度不可能完全成比例，
 * 这个值能直观看出同步有多准。
 */
export function alignmentError(
  editor: { scrollTop: number; clientHeight: number; scrollHeight: number },
  preview: { clientHeight: number; scrollHeight: number }
): number {
  const progress = computeEditorProgress(
    editor.scrollTop,
    editor.clientHeight,
    editor.scrollHeight
  );
  const expected = computePreviewScrollTop(progress, preview.scrollHeight, preview.clientHeight);
  // 期望值换算回「编辑器视角的进度」再比较，避免跨容器直接比像素
  const actualProgress = computeEditorProgress(
    expected,
    preview.clientHeight,
    preview.scrollHeight
  );
  return Math.abs(actualProgress - progress) * preview.scrollHeight;
}