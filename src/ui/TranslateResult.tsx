import type { DictEntry } from '@/messaging/protocol';
import { SpeakerButton } from './SpeakerButton';

/** 译文 + 可选词典区。发音按钮由调用方按位置自行摆放（原文/译文各归其位） */
export function TranslateResult({ text, dict }: { text: string; dict?: DictEntry }) {
  return (
    <div className="space-y-3">
      {dict && (
        <div className="rounded-md bg-gray-50 px-2.5 py-2 text-xs">
          <div className="flex items-center gap-1.5 font-medium text-gray-700">
            {dict.word}
            {dict.phonetic && <span className="font-normal text-gray-400">{dict.phonetic}</span>}
            <SpeakerButton text={dict.word} lang="en" size="sm" title="朗读单词" />
          </div>
          {dict.explanations.length > 0 && (
            <ul className="mt-1 space-y-0.5 text-gray-500">
              {dict.explanations.slice(0, 6).map((e, i) => (
                <li key={i}>{e}</li>
              ))}
            </ul>
          )}
        </div>
      )}
      <div className="whitespace-pre-wrap text-[15px] leading-relaxed text-gray-900">
        {text || <span className="text-gray-400">（无结果）</span>}
      </div>
    </div>
  );
}
