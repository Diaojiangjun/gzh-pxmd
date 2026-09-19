import React from 'react';
import { AlertTriangle, CheckCircle2, ChevronDown, BookOpen } from 'lucide-react';
import {
  highlightCss,
  detectCompletionContext,
  CSS_PROPOSALS,
  SELECTOR_PROPOSALS,
} from '../utils/cssHighlight';
import { analyzeCustomCss } from '../utils/customCss';

interface CssEditorProps {
  value: string;
  onChange: (v: string) => void;
  readOnly?: boolean;
  placeholder?: string;
  /** 编辑区高度（px） */
  height?: number;
}

type CompletionItem = { name: string; note: string; sample?: string };

/**
 * 带语法高亮 / 自动补全 / 实时校验的自定义 CSS 编辑器。
 *
 * 排版对齐是这套方案的生命线：高亮层与输入层必须**逐像素一致**，
 * 否则光标会与看到的文字错位。所以这里不走「两个滚动容器 + JS 同步 scrollTop」，
 * 而是让 `<pre>` 留在文档流里撑开高度、`<textarea>` 绝对定位覆盖其上，
 * 由外层容器统一滚动 —— 天然同步，且两者都不产生滚动条，内容宽度必然相等。
 */
export const CssEditor: React.FC<CssEditorProps> = ({
  value,
  onChange,
  readOnly = false,
  placeholder = '',
  height = 260,
}) => {
  const taRef = React.useRef<HTMLTextAreaElement>(null);
  const [comp, setComp] = React.useState<{
    items: CompletionItem[];
    index: number;
    kind: 'prop' | 'selector';
    start: number;
  }>({ items: [], index: 0, kind: 'prop', start: 0 });
  const [showCheat, setShowCheat] = React.useState(false);

  const analysis = React.useMemo(() => analyzeCustomCss(value), [value]);
  const highlighted = React.useMemo(() => highlightCss(value), [value]);

  const closeComp = () => setComp((c) => (c.items.length ? { ...c, items: [] } : c));

  /** 根据光标位置刷新候选 */
  const syncCompletion = (text: string, cursor: number) => {
    if (readOnly) return;
    const ctx = detectCompletionContext(text, cursor);
    if (ctx.kind === 'value' || ctx.word.length < 1) {
      closeComp();
      return;
    }
    const source = ctx.kind === 'prop' ? CSS_PROPOSALS : SELECTOR_PROPOSALS;
    const items = source
      .filter((p) => p.name.toLowerCase().startsWith(ctx.word.toLowerCase()))
      .slice(0, 7) as CompletionItem[];
    setComp({ items, index: 0, kind: ctx.kind, start: ctx.start });
  };

  const handleChange = (e: React.ChangeEvent<HTMLTextAreaElement>) => {
    onChange(e.target.value);
    syncCompletion(e.target.value, e.target.selectionStart ?? 0);
  };

  /** 在光标处插入片段，并把光标移到片段末尾（或指定偏移） */
  const insertSnippet = (snippet: string, caretOffset?: number) => {
    const ta = taRef.current;
    if (!ta || readOnly) return;
    const start = ta.selectionStart ?? 0;
    const end = ta.selectionEnd ?? 0;
    const next = value.slice(0, start) + snippet + value.slice(end);
    onChange(next);
    const pos = start + (caretOffset ?? snippet.length);
    requestAnimationFrame(() => {
      ta.focus();
      ta.setSelectionRange(pos, pos);
    });
  };

  const applyCompletion = (item: CompletionItem) => {
    const ta = taRef.current;
    if (!ta) return;
    const cursor = ta.selectionStart ?? 0;
    const start = comp.start;
    const insertText = comp.kind === 'prop' ? `${item.name}: ` : `${item.name} {  }`;
    const next = value.slice(0, start) + insertText + value.slice(cursor);
    onChange(next);
    // 选择器补全后把光标放进花括号中间；属性补全则停在冒号空格之后
    const pos = comp.kind === 'prop' ? start + insertText.length : start + item.name.length + 3;
    closeComp();
    requestAnimationFrame(() => {
      ta.focus();
      ta.setSelectionRange(pos, pos);
    });
  };

  const handleKeyDown = (e: React.KeyboardEvent<HTMLTextAreaElement>) => {
    const hasComp = comp.items.length > 0;

    if (e.key === 'Escape') {
      if (hasComp) {
        // 只吞掉「关闭补全」这一层，不要让事件冒到 window 去关掉整个弹窗
        e.stopPropagation();
        e.preventDefault();
        closeComp();
      }
      return;
    }

    if (!hasComp) {
      if (e.key === 'Tab') {
        // 不拦的话 Tab 会把焦点移出编辑器，写 CSS 时非常打断
        e.preventDefault();
        insertSnippet('  ');
      }
      return;
    }

    if (e.key === 'ArrowDown') {
      e.preventDefault();
      setComp((c) => ({ ...c, index: (c.index + 1) % c.items.length }));
    } else if (e.key === 'ArrowUp') {
      e.preventDefault();
      setComp((c) => ({ ...c, index: (c.index - 1 + c.items.length) % c.items.length }));
    } else if (e.key === 'Enter' || e.key === 'Tab') {
      e.preventDefault();
      applyCompletion(comp.items[comp.index]);
    }
  };

  const errorCount = analysis.issues.filter((i) => i.level === 'error').length;

  return (
    <div className="space-y-1.5">
      {/* ── 编辑区：pre 撑高 + textarea 覆盖，外层统一滚动 ── */}
      <div
        className={`relative overflow-y-auto rounded-lg border bg-slate-50 transition-colors focus-within:ring-2 focus-within:ring-emerald-500/20 ${
          readOnly
            ? 'border-gray-200 cursor-not-allowed'
            : 'border-gray-200 focus-within:border-emerald-500'
        } [&_.ck-cmt]:text-slate-400 [&_.ck-cmt]:italic [&_.ck-sel]:text-violet-600 [&_.ck-sel]:font-medium [&_.ck-prop]:text-sky-700 [&_.ck-num]:text-amber-600 [&_.ck-color]:text-emerald-600 [&_.ck-punc]:text-slate-400 [&_.ck-at]:text-pink-600 [&_.ck-bang]:text-red-500 [&_.ck-bang]:font-semibold`}
        style={{ height }}
      >
        {value ? (
          <pre
            aria-hidden="true"
            className="m-0 px-3 py-2 font-mono text-[11px] leading-relaxed text-slate-700 whitespace-pre-wrap break-words pointer-events-none"
            dangerouslySetInnerHTML={{ __html: highlighted }}
          />
        ) : (
          <div className="px-3 py-2 font-mono text-[11px] leading-relaxed text-slate-400 whitespace-pre-wrap">
            {placeholder}
          </div>
        )}

        <textarea
          ref={taRef}
          value={value}
          readOnly={readOnly}
          spellCheck={false}
          onChange={handleChange}
          onKeyDown={handleKeyDown}
          onClick={(e) => syncCompletion(value, e.currentTarget.selectionStart ?? 0)}
          onKeyUp={(e) => {
            // 方向键/退格移动光标后重新算候选；已被 keydown 处理过的按键不重复触发
            if (['ArrowLeft', 'ArrowRight', 'Home', 'End', 'Backspace', 'Delete'].includes(e.key)) {
              syncCompletion(value, e.currentTarget.selectionStart ?? 0);
            }
          }}
          onBlur={() => setTimeout(closeComp, 120)}
          aria-label="自定义 CSS 编辑区"
          className={`absolute inset-0 w-full h-full px-3 py-2 font-mono text-[11px] leading-relaxed bg-transparent resize-none outline-none whitespace-pre-wrap break-words ${
            readOnly ? 'text-slate-500 cursor-not-allowed' : 'text-transparent caret-emerald-600'
          }`}
        />

        {/* ── 自动补全 ── */}
        {comp.items.length > 0 && (
          <div className="absolute bottom-1.5 right-1.5 z-10 w-64 max-h-44 overflow-y-auto rounded-lg border border-slate-200 bg-white shadow-lg">
            <div className="px-2 py-1 text-[9px] font-medium text-slate-400 bg-slate-50 border-b border-slate-100 sticky top-0">
              {comp.kind === 'prop' ? 'CSS 属性' : '选择器'} · ↑↓ 选择 / Enter 补全 / Esc 取消
            </div>
            {comp.items.map((item, i) => (
              <button
                key={item.name}
                type="button"
                onMouseDown={(e) => {
                  e.preventDefault(); // 保住 textarea 焦点，避免 blur 抢先关闭候选
                  applyCompletion(item);
                }}
                className={`w-full text-left px-2 py-1.5 flex items-baseline gap-2 transition-colors ${
                  i === comp.index ? 'bg-emerald-50' : 'hover:bg-slate-50'
                }`}
              >
                <span className="font-mono text-[10px] font-semibold text-sky-700 shrink-0">{item.name}</span>
                <span className="text-[9px] text-slate-400 truncate">{item.sample ? `${item.sample} · ` : ''}{item.note}</span>
              </button>
            ))}
          </div>
        )}
      </div>

      {/* ── 实时校验 ── */}
      <div className="flex items-start gap-1.5 text-[10px] leading-relaxed">
        {analysis.issues.length === 0 ? (
          analysis.declarations > 0 ? (
            <>
              <CheckCircle2 className="w-3 h-3 text-emerald-600 mt-0.5 shrink-0" />
              <span className="text-slate-500">
                {analysis.rules} 条规则 / {analysis.declarations} 条声明，编译时会内联到元素上
              </span>
            </>
          ) : (
            <span className="text-slate-400">
              没有可生效的规则。可用选择器：标签名（p / h2 / blockquote）或 #gzh-article-root
            </span>
          )
        ) : (
          <div className="flex-1 min-w-0">
            <div className="flex items-center gap-1.5">
              <AlertTriangle
                className={`w-3 h-3 mt-0.5 shrink-0 ${errorCount > 0 ? 'text-red-500' : 'text-amber-500'}`}
              />
              <span className={errorCount > 0 ? 'text-red-600 font-medium' : 'text-amber-700 font-medium'}>
                {analysis.issues.length} 处不会生效
                {analysis.declarations > 0 && `（其余 ${analysis.declarations} 条声明正常）`}
              </span>
            </div>
            <ul className="mt-1 space-y-0.5">
              {analysis.issues.slice(0, 3).map((issue, i) => (
                <li key={i} className="text-slate-500 pl-4 relative">
                  <span className="absolute left-1 top-1.5 w-1 h-1 rounded-full bg-slate-300" />
                  {issue.message}
                </li>
              ))}
              {analysis.issues.length > 3 && (
                <li className="text-slate-400 pl-4">另有 {analysis.issues.length - 3} 处…</li>
              )}
            </ul>
          </div>
        )}
      </div>

      {!readOnly && (
        <>
          {/* ── 常用属性速查 ── */}
          <button
            type="button"
            onClick={() => setShowCheat((v) => !v)}
            className="w-full flex items-center justify-between text-[10px] font-medium text-slate-500 hover:text-slate-700 py-1"
          >
            <span className="flex items-center gap-1.5">
              <BookOpen className="w-3 h-3" />
              常用属性速查（点击插入）
            </span>
            <ChevronDown className={`w-3 h-3 transition-transform ${showCheat ? 'rotate-180' : ''}`} />
          </button>

          {showCheat && (
            <div className="space-y-2 p-2.5 rounded-lg bg-slate-50 border border-slate-200">
              <div>
                <div className="text-[9px] font-semibold text-slate-400 uppercase tracking-wide mb-1.5">
                  选择器
                </div>
                <div className="flex flex-wrap gap-1">
                  {SELECTOR_PROPOSALS.map((s) => (
                    <button
                      key={s.name}
                      type="button"
                      title={s.note}
                      onClick={() => insertSnippet(`${s.name} {  }`, s.name.length + 3)}
                      className="px-1.5 py-0.5 rounded border border-slate-200 bg-white hover:border-emerald-300 hover:bg-emerald-50 font-mono text-[9px] text-violet-700 transition-colors"
                    >
                      {s.name}
                    </button>
                  ))}
                </div>
              </div>

              <div>
                <div className="text-[9px] font-semibold text-slate-400 uppercase tracking-wide mb-1.5">
                  属性
                </div>
                <div className="flex flex-wrap gap-1">
                  {CSS_PROPOSALS.map((p) => (
                    <button
                      key={p.name}
                      type="button"
                      title={`${p.sample} · ${p.note}`}
                      onClick={() => insertSnippet(`${p.name}: ${p.sample};`)}
                      className="px-1.5 py-0.5 rounded border border-slate-200 bg-white hover:border-emerald-300 hover:bg-emerald-50 font-mono text-[9px] text-sky-700 transition-colors"
                    >
                      {p.name}
                    </button>
                  ))}
                </div>
              </div>

              <p className="text-[9px] text-slate-400 leading-relaxed">
                微信会剥离 <code className="text-slate-500">&lt;style&gt;</code> 与 class，所以这里的规则会在
                <strong className="text-slate-500">编译时内联到元素上</strong>；不支持
                <code className="text-slate-500">@media</code> / <code className="text-slate-500">@keyframes</code>。
              </p>
            </div>
          )}
        </>
      )}
    </div>
  );
};
