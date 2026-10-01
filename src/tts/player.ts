import { sendBg } from '@/messaging/protocol';

/**
 * 有道 TTS 播放：交给 background 取音频并在扩展上下文播放
 * （content script 里 new Audio 会被宿主页 CSP media-src 拦截）。播放互斥由播放端保证。
 */

export type TtsLang = 'en' | 'zh';

function detectLang(text: string): TtsLang {
  return /[一-鿿]/.test(text) ? 'zh' : 'en';
}

export async function speak(text: string, lang?: TtsLang, accent?: 1 | 2): Promise<void> {
  const trimmed = text.trim().slice(0, 600);
  if (!trimmed) return;
  const res = await sendBg<null>({
    type: 'tts/speak',
    text: trimmed,
    lang: lang ?? detectLang(trimmed),
    accent: accent ?? 2,
  });
  if (!res.ok) throw new Error(res.error.message);
}
