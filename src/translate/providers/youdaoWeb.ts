import type { DictEntry } from '@/messaging/protocol';
import { ProviderError, type TranslateProvider, type TranslateRequest, type TranslateResponse } from '../provider';
import { normalizeLang } from '../lang';
import { md5Bytes, md5Hex } from '../md5';
import { mapLang } from './youdao';

/**
 * 有道翻译网页版接口（免 key，非官方）：
 * 1. GET  dict.youdao.com/webtranslate/key 取临时 secretKey / aesKey / aesIv（用内置默认 key 签名）
 * 2. POST dict.youdao.com/webtranslate 翻译，sign = md5("client=..&mysticTime=..&product=..&key=<secretKey>")
 * 3. 响应为 URL-safe base64 的 AES-128-CBC 密文，key/iv 分别为 md5(aesKey) / md5(aesIv)
 * 4. 未命中有道缓存的文本必须同时带 Referer 和 OUTFOX_SEARCH_USER_ID Cookie（"<数字>@<IP>" 格式，随机即可），
 *    否则返回 code 50；Origin 为 chrome-extension:// 时直接 403。
 *    fetch 不能设这些头，用 declarativeNetRequest 会话规则补上（只匹配扩展自身请求）。
 * 有道改版即可能失效，失效时会清掉缓存的 key 重试一次。
 *
 * 查词走词典接口 POST dict.youdao.com/jsonapi_s（jsonversion=4），
 * sign = md5("web" + q + t + DICT_KEY + md5(q + "webdict"))，t = (q + "webdict").length % 10。
 */

const BASE = 'https://dict.youdao.com';
const DEFAULT_KEY = 'asdjnjfenknafdfsdfsd';
const DICT_KEY = 'Mk6hqtUp33DGGtoS63tTJbMUYjRrG1Lu';
const COMMON = {
  client: 'fanyideskweb',
  product: 'webfanyi',
  appVersion: '1.0.0',
  vendor: 'web',
  pointParam: 'client,mysticTime,product',
  keyfrom: 'fanyi.web',
};
/** 单次请求的字符上限（网页版约 5000），批量超出时分多次请求 */
const MAX_CHARS = 4500;

interface WebKey {
  secretKey: string;
  aesKey: string;
  aesIv: string;
}

interface WebResponse {
  code: number;
  type?: string; // 检测语言对，如 "en2zh-CHS"
  translateResult?: { src: string; tgt: string }[][];
}

let keyPromise: Promise<WebKey> | null = null;
let headerRulePromise: Promise<void> | null = null;

const HEADER_RULE_ID = 1001;

/** 给扩展发往 dict.youdao.com 的请求补 Referer + Cookie、改 Origin（tabIds: [-1] 只匹配非标签页发起的请求，不影响用户浏览有道） */
function ensureHeaderRule(): Promise<void> {
  headerRulePromise ??= (async () => {
    const rnd = (n: number) => Math.floor(Math.random() * n);
    const userId = `${rnd(2e9)}@10.${rnd(255)}.${rnd(255)}.${rnd(255)}`;
    await browser.declarativeNetRequest.updateSessionRules({
      removeRuleIds: [HEADER_RULE_ID],
      addRules: [
        {
          id: HEADER_RULE_ID,
          priority: 1,
          action: {
            type: 'modifyHeaders',
            requestHeaders: [
              { header: 'Origin', operation: 'set', value: 'https://fanyi.youdao.com' },
              { header: 'Referer', operation: 'set', value: 'https://fanyi.youdao.com/' },
              { header: 'Cookie', operation: 'set', value: `OUTFOX_SEARCH_USER_ID=${userId}` },
            ],
          },
          condition: { requestDomains: ['dict.youdao.com'], tabIds: [-1], resourceTypes: ['xmlhttprequest'] },
        },
      ],
    });
  })().catch((e: unknown) => {
    headerRulePromise = null;
    throw e;
  });
  return headerRulePromise;
}

async function signed(keyid: string, key: string): Promise<Record<string, string>> {
  const mysticTime = String(Date.now());
  const sign = await md5Hex(`client=${COMMON.client}&mysticTime=${mysticTime}&product=${COMMON.product}&key=${key}`);
  return { ...COMMON, keyid, sign, mysticTime };
}

function getKey(): Promise<WebKey> {
  keyPromise ??= (async () => {
    const params = new URLSearchParams(await signed('webfanyi-key-getter', DEFAULT_KEY));
    const res = await fetch(`${BASE}/webtranslate/key?${params}`);
    if (!res.ok) throw new ProviderError('NETWORK', `有道获取密钥失败: HTTP ${res.status}`);
    const body = (await res.json()) as { code: number; data?: WebKey };
    if (body.code !== 0 || !body.data) throw new ProviderError('PROVIDER_ERROR', `有道获取密钥失败: code ${body.code}`);
    return body.data;
  })().catch((e: unknown) => {
    keyPromise = null;
    throw e;
  });
  return keyPromise;
}

async function decrypt(cipherText: string, key: WebKey): Promise<string> {
  const raw = Uint8Array.from(atob(cipherText.trim().replace(/-/g, '+').replace(/_/g, '/')), (c) => c.charCodeAt(0));
  const aesKey = await crypto.subtle.importKey('raw', new Uint8Array(md5Bytes(new TextEncoder().encode(key.aesKey))), 'AES-CBC', false, ['decrypt']);
  const iv = new Uint8Array(md5Bytes(new TextEncoder().encode(key.aesIv)));
  return new TextDecoder().decode(await crypto.subtle.decrypt({ name: 'AES-CBC', iv }, aesKey, raw));
}

async function request(text: string, from: string, to: string, signal?: AbortSignal): Promise<WebResponse> {
  await ensureHeaderRule();
  const key = await getKey();
  const body = new URLSearchParams({
    ...(await signed('webfanyi', key.secretKey)),
    i: text,
    from: from === 'auto' ? 'auto' : mapLang(from),
    to: mapLang(to),
    dictResult: 'false',
  });
  const res = await fetch(`${BASE}/webtranslate`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
    body: body.toString(),
    signal,
  });
  if (!res.ok) throw new ProviderError('NETWORK', `有道翻译请求失败: HTTP ${res.status}`);
  const data = JSON.parse(await decrypt(await res.text(), key)) as WebResponse;
  if (data.code !== 0 || !data.translateResult) throw new ProviderError('PROVIDER_ERROR', `有道翻译失败: code ${data.code}`);
  return data;
}

/** key 过期或接口变动时清缓存重取一次 */
async function translateText(text: string, from: string, to: string, signal?: AbortSignal): Promise<WebResponse> {
  try {
    return await request(text, from, to, signal);
  } catch (e) {
    if (signal?.aborted) throw e;
    keyPromise = null;
    return request(text, from, to, signal);
  }
}

interface DictResponse {
  /** 汉英：trs 每项是一个英文对应词 + 中文说明 */
  ce?: {
    word?: {
      phone?: string;
      trs?: { '#text'?: string; '#tran'?: string }[];
    };
  };
  ec?: {
    exam_type?: string[];
    word?: {
      usphone?: string;
      ukphone?: string;
      trs?: { pos?: string; tran?: string }[];
      wfs?: { wf?: { name?: string; value?: string } }[];
    };
  };
  web_trans?: { 'web-translation'?: { key?: string; trans?: { value?: string }[] }[] };
}

async function lookupWord(word: string): Promise<DictEntry | null> {
  await ensureHeaderRule();
  const ww = `${word}webdict`;
  const t = String([...ww].length % 10);
  const sign = await md5Hex(`web${word}${t}${DICT_KEY}${await md5Hex(ww)}`);
  const res = await fetch(`${BASE}/jsonapi_s?doctype=json&jsonversion=4`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
    body: new URLSearchParams({ q: word, le: 'en', client: 'web', t, sign, keyfrom: 'webdict' }).toString(),
  });
  if (!res.ok) throw new ProviderError('NETWORK', `有道词典请求失败: HTTP ${res.status}`);
  const data = (await res.json()) as DictResponse;

  const cw = data.ce?.word;
  if (cw?.trs?.length) {
    const equivalents = cw.trs
      .filter((tr) => tr['#text'])
      .slice(0, 8)
      // 说明可能列十几个义项（如 finish），只留前三个
      .map((tr) => ({ word: tr['#text']!, means: (tr['#tran'] ?? '').split('；').filter(Boolean).slice(0, 3).join('；') }));
    if (!equivalents.length) return null;
    return {
      word,
      lang: 'zh',
      phonetic: cw.phone || undefined,
      explanations: equivalents.map((e) => e.word),
      equivalents,
    };
  }

  const w = data.ec?.word;
  if (!w?.trs?.length) return null;

  const phonetics: NonNullable<DictEntry['phonetics']> = [];
  if (w.usphone) phonetics.push({ accent: 'us', value: w.usphone });
  if (w.ukphone) phonetics.push({ accent: 'uk', value: w.ukphone });
  const parts = w.trs.filter((tr) => tr.tran).map((tr) => ({ pos: tr.pos ?? '', means: tr.tran! }));
  return {
    word,
    phonetic: phonetics[0] ? `/${phonetics[0].value}/` : undefined,
    explanations: parts.map((p) => (p.pos ? `${p.pos} ${p.means}` : p.means)),
    phonetics,
    tags: data.ec?.exam_type ?? [],
    parts,
    forms: (w.wfs ?? [])
      .map(({ wf }) => ({ name: wf?.name ?? '', words: (wf?.value ?? '').split('或').filter(Boolean) }))
      .filter((f) => f.name && f.words.length),
    phrases: (data.web_trans?.['web-translation'] ?? [])
      .filter((p) => p.key && p.key.toLowerCase() !== word.toLowerCase())
      .slice(0, 3)
      .map((p) => ({ text: p.key!, means: (p.trans ?? []).map((t) => t.value ?? '').filter(Boolean).slice(0, 3) }))
      .filter((p) => p.means.length),
  };
}

function detected(data: WebResponse): string | undefined {
  const src = data.type?.split('2')[0];
  return src ? normalizeLang(src) : undefined;
}

export const youdaoWebProvider: TranslateProvider = {
  id: 'youdaoWeb',
  name: '有道翻译（免费）',
  requiresKey: false,
  async translate(req: TranslateRequest, _cfg, signal): Promise<TranslateResponse> {
    const data = await translateText(req.text, req.from, req.to, signal);
    // translateResult 按输入行分组，每组内是若干句
    const text = data.translateResult!.map((line) => line.map((s) => s.tgt).join('')).join('');
    return { text: text.replace(/\n$/, ''), detectedFrom: detected(data) };
  },
  /** 多段按行拼成一次请求（段内换行先折成空格），按返回的行分组对回各段 */
  async translateBatch(reqs: TranslateRequest[], _cfg, signal): Promise<TranslateResponse[]> {
    const lines = reqs.map((r) => r.text.replace(/\s*\n\s*/g, ' ').trim());
    const out: TranslateResponse[] = [];
    for (let start = 0; start < lines.length; ) {
      let end = start;
      let chars = 0;
      while (end < lines.length && (end === start || chars + lines[end]!.length + 1 <= MAX_CHARS)) chars += lines[end++]!.length + 1;
      const data = await translateText(lines.slice(start, end).join('\n'), reqs[0]!.from, reqs[0]!.to, signal);
      const groups = data.translateResult!;
      if (groups.length !== end - start) throw new ProviderError('PROVIDER_ERROR', '有道批量结果条数不匹配');
      for (const g of groups) out.push({ text: g.map((s) => s.tgt).join('').replace(/\n$/, ''), detectedFrom: detected(data) });
      start = end;
    }
    return out;
  },
  dictLookup: (word) => lookupWord(word),
};
