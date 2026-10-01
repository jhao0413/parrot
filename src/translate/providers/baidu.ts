import { ProviderError, type ProviderCfg, type TranslateProvider, type TranslateRequest, type TranslateResponse } from '../provider';
import { normalizeLang } from '../lang';
import { md5Hex } from '../md5';

/**
 * 百度翻译开放平台 API（官方，需 APPID/密钥）：
 * GET https://fanyi-api.baidu.com/api/trans/vip/translate?q=&from=&to=&appid=&salt=&sign=
 * sign = md5(appid + q + salt + 密钥)，标准 QPS 1（service 层并发限制已保守）
 */

function mapLang(code: string): string {
  const n = normalizeLang(code);
  const map: Record<string, string> = {
    zh: 'zh',
    'zh-TW': 'cht',
    en: 'en',
    ja: 'jp',
    ko: 'kor',
    fr: 'fra',
    de: 'de',
    es: 'spa',
    ru: 'ru',
  };
  return map[n] ?? n;
}

interface BaiduResponse {
  trans_result?: { src: string; dst: string }[];
  error_code?: string;
  error_msg?: string;
  from?: string;
}

export const baiduProvider: TranslateProvider = {
  id: 'baidu',
  name: '百度翻译（官方 API）',
  requiresKey: true,
  async translate(req: TranslateRequest, cfg: ProviderCfg, signal?: AbortSignal): Promise<TranslateResponse> {
    const salt = crypto.randomUUID().replace(/-/g, '');
    const sign = await md5Hex(`${cfg.appId ?? ''}${req.text}${salt}${cfg.secret ?? ''}`);
    const params = new URLSearchParams({
      q: req.text,
      from: req.from === 'auto' ? 'auto' : mapLang(req.from),
      to: mapLang(req.to),
      appid: cfg.appId ?? '',
      salt,
      sign,
    });
    const res = await fetch(`https://fanyi-api.baidu.com/api/trans/vip/translate?${params}`, { signal });
    if (!res.ok) throw new ProviderError('NETWORK', `百度 API 请求失败: HTTP ${res.status}`);
    const body = (await res.json()) as BaiduResponse;
    if (body.error_code) {
      const code = body.error_code === '52001' || body.error_code === '54003' ? 'RATE_LIMIT' : 'NO_KEY';
      throw new ProviderError(code, `百度 API 错误 ${body.error_code}: ${body.error_msg ?? ''}`);
    }
    const text = body.trans_result?.map((t) => t.dst).join('\n');
    if (!text) throw new ProviderError('PROVIDER_ERROR', '百度 API 未返回译文');
    return { text, detectedFrom: body.from ? normalizeLang(body.from) : undefined };
  },
};
