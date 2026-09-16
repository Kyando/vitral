/**
 * Captures the README media (screenshots + drag-and-drop GIF) from the production build.
 *   npm run media
 * Drives the locally installed Microsoft Edge through playwright-core (no browser download).
 * Set CAPTURE_CHANNEL=chrome to use Google Chrome instead.
 */
import { mkdirSync, readdirSync, readFileSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import gifenc from 'gifenc';
import pngjs from 'pngjs';
import { chromium, type Browser, type Page } from 'playwright-core';
import { preview } from 'vite';
import type { LevelDef } from '../src/core/types.ts';
import { SAVE_KEY } from '../src/game/save.ts';

const { GIFEncoder, quantize, applyPalette } = gifenc;
const { PNG } = pngjs;

const root = join(import.meta.dirname, '..');
const outDir = join(root, 'docs/media');
const PORT = 4179;
const BASE_URL = `http://localhost:${PORT}/`;

interface Setup {
  level: string;
  theme?: 'light' | 'dark';
  /** die index -> "row,col" */
  placements?: Record<string, string>;
}

interface Point {
  x: number;
  y: number;
}

const saveData = (setup: Setup): string =>
  JSON.stringify({
    version: 1,
    levels: { [setup.level]: { placements: setup.placements ?? {}, done: false, moves: 0 } },
    settings: { theme: setup.theme ?? 'light', sound: false, seenHelp: true, lastLevel: setup.level, seenLessons: ALL_LESSONS },
  });

/** A visible arrow cursor, since headless screenshots don't include the real one. */
const CURSOR_SCRIPT = `
addEventListener('DOMContentLoaded', () => {
  const c = document.createElement('div');
  c.innerHTML = '<svg viewBox="0 0 24 24" width="30" height="30"><path d="M5 3l14 8.2-6.2 1.6L9.6 19z" fill="#fffaf1" stroke="#3b2b20" stroke-width="2" stroke-linejoin="round"/></svg>';
  Object.assign(c.style, { position: 'fixed', left: 0, top: 0, zIndex: 9999, pointerEvents: 'none', transformOrigin: '6px 4px', transition: 'scale .12s', transform: 'translate(-100px,-100px)' });
  document.body.append(c);
  const move = (e) => { c.style.transform = 'translate(' + (e.clientX - 6) + 'px,' + (e.clientY - 4) + 'px)'; };
  document.addEventListener('pointermove', move, true);
  document.addEventListener('pointerdown', (e) => { move(e); c.style.scale = '.82'; }, true);
  document.addEventListener('pointerup', () => { c.style.scale = '1'; }, true);
});`;

async function open(
  browser: Browser,
  setup: Setup,
  viewport: { width: number; height: number },
  { scale = 1, mobile = false, cursor = false } = {},
): Promise<Page> {
  const context = await browser.newContext({
    viewport,
    deviceScaleFactor: scale,
    isMobile: mobile,
    hasTouch: mobile,
    colorScheme: setup.theme ?? 'light',
  });
  await context.addInitScript(
    ({ key, data }) => {
      if (!sessionStorage.getItem('seeded')) {
        localStorage.setItem(key, data);
        sessionStorage.setItem('seeded', '1');
      }
    },
    { key: SAVE_KEY, data: saveData(setup) },
  );
  if (cursor) await context.addInitScript(CURSOR_SCRIPT);
  const page = await context.newPage();
  page.on('pageerror', (err) => console.error('  erro na página:', err.message));
  page.on('console', (msg) => msg.type() === 'error' && console.error('  console:', msg.text()));
  await page.goto(BASE_URL);
  await page.waitForSelector('.board .cell');
  await page.evaluate(() => document.fonts.ready);
  await page.waitForTimeout(600);
  return page;
}

async function screenshot(page: Page, name: string): Promise<void> {
  await page.screenshot({ path: join(outDir, name) });
  await page.context().close();
  console.log(`✔ ${name}`);
}

/** Samples frames in real time so animations keep their true speed in the GIF. */
class GifRecorder {
  private readonly page: Page;
  private readonly frames: { png: Buffer; at: number }[] = [];

  constructor(page: Page) {
    this.page = page;
  }

  async snap(): Promise<void> {
    this.frames.push({ png: await this.page.screenshot(), at: performance.now() });
  }

  async pause(ms: number): Promise<void> {
    await this.page.waitForTimeout(ms);
    await this.snap();
  }

  /**
   * One shared palette (sampled across the recording) plus inter-frame diffing:
   * pixels unchanged since the previous frame become transparent, which LZW compresses to almost nothing.
   */
  save(path: string, endHold: number): void {
    const images = this.frames.map((f) => PNG.sync.read(f.png));
    const { width, height } = images[0];
    const size = width * height * 4;

    const samples = images.filter((_, i) => i % Math.ceil(images.length / 8) === 0 || i === images.length - 1);
    const pool = new Uint8Array(size * samples.length);
    samples.forEach((img, i) => pool.set(img.data, i * size));
    const palette = quantize(pool, 255);
    const transparentIndex = palette.length;
    const fullPalette = [...palette, [0, 0, 0]];

    const gif = GIFEncoder();
    let previous: Uint8Array | null = null;
    let written = 0;
    images.forEach((img, i) => {
      const next = this.frames[i + 1]?.at ?? this.frames[i].at + endHold;
      const delay = Math.max(20, Math.round(next - this.frames[i].at));
      const index = applyPalette(img.data, palette);
      const diff = new Uint8Array(index);
      if (previous) {
        for (let p = 0; p < diff.length; p++) if (index[p] === previous[p]) diff[p] = transparentIndex;
      }
      gif.writeFrame(diff, width, height, {
        palette: i === 0 ? fullPalette : undefined,
        delay,
        transparent: i > 0,
        transparentIndex,
        dispose: 1,
      });
      previous = index;
      written++;
    });
    gif.finish();
    writeFileSync(path, gif.bytes());
    console.log(`✔ ${path.split(/[\\/]/).pop()} (${written} quadros)`);
  }
}

const ALL_LESSONS = readdirSync(join(root, 'src/levels')).filter((f) => f.endsWith('.json')).flatMap((f) => (JSON.parse(readFileSync(join(root, 'src/levels', f), 'utf8')) as LevelDef).intro ?? []);

const level = (file: string): LevelDef => JSON.parse(readFileSync(join(root, 'src/levels', file), 'utf8')) as LevelDef;

/** Die index for each solution cell (identical dice are matched in order). */
function solutionDice(def: LevelDef): number[] {
  const used = new Set<number>();
  return def.solution.map((code) => {
    const die = def.dice.findIndex((d, i) => d === code && !used.has(i));
    used.add(die);
    return die;
  });
}

const key = (def: LevelDef, cell: number) => `${Math.floor(cell / def.cols)},${cell % def.cols}`;

/** The solution, keeping only the cells `keep` accepts. */
function placementsOf(def: LevelDef, keep: (cell: number) => boolean): Record<string, string> {
  return Object.fromEntries(solutionDice(def).flatMap((die, cell) => (keep(cell) ? [[String(die), key(def, cell)]] : [])));
}

/** Two dice of different colors swapped: a board that breaks some rules. */
function withMistake(def: LevelDef, placements: Record<string, string>): Record<string, string> {
  const dice = solutionDice(def);
  const a = dice.findIndex((die) => String(die) in placements);
  const b = dice.findIndex((die, cell) => String(die) in placements && def.solution[cell][0] !== def.solution[a][0] && cell !== a);
  return { ...placements, [dice[a]]: key(def, b), [dice[b]]: key(def, a) };
}

const ease = (t: number) => (t < 0.5 ? 2 * t * t : 1 - (-2 * t + 2) ** 2 / 2);

async function recordDragGif(browser: Browser): Promise<void> {
  const def = level('02-contando-cores.json');
  const dice = solutionDice(def);
  const page = await open(browser, { level: def.id, placements: placementsOf(def, (cell) => cell < 4) }, { width: 960, height: 640 }, { cursor: true });
  const rec = new GifRecorder(page);
  let pos: Point = { x: 820, y: 560 };

  const center = async (selector: string): Promise<Point> => {
    const box = (await page.locator(selector).boundingBox())!;
    return { x: box.x + box.width / 2, y: box.y + box.height / 2 };
  };
  const glide = async (to: Point, steps: number) => {
    const from = pos;
    for (let i = 1; i <= steps; i++) {
      const t = ease(i / steps);
      pos = { x: from.x + (to.x - from.x) * t, y: from.y + (to.y - from.y) * t };
      await page.mouse.move(pos.x, pos.y);
      await rec.snap();
    }
  };
  const drag = async (die: number, cell: number) => {
    await glide(await center(`.piece[data-die="${die}"]`), 7);
    await page.mouse.down();
    await rec.snap();
    await glide(await center(`.cell[data-cell="${cell}"]`), 12);
    await page.mouse.up();
    for (let i = 0; i < 5; i++) await rec.snap();
    await rec.pause(250);
  };

  await page.mouse.move(pos.x, pos.y);
  await rec.pause(700);

  // A mistake first, so the rules light up red, then the fix.
  const [c4, c5] = [4, 5];
  await drag(dice[c5], c4);
  await rec.pause(900);
  await drag(dice[c5], c5);
  for (let cell = 4; cell < def.solution.length; cell++) {
    if (cell !== c5) await drag(dice[cell], cell);
  }
  for (let i = 0; i < 14; i++) await rec.snap();
  await page.waitForSelector('.modal--win');
  await rec.pause(700);
  rec.save(join(outDir, 'drag-and-drop.gif'), 3000);
  await page.context().close();
}

mkdirSync(outDir, { recursive: true });
const server = await preview({ root, logLevel: 'warn', preview: { port: PORT, strictPort: true } });
const browser = await chromium.launch({ channel: process.env.CAPTURE_CHANNEL ?? 'msedge' });

try {
  const desktop = { width: 1280, height: 820 };

  const chapel = level('10-vizinhos-numeros.json');
  await screenshot(
    await open(browser, { level: chapel.id, placements: placementsOf(chapel, (cell) => cell % 3 !== 2 && cell < 12) }, desktop, { scale: 1.5 }),
    'hero-light.png',
  );

  const nave = level('12-catedral.json');
  const dark = await open(browser, { level: nave.id, theme: 'dark', placements: placementsOf(nave, (cell) => cell % 2 === 0) }, desktop, { scale: 1.5 });
  await dark.locator('.tray .piece').first().click();
  await dark.waitForTimeout(400);
  await screenshot(dark, 'dark.png');

  const skylight = level('06-em-ordem.json');
  await screenshot(
    await open(browser, { level: skylight.id, placements: placementsOf(skylight, (cell) => cell < 5) }, { width: 390, height: 844 }, { scale: 2, mobile: true }),
    'mobile.png',
  );

  // Live validation: a nearly full board with two dice swapped.
  const north = level('11-linhas-e-colunas.json');
  const broken = withMistake(north, placementsOf(north, (cell) => cell < 13));
  await screenshot(await open(browser, { level: north.id, placements: broken }, desktop, { scale: 1.5 }), 'rules.png');

  await recordDragGif(browser);
} finally {
  await browser.close();
  await server.close();
}
