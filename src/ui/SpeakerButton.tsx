import { useState } from 'react';
import { speak, type TtsLang } from '@/tts/player';

/** 喇叭图标（lucide volume-2，ISC 协议）。无样式依赖，shadow root 内也可用 */
export function VolumeIcon({ className }: { className?: string }) {
  return (
    <svg
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth="2"
      strokeLinecap="round"
      strokeLinejoin="round"
      className={className}
      aria-hidden="true"
    >
      <path d="M11 4.702a.705.705 0 0 0-1.203-.498L6.413 7.587A1.4 1.4 0 0 1 5.416 8H3a1 1 0 0 0-1 1v6a1 1 0 0 0 1 1h2.416a1.4 1.4 0 0 1 .997.413l3.383 3.384A.705.705 0 0 0 11 19.298z" />
      <path d="M16 9a5 5 0 0 1 0 6" />
      <path d="M19.364 18.364a9 9 0 0 0 0-12.728" />
    </svg>
  );
}

export function SpeakerButton({
  text,
  lang,
  accent,
  title = '发音（有道）',
  size = 'md',
}: {
  text: string;
  lang?: TtsLang;
  accent?: 1 | 2;
  title?: string;
  size?: 'sm' | 'md';
}) {
  const [busy, setBusy] = useState(false);
  const box = size === 'sm' ? 'h-6 w-6' : 'h-7 w-7';
  const icon = size === 'sm' ? 'h-3.5 w-3.5' : 'h-4 w-4';
  return (
    <button
      type="button"
      title={title}
      disabled={!text.trim() || busy}
      className={`inline-flex ${box} items-center justify-center rounded-full text-zinc-500 transition-colors duration-150 hover:bg-zinc-100 hover:text-zinc-800 focus-visible:outline-2 focus-visible:outline-brand-600 disabled:cursor-not-allowed disabled:opacity-40 disabled:hover:bg-transparent dark:text-zinc-400 dark:hover:bg-white/5 dark:hover:text-zinc-100`}
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
      <VolumeIcon className={`${icon} ${busy ? 'animate-pulse text-brand-600 dark:text-brand-400' : ''}`} />
    </button>
  );
}
