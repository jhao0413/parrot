import { useEffect, useRef, useState, type ReactNode } from 'react';
import { sendBg, type Response, type SingleTranslateResult } from '@/messaging/protocol';
import { getSettings, updateSettings, watchSettings, type Settings, type SettingsPatch } from '@/storage/settings';
import { LangSelect } from '@/ui/LangSelect';
import { PROVIDER_LIST, type ProviderId } from '@/ui/providerList';
import { Kbd, Row, Section, Segmented, TextField, Toggle, selectClass } from './components';

type PanelId = 'general' | 'page' | 'subtitle' | 'provider' | 'about';

const PANELS: { id: PanelId; label: string; description: string; icon: ReactNode }[] = [
  {
    id: 'general',
    label: '通用',
    description: '翻译语言与发音',
    icon: <path d="M4 7h10M4 12h16M4 17h7M17 4v6M14 7h6" />,
  },
  {
    id: 'page',
    label: '网页翻译',
    description: '全文翻译、划词与悬停翻译',
    icon: (
      <>
        <rect x="3.5" y="4.5" width="17" height="15" rx="2.5" />
        <path d="M3.5 9h17M8 13h8M8 16h5" />
      </>
    ),
  },
  {
    id: 'subtitle',
    label: '视频字幕',
    description: 'YouTube 双语字幕',
    icon: (
      <>
        <rect x="3.5" y="5.5" width="17" height="13" rx="2.5" />
        <path d="M7 12.5h4M13 12.5h4M7 15.5h7" />
      </>
    ),
  },
  {
    id: 'provider',
    label: '翻译服务',
    description: '选择翻译引擎并配置密钥',
    icon: (
      <>
        <circle cx="12" cy="12" r="8.5" />
        <path d="M3.5 12h17M12 3.5c2.2 2.3 3.3 5.1 3.3 8.5s-1.1 6.2-3.3 8.5c-2.2-2.3-3.3-5.1-3.3-8.5s1.1-6.2 3.3-8.5Z" />
      </>
    ),
  },
  {
    id: 'about',
    label: '关于',
    description: '隐私与版本信息',
    icon: (
      <>
        <circle cx="12" cy="12" r="8.5" />
        <path d="M12 11v5M12 8h.01" />
      </>
    ),
  },
];

const PROVIDER_META: Record<ProviderId, { desc: string; free: boolean }> = {
  google: { desc: '免费网页接口，含词典释义', free: true },
  microsoft: { desc: '免费，Edge 内置同款', free: true },
  youdaoWeb: { desc: '免费，含完整词典（非官方接口）', free: true },
  openai: { desc: '大模型翻译，预设 DeepSeek / 千问 / MiMo', free: false },
  gemini: { desc: 'Google 大模型翻译', free: false },
  youdao: { desc: '有道智云官方 API，含词典', free: false },
  baidu: { desc: '百度翻译官方 API', free: false },
};

/** OpenAI 兼容接口的常用服务：一键填好 Base URL 与模型 */
const OPENAI_PRESETS = [
  { id: 'openai', name: 'OpenAI', baseUrl: 'https://api.openai.com/v1', model: 'gpt-4o-mini', keyUrl: 'https://platform.openai.com/api-keys' },
  { id: 'deepseek', name: 'DeepSeek', baseUrl: 'https://api.deepseek.com/v1', model: 'deepseek-chat', keyUrl: 'https://platform.deepseek.com/api_keys' },
  {
    id: 'qwen',
    name: '通义千问',
    baseUrl: 'https://dashscope.aliyuncs.com/compatible-mode/v1',
    model: 'qwen-plus',
    keyUrl: 'https://bailian.console.aliyun.com/?apiKey=1',
  },
  {
    id: 'mimo',
    name: '小米 MiMo',
    baseUrl: 'https://api.xiaomimimo.com/v1',
    model: 'mimo-v2.6-pro',
    keyUrl: 'https://platform.xiaomimimo.com/#/console/api-keys',
  },
] as const;

function matchPreset(baseUrl: string) {
  const norm = (u: string) => u.trim().replace(/\/+$/, '').replace(/\/v1$/, '');
  return OPENAI_PRESETS.find((p) => norm(p.baseUrl) === norm(baseUrl));
}

type Configs = Settings['provider']['configs'];
type FieldDef<K extends keyof Configs> = {
  key: keyof Configs[K] & string;
  label: string;
  placeholder?: string;
  hint?: string;
  secret?: boolean;
  multiline?: boolean;
};

const PROMPT_FIELD = {
  label: '自定义指令（可选）',
  placeholder: '如：保留专有名词原文；口语化；术语表…',
  hint: '追加到系统提示词末尾，只影响译文风格，不改变输出格式。',
  multiline: true,
};

const PROVIDER_FIELDS: { [K in keyof Configs]?: FieldDef<K>[] } = {
  openai: [
    { key: 'baseUrl', label: 'Base URL', placeholder: 'https://api.openai.com/v1', hint: '用上面的预设，或填任何兼容 OpenAI 接口的服务地址。' },
    { key: 'apiKey', label: 'API Key', placeholder: 'sk-…', secret: true },
    { key: 'model', label: '模型', placeholder: 'gpt-4o-mini' },
    { key: 'prompt', ...PROMPT_FIELD },
  ],
  gemini: [
    { key: 'apiKey', label: 'API Key', placeholder: 'AIza…', secret: true },
    { key: 'model', label: '模型', placeholder: 'gemini-2.0-flash' },
    { key: 'prompt', ...PROMPT_FIELD },
  ],
  youdao: [
    { key: 'appKey', label: '应用 ID（appKey）' },
    { key: 'appSecret', label: '应用密钥（appSecret）', secret: true },
  ],
  baidu: [
    { key: 'appId', label: 'APP ID' },
    { key: 'secret', label: '密钥', secret: true },
  ],
};

function panelFromHash(): PanelId {
  const id = location.hash.slice(1);
  return PANELS.some((p) => p.id === id) ? (id as PanelId) : 'general';
}

export default function App() {
  const [settings, setSettings] = useState<Settings | null>(null);
  const [panel, setPanel] = useState<PanelId>(panelFromHash);
  const [saved, setSaved] = useState(false);
  const savedTimer = useRef<ReturnType<typeof setTimeout>>(undefined);
  const latest = useRef<Settings | null>(null);
  latest.current = settings;

  useEffect(() => {
    void getSettings().then(setSettings);
    watchSettings(setSettings); // popup / 播放器按钮改了设置时同步
    const onHash = () => setPanel(panelFromHash());
    window.addEventListener('hashchange', onHash);
    return () => window.removeEventListener('hashchange', onHash);
  }, []);

  // 在途的保存：测试连接前要等它们写完，否则刚输入的 Key 还没落盘
  const pending = useRef(new Set<Promise<Settings>>());
  const flush = () => Promise.all(pending.current);

  const patch = async (p: SettingsPatch) => {
    const save = updateSettings(p);
    pending.current.add(save);
    const next = await save.finally(() => pending.current.delete(save));
    setSettings(next);
    setSaved(true);
    clearTimeout(savedTimer.current);
    savedTimer.current = setTimeout(() => setSaved(false), 1600);
  };

  const current = PANELS.find((p) => p.id === panel)!;

  return (
    <div className="min-h-screen bg-zinc-50 text-zinc-900 antialiased dark:bg-zinc-950 dark:text-zinc-100">
      <div className="mx-auto flex max-w-5xl flex-col md:flex-row md:gap-10 md:px-8 md:py-10">
        {/* 侧栏：窄屏时变成顶部横向导航 */}
        <aside className="sticky top-0 z-10 border-b border-zinc-200/70 bg-zinc-50/90 px-4 pt-4 backdrop-blur md:static md:w-52 md:shrink-0 md:border-0 md:bg-transparent md:p-0 dark:border-white/5 dark:bg-zinc-950/90 md:dark:bg-transparent">
          <div className="flex items-center gap-2.5 px-2 md:mb-8">
            <img src="/logo.png" alt="" className="size-7" />
            <div className="leading-tight">
              <div className="text-sm font-semibold tracking-tight">Parrot 翻译</div>
              <div className="text-xs text-zinc-500 dark:text-zinc-400">设置</div>
            </div>
          </div>
          <nav aria-label="设置分类" className="-mx-1 flex gap-1 overflow-x-auto py-3 [scrollbar-width:none] md:mx-0 md:flex-col md:gap-0.5 md:py-0">
            {PANELS.map((p) => {
              const active = p.id === panel;
              return (
                <a
                  key={p.id}
                  href={`#${p.id}`}
                  aria-current={active ? 'page' : undefined}
                  className={`flex shrink-0 items-center gap-2.5 rounded-lg px-2.5 py-2 text-sm transition-colors duration-150 ${
                    active
                      ? 'bg-white font-medium text-zinc-900 shadow-[0_0_0_1px_rgb(0_0_0/0.05),0_1px_2px_rgb(0_0_0/0.05)] dark:bg-zinc-800 dark:text-white dark:shadow-none'
                      : 'text-zinc-600 hover:bg-zinc-200/50 hover:text-zinc-900 dark:text-zinc-400 dark:hover:bg-white/5 dark:hover:text-zinc-100'
                  }`}
                >
                  <svg
                    viewBox="0 0 24 24"
                    fill="none"
                    stroke="currentColor"
                    strokeWidth={1.5}
                    strokeLinecap="round"
                    strokeLinejoin="round"
                    aria-hidden
                    className={`size-[18px] ${active ? 'text-brand-700 dark:text-brand-400' : ''}`}
                  >
                    {p.icon}
                  </svg>
                  {p.label}
                </a>
              );
            })}
          </nav>
        </aside>

        <main className="min-w-0 flex-1 px-4 py-6 md:px-0 md:py-0">
          <header className="mb-6 px-1">
            <h1 className="text-xl font-semibold tracking-tight text-balance">{current.label}</h1>
            <p className="mt-1 text-sm text-zinc-500 dark:text-zinc-400">{current.description}</p>
          </header>

          {!settings ? (
            <div className="h-40 animate-pulse rounded-2xl bg-zinc-200/50 dark:bg-zinc-800/50" />
          ) : (
            <div className="space-y-8">
              {panel === 'general' && <GeneralPanel s={settings} patch={patch} />}
              {panel === 'page' && <PagePanel s={settings} patch={patch} />}
              {panel === 'subtitle' && <SubtitlePanel s={settings} patch={patch} />}
              {panel === 'provider' && <ProviderPanel s={settings} latest={latest} patch={patch} flush={flush} />}
              {panel === 'about' && <AboutPanel />}
            </div>
          )}
        </main>
      </div>

      {/* 保存提示：设置即改即存，这里只做确认反馈 */}
      <div
        role="status"
        aria-live="polite"
        className={`pointer-events-none fixed end-5 bottom-5 flex items-center gap-1.5 rounded-full bg-zinc-900 px-3 py-1.5 text-xs font-medium text-white shadow-lg transition-[opacity,translate] duration-200 ease-out dark:bg-white dark:text-zinc-900 ${
          saved ? 'translate-y-0 opacity-100' : 'translate-y-1 opacity-0'
        }`}
      >
        <svg viewBox="0 0 16 16" fill="none" stroke="currentColor" strokeWidth={2} aria-hidden className="size-3.5">
          <path d="m3.5 8.5 3 3 6-7" strokeLinecap="round" strokeLinejoin="round" />
        </svg>
        {saved ? '已保存' : ''}
      </div>
    </div>
  );
}

type PanelProps = { s: Settings; patch: (p: SettingsPatch) => Promise<void> };

function GeneralPanel({ s, patch }: PanelProps) {
  return (
    <>
      <Section>
        <Row label="目标语言" description="所有翻译都译成这种语言" htmlFor="target-lang">
          <LangSelect
            id="target-lang"
            value={s.general.targetLang}
            onChange={(v) => void patch({ general: { targetLang: v } })}
            className={selectClass}
          />
        </Row>
        <Row label="源语言" description="划词翻译与工作台默认的原文语言" htmlFor="source-lang">
          <LangSelect
            id="source-lang"
            value={s.general.sourceLang}
            includeAuto
            onChange={(v) => void patch({ general: { sourceLang: v } })}
            className={selectClass}
          />
        </Row>
      </Section>
      <Section title="发音">
        <Row label="英文口音" description="单词发音使用有道语音">
          <Segmented
            label="英文口音"
            value={s.tts.accent}
            options={[
              { value: 2, label: '美音' },
              { value: 1, label: '英音' },
            ]}
            onChange={(v) => void patch({ tts: { accent: v } })}
          />
        </Row>
      </Section>
    </>
  );
}

function PagePanel({ s, patch }: PanelProps) {
  return (
    <>
      <Section title="全文翻译">
        <Row
          label="展示方式"
          description={
            <>
              快捷键 <Kbd>Alt</Kbd> + <Kbd>Shift</Kbd> + <Kbd>T</Kbd> 翻译 / 还原当前页
            </>
          }
        >
          <Segmented
            label="全文翻译展示方式"
            value={s.page.mode}
            options={[
              { value: 'bilingual', label: '双语对照' },
              { value: 'translationOnly', label: '仅译文' },
            ]}
            onChange={(v) => void patch({ page: { mode: v } })}
          />
        </Row>
      </Section>
      <Section title="划词与悬停">
        <Row label="划词时显示词典" description="选中单个单词时附带音标、词性与释义">
          <Toggle
            label="划词时显示词典"
            checked={s.page.showDictOnSelection}
            onChange={(v) => void patch({ page: { showDictOnSelection: v } })}
          />
        </Row>
        <Row
          label="悬停翻译段落"
          description={
            <>
              鼠标停在段落上按 <Kbd>Shift</Kbd> 翻译该段，再按一次收起
            </>
          }
        >
          <Toggle
            label="悬停翻译段落"
            checked={s.page.shiftTranslate}
            onChange={(v) => void patch({ page: { shiftTranslate: v } })}
          />
        </Row>
      </Section>
    </>
  );
}

function SubtitlePanel({ s, patch }: PanelProps) {
  const on = s.subtitle.enabled;
  return (
    <Section>
      <Row label="YouTube 字幕翻译" description="打开播放器字幕（CC）后自动显示双语字幕，也可以用控制栏的「译」按钮开关">
        <Toggle label="YouTube 字幕翻译" checked={on} onChange={(v) => void patch({ subtitle: { enabled: v } })} />
      </Row>
      <div className={`transition-opacity duration-150 ${on ? '' : 'pointer-events-none opacity-50'}`} aria-disabled={!on}>
        <Row label="字幕显示" description="仅译文模式下，还没翻译好的句子仍显示原文">
          <Segmented
            label="字幕显示"
            value={s.subtitle.mode}
            options={[
              { value: 'bilingual', label: '双语' },
              { value: 'translationOnly', label: '仅译文' },
            ]}
            onChange={(v) => void patch({ subtitle: { mode: v } })}
          />
        </Row>
      </div>
    </Section>
  );
}

type TestState = { status: 'idle' } | { status: 'loading' } | { status: 'ok' | 'error'; message: string };

function ProviderPanel({
  s,
  latest,
  patch,
  flush,
}: PanelProps & { latest: React.RefObject<Settings | null>; flush: () => Promise<unknown> }) {
  const active = s.provider.active;
  const fields = PROVIDER_FIELDS[active] as FieldDef<typeof active>[] | undefined;
  const [test, setTest] = useState<TestState>({ status: 'idle' });

  useEffect(() => setTest({ status: 'idle' }), [active]);

  // 防抖提交时以最新设置为底，避免覆盖期间其他字段的修改
  const setField = (key: string, value: string) => {
    const configs = latest.current!.provider.configs;
    void patch({ provider: { configs: { ...configs, [active]: { ...configs[active], [key]: value } } } });
  };

  const preset = active === 'openai' ? matchPreset(s.provider.configs.openai.baseUrl) : undefined;
  const applyPreset = (id: string) => {
    const p = OPENAI_PRESETS.find((x) => x.id === id)!;
    const configs = latest.current!.provider.configs;
    void patch({ provider: { configs: { ...configs, openai: { ...configs.openai, baseUrl: p.baseUrl, model: p.model } } } });
    setTest({ status: 'idle' });
  };

  const runTest = async () => {
    setTest({ status: 'loading' });
    await flush(); // 点按钮时输入框失焦已触发提交，等它写入存储
    const res: Response<SingleTranslateResult> = await sendBg({
      type: 'translate/single',
      text: 'Hello, world.',
      from: 'auto',
      to: s.general.targetLang,
      wantDict: false,
    });
    setTest(res.ok ? { status: 'ok', message: res.data.text } : { status: 'error', message: res.error.message });
  };

  return (
    <>
      <section className="space-y-3">
        <div role="radiogroup" aria-label="翻译服务" className="grid gap-2.5 sm:grid-cols-2">
          {PROVIDER_LIST.map((p) => {
            const meta = PROVIDER_META[p.id];
            const selected = p.id === active;
            return (
              <button
                key={p.id}
                type="button"
                role="radio"
                aria-checked={selected}
                onClick={() => void patch({ provider: { active: p.id } })}
                className={`group flex items-start gap-3 rounded-xl bg-white px-4 py-3.5 text-start transition-[box-shadow] duration-150 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-brand-600 dark:bg-zinc-900 ${
                  selected
                    ? 'shadow-[0_0_0_1.5px_rgb(22_163_74),0_1px_2px_rgb(0_0_0/0.04)] dark:shadow-[0_0_0_1.5px_rgb(74_222_128)]'
                    : 'shadow-[0_0_0_1px_rgb(0_0_0/0.06),0_1px_2px_rgb(0_0_0/0.04)] hover:shadow-[0_0_0_1px_rgb(0_0_0/0.14),0_2px_6px_-2px_rgb(0_0_0/0.08)] dark:shadow-[0_0_0_1px_rgb(255_255_255/0.07)] dark:hover:shadow-[0_0_0_1px_rgb(255_255_255/0.16)]'
                }`}
              >
                <span
                  aria-hidden
                  className={`mt-0.5 grid size-4 shrink-0 place-items-center rounded-full transition-colors duration-150 ${
                    selected ? 'bg-brand-600 dark:bg-brand-500' : 'shadow-[inset_0_0_0_1.5px_rgb(161_161_170)]'
                  }`}
                >
                  {selected && <span className="size-1.5 rounded-full bg-white" />}
                </span>
                <span className="min-w-0 flex-1">
                  <span className="flex items-center gap-2">
                    <span className="text-sm font-medium">{p.name.replace(/（免费）$/, '')}</span>
                    <span
                      className={`rounded-full px-1.5 py-px text-[11px] font-medium ${
                        meta.free
                          ? 'bg-brand-50 text-brand-700 dark:bg-brand-500/10 dark:text-brand-400'
                          : 'bg-amber-50 text-amber-700 dark:bg-amber-500/10 dark:text-amber-400'
                      }`}
                    >
                      {meta.free ? '免费' : '需密钥'}
                    </span>
                  </span>
                  <span className="mt-0.5 block text-[13px] text-zinc-500 dark:text-zinc-400">{meta.desc}</span>
                </span>
              </button>
            );
          })}
        </div>
      </section>

      <Section title="配置与测试">
        <div className="space-y-4 px-5 py-5">
          {active === 'openai' && (
            <div className="space-y-1.5">
              <div className="text-[13px] font-medium text-zinc-700 dark:text-zinc-300">预设</div>
              <Segmented
                label="OpenAI 兼容服务预设"
                value={preset?.id ?? ''}
                options={OPENAI_PRESETS.map((p) => ({ value: p.id, label: p.name }))}
                onChange={(id) => applyPreset(id)}
              />
            </div>
          )}
          {fields ? (
            fields.map((f) => (
              <TextField
                key={`${active}.${f.key}`}
                label={f.label}
                hint={
                  active === 'openai' && f.key === 'apiKey' && preset ? (
                    <a href={preset.keyUrl} target="_blank" rel="noreferrer" className="text-brand-700 hover:underline dark:text-brand-400">
                      获取 {preset.name} API Key ↗
                    </a>
                  ) : (
                    f.hint
                  )
                }
                placeholder={f.placeholder}
                secret={f.secret}
                multiline={f.multiline}
                value={String((s.provider.configs[active] as Record<string, string>)[f.key] ?? '')}
                onCommit={(v) => setField(f.key, v)}
              />
            ))
          ) : (
            <p className="text-sm text-zinc-600 dark:text-zinc-300">无需配置，开箱即用。免费接口偶尔会限流，可以换一个服务试试。</p>
          )}
        </div>
        <div className="flex flex-wrap items-center gap-3 px-5 py-4">
          <button
            type="button"
            onClick={() => void runTest()}
            disabled={test.status === 'loading'}
            className="rounded-lg bg-zinc-900 px-3.5 py-2 text-[13px] font-medium text-white transition-[background-color,scale] duration-150 hover:bg-zinc-700 active:scale-[0.96] disabled:opacity-60 dark:bg-white dark:text-zinc-900 dark:hover:bg-zinc-200"
          >
            {test.status === 'loading' ? '测试中…' : '测试连接'}
          </button>
          <p aria-live="polite" className="min-w-0 flex-1 text-[13px]">
            {test.status === 'ok' && (
              <span className="text-brand-700 dark:text-brand-400">
                连接正常 · <span className="text-zinc-600 dark:text-zinc-300">Hello, world. → {test.message}</span>
              </span>
            )}
            {test.status === 'error' && <span className="text-red-600 dark:text-red-400">{test.message}</span>}
          </p>
        </div>
      </Section>
      <p className="px-1 text-xs text-zinc-500 dark:text-zinc-400">密钥只保存在本机浏览器中，只会发送给对应的翻译服务。</p>
    </>
  );
}

function AboutPanel() {
  const version = browser.runtime.getManifest().version;
  return (
    <>
      <Section>
        <Row label="版本">
          <span className="text-sm text-zinc-500 tabular-nums dark:text-zinc-400">{version}</span>
        </Row>
        <Row label="翻译工作台" description="粘贴整段文字翻译，长文自动分块">
          <a
            href="/workbench.html"
            target="_blank"
            className="rounded-lg px-3 py-1.5 text-[13px] font-medium text-brand-700 shadow-[0_0_0_1px_rgb(0_0_0/0.1)] hover:bg-zinc-50 dark:text-brand-400 dark:shadow-[0_0_0_1px_rgb(255_255_255/0.1)] dark:hover:bg-white/5"
          >
            打开
          </a>
        </Row>
      </Section>
      <Section title="隐私">
        <ul className="space-y-2 px-5 py-4 text-[13px] leading-6 text-zinc-600 dark:text-zinc-300">
          <li>要翻译的文本只发送给你选择的翻译服务。</li>
          <li>API 密钥只保存在本机浏览器中，不会上传到其他服务器。</li>
          <li>没有统计分析，不加载远程代码。</li>
        </ul>
      </Section>
    </>
  );
}
