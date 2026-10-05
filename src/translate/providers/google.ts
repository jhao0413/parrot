import type { DictEntry } from '@/messaging/protocol';
import { ProviderError, type ProviderCfg, type TranslateProvider, type TranslateRequest, type TranslateResponse } from '../provider';
import { isChineseWord, normalizeLang } from '../lang';

/**
 * Google 翻译免费网页接口（client=gtx）：
 * GET https://translate.googleapis.com/translate_a/single?client=gtx&sl=<from>&tl=<to>&dt=t&q=<text>
 * 无需 key、无需签名。返回嵌套数组：[[["译文","原文",...],...],..., "<detectedLang>", ...]
 * 拼接每个片段的 [0] 即完整译文。
 *
 * 查词：同一接口加 dt=bd（按词性的译法）/ rm（音标）/ md（英文释义）/ ex（释义例句），hl 决定词性名语言。
 */

function mapLang(code: string): string {
  const normalized = normalizeLang(code);
  if (normalized === 'zh') return 'zh-CN';
  if (normalized === 'zh-TW') return 'zh-TW';
  return normalized;
}

interface GtxResponse {
  0: { 0: string; 1?: string }[][];
  2?: string; // 检测到的源语言
}

async function gtxTranslate(
  req: TranslateRequest,
  _cfg: ProviderCfg,
  signal?: AbortSignal,
): Promise<TranslateResponse> {
  const params = new URLSearchParams({
    client: 'gtx',
    sl: req.from === 'auto' ? 'auto' : mapLang(req.from),
    tl: mapLang(req.to),
    dt: 't',
    q: req.text,
  });
  // 用 POST 避免 GET URL 长度限制（gtx 对表单 POST 行为一致）
  const res = await fetch('https://translate.googleapis.com/translate_a/single', {
    method: 'POST',
    headers: { 'Content-Type': 'application/x-www-form-urlencoded;charset=UTF-8' },
    body: params.toString(),
    signal,
  });
  if (res.status === 429) throw new ProviderError('RATE_LIMIT', 'Google 翻译请求过于频繁，请稍后重试');
  if (!res.ok) throw new ProviderError('NETWORK', `Google 翻译请求失败: HTTP ${res.status}`);
  const body = (await res.json()) as unknown as GtxResponse;
  const segments = body?.[0];
  if (!Array.isArray(segments)) throw new ProviderError('PROVIDER_ERROR', 'Google 翻译返回格式异常');
  const text = segments.map((seg) => seg?.[0] ?? '').join('');
  return { text, detectedFrom: body[2] ? normalizeLang(body[2]) : undefined };
}

/**
 * 批量：多条用换行拼成一次请求（gtx 原样保留换行），再按行拆回。
 * 字幕一批几十句，逐条请求很快会被 Google 限流（302 跳验证页 / 429）。
 * 行数对不上（个别文本被合并/拆行）就抛错，由 service 回退逐条翻译。
 */
async function gtxTranslateBatch(
  reqs: TranslateRequest[],
  cfg: ProviderCfg,
  signal?: AbortSignal,
): Promise<TranslateResponse[]> {
  const first = reqs[0];
  if (!first) return [];
  if (reqs.some((r) => r.text.includes('\n') || r.from !== first.from || r.to !== first.to)) {
    throw new ProviderError('PROVIDER_ERROR', '批量请求含换行或语言不一致');
  }
  const res = await gtxTranslate({ ...first, text: reqs.map((r) => r.text).join('\n') }, cfg, signal);
  const lines = res.text.split('\n');
  if (lines.length !== reqs.length) throw new ProviderError('PROVIDER_ERROR', '批量结果行数不匹配');
  return lines.map((text) => ({ text: text.trim(), detectedFrom: res.detectedFrom }));
}

/** dt=bd 每项：[词性名, 译法列表, ...]；dt=md 每项：[词性名, [[释义, id, 例句?], ...], ...] */
type GtxDictBody = [
  (string | null)[][] | null, // [0] 片段；末项 [null, null, 原文拼音, 原文音标]
  [string, string[]][] | null, // [1] bd
  ...unknown[],
];

async function gtxDictLookup(word: string, _cfg: ProviderCfg, to: string): Promise<DictEntry | null> {
  const params = new URLSearchParams({ client: 'gtx', sl: 'auto', tl: mapLang(to), hl: mapLang(to), q: word });
  for (const dt of ['t', 'bd', 'rm', 'md', 'ex']) params.append('dt', dt); // md 的例句需要 ex 才返回
  const res = await fetch('https://translate.googleapis.com/translate_a/single', {
    method: 'POST',
    headers: { 'Content-Type': 'application/x-www-form-urlencoded;charset=UTF-8' },
    body: params.toString(),
  });
  if (!res.ok) throw new ProviderError('NETWORK', `Google 词典请求失败: HTTP ${res.status}`);
  const body = (await res.json()) as GtxDictBody;
  const md = (body[12] ?? []) as [string, [string, string, string?][]][];

  const parts = (body[1] ?? [])
    .filter(([pos, terms]) => pos && terms?.length)
    .map(([pos, terms]) => ({ pos, means: terms.slice(0, 8).join('；') }));
  const definitions = md
    .filter(([pos, items]) => pos && items?.length)
    .slice(0, 3)
    .map(([pos, items]) => ({
      pos,
      items: items.slice(0, 2).map(([text, , example]) => ({ text, example: example || undefined })),
    }));
  if (!parts.length && !definitions.length) return null;

  const phonetic = body[0]?.find((seg) => typeof seg?.[3] === 'string')?.[3] as string | undefined;
  const zh = isChineseWord(word); // 中文词的音标位是拼音，不加 /…/
  return {
    word,
    lang: zh ? 'zh' : 'en',
    phonetic: phonetic ? (zh ? phonetic : `/${phonetic}/`) : undefined,
    explanations: parts.map((p) => `${p.pos} ${p.means}`),
    parts,
    definitions,
  };
}

export const googleProvider: TranslateProvider = {
  id: 'google',
  name: 'Google 翻译（免费）',
  requiresKey: false,
  translate: gtxTranslate,
  translateBatch: gtxTranslateBatch,
  dictLookup: gtxDictLookup,
};
