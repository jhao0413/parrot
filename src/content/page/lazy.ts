import { sendBg, type BatchTranslateData } from '@/messaging/protocol';
import { extractText } from './extractor';

/**
 * 懒翻译：IntersectionObserver（rootMargin 600px 前缀区），
 * 进入视口附近的段落进入待译队列，300ms 防抖或满 16 段批量发送。
 */

const ROOT_MARGIN = '600px';
const BATCH_SIZE = 16;
const FLUSH_DELAY = 300;
/** 单批字符上限，规避 MV3 service worker 30s 回收 */
const BATCH_CHARS = 3000;

export class LazyTranslator {
  private observer: IntersectionObserver;
  private pending = new Map<string, string>(); // id → text
  private flushTimer: number | null = null;
  private inFlight = false;

  constructor(
    private onResult: (id: string, text: string) => void,
    private onFail: (id: string) => void,
  ) {
    this.observer = new IntersectionObserver(
      (entries) => {
        for (const entry of entries) {
          if (!entry.isIntersecting) continue;
          const el = entry.target as HTMLElement;
          this.observer.unobserve(el);
          void this.enqueue(el);
        }
      },
      { rootMargin: ROOT_MARGIN },
    );
  }

  observe(el: HTMLElement): void {
    this.observer.observe(el);
  }

  private async enqueue(el: HTMLElement): Promise<void> {
    const text = extractText(el).trim();
    if (!text) return;
    const id = el.getAttribute('data-mt-p');
    if (!id) return;
    this.pending.set(id, text);
    this.scheduleFlush();
  }

  private scheduleFlush(): void {
    if (this.flushTimer !== null) {
      // 队列已满则立刻 flush
      if (this.pending.size >= BATCH_SIZE) {
        clearTimeout(this.flushTimer);
        this.flushTimer = null;
        void this.flush();
      }
      return;
    }
    this.flushTimer = window.setTimeout(() => {
      this.flushTimer = null;
      void this.flush();
    }, FLUSH_DELAY);
  }

  private async flush(): Promise<void> {
    if (this.inFlight || this.pending.size === 0) return;
    this.inFlight = true;
    // 按 BATCH_CHARS 切批
    const items: { id: string; text: string }[] = [];
    for (const [id, text] of this.pending) {
      this.pending.delete(id);
      items.push({ id, text });
      const chars = items.reduce((n, i) => n + i.text.length, 0);
      if (items.length >= BATCH_SIZE || chars >= BATCH_CHARS) break;
    }
    try {
      const res = await sendBg<BatchTranslateData>({
        type: 'translate/batch',
        items,
        from: 'auto',
        to: this.targetLang,
      });
      if (res.ok) {
        for (const r of res.data.results) this.onResult(r.id, r.text);
        for (const id of res.data.failedIds) this.onFail(id);
      } else {
        for (const i of items) this.onFail(i.id);
      }
    } catch {
      for (const i of items) this.onFail(i.id);
    } finally {
      this.inFlight = false;
      if (this.pending.size > 0) this.scheduleFlush();
    }
  }

  private targetLang = 'zh';
  setTargetLang(lang: string): void {
    this.targetLang = lang;
  }

  /** 关闭时清空队列 */
  dispose(): void {
    this.observer.disconnect();
    if (this.flushTimer !== null) clearTimeout(this.flushTimer);
    this.flushTimer = null;
    this.pending.clear();
  }
}
