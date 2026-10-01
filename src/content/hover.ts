import { isContextValid } from '@/messaging/protocol';
import { getSettings, watchSettings } from '@/storage/settings';
import { pageTranslation } from './page/controller';
import { extractText, isTranslatable } from './page/extractor';
import { isBlockEl, MODE_ATTR, PARA_ATTR, TRANS_ATTR, type Paragraph } from './page/walker';

/**
 * 悬停段落翻译：鼠标停在段落内时按 Shift 翻译该段，
 * 复用全文翻译的占位/注入管线（"译此段"同款）。
 */

// 与 selection 模块的"选区所在段落"判定保持一致
const PARAGRAPH_SELECTOR = 'p, h1, h2, h3, h4, h5, h6, li, blockquote, td, dd, dt';

let hovered: HTMLElement | null = null;
let enabled = true;

/** 悬停目标 → 段落：先按语义标签找；命中不了（正文是 div 的站点）则取最近的块级元素 */
function paragraphFrom(target: Element): HTMLElement | null {
  if (target.closest(`[${TRANS_ATTR}]`)) return null; // 悬停在译文上不再翻译
  const hit = target.closest<HTMLElement>(PARAGRAPH_SELECTOR);
  if (hit) return hit;
  // 深层目标（如 span）向上找最近块级祖先，即鼠标所在"段落"
  for (let n: Element | null = target; n; n = n.parentElement) {
    if (n instanceof HTMLElement && isBlockEl(n) && n !== document.body && n !== document.documentElement) {
      return n.tagName === 'CODE' || n.tagName === 'PRE' ? null : n; // 代码块不翻
    }
  }
  return null;
}

/** 该段是否已有译文（含加载中；长段分块的子段 id 形如 "5:0"） */
function hasTranslation(el: HTMLElement): boolean {
  const id = el.getAttribute(PARA_ATTR);
  if (id === null) return false;
  for (const node of document.querySelectorAll(`[${TRANS_ATTR}]`)) {
    const tid = node.getAttribute(TRANS_ATTR) ?? '';
    if (tid === id || tid.startsWith(`${id}:`)) return true;
  }
  return false;
}

function paragraphMode(el: HTMLElement): Paragraph['mode'] {
  return el.getAttribute(MODE_ATTR) === 'inline' ? 'inline' : 'subtree';
}

export function initHoverTranslate(): void {
  void getSettings().then((s) => (enabled = s.page.shiftTranslate));
  watchSettings((s) => (enabled = s.page.shiftTranslate));

  document.addEventListener('mouseover', (e) => {
    hovered = e.target instanceof Element ? paragraphFrom(e.target) : null;
  });

  document.addEventListener('keydown', (e) => {
    // 只响应"单独按 Shift"：Alt+Shift+T（全文翻译开关）等组合键不触发
    if (e.key !== 'Shift' || e.repeat || e.altKey || e.ctrlKey || e.metaKey || !enabled) return;
    if (!isContextValid()) return; // 扩展已重新加载，旧脚本不再响应
    const el = hovered;
    if (!el || !el.isConnected) return;
    // 焦点在输入框（Shift+字母输大写）或已有选区（Shift 扩选）时不触发
    const active = document.activeElement;
    if (active instanceof HTMLElement && active.closest('input, textarea, [contenteditable]')) return;
    if (!window.getSelection()?.isCollapsed) return;
    if (hasTranslation(el)) return;
    if (!isTranslatable(extractText(el, paragraphMode(el)))) return;
    void getSettings()
      .then((s) => pageTranslation.translateParagraph(el, s.general.targetLang, paragraphMode(el)))
      .catch((err) => console.warn('悬停翻译失败', err));
  });
}
