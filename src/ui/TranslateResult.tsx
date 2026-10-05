import type { DictEntry } from '@/messaging/protocol';
import { SpeakerButton } from './SpeakerButton';

const muted = 'text-zinc-500 dark:text-zinc-400';
const link = 'text-brand-700 dark:text-brand-400';
const divider = 'border-t border-zinc-200/70 pt-3 dark:border-white/5';

/** 词典区：有道词典给出富字段（分美/英音标、考试标签、词性、词形、词组），其他 provider 只有简单释义 */
function DictSection({ dict }: { dict: DictEntry }) {
  const phonetics = dict.phonetics ?? [];
  const lang = dict.lang ?? 'en';
  return (
    // 行首全角括号去掉左侧空白，换行后才能与上一行对齐
    <div className="space-y-3 rounded-xl bg-zinc-100/70 px-4 py-3.5 text-[13px] leading-6 text-zinc-700 [text-spacing-trim:trim-start] dark:bg-white/5 dark:text-zinc-300">
      {/* 词头：单词 + 音标同一行 */}
      <div className="space-y-1.5">
        <div className="flex flex-wrap items-center gap-x-4 gap-y-1">
          <span className="text-base font-semibold text-zinc-900 dark:text-zinc-100">{dict.word}</span>
          {phonetics.length > 0 ? (
            phonetics.map((p) => (
              <span key={p.accent} className="inline-flex items-center gap-1 text-zinc-500 dark:text-zinc-400">
                <span className={muted}>{p.accent === 'us' ? '美' : '英'}</span>
                <span>/{p.value}/</span>
                <SpeakerButton
                  text={dict.word}
                  lang="en"
                  accent={p.accent === 'us' ? 2 : 1}
                  size="sm"
                  title={p.accent === 'us' ? '美音' : '英音'}
                />
              </span>
            ))
          ) : (
            <span className="inline-flex items-center gap-1 text-zinc-500 dark:text-zinc-400">
              {dict.phonetic && <span>{dict.phonetic}</span>}
              <SpeakerButton text={dict.word} lang={lang} size="sm" title={lang === 'zh' ? '朗读词语' : '朗读单词'} />
            </span>
          )}
        </div>
        {dict.tags && dict.tags.length > 0 && (
          <div className="flex flex-wrap gap-1">
            {dict.tags.map((t) => (
              <span
                key={t}
                className="rounded-md px-1.5 text-[11px] leading-5 text-zinc-500 shadow-[inset_0_0_0_1px_rgb(0_0_0/0.1)] dark:text-zinc-400 dark:shadow-[inset_0_0_0_1px_rgb(255_255_255/0.12)]"
              >
                {t}
              </span>
            ))}
          </div>
        )}
      </div>

      {/* 释义：中文词列英文对应词（可点读），英文词按词性列；左缘对齐 */}
      {dict.equivalents && dict.equivalents.length > 0 ? (
        <dl className="grid grid-cols-[auto_1fr] items-baseline gap-x-3 gap-y-1.5">
          {dict.equivalents.map((e, i) => (
            <div key={i} className="contents">
              <dt className="inline-flex items-center gap-0.5">
                <span className={`font-medium ${link}`}>{e.word}</span>
                <SpeakerButton text={e.word} lang="en" size="sm" title={`朗读 ${e.word}`} />
              </dt>
              <dd className="min-w-0">{e.means}</dd>
            </div>
          ))}
        </dl>
      ) : dict.parts && dict.parts.length > 0 ? (
        <dl className="grid grid-cols-[auto_1fr] gap-x-3 gap-y-1">
          {dict.parts.map((p, i) => (
            <div key={i} className="contents">
              <dt className={`${muted} text-end`}>{p.pos}</dt>
              <dd className="min-w-0">{p.means}</dd>
            </div>
          ))}
        </dl>
      ) : (
        dict.explanations.length > 0 && (
          <ul className="space-y-1">
            {dict.explanations.slice(0, 6).map((e, i) => (
              <li key={i}>{e}</li>
            ))}
          </ul>
        )
      )}

      {dict.definitions && dict.definitions.length > 0 && (
        <div className="space-y-2">
          {dict.definitions.map((d) => (
            <div key={d.pos}>
              <span className={muted}>{d.pos}</span>
              <ol className="list-decimal space-y-1 ps-4 marker:text-zinc-400 dark:marker:text-zinc-500">
                {d.items.map((it, i) => (
                  <li key={i}>
                    {it.text}
                    {it.example && <div className={muted}>“{it.example}”</div>}
                  </li>
                ))}
              </ol>
            </div>
          ))}
        </div>
      )}

      {/* 词形：并排换行，不再一项一行 */}
      {dict.forms && dict.forms.length > 0 && (
        <div className={`flex flex-wrap gap-x-4 gap-y-0.5 ${divider}`}>
          {dict.forms.map((f) => (
            <span key={f.name}>
              <span className={muted}>{f.name} </span>
              <span className={link}>{f.words.join(' / ')}</span>
            </span>
          ))}
        </div>
      )}

      {dict.phrases && dict.phrases.length > 0 && (
        <div className={divider}>
          <div className={`mb-1 text-xs ${muted}`}>词组</div>
          <dl className="grid grid-cols-[auto_1fr] gap-x-3 gap-y-1">
            {dict.phrases.map((p) => (
              <div key={p.text} className="contents">
                <dt className={link}>{p.text}</dt>
                <dd className="min-w-0">{p.means.join('；')}</dd>
              </div>
            ))}
          </dl>
        </div>
      )}
    </div>
  );
}

/** 译文 + 可选词典区。发音按钮由调用方按位置自行摆放（原文/译文各归其位） */
export function TranslateResult({ text, dict }: { text: string; dict?: DictEntry }) {
  return (
    <div className="space-y-3">
      <div className="whitespace-pre-wrap break-words text-[15px] leading-7 text-zinc-900 dark:text-zinc-100">
        {text || <span className="text-zinc-400 dark:text-zinc-500">（无结果）</span>}
      </div>
      {dict && <DictSection dict={dict} />}
    </div>
  );
}
