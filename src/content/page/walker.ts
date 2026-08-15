/**
 * DOM 遍历与段落标记。
 * "段落" = 最深的块级元素（子树内只有 inline 内容）。标记 data-mt-p=<n> 作为翻译单元 id。
 */

export const PARA_ATTR = 'data-mt-p';
export const TRANS_ATTR = 'data-mt-trans';

const SKIP_TAGS = new Set([
  'SCRIPT', 'STYLE', 'NOSCRIPT', 'CODE', 'PRE', 'TEXTAREA', 'INPUT', 'SELECT',
  'SVG', 'CANVAS', 'IFRAME', 'OBJECT', 'EMBED', 'AUDIO', 'VIDEO', 'IMG', 'NAV', 'FOOTER', 'BUTTON',
]);

const BLOCK_DISPLAYS = new Set(['block', 'flex', 'grid', 'list-item', 'table', 'table-row', 'table-cell', 'flow-root']);

const MAX_PARAGRAPHS = 1500;

function shouldSkip(el: Element): boolean {
  if (SKIP_TAGS.has(el.tagName)) return true;
  if (el.hasAttribute(TRANS_ATTR)) return true; // 自己注入的译文
  if (el.getAttribute('translate') === 'no') return true;
  if (el instanceof HTMLElement && el.isContentEditable) return true;
  // 不可见元素（display:none 由 isBlock 已排除；这里排除 hidden 属性）
  return el.hasAttribute('hidden');
}

function isBlock(el: Element): boolean {
  const display = getComputedStyle(el).display;
  return BLOCK_DISPLAYS.has(display);
}

/** 子树里是否有非空文本节点 */
function hasText(el: Element): boolean {
  for (const node of el.childNodes) {
    if (node.nodeType === Node.TEXT_NODE && node.textContent && node.textContent.trim()) return true;
    if (node.nodeType === Node.ELEMENT_NODE && hasText(node as Element)) return true;
  }
  return false;
}

/**
 * 从 root 遍历，收集段落元素并标记 PARA_ATTR，返回段落列表。
 * root 参数是为未来 MutationObserver 局部增量翻译预留的。
 */
export function walkAndLabel(root: ParentNode): HTMLElement[] {
  const paragraphs: HTMLElement[] = [];

  function walk(el: Element) {
    if (paragraphs.length >= MAX_PARAGRAPHS) return;
    if (shouldSkip(el) || !isBlock(el)) return;

    // 找出块级子元素（可继续下钻的）
    const blockChildren: Element[] = [];
    for (const child of el.children) {
      if (!shouldSkip(child) && isBlock(child) && hasText(child)) {
        blockChildren.push(child);
      }
    }

    if (blockChildren.length > 0) {
      for (const child of blockChildren) walk(child);
      // 混合内容（既有块级子元素又有直接 inline 文本）的父级不算段落，v1 忽略这部分散落文本
      return;
    }

    // 叶子块级：本身即段落
    if (hasText(el) && el instanceof HTMLElement) {
      el.setAttribute(PARA_ATTR, String(paragraphs.length));
      paragraphs.push(el);
    }
  }

  walk(root as Element);
  return paragraphs;
}

/** 清除所有段落标记（off 时用） */
export function clearLabels(): void {
  document.querySelectorAll(`[${PARA_ATTR}]`).forEach((el) => el.removeAttribute(PARA_ATTR));
}
