import { ProviderError, type ProviderCfg, type TranslateProvider, type TranslateRequest, type TranslateResponse } from '../provider';
import { normalizeLang } from '../lang';

/**
 * Google 翻译免费网页接口（client=gtx）：
 * GET https://translate.googleapis.com/translate_a/single?client=gtx&sl=<from>&tl=<to>&dt=t&q=<text>
 * 无需 key、无需签名。返回嵌套数组：[[["译文","原文",...],...],..., "<detectedLang>", ...]
 * 拼接每个片段的 [0] 即完整译文。
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

export const googleProvider: TranslateProvider = {
  id: 'google',
  name: 'Google 翻译（免费）',
  requiresKey: false,
  translate: gtxTranslate,
};
