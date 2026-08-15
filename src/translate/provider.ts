import type { DictEntry } from '@/messaging/protocol';

/** provider 配置统一按字符串键值取用（各 provider 内部自行取字段） */
export type ProviderCfg = Record<string, string>;

export interface TranslateRequest {
  /** 单段纯文本，可含 \n */
  text: string;
  from: string | 'auto';
  to: string;
}

export interface TranslateResponse {
  text: string;
  detectedFrom?: string;
}

export class ProviderError extends Error {
  constructor(
    public code: 'PROVIDER_ERROR' | 'RATE_LIMIT' | 'NO_KEY' | 'NETWORK',
    message: string,
  ) {
    super(message);
  }
}

export interface TranslateProvider {
  id: 'google' | 'microsoft' | 'openai' | 'gemini' | 'youdao' | 'baidu';
  name: string;
  requiresKey: boolean;
  /** 单条翻译（必须实现）。service 层负责批量与并发 */
  translate(req: TranslateRequest, cfg: ProviderCfg, signal?: AbortSignal): Promise<TranslateResponse>;
  /** 原生批量翻译（可选）。LLM 用一次 prompt 翻多条 */
  translateBatch?(reqs: TranslateRequest[], cfg: ProviderCfg, signal?: AbortSignal): Promise<TranslateResponse[]>;
  /** 词典查询（可选），划词时单词优先走词典 */
  dictLookup?(word: string, cfg: ProviderCfg): Promise<DictEntry | null>;
}

import { googleProvider } from './providers/google';
import { microsoftProvider } from './providers/microsoft';
import { openaiProvider } from './providers/openai';
import { geminiProvider } from './providers/gemini';
import { youdaoProvider } from './providers/youdao';
import { baiduProvider } from './providers/baidu';

const registry: Record<string, TranslateProvider> = {
  google: googleProvider,
  microsoft: microsoftProvider,
  openai: openaiProvider,
  gemini: geminiProvider,
  youdao: youdaoProvider,
  baidu: baiduProvider,
};

export function getProvider(id: string): TranslateProvider | undefined {
  return registry[id];
}
