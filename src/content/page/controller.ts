import type { BatchTranslateData } from '@/messaging/protocol';
import { getSettings } from '@/storage/settings';
import { isChineseText } from '@/translate/lang';
import { LazyTranslator, chunkParagraph } from './lazy';
import { extractText, isTranslatable } from './extractor';
import { fillTranslation, injectPlaceholder, removeAllTranslations, setMode } from './injector';
import { clearLabels, walkAndLabel } from './walker';

/** 全文翻译开关状态机：on → walk → lazy observe → inject；off → 清理 */
class PageTranslationController {
  private lazy: LazyTranslator | null = null;
  private on = false;

  isOn(): boolean {
    return this.on;
  }

  async toggle(on: boolean): Promise<void> {
    if (on === this.on) return;
    if (on) await this.start();
    else this.stop();
  }

  private async start(): Promise<void> {
    const settings = await getSettings();
    const to = settings.general.targetLang;

    // 语言检测：目标语言 == 页面语言则不翻译
    const pageLang = document.documentElement.lang || '';
    const sample = document.body?.innerText?.slice(0, 2000) ?? '';
    const skip =
      (to.startsWith('zh') && (pageLang.startsWith('zh') || isChineseText(sample))) ||
      (to === 'en' && pageLang.startsWith('en'));
    if (skip) {
      console.info('[parrot] 页面语言与目标语言相同，跳过翻译');
      return;
    }

    const paragraphs = walkAndLabel(document.body);
    if (paragraphs.length === 0) return;

    setMode(settings.page.mode);
    this.lazy = new LazyTranslator(
      (id, text) => fillTranslation(id, text),
      (id) => fillTranslation(id, null),
    );
    this.lazy.setTargetLang(to);

    for (const p of paragraphs) {
      // 视口附近且值得翻译的段落先出占位，避免滚动时译文"追着跳"（超长段按分块逐个占位）
      const rect = p.el.getBoundingClientRect();
      if (rect.top < window.innerHeight + 600 && rect.bottom > -600) {
        const text = extractText(p.el, p.mode);
        if (isTranslatable(text)) {
          for (const item of chunkParagraph(p.id, text)) injectPlaceholder(p.el, item.id);
        }
      }
      this.lazy.observe(p); // 已在视口内会立刻触发 enqueue
    }
    this.on = true;
  }

  stop(): void {
    this.lazy?.dispose();
    this.lazy = null;
    removeAllTranslations();
    clearLabels();
    this.on = false;
  }

  /** 单段翻译（划词弹窗"译此段"按钮复用同一管线） */
  async translateParagraph(el: HTMLElement, to: string): Promise<void> {
    let id = el.getAttribute('data-mt-p');
    if (id === null) {
      // 页面未开启全文翻译时，现场标记该段
      id = `manual-${Date.now()}`;
      el.setAttribute('data-mt-p', id);
    }
    const text = extractText(el).trim();
    if (!text) return;
    injectPlaceholder(el, id);
    const { sendBg } = await import('@/messaging/protocol');
    const res = await sendBg<BatchTranslateData>({
      type: 'translate/batch',
      items: [{ id, text }],
      from: 'auto',
      to,
    });
    if (res.ok && res.data.results[0]) fillTranslation(id, res.data.results[0].text);
    else fillTranslation(id, null);
  }
}

export const pageTranslation = new PageTranslationController();
