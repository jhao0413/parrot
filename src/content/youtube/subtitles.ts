import { isContextValid, sendBg, type BatchTranslateData } from '@/messaging/protocol';
import { getSettings, updateSettings, watchSettings, type Settings } from '@/storage/settings';
import { normalizeLang } from '@/translate/lang';
import { findCue, firstUpcoming, parseTimedtext, YT_TIMEDTEXT_MSG, type CaptionTrack } from './captions';

/**
 * YouTube 字幕翻译：
 * hook 截获的字幕 → 断句 → 以播放位置为起点分批翻译前方约 1 分钟 → 自绘双语字幕层，隐藏原生字幕。
 * 只在播放器字幕（CC）打开时生效；字幕语言已是目标语言（含 YouTube 自带自动翻译）则不介入。
 */

const BATCH = 20;
const MAX_INFLIGHT = 2;
/** 只预翻前方这么久（倍速播放时按倍率放大，最多 4 倍）：整部视频一次翻完容易被免费接口限流，AI 翻译也白花钱 */
const LOOKAHEAD_MS = 60_000;
const MAX_LOOKAHEAD_RATE = 4;
const RETRY_AFTER_MS = 15_000;
/** 被翻译服务限流后整体暂停：5 分钟起，连续限流翻倍，最长 30 分钟（限流按 IP 算，继续重试只会拖长封禁，还连累其他翻译插件） */
const RATE_LIMIT_PAUSE_MS = 5 * 60_000;
const RATE_LIMIT_PAUSE_MAX_MS = 30 * 60_000;
const MAX_TRACKS = 5;

interface TrackState extends CaptionTrack {
  /** 下标对齐 cues；undefined = 未翻译 */
  trans: (string | undefined)[];
  failedAt: Map<number, number>;
  inflight: Set<number>;
}

const STYLE_ID = 'parrot-yt-style';
const STYLE_CSS = `
.parrot-yt-on .ytp-caption-window-container { display: none !important; }
.parrot-yt-subs {
  position: absolute;
  left: 0;
  right: 0;
  bottom: 4%;
  z-index: 40;
  display: flex;
  justify-content: center;
  pointer-events: none;
  transition: bottom 0.2s;
}
.html5-video-player:not(.ytp-autohide) .parrot-yt-subs { bottom: calc(2% + 52px); }
.html5-video-player.ytp-fullscreen:not(.ytp-autohide) .parrot-yt-subs { bottom: calc(2% + 72px); }
.parrot-yt-box {
  max-width: 82%;
  padding: 0.15em 0.5em;
  border-radius: 4px;
  background: rgba(8, 8, 8, 0.75);
  color: #fff;
  font-family: "YouTube Noto", Roboto, Arial, sans-serif;
  font-size: var(--parrot-yt-fs, 20px);
  line-height: 1.4;
  text-align: center;
  text-wrap: balance;
}
.parrot-yt-box:empty { display: none; }
.parrot-yt-orig { font-size: 0.82em; color: rgba(255, 255, 255, 0.8); }
.parrot-yt-err { font-size: 0.6em; color: #fca5a5; }
/* 控制栏开关：图标仿 CC（关 = 描边框，开 = 实心框），尺寸由 buildIcon 照抄 CC 图标 */
.parrot-yt-btn .parrot-yt-frame { fill: none; stroke: #fff; }
.parrot-yt-btn[aria-pressed='true'] .parrot-yt-frame { fill: #fff; }
.parrot-yt-btn .parrot-yt-glyph {
  fill: #fff;
  font-family: "PingFang SC", "Microsoft YaHei", "Noto Sans CJK SC", sans-serif;
  font-weight: 700;
}
.parrot-yt-btn[aria-pressed='true'] .parrot-yt-glyph { fill: #0f0f0f; }
`;

class YoutubeSubtitles {
  private tracks = new Map<string, TrackState>();
  private settings: Settings | null = null;
  private inflight = 0;
  private generation = 0; // 目标语言变更后丢弃在途结果
  private lastError = '';
  private pauseUntil = 0;
  private pauseMs = 0;
  private overlay: HTMLDivElement | null = null;
  private button: HTMLButtonElement | null = null;
  private iconMeasured = false;
  private box: HTMLDivElement | null = null;
  private rendered = '';
  private playerHeight = 0;

  init(): void {
    void getSettings().then((s) => (this.settings = s));
    watchSettings((s) => {
      if (this.settings && s.general.targetLang !== this.settings.general.targetLang) this.resetTranslations();
      // 换了翻译服务：限流暂停只针对原服务，立即恢复，之前失败的句子也马上重试
      if (this.settings && s.provider.active !== this.settings.provider.active) this.clearFailures();
      this.settings = s;
      this.rendered = '';
    });

    window.addEventListener('message', (e) => {
      if (e.source !== window || (e.data as { type?: string })?.type !== YT_TIMEDTEXT_MSG) return;
      const { url, body } = e.data as { url: string; body: string };
      const track = parseTimedtext(url, body);
      if (!track || track.cues.length === 0) return;
      // 切换字幕语言会重新请求：同一视频直接替换
      this.tracks.delete(track.videoId);
      this.tracks.set(track.videoId, {
        ...track,
        trans: new Array(track.cues.length),
        failedAt: new Map(),
        inflight: new Set(),
      });
      if (this.tracks.size > MAX_TRACKS) this.tracks.delete(this.tracks.keys().next().value!);
      this.rendered = '';
    });

    const tick = () => {
      if (!isContextValid()) {
        this.teardown(); // 扩展已重新加载：交还原生字幕
        return;
      }
      this.render();
      requestAnimationFrame(tick);
    };
    requestAnimationFrame(tick);
  }

  private resetTranslations(): void {
    this.generation++;
    this.lastError = '';
    for (const t of this.tracks.values()) {
      t.trans = new Array(t.cues.length);
      t.failedAt.clear();
      t.inflight.clear();
    }
  }

  private clearFailures(): void {
    this.pauseUntil = 0;
    this.pauseMs = 0;
    this.lastError = '';
    for (const t of this.tracks.values()) t.failedAt.clear();
  }

  private render(): void {
    const s = this.settings;
    const videoId = currentVideoId();
    const track = videoId ? this.tracks.get(videoId) : undefined;
    const player = document.getElementById('movie_player');
    const video = player?.querySelector('video');
    if (player && s) this.mountButton(player, s.subtitle.enabled);
    const active =
      !!s?.subtitle.enabled &&
      !!track &&
      !!player &&
      !!video &&
      isCaptionOn(player) &&
      normalizeLang(track.lang) !== normalizeLang(s.general.targetLang);

    if (!active) {
      document.querySelector('.parrot-yt-on')?.classList.remove('parrot-yt-on');
      this.overlay?.remove();
      this.rendered = '';
      return;
    }

    this.mount(player);
    const t = video.currentTime * 1000;
    this.pump(track, t, video.playbackRate, s.general.targetLang);

    const idx = findCue(track.cues, t);
    const trans = idx >= 0 ? track.trans[idx] : undefined;
    // 限流暂停期间还没轮到请求的句子也提示原因，否则只见原文不知为何
    const failed = idx >= 0 && (track.failedAt.has(idx) || Date.now() < this.pauseUntil);
    const key = `${videoId}|${idx}|${trans ?? ''}|${failed}|${s.subtitle.mode}`;
    if (key === this.rendered) return;
    this.rendered = key;

    const box = this.box!;
    box.replaceChildren();
    if (idx < 0) return;
    const showOrig = s.subtitle.mode === 'bilingual' || trans === undefined;
    if (showOrig) box.append(line('parrot-yt-orig', track.cues[idx]!.text));
    if (trans !== undefined) box.append(line('parrot-yt-trans', trans));
    else if (failed) box.append(line('parrot-yt-err', this.lastError || '字幕翻译失败，稍后自动重试'));
  }

  /** 播放器控制栏里、CC 按钮左边插一个"译"开关（播放器重建后自动补回） */
  private mountButton(player: HTMLElement, enabled: boolean): void {
    if (!this.button) {
      ensureStyle();
      const btn = document.createElement('button');
      btn.type = 'button';
      btn.className = 'ytp-button parrot-yt-btn';
      btn.addEventListener('click', () => {
        const on = btn.getAttribute('aria-pressed') !== 'true';
        void updateSettings({ subtitle: { enabled: on } });
        // 打开翻译时字幕还没开：顺手打开 CC，否则点了没反应
        const cc = btn.closest('#movie_player')?.querySelector<HTMLElement>('.ytp-subtitles-button');
        if (on && cc?.getAttribute('aria-pressed') === 'false') cc.click();
      });
      this.button = btn;
    }
    const btn = this.button;
    const cc = player.querySelector('.ytp-subtitles-button');
    if (!player.contains(btn)) {
      if (!cc?.parentElement) return; // 控制栏还没渲染
      cc.parentElement.insertBefore(btn, cc);
      this.iconMeasured = false;
    }
    // 控制栏未布局时图标只能按估算尺寸画：每帧检查，布局好后按 CC 实际尺寸重画一次
    if (!this.iconMeasured && cc) {
      this.iconMeasured = iconBox(cc) !== null;
      if (this.iconMeasured || !btn.firstChild) btn.replaceChildren(buildIcon(cc));
    }
    const pressed = String(enabled);
    if (btn.getAttribute('aria-pressed') !== pressed) {
      btn.setAttribute('aria-pressed', pressed);
      const label = enabled ? '关闭字幕翻译（Parrot）' : '开启字幕翻译（Parrot）';
      btn.setAttribute('aria-label', label);
      btn.title = label;
    }
  }

  private mount(player: HTMLElement): void {
    ensureStyle();
    player.classList.add('parrot-yt-on');
    if (!this.overlay) {
      this.overlay = document.createElement('div');
      this.overlay.className = 'parrot-yt-subs';
      this.overlay.setAttribute('translate', 'no');
      this.box = document.createElement('div');
      this.box.className = 'parrot-yt-box';
      this.overlay.append(this.box);
    }
    if (this.overlay.parentElement !== player) {
      player.append(this.overlay);
      this.rendered = '';
    }
    const h = player.clientHeight;
    if (h !== this.playerHeight) {
      this.playerHeight = h;
      const fs = Math.min(34, Math.max(13, h * 0.038));
      this.overlay.style.setProperty('--parrot-yt-fs', `${fs.toFixed(1)}px`);
    }
  }

  /** 挑一批未翻译的句子发批量请求 */
  private pump(track: TrackState, t: number, rate: number, to: string): void {
    const now = Date.now();
    if (this.inflight >= MAX_INFLIGHT || now < this.pauseUntil) return;
    const picked: number[] = [];
    // 从播放位置往后挑（seek 后自然从新位置开始）；紧接着的那句即使在窗口外也翻，长静音后不至于空等
    const horizon = t + LOOKAHEAD_MS * Math.min(Math.max(rate, 1), MAX_LOOKAHEAD_RATE);
    const from = firstUpcoming(track.cues, t);
    for (let i = from; i < track.cues.length && picked.length < BATCH; i++) {
      if (i > from && track.cues[i]!.start > horizon) break;
      if (track.trans[i] !== undefined || track.inflight.has(i)) continue;
      const failedAt = track.failedAt.get(i);
      if (failedAt !== undefined && now - failedAt < RETRY_AFTER_MS) continue;
      picked.push(i);
    }
    if (picked.length === 0) return;

    const gen = this.generation;
    this.inflight++;
    picked.forEach((i) => track.inflight.add(i));
    void sendBg<BatchTranslateData>({
      type: 'translate/batch',
      items: picked.map((i) => ({ id: String(i), text: track.cues[i]!.text })),
      from: 'auto',
      to,
    })
      .catch((e: unknown) => ({
        ok: false as const,
        error: { code: 'INTERNAL' as const, message: e instanceof Error ? e.message : String(e) },
      }))
      .then((res) => {
        this.inflight--; // 过期请求也要释放名额，并发上限才准
        if (gen !== this.generation) return;
        picked.forEach((i) => track.inflight.delete(i));
        const failedAt = Date.now();
        if (!res.ok) {
          this.lastError = `字幕翻译失败：${res.error.message}`;
          picked.forEach((i) => track.failedAt.set(i, failedAt));
          if (res.error.code === 'RATE_LIMIT') {
            this.pauseMs = Math.min(Math.max(this.pauseMs * 2, RATE_LIMIT_PAUSE_MS), RATE_LIMIT_PAUSE_MAX_MS);
            this.pauseUntil = failedAt + this.pauseMs;
            this.lastError = `翻译服务限流，${this.pauseMs / 60_000} 分钟后自动重试（可在设置中换一个翻译服务）`;
          }
        } else {
          this.pauseMs = 0;
          for (const r of res.data.results) {
            track.trans[Number(r.id)] = r.text;
            track.failedAt.delete(Number(r.id));
          }
          res.data.failedIds.forEach((id) => track.failedAt.set(Number(id), failedAt));
          if (res.data.failedIds.length === 0) this.lastError = '';
        }
        this.rendered = '';
      });
  }

  private teardown(): void {
    document.querySelector('.parrot-yt-on')?.classList.remove('parrot-yt-on');
    this.overlay?.remove();
    this.button?.remove();
  }
}

function line(cls: string, text: string): HTMLDivElement {
  const el = document.createElement('div');
  el.className = cls;
  el.textContent = text; // YouTube 开了 Trusted Types，不能用 innerHTML
  return el;
}

function ensureStyle(): void {
  if (document.getElementById(STYLE_ID)) return;
  const style = document.createElement('style');
  style.id = STYLE_ID;
  style.textContent = STYLE_CSS;
  document.head.appendChild(style);
}

/** 只认主播放器：/watch?v=…、/live/…（直播及回放）与 /embed/…（首页悬停预览等其他播放器的字幕请求按 videoId 自然过滤掉） */
function currentVideoId(): string | null {
  const { pathname, search } = location;
  if (pathname === '/watch') return new URLSearchParams(search).get('v');
  const m = /^\/(?:embed|live)\/([\w-]+)/.exec(pathname);
  return m ? m[1]! : null;
}

const SVG_NS = 'http://www.w3.org/2000/svg';

/**
 * "译"图标：照抄 CC 按钮 svg 的尺寸 / viewBox / class，再按 CC 图标实际占的区域画框和字，
 * 新旧两版控制栏（36 与 24 的 viewBox、不同留白）下都与旁边按钮对齐。
 */
function buildIcon(cc: Element): SVGSVGElement {
  const svg = document.createElementNS(SVG_NS, 'svg');
  const ref = cc.querySelector('svg');
  for (const attr of ['width', 'height', 'viewBox', 'class']) {
    const v = ref?.getAttribute(attr);
    if (v) svg.setAttribute(attr, v);
  }
  if (!svg.hasAttribute('viewBox')) svg.setAttribute('viewBox', '0 0 24 24');
  if (!svg.hasAttribute('width')) svg.setAttribute('width', '100%');
  if (!svg.hasAttribute('height')) svg.setAttribute('height', '100%');
  const vb = svg.viewBox.baseVal;

  // CC 图标的实际绘制区域；控制栏未布局时 getBBox 为 0，退回 viewBox 中间区域
  const measured = iconBox(cc);
  const box = measured ?? {
    x: vb.x + vb.width * 0.12,
    y: vb.y + vb.height * 0.2,
    width: vb.width * 0.76,
    height: vb.height * 0.6,
  };

  const stroke = box.height * 0.11;
  const frame = document.createElementNS(SVG_NS, 'rect');
  frame.setAttribute('class', 'parrot-yt-frame');
  frame.setAttribute('x', String(box.x + stroke / 2));
  frame.setAttribute('y', String(box.y + stroke / 2));
  frame.setAttribute('width', String(box.width - stroke));
  frame.setAttribute('height', String(box.height - stroke));
  frame.setAttribute('rx', String(box.height * 0.2));
  frame.setAttribute('stroke-width', String(stroke));

  const glyph = document.createElementNS(SVG_NS, 'text');
  glyph.setAttribute('class', 'parrot-yt-glyph');
  glyph.setAttribute('x', String(box.x + box.width / 2));
  glyph.setAttribute('y', String(box.y + box.height / 2));
  glyph.setAttribute('text-anchor', 'middle');
  glyph.setAttribute('dominant-baseline', 'central');
  glyph.setAttribute('font-size', String(box.height * 0.68));
  glyph.textContent = '译';

  svg.append(frame, glyph);
  return svg;
}

/** CC 图标在其 viewBox 里的实际绘制区域；未布局时返回 null */
function iconBox(cc: Element): { x: number; y: number; width: number; height: number } | null {
  try {
    const b = cc.querySelector('svg')?.getBBox();
    return b && b.width > 0 && b.height > 0 ? { x: b.x, y: b.y, width: b.width, height: b.height } : null;
  } catch {
    return null;
  }
}

function isCaptionOn(player: HTMLElement): boolean {
  return player.querySelector('.ytp-subtitles-button')?.getAttribute('aria-pressed') === 'true';
}

export const youtubeSubtitles = new YoutubeSubtitles();
