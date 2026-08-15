import { initContent } from '@/content/main';

export default defineContentScript({
  matches: ['<all_urls>'],
  runAt: 'document_idle',
  main() {
    initContent();
  },
});
