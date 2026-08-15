import { createRoot, type Root } from 'react-dom/client';
import { SelectionPopup } from './SelectionPopup';
import { popupStyles } from './styles';

/**
 * 划词翻译：mouseup 取词（≤2000 字符），shadow root 弹窗（样式隔离），
 * 基于 range rect 定位 + 视口边缘翻转。
 */

const HOST_ID = 'parrot-selection-host';
const MAX_TEXT = 2000;

let root: Root | null = null;
let host: HTMLElement | null = null;
let currentText = '';
let currentAnchorEl: HTMLElement | null = null; // 选区所在段落（"译此段"用）

function ensureHost(): { host: HTMLElement; root: Root } {
  if (host && root) return { host, root };
  host = document.createElement('div');
  host.id = HOST_ID;
  host.style.position = 'fixed';
  host.style.zIndex = '2147483647';
  host.style.left = '0';
  host.style.top = '0';
  host.style.pointerEvents = 'none'; // 容器不挡事件，弹窗自身再开启
  const shadow = host.attachShadow({ mode: 'open' });
  // shadow 内注入自带样式（与页面及 Tailwind 产物完全解耦）
  const style = document.createElement('style');
  style.textContent = popupStyles;
  shadow.appendChild(style);
  const mount = document.createElement('div');
  mount.style.pointerEvents = 'auto';
  shadow.appendChild(mount);
  document.body.appendChild(host);
  root = createRoot(mount);
  return { host, root };
}

function position(rect: DOMRect): void {
  if (!host) return;
  const POPUP_W = 344;
  const POPUP_H_EST = 160;
  let x = rect.left + rect.width / 2 - POPUP_W / 2;
  x = Math.min(Math.max(x, 8), window.innerWidth - POPUP_W - 8);
  // 默认显示在选区下方，视口放不下则翻转到上方
  let y = rect.bottom + 8;
  if (y + POPUP_H_EST > window.innerHeight) y = rect.top - POPUP_H_EST - 8;
  if (y < 8) y = 8;
  host.style.transform = `translate(${x}px, ${y}px)`;
}

export function hideSelectionPopup(): void {
  root?.unmount();
  root = null;
  host?.remove();
  host = null;
  currentText = '';
  currentAnchorEl = null;
}

function showPopup(text: string, rect: DOMRect): void {
  const { root: r } = ensureHost();
  position(rect);
  r.render(
    <SelectionPopup
      text={text}
      onClose={hideSelectionPopup}
      onTranslateParagraph={
        currentAnchorEl && currentAnchorEl.textContent && currentAnchorEl.textContent.trim().length > text.trim().length
          ? () => {
              void import('../page/controller').then(({ pageTranslation }) => {
                void (async () => {
                  const { getSettings } = await import('@/storage/settings');
                  const settings = await getSettings();
                  await pageTranslation.translateParagraph(currentAnchorEl!, settings.general.targetLang);
                })();
              });
              hideSelectionPopup();
            }
          : null
      }
    />,
  );
}

export function initSelection(): void {
  document.addEventListener('mouseup', (e) => {
    if (e.button !== 0) return;
    // 点击弹窗自身不关闭（弹窗内已 stopPropagation 到 shadow，这里检查 composedPath）
    if (e.composedPath().some((n) => n instanceof Element && n.id === HOST_ID)) return;
    const selection = window.getSelection();
    const text = selection?.toString().trim() ?? '';
    if (!text || text.length > MAX_TEXT || !selection || selection.rangeCount === 0) {
      return;
    }
    // 忽略表单控件内的选区
    const anchorNode = selection.anchorNode;
    const el: HTMLElement | null =
      anchorNode instanceof HTMLElement ? anchorNode : (anchorNode?.parentElement ?? null);
    if (el && (el.closest('input, textarea, [contenteditable]') !== null)) return;

    currentText = text;
    currentAnchorEl =
      (el?.closest('p, h1, h2, h3, h4, h5, h6, li, blockquote, td, dd, dt') as HTMLElement | null) ?? el;
    const rect = selection.getRangeAt(0).getBoundingClientRect();
    // 等同一次浏览器默认行为结束再弹
    setTimeout(() => showPopup(text, rect), 10);
  });

  // 点击页面其他地方关闭弹窗
  document.addEventListener('mousedown', (e) => {
    if (e.composedPath().some((n) => n instanceof Element && n instanceof HTMLElement && n.closest?.(`#${HOST_ID}`))) return;
    if (currentText) hideSelectionPopup();
  });

  document.addEventListener('keydown', (e) => {
    if (e.key === 'Escape') hideSelectionPopup();
  });

  // 右键菜单 / 外部触发展示（background → selection/showTranslation）
  browser.runtime.onMessage.addListener((msg: { type?: string; text?: string; from?: string; to?: string }) => {
    if (msg?.type === 'selection/showTranslation' && msg.text) {
      const rect = new DOMRect(window.innerWidth / 2 - 160, 24, 320, 0);
      currentAnchorEl = null;
      setTimeout(() => showPopup(msg.text!, rect), 10);
    }
  });
}
