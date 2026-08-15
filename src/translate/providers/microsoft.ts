import { ProviderError, type ProviderCfg, type TranslateProvider, type TranslateRequest, type TranslateResponse } from '../provider';
import { normalizeLang } from '../lang';

/**
 * 微软翻译免费网页接口（Edge 浏览器内置翻译同款）：
 * 1. GET https://edge.microsoft.com/translate/auth 拿匿名 JWT（约 10 分钟有效）
 * 2. POST https://api.cognitive.microsofttranslator.com/translate?to=<lang>&api-version=3.0
 *    Authorization: Bearer <jwt>，body 为 [{ Text }]
 * 无需 key。非官方端点，全部隔离在本文件内，失效时只改这里。
 */

const AUTH_URL = 'https://edge.microsoft.com/translate/auth';
const TRANSLATE_URL = 'https://api.cognitive.microsofttranslator.com/translate';

let cachedToken: { token: string; expiresAt: number } | null = null;

async function getToken(): Promise<string> {
  if (cachedToken && cachedToken.expiresAt > Date.now() + 60_000) {
    return cachedToken.token;
  }
  const res = await fetch(AUTH_URL);
  if (!res.ok) {
    throw new ProviderError('NETWORK', `获取微软翻译 token 失败: HTTP ${res.status}`);
  }
  const token = await res.text();
  // JWT payload 里的 exp（秒）
  try {
    const payload = JSON.parse(atob(token.split('.')[1]!.replace(/-/g, '+').replace(/_/g, '/')));
    cachedToken = { token, expiresAt: payload.exp * 1000 };
  } catch {
    // 解析失败就按 5 分钟算
    cachedToken = { token, expiresAt: Date.now() + 5 * 60_000 };
  }
  return token;
}

function mapLang(code: string): string {
  const normalized = normalizeLang(code);
  if (normalized === 'zh-TW') return 'zh-Hant';
  if (normalized === 'zh') return 'zh-Hans';
  return normalized;
}

interface MsResponse {
  detectedLanguage?: { language: string };
  translations: { to: string; text: string }[];
  errorMessage?: string;
}

async function msTranslate(
  req: TranslateRequest,
  _cfg: ProviderCfg,
  signal?: AbortSignal,
): Promise<TranslateResponse> {
  const token = await getToken();
  const params = new URLSearchParams({ 'api-version': '3.0', to: mapLang(req.to) });
  if (req.from !== 'auto') params.set('from', mapLang(req.from));
  const res = await fetch(`${TRANSLATE_URL}?${params}`, {
    method: 'POST',
    headers: {
      Authorization: `Bearer ${token}`,
      'Content-Type': 'application/json',
    },
    body: JSON.stringify([{ Text: req.text }]),
    signal,
  });
  if (res.status === 401 || res.status === 403) {
    cachedToken = null; // token 失效，下次重取
    throw new ProviderError('PROVIDER_ERROR', '微软翻译 token 失效，请重试');
  }
  if (res.status === 429) {
    throw new ProviderError('RATE_LIMIT', '微软翻译请求过于频繁');
  }
  if (!res.ok) {
    throw new ProviderError('NETWORK', `微软翻译请求失败: HTTP ${res.status}`);
  }
  const body = (await res.json()) as MsResponse[];
  const first = body[0];
  if (!first || first.errorMessage) {
    throw new ProviderError('PROVIDER_ERROR', first?.errorMessage ?? '微软翻译返回为空');
  }
  return {
    text: first.translations[0]!.text,
    detectedFrom: first.detectedLanguage?.language,
  };
}

export const microsoftProvider: TranslateProvider = {
  id: 'microsoft',
  name: '微软翻译（免费）',
  requiresKey: false,
  translate: msTranslate,
};
