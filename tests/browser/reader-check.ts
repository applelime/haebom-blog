/**
 * 실제 브라우저(Chrome headless) 확인 (Build and Test 단계)
 *
 * 실행: `npm run build` 뒤 `npx tsx tests/browser/reader-check.ts`
 * - 프로젝트 안 `.test-tmp/browser/`(git 제외)에 새 데이터베이스와 사진 폴더를 만들고 샘플 글을 넣습니다.
 *   글쓴이 컴퓨터의 `data/`, `uploads/`는 건드리지 않습니다.
 * - 실행 모드 서버를 127.0.0.1:3210에 띄우고, Chrome을 DevTools 프로토콜로 움직입니다(추가 설치 없음).
 * - 독자 화면은 `blog.test` 주소(같은 컴퓨터로 연결, Host가 localhost가 아님)로 열어 휴대폰과 같은 판단을 받게 합니다.
 * - Chrome 위치는 CHROME_PATH로 바꿀 수 있습니다. CI처럼 샌드박스가 막힌 곳에서는 CHROME_NO_SANDBOX=1을 둡니다.
 *
 * 확인하는 것: NFR1(빠른 4G 휴대폰에서 제목과 첫 사진 3초), NFR2(375px·1280px 가로 스크롤 없음),
 * NFR3(대체 텍스트, 글자 대비 4.5:1), FR1.2·FR1.3(배치 5가지와 휴대폰 배치, 손가락 넘기기),
 * FR1.5(사진이 없을 때 회색 자리와 설명), FR5.4(글쓰기 링크와 화면은 localhost에서만),
 * FR4.1·FR2.6·FR3(에디터 자동 저장, 실제 사진 올리기, 다시 열기).
 */
import { spawn, type ChildProcess } from 'node:child_process';
import { existsSync } from 'node:fs';
import { mkdir, readdir, rm } from 'node:fs/promises';
import path from 'node:path';
import sharp from 'sharp';

const ROOT = process.cwd();
const WORK_DIR = path.join(ROOT, '.test-tmp', 'browser');
const UPLOAD_DIR = path.join(WORK_DIR, 'uploads');
const DATABASE_URL = `file:${path.join(WORK_DIR, 'blog.db')}`;
const PORT = 3210;
const AUTHOR_ORIGIN = `http://127.0.0.1:${PORT}`;
const READER_ORIGIN = `http://blog.test:${PORT}`;
const ARTICLE = '/posts/lisbon-three-days';
const CHROME =
  process.env.CHROME_PATH || '/Applications/Google Chrome.app/Contents/MacOS/Google Chrome';
const TSX = path.join(ROOT, 'node_modules', '.bin', 'tsx');

/** Chrome DevTools의 "Fast 4G" 값: 내려받기 9Mbps, 올리기 1.5Mbps, 지연 165ms. 휴대폰 처리 속도는 4배 느리게. */
const FAST_4G = {
  offline: false,
  latency: 165,
  downloadThroughput: (9 * 1000 * 1000) / 8,
  uploadThroughput: (1.5 * 1000 * 1000) / 8,
};
const MOBILE = { width: 375, height: 812, deviceScaleFactor: 2, mobile: true };
const DESKTOP = { width: 1280, height: 800, deviceScaleFactor: 1, mobile: false };
const NFR1_LIMIT_MS = 3000;
const NFR1_RUNS = 3;

type Json = Record<string, unknown>;

interface Check {
  id: string;
  title: string;
  passed: boolean;
  detail: unknown;
}

const checks: Check[] = [];

function record(id: string, title: string, passed: boolean, detail: unknown): void {
  checks.push({ id, title, passed, detail });
  console.log(`${passed ? 'PASS' : 'FAIL'}  ${id}  ${title}`);
  console.log(`      ${JSON.stringify(detail)}`);
}

function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

/* ---------- 프로세스 ---------- */

function run(command: string, args: string[], env: NodeJS.ProcessEnv): Promise<void> {
  return new Promise((resolve, reject) => {
    const child = spawn(command, args, { cwd: ROOT, env, stdio: 'inherit' });
    child.on('error', reject);
    child.on('exit', (code) =>
      code === 0 ? resolve() : reject(new Error(`${command} ${args.join(' ')} 종료 코드 ${code}`)),
    );
  });
}

function waitForOutput(
  child: ChildProcess,
  stream: 'stdout' | 'stderr',
  pattern: RegExp,
  timeoutMs: number,
): Promise<RegExpMatchArray> {
  return new Promise((resolve, reject) => {
    let buffer = '';
    const timer = setTimeout(
      () => reject(new Error(`${timeoutMs}ms 안에 "${pattern}" 출력이 없습니다: ${buffer}`)),
      timeoutMs,
    );
    child[stream]?.on('data', (chunk: Buffer) => {
      buffer += chunk.toString();
      const match = buffer.match(pattern);
      if (match) {
        clearTimeout(timer);
        resolve(match);
      }
    });
    child.on('exit', (code) => {
      clearTimeout(timer);
      reject(new Error(`프로세스가 먼저 끝났습니다(종료 코드 ${code}): ${buffer}`));
    });
  });
}

/* ---------- DevTools 프로토콜 ---------- */

interface CdpMessage {
  id?: number;
  result?: Json;
  error?: { message: string };
  method?: string;
  params?: Json;
  sessionId?: string;
}

class Cdp {
  private nextId = 1;
  private pending = new Map<number, { resolve: (v: Json) => void; reject: (e: Error) => void }>();
  private listeners = new Set<(message: CdpMessage) => void>();

  private constructor(private socket: WebSocket) {
    socket.addEventListener('message', (event: MessageEvent) => {
      const message = JSON.parse(String(event.data)) as CdpMessage;
      if (message.id !== undefined) {
        const waiter = this.pending.get(message.id);
        if (!waiter) return;
        this.pending.delete(message.id);
        if (message.error) waiter.reject(new Error(message.error.message));
        else waiter.resolve(message.result ?? {});
        return;
      }
      for (const listener of this.listeners) listener(message);
    });
  }

  static connect(url: string): Promise<Cdp> {
    return new Promise((resolve, reject) => {
      const socket = new WebSocket(url);
      socket.addEventListener('open', () => resolve(new Cdp(socket)));
      socket.addEventListener('error', () =>
        reject(new Error(`DevTools에 연결하지 못했습니다: ${url}`)),
      );
    });
  }

  send(method: string, params: Json = {}, sessionId?: string): Promise<Json> {
    const id = this.nextId++;
    return new Promise((resolve, reject) => {
      this.pending.set(id, { resolve, reject });
      this.socket.send(JSON.stringify({ id, method, params, sessionId }));
    });
  }

  waitFor(method: string, sessionId: string, timeoutMs: number): Promise<Json> {
    return new Promise((resolve, reject) => {
      const timer = setTimeout(() => {
        this.listeners.delete(listener);
        reject(new Error(`${timeoutMs}ms 안에 ${method}이 오지 않았습니다`));
      }, timeoutMs);
      const listener = (message: CdpMessage) => {
        if (message.method === method && message.sessionId === sessionId) {
          clearTimeout(timer);
          this.listeners.delete(listener);
          resolve(message.params ?? {});
        }
      };
      this.listeners.add(listener);
    });
  }

  onEvent(method: string, sessionId: string, handler: (params: Json) => void): void {
    this.listeners.add((message) => {
      if (message.method === method && message.sessionId === sessionId)
        handler(message.params ?? {});
    });
  }

  close(): void {
    this.socket.close();
  }
}

class Page {
  constructor(
    private cdp: Cdp,
    private sessionId: string,
  ) {}

  send(method: string, params: Json = {}): Promise<Json> {
    return this.cdp.send(method, params, this.sessionId);
  }

  async goto(url: string): Promise<void> {
    const loaded = this.cdp.waitFor('Page.loadEventFired', this.sessionId, 60_000);
    // 이동이 실패하면 기다리던 쪽은 버립니다(처리되지 않은 거절로 끝나지 않게).
    loaded.catch(() => undefined);
    const result = await this.send('Page.navigate', { url });
    if (typeof result.errorText === 'string') throw new Error(`${url}: ${result.errorText}`);
    await loaded;
  }

  /** 떠나기 전 확인 창(beforeunload) 같은 대화 상자는 자동으로 받아들입니다. */
  acceptDialogs(): void {
    this.cdp.onEvent('Page.javascriptDialogOpening', this.sessionId, () => {
      void this.send('Page.handleJavaScriptDialog', { accept: true });
    });
  }

  async evaluate<T>(expression: string): Promise<T> {
    const result = await this.send('Runtime.evaluate', {
      expression,
      awaitPromise: true,
      returnByValue: true,
    });
    const exception = result.exceptionDetails as Json | undefined;
    if (exception) throw new Error(`페이지 스크립트 오류: ${JSON.stringify(exception)}`);
    return (result.result as { value: T }).value;
  }

  async waitUntil(expression: string, timeoutMs: number): Promise<number> {
    const started = Date.now();
    while (Date.now() - started < timeoutMs) {
      if (await this.evaluate<boolean>(`Boolean(${expression})`)) return Date.now() - started;
      await sleep(200);
    }
    throw new Error(`${timeoutMs}ms 안에 조건이 맞지 않았습니다: ${expression}`);
  }

  setViewport(metrics: typeof MOBILE): Promise<Json> {
    return this.send('Emulation.setDeviceMetricsOverride', metrics);
  }

  async setNetwork(conditions: typeof FAST_4G | null, cpuRate: number): Promise<void> {
    await this.send(
      'Network.emulateNetworkConditions',
      conditions ?? { offline: false, latency: 0, downloadThroughput: -1, uploadThroughput: -1 },
    );
    await this.send('Emulation.setCPUThrottlingRate', { rate: cpuRate });
  }
}

/* ---------- 페이지 안에서 재는 식 ---------- */

const MEASURE_NFR1 = `(async () => {
  await new Promise((r) => setTimeout(r, 2500));
  const entries = await new Promise((resolve) => {
    const list = [];
    const observer = new PerformanceObserver((l) => list.push(...l.getEntries()));
    observer.observe({ type: 'largest-contentful-paint', buffered: true });
    setTimeout(() => { observer.disconnect(); resolve(list); }, 300);
  });
  const title = document.querySelector('article h1');
  const photo = document.querySelector('article img');
  const paintOf = (el) => {
    const hit = entries.filter((e) => e.element === el).pop();
    return hit ? Math.round(hit.renderTime || hit.loadTime || hit.startTime) : null;
  };
  const fcp = performance.getEntriesByName('first-contentful-paint')[0];
  const resource = photo ? performance.getEntriesByName(photo.currentSrc)[0] : undefined;
  return {
    fcp: fcp ? Math.round(fcp.startTime) : null,
    titlePaint: paintOf(title),
    photoPaint: paintOf(photo),
    photoResponseEnd: resource ? Math.round(resource.responseEnd) : null,
    photoLoaded: Boolean(photo && photo.complete && photo.naturalWidth > 0),
    photoSrc: photo ? photo.currentSrc.replace(location.origin, '') : null,
  };
})()`;

const MEASURE_SCROLL = `({
  scrollWidth: document.documentElement.scrollWidth,
  innerWidth: window.innerWidth,
})`;

const MEASURE_LAYOUT = `(() => {
  const box = (el) => {
    if (!el) return null;
    const r = el.getBoundingClientRect();
    return { left: Math.round(r.left), right: Math.round(r.right), top: Math.round(r.top), bottom: Math.round(r.bottom), width: Math.round(r.width) };
  };
  const row = document.querySelector('[data-testid="block-photo-row"]');
  const side = document.querySelector('[data-testid="block-photo-side"]');
  const track = document.querySelector('[data-testid="block-gallery"] .track');
  const style = track ? getComputedStyle(track) : null;
  return {
    viewport: window.innerWidth,
    full: box(document.querySelector('[data-testid="block-photo-full"] .photo')),
    body: box(document.querySelector('[data-testid="block-photo-body"] .photo')),
    row: row ? Array.from(row.querySelectorAll(':scope > .photo')).map(box) : [],
    sidePhoto: box(side && side.querySelector('.side-photo')),
    sideText: box(side && side.querySelector('.txt')),
    track: track ? { overflowX: style.overflowX, snap: style.scrollSnapType, scrollWidth: track.scrollWidth, clientWidth: track.clientWidth, items: track.children.length } : null,
  };
})()`;

const MEASURE_A11Y = `(() => {
  const parse = (c) => {
    const m = c.match(/rgba?\\(([^)]+)\\)/);
    if (!m) return null;
    const p = m[1].split(/[\\s,/]+/).filter(Boolean).map(Number);
    return { r: p[0], g: p[1], b: p[2], a: p.length > 3 ? p[3] : 1 };
  };
  const lum = ({ r, g, b }) => {
    const f = (v) => { v /= 255; return v <= 0.03928 ? v / 12.92 : Math.pow((v + 0.055) / 1.055, 2.4); };
    return 0.2126 * f(r) + 0.7152 * f(g) + 0.0722 * f(b);
  };
  const background = (el) => {
    for (let n = el; n; n = n.parentElement) {
      const c = parse(getComputedStyle(n).backgroundColor);
      if (c && c.a > 0) return c;
    }
    return { r: 255, g: 255, b: 255, a: 1 };
  };
  const selectors = ['.prose p', '.dek', '.date', '.topic', 'figcaption', '.tags a', '.pull', 'h1', '.photo-fallback'];
  const contrast = [];
  for (const selector of selectors) {
    const el = document.querySelector(selector);
    if (!el) continue;
    const fg = parse(getComputedStyle(el).color);
    const bg = background(el);
    const a = lum(fg), b = lum(bg);
    contrast.push({ selector, color: getComputedStyle(el).color, ratio: Math.round(((Math.max(a, b) + 0.05) / (Math.min(a, b) + 0.05)) * 100) / 100 });
  }
  const images = Array.from(document.querySelectorAll('main img, article img'));
  const fallbacks = Array.from(document.querySelectorAll('[role="img"]'));
  return {
    images: images.length,
    missingAlt: images.filter((i) => !i.getAttribute('alt') || !i.getAttribute('alt').trim()).length,
    fallbacksWithoutLabel: fallbacks.filter((f) => !(f.getAttribute('aria-label') || '').trim()).length,
    contrast,
  };
})()`;

/* ---------- 확인 ---------- */

async function checkNfr1(page: Page): Promise<void> {
  await page.setViewport(MOBILE);
  await page.send('Emulation.setTouchEmulationEnabled', { enabled: true });
  await page.send('Network.setCacheDisabled', { cacheDisabled: true });
  await page.setNetwork(FAST_4G, 4);
  const runs: Json[] = [];
  for (let i = 0; i < NFR1_RUNS; i++) {
    await page.send('Network.clearBrowserCache');
    await page.goto(`${READER_ORIGIN}${ARTICLE}`);
    const m = await page.evaluate<Json>(MEASURE_NFR1);
    const title = (m.titlePaint as number | null) ?? (m.fcp as number | null);
    const photo = (m.photoPaint as number | null) ?? (m.photoResponseEnd as number | null);
    runs.push({ ...m, titleMs: title, firstPhotoMs: photo });
  }
  await page.setNetwork(null, 1);
  await page.send('Network.setCacheDisabled', { cacheDisabled: false });
  const worstTitle = Math.max(...runs.map((r) => Number(r.titleMs ?? Infinity)));
  const worstPhoto = Math.max(...runs.map((r) => Number(r.firstPhotoMs ?? Infinity)));
  const allLoaded = runs.every((r) => r.photoLoaded === true);
  record(
    'NFR1',
    `빠른 4G 휴대폰(375px, 처리 4배 느림, 캐시 없음)에서 제목과 첫 사진이 ${NFR1_LIMIT_MS}ms 안에 보임 (${NFR1_RUNS}회 중 가장 느린 값)`,
    allLoaded && worstTitle <= NFR1_LIMIT_MS && worstPhoto <= NFR1_LIMIT_MS,
    { worstTitleMs: worstTitle, worstFirstPhotoMs: worstPhoto, runs },
  );
}

const READER_PAGES = [
  '/',
  ARTICLE,
  '/posts',
  '/topics/travel',
  '/topics/work',
  `/tags/${encodeURIComponent('리스본')}`,
  `/search?q=${encodeURIComponent('리스본')}`,
  `/search?q=${encodeURIComponent('없는단어')}`,
  '/posts/no-such-post',
];

async function checkNfr2(page: Page): Promise<void> {
  for (const [label, metrics] of [
    ['375px', MOBILE],
    ['1280px', DESKTOP],
  ] as const) {
    await page.setViewport(metrics);
    const results: Json[] = [];
    for (const url of READER_PAGES) {
      await page.goto(`${READER_ORIGIN}${url}`);
      await sleep(300);
      const m = await page.evaluate<{ scrollWidth: number; innerWidth: number }>(MEASURE_SCROLL);
      results.push({ url: decodeURIComponent(url), ...m, ok: m.scrollWidth <= m.innerWidth });
    }
    record(
      `NFR2-${label}`,
      `읽는 화면 ${READER_PAGES.length}곳이 ${label}에서 가로 스크롤 없음`,
      results.every((r) => r.ok === true),
      results.filter((r) => r.ok !== true).length ? results.filter((r) => r.ok !== true) : 'all ok',
    );
  }
}

interface Box {
  left: number;
  right: number;
  top: number;
  bottom: number;
  width: number;
}
interface Layout {
  viewport: number;
  full: Box | null;
  body: Box | null;
  row: Box[];
  sidePhoto: Box | null;
  sideText: Box | null;
  track: {
    overflowX: string;
    snap: string;
    scrollWidth: number;
    clientWidth: number;
    items: number;
  } | null;
}

async function checkLayouts(page: Page): Promise<void> {
  // 컴퓨터 화면: 배치 5가지(FR1.2)
  await page.setViewport(DESKTOP);
  await page.goto(`${READER_ORIGIN}${ARTICLE}`);
  await sleep(800);
  const d = await page.evaluate<Layout>(MEASURE_LAYOUT);
  const rowOneLine = d.row.length === 3 && new Set(d.row.map((b) => b.top)).size === 1;
  const sideBySide =
    !!d.sidePhoto &&
    !!d.sideText &&
    (d.sideText.right <= d.sidePhoto.left || d.sideText.left >= d.sidePhoto.right);
  const fullWidth = !!d.full && d.full.width >= d.viewport - 1;
  const bodyNarrow = !!d.body && d.body.width < d.viewport * 0.6;
  const galleryScrolls = !!d.track && d.track.scrollWidth > d.track.clientWidth;
  record(
    'FR1.2-1280px',
    '컴퓨터 화면에서 [1] 화면 폭, [2] 본문 폭, [3] 3장 한 줄, [4] 사진과 글 좌우, [5] 옆으로 넘기는 모아 보기',
    fullWidth && bodyNarrow && rowOneLine && sideBySide && galleryScrolls,
    { fullWidth, bodyNarrow, rowOneLine, sideBySide, galleryScrolls, layout: d },
  );

  // 글 본문 순서(FR1.1). 머리 순서는 확정 시안(세부 목업 RM-Q10, RM-Q11)의 주제, 제목, 소개 문장, 날짜입니다.
  const order = await page.evaluate<{
    head: string[];
    blocksAfterHead: boolean;
    tagsLast: boolean;
  }>(
    `(() => {
      const article = document.querySelector('article');
      const head = Array.from(article.querySelector('header').children).map((el) =>
        el.tagName === 'H1' ? 'title' : el.className.split(' ')[0]);
      const kids = Array.from(article.children);
      const tagsIndex = kids.findIndex((el) => el.querySelector('.tags'));
      return {
        head,
        blocksAfterHead: kids[0].tagName === 'HEADER' && kids.length > 2,
        tagsLast: tagsIndex === kids.length - 1,
      };
    })()`,
  );
  record(
    'FR1.1',
    '글 본문이 주제, 제목, 소개 문장, 날짜, 본문 블록, 태그 순서로 보임',
    order.head.join(',') === 'topic,title,dek,date' && order.blocksAfterHead && order.tagsLast,
    order,
  );

  // 태그를 누르면 같은 태그의 글 모아보기로 이동(FR1.4)
  const tagHref = await page.evaluate<string>(
    `document.querySelector('[data-testid="article-tag-link"]').getAttribute('href')`,
  );
  await page.goto(`${READER_ORIGIN}${tagHref}`);
  const tagPage = await page.evaluate<{ path: string; listsArticle: boolean }>(`({
    path: decodeURIComponent(location.pathname),
    listsArticle: document.body.innerText.includes('리스본, 노란 트램을 따라 걸은 사흘'),
  })`);
  record(
    'FR1.4',
    '글의 태그 링크가 그 태그의 모아보기로 가고, 그 글이 목록에 있음',
    tagPage.path === '/tags/리스본' && tagPage.listsArticle,
    { tagHref: decodeURIComponent(tagHref), ...tagPage },
  );

  // 휴대폰 화면: [3] 2열, [4] 세로, [5] 손가락으로 넘기기(FR1.3)
  await page.setViewport(MOBILE);
  await page.send('Emulation.setTouchEmulationEnabled', { enabled: true });
  await page.goto(`${READER_ORIGIN}${ARTICLE}`);
  await sleep(800);
  const m = await page.evaluate<Layout>(MEASURE_LAYOUT);
  const rowTwoColumns =
    m.row.length === 3 && m.row[0].top === m.row[1].top && m.row[2].top > m.row[0].top;
  const sideStacked = !!m.sidePhoto && !!m.sideText && m.sideText.top >= m.sidePhoto.bottom - 1;
  const trackSwipeable =
    !!m.track &&
    (m.track.overflowX === 'auto' || m.track.overflowX === 'scroll') &&
    m.track.snap.includes('x') &&
    m.track.scrollWidth > m.track.clientWidth;

  // html의 scroll-behavior: smooth 때문에 바로 이동시키고, 멈출 때까지 기다린 뒤 위치를 잽니다.
  await page.evaluate(
    `document.querySelector('[data-testid="block-gallery"] .track').scrollIntoView({ block: 'center', behavior: 'instant' })`,
  );
  await sleep(1000);
  const trackBox = await page.evaluate<Box>(`(() => {
    const r = document.querySelector('[data-testid="block-gallery"] .track').getBoundingClientRect();
    return { left: r.left, right: r.right, top: r.top, bottom: r.bottom, width: r.width };
  })()`);
  await page.send('Input.synthesizeScrollGesture', {
    x: Math.round(trackBox.left + trackBox.width * 0.7),
    y: Math.round((trackBox.top + trackBox.bottom) / 2),
    xDistance: -Math.round(trackBox.width * 0.6),
    yDistance: 0,
    gestureSourceType: 'touch',
    speed: 800,
  });
  await sleep(1500);
  const after = await page.evaluate<{ position: string; scrollLeft: number }>(`({
    position: document.querySelector('[data-testid="gallery-position"]').textContent.trim(),
    scrollLeft: Math.round(document.querySelector('[data-testid="block-gallery"] .track').scrollLeft),
  })`);
  const swiped = after.scrollLeft > 0 && !after.position.startsWith('1 /');
  record(
    'FR1.3-375px',
    '휴대폰 화면에서 [3] 2장씩 줄 바꿈, [4] 사진 아래 글, [5] 손가락으로 넘기면 다음 사진',
    rowTwoColumns && sideStacked && trackSwipeable && swiped,
    { rowTwoColumns, sideStacked, trackSwipeable, afterSwipe: after, trackBox, layout: m },
  );
}

async function checkNfr3(page: Page): Promise<void> {
  const results: Json[] = [];
  for (const url of ['/', ARTICLE]) {
    await page.setViewport(DESKTOP);
    await page.goto(`${READER_ORIGIN}${url}`);
    await sleep(500);
    const m = await page.evaluate<{
      images: number;
      missingAlt: number;
      fallbacksWithoutLabel: number;
      contrast: { selector: string; ratio: number }[];
    }>(MEASURE_A11Y);
    results.push({ url, ...m });
  }
  const ok = results.every(
    (r) =>
      r.missingAlt === 0 &&
      r.fallbacksWithoutLabel === 0 &&
      (r.contrast as { ratio: number }[]).every((c) => c.ratio >= 4.5),
  );
  record(
    'NFR3',
    '첫 화면과 글 본문의 모든 사진에 대체 텍스트, 본문·날짜·설명·주제·태그 글자 대비 4.5:1 이상',
    ok,
    results,
  );
}

async function checkAuthorSplit(page: Page): Promise<void> {
  await page.setViewport(DESKTOP);
  await page.goto(`${READER_ORIGIN}/`);
  const readerHasWrite = await page.evaluate<boolean>(
    `Boolean(document.querySelector('[data-testid="masthead-write-link"]'))`,
  );
  await page.goto(`${READER_ORIGIN}/write`);
  await sleep(500);
  const readerWriteText = await page.evaluate<string>(`document.body.innerText`);
  await page.goto(`${AUTHOR_ORIGIN}/`);
  const authorHasWrite = await page.evaluate<boolean>(
    `Boolean(document.querySelector('[data-testid="masthead-write-link"]'))`,
  );
  const readerBlocked = readerWriteText.includes('글을 찾을 수 없습니다');
  record(
    'FR5.4',
    'localhost로 연 화면에만 글쓰기 링크, 다른 주소로 연 /write는 "글을 찾을 수 없습니다"',
    !readerHasWrite && readerBlocked && authorHasWrite,
    {
      readerHasWrite,
      readerBlocked,
      authorHasWrite,
      readerWriteText: readerWriteText.slice(0, 200),
    },
  );
}

async function checkEditor(page: Page): Promise<void> {
  await page.setViewport(DESKTOP);
  await page.goto(`${AUTHOR_ORIGIN}/write`);
  await page.waitUntil(`document.querySelector('[data-testid$="new-button"]')`, 10_000);
  await page.evaluate(`document.querySelector('[data-testid$="new-button"]').click()`);
  await page.waitUntil(
    `/^\\/write\\/[^/]+$/.test(location.pathname) && document.querySelector('[data-testid="editor-title-input"]')`,
    20_000,
  );
  await sleep(800);
  const editorUrl = await page.evaluate<string>('location.href');

  await page.evaluate(`document.querySelector('[data-testid="editor-title-input"]').focus()`);
  await page.send('Input.insertText', { text: '브라우저 확인 글' });
  const savedAfterMs = await page.waitUntil(
    `document.querySelector('[data-testid="editor-save-status"]').textContent.trim() === '저장됨'`,
    15_000,
  );

  await page.evaluate(
    `document.querySelector('[data-testid="editor-add-photo-body-button"]').click()`,
  );
  await sleep(300);
  const jpg = path.join(WORK_DIR, 'upload-sample.jpg');
  await sharp({ create: { width: 1800, height: 1200, channels: 3, background: '#6a8caf' } })
    .jpeg({ quality: 80 })
    .toFile(jpg);
  const doc = await page.send('DOM.getDocument', { depth: 0 });
  const input = await page.send('DOM.querySelector', {
    nodeId: (doc.root as { nodeId: number }).nodeId,
    selector: '[data-testid="block-photo-file-input"]',
  });
  await page.send('DOM.setFileInputFiles', { nodeId: input.nodeId, files: [jpg] });
  const uploadedAfterMs = await page.waitUntil(
    `document.querySelector('[data-testid="block-photo-item"] img')`,
    30_000,
  );
  const uploadError = await page.evaluate<string | null>(
    `(document.querySelector('[data-testid="block-invalid-file-error"], .err') || {}).textContent || null`,
  );
  // 주제, 태그, 사진 설명, 소개 문장, 공개 범위를 바꾸고 저장 버튼으로 바로 저장합니다(FR2.1, FR2.5, FR8.2, FR5.1, FR4.2).
  await page.evaluate(`(() => {
    const pick = (selector, value) => {
      const el = document.querySelector(selector);
      Object.getOwnPropertyDescriptor(HTMLSelectElement.prototype, 'value').set.call(el, value);
      el.dispatchEvent(new Event('change', { bubbles: true }));
    };
    pick('[data-testid="editor-topic-select"]', 'taste');
    pick('[data-testid="editor-visibility-select"]', 'private');
  })()`);
  await typeInto(page, '[data-testid="editor-tags-input"]', '#브라우저 #확인');
  await typeInto(page, '[data-testid="block-photo-caption-input"]', '파란 하늘 시험 사진');
  await page.evaluate(
    `document.querySelector('[data-testid="editor-cover-toggle-button"]').click()`,
  );
  await page.waitUntil(`document.querySelector('[data-testid="editor-dek-input"]')`, 5_000);
  await typeInto(page, '[data-testid="editor-dek-input"]', '직접 쓴 소개 문장');
  await page.evaluate(`document.querySelector('[data-testid="editor-save-button"]').click()`);
  const savedByButtonMs = await page.waitUntil(
    `document.querySelector('[data-testid="editor-save-status"]').textContent.trim() === '저장됨'`,
    4_000,
  );

  // 미리보기(FR2.8): 같은 블록 그리기 부품으로 제목과 사진 설명이 보입니다.
  await page.evaluate(`document.querySelector('[data-testid="editor-preview-button"]').click()`);
  await page.waitUntil(`document.querySelector('[data-testid="preview-dialog"]')?.open`, 5_000);
  const preview = await page.evaluate<{ title: boolean; caption: boolean; dek: boolean }>(`(() => {
    const text = document.querySelector('[data-testid="preview-dialog"]').innerText;
    return { title: text.includes('브라우저 확인 글'), caption: text.includes('파란 하늘 시험 사진'), dek: text.includes('직접 쓴 소개 문장') };
  })()`);
  await page.evaluate(
    `document.querySelector('[data-testid="preview-dialog-close-button"]').click()`,
  );

  await page.goto(editorUrl);
  await page.waitUntil(`document.querySelector('[data-testid="editor-title-input"]')`, 10_000);
  const reopened = await page.evaluate<{
    title: string;
    photos: number;
    topic: string;
    tags: string;
    caption: string;
    visibility: string;
  }>(`({
    title: document.querySelector('[data-testid="editor-title-input"]').value,
    photos: document.querySelectorAll('[data-testid="block-photo-item"]').length,
    topic: document.querySelector('[data-testid="editor-topic-select"]').value,
    tags: document.querySelector('[data-testid="editor-tags-input"]').value,
    caption: (document.querySelector('[data-testid="block-photo-caption-input"]') || {}).value || '',
    visibility: document.querySelector('[data-testid="editor-visibility-select"]').value,
  })`);
  await page.evaluate(
    `document.querySelector('[data-testid="editor-cover-toggle-button"]').click()`,
  );
  await page.waitUntil(`document.querySelector('[data-testid="editor-dek-input"]')`, 5_000);
  const reopenedDek = await page.evaluate<string>(
    `document.querySelector('[data-testid="editor-dek-input"]').value`,
  );
  const kept =
    reopened.title === '브라우저 확인 글' &&
    reopened.photos === 1 &&
    reopened.topic === 'taste' &&
    reopened.tags.includes('브라우저') &&
    reopened.tags.includes('확인') &&
    reopened.caption === '파란 하늘 시험 사진' &&
    reopened.visibility === 'private' &&
    reopenedDek === '직접 쓴 소개 문장';
  record(
    'FR4.1-FR2.6',
    '실제 브라우저 에디터: 10초 안 자동 "저장됨", 사진 파일 올리기(fetch), 주제·태그·사진 설명·소개 문장·공개 범위, 저장 버튼, 미리보기, 다시 열면 모두 유지',
    savedAfterMs <= 10_000 &&
      !uploadError &&
      kept &&
      preview.title &&
      preview.caption &&
      preview.dek,
    { savedAfterMs, uploadedAfterMs, uploadError, savedByButtonMs, preview, reopened, reopenedDek },
  );
}

/** 입력칸에 초점을 주고 실제 키보드 입력처럼 글자를 넣습니다. */
async function typeInto(page: Page, selector: string, text: string): Promise<void> {
  await page.evaluate(`document.querySelector('${selector}').focus()`);
  await page.send('Input.insertText', { text });
  await sleep(200);
}

async function checkMissingPhoto(page: Page): Promise<void> {
  await page.setViewport(DESKTOP);
  await page.goto(`${READER_ORIGIN}${ARTICLE}`);
  const src = await page.evaluate<string>(
    `document.querySelector('[data-testid="block-photo-body"] img').getAttribute('src')`,
  );
  const id = src.split('/')[2];
  const variants = path.join(UPLOAD_DIR, 'variants');
  for (const name of await readdir(variants)) {
    if (name.startsWith(`${id}-`)) await rm(path.join(variants, name));
  }
  await page.send('Network.setCacheDisabled', { cacheDisabled: true });
  await page.send('Network.clearBrowserCache');
  await page.goto(`${READER_ORIGIN}${ARTICLE}`);
  await page.evaluate(
    `document.querySelector('[data-testid="block-photo-body"]').scrollIntoView({ block: 'center' })`,
  );
  await sleep(2000);
  const state = await page.evaluate<Json>(`(() => {
    const block = document.querySelector('[data-testid="block-photo-body"]');
    const full = document.querySelector('[data-testid="block-photo-full"] img');
    return {
      failedBox: Boolean(block.querySelector('.photo.is-failed')),
      fallbackText: (block.querySelector('.photo-fallback') || {}).textContent || null,
      fullPhotoStillLoaded: Boolean(full && full.complete && full.naturalWidth > 0),
      laterTextVisible: Boolean(document.querySelector('[data-testid="block-quote"]')),
    };
  })()`);
  await page.send('Network.setCacheDisabled', { cacheDisabled: false });
  record(
    'FR1.5',
    '사진 파일이 없을 때 그 자리에 회색 상자와 사진 설명, 나머지 사진과 글은 그대로',
    state.failedBox === true &&
      typeof state.fallbackText === 'string' &&
      state.fallbackText.length > 0 &&
      state.fullPhotoStillLoaded === true &&
      state.laterTextVisible === true,
    { photoId: id, ...state },
  );
}

/* ---------- 실행 ---------- */

async function main(): Promise<void> {
  if (!existsSync(path.join(ROOT, '.next', 'BUILD_ID'))) {
    throw new Error('먼저 `npm run build`로 실행 모드 빌드를 만들어 주세요.');
  }
  if (!existsSync(CHROME))
    throw new Error(`Chrome을 찾지 못했습니다: ${CHROME} (CHROME_PATH로 지정)`);

  await rm(WORK_DIR, { recursive: true, force: true });
  await mkdir(WORK_DIR, { recursive: true });
  const env = { ...process.env, DATABASE_URL, UPLOAD_DIR, PORT: String(PORT), HOST: '127.0.0.1' };
  await run(TSX, ['scripts/seed.ts'], env);

  // 따로 프로세스 묶음으로 띄워, 끝날 때 tsx가 띄운 node까지 함께 끕니다.
  const server = spawn(TSX, ['server.ts', '--production'], { cwd: ROOT, env, detached: true });
  server.stderr?.on('data', (chunk: Buffer) => process.stderr.write(chunk));
  const chrome = spawn(
    CHROME,
    [
      '--headless=new',
      '--remote-debugging-port=0',
      `--user-data-dir=${path.join(WORK_DIR, 'chrome-profile')}`,
      '--no-first-run',
      '--no-default-browser-check',
      '--disable-extensions',
      '--disable-features=HttpsUpgrades,HttpsFirstBalancedModeAutoEnable',
      '--host-resolver-rules=MAP blog.test 127.0.0.1',
      // GitHub Actions의 Ubuntu 24.04는 Chrome 샌드박스를 막아서, CI에서만 CHROME_NO_SANDBOX=1로 끕니다.
      ...(process.env.CHROME_NO_SANDBOX === '1' ? ['--no-sandbox'] : []),
      'about:blank',
    ],
    { detached: true },
  );
  const stopAll = () => {
    for (const child of [chrome, server]) {
      try {
        if (child.pid) process.kill(-child.pid, 'SIGTERM');
      } catch {
        // 이미 끝난 프로세스
      }
    }
  };
  process.once('uncaughtException', (error) => {
    stopAll();
    throw error;
  });
  let cdp: Cdp | null = null;
  try {
    await waitForOutput(server, 'stdout', /실행 중입니다/, 60_000);
    const [, wsUrl] = await waitForOutput(
      chrome,
      'stderr',
      /DevTools listening on (ws:\/\/\S+)/,
      30_000,
    );
    cdp = await Cdp.connect(wsUrl);
    const { targetId } = (await cdp.send('Target.createTarget', { url: 'about:blank' })) as {
      targetId: string;
    };
    const { sessionId } = (await cdp.send('Target.attachToTarget', {
      targetId,
      flatten: true,
    })) as {
      sessionId: string;
    };
    const page = new Page(cdp, sessionId);
    await page.send('Page.enable');
    await page.send('Network.enable');
    await page.send('Runtime.enable');
    page.acceptDialogs();
    const version = await cdp.send('Browser.getVersion');
    console.log(`브라우저: ${String(version.product)}`);

    const steps: [string, (p: Page) => Promise<void>][] = [
      ['NFR1', checkNfr1],
      ['NFR2', checkNfr2],
      ['FR1.2/FR1.3', checkLayouts],
      ['NFR3', checkNfr3],
      ['FR5.4', checkAuthorSplit],
      ['FR4.1/FR2.6', checkEditor],
      ['FR1.5', checkMissingPhoto],
    ];
    for (const [id, step] of steps) {
      try {
        await step(page);
      } catch (error) {
        record(id, '확인 도중 오류', false, String(error));
      }
    }
  } finally {
    cdp?.close();
    stopAll();
  }

  const failed = checks.filter((c) => !c.passed);
  console.log(`\n결과: ${checks.length - failed.length}/${checks.length} 통과`);
  if (failed.length > 0) process.exitCode = 1;
}

main().catch((error: unknown) => {
  console.error('브라우저 확인을 마치지 못했습니다.', error);
  process.exitCode = 1;
});
