import { useEffect, useState, type ReactNode } from 'react';
import { sendTab } from '@/messaging/protocol';
import { getSettings, updateSettings } from '@/storage/settings';
import { Segmented, Toggle } from '@/ui/controls';
import { LangSelect } from '@/ui/LangSelect';
import { PROVIDER_LIST, type ProviderId } from '@/ui/providerList';
import { selectBaseClass } from '@/ui/styles';

const selectClass = `w-36 ${selectBaseClass}`;

function Icon({ children }: { children: ReactNode }) {
  return (
    <svg
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth={1.5}
      strokeLinecap="round"
      strokeLinejoin="round"
      aria-hidden
      className="size-[18px]"
    >
      {children}
    </svg>
  );
}

function Row({ label, htmlFor, children }: { label: string; htmlFor?: string; children: ReactNode }) {
  return (
    <div className="flex min-h-12 items-center justify-between gap-3 px-3.5 py-2">
      <label htmlFor={htmlFor} className="text-[13px] text-zinc-700 dark:text-zinc-300">
        {label}
      </label>
      {children}
    </div>
  );
}

const headerButton =
  'inline-flex size-8 items-center justify-center rounded-lg text-zinc-500 transition-colors duration-150 hover:bg-zinc-200/60 hover:text-zinc-900 focus-visible:outline-2 focus-visible:outline-brand-600 dark:text-zinc-400 dark:hover:bg-white/5 dark:hover:text-zinc-100';

function App() {
  /** undefined = 查询中；null = 当前页不可注入（浏览器内置页、商店页等） */
  const [pageOn, setPageOn] = useState<boolean | null | undefined>(undefined);
  const [targetLang, setTargetLang] = useState('zh');
  const [activeProvider, setActiveProvider] = useState<ProviderId>('microsoft');
  const [mode, setMode] = useState<'bilingual' | 'translationOnly'>('bilingual');
  const [subtitleOn, setSubtitleOn] = useState(true);

  useEffect(() => {
    void getSettings().then((s) => {
      setTargetLang(s.general.targetLang);
      setActiveProvider(s.provider.active);
      setMode(s.page.mode);
      setSubtitleOn(s.subtitle.enabled);
    });
    void (async () => {
      const [tab] = await browser.tabs.query({ active: true, currentWindow: true });
      if (!tab?.id) return setPageOn(null);
      const res = await sendTab<{ on: boolean }>(tab.id, { type: 'pageTranslation/state', on: false });
      setPageOn(res?.ok ? res.data.on : null);
    })();
  }, []);

  const togglePage = async () => {
    const [tab] = await browser.tabs.query({ active: true, currentWindow: true });
    if (!tab?.id) return;
    const on = !pageOn;
    await sendTab(tab.id, { type: 'pageTranslation/toggle', on });
    setPageOn(on);
  };

  const changeLang = async (lang: string) => {
    setTargetLang(lang);
    await updateSettings({ general: { targetLang: lang } });
  };

  const changeProvider = async (id: ProviderId) => {
    setActiveProvider(id);
    await updateSettings({ provider: { active: id } });
  };

  const changeMode = async (m: 'bilingual' | 'translationOnly') => {
    setMode(m);
    await updateSettings({ page: { mode: m } });
  };

  const changeSubtitle = async (on: boolean) => {
    setSubtitleOn(on);
    await updateSettings({ subtitle: { enabled: on } });
  };

  const openPage = (path: '/options.html' | '/workbench.html') => {
    void browser.tabs.create({ url: browser.runtime.getURL(path) });
    window.close();
  };

  return (
    <div className="flex flex-col gap-3 bg-zinc-50 p-3 text-zinc-900 antialiased dark:bg-zinc-950 dark:text-zinc-100">
      <header className="flex items-center justify-between ps-1">
        <div className="flex items-center gap-2">
          <img src="/logo.png" alt="" className="size-6" />
          <h1 className="text-sm font-semibold tracking-tight">Parrot 翻译</h1>
        </div>
        <div className="flex items-center">
          <button type="button" title="翻译工作台" aria-label="翻译工作台" className={headerButton} onClick={() => openPage('/workbench.html')}>
            <Icon>
              <rect x="3.5" y="4.5" width="17" height="15" rx="2.5" />
              <path d="M12 4.5v15M6.5 9h3M14.5 9h3M14.5 12h3" />
            </Icon>
          </button>
          <button type="button" title="设置" aria-label="设置" className={headerButton} onClick={() => openPage('/options.html')}>
            <Icon>
              <path d="M9.67 4.14a2.34 2.34 0 0 1 4.66 0 2.34 2.34 0 0 0 3.32 1.92 2.34 2.34 0 0 1 2.33 4.03 2.34 2.34 0 0 0 0 3.83 2.34 2.34 0 0 1-2.33 4.03 2.34 2.34 0 0 0-3.32 1.92 2.34 2.34 0 0 1-4.66 0 2.34 2.34 0 0 0-3.32-1.92 2.34 2.34 0 0 1-2.33-4.03 2.34 2.34 0 0 0 0-3.83 2.34 2.34 0 0 1 2.33-4.03 2.34 2.34 0 0 0 3.32-1.92" />
              <circle cx="12" cy="12" r="3" />
            </Icon>
          </button>
        </div>
      </header>

      {/* 主操作：翻译 / 还原当前页 */}
      <section className="space-y-2">
        <button
          type="button"
          disabled={pageOn == null}
          onClick={() => void togglePage()}
          className={`flex h-10 w-full items-center justify-center gap-2 rounded-xl text-sm font-medium transition-[background-color,scale] duration-150 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-brand-600 active:scale-[0.96] disabled:pointer-events-none ${
            pageOn
              ? 'bg-white text-zinc-900 shadow-[0_0_0_1px_rgb(0_0_0/0.1),0_1px_2px_rgb(0_0_0/0.05)] hover:bg-zinc-50 dark:bg-zinc-800 dark:text-zinc-100 dark:shadow-[0_0_0_1px_rgb(255_255_255/0.1)] dark:hover:bg-zinc-700'
              : pageOn == null
                ? 'bg-zinc-200/70 text-zinc-500 dark:bg-zinc-800 dark:text-zinc-500'
                : 'bg-brand-700 text-white shadow-[0_1px_2px_rgb(0_0_0/0.1)] hover:bg-brand-800 dark:hover:bg-brand-600'
          }`}
        >
          {pageOn === undefined ? '…' : pageOn === null ? '此页面无法翻译' : pageOn ? '还原原文' : '翻译此页面'}
        </button>
        <p className="text-center text-[11px] text-zinc-500 dark:text-zinc-400">
          {pageOn === null ? (
            '浏览器内置页和扩展商店页面不支持翻译'
          ) : (
            <>
              快捷键{' '}
              <kbd className="rounded bg-zinc-200/70 px-1 font-sans text-[10px] font-medium text-zinc-600 dark:bg-zinc-800 dark:text-zinc-300">
                Alt
              </kbd>{' '}
              +{' '}
              <kbd className="rounded bg-zinc-200/70 px-1 font-sans text-[10px] font-medium text-zinc-600 dark:bg-zinc-800 dark:text-zinc-300">
                Shift
              </kbd>{' '}
              +{' '}
              <kbd className="rounded bg-zinc-200/70 px-1 font-sans text-[10px] font-medium text-zinc-600 dark:bg-zinc-800 dark:text-zinc-300">
                T
              </kbd>
            </>
          )}
        </p>
      </section>

      <section className="divide-y divide-zinc-100 rounded-xl bg-white shadow-[0_0_0_1px_rgb(0_0_0/0.05),0_1px_2px_rgb(0_0_0/0.04)] dark:divide-white/5 dark:bg-zinc-900 dark:shadow-[0_0_0_1px_rgb(255_255_255/0.07)]">
        <Row label="目标语言" htmlFor="target-lang">
          <LangSelect id="target-lang" value={targetLang} onChange={(v) => void changeLang(v)} className={selectClass} />
        </Row>
        <Row label="翻译服务" htmlFor="provider">
          <select
            id="provider"
            value={activeProvider}
            onChange={(e) => void changeProvider(e.target.value as ProviderId)}
            className={selectClass}
          >
            {PROVIDER_LIST.map((p) => (
              <option key={p.id} value={p.id}>
                {p.name}
              </option>
            ))}
          </select>
        </Row>
        <Row label="展示方式">
          <Segmented
            label="全文翻译展示方式"
            value={mode}
            options={[
              { value: 'bilingual', label: '双语' },
              { value: 'translationOnly', label: '仅译文' },
            ]}
            onChange={(v) => void changeMode(v)}
          />
        </Row>
        <Row label="YouTube 字幕翻译">
          <Toggle label="YouTube 字幕翻译" checked={subtitleOn} onChange={(v) => void changeSubtitle(v)} />
        </Row>
      </section>
    </div>
  );
}

export default App;
