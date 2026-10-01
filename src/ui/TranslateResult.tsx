import type { DictEntry } from '@/messaging/protocol';
import { SpeakerButton } from './SpeakerButton';

/** 词典区：有道词典给出富字段（分美/英音标、考试标签、词性、词形、词组），其他 provider 只有简单释义 */
function DictSection({ dict }: { dict: DictEntry }) {
  const phonetics = dict.phonetics ?? [];
  return (
    <div className="space-y-1.5 rounded-md bg-gray-50 px-2.5 py-2 text-xs">
      <div className="flex items-center gap-1.5 font-medium text-gray-700">
        {dict.word}
        {phonetics.length === 0 && dict.phonetic && <span className="font-normal text-gray-400">{dict.phonetic}</span>}
        {phonetics.length === 0 && <SpeakerButton text={dict.word} lang="en" size="sm" title="朗读单词" />}
      </div>
      {phonetics.map((p) => (
        <div key={p.accent} className="flex items-center gap-1.5 text-gray-500">
          <span className="text-gray-400">{p.accent === 'us' ? '美' : '英'}</span>
          <span>/{p.value}/</span>
          <SpeakerButton
            text={dict.word}
            lang="en"
            accent={p.accent === 'us' ? 2 : 1}
            size="sm"
            title={p.accent === 'us' ? '美音' : '英音'}
          />
        </div>
      ))}
      {dict.tags && dict.tags.length > 0 && (
        <div className="flex flex-wrap gap-1">
          {dict.tags.map((t) => (
            <span key={t} className="rounded border border-gray-300 px-1 text-[11px] leading-4 text-gray-500">
              {t}
            </span>
          ))}
        </div>
      )}
      {dict.parts && dict.parts.length > 0 ? (
        <div className="space-y-0.5 text-gray-700">
          {dict.parts.map((p, i) => (
            <div key={i} className="flex gap-1.5">
              {p.pos && <span className="shrink-0 text-gray-400">{p.pos}</span>}
              <span>{p.means}</span>
            </div>
          ))}
        </div>
      ) : (
        dict.explanations.length > 0 && (
          <ul className="space-y-0.5 text-gray-500">
            {dict.explanations.slice(0, 6).map((e, i) => (
              <li key={i}>{e}</li>
            ))}
          </ul>
        )
      )}
      {dict.definitions && dict.definitions.length > 0 && (
        <div className="space-y-1 text-gray-700">
          {dict.definitions.map((d) => (
            <div key={d.pos}>
              <span className="text-gray-400">{d.pos}</span>
              <ol className="list-decimal space-y-0.5 pl-4">
                {d.items.map((it, i) => (
                  <li key={i}>
                    {it.text}
                    {it.example && <div className="text-gray-400">“{it.example}”</div>}
                  </li>
                ))}
              </ol>
            </div>
          ))}
        </div>
      )}
      {dict.forms && dict.forms.length > 0 && (
        <div className="space-y-0.5">
          {dict.forms.map((f) => (
            <div key={f.name}>
              <span className="text-gray-400">{f.name}：</span>
              <span className="text-blue-600">{f.words.join('　')}</span>
            </div>
          ))}
        </div>
      )}
      {dict.phrases && dict.phrases.length > 0 && (
        <div className="space-y-0.5 text-gray-700">
          {dict.phrases.map((p) => (
            <div key={p.text} className="flex gap-1.5">
              <span className="shrink-0 text-blue-600">{p.text}</span>
              <span>{p.means.join('; ')}</span>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}

/** 译文 + 可选词典区。发音按钮由调用方按位置自行摆放（原文/译文各归其位） */
export function TranslateResult({ text, dict }: { text: string; dict?: DictEntry }) {
  return (
    <div className="space-y-3">
      <div className="whitespace-pre-wrap text-[15px] leading-relaxed text-gray-900">
        {text || <span className="text-gray-400">（无结果）</span>}
      </div>
      {dict && <DictSection dict={dict} />}
    </div>
  );
}
