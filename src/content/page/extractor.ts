import { TRANS_ATTR, type Paragraph } from './walker';
import { hasLetters } from '@/translate/lang';

const INLINE_DISPLAYS = new Set(['inline', 'inline-block', 'inline-flex', 'inline-grid', 'contents', 'ruby', 'ruby-text']);

/** 行内判断（inline 模式下只收行内子树，跳过块级子元素避免与其译文重复） */
function isInlineNode(el: Element): boolean {
  return INLINE_DISPLAYS.has(getComputedStyle(el).display);
}

/**
 * 段落文本抽取：<br> → \n；跳过自己注入的译文和不可见标签。
 * mode='inline' 时只收直属行内内容（块级子元素留给它们自己的段落）。
 */
export function extractText(el: Element, mode: Paragraph['mode'] = 'subtree'): string {
  let out = '';
  for (const node of el.childNodes) {
    if (node.nodeType === Node.TEXT_NODE) {
      out += node.textContent ?? '';
    } else if (node.nodeType === Node.ELEMENT_NODE) {
      const child = node as Element;
      if (child.hasAttribute(TRANS_ATTR) || child.getAttribute('translate') === 'no') continue;
      if (child.tagName === 'BR') {
        out += '\n';
        continue;
      }
      if (['SCRIPT', 'STYLE', 'NOSCRIPT', 'SVG'].includes(child.tagName)) continue;
      if (mode === 'inline' && !isInlineNode(child)) continue;
      out += extractText(child, 'subtree'); // 行内子树整体收下
    }
  }
  return out;
}

/** 是否值得送翻：非空、有字母/文字、非纯数字符号 */
export function isTranslatable(text: string): boolean {
  const trimmed = text.trim();
  if (trimmed.length < 2) return false;
  if (/^[\d\s.,:;()%$#@!?/*+-]+$/.test(trimmed)) return false; // 纯数字符号
  return hasLetters(trimmed);
}
