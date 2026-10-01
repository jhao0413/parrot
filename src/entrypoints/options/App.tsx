import { useEffect, useState } from 'react';
import { sendBg, type Response, type SingleTranslateResult } from '@/messaging/protocol';
import { getSettings, updateSettings, type Settings } from '@/storage/settings';
import { LangSelect } from '@/ui/LangSelect';

export default function App() {
  const [settings, setSettings] = useState<Settings | null>(null);
  const [saved, setSaved] = useState(false);

  useEffect(() => {
    void getSettings().then(setSettings);
  }, []);

  if (!settings) return <div className="p-8 text-gray-400">加载中…</div>;

  const patch = async (p: Parameters<typeof updateSettings>[0]) => {
    const next = await updateSettings(p);
    setSettings(next);
    setSaved(true);
    setTimeout(() => setSaved(false), 1500);
  };

  const testProvider = async () => {
    const res: Response<SingleTranslateResult> = await sendBg({
      type: 'translate/single',
      text: 'Hello world',
      from: 'auto',
      to: 'zh',
      wantDict: false,
    });
    alert(res.ok ? `连接成功：${res.data.text}` : `失败：${res.error.message}`);
  };

  const cfg = settings.provider.configs;

  return (
    <div className="mx-auto max-w-2xl space-y-6 p-8">
      <h1 className="text-lg font-semibold text-gray-900">🦜 Parrot 设置 {saved && <span className="text-xs font-normal text-emerald-600">已保存</span>}</h1>

      <section className="space-y-3 rounded-xl bg-white p-5 shadow-sm">
        <h2 className="text-sm font-medium text-gray-700">通用</h2>
        <div className="flex items-center justify-between text-sm">
          <span className="text-gray-500">目标语言</span>
          <LangSelect value={settings.general.targetLang} onChange={(v) => void patch({ general: { targetLang: v } })} />
        </div>
        <div className="flex items-center justify-between text-sm">
          <span className="text-gray-500">源语言</span>
          <LangSelect
            value={settings.general.sourceLang}
            includeAuto
            onChange={(v) => void patch({ general: { sourceLang: v } })}
          />
        </div>
        <div className="flex items-center justify-between text-sm">
          <span className="text-gray-500">发音口音（有道）</span>
          <div className="flex overflow-hidden rounded-md border border-gray-200 text-xs">
            <button
              type="button"
              className={`px-2 py-1 ${settings.tts.accent === 1 ? 'bg-blue-600 text-white' : 'bg-white text-gray-600'}`}
              onClick={() => void patch({ tts: { accent: 1 } })}
            >
              英音
            </button>
            <button
              type="button"
              className={`px-2 py-1 ${settings.tts.accent === 2 ? 'bg-blue-600 text-white' : 'bg-white text-gray-600'}`}
              onClick={() => void patch({ tts: { accent: 2 } })}
            >
              美音
            </button>
          </div>
        </div>
      </section>

      <section className="space-y-3 rounded-xl bg-white p-5 shadow-sm">
        <h2 className="text-sm font-medium text-gray-700">页面翻译</h2>
        <div className="flex items-center justify-between text-sm">
          <span className="text-gray-500">鼠标悬停段落时按 Shift 翻译该段</span>
          <div className="flex overflow-hidden rounded-md border border-gray-200 text-xs">
            <button
              type="button"
              className={`px-2 py-1 ${settings.page.shiftTranslate ? 'bg-blue-600 text-white' : 'bg-white text-gray-600'}`}
              onClick={() => void patch({ page: { shiftTranslate: true } })}
            >
              开
            </button>
            <button
              type="button"
              className={`px-2 py-1 ${!settings.page.shiftTranslate ? 'bg-blue-600 text-white' : 'bg-white text-gray-600'}`}
              onClick={() => void patch({ page: { shiftTranslate: false } })}
            >
              关
            </button>
          </div>
        </div>
      </section>

      <section className="space-y-3 rounded-xl bg-white p-5 shadow-sm">
        <div className="flex items-center justify-between">
          <h2 className="text-sm font-medium text-gray-700">翻译服务</h2>
          <button type="button" onClick={() => void testProvider()} className="rounded-md border border-gray-200 px-2 py-1 text-xs text-gray-600 hover:bg-gray-50">
            测试连接
          </button>
        </div>
        <div className="flex gap-2 text-xs">
          {(
            [
              ['google', 'Google（免费）'],
              ['microsoft', '微软（免费）'],
              ['openai', 'OpenAI 兼容'],
              ['gemini', 'Gemini'],
              ['youdao', '有道'],
              ['baidu', '百度'],
            ] as const
          ).map(([id, name]) => (
            <button
              key={id}
              type="button"
              className={`rounded-full px-3 py-1 ${
                settings.provider.active === id ? 'bg-blue-600 text-white' : 'bg-gray-100 text-gray-600'
              }`}
              onClick={() => void patch({ provider: { active: id } })}
            >
              {name}
            </button>
          ))}
        </div>

        {settings.provider.active === 'openai' && (
          <div className="space-y-2 text-sm">
            <input
              className="w-full rounded-md border border-gray-200 px-2 py-1.5"
              placeholder="Base URL（默认 OpenAI，可填 DeepSeek 等）"
              value={cfg.openai.baseUrl}
              onChange={(e) => void patch({ provider: { configs: { ...cfg, openai: { ...cfg.openai, baseUrl: e.target.value } } } })}
            />
            <input
              className="w-full rounded-md border border-gray-200 px-2 py-1.5"
              placeholder="API Key"
              type="password"
              value={cfg.openai.apiKey}
              onChange={(e) => void patch({ provider: { configs: { ...cfg, openai: { ...cfg.openai, apiKey: e.target.value } } } })}
            />
            <input
              className="w-full rounded-md border border-gray-200 px-2 py-1.5"
              placeholder="模型（如 gpt-4o-mini / deepseek-chat）"
              value={cfg.openai.model}
              onChange={(e) => void patch({ provider: { configs: { ...cfg, openai: { ...cfg.openai, model: e.target.value } } } })}
            />
            <textarea
              className="min-h-16 w-full rounded-md border border-gray-200 px-2 py-1.5"
              placeholder="自定义 Prompt（可选，如：保留敬语、术语表、口语化风格…只影响译文风格，不改变输出格式）"
              value={cfg.openai.prompt}
              onChange={(e) => void patch({ provider: { configs: { ...cfg, openai: { ...cfg.openai, prompt: e.target.value } } } })}
            />
          </div>
        )}

        {settings.provider.active === 'gemini' && (
          <div className="space-y-2 text-sm">
            <input
              className="w-full rounded-md border border-gray-200 px-2 py-1.5"
              placeholder="Gemini API Key"
              type="password"
              value={cfg.gemini.apiKey}
              onChange={(e) => void patch({ provider: { configs: { ...cfg, gemini: { ...cfg.gemini, apiKey: e.target.value } } } })}
            />
            <input
              className="w-full rounded-md border border-gray-200 px-2 py-1.5"
              placeholder="模型（如 gemini-2.0-flash）"
              value={cfg.gemini.model}
              onChange={(e) => void patch({ provider: { configs: { ...cfg, gemini: { ...cfg.gemini, model: e.target.value } } } })}
            />
            <textarea
              className="min-h-16 w-full rounded-md border border-gray-200 px-2 py-1.5"
              placeholder="自定义 Prompt（可选，只影响译文风格，不改变输出格式）"
              value={cfg.gemini.prompt}
              onChange={(e) => void patch({ provider: { configs: { ...cfg, gemini: { ...cfg.gemini, prompt: e.target.value } } } })}
            />
          </div>
        )}

        {settings.provider.active === 'youdao' && (
          <div className="space-y-2 text-sm">
            <input
              className="w-full rounded-md border border-gray-200 px-2 py-1.5"
              placeholder="有道应用 ID（appKey）"
              value={cfg.youdao.appKey}
              onChange={(e) => void patch({ provider: { configs: { ...cfg, youdao: { ...cfg.youdao, appKey: e.target.value } } } })}
            />
            <input
              className="w-full rounded-md border border-gray-200 px-2 py-1.5"
              placeholder="有道应用密钥（appSecret）"
              type="password"
              value={cfg.youdao.appSecret}
              onChange={(e) => void patch({ provider: { configs: { ...cfg, youdao: { ...cfg.youdao, appSecret: e.target.value } } } })}
            />
          </div>
        )}

        {settings.provider.active === 'baidu' && (
          <div className="space-y-2 text-sm">
            <input
              className="w-full rounded-md border border-gray-200 px-2 py-1.5"
              placeholder="百度 APPID"
              value={cfg.baidu.appId}
              onChange={(e) => void patch({ provider: { configs: { ...cfg, baidu: { ...cfg.baidu, appId: e.target.value } } } })}
            />
            <input
              className="w-full rounded-md border border-gray-200 px-2 py-1.5"
              placeholder="百度密钥"
              type="password"
              value={cfg.baidu.secret}
              onChange={(e) => void patch({ provider: { configs: { ...cfg, baidu: { ...cfg.baidu, secret: e.target.value } } } })}
            />
          </div>
        )}

        <p className="text-xs text-gray-400">API Key 仅保存在本地浏览器 storage 中，仅发送至对应翻译服务。</p>
      </section>
    </div>
  );
}
