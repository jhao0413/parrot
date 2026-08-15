/** 支持的目标语言（v1 精简集，后续可加） */
export const LANGUAGES = {
  zh: '中文（简体）',
  'zh-TW': '中文（繁体）',
  en: '英语',
  ja: '日语',
  ko: '韩语',
  fr: '法语',
  de: '德语',
  es: '西班牙语',
  ru: '俄语',
} as const;

export type LangCode = keyof typeof LANGUAGES | (string & {});

export const LANG_CODES = Object.keys(LANGUAGES);

/** 判断文本主要是否为中文（用于"目标语言 == 源语言 不翻译"） */
export function isChineseText(text: string): boolean {
  const cjk = (text.match(/[一-鿿㐀-䶿]/g) ?? []).length;
  return cjk > 0 && cjk / Math.max(text.replace(/\s/g, '').length, 1) > 0.3;
}

/** 文本里是否基本没有目标语言的字符（粗略，用于过滤数字/符号等噪声段落） */
export function hasLetters(text: string): boolean {
  return /[a-zA-Z぀-ヿ가-힯Ѐ-ӿ֐-׿؀-ۿ一-鿿]/.test(text);
}

/**
 * 归一化语言码：zh-CN/zh-TW/cht → zh / zh-TW，en-US → en 等。
 */
export function normalizeLang(code: string): string {
  const c = code.trim();
  const lower = c.toLowerCase();
  if (['zh-cn', 'zh', 'zh_cn', 'chs', 'zh-hans'].includes(lower)) return 'zh';
  if (['zh-tw', 'zh_tw', 'cht', 'zh-hant', 'zh-hk'].includes(lower)) return 'zh-TW';
  return lower.split(/[-_]/)[0] ?? lower;
}
