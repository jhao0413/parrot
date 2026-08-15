import { useEffect, useRef, useState } from 'react';
import { sendBg, type Response, type SingleTranslateResult } from '@/messaging/protocol';
import { getSettings } from '@/storage/settings';
import { LangSelect } from '@/ui/LangSelect';
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
  const seq = useRef(0);

  useEffect(() => {
    void getSettings().then((s) => {
      setFrom(s.general.sourceLang);
      setTo(s.general.targetLang);
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

  return (
    <div className="mx-auto flex min-h-screen max-w-5xl flex-col gap-4 p-6">
      <header className="flex items-center justify-between">
        <h1 className="text-lg font-semibold text-gray-900">🦜 Parrot 翻译工作台</h1>
        <a
          href={browser.runtime.getURL('/options.html')}
          target="_blank"
          className="text-sm text-gray-500 hover:text-gray-800"
        >
          设置
        </a>
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
          <textarea
            value={input}
            onChange={(e) => setInput(e.target.value)}
            placeholder="输入或粘贴要翻译的文本…"
            className="h-full min-h-[300px] flex-1 resize-none text-base leading-relaxed text-gray-900 focus:outline-none"
          />
          <div className="mt-2 flex items-center justify-between text-xs text-gray-400">
            <span>{input.length} 字符</span>
            <div className="flex gap-2">
              {input && (
                <button type="button" className="hover:text-gray-600" onClick={() => setInput('')}>
                  清空
                </button>
              )}
            </div>
          </div>
        </div>

        <div className="rounded-xl bg-white p-4 shadow-sm">
          {loading && <div className="text-sm text-gray-400">翻译中…</div>}
          {!loading && error && <div className="text-sm text-red-500">{error}</div>}
          {!loading && !error && result && <TranslateResult text={result.text} dict={result.dict} sourceText={input} />}
          {!loading && !error && !result && <div className="text-sm text-gray-400">译文将显示在这里</div>}
        </div>
      </div>
    </div>
  );
}

export default App;
