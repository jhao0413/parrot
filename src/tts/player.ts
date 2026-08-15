import { sendBg, type TtsAudioData } from '@/messaging/protocol';

/**
 * 有道 TTS 播放（统一走 background fetch → data URL，与宿主页 CSP 解耦）。
 * 模块级保存当前 Audio 实现播放互斥。
 */
let current: HTMLAudioElement | null = null;

export type TtsLang = 'en' | 'zh';

function detectLang(text: string): TtsLang {
  return /[一-鿿]/.test(text) ? 'zh' : 'en';
}

export async function speak(text: string, lang?: TtsLang, accent?: 1 | 2): Promise<void> {
  const trimmed = text.trim().slice(0, 600);
  if (!trimmed) return;
  const res = await sendBg<TtsAudioData>({
    type: 'tts/getAudio',
    text: trimmed,
    lang: lang ?? detectLang(trimmed),
    accent: accent ?? 2,
  });
  if (!res.ok) throw new Error(res.error.message);
  stop();
  current = new Audio(res.data.dataUrl);
  await current.play();
}

export function stop(): void {
  if (current) {
    current.pause();
    current.src = '';
    current = null;
  }
}
