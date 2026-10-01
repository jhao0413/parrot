import { ProviderError, type ProviderCfg, type TranslateProvider, type TranslateRequest, type TranslateResponse } from '../provider';
import { stripReasoning, systemPrompt } from './openai';

/** Google Gemini API（generateContent），批量同 OpenAI 的编号行协议 */

interface GeminiResponse {
  candidates?: { content?: { parts?: { text?: string }[] } }[];
}

async function generate(cfg: ProviderCfg, system: string, user: string, signal?: AbortSignal): Promise<string> {
  const model = cfg.model || 'gemini-2.0-flash';
  const res = await fetch(
    `https://generativelanguage.googleapis.com/v1beta/models/${encodeURIComponent(model)}:generateContent?key=${encodeURIComponent(cfg.apiKey ?? '')}`,
    {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        systemInstruction: { parts: [{ text: system }] },
        contents: [{ role: 'user', parts: [{ text: user }] }],
        generationConfig: { temperature: 0 },
      }),
      signal,
    },
  );
  if (res.status === 401 || res.status === 403) throw new ProviderError('NO_KEY', 'Gemini API Key 无效');
  if (res.status === 429) throw new ProviderError('RATE_LIMIT', 'Gemini 请求过于频繁（可能超出配额）');
  if (!res.ok) throw new ProviderError('PROVIDER_ERROR', `Gemini 请求失败: HTTP ${res.status}: ${(await res.text()).slice(0, 200)}`);
  const body = (await res.json()) as GeminiResponse;
  const text = body.candidates?.[0]?.content?.parts?.map((p) => p.text ?? '').join('');
  if (!text) throw new ProviderError('PROVIDER_ERROR', 'Gemini 返回为空');
  return stripReasoning(text);
}

function parseNumbered(output: string, count: number): string[] | null {
  const map = new Map<number, string>();
  for (const line of output.split('\n').filter((l) => l.trim().length > 0)) {
    const m = line.match(/^\s*(\d+)\s*\|\s?(.*)$/);
    if (!m) return null;
    map.set(Number(m[1]), m[2] ?? '');
  }
  const result: string[] = [];
  for (let i = 1; i <= count; i++) {
    const v = map.get(i);
    if (v === undefined) return null;
    result.push(v);
  }
  return result;
}

export const geminiProvider: TranslateProvider = {
  id: 'gemini',
  name: 'Gemini',
  requiresKey: true,
  async translate(req, cfg, signal) {
    const content = await generate(cfg, systemPrompt(req.to, cfg.prompt), `1|${req.text}`, signal);
    return { text: parseNumbered(content, 1)?.[0] ?? content.trim() };
  },
  async translateBatch(reqs, cfg, signal) {
    const input = reqs.map((r, i) => `${i + 1}|${r.text.replace(/\n/g, '\\n')}`).join('\n');
    const content = await generate(cfg, systemPrompt(reqs[0]!.to, cfg.prompt), input, signal);
    const parsed = parseNumbered(content, reqs.length);
    if (!parsed) throw new ProviderError('PROVIDER_ERROR', 'Gemini 批量输出格式不匹配');
    return parsed.map((text) => ({ text: text.replace(/\\n/g, '\n') }));
  },
};
