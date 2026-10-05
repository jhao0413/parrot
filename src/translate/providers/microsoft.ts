import { ProviderError, type ProviderCfg, type TranslateProvider, type TranslateRequest, type TranslateResponse } from '../provider';
import { normalizeLang } from '../lang';

/**
 * 微软翻译免费网页接口（Edge 浏览器内置翻译同款）：
 * POST https://edge.microsoft.com/translate/translatetext?from=&to=<lang>&isEnterpriseClient=false
 * body 为字符串数组，响应与 Azure Translator v3 相同；无需 key，也不用 token。
 * （旧的 edge.microsoft.com/translate/auth 取 token 流程已于 2026 年下线，返回 404）
 * 非官方端点，全部隔离在本文件内，失效时只改这里。
 */

const TRANSLATE_URL = 'https://edge.microsoft.com/translate/translatetext';

function mapLang(code: string): string {
  const normalized = normalizeLang(code);
  if (normalized === 'zh-TW') return 'zh-Hant';
  if (normalized === 'zh') return 'zh-Hans';
  return normalized;
}

interface MsResponse {
  detectedLanguage?: { language: string };
  translations: { to: string; text: string }[];
}

async function msRequest(texts: string[], from: string, to: string, signal?: AbortSignal): Promise<TranslateResponse[]> {
  const params = new URLSearchParams({
    from: from === 'auto' ? '' : mapLang(from),
    to: mapLang(to),
    isEnterpriseClient: 'false',
  });
  const res = await fetch(`${TRANSLATE_URL}?${params}`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(texts),
    signal,
  });
  if (res.status === 429) {
    throw new ProviderError('RATE_LIMIT', '微软翻译请求过于频繁');
  }
  if (!res.ok) {
    throw new ProviderError('NETWORK', `微软翻译请求失败: HTTP ${res.status}`);
  }
  const body = (await res.json()) as MsResponse[];
  if (!Array.isArray(body) || body.length !== texts.length) {
    throw new ProviderError('PROVIDER_ERROR', '微软翻译返回格式异常');
  }
  return body.map((r) => {
    const text = r.translations?.[0]?.text;
    if (text === undefined) throw new ProviderError('PROVIDER_ERROR', '微软翻译返回为空');
    return { text, detectedFrom: r.detectedLanguage?.language };
  });
}

/** 单次请求的条数 / 字符上限（同 Azure v3：100 条、5 万字符，留余量） */
const MAX_ITEMS = 50;
const MAX_CHARS = 20_000;

export const microsoftProvider: TranslateProvider = {
  id: 'microsoft',
  name: '微软翻译（免费）',
  requiresKey: false,
  async translate(req: TranslateRequest, _cfg: ProviderCfg, signal?: AbortSignal) {
    return (await msRequest([req.text], req.from, req.to, signal))[0]!;
  },
  async translateBatch(reqs: TranslateRequest[], _cfg: ProviderCfg, signal?: AbortSignal) {
    // 批量场景 reqs 共享同一 from/to（service 层保证）
    const out: TranslateResponse[] = [];
    let start = 0;
    while (start < reqs.length) {
      let end = start;
      let chars = 0;
      while (end < reqs.length && end - start < MAX_ITEMS && (end === start || chars + reqs[end]!.text.length <= MAX_CHARS)) {
        chars += reqs[end]!.text.length;
        end++;
      }
      const chunk = reqs.slice(start, end);
      out.push(...(await msRequest(chunk.map((r) => r.text), reqs[0]!.from, reqs[0]!.to, signal)));
      start = end;
    }
    return out;
  },
};
