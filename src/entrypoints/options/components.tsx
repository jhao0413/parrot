import { useEffect, useId, useRef, useState, type ReactNode } from 'react';
import { selectBaseClass } from '@/ui/styles';

export { Segmented, Toggle } from '@/ui/controls';

/** 设置页基础组件：分组卡片 / 设置行 / 开关 / 分段选择 / 文本输入 / 下拉 */

export function Section({ title, description, children }: { title?: string; description?: string; children: ReactNode }) {
  return (
    <section className="space-y-3">
      {(title || description) && (
        <div className="px-1">
          {title && <h2 className="text-[13px] font-medium text-zinc-900 dark:text-zinc-100">{title}</h2>}
          {description && <p className="mt-0.5 text-[13px] text-zinc-500 dark:text-zinc-400">{description}</p>}
        </div>
      )}
      <div className="divide-y divide-zinc-100 rounded-2xl bg-white shadow-[0_0_0_1px_rgb(0_0_0/0.05),0_1px_2px_rgb(0_0_0/0.04),0_4px_12px_-4px_rgb(0_0_0/0.06)] dark:divide-white/5 dark:bg-zinc-900 dark:shadow-[0_0_0_1px_rgb(255_255_255/0.07)]">
        {children}
      </div>
    </section>
  );
}

/** 一行设置：左侧标题 + 说明，右侧控件；窄屏控件换到下方 */
export function Row({
  label,
  description,
  htmlFor,
  children,
}: {
  label: string;
  description?: ReactNode;
  htmlFor?: string;
  children: ReactNode;
}) {
  return (
    <div className="flex flex-wrap items-center justify-between gap-x-6 gap-y-3 px-5 py-4">
      <div className="min-w-0 flex-1 basis-60">
        <label htmlFor={htmlFor} className="block text-sm font-medium text-zinc-900 dark:text-zinc-100">
          {label}
        </label>
        {description && <p className="mt-0.5 text-[13px] leading-5 text-pretty text-zinc-500 dark:text-zinc-400">{description}</p>}
      </div>
      <div className="shrink-0">{children}</div>
    </div>
  );
}

export const selectClass = `w-44 ${selectBaseClass}`;

const inputClass =
  'w-full rounded-lg bg-white px-3 py-2 text-sm text-zinc-900 shadow-[0_0_0_1px_rgb(0_0_0/0.1),0_1px_2px_rgb(0_0_0/0.04)] placeholder:text-zinc-400 focus-visible:shadow-[0_0_0_2px_rgb(22_163_74)] focus-visible:outline-none dark:bg-zinc-800 dark:text-zinc-100 dark:shadow-[0_0_0_1px_rgb(255_255_255/0.1)]';

/**
 * 文本输入：本地状态即时响应，停止输入 400ms 或失焦时才提交
 * （直接受控于异步存储会让光标跳动，且每个按键都写一次 storage）
 */
export function TextField({
  label,
  hint,
  value,
  onCommit,
  placeholder,
  secret,
  multiline,
}: {
  label: string;
  hint?: ReactNode;
  value: string;
  onCommit: (v: string) => void;
  placeholder?: string;
  secret?: boolean;
  multiline?: boolean;
}) {
  const id = useId();
  const [draft, setDraft] = useState(value);
  const [reveal, setReveal] = useState(false);
  const timer = useRef<ReturnType<typeof setTimeout>>(undefined);
  const latest = useRef(value);

  useEffect(() => {
    // 外部（其他页面）改了值且本地没有未提交的输入时同步
    if (timer.current === undefined) setDraft(value);
    latest.current = value;
  }, [value]);

  const commit = (v: string) => {
    clearTimeout(timer.current);
    timer.current = undefined;
    if (v !== latest.current) onCommit(v);
  };
  const change = (v: string) => {
    setDraft(v);
    clearTimeout(timer.current);
    timer.current = setTimeout(() => commit(v), 400);
  };

  return (
    <div className="space-y-1.5">
      <label htmlFor={id} className="block text-[13px] font-medium text-zinc-700 dark:text-zinc-300">
        {label}
      </label>
      {multiline ? (
        <textarea
          id={id}
          rows={3}
          value={draft}
          placeholder={placeholder}
          onChange={(e) => change(e.target.value)}
          onBlur={(e) => commit(e.target.value)}
          className={`${inputClass} resize-y leading-6`}
        />
      ) : (
        <div className="relative">
          <input
            id={id}
            type={secret && !reveal ? 'password' : 'text'}
            value={draft}
            placeholder={placeholder}
            autoComplete="off"
            spellCheck={false}
            onChange={(e) => change(e.target.value)}
            onBlur={(e) => commit(e.target.value)}
            className={`${inputClass} ${secret ? 'pe-16 font-mono' : ''}`}
          />
          {secret && (
            <button
              type="button"
              onClick={() => setReveal((r) => !r)}
              className="absolute inset-y-1 end-1 rounded-md px-2.5 text-xs text-zinc-500 hover:bg-zinc-100 hover:text-zinc-800 dark:hover:bg-zinc-700 dark:hover:text-zinc-200"
            >
              {reveal ? '隐藏' : '显示'}
            </button>
          )}
        </div>
      )}
      {hint && <div className="text-xs leading-5 text-zinc-500 dark:text-zinc-400">{hint}</div>}
    </div>
  );
}

export function Kbd({ children }: { children: ReactNode }) {
  return (
    <kbd className="rounded-md bg-zinc-100 px-1.5 py-0.5 font-sans text-xs font-medium text-zinc-700 shadow-[inset_0_-1px_0_rgb(0_0_0/0.08)] dark:bg-zinc-800 dark:text-zinc-300">
      {children}
    </kbd>
  );
}
