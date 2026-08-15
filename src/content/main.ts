import { ok, type Response } from '@/messaging/protocol';
import { initSelection } from './selection';
import { pageTranslation } from './page/controller';

/** content script 引导：划词模块 + 全文翻译开关消息 */
export function initContent(): void {
  if (window.__parrotInjected) return;
  window.__parrotInjected = true;

  initSelection();

  browser.runtime.onMessage.addListener((msg: { type?: string; on?: boolean }) => {
    switch (msg?.type) {
      case 'pageTranslation/toggle':
        void pageTranslation.toggle(msg.on === true);
        break;
      case 'pageTranslation/state': // 同步回复当前状态
        return ok({ on: pageTranslation.isOn() }) as Response<{ on: boolean }>;
      default:
        break;
    }
    // selection/showTranslation 由 selection 模块自己的 listener 处理
  });
}

declare global {
  interface Window {
    __parrotInjected?: boolean;
  }
}
