import type { DictEntry } from '@/messaging/protocol';
import { SpeakerButton } from './SpeakerButton';

/** 译文 + 可选词典区（划词弹窗 / 工作台共用） */
export function TranslateResult({
  text,
  dict,
  sourceText,
  compact,
}: {
  text: string;
  dict?: DictEntry;
  sourceText?: string;
  compact?: boolean;
}) {
  return (
    <div className={compact ? 'space-y-1' : 'space-y-3'}>
      {dict && (
        <div className="rounded-md bg-gray-50 px-2 py-1.5 text-xs">
          <div className="flex items-center gap-1 font-medium text-gray-700">
            {dict.word}
            {dict.phonetic && <span className="font-normal text-gray-400">{dict.phonetic}</span>}
            <SpeakerButton text={dict.word} lang="en" />
          </div>
          {dict.explanations.length > 0 && (
            <ul className="mt-0.5 space-y-0.5 text-gray-500">
              {dict.explanations.slice(0, 6).map((e, i) => (
                <li key={i}>{e}</li>
              ))}
            </ul>
          )}
        </div>
      )}
      <div className={compact ? 'text-sm leading-relaxed text-gray-800' : 'whitespace-pre-wrap text-base leading-relaxed text-gray-900'}>
        {text || <span className="text-gray-400">（无结果）</span>}
      </div>
      <div className="flex items-center gap-1">
        {!compact && sourceText && <SpeakerButton text={sourceText} />}
        {text && <SpeakerButton text={text} />}
      </div>
    </div>
  );
}
