/**
 * YouTube timedtext（json3）解析 + 断句。纯函数，不碰 DOM。
 *
 * 原始字幕按"屏"切分，一句话常被拆成好几条（自动字幕更是逐词出现），逐条翻译会断章取义。
 * 这里先拆成带时间的片段，再按句末标点 / 停顿 / 长度合并成整句，整句翻译、整句显示。
 */

/** MAIN world hook → 隔离世界的 postMessage 类型 */
export const YT_TIMEDTEXT_MSG = 'parrot/yt-timedtext';

export interface Cue {
  start: number; // ms
  end: number; // ms
  text: string;
}

export interface CaptionTrack {
  videoId: string;
  /** 字幕语言（若用了 YouTube 自带的自动翻译，则为翻译后的 tlang） */
  lang: string;
  cues: Cue[];
}

interface Json3 {
  events?: {
    tStartMs?: number;
    dDurationMs?: number;
    aAppend?: number;
    segs?: { utf8?: string; tOffsetMs?: number; acAsrConf?: number }[];
  }[];
}

interface Fragment {
  start: number;
  end: number;
  text: string;
}

const SENTENCE_END = /[.?!。？！…]["'”’)\]]*$/;
/**
 * 每句上限（字符数 + 覆盖的说话时长）：一句一出现就整句显示，时长上限决定了字幕最多"超前"说话人多久。
 * 自动字幕有逐词时间，按约一行、3.5 秒切；人工字幕没有词级时间，只能放宽。
 */
interface CueLimits {
  /** 按显示宽度计（见 width） */
  chars: number;
  ms: number;
}
const LIMITS_MANUAL: CueLimits = { chars: 120, ms: 7000 };
const LIMITS_ASR: CueLimits = { chars: 50, ms: 3500 };
/** 停顿超过它就断句（与说话时间对齐优先；切出的短句由 mergeShortCues 视情况并回） */
const MAX_GAP_MS = 1200;
/** 短句（念得快 / 字少）来不及看：紧接着下一句就并进去，合并后仍受 CueLimits 约束 */
const MIN_CUE_MS = 1500;
const MIN_CUE_CHARS = 20;
const MERGE_GAP_MS = 600;
/** [Music] [Applause] 等非语音标记：不显示不翻译，也不能并进后面的句子（会让句子提前好几秒出现） */
const NOISE_TAG = /\[[^\]]*\]|♪[^♪]*♪|[♪🎵🎶]/g;
/**
 * 超长切分时的语言提示（自动字幕基本是英文、常无标点）：
 * 连词/从句引导词之前适合断，冠词/介词/助词之后不该断。分值按"相当于多停顿多少 ms"计。
 */
const BREAK_BEFORE = new Set(['and', 'but', 'so', 'because', 'then', 'or', 'which', 'when', 'if', 'while', 'although', 'though', 'now', 'okay', 'well', 'actually', 'basically']);
const NO_BREAK_AFTER = new Set(['a', 'an', 'the', 'to', 'of', 'in', 'on', 'at', 'for', 'with', 'from', 'by', 'about', 'into', 'without', 'through', 'over', 'under', 'after', 'before', 'like', 'than', 'as', 'just', 'also', 'more', 'most', 'some', 'any', 'every', 'all', 'no', 'have', 'has', 'had', 'been', 'and', 'or', 'but', 'is', 'are', 'was', 'were', 'be', 'can', 'will', 'would', 'should', 'could', 'do', 'does', 'my', 'your', 'our', 'their', 'his', 'her', 'its', 'this', 'that', 'these', 'those', 'i', 'you', 'we', 'they', 'it', 'he', 'she', 'very', 'really', 'not']);
const BREAK_BEFORE_BONUS_MS = 400;
/** 逗号后断：真实自动字幕大多带逗号，是最可靠的句内断点 */
const SOFT_BREAK = /[,;:，、；：]["'”’)\]]*$/;
const SOFT_BREAK_BONUS_MS = 500;
const NO_BREAK_AFTER_PENALTY_MS = 600;
/** 自动字幕没有词尾时间：每个词按最多 700ms 估算，否则停顿会被算成上一个词的时长 */
const ASR_WORD_MS = 700;
/** 自动字幕：下一句在这个时间内出现就一直显示到它出现（不闪空），否则念完后再停留 ASR_LINGER_MS */
const ASR_HOLD_MS = 2500;
const ASR_LINGER_MS = 1000;
/** 中日韩字符（假名、汉字、谚文） */
const CJK_RANGE = '\\u3040-\\u30ff\\u3400-\\u9fff\\uac00-\\ud7af';
const CJK = new RegExp(`[${CJK_RANGE}]`);
const CJK_ALL = new RegExp(`[${CJK_RANGE}]`, 'g');
/** 切词：中日韩逐字，其余按空白分词 */
const WORD_TOKEN = new RegExp(`[${CJK_RANGE}]|[^\\s${CJK_RANGE}]+`, 'g');

export function parseTimedtext(url: string, body: string): CaptionTrack | null {
  let u: URL;
  try {
    u = new URL(url, location.origin);
  } catch {
    return null;
  }
  const videoId = u.searchParams.get('v');
  const lang = u.searchParams.get('tlang') || u.searchParams.get('lang') || '';
  if (!videoId) return null;

  let data: Json3;
  try {
    data = JSON.parse(body) as Json3; // 只支持 json3（播放器默认格式）
  } catch {
    return null;
  }
  // 按数据判断而不是 URL 的 kind=asr：不同账号/实验下请求参数不一定带它，返回格式也不同
  //   - 逐词格式：每个词一个 seg，带 tOffsetMs
  //   - 整行格式：一个 event 一整行（约 2×40 字），只有行级时间；带 acAsrConf 说明是自动识别
  const segs = (data.events ?? []).flatMap((ev) => ev.segs ?? []);
  const wordTimed = segs.some((seg) => seg.tOffsetMs !== undefined);
  const asr = wordTimed || u.searchParams.get('kind') === 'asr' || segs.some((seg) => seg.acAsrConf !== undefined);
  const frags = wordTimed ? asrFragments(data) : asr ? lineAsrFragments(data) : manualFragments(data);
  const limits = asr ? LIMITS_ASR : LIMITS_MANUAL;
  const cues = mergeShortCues(mergeSentences(frags, limits), limits);
  if (asr) {
    cues.forEach((c, i) => {
      const next = cues[i + 1]?.start ?? Infinity;
      c.end = next - c.end <= ASR_HOLD_MS ? next : c.end + ASR_LINGER_MS;
    });
  }
  return { videoId, lang, cues };
}

/** 人工字幕：一个 event 一个片段 */
function manualFragments(data: Json3): Fragment[] {
  const out: Fragment[] = [];
  for (const ev of data.events ?? []) {
    if (!ev.segs || ev.tStartMs === undefined) continue;
    const text = clean(ev.segs.map((s) => s.utf8 ?? '').join('').replace(NOISE_TAG, ''));
    if (!text) continue;
    out.push({ start: ev.tStartMs, end: ev.tStartMs + (ev.dDurationMs ?? 2000), text });
  }
  return out;
}

/**
 * 自动字幕（ASR）：逐词片段。词尾 = min(下一个词开头, 开头 + ASR_WORD_MS)，
 * event 自带的时长互相重叠（一直延到下一行出现），不能当词尾，否则停顿永远算不出来。
 */
function asrFragments(data: Json3): Fragment[] {
  const words: Fragment[] = [];
  for (const ev of data.events ?? []) {
    if (!ev.segs || ev.tStartMs === undefined || ev.aAppend) continue; // aAppend 是滚动换行事件
    for (const s of ev.segs) {
      const text = clean((s.utf8 ?? '').replace(NOISE_TAG, ''));
      if (!text) continue;
      const start = ev.tStartMs + (s.tOffsetMs ?? 0);
      words.push({ start, end: start + ASR_WORD_MS, text });
    }
  }
  words.sort((a, b) => a.start - b.start);
  for (let i = 0; i < words.length - 1; i++) words[i]!.end = Math.min(words[i]!.end, words[i + 1]!.start);
  return words;
}

/**
 * 整行格式的自动字幕：行内没有词级时间，按字符数比例把一行的时间摊到每个词上，再走逐词的切句逻辑。
 * 一行的时间窗 = [本行开始, min(本行结束, 下一行开始))：行与行的时长互相重叠（滚动显示）。
 */
function lineAsrFragments(data: Json3): Fragment[] {
  const lines = (data.events ?? [])
    .filter((ev) => ev.segs && ev.tStartMs !== undefined && !ev.aAppend)
    .map((ev) => ({
      start: ev.tStartMs!,
      end: ev.tStartMs! + (ev.dDurationMs ?? 2000),
      // [Music] 等标记先保留（压成一个词）参与时间分摊，分完再丢，否则同一行里后面的话会被算早
      text: clean(ev.segs!.map((seg) => seg.utf8 ?? '').join('').replace(NOISE_TAG, (tag) => `[${tag.replace(/\s+/g, '_')}]`)),
    }))
    .filter((l) => l.text.replace(NOISE_TAG, '').trim())
    .sort((a, b) => a.start - b.start);

  const words: Fragment[] = [];
  lines.forEach((line, i) => {
    const end = Math.min(line.end, lines[i + 1]?.start ?? Infinity);
    const tokens = line.text.match(WORD_TOKEN) ?? [];
    const total = tokens.reduce((n, t) => n + t.length + 1, 0);
    let acc = 0;
    for (const text of tokens) {
      const start = line.start + Math.round(((end - line.start) * acc) / total);
      if (!text.startsWith('[')) words.push({ start, end: start + ASR_WORD_MS, text });
      acc += text.length + 1;
    }
  });
  for (let i = 0; i < words.length - 1; i++) words[i]!.end = Math.min(words[i]!.end, words[i + 1]!.start);
  return words;
}

/** 显示宽度：中日韩字符按 2 个拉丁字符计（50 宽 ≈ 9 个英文词 ≈ 25 个汉字） */
function width(s: string): number {
  return s.length + (s.match(CJK_ALL) ?? []).length;
}

function clean(s: string): string {
  return s.replace(/\s+/g, ' ').trim();
}

function join(a: string, b: string): string {
  if (!a) return b;
  return CJK.test(a.at(-1)!) && CJK.test(b[0]!) ? a + b : `${a} ${b}`;
}

/**
 * 片段合并成句：句末标点、超过 MAX_GAP_MS 的停顿必断；
 * 超过字符或时长上限时在后半段挑最合适的位置切（见 bestBreak），切剩的词留给下一句。
 */
export function mergeSentences(frags: Fragment[], limits: CueLimits): Cue[] {
  const cues: Cue[] = [];
  let buf: Fragment[] = [];
  const flush = (fs: Fragment[]) => {
    if (fs.length === 0) return;
    cues.push({
      start: fs[0]!.start,
      end: Math.max(...fs.map((f) => f.end)),
      text: fs.reduce((acc, f) => join(acc, f.text), ''),
    });
  };
  const textLen = (fs: Fragment[]) => fs.reduce((n, f) => n + width(f.text) + 1, -1);

  for (const f of frags) {
    if (buf.length > 0) {
      const gap = f.start - buf.at(-1)!.end;
      const len = textLen(buf);
      if (gap > MAX_GAP_MS) {
        flush(buf);
        buf = [];
      } else if (len + 1 + width(f.text) > limits.chars || f.end - buf[0]!.start > limits.ms) {
        const k = bestBreak(buf, f);
        flush(buf.slice(0, k + 1));
        buf = buf.slice(k + 1);
      }
    }
    buf.push(f);
    if (SENTENCE_END.test(f.text)) {
      flush(buf);
      buf = [];
    }
  }
  flush(buf);
  // 相邻句时间不重叠：同一时刻只显示一句
  for (let i = 0; i < cues.length - 1; i++) cues[i]!.end = Math.min(cues[i]!.end, cues[i + 1]!.start);
  return cues;
}

/** 短句并进紧随其后的句子（"Hey everyone." + "I'm Boris." 这类），开始时间仍是第一句开口的时刻 */
function mergeShortCues(cues: Cue[], limits: CueLimits): Cue[] {
  const isShort = (c: Cue) => c.end - c.start < MIN_CUE_MS || width(c.text) < MIN_CUE_CHARS;
  const out: Cue[] = [];
  for (const c of cues) {
    const prev = out.at(-1);
    if (
      prev &&
      c.start - prev.end <= MERGE_GAP_MS &&
      (isShort(prev) || isShort(c)) &&
      width(prev.text) + 1 + width(c.text) <= limits.chars &&
      c.end - prev.start <= limits.ms
    ) {
      prev.text = join(prev.text, c.text);
      prev.end = c.end;
    } else {
      out.push({ ...c });
    }
  }
  return out;
}

/** 超长时的切分点：在 buf 后半段按"停顿长度 + 逗号 + 语言提示"打分，返回切在其后的下标（同分取靠后的） */
function bestBreak(buf: Fragment[], next: Fragment): number {
  const word = (f: Fragment) => f.text.toLowerCase().replace(/[^a-z']/g, '');
  let best = buf.length - 1;
  let bestScore = -Infinity;
  for (let i = Math.floor((buf.length - 1) / 2); i < buf.length; i++) {
    const after = i + 1 < buf.length ? buf[i + 1]! : next;
    const score =
      after.start -
      buf[i]!.end +
      (BREAK_BEFORE.has(word(after)) ? BREAK_BEFORE_BONUS_MS : 0) +
      (SOFT_BREAK.test(buf[i]!.text) ? SOFT_BREAK_BONUS_MS : 0) -
      (NO_BREAK_AFTER.has(word(buf[i]!)) ? NO_BREAK_AFTER_PENALTY_MS : 0);
    if (score >= bestScore) {
      bestScore = score;
      best = i;
    }
  }
  return best;
}

/** 二分查找当前时间所在的句子下标，不在任何句子里返回 -1 */
export function findCue(cues: Cue[], t: number): number {
  let lo = 0;
  let hi = cues.length - 1;
  while (lo <= hi) {
    const mid = (lo + hi) >> 1;
    const c = cues[mid]!;
    if (t < c.start) hi = mid - 1;
    else if (t >= c.end) lo = mid + 1;
    else return mid;
  }
  return -1;
}

/** 第一个尚未结束的句子下标（翻译队列从这里开始往后排） */
export function firstUpcoming(cues: Cue[], t: number): number {
  let lo = 0;
  let hi = cues.length;
  while (lo < hi) {
    const mid = (lo + hi) >> 1;
    if (cues[mid]!.end <= t) lo = mid + 1;
    else hi = mid;
  }
  return lo;
}
