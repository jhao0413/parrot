import { ProviderError, type ProviderCfg, type TranslateProvider, type TranslateRequest, type TranslateResponse } from '../provider';
import { normalizeLang } from '../lang';

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

async function md5Hex(text: string): Promise<string> {
  // service worker 的 crypto.subtle 不支持 MD5，手写简易实现
  const bytes = new TextEncoder().encode(text);
  return binlToHex(md5Bytes(bytes));
}

function md5Bytes(bytes: Uint8Array): number[] {
  // 常量
  const S = [
    7, 12, 17, 22, 7, 12, 17, 22, 7, 12, 17, 22, 7, 12, 17, 22,
    5, 9, 14, 20, 5, 9, 14, 20, 5, 9, 14, 20, 5, 9, 14, 20,
    4, 11, 16, 23, 4, 11, 16, 23, 4, 11, 16, 23, 4, 11, 16, 23,
    6, 10, 15, 21, 6, 10, 15, 21, 6, 10, 15, 21, 6, 10, 15, 21,
  ];
  const K = new Uint32Array(64).map((_, i) => Math.floor(Math.abs(Math.sin(i + 1)) * 2 ** 32));
  // padding
  const bitLen = bytes.length * 8;
  const padded = new Uint8Array((((bytes.length + 8) >> 6) + 1) * 64);
  padded.set(bytes);
  padded[bytes.length] = 0x80;
  const dv = new DataView(padded.buffer);
  dv.setUint32(padded.length - 8, bitLen >>> 0, true);
  dv.setUint32(padded.length - 4, Math.floor(bitLen / 2 ** 32), true);

  let a0 = 0x67452301, b0 = 0xefcdab89, c0 = 0x98badcfe, d0 = 0x10325476;
  const rl = (x: number, c: number) => (x << c) | (x >>> (32 - c));
  for (let chunk = 0; chunk < padded.length; chunk += 64) {
    const M = new Uint32Array(16);
    for (let i = 0; i < 16; i++) M[i] = dv.getUint32(chunk + i * 4, true);
    let A = a0, B = b0, C = c0, D = d0;
    for (let i = 0; i < 64; i++) {
      let F: number, g: number;
      if (i < 16) { F = (B & C) | (~B & D); g = i; }
      else if (i < 32) { F = (D & B) | (~D & C); g = (5 * i + 1) % 16; }
      else if (i < 48) { F = B ^ C ^ D; g = (3 * i + 5) % 16; }
      else { F = C ^ (B | ~D); g = (7 * i) % 16; }
      F = (F + A + K[i]! + M[g]!) >>> 0;
      A = D; D = C; C = B;
      B = (B + rl(F, S[i]!)) >>> 0;
    }
    a0 = (a0 + A) >>> 0; b0 = (b0 + B) >>> 0; c0 = (c0 + C) >>> 0; d0 = (d0 + D) >>> 0;
  }
  return [a0, b0, c0, d0].flatMap((w) => [w & 0xff, (w >>> 8) & 0xff, (w >>> 16) & 0xff, (w >>> 24) & 0xff]);
}

function binlToHex(bytes: number[]): string {
  return bytes.map((b) => b.toString(16).padStart(2, '0')).join('');
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
