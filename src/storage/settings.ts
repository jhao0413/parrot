import { z } from 'zod';

export const settingsSchema = z.object({
  general: z.object({
    targetLang: z.string().prefault('zh'),
    sourceLang: z.string().prefault('auto'),
  }).prefault({}),
  provider: z.object({
    active: z.enum(['google', 'microsoft', 'youdaoWeb', 'openai', 'gemini', 'youdao', 'baidu']).prefault('google'),
    configs: z
      .object({
        google: z.object({}).prefault({}),
        microsoft: z.object({}).prefault({}),
        youdaoWeb: z.object({}).prefault({}),
        openai: z
          .object({
            baseUrl: z.string().prefault('https://api.openai.com/v1'),
            apiKey: z.string().prefault(''),
            model: z.string().prefault('gpt-4o-mini'),
            /** 用户自定义补充指令（风格/术语等），追加到 system prompt 末尾 */
            prompt: z.string().prefault(''),
          })
          .prefault({}),
        gemini: z
          .object({
            apiKey: z.string().prefault(''),
            model: z.string().prefault('gemini-2.0-flash'),
            prompt: z.string().prefault(''),
          })
          .prefault({}),
        youdao: z
          .object({
            appKey: z.string().prefault(''),
            appSecret: z.string().prefault(''),
          })
          .prefault({}),
        baidu: z
          .object({
            appId: z.string().prefault(''),
            secret: z.string().prefault(''),
          })
          .prefault({}),
      })
      .prefault({}),
  }).prefault({}),
  tts: z.object({
    accent: z.union([z.literal(1), z.literal(2)]).prefault(2),
  }).prefault({}),
  page: z.object({
    /** 双语对照 / 仅译文 */
    mode: z.enum(['bilingual', 'translationOnly']).prefault('bilingual'),
    showDictOnSelection: z.boolean().prefault(true),
    /** 鼠标悬停段落时按 Shift 翻译该段 */
    shiftTranslate: z.boolean().prefault(true),
  }).prefault({}),
  /** YouTube 字幕翻译：打开播放器字幕（CC）时自动生效 */
  subtitle: z.object({
    enabled: z.boolean().prefault(true),
    mode: z.enum(['bilingual', 'translationOnly']).prefault('bilingual'),
  }).prefault({}),
});

export type Settings = z.infer<typeof settingsSchema>;

const KEY = 'settings';

export async function getSettings(): Promise<Settings> {
  const raw = (await browser.storage.local.get(KEY))[KEY];
  return settingsSchema.parse(raw ?? {});
}

export async function setSettings(settings: Settings): Promise<void> {
  await browser.storage.local.set({ [KEY]: settings });
}

/** 分节局部更新（表单逐字段保存用） */
export type SettingsPatch = { [K in keyof Settings]?: Partial<Settings[K]> };

let queue: Promise<unknown> = Promise.resolve();

/**
 * patch 可传函数：以存储里的最新设置为底计算补丁（嵌套字段如 provider.configs 必须用它，
 * 否则基于旧快照拼出的整份 configs 会把并发保存的其他字段覆盖掉）。
 * 同一页面内的更新串行执行，读-改-写不会交错。
 */
export function updateSettings(patch: SettingsPatch | ((current: Settings) => SettingsPatch)): Promise<Settings> {
  const run = async () => {
    const current = await getSettings();
    const p = typeof patch === 'function' ? patch(current) : patch;
    const next: Record<string, object> = { ...(current as unknown as Record<string, object>) };
    for (const k of Object.keys(p)) {
      const v = (p as Record<string, object | undefined>)[k];
      if (v !== undefined) next[k] = { ...next[k], ...v };
    }
    const merged = settingsSchema.parse(next);
    await setSettings(merged);
    return merged;
  };
  const result = queue.then(run, run);
  queue = result.catch(() => undefined);
  return result;
}

/** 订阅设置变更（content script / background / UI 页面通用） */
export function watchSettings(cb: (s: Settings) => void): void {
  browser.storage.local.onChanged.addListener((changes) => {
    if (changes[KEY]) {
      cb(settingsSchema.parse(changes[KEY].newValue ?? {}));
    }
  });
}
