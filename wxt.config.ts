import { defineConfig } from 'wxt';
import tailwindcss from '@tailwindcss/vite';

// See https://wxt.dev/api/config.html
export default defineConfig({
  srcDir: 'src',
  modules: ['@wxt-dev/module-react'],
  vite: () => ({
    plugins: [tailwindcss()],
  }),
  manifest: {
    name: 'Parrot 翻译',
    description: '划词翻译 / 全文双语翻译 / 翻译工作台，支持有道发音',
    default_locale: undefined,
    permissions: ['storage', 'contextMenus'],
    host_permissions: ['<all_urls>'],
    commands: {
      'toggle-translate-page': {
        suggested_key: { default: 'Alt+Shift+T' },
        description: '翻译/还原当前页面',
      },
    },
  },
});
