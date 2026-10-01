import { ok } from '@/messaging/protocol';
import { initSelection } from './selection';
import { initHoverTranslate } from './hover';
import { pageTranslation } from './page/controller';

/** content script 引导：划词模块 + 全文翻译开关消息 */
export function initContent(): void {
  if (window.__parrotInjected) return;
  window.__parrotInjected = true;

  initSelection();
  initHoverTranslate();

  browser.runtime.onMessage.addListener((msg: { type?: string; on?: boolean }, _sender, sendResponse) => {
    switch (msg?.type) {
      case 'pageTranslation/toggle':
        void pageTranslation.toggle(msg.on === true);
        break;
      case 'pageTranslation/state':
        // 原生 chrome API：必须用 sendResponse 回传（返回值会被忽略）
        sendResponse(ok({ on: pageTranslation.isOn() }));
        break;
      default:
        break; // selection/showTranslation 由 selection 模块自己的 listener 处理
    }
  });
}

declare global {
  interface Window {
    __parrotInjected?: boolean;
  }
}
