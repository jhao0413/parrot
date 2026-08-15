/** provider 展示信息（popup / workbench / options 共用） */
export const PROVIDER_LIST = [
  { id: 'google', name: 'Google（免费）' },
  { id: 'microsoft', name: '微软（免费）' },
  { id: 'openai', name: 'OpenAI 兼容' },
  { id: 'gemini', name: 'Gemini' },
  { id: 'youdao', name: '有道' },
  { id: 'baidu', name: '百度' },
] as const;

export type ProviderId = (typeof PROVIDER_LIST)[number]['id'];
