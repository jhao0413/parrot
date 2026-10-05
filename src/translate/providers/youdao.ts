import { ProviderError, type ProviderCfg, type TranslateProvider, type TranslateRequest, type TranslateResponse } from '../provider';
import { isChineseWord, normalizeLang } from '../lang';
import type { DictEntry } from '@/messaging/protocol';

/**
 * 有道智云文本翻译 API（官方，需 appKey/appSecret）：
 * POST https://openapi.youdao.com/api
 * sign = sha256(appKey + q + salt + curtime + appSecret)，signType=v3
 * 单词查询时返回 basic 词典（音标 + 释义），用于 dictLookup。
 */

export function mapLang(code: string): string {
  const n = normalizeLang(code);
  if (n === 'zh') return 'zh-CHS';
  if (n === 'zh-TW') return 'zh-CHT';
  if (n === 'ja') return 'ja';
  if (n === 'ko') return 'ko';
  if (n === 'fr') return 'fr';
  if (n === 'de') return 'de';
  if (n === 'es') return 'es';
  if (n === 'ru') return 'ru';
  if (n === 'en') return 'en';
  return n;
}

async function sha256Hex(text: string): Promise<string> {
  const buf = await crypto.subtle.digest('SHA-256', new TextEncoder().encode(text));
  return Array.from(new Uint8Array(buf), (b) => b.toString(16).padStart(2, '0')).join('');
}

interface YoudaoResponse {
  errorCode?: string;
  translation?: string[];
  l?: string; // 检测语言对，如 "en2zh-CHS"
  basic?: {
    phonetic?: string;
    explains?: string[];
  };
  msg?: string;
}

async function call(req: { text: string; from: string; to: string }, cfg: ProviderCfg, signal?: AbortSignal): Promise<YoudaoResponse> {
  const appKey = cfg.appKey ?? '';
  const appSecret = cfg.appSecret ?? '';
  const salt = crypto.randomUUID().replace(/-/g, '');
  const curtime = String(Math.floor(Date.now() / 1000));
  const sign = await sha256Hex(appKey + req.text + salt + curtime + appSecret);
  const params = new URLSearchParams({
    q: req.text,
    from: req.from === 'auto' ? 'auto' : mapLang(req.from),
    to: mapLang(req.to),
    appKey,
    salt,
    curtime,
    signType: 'v3',
    sign,
    vocabId: '',
  });
  const res = await fetch('https://openapi.youdao.com/api', {
    method: 'POST',
    headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
    body: params.toString(),
    signal,
  });
  if (!res.ok) throw new ProviderError('NETWORK', `有道 API 请求失败: HTTP ${res.status}`);
  const body = (await res.json()) as YoudaoResponse;
  // https://ai.youdao.com/DOCSIRMA/html/自然语言翻译/API文档/文本翻译服务/文本翻译服务-API文档.html
  const ERRORS: Record<string, string> = {
    '108': '应用 ID 无效',
    '110': '无对应服务的有效实例',
    '111': '开发者账号无效',
    '202': '签名检验失败',
    '401': '账户已欠费',
  };
  if (body.errorCode && body.errorCode !== '0') {
    const msg = ERRORS[body.errorCode] ?? `有道 API 错误码 ${body.errorCode}`;
    const code = ['108', '110', '111', '202'].includes(body.errorCode) ? 'NO_KEY' : 'PROVIDER_ERROR';
    throw new ProviderError(code as 'NO_KEY', msg);
  }
  return body;
}

export const youdaoProvider: TranslateProvider = {
  id: 'youdao',
  name: '有道翻译（官方 API）',
  requiresKey: true,
  async translate(req: TranslateRequest, cfg: ProviderCfg, signal?: AbortSignal): Promise<TranslateResponse> {
    const body = await call({ text: req.text, from: req.from, to: req.to }, cfg, signal);
    const text = body.translation?.[0];
    if (!text) throw new ProviderError('PROVIDER_ERROR', '有道 API 未返回译文');
    const detected = body.l?.split('2')?.[0];
    return { text, detectedFrom: detected ? normalizeLang(detected) : undefined };
  },
  async dictLookup(word: string, cfg: ProviderCfg): Promise<DictEntry | null> {
    // 英文词查中文释义，中文词查英文释义
    const zh = isChineseWord(word);
    const body = await call({ text: word, from: 'auto', to: zh ? 'en' : 'zh' }, cfg);
    const basic = body.basic;
    if (!basic || (!basic.explains?.length && !body.translation?.length)) return null;
    return {
      word,
      lang: zh ? 'zh' : 'en',
      phonetic: basic.phonetic ? (zh ? basic.phonetic : `/${basic.phonetic}/`) : undefined,
      explanations: basic.explains?.slice(0, 8) ?? body.translation?.slice(0, 3) ?? [],
    };
  },
};
