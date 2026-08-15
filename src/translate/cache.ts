/**
 * 翻译缓存：key = sha1(provider:from:to:text)，LRU 上限 2000 条。
 * 存 storage.local 单对象，写操作合并（微任务 + 定时 flush），避免批翻译时高频写盘。
 */

const MAX_ENTRIES = 2000;
const KEY = 'translationCache';

interface CacheState {
  order: string[]; // LRU 顺序，最新在尾
  entries: Record<string, string>;
}

let state: CacheState = { order: [], entries: {} };
let loaded = false;
let flushScheduled = false;

async function load(): Promise<void> {
  if (loaded) return;
  const raw = (await browser.storage.local.get(KEY))[KEY] as CacheState | undefined;
  if (raw?.order && raw.entries) state = raw;
  loaded = true;
}

async function flush(): Promise<void> {
  flushScheduled = false;
  await browser.storage.local.set({ [KEY]: state });
}

function scheduleFlush(): void {
  if (flushScheduled) return;
  flushScheduled = true;
  setTimeout(flush, 1000);
}

async function digest(text: string): Promise<string> {
  const buf = await crypto.subtle.digest('SHA-1', new TextEncoder().encode(text));
  return Array.from(new Uint8Array(buf), (b) => b.toString(16).padStart(2, '0')).join('');
}

export async function cacheKey(providerId: string, from: string, to: string, text: string): Promise<string> {
  return `${providerId}:${from}:${to}:${await digest(text)}`;
}

export async function cacheGet(key: string): Promise<string | undefined> {
  await load();
  const hit = state.entries[key];
  if (hit !== undefined) {
    // 触碰 LRU
    const i = state.order.indexOf(key);
    if (i >= 0) {
      state.order.splice(i, 1);
      state.order.push(key);
    }
  }
  return hit;
}

export async function cacheSet(key: string, value: string): Promise<void> {
  await load();
  if (state.entries[key] === undefined) {
    state.order.push(key);
    if (state.order.length > MAX_ENTRIES) {
      const evicted = state.order.splice(0, state.order.length - MAX_ENTRIES);
      for (const k of evicted) delete state.entries[k];
    }
  }
  state.entries[key] = value;
  scheduleFlush();
}
