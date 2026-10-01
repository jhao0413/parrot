import { defineConfig } from 'wxt';
import tailwindcss from '@tailwindcss/vite';

// See https://wxt.dev/api/config.html
export default defineConfig({
  srcDir: 'src',
  modules: ['@wxt-dev/module-react'],
  vite: () => ({
    plugins: [tailwindcss()],
  }),
  manifest: ({ browser }) => ({
    name: 'Parrot 翻译',
    description: '划词翻译 / 全文双语翻译 / 翻译工作台，支持有道发音',
    default_locale: undefined,
    // offscreen：Chrome 下发音在 offscreen document 播放（Firefox 无此 API，background 直接播）
    // declarativeNetRequestWithHostAccess：给有道网页接口补 Referer/Cookie（fetch 设不了这两个头）
    permissions: [
      'storage',
      'contextMenus',
      'declarativeNetRequestWithHostAccess',
      ...(browser === 'firefox' ? [] : ['offscreen']),
    ],
    host_permissions: ['<all_urls>'],
    commands: {
      'toggle-translate-page': {
        suggested_key: { default: 'Alt+Shift+T' },
        description: '翻译/还原当前页面',
      },
    },
  }),
});
