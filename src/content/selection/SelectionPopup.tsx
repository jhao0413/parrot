import { useEffect, useState } from 'react';
import { sendBg, type Response, type SingleTranslateResult } from '@/messaging/protocol';
import { getSettings } from '@/storage/settings';
import { speak } from '@/tts/player';
import { popupStyles } from './styles';

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
          {result.dict && (
            <div className="pr-dict">
              <div className="pr-dict-head">
                {result.dict.word}
                {result.dict.phonetic && <span className="pr-phonetic">{result.dict.phonetic}</span>}
                <button type="button" className="pr-icon" onClick={() => void speak(result.dict!.word, 'en')}>
                  🔊
                </button>
              </div>
              {result.dict.explanations.length > 0 && (
                <ul className="pr-dict-list">
                  {result.dict.explanations.slice(0, 6).map((e, i) => (
                    <li key={i}>{e}</li>
                  ))}
                </ul>
              )}
            </div>
          )}
          <p className="pr-result">
            {result.text || <span className="pr-loading">（无结果）</span>}
          </p>
          <div className="pr-actions">
            <button type="button" className="pr-icon" title="朗读原文" onClick={() => void speak(text)}>
              🔊 原文
            </button>
            <button type="button" className="pr-icon" title="朗读译文" onClick={() => void speak(result.text)}>
              🔊 译文
            </button>
            <button
              type="button"
              className="pr-icon"
              title="复制译文"
              onClick={() => void navigator.clipboard.writeText(result.text)}
            >
              复制
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
