/**
 * Chrome offscreen document：只负责播放 background 传来的发音音频。
 * 模块级保存当前 Audio 实现播放互斥。
 */
let current: HTMLAudioElement | null = null;

browser.runtime.onMessage.addListener(
  (msg: { target?: string; type?: string; dataUrl?: string }, _sender, sendResponse: (r: unknown) => void) => {
    if (msg?.target !== 'offscreen' || msg.type !== 'offscreen/play' || !msg.dataUrl) return;
    current?.pause();
    current = new Audio(msg.dataUrl);
    current.play().then(
      () => sendResponse({ ok: true }),
      (e: unknown) => sendResponse({ ok: false, error: e instanceof Error ? e.message : String(e) }),
    );
    return true; // 异步响应
  },
);
