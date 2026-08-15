import { useEffect, useRef, useState } from 'react';
import { sendBg, type Response, type SingleTranslateResult } from '@/messaging/protocol';
import { getSettings, updateSettings } from '@/storage/settings';
import { LangSelect } from '@/ui/LangSelect';
import { PROVIDER_LIST, type ProviderId } from '@/ui/providerList';
import { SpeakerButton } from '@/ui/SpeakerButton';
import { TranslateResult } from '@/ui/TranslateResult';

/** 长文本按 3500 字符切块顺序翻译 */
const CHUNK = 3500;

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

  useEffect(() => {
    void getSettings().then((s) => {
      setFrom(s.general.sourceLang);
      setTo(s.general.targetLang);
      setProvider(s.provider.active);
    });
  }, []);

  // 输入防抖 500ms 自动翻译
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
        setError(e instanceof Error ? e.message : String(e));
      } finally {
        if (mySeq === seq.current) setLoading(false);
      }
    }, 500);
    return () => clearTimeout(timer);
  }, [input, from, to]);

  const changeProvider = async (id: ProviderId) => {
    setProvider(id);
    await updateSettings({ provider: { active: id } });
  };

  const copyResult = async () => {
    if (!result?.text) return;
    await navigator.clipboard.writeText(result.text);
    setCopied(true);
    setTimeout(() => setCopied(false), 1500);
  };

  return (
    <div className="mx-auto flex min-h-screen max-w-5xl flex-col gap-4 p-6">
      <header className="flex flex-wrap items-center justify-between gap-3">
        <h1 className="text-lg font-semibold text-gray-900">🦜 Parrot 翻译工作台</h1>
        <div className="flex items-center gap-3 text-sm">
          <label className="flex items-center gap-1.5 text-gray-500">
            翻译服务
            <select
              value={provider}
              onChange={(e) => void changeProvider(e.target.value as ProviderId)}
              className="rounded-md border border-gray-200 bg-white px-2 py-1.5 text-sm text-gray-700 focus:border-blue-400 focus:outline-none"
            >
              {PROVIDER_LIST.map((p) => (
                <option key={p.id} value={p.id}>
                  {p.name}
                </option>
              ))}
            </select>
          </label>
          <a
            href={browser.runtime.getURL('/options.html')}
            target="_blank"
            className="text-gray-500 hover:text-gray-800"
          >
            设置
          </a>
        </div>
      </header>

      <div className="flex items-center gap-2 text-sm">
        <LangSelect value={from} onChange={setFrom} includeAuto />
        <button
          type="button"
          title="互换语言"
          className="rounded-md border border-gray-200 bg-white px-2 py-1.5 hover:bg-gray-50"
          onClick={() => {
            if (from === 'auto') return;
            setFrom(to);
            setTo(from);
          }}
        >
          ⇄
        </button>
        <LangSelect value={to} onChange={setTo} />
      </div>

      <div className="grid flex-1 grid-cols-1 gap-4 md:grid-cols-2">
        <div className="flex flex-col rounded-xl bg-white p-4 shadow-sm">
          <div className="mb-2 flex items-center justify-between border-b border-gray-100 pb-2">
            <span className="text-xs font-medium tracking-wide text-gray-400">原文</span>
            <SpeakerButton text={input} title="朗读原文" />
          </div>
          <textarea
            value={input}
            onChange={(e) => setInput(e.target.value)}
            placeholder="输入或粘贴要翻译的文本…"
            className="h-full min-h-[300px] flex-1 resize-none border-0 bg-transparent text-[15px] leading-relaxed text-gray-900 placeholder:text-gray-300 focus:outline-none"
          />
          <div className="mt-2 flex items-center justify-between text-xs text-gray-400">
            <span>{input.length} 字符</span>
            {input && (
              <button type="button" className="hover:text-gray-600" onClick={() => setInput('')}>
                清空
              </button>
            )}
          </div>
        </div>

        <div className="flex flex-col rounded-xl bg-white p-4 shadow-sm">
          <div className="mb-2 flex items-center justify-between border-b border-gray-100 pb-2">
            <span className="text-xs font-medium tracking-wide text-gray-400">译文</span>
            <div className="flex items-center gap-1">
              {result?.text && (
                <button
                  type="button"
                  onClick={() => void copyResult()}
                  className="rounded-full px-2 py-0.5 text-xs text-gray-400 hover:bg-gray-100 hover:text-gray-700"
                >
                  {copied ? '已复制 ✓' : '复制'}
                </button>
              )}
              <SpeakerButton text={result?.text ?? ''} title="朗读译文" />
            </div>
          </div>
          <div className="min-h-[300px] flex-1 overflow-auto">
            {loading && <div className="text-sm text-gray-400">翻译中…</div>}
            {!loading && error && <div className="text-sm text-red-500">{error}</div>}
            {!loading && !error && result && <TranslateResult text={result.text} dict={result.dict} />}
            {!loading && !error && !result && <div className="text-sm text-gray-300">译文将显示在这里</div>}
          </div>
        </div>
      </div>
    </div>
  );
}

export default App;
