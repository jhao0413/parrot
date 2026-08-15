import { sendBg, type BatchTranslateData } from '@/messaging/protocol';
import { extractText, isTranslatable } from './extractor';
import { MODE_ATTR, PARA_ATTR, type Paragraph } from './walker';

/**
 * 懒翻译：IntersectionObserver（rootMargin 600px 前缀区），
 * 进入视口附近的段落进入待译队列，300ms 防抖或满 16 段批量发送。
 * 失败的段落自动重试一次（1.5s 后），仍失败才回调 onFail。
 */

const ROOT_MARGIN = '600px';
const BATCH_SIZE = 16;
const FLUSH_DELAY = 300;
/** 单批字符上限，规避 MV3 service worker 30s 回收 */
const BATCH_CHARS = 3000;
const RETRY_DELAY = 1500;
/** 单段超长时按句子边界分块（子段 id 格式 `<id>:<k>`） */
const PARAGRAPH_CHUNK = 1000;

/** 超长段落分块：优先句子边界，找不到则硬切 */
export function chunkParagraph(id: string, text: string): { id: string; text: string }[] {
  if (text.length <= PARAGRAPH_CHUNK) return [{ id, text }];
  const parts: string[] = [];
  let rest = text;
  while (rest.length > PARAGRAPH_CHUNK) {
    const window = rest.slice(0, PARAGRAPH_CHUNK);
    const cut = Math.max(
      window.lastIndexOf('. '),
      window.lastIndexOf('。'),
      window.lastIndexOf('！'),
      window.lastIndexOf('？'),
      window.lastIndexOf('! '),
      window.lastIndexOf('? '),
      window.lastIndexOf('\n'),
    );
    const at = cut > PARAGRAPH_CHUNK / 2 ? cut + 1 : PARAGRAPH_CHUNK;
    parts.push(rest.slice(0, at).trim());
    rest = rest.slice(at);
  }
  if (rest.trim()) parts.push(rest.trim());
  return parts.map((t, k) => ({ id: `${id}:${k}`, text: t }));
}

export class LazyTranslator {
  private observer: IntersectionObserver;
  private pending = new Map<string, string>(); // id → text
  private els = new Map<string, HTMLElement>(); // id → 元素（重试找回用）
  private retried = new Set<string>();
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
          this.enqueue(el);
        }
      },
      { rootMargin: ROOT_MARGIN },
    );
  }

  observe(paragraph: Paragraph): void {
    this.els.set(paragraph.id, paragraph.el);
    this.observer.observe(paragraph.el);
  }

  private enqueue(el: HTMLElement): void {
    const id = el.getAttribute(PARA_ATTR);
    if (!id) return;
    const mode = el.getAttribute(MODE_ATTR) === 'inline' ? ('inline' as const) : ('subtree' as const);
    const text = extractText(el, mode).trim();
    if (!text || !isTranslatable(text)) return; // 空段/纯符号不送翻
    for (const item of chunkParagraph(id, text)) this.pending.set(item.id, item.text);
    this.scheduleFlush();
  }

  /** 失败重试入口（元素还在 DOM 里） */
  private retryLater(id: string): void {
    this.retried.add(id);
    const el = this.els.get(id);
    if (!el || !el.isConnected) {
      this.onFail(id);
      return;
    }
    setTimeout(() => this.enqueue(el), RETRY_DELAY);
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
        for (const id of res.data.failedIds) {
          if (this.retried.has(id)) this.onFail(id);
          else this.retryLater(id);
        }
      } else {
        // 整批失败（如限流）：可重试的重试，已重试的报失败
        for (const i of items) {
          if (this.retried.has(i.id)) this.onFail(i.id);
          else this.retryLater(i.id);
        }
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
    this.els.clear();
    this.retried.clear();
  }
}
