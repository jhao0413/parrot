import { useState } from 'react';
import { speak, type TtsLang } from '@/tts/player';

export function SpeakerButton({ text, lang, accent }: { text: string; lang?: TtsLang; accent?: 1 | 2 }) {
  const [busy, setBusy] = useState(false);
  return (
    <button
      type="button"
      title="发音（有道）"
      className="inline-flex h-6 w-6 items-center justify-center rounded text-sm text-gray-500 transition-colors hover:bg-gray-100 hover:text-gray-900"
      onClick={async (e) => {
        e.stopPropagation();
        if (busy) return;
        setBusy(true);
        try {
          await speak(text, lang, accent);
        } catch (err) {
          console.warn('TTS failed', err);
        } finally {
          setBusy(false);
        }
      }}
    >
      {busy ? <span className="animate-pulse">🔊</span> : '🔊'}
    </button>
  );
}
