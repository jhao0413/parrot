import { z } from 'zod';

/** 词典查询结果（有道等 provider 可选返回） */
export interface DictEntry {
  word: string;
  /** 词头语言（决定发音）；不填为英文。中文词的 phonetic 是拼音 */
  lang?: 'en' | 'zh';
  phonetic?: string;
  explanations: string[];
  /** 以下为富词典字段（有道词典提供），其他 provider 可不填 */
  phonetics?: { accent: 'us' | 'uk'; value: string }[];
  /** 考试标签，如 CET4 / IELTS */
  tags?: string[];
  /** 词性释义，如 { pos: 'adj.', means: '完全的…' } */
  parts?: { pos: string; means: string }[];
  /** 词形变化，如 { name: '过去式', words: ['completed'] } */
  forms?: { name: string; words: string[] }[];
  /** 网络词组 */
  phrases?: { text: string; means: string[] }[];
  /** 英文释义（Google 提供），按词性分组，可带例句 */
  definitions?: { pos: string; items: { text: string; example?: string }[] }[];
  /** 中文词的英文对应词（有道汉英词典），如 { word: 'accomplish', means: '完成，实现' } */
  equivalents?: { word: string; means: string }[];
}

export interface TranslateItemResult {
  id: string;
  text: string;
  detectedFrom?: string;
}

export interface SingleTranslateResult {
  text: string;
  dict?: DictEntry;
  detectedFrom?: string;
}

export const translateBatchRequestSchema = z.object({
  type: z.literal('translate/batch'),
  items: z.array(z.object({ id: z.string().min(1), text: z.string().min(1) })).min(1).max(64),
  from: z.string(),
  to: z.string(),
});

export const translateSingleRequestSchema = z.object({
  type: z.literal('translate/single'),
  text: z.string().min(1),
  from: z.string(),
  to: z.string(),
  wantDict: z.boolean().default(false),
});

/** 发音：background 取音频后在扩展上下文播放（不受宿主页 CSP media-src 限制） */
export const ttsSpeakRequestSchema = z.object({
  type: z.literal('tts/speak'),
  text: z.string().min(1),
  lang: z.enum(['en', 'zh']),
  accent: z.union([z.literal(1), z.literal(2)]).default(2),
});

export const pageTranslationToggleSchema = z.object({
  type: z.literal('pageTranslation/toggle'),
  on: z.boolean(),
});

export const pageTranslationStateSchema = z.object({
  type: z.literal('pageTranslation/state'),
  on: z.boolean(),
});

/** background → content：右键菜单"翻译选中文字"，content 在视口顶部弹出结果 */
export const selectionShowTranslationSchema = z.object({
  type: z.literal('selection/showTranslation'),
  text: z.string().min(1),
  from: z.string(),
  to: z.string(),
});

export type ExtensionRequest =
  | z.infer<typeof translateBatchRequestSchema>
  | z.infer<typeof translateSingleRequestSchema>
  | z.infer<typeof ttsSpeakRequestSchema>
  | z.infer<typeof pageTranslationToggleSchema>
  | z.infer<typeof pageTranslationStateSchema>
  | z.infer<typeof selectionShowTranslationSchema>;

export const requestSchema = z.discriminatedUnion('type', [
  translateBatchRequestSchema,
  translateSingleRequestSchema,
  ttsSpeakRequestSchema,
  pageTranslationToggleSchema,
  pageTranslationStateSchema,
  selectionShowTranslationSchema,
]);

export type ErrorCode =
  | 'PROVIDER_ERROR'
  | 'RATE_LIMIT'
  | 'NO_KEY'
  | 'NETWORK'
  | 'BAD_REQUEST'
  | 'INTERNAL';

export type Response<T> =
  | { ok: true; data: T }
  | { ok: false; error: { code: ErrorCode; message: string } };

export interface BatchTranslateData {
  results: TranslateItemResult[];
  /** 部分失败时列出失败的 id，调用方决定如何展示 */
  failedIds: string[];
}

/** 扩展重新加载/更新后，旧页面里的 content script 与扩展断开，调扩展 API 会抛 "Extension context invalidated" */
export const CONTEXT_INVALIDATED_MSG = '扩展已更新，请刷新页面后重试';

export function isContextValid(): boolean {
  try {
    return !!browser.runtime?.id;
  } catch {
    return false;
  }
}

/** content / UI 页面 → background */
export async function sendBg<T>(msg: ExtensionRequest): Promise<Response<T>> {
  try {
    return (await browser.runtime.sendMessage(msg)) as Response<T>;
  } catch (e) {
    if (!isContextValid()) return err('INTERNAL', CONTEXT_INVALIDATED_MSG);
    throw e;
  }
}

/** background → 某个 tab 的 content script */
export async function sendTab<T>(tabId: number, msg: ExtensionRequest): Promise<Response<T> | null> {
  try {
    return (await browser.tabs.sendMessage(tabId, msg)) as Response<T>;
  } catch {
    return null; // 页面没有 content script（chrome:// 等）
  }
}

export function err(code: ErrorCode, message: string): { ok: false; error: { code: ErrorCode; message: string } } {
  return { ok: false, error: { code, message } };
}

export function ok<T>(data: T): Response<T> {
  return { ok: true, data };
}
