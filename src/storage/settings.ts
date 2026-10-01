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

export async function updateSettings(patch: SettingsPatch): Promise<Settings> {
  const current = await getSettings();
  const next: Record<string, object> = { ...(current as unknown as Record<string, object>) };
  for (const k of Object.keys(patch)) {
    const p = (patch as Record<string, object | undefined>)[k];
    if (p !== undefined) next[k] = { ...next[k], ...p };
  }
  const merged = settingsSchema.parse(next);
  await setSettings(merged);
  return merged;
}

/** 订阅设置变更（content script / background / UI 页面通用） */
export function watchSettings(cb: (s: Settings) => void): void {
  browser.storage.local.onChanged.addListener((changes) => {
    if (changes[KEY]) {
      cb(settingsSchema.parse(changes[KEY].newValue ?? {}));
    }
  });
}
