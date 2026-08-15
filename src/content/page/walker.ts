/**
 * DOM 遍历与段落标记。
 * "段落"分两类：
 *  - subtree：叶子块级元素（子树内只有 inline 内容），抽取整个子树文本
 *  - inline：非叶子块级容器上散落的直接行内文本（如 <div>作者 <p>正文</p></div> 里的"作者"），
 *    只抽取该容器直属的行内内容，避免与块级子元素的译文重复
 * data-mt-p=<n> 为翻译单元 id，data-mt-mode 标记类型。
 */

export const PARA_ATTR = 'data-mt-p';
export const MODE_ATTR = 'data-mt-mode';
export const TRANS_ATTR = 'data-mt-trans';

const SKIP_TAGS = new Set([
  'SCRIPT', 'STYLE', 'NOSCRIPT', 'CODE', 'PRE', 'TEXTAREA', 'INPUT', 'SELECT',
  'SVG', 'CANVAS', 'IFRAME', 'OBJECT', 'EMBED', 'AUDIO', 'VIDEO', 'IMG', 'NAV', 'FOOTER', 'BUTTON',
]);

const BLOCK_DISPLAYS = new Set([
  'block', 'flex', 'grid', 'list-item', 'table', 'table-row', 'table-cell', 'table-caption', 'flow-root',
]);

const MAX_PARAGRAPHS = 3000;

export interface Paragraph {
  el: HTMLElement;
  id: string;
  mode: 'subtree' | 'inline';
}

function shouldSkip(el: Element): boolean {
  if (SKIP_TAGS.has(el.tagName)) return true;
  if (el.hasAttribute(TRANS_ATTR)) return true; // 自己注入的译文
  if (el.getAttribute('translate') === 'no') return true;
  if (el instanceof HTMLElement && el.isContentEditable) return true;
  return el.hasAttribute('hidden');
}

function displayOf(el: Element): string {
  return getComputedStyle(el).display;
}

function isBlockDisplay(display: string): boolean {
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
 * 从 root 遍历，标记段落。root 参数是为未来 MutationObserver 局部增量翻译预留的。
 */
export function walkAndLabel(root: ParentNode): Paragraph[] {
  const paragraphs: Paragraph[] = [];

  function label(el: HTMLElement, mode: Paragraph['mode']) {
    const id = String(paragraphs.length);
    el.setAttribute(PARA_ATTR, id);
    if (mode === 'inline') el.setAttribute(MODE_ATTR, 'inline');
    paragraphs.push({ el, id, mode });
  }

  function walk(el: Element): void {
    if (paragraphs.length >= MAX_PARAGRAPHS) return;
    if (shouldSkip(el)) return;
    const display = displayOf(el);
    // contents 是透明容器（子元素直接参与父级布局），按容器下钻；
    // 其余非块级元素（inline 等）不单独成段，由父级的行内收集覆盖
    if (!isBlockDisplay(display) && display !== 'contents') return;

    const blockKids: Element[] = [];
    let hasDirectInline = false;

    function consider(child: Element): void {
      if (paragraphs.length >= MAX_PARAGRAPHS) return;
      if (shouldSkip(child) || !hasText(child)) return;
      const childDisplay = displayOf(child);
      if (childDisplay === 'contents') {
        // 透明容器：其子元素视作当前层的子元素
        for (const grandchild of child.children) consider(grandchild);
        for (const n of child.childNodes) {
          if (n.nodeType === Node.TEXT_NODE && n.textContent?.trim()) hasDirectInline = true;
        }
        return;
      }
      if (isBlockDisplay(childDisplay)) blockKids.push(child);
      else hasDirectInline = true; // inline / inline-block 等，属于父级行内内容
    }

    for (const child of el.children) consider(child);
    for (const n of el.childNodes) {
      if (n.nodeType === Node.TEXT_NODE && n.textContent?.trim()) {
        hasDirectInline = true;
        break;
      }
    }

    if (blockKids.length === 0) {
      if (hasText(el) && el instanceof HTMLElement) label(el, 'subtree');
    } else {
      for (const kid of blockKids) walk(kid);
      // 混合内容：块级子元素之外还有散落的行内文本，容器本身额外成段（只取直属行内内容）
      if (hasDirectInline && el instanceof HTMLElement) label(el, 'inline');
    }
  }

  walk(root as Element);
  return paragraphs;
}

/** 清除所有段落标记（off 时用） */
export function clearLabels(): void {
  document.querySelectorAll(`[${PARA_ATTR}]`).forEach((el) => {
    el.removeAttribute(PARA_ATTR);
    el.removeAttribute(MODE_ATTR);
  });
}
