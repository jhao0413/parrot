import { PARA_ATTR, TRANS_ATTR } from './walker';


/**
 * 译文插入：段落后平级插入兄弟节点（不动原 DOM 结构内部），
 * 译文节点 translate="no" 防级联翻译，样式走注入的 <style>（扩展注入不受页面 CSP 限制）。
 */

const STYLE_ID = 'parrot-trans-style';

const STYLE_CSS = `
[data-mt-trans] {
  display: block;
  /* --parrot-gap = 原段落 margin-bottom（插入时写入）：上边距抵消它只留小间距贴近原文，下边距补回它保持与下一段的距离 */
  margin: calc(0.2em - var(--parrot-gap, 0px)) 0 var(--parrot-gap, 0.25em);
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
  display: inline-block; /* loading 贴在段末行内，不另起一行 */
  width: 0.9em;
  height: 0.9em;
  margin: 0 0 0 0.4em;
  vertical-align: -0.1em;
}
/* 渐变拖尾的圆环：conic-gradient 由透明到蓝色，mask 挖空中心只留环 */
[data-mt-trans].parrot-loading::before {
  content: '';
  display: block;
  width: 100%;
  height: 100%;
  border-radius: 50%;
  background: conic-gradient(transparent 10%, #3b82f6);
  -webkit-mask: radial-gradient(farthest-side, transparent calc(100% - 0.15em), #000 calc(100% - 0.14em));
  mask: radial-gradient(farthest-side, transparent calc(100% - 0.15em), #000 calc(100% - 0.14em));
  animation: parrot-spin 0.8s linear infinite;
}
@keyframes parrot-spin {
  to { transform: rotate(360deg); }
}
@media (prefers-reduced-motion: reduce) {
  [data-mt-trans].parrot-loading::before { animation-duration: 2.4s; }
}
/* 仅译文模式：只隐藏后面已跟着译文的原段落（翻译中 / 译文被收起时原文保持可见） */
html[data-parrot-mode='translationOnly'] [data-mt-p]:has(+ [data-mt-trans]) {
  display: none;
}
/* 仅译文模式原段落不占位，不能再用负上边距（会压到上一段） */
html[data-parrot-mode='translationOnly'] [data-mt-trans]:not(.parrot-loading) {
  margin-top: 0.25em;
}
`;

function ensureStyle(): void {
  if (document.getElementById(STYLE_ID)) return;
  const style = document.createElement('style');
  style.id = STYLE_ID;
  style.textContent = STYLE_CSS;
  document.head.appendChild(style);
}

/** 翻译请求发出前插入加载占位（幂等：同 id 已存在则直接返回）。
 *  占位以行内 span 追加在段落末尾（"原文 ⟳"，不另起一行不撑布局）。 */
export function injectPlaceholder(paragraph: HTMLElement, id: string): HTMLElement {
  ensureStyle();
  const existing = document.querySelector(`[${TRANS_ATTR}="${CSS.escape(id)}"]`);
  if (existing) return existing as HTMLElement;
  const node = document.createElement('span');
  node.setAttribute(TRANS_ATTR, id);
  node.setAttribute('translate', 'no');
  node.classList.add('parrot-loading');
  node.textContent = '';
  paragraph.appendChild(node);
  return node;
}

/** 结果就绪后把段内行内占位移出为段落后方的平级节点（保持同段分块的先后顺序） */
function moveAfterParagraph(node: Element): void {
  const paragraph = node.parentElement;
  if (!paragraph?.hasAttribute(PARA_ATTR)) return; // 已在段外（重复填充）
  const [mainId, chunk = '0'] = (node.getAttribute(TRANS_ATTR) ?? '').split(':');
  // 已移出的同段分块紧跟在段落后；插到最后一个序号比自己小的分块之后（分块可能乱序返回）
  let ref: Element = paragraph;
  for (let sib = paragraph.nextElementSibling; sib; sib = sib.nextElementSibling) {
    const [sibMain, sibChunk = '0'] = (sib.getAttribute(TRANS_ATTR) ?? '').split(':');
    if (sibMain !== mainId) break;
    if (Number(sibChunk) < Number(chunk)) ref = sib;
  }
  // 同段各分块都带同样的 gap：前一块的下边距被后一块的负上边距抵消，块间同样紧凑
  (node as HTMLElement).style.setProperty('--parrot-gap', getComputedStyle(paragraph).marginBottom);
  ref.after(node);
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
  moveAfterParagraph(node); // 行内 loading → 段落后方块级译文
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
