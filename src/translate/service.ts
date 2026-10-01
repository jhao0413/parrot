import type { BatchTranslateData, DictEntry, SingleTranslateResult, TranslateItemResult } from '@/messaging/protocol';
import { getSettings, type Settings } from '@/storage/settings';
import { cacheGet, cacheKey, cacheSet } from './cache';
import { ProviderError, getProvider } from './provider';

/** 简单并发限制器（每 provider 同时最多 N 个请求在飞） */
function createLimiter(limit: number) {
  let active = 0;
  const queue: (() => void)[] = [];
  return async function run<T>(fn: () => Promise<T>): Promise<T> {
    if (active >= limit) {
      await new Promise<void>((resolve) => queue.push(resolve));
    }
    active++;
    try {
      return await fn();
    } finally {
      active--;
      queue.shift()?.();
    }
  };
}

const limitters = new Map<string, ReturnType<typeof createLimiter>>();
function limiterFor(providerId: string) {
  let l = limitters.get(providerId);
  if (!l) {
    // 微软免费接口给低并发，官方 API 更保守
    const limit = providerId === 'microsoft' ? 4 : 2;
    l = createLimiter(limit);
    limitters.set(providerId, l);
  }
  return l;
}

async function resolveProvider(settings: Settings) {
  const provider = getProvider(settings.provider.active);
  if (!provider) throw new ProviderError('PROVIDER_ERROR', `未知翻译服务: ${settings.provider.active}`);
  const cfg = settings.provider.configs[provider.id] as Record<string, string>;
  if (provider.requiresKey && Object.values(cfg).some((v) => !v)) {
    throw new ProviderError('NO_KEY', `${provider.name} 未配置 API Key，请在设置页填写`);
  }
  return { provider, cfg };
}

/** 单段翻译（带缓存） */
async function translateOneCached(
  providerId: string,
  cfg: Record<string, string>,
  provider: NonNullable<ReturnType<typeof getProvider>>,
  text: string,
  from: string,
  to: string,
): Promise<string> {
  const key = await cacheKey(providerId, from, to, text);
  const hit = await cacheGet(key);
  if (hit !== undefined) return hit;
  const run = limiterFor(providerId);
  const result = await run(() => provider.translate({ text, from, to }, cfg));
  await cacheSet(key, result.text);
  return result.text;
}

/** 批量翻译：缓存命中 → provider 原生批量（若有）→ 并发逐条。单条失败不整批报错 */
export async function translateBatch(
  items: { id: string; text: string }[],
  from: string,
  to: string,
): Promise<BatchTranslateData> {
  const settings = await getSettings();
  const { provider, cfg } = await resolveProvider(settings);

  // 去重：同文本只翻一次，结果回填到所有相同 id
  const uniqueTexts = [...new Set(items.map((i) => i.text))];
  const textToResult = new Map<string, string>();
  const failedIds: string[] = [];
  const results: TranslateItemResult[] = [];

  // 先走缓存
  const uncached: string[] = [];
  for (const text of uniqueTexts) {
    const key = await cacheKey(provider.id, from, to, text);
    const hit = await cacheGet(key);
    if (hit !== undefined) textToResult.set(text, hit);
    else uncached.push(text);
  }

  // provider 原生批量（LLM 一次 prompt 翻多条）
  if (provider.translateBatch && uncached.length > 0) {
    try {
      const batchResult = await provider.translateBatch(
        uncached.map((text) => ({ text, from, to })),
        cfg,
      );
      if (batchResult.length !== uncached.length) {
        throw new ProviderError('PROVIDER_ERROR', '批量结果条数不匹配');
      }
      for (let i = 0; i < uncached.length; i++) {
        const key = await cacheKey(provider.id, from, to, uncached[i]!);
        await cacheSet(key, batchResult[i]!.text);
        textToResult.set(uncached[i]!, batchResult[i]!.text);
      }
      uncached.length = 0;
    } catch {
      // 批量失败回退逐条
    }
  }

  await Promise.all(
    uncached.map(async (text) => {
      try {
        textToResult.set(text, await translateOneCached(provider.id, cfg, provider, text, from, to));
      } catch {
        // 单条失败：对应 id 进 failedIds
      }
    }),
  );

  for (const item of items) {
    const text = textToResult.get(item.text);
    if (text === undefined) {
      failedIds.push(item.id);
    } else {
      results.push({ id: item.id, text });
    }
  }
  return { results, failedIds };
}

/** 单条翻译（划词 / 工作台），可选词典 */
export async function translateSingle(
  text: string,
  from: string,
  to: string,
  wantDict: boolean,
): Promise<SingleTranslateResult> {
  const settings = await getSettings();
  const { provider, cfg } = await resolveProvider(settings);

  let dict: DictEntry | undefined;
  const trimmed = text.trim();
  const isWord = /^[a-zA-Z][\w'-]*( [\w'-]+){0,3}$/.test(trimmed);
  if (wantDict && isWord && provider.dictLookup) {
    try {
      dict = (await provider.dictLookup(trimmed, cfg, to)) ?? undefined;
    } catch {
      // 词典失败不阻塞翻译
    }
  }

  const translated = await translateOneCached(provider.id, cfg, provider, text, from, to);
  return { text: translated, dict };
}
