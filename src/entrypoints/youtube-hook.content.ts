import { YT_TIMEDTEXT_MSG } from '@/content/youtube/captions';

/**
 * YouTube 字幕拦截（MAIN world，document_start）：
 * 播放器自己请求 /api/timedtext（带 pot 等签名参数，扩展自己去拉会拿到空响应），
 * 这里 hook XHR / fetch 截获响应原文，postMessage 给隔离世界的字幕模块。
 * MAIN world 没有 browser.* API，只做转发。
 */

export default defineContentScript({
  matches: ['*://www.youtube.com/*', '*://www.youtube-nocookie.com/*'],
  runAt: 'document_start',
  world: 'MAIN',
  allFrames: true, // 嵌入式播放器（/embed/）在 iframe 里
  main() {
    const isTimedtext = (url: string) => url.includes('/api/timedtext');
    const forward = (url: string, body: string) => {
      if (body) window.postMessage({ type: YT_TIMEDTEXT_MSG, url, body }, location.origin);
    };

    const origOpen = XMLHttpRequest.prototype.open;
    XMLHttpRequest.prototype.open = function (this: XMLHttpRequest, ...args: Parameters<typeof origOpen>) {
      const url = String(args[1]);
      if (isTimedtext(url)) {
        this.addEventListener('load', () => {
          try {
            const t = this.responseType;
            if (t === '' || t === 'text') forward(this.responseURL || url, this.responseText);
            else if (t === 'json') forward(this.responseURL || url, JSON.stringify(this.response));
            else if (t === 'arraybuffer') forward(this.responseURL || url, new TextDecoder().decode(this.response));
          } catch {
            // 解析失败不影响播放器
          }
        });
      }
      return origOpen.apply(this, args);
    } as typeof origOpen;

    const origFetch = window.fetch;
    window.fetch = async function (...args: Parameters<typeof fetch>) {
      const res = await origFetch.apply(this, args);
      try {
        const input = args[0];
        const url = typeof input === 'string' ? input : input instanceof URL ? input.href : input.url;
        if (isTimedtext(url) && res.ok) void res.clone().text().then((body) => forward(res.url || url, body), () => {});
      } catch {
        // ignore
      }
      return res;
    };
  },
});
