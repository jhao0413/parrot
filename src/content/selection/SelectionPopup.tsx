import { useEffect, useState } from 'react';
import {
  CONTEXT_INVALIDATED_MSG,
  isContextValid,
  sendBg,
  type DictEntry,
  type Response,
  type SingleTranslateResult,
} from '@/messaging/protocol';
import { getSettings } from '@/storage/settings';
import { speak, type TtsLang } from '@/tts/player';
import { VolumeIcon } from '@/ui/SpeakerButton';
import { popupStyles } from './styles';

/** shadow root 内的发音按钮（Tailwind 进不来 shadow，用 pr- 前缀自带样式） */
function ShadowSpeaker({ text, title, lang, accent }: { text: string; title: string; lang?: TtsLang; accent?: 1 | 2 }) {
  const [busy, setBusy] = useState(false);
  return (
    <button
      type="button"
      className="pr-icon"
      title={title}
      disabled={busy || !text.trim()}
      onClick={(e) => {
        e.stopPropagation();
        setBusy(true);
        void speak(text, lang, accent)
          .catch((err) => console.warn('TTS failed', err))
          .finally(() => setBusy(false));
      }}
    >
      <VolumeIcon className={busy ? 'pr-busy' : undefined} />
    </button>
  );
}

/** 词典区：有道词典给出富字段（分美/英音标、考试标签、词性、词形、词组），其他 provider 只有简单释义 */
function DictSection({ dict }: { dict: DictEntry }) {
  const phonetics = dict.phonetics ?? [];
  return (
    <div className="pr-dict">
      <div className="pr-dict-head">
        {dict.word}
        {phonetics.length === 0 && dict.phonetic && <span className="pr-phonetic">{dict.phonetic}</span>}
        {phonetics.length === 0 && <ShadowSpeaker text={dict.word} lang="en" title="朗读单词" />}
      </div>
      {phonetics.map((p) => (
        <div key={p.accent} className="pr-phon-row">
          <span className="pr-label">{p.accent === 'us' ? '美' : '英'}</span>
          <span className="pr-phonetic">/{p.value}/</span>
          <ShadowSpeaker text={dict.word} lang="en" accent={p.accent === 'us' ? 2 : 1} title={p.accent === 'us' ? '美音' : '英音'} />
        </div>
      ))}
      {dict.tags && dict.tags.length > 0 && (
        <div className="pr-tags">
          {dict.tags.map((t) => (
            <span key={t} className="pr-tag">
              {t}
            </span>
          ))}
        </div>
      )}
      {dict.parts && dict.parts.length > 0 ? (
        <div className="pr-parts">
          {dict.parts.map((p, i) => (
            <div key={i} className="pr-part">
              {p.pos && <span className="pr-label">{p.pos}</span>}
              <span>{p.means}</span>
            </div>
          ))}
        </div>
      ) : (
        dict.explanations.length > 0 && (
          <ul className="pr-dict-list">
            {dict.explanations.slice(0, 6).map((e, i) => (
              <li key={i}>{e}</li>
            ))}
          </ul>
        )
      )}
      {dict.definitions && dict.definitions.length > 0 && (
        <div className="pr-defs">
          {dict.definitions.map((d) => (
            <div key={d.pos}>
              <span className="pr-label">{d.pos}</span>
              <ol className="pr-def-list">
                {d.items.map((it, i) => (
                  <li key={i}>
                    {it.text}
                    {it.example && <div className="pr-example">“{it.example}”</div>}
                  </li>
                ))}
              </ol>
            </div>
          ))}
        </div>
      )}
      {dict.forms && dict.forms.length > 0 && (
        <div className="pr-forms">
          {dict.forms.map((f) => (
            <div key={f.name}>
              <span className="pr-label">{f.name}：</span>
              <span className="pr-em">{f.words.join('　')}</span>
            </div>
          ))}
        </div>
      )}
      {dict.phrases && dict.phrases.length > 0 && (
        <div className="pr-phrases">
          {dict.phrases.map((p) => (
            <div key={p.text} className="pr-part">
              <span className="pr-em">{p.text}</span>
              <span>{p.means.join('; ')}</span>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}

/** 划词弹窗内容（挂在 shadow root 内，样式走 popupStyles 注入） */
export function SelectionPopup({
  text,
  onClose,
  onTranslateParagraph,
}: {
  text: string;
  onClose: () => void;
  onTranslateParagraph: (() => void) | null;
}) {
  const [result, setResult] = useState<SingleTranslateResult | null>(null);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    let cancelled = false;
    void (async () => {
      try {
        const settings = await getSettings();
        const res: Response<SingleTranslateResult> = await sendBg({
          type: 'translate/single',
          text,
          from: settings.general.sourceLang,
          to: settings.general.targetLang,
          wantDict: settings.page.showDictOnSelection,
        });
        if (cancelled) return;
        if (res.ok) setResult(res.data);
        else setError(res.error.message);
      } catch (e) {
        if (!cancelled) setError(isContextValid() ? (e instanceof Error ? e.message : String(e)) : CONTEXT_INVALIDATED_MSG);
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [text]);

  return (
    <div className="pr-popup" onClick={(e) => e.stopPropagation()}>
      <div className="pr-header">
        <p className="pr-source">{text}</p>
        <button type="button" className="pr-close" onClick={onClose}>
          ✕
        </button>
      </div>
      {error && <p className="pr-error">{error}</p>}
      {!error && !result && <p className="pr-loading">翻译中…</p>}
      {!error && result && (
        <>
          <div className="pr-result-row">
            <p className="pr-result">
              {result.text || <span className="pr-loading">（无结果）</span>}
            </p>
            <ShadowSpeaker text={result.text} title="朗读译文" />
          </div>
          {result.dict && <DictSection dict={result.dict} />}
          <div className="pr-actions">
            <button
              type="button"
              className="pr-icon"
              title="朗读原文"
              onClick={(e) => {
                e.stopPropagation();
                void speak(text).catch((err) => console.warn('TTS failed', err));
              }}
            >
              <VolumeIcon /> 原文
            </button>
            <button
              type="button"
              className="pr-icon"
              title="复制译文"
              onClick={() => void navigator.clipboard.writeText(result.text)}
            >
              复制译文
            </button>
          </div>
        </>
      )}
      {onTranslateParagraph && (
        <button type="button" className="pr-para-btn" onClick={onTranslateParagraph}>
          译此段
        </button>
      )}
    </div>
  );
}
