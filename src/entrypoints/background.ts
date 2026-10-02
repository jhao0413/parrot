import {
  err,
  ok,
  requestSchema,
  sendTab,
  type ExtensionRequest,
  type Response,
} from '@/messaging/protocol';
import { translateBatch, translateSingle } from '@/translate/service';
import { getSettings } from '@/storage/settings';

export default defineBackground(() => {
  // ---- 消息路由 ----
  browser.runtime.onMessage.addListener((msg: unknown, _sender, sendResponse: (r: unknown) => void) => {
    void handleRequest(msg).then(sendResponse);
    return true; // 异步响应
  });

  async function handleRequest(msg: unknown): Promise<Response<unknown>> {
    const parsed = requestSchema.safeParse(msg);
    if (!parsed.success) return err('BAD_REQUEST', parsed.error.message);
    const req = parsed.data as ExtensionRequest;
    try {
      switch (req.type) {
        case 'translate/batch': {
          const data = await translateBatch(req.items, req.from, req.to);
          return ok(data);
        }
        case 'translate/single': {
          const data = await translateSingle(req.text, req.from, req.to, req.wantDict);
          return ok(data);
        }
        case 'tts/speak': {
          const { dataUrl } = await getTtsAudio(req.text, req.lang, req.accent);
          await playAudio(dataUrl);
          return ok(null);
        }
        default:
          return err('BAD_REQUEST', `background 不处理该消息: ${(req as { type: string }).type}`);
      }
    } catch (e) {
      return toErrorResponse(e);
    }
  }

  function toErrorResponse(e: unknown): Response<never> {
    if (e instanceof Error && 'code' in e) {
      const code = (e as { code: string }).code as 'PROVIDER_ERROR' | 'RATE_LIMIT' | 'NO_KEY' | 'NETWORK';
      return err(code, e.message);
    }
    return err('INTERNAL', e instanceof Error ? e.message : String(e));
  }

  // ---- TTS 播放：不能在 content script 里放（宿主页 CSP media-src 会拦 data: 音频） ----
  // Chrome：service worker 无 DOM，交给 offscreen document 播放；Firefox：background 是 event page，直接播
  let bgAudio: HTMLAudioElement | null = null;
  let creatingOffscreen: Promise<void> | null = null;

  async function ensureOffscreen(): Promise<void> {
    // AUDIO_PLAYBACK 的 offscreen 静音 30s 后会被自动关闭，每次都查一下
    const contexts = await browser.runtime.getContexts({ contextTypes: ['OFFSCREEN_DOCUMENT'] });
    if (contexts.length > 0) return;
    creatingOffscreen ??= browser.offscreen
      .createDocument({ url: 'offscreen.html', reasons: ['AUDIO_PLAYBACK'], justification: '播放有道发音' })
      .finally(() => (creatingOffscreen = null));
    await creatingOffscreen;
  }

  async function playAudio(dataUrl: string): Promise<void> {
    if (!browser.offscreen) {
      bgAudio?.pause();
      bgAudio = new Audio(dataUrl);
      await bgAudio.play();
      return;
    }
    await ensureOffscreen();
    const res = (await browser.runtime.sendMessage({ target: 'offscreen', type: 'offscreen/play', dataUrl })) as
      | { ok: true }
      | { ok: false; error: string }
      | undefined;
    if (!res?.ok) throw new Error(`发音播放失败: ${res ? res.error : '无响应'}`);
  }

  // ---- TTS：有道 dictvoice（免签名直接 GET mp3，转 data URL） ----
  const ttsLru = new Map<string, string>(); // key: lang:accent:text → dataUrl，最多 30 条
  async function getTtsAudio(text: string, lang: 'en' | 'zh', accent: 1 | 2) {
    const truncated = text.slice(0, 600); // 有道约 600 字符截断
    const lruKey = `${lang}:${accent}:${truncated}`;
    const hit = ttsLru.get(lruKey);
    if (hit) {
      ttsLru.delete(lruKey);
      ttsLru.set(lruKey, hit); // 触碰 LRU
      return { dataUrl: hit };
    }
    const url = `https://dict.youdao.com/dictvoice?audio=${encodeURIComponent(truncated)}&le=${lang}&type=${accent}`;
    const res = await fetch(url);
    if (!res.ok) throw new Error(`有道 TTS 请求失败: HTTP ${res.status}`);
    const buf = await res.arrayBuffer();
    const base64 = arrayBufferToBase64(buf);
    const dataUrl = `data:audio/mp3;base64,${base64}`;
    if (ttsLru.size >= 30) ttsLru.delete(ttsLru.keys().next().value!);
    ttsLru.set(lruKey, dataUrl);
    return { dataUrl };
  }

  function arrayBufferToBase64(buf: ArrayBuffer): string {
    const bytes = new Uint8Array(buf);
    let binary = '';
    const chunk = 0x8000;
    for (let i = 0; i < bytes.length; i += chunk) {
      binary += String.fromCharCode(...bytes.subarray(i, i + chunk));
    }
    return btoa(binary);
  }

  // ---- 切换某 tab 的全文翻译（快捷键 / 右键菜单共用） ----
  async function togglePageTranslation(tabId: number): Promise<void> {
    const state = await sendTab<{ on: boolean }>(tabId, { type: 'pageTranslation/state', on: false });
    const isOn = state?.ok && state.data.on === true;
    await sendTab(tabId, { type: 'pageTranslation/toggle', on: !isOn });
  }

  browser.commands.onCommand.addListener(async (command) => {
    if (command !== 'toggle-translate-page') return;
    const [tab] = await browser.tabs.query({ active: true, currentWindow: true });
    if (tab?.id) await togglePageTranslation(tab.id);
  });

  // ---- 右键菜单（SW 重启会重新执行，先清掉旧菜单避免重复 id 报错） ----
  // 选中文字：翻译选中内容；未选中（page）：翻译 / 还原整页
  void browser.contextMenus.removeAll().then(() => {
    browser.contextMenus.create({
      id: 'parrot-translate-selection',
      title: '翻译 "%s"',
      contexts: ['selection'],
    });
    browser.contextMenus.create({
      id: 'parrot-toggle-page',
      title: '翻译 / 还原此页面',
      contexts: ['page'],
    });
  });
  browser.contextMenus.onClicked.addListener(async (info, tab) => {
    if (!tab?.id) return;
    if (info.menuItemId === 'parrot-toggle-page') {
      await togglePageTranslation(tab.id);
      return;
    }
    if (info.menuItemId !== 'parrot-translate-selection' || !info.selectionText) return;
    const settings = await getSettings();
    await sendTab(tab.id, {
      type: 'selection/showTranslation',
      text: info.selectionText,
      from: settings.general.sourceLang,
      to: settings.general.targetLang,
    });
  });
});
