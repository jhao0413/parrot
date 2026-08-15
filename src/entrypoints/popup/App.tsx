import { useEffect, useState } from 'react';
import { sendBg, sendTab } from '@/messaging/protocol';
import { getSettings, updateSettings } from '@/storage/settings';
import { LangSelect } from '@/ui/LangSelect';

const PROVIDERS = [
  { id: 'google', name: 'Google（免费）' },
  { id: 'microsoft', name: '微软（免费）' },
  { id: 'openai', name: 'OpenAI 兼容' },
  { id: 'gemini', name: 'Gemini' },
  { id: 'youdao', name: '有道' },
  { id: 'baidu', name: '百度' },
] as const;

function App() {
  const [pageOn, setPageOn] = useState<boolean | null>(null); // null = 当前页不可注入
  const [targetLang, setTargetLang] = useState('zh');
  const [activeProvider, setActiveProvider] = useState('microsoft');
  const [mode, setMode] = useState<'bilingual' | 'translationOnly'>('bilingual');

  useEffect(() => {
    void getSettings().then((s) => {
      setTargetLang(s.general.targetLang);
      setActiveProvider(s.provider.active);
      setMode(s.page.mode);
    });
    void (async () => {
      const [tab] = await browser.tabs.query({ active: true, currentWindow: true });
      if (!tab?.id) return;
      const res = await sendTab<{ on: boolean }>(tab.id, { type: 'pageTranslation/state', on: false });
      setPageOn(res?.ok ? res.data.on : null);
    })();
  }, []);

  const togglePage = async () => {
    const [tab] = await browser.tabs.query({ active: true, currentWindow: true });
    if (!tab?.id) return;
    const on = !(pageOn ?? false);
    await sendTab(tab.id, { type: 'pageTranslation/toggle', on });
    setPageOn(on);
  };

  const changeLang = async (lang: string) => {
    setTargetLang(lang);
    await updateSettings({ general: { targetLang: lang } });
  };

  const changeProvider = async (id: string) => {
    setActiveProvider(id);
    await updateSettings({ provider: { active: id as 'google' } });
  };

  const changeMode = async (m: 'bilingual' | 'translationOnly') => {
    setMode(m);
    await updateSettings({ page: { mode: m } });
  };

  return (
    <div className="flex flex-col gap-3 bg-white p-4 text-gray-900">
      <div className="flex items-center justify-between">
        <h1 className="text-base font-semibold">🦜 Parrot 翻译</h1>
        <div className="flex gap-1 text-xs">
          <a
            href={browser.runtime.getURL('/options.html')}
            target="_blank"
            className="rounded px-1.5 py-1 text-gray-500 hover:bg-gray-100"
          >
            设置
          </a>
        </div>
      </div>

      <button
        type="button"
        disabled={pageOn === null}
        onClick={() => void togglePage()}
        className={`rounded-lg px-3 py-2 text-sm font-medium text-white transition-colors disabled:cursor-not-allowed disabled:bg-gray-300 ${
          pageOn ? 'bg-emerald-600 hover:bg-emerald-700' : 'bg-blue-600 hover:bg-blue-700'
        }`}
      >
        {pageOn === null ? '此页面不可用' : pageOn ? '还原原文' : '翻译此页面'}
      </button>

      <div className="flex items-center justify-between text-sm">
        <span className="text-gray-500">目标语言</span>
        <LangSelect value={targetLang} onChange={(v) => void changeLang(v)} />
      </div>

      <div className="flex items-center justify-between text-sm">
        <span className="text-gray-500">展示方式</span>
        <div className="flex overflow-hidden rounded-md border border-gray-200 text-xs">
          <button
            type="button"
            onClick={() => void changeMode('bilingual')}
            className={`px-2 py-1 ${mode === 'bilingual' ? 'bg-blue-600 text-white' : 'bg-white text-gray-600'}`}
          >
            双语对照
          </button>
          <button
            type="button"
            onClick={() => void changeMode('translationOnly')}
            className={`px-2 py-1 ${mode === 'translationOnly' ? 'bg-blue-600 text-white' : 'bg-white text-gray-600'}`}
          >
            仅译文
          </button>
        </div>
      </div>

      <div className="flex items-center justify-between text-sm">
        <span className="text-gray-500">翻译服务</span>
        <select
          value={activeProvider}
          onChange={(e) => void changeProvider(e.target.value)}
          className="rounded-md border border-gray-200 bg-white px-2 py-1.5 text-sm focus:border-blue-400 focus:outline-none"
        >
          {PROVIDERS.map((p) => (
            <option key={p.id} value={p.id}>
              {p.name}
            </option>
          ))}
        </select>
      </div>

      <button
        type="button"
        onClick={() => void browser.tabs.create({ url: browser.runtime.getURL('/workbench.html') })}
        className="rounded-lg border border-gray-200 px-3 py-2 text-sm text-gray-700 hover:bg-gray-50"
      >
        打开翻译工作台
      </button>

      <p className="text-[11px] leading-4 text-gray-400">
        快捷键 Alt+Shift+T 翻译/还原当前页 · 划词翻译开箱即用
      </p>
    </div>
  );
}

export default App;
