import { TRANS_ATTR } from './walker';
import { hasLetters } from '@/translate/lang';

/** 段落文本抽取：子树文本聚合，<br> → \n；过滤噪声段落 */
export function extractText(el: Element): string {
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
      out += extractText(child);
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
