import { useEffect, useId, useRef, useState, type ReactNode } from 'react';

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

export function Toggle({ checked, onChange, label }: { checked: boolean; onChange: (v: boolean) => void; label: string }) {
  return (
    <button
      type="button"
      role="switch"
      aria-checked={checked}
      aria-label={label}
      onClick={() => onChange(!checked)}
      className={`relative inline-flex h-6 w-10 shrink-0 cursor-pointer items-center rounded-full transition-colors duration-150 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-blue-500 ${
        checked ? 'bg-blue-600' : 'bg-zinc-200 dark:bg-zinc-700'
      }`}
    >
      <span
        aria-hidden
        className={`ml-0.5 size-5 rounded-full bg-white shadow-[0_1px_2px_rgb(0_0_0/0.2)] transition-[translate] duration-150 ease-out ${
          checked ? 'translate-x-4' : 'translate-x-0'
        }`}
      />
    </button>
  );
}

/** 分段选择（2~3 个互斥选项） */
export function Segmented<T extends string | number>({
  value,
  options,
  onChange,
  label,
}: {
  value: T;
  options: readonly { value: T; label: string }[];
  onChange: (v: T) => void;
  label: string;
}) {
  return (
    <div role="radiogroup" aria-label={label} className="inline-flex rounded-[10px] bg-zinc-100 p-0.5 dark:bg-zinc-800">
      {options.map((o) => {
        const active = o.value === value;
        return (
          <button
            key={String(o.value)}
            type="button"
            role="radio"
            aria-checked={active}
            onClick={() => onChange(o.value)}
            className={`min-w-16 rounded-lg px-3 py-1.5 text-[13px] font-medium transition-[color,background-color,box-shadow] duration-150 focus-visible:outline-2 focus-visible:outline-blue-500 ${
              active
                ? 'bg-white text-zinc-900 shadow-[0_0_0_1px_rgb(0_0_0/0.04),0_1px_2px_rgb(0_0_0/0.08)] dark:bg-zinc-600 dark:text-white'
                : 'text-zinc-500 hover:text-zinc-800 dark:text-zinc-400 dark:hover:text-zinc-200'
            }`}
          >
            {o.label}
          </button>
        );
      })}
    </div>
  );
}

export const selectClass =
  'w-44 cursor-pointer appearance-none rounded-lg bg-white bg-[url("data:image/svg+xml,%3Csvg%20xmlns%3D%27http%3A//www.w3.org/2000/svg%27%20viewBox%3D%270%200%2016%2016%27%20fill%3D%27none%27%20stroke%3D%27%2371717a%27%20stroke-width%3D%271.5%27%3E%3Cpath%20d%3D%27M4%206l4%204%204-4%27/%3E%3C/svg%3E")] bg-[length:16px] bg-[right_8px_center] bg-no-repeat py-1.5 ps-3 pe-8 text-sm text-zinc-900 shadow-[0_0_0_1px_rgb(0_0_0/0.1),0_1px_2px_rgb(0_0_0/0.04)] focus-visible:outline-2 focus-visible:outline-blue-500 dark:bg-zinc-800 dark:text-zinc-100 dark:shadow-[0_0_0_1px_rgb(255_255_255/0.1)]';

const inputClass =
  'w-full rounded-lg bg-white px-3 py-2 text-sm text-zinc-900 shadow-[0_0_0_1px_rgb(0_0_0/0.1),0_1px_2px_rgb(0_0_0/0.04)] placeholder:text-zinc-400 focus-visible:shadow-[0_0_0_2px_rgb(59_130_246)] focus-visible:outline-none dark:bg-zinc-800 dark:text-zinc-100 dark:shadow-[0_0_0_1px_rgb(255_255_255/0.1)]';

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
