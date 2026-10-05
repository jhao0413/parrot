import { Fragment, useEffect, useRef, useState, type ReactNode } from 'react';
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
function ShadowSpeaker({
  text,
  title,
  lang,
  accent,
  small,
  children,
}: {
  text: string;
  title: string;
  lang?: TtsLang;
  accent?: 1 | 2;
  small?: boolean;
  children?: ReactNode;
}) {
  const [busy, setBusy] = useState(false);
  return (
    <button
      type="button"
      className={small ? 'pr-icon pr-sm' : 'pr-icon'}
      title={title}
      aria-label={title}
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
      {children}
    </button>
  );
}

function Svg({ children }: { children: ReactNode }) {
  return (
    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.75" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
      {children}
    </svg>
  );
}

/** 词典区：有道词典给出富字段（分美/英音标、考试标签、词性、词形、词组），其他 provider 只有简单释义 */
function DictSection({ dict }: { dict: DictEntry }) {
  const phonetics = dict.phonetics ?? [];
  return (
    <div className="pr-dict">
      <div>
        <div className="pr-dict-head">
          <span className="pr-word">{dict.word}</span>
          {phonetics.length > 0 ? (
            phonetics.map((p) => (
              <span key={p.accent} className="pr-phon">
                <span className="pr-label">{p.accent === 'us' ? '美' : '英'}</span>/{p.value}/
                <ShadowSpeaker small text={dict.word} lang="en" accent={p.accent === 'us' ? 2 : 1} title={p.accent === 'us' ? '美音' : '英音'} />
              </span>
            ))
          ) : (
            <span className="pr-phon">
              {dict.phonetic}
              <ShadowSpeaker small text={dict.word} lang="en" title="朗读单词" />
            </span>
          )}
        </div>
        {dict.tags && dict.tags.length > 0 && (
          <div className="pr-tags">
            {dict.tags.map((t) => (
              <span key={t} className="pr-tag">
                {t}
              </span>
            ))}
          </div>
        )}
      </div>
      {dict.parts && dict.parts.length > 0 ? (
        <dl className="pr-grid">
          {dict.parts.map((p, i) => (
            <Fragment key={i}>
              <dt>{p.pos}</dt>
              <dd>{p.means}</dd>
            </Fragment>
          ))}
        </dl>
      ) : (
        dict.explanations.length > 0 && (
          <ul className="pr-list">
            {dict.explanations.slice(0, 6).map((e, i) => (
              <li key={i}>{e}</li>
            ))}
          </ul>
        )
      )}
      {dict.definitions && dict.definitions.length > 0 && (
        <div>
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
        <div className="pr-forms pr-sep">
          {dict.forms.map((f) => (
            <span key={f.name}>
              <span className="pr-label">{f.name} </span>
              <span className="pr-em">{f.words.join(' / ')}</span>
            </span>
          ))}
        </div>
      )}
      {dict.phrases && dict.phrases.length > 0 && (
        <div className="pr-sep">
          <div className="pr-caption">词组</div>
          <dl className="pr-grid pr-phrases">
            {dict.phrases.map((p) => (
              <Fragment key={p.text}>
                <dt>{p.text}</dt>
                <dd>{p.means.join('；')}</dd>
              </Fragment>
            ))}
          </dl>
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
  const [copied, setCopied] = useState(false);
  const copiedTimer = useRef<ReturnType<typeof setTimeout>>(undefined);

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

  const copy = async () => {
    if (!result?.text) return;
    try {
      await navigator.clipboard.writeText(result.text);
    } catch (e) {
      // 部分页面的 Permissions-Policy / iframe 会禁止写剪贴板
      console.warn('copy failed', e);
      return;
    }
    setCopied(true);
    clearTimeout(copiedTimer.current);
    copiedTimer.current = setTimeout(() => setCopied(false), 1500);
  };

  return (
    <div className="pr-popup" role="dialog" aria-label="翻译结果" onClick={(e) => e.stopPropagation()}>
      <div className="pr-header">
        <p className="pr-source">{text}</p>
        <button type="button" className="pr-icon pr-close" title="关闭" aria-label="关闭" onClick={onClose}>
          <Svg>
            <path d="M18 6 6 18M6 6l12 12" />
          </Svg>
        </button>
      </div>
      {error && <p className="pr-error">{error}</p>}
      {!error && !result && (
        <div className="pr-loading" aria-label="翻译中">
          <span />
          <span />
        </div>
      )}
      {!error && result && (
        <>
          <p className="pr-result">{result.text || <span className="pr-empty">（无结果）</span>}</p>
          {result.dict && <DictSection dict={result.dict} />}
          <div className="pr-actions">
            <ShadowSpeaker text={result.text} title="朗读译文" />
            <button
              type="button"
              className={copied ? 'pr-icon pr-done' : 'pr-icon'}
              title="复制译文"
              aria-label={copied ? '已复制' : '复制译文'}
              disabled={!result.text}
              onClick={() => void copy()}
            >
              <Svg>
                {copied ? (
                  <path d="m5 12.5 4.5 4.5L19 7.5" />
                ) : (
                  <>
                    <rect x="8.5" y="8.5" width="12" height="12" rx="2" />
                    <path d="M15.5 8.5V5.5a2 2 0 0 0-2-2h-8a2 2 0 0 0-2 2v8a2 2 0 0 0 2 2h3" />
                  </>
                )}
              </Svg>
              {copied && '已复制'}
            </button>
            <ShadowSpeaker text={text} title="朗读原文">
              原文
            </ShadowSpeaker>
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
