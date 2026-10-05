import { youtubeSubtitles } from '@/content/youtube/subtitles';

/** YouTube 字幕翻译（隔离世界）：接收 youtube-hook 截获的字幕，翻译并绘制双语字幕层 */
export default defineContentScript({
  matches: ['*://www.youtube.com/*', '*://www.youtube-nocookie.com/*'],
  runAt: 'document_start', // 尽早挂 message 监听，不漏掉播放器首个字幕请求
  allFrames: true,
  main() {
    youtubeSubtitles.init();
  },
});
