import { PARA_ATTR, TRANS_ATTR } from './walker';


/**
 * 译文插入：段落后平级插入兄弟节点（不动原 DOM 结构内部），
 * 译文节点 translate="no" 防级联翻译，样式走注入的 <style>（扩展注入不受页面 CSP 限制）。
 */

const STYLE_ID = 'parrot-trans-style';

const STYLE_CSS = `
[data-mt-trans] {
  display: block;
  margin: 0.25em 0;
  color: inherit;
  font-family: inherit;
  font-size: 0.88em;
  line-height: 1.6;
}
[data-mt-trans]:not(.parrot-loading) {
  text-decoration: underline dashed #3b82f6;
  text-decoration-thickness: 1.5px;
  text-underline-offset: 0.25em;
}
[data-mt-trans].parrot-loading {
  color: #9ca3af;
}
[data-mt-trans].parrot-loading::before {
  content: '';
  display: inline-block;
  width: 0.85em;
  height: 0.85em;
  border: 1.5px solid currentColor;
  border-top-color: transparent;
  border-radius: 50%;
  vertical-align: -0.1em;
  margin-right: 0.35em;
  animation: parrot-spin 0.8s linear infinite;
}
@keyframes parrot-spin {
  to { transform: rotate(360deg); }
}
html[data-parrot-mode='translationOnly'] [data-mt-p] {
  display: none;
}
`;

function ensureStyle(): void {
  if (document.getElementById(STYLE_ID)) return;
  const style = document.createElement('style');
  style.id = STYLE_ID;
  style.textContent = STYLE_CSS;
  document.head.appendChild(style);
}

function isInlineParagraph(el: HTMLElement): boolean {
  return getComputedStyle(el).display === 'inline';
}

/** 翻译请求发出前插入加载占位（幂等：同 id 已存在则直接返回） */
export function injectPlaceholder(paragraph: HTMLElement, id: string): HTMLElement {
  ensureStyle();
  const existing = document.querySelector(`[${TRANS_ATTR}="${CSS.escape(id)}"]`);
  if (existing) return existing as HTMLElement;
  const node = document.createElement(isInlineParagraph(paragraph) ? 'span' : 'div');
  node.setAttribute(TRANS_ATTR, id);
  node.setAttribute('translate', 'no');
  node.classList.add('parrot-loading');
  node.textContent = '';
  paragraph.after(node);
  return node;
}

/**
 * 结果回来填充；失败则移除占位。
 * 折叠线下方的段落没有预插占位（懒翻译时才创建），这里自动补建。
 * 超长段分块的子段 id 形如 "5:0"，主段落元素按 "5" 查找。
 */
export function fillTranslation(id: string, text: string | null): void {
  let node = document.querySelector(`[${TRANS_ATTR}="${CSS.escape(id)}"]`);
  if (!node) {
    if (text === null) return;
    const mainId = id.split(':')[0]!;
    const paragraph = document.querySelector(`[${PARA_ATTR}="${CSS.escape(mainId)}"]`);
    if (!paragraph) return;
    node = injectPlaceholder(paragraph as HTMLElement, id);
  }
  if (text === null) {
    node.remove();
    return;
  }
  node.textContent = text;
  node.classList.remove('parrot-loading');
}

/** 设置展示模式（双语 / 仅译文） */
export function setMode(mode: 'bilingual' | 'translationOnly'): void {
  document.documentElement.setAttribute('data-parrot-mode', mode);
}

/** 移除所有译文节点 */
export function removeAllTranslations(): void {
  document.querySelectorAll(`[${TRANS_ATTR}]`).forEach((el) => el.remove());
  document.documentElement.removeAttribute('data-parrot-mode');
  document.getElementById(STYLE_ID)?.remove();
}
