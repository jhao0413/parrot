import { useEffect, useRef, useState, type ReactNode } from 'react';
import { sendBg, type Response, type SingleTranslateResult } from '@/messaging/protocol';
import { getSettings, updateSettings, watchSettings } from '@/storage/settings';
import { LangSelect } from '@/ui/LangSelect';
import { PROVIDER_LIST, type ProviderId } from '@/ui/providerList';
import { SpeakerButton } from '@/ui/SpeakerButton';
import { selectBaseClass } from '@/ui/styles';
import { TranslateResult } from '@/ui/TranslateResult';

/** 长文本按 3500 字符切块顺序翻译 */
const CHUNK = 3500;

const langSelectClass =
  'min-w-0 max-w-44 cursor-pointer appearance-none truncate rounded-lg bg-transparent bg-[url("data:image/svg+xml,%3Csvg%20xmlns%3D%27http%3A//www.w3.org/2000/svg%27%20viewBox%3D%270%200%2016%2016%27%20fill%3D%27none%27%20stroke%3D%27%2371717a%27%20stroke-width%3D%271.5%27%3E%3Cpath%20d%3D%27M4%206l4%204%204-4%27/%3E%3C/svg%3E")] bg-[length:16px] bg-[right_6px_center] bg-no-repeat py-1.5 ps-2.5 pe-7 text-sm font-medium text-zinc-900 transition-colors duration-150 hover:bg-zinc-100 focus-visible:outline-2 focus-visible:outline-brand-600 dark:text-zinc-100 dark:hover:bg-white/5 [&>option]:bg-white [&>option]:dark:bg-zinc-800';

const iconButtonClass =
  'inline-flex h-7 items-center justify-center gap-1 rounded-full px-1.5 text-xs text-zinc-500 transition-[color,background-color,scale] duration-150 hover:bg-zinc-100 hover:text-zinc-800 focus-visible:outline-2 focus-visible:outline-brand-600 active:scale-[0.96] disabled:pointer-events-none disabled:opacity-40 dark:text-zinc-400 dark:hover:bg-white/5 dark:hover:text-zinc-100';

function Icon({ children, className = 'size-4' }: { children: ReactNode; className?: string }) {
  return (
    <svg
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth={1.5}
      strokeLinecap="round"
      strokeLinejoin="round"
      aria-hidden
      className={className}
    >
      {children}
    </svg>
  );
}

function App() {
  const [input, setInput] = useState('');
  const [from, setFrom] = useState('auto');
  const [to, setTo] = useState('zh');
  const [result, setResult] = useState<SingleTranslateResult | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);
  const [copied, setCopied] = useState(false);
  const [provider, setProvider] = useState<ProviderId>('google');
  const seq = useRef(0);
  const copiedTimer = useRef<ReturnType<typeof setTimeout>>(undefined);
  const inputRef = useRef<HTMLTextAreaElement>(null);

  useEffect(() => {
    void getSettings().then((s) => {
      setFrom(s.general.sourceLang);
      setTo(s.general.targetLang);
      setProvider(s.provider.active);
    });
    watchSettings((s) => setProvider(s.provider.active)); // popup / 设置页切换服务时同步
  }, []);

  // 输入防抖 500ms 自动翻译；切换服务也重新翻译
  useEffect(() => {
    if (!input.trim()) {
      seq.current++; // 作废在途请求，防止过期结果写回
      setResult(null);
      setError(null);
      setLoading(false);
      return;
    }
    const mySeq = ++seq.current;
    const timer = setTimeout(async () => {
      setLoading(true);
      setError(null); // 重试时不再挂着上一次的错误
      try {
        const chunks: string[] = [];
        for (let i = 0; i < input.length; i += CHUNK) chunks.push(input.slice(i, i + CHUNK));
        const parts: string[] = [];
        let dict: SingleTranslateResult['dict'];
        for (const chunk of chunks) {
          const res: Response<SingleTranslateResult> = await sendBg({
            type: 'translate/single',
            text: chunk,
            from,
            to,
            wantDict: chunks.length === 1,
          });
          if (mySeq !== seq.current) return; // 输入已更新，丢弃过期结果
          if (!res.ok) {
            setError(res.error.message);
            setResult(null);
            return;
          }
          parts.push(res.data.text);
          dict ??= res.data.dict;
        }
        setError(null);
        setResult({ text: parts.join('\n'), dict });
      } catch (e) {
        if (mySeq === seq.current) setError(e instanceof Error ? e.message : String(e));
      } finally {
        if (mySeq === seq.current) setLoading(false);
      }
    }, 500);
    return () => clearTimeout(timer);
  }, [input, from, to, provider]);

  const changeProvider = async (id: ProviderId) => {
    setProvider(id);
    await updateSettings({ provider: { active: id } });
  };

  // 互换语言时把译文搬到左侧，接着反向翻译
  const swap = () => {
    if (from === 'auto') return;
    setFrom(to);
    setTo(from);
    if (result?.text) setInput(result.text);
    inputRef.current?.focus();
  };

  const copyResult = async () => {
    if (!result?.text) return;
    await navigator.clipboard.writeText(result.text);
    setCopied(true);
    clearTimeout(copiedTimer.current);
    copiedTimer.current = setTimeout(() => setCopied(false), 1500);
  };

  const clear = () => {
    setInput('');
    inputRef.current?.focus();
  };

  return (
    <div className="flex min-h-screen flex-col bg-zinc-50 text-zinc-900 antialiased dark:bg-zinc-950 dark:text-zinc-100">
      <div className="mx-auto flex w-full max-w-6xl flex-1 flex-col gap-5 px-4 py-5 md:px-8 md:py-8">
        <header className="flex flex-wrap items-center justify-between gap-3 px-1">
          <div className="flex items-center gap-2.5">
            <img src="/logo.png" alt="" className="size-7" />
            <div className="leading-tight">
              <h1 className="text-sm font-semibold tracking-tight">Parrot 翻译</h1>
              <div className="text-xs text-zinc-500 dark:text-zinc-400">工作台</div>
            </div>
          </div>
          <div className="flex items-center gap-2">
            <label htmlFor="provider" className="text-[13px] text-zinc-500 max-sm:sr-only dark:text-zinc-400">
              翻译服务
            </label>
            <select
              id="provider"
              value={provider}
              onChange={(e) => void changeProvider(e.target.value as ProviderId)}
              className={`w-40 ${selectBaseClass}`}
            >
              {PROVIDER_LIST.map((p) => (
                <option key={p.id} value={p.id}>
                  {p.name}
                </option>
              ))}
            </select>
            <a
              href={browser.runtime.getURL('/options.html')}
              target="_blank"
              title="设置"
              aria-label="设置"
              className="inline-flex size-8 items-center justify-center rounded-lg text-zinc-500 transition-colors duration-150 hover:bg-zinc-200/60 hover:text-zinc-900 focus-visible:outline-2 focus-visible:outline-brand-600 dark:text-zinc-400 dark:hover:bg-white/5 dark:hover:text-zinc-100"
            >
              <Icon className="size-[18px]">
                <path d="M9.67 4.14a2.34 2.34 0 0 1 4.66 0 2.34 2.34 0 0 0 3.32 1.92 2.34 2.34 0 0 1 2.33 4.03 2.34 2.34 0 0 0 0 3.83 2.34 2.34 0 0 1-2.33 4.03 2.34 2.34 0 0 0-3.32 1.92 2.34 2.34 0 0 1-4.66 0 2.34 2.34 0 0 0-3.32-1.92 2.34 2.34 0 0 1-2.33-4.03 2.34 2.34 0 0 0 0-3.83 2.34 2.34 0 0 1 2.33-4.03 2.34 2.34 0 0 0 3.32-1.92" />
                <circle cx="12" cy="12" r="3" />
              </Icon>
            </a>
          </div>
        </header>

        <main className="flex flex-1 flex-col overflow-hidden rounded-2xl bg-white shadow-[0_0_0_1px_rgb(0_0_0/0.05),0_1px_2px_rgb(0_0_0/0.04),0_4px_12px_-4px_rgb(0_0_0/0.06)] dark:bg-zinc-900 dark:shadow-[0_0_0_1px_rgb(255_255_255/0.07)]">
          {/* 语言栏：左右两半与下方两栏对齐，互换按钮骑在分隔线上 */}
          <div className="relative grid grid-cols-2 border-b border-zinc-100 dark:border-white/5">
            <div className="flex min-w-0 items-center px-3 py-2 md:px-4">
              <LangSelect value={from} onChange={setFrom} includeAuto className={langSelectClass} />
            </div>
            <div className="flex min-w-0 items-center px-3 py-2 ps-8 md:px-4 md:ps-8">
              <LangSelect value={to} onChange={setTo} className={langSelectClass} />
            </div>
            <button
              type="button"
              title={from === 'auto' ? '源语言为自动检测时无法互换' : '互换语言'}
              aria-label="互换语言"
              disabled={from === 'auto'}
              onClick={swap}
              className="absolute top-1/2 left-1/2 inline-flex size-8 -translate-x-1/2 -translate-y-1/2 items-center justify-center rounded-full bg-white text-zinc-500 shadow-[0_0_0_1px_rgb(0_0_0/0.08),0_1px_2px_rgb(0_0_0/0.06)] transition-[color,background-color,scale] duration-150 hover:bg-zinc-50 hover:text-zinc-900 focus-visible:outline-2 focus-visible:outline-brand-600 active:scale-[0.96] disabled:cursor-not-allowed disabled:opacity-40 disabled:hover:bg-white disabled:hover:text-zinc-500 dark:bg-zinc-800 dark:text-zinc-400 dark:shadow-[0_0_0_1px_rgb(255_255_255/0.1)] dark:hover:bg-zinc-700 dark:hover:text-zinc-100 dark:disabled:hover:bg-zinc-800"
            >
              <Icon>
                <path d="M7 7h12l-3.5-3.5M17 17H5l3.5 3.5" />
              </Icon>
            </button>
          </div>

          <div className="grid flex-1 grid-cols-1 divide-y divide-zinc-100 md:grid-cols-2 md:divide-x md:divide-y-0 dark:divide-white/5">
            {/* 原文 */}
            <section aria-label="原文" className="flex min-h-[260px] flex-col">
              <textarea
                ref={inputRef}
                autoFocus
                value={input}
                onChange={(e) => setInput(e.target.value)}
                placeholder="输入或粘贴要翻译的文本"
                aria-label="原文"
                className="min-h-0 flex-1 resize-none border-0 bg-transparent px-4 pt-4 pb-2 text-[15px] leading-7 text-zinc-900 placeholder:text-zinc-400 focus:outline-none md:px-5 md:pt-5 dark:text-zinc-100 dark:placeholder:text-zinc-500"
              />
              <div className="flex items-center justify-between gap-2 px-3 pb-3 md:px-4">
                <div className="flex items-center gap-0.5">
                  <SpeakerButton text={input} title="朗读原文" />
                  {input && (
                    <button type="button" onClick={clear} title="清空" aria-label="清空" className={iconButtonClass}>
                      <Icon>
                        <path d="M18 6 6 18M6 6l12 12" />
                      </Icon>
                    </button>
                  )}
                </div>
                <span className="text-xs text-zinc-500 tabular-nums dark:text-zinc-400">
                  {input.length.toLocaleString()} 字符
                  {input.length > CHUNK && ` · 分 ${Math.ceil(input.length / CHUNK)} 段翻译`}
                </span>
              </div>
            </section>

            {/* 译文：背景略深，区分可编辑与只读 */}
            <section aria-label="译文" aria-busy={loading} className="flex min-h-[260px] flex-col bg-zinc-50/60 dark:bg-white/[0.02]">
              <div className="min-h-0 flex-1 overflow-auto px-4 pt-4 pb-2 md:px-5 md:pt-5">
                {error ? (
                  <div role="alert" className="flex gap-2 text-sm leading-6 text-red-600 dark:text-red-400">
                    <Icon className="mt-1 size-4 shrink-0">
                      <circle cx="12" cy="12" r="8.5" />
                      <path d="M12 8v4.5M12 16h.01" />
                    </Icon>
                    <div className="min-w-0">
                      <p className="break-words">{error}</p>
                      <a
                        href={browser.runtime.getURL('/options.html#provider')}
                        target="_blank"
                        className="text-[13px] text-zinc-500 underline decoration-zinc-300 underline-offset-2 hover:text-zinc-800 dark:text-zinc-400 dark:decoration-zinc-600 dark:hover:text-zinc-200"
                      >
                        检查翻译服务设置
                      </a>
                    </div>
                  </div>
                ) : result ? (
                  // 重新翻译时保留旧译文并淡化，避免内容闪烁
                  <div className={`transition-opacity duration-150 ${loading ? 'opacity-50' : ''}`}>
                    <TranslateResult text={result.text} dict={result.dict} />
                  </div>
                ) : loading ? (
                  <div className="space-y-3 pt-1.5" aria-hidden>
                    <div className="h-3 w-4/5 animate-pulse rounded-full bg-zinc-200/80 dark:bg-white/10" />
                    <div className="h-3 w-3/5 animate-pulse rounded-full bg-zinc-200/80 dark:bg-white/10" />
                  </div>
                ) : (
                  <p className="text-[15px] leading-7 text-zinc-400 dark:text-zinc-500">译文</p>
                )}
              </div>
              <div className="flex items-center justify-between gap-2 px-3 pb-3 md:px-4">
                <div className="flex items-center gap-0.5">
                  <SpeakerButton text={result?.text ?? ''} title="朗读译文" />
                  <button
                    type="button"
                    onClick={() => void copyResult()}
                    disabled={!result?.text}
                    title="复制译文"
                    aria-label={copied ? '已复制' : '复制译文'}
                    className={iconButtonClass}
                  >
                    {/* 两个图标常驻 DOM，交叉淡入淡出 */}
                    <span className="relative size-4">
                      <Icon
                        className={`absolute inset-0 size-4 transition-[opacity,scale,filter] duration-200 ease-[cubic-bezier(0.2,0,0,1)] ${copied ? 'scale-25 opacity-0 blur-[4px]' : ''}`}
                      >
                        <rect x="8.5" y="8.5" width="12" height="12" rx="2" />
                        <path d="M15.5 8.5V5.5a2 2 0 0 0-2-2h-8a2 2 0 0 0-2 2v8a2 2 0 0 0 2 2h3" />
                      </Icon>
                      <Icon
                        className={`absolute inset-0 size-4 text-brand-700 transition-[opacity,scale,filter] duration-200 ease-[cubic-bezier(0.2,0,0,1)] dark:text-brand-400 ${copied ? '' : 'scale-25 opacity-0 blur-[4px]'}`}
                      >
                        <path d="m5 12.5 4.5 4.5L19 7.5" />
                      </Icon>
                    </span>
                    {copied && <span className="pe-0.5 text-brand-700 dark:text-brand-400">已复制</span>}
                  </button>
                </div>
                <span role="status" className="text-xs text-zinc-500 dark:text-zinc-400">
                  {loading ? '翻译中…' : ''}
                </span>
              </div>
            </section>
          </div>
        </main>
      </div>
    </div>
  );
}

export default App;
