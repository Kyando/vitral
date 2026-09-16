import { COLOR_NAME, describeRule } from '../core/describe.ts';
import type { Color, Die, Rule } from '../core/types.ts';
import { h, svg } from './dom.ts';

/** Pip spots on a 3×3 grid, numbered 1–9 in reading order. */
const PIPS: Record<number, number[]> = {
  1: [5],
  2: [3, 7],
  3: [3, 5, 7],
  4: [1, 3, 7, 9],
  5: [1, 3, 5, 7, 9],
  6: [1, 3, 4, 6, 7, 9],
};

export const dieLabel = (d: Die): string => `${COLOR_NAME[d.color].one} ${d.value}`;

/** A die face: pips on a 3×3 grid. */
export function face(value: number, className = 'face'): HTMLElement {
  return h(
    'span',
    { class: className, 'aria-hidden': 'true' },
    ...PIPS[value].map((spot) => h('i', { class: 'pip', style: `grid-area: ${Math.ceil(spot / 3)} / ${((spot - 1) % 3) + 1}` })),
  );
}

export function dieBody(d: Die): HTMLElement {
  return h('span', { class: 'die-body', 'data-color': d.color }, face(d.value));
}

// ── Rule glyphs ───────────────────────────────────────────────────────────
//
// Everything is a die, as in Sagrada: the fill is the color (transparent = any color)
// and the pips are the number (no pips = any number). A rule reads left to right:
//   [scope]   ✚ neighbours · ▦ every row and column · (none) this row/column
//   subject   a die: red tile, die with 5 pips, or an empty die
//   operator  ×N exactly N (×0 none) · =12 adds up to 12 · ↗ numbers go up (↘ down)
// "Unique" and "identical" are drawn as a row of three small dice that differ (or match)
// in color or in number, so they carry the attribute themselves.

export interface GlyphSpec {
  scope?: 'neighbors' | 'lines';
  /** A color, `'any'`, or undefined when the rule is about numbers. */
  color?: Color | 'any';
  /** A value 1–6, `'any'`, or undefined when the rule is about colors. */
  number?: number | 'any';
  op?: 'different' | 'same' | 'none' | 'count' | 'up' | 'down' | 'total' | 'below' | 'above';
  /** For `count` (how many) and `total` (the sum). */
  n?: number;
}

export function glyphSpec(rule: Rule): GlyphSpec {
  switch (rule.type) {
    case 'adjacent-colors-differ':
      return { scope: 'neighbors', color: 'any', op: 'different' };
    case 'adjacent-values-differ':
      return { scope: 'neighbors', number: 'any', op: 'different' };
    case 'lines-colors-unique':
      return { scope: 'lines', color: 'any', op: 'different' };
    case 'lines-values-unique':
      return { scope: 'lines', number: 'any', op: 'different' };
    case 'cell-color':
      return { color: rule.color };
    case 'cell-value':
      return { number: rule.value };
    case 'sum':
      return { number: 'any', op: 'total', n: rule.value };
    case 'color-count':
      return rule.count === 0 ? { color: rule.color, op: 'none' } : { color: rule.color, op: 'count', n: rule.count };
    case 'colors-same':
      return { color: 'any', op: 'same' };
    case 'value-none':
      return { number: rule.value, op: 'none' };
    case 'values-below':
      return { number: 'any', op: 'below', n: rule.value };
    case 'values-above':
      return { number: 'any', op: 'above', n: rule.value };
    case 'ascending':
      return { number: 'any', op: 'up' };
    case 'descending':
      return { number: 'any', op: 'down' };
    case 'colors-unique':
      return { color: 'any', op: 'different' };
    case 'values-unique':
      return { number: 'any', op: 'different' };
  }
}

const H = 40;
const MID = H / 2;
const STROKE = 'stroke="currentColor" stroke-width="2.4" stroke-linejoin="round"';
const PIP_SPOTS: Record<number, [number, number][]> = {
  1: [[0, 0]],
  2: [[1, -1], [-1, 1]],
  3: [[1, -1], [0, 0], [-1, 1]],
  4: [[-1, -1], [1, -1], [-1, 1], [1, 1]],
  5: [[-1, -1], [1, -1], [0, 0], [-1, 1], [1, 1]],
  6: [[-1, -1], [1, -1], [-1, 0], [1, 0], [-1, 1], [1, 1]],
};

const text = (x: number, content: string, size: number) =>
  `<text x="${x}" y="${MID + size * 0.36}" text-anchor="middle" font-size="${size}" font-weight="800" fill="currentColor" style="font-family: var(--font-display)">${content}</text>`;

/** A die of side `s` centered at (cx, MID): filled with its color, pips for its number. */
function dieMark(cx: number, s: number, color?: Color, value?: number): string {
  const fill = color ? `style="fill: var(--die-${color})"` : 'style="fill: var(--clear)"';
  let out = `<rect x="${cx - s / 2}" y="${MID - s / 2}" width="${s}" height="${s}" rx="${s * 0.24}" ${fill} ${STROKE}/>`;
  if (value) {
    const pip = color === 'yellow' || !color ? 'currentColor' : '#fffaf1';
    for (const [dx, dy] of PIP_SPOTS[value]) {
      out += `<circle cx="${cx + dx * s * 0.26}" cy="${MID + dy * s * 0.26}" r="${s * 0.085}" fill="${pip}"/>`;
    }
  }
  return out;
}

/** Builds the SVG markup of a glyph. */
export function glyphMarkup(g: GlyphSpec): string {
  let x = 3;
  let out = '';

  if (g.scope === 'neighbors') {
    const u = 7;
    out += `<rect x="${x + u}" y="${MID - u / 2}" width="${u}" height="${u}" rx="1.5" fill="currentColor"/>`;
    for (const [dx, dy] of [[u, -u * 1.5 - 1], [u, u / 2 + 1], [-1, -u / 2], [u * 2 + 1, -u / 2]]) {
      out += `<rect x="${x + dx}" y="${MID + dy}" width="${u}" height="${u}" rx="1.5" stroke="currentColor" stroke-width="1.8" fill="none"/>`;
    }
    x += 30;
  } else if (g.scope === 'lines') {
    const s = 24;
    const t = s / 3;
    out += `<rect x="${x}" y="${MID - s / 2}" width="${s}" height="${s}" rx="3" fill="none" ${STROKE}/>`;
    out += `<path d="M${x + t} ${MID - s / 2}V${MID + s / 2}M${x + 2 * t} ${MID - s / 2}V${MID + s / 2}M${x} ${MID - s / 2 + t}H${x + s}M${x} ${MID - s / 2 + 2 * t}H${x + s}" stroke="currentColor" stroke-width="1.8"/>`;
    x += s + 7;
  }

  const specificColor = g.color && g.color !== 'any' ? g.color : undefined;
  const specificNumber = typeof g.number === 'number' ? g.number : undefined;

  if (g.op === 'different' || g.op === 'same') {
    // Three small dice: they differ (or match) in the attribute the rule is about.
    const s = 22;
    const colors: Color[] = g.op === 'same' ? ['blue', 'blue', 'blue'] : ['red', 'yellow', 'blue'];
    const values = g.op === 'same' ? [3, 3, 3] : [1, 2, 3];
    for (let i = 0; i < 3; i++) {
      out += g.color ? dieMark(x + s / 2, s, colors[i]) : dieMark(x + s / 2, s, undefined, values[i]);
      x += s + 2;
    }
    x += 1;
  } else {
    out += dieMark(x + 14, 26, specificColor, specificNumber);
    // The empty die of a sum holds the line's running total (filled in by the board view).
    if (g.op === 'total') out += `<text class="sum-now" x="${x + 14}" y="${MID + 5.6}" text-anchor="middle" font-size="16" font-weight="900"></text>`;
    x += 31;
  }

  switch (g.op) {
    case 'count':
    case 'none': {
      const label = `×${g.op === 'none' ? 0 : g.n}`;
      out += text(x + 13, label, 21);
      x += 28;
      break;
    }
    case 'total':
    case 'below':
    case 'above': {
      const label = `${g.op === 'total' ? '=' : g.op === 'below' ? '&lt;' : '&gt;'}${g.n}`;
      const chars = label.replace(/&[lg]t;/, '<').length;
      out += text(x + chars * 7.5, label, 23);
      x += chars * 15 + 2;
      break;
    }
    case 'up':
    case 'down': {
      // A straight arrow: numbers only ever go one way.
      const [y0, y1] = g.op === 'up' ? [MID + 10, MID - 10] : [MID - 10, MID + 10];
      const [x0, x1] = [x + 2, x + 22];
      const head = g.op === 'up' ? `M${x1 - 9} ${y1}H${x1}V${y1 + 9}` : `M${x1 - 9} ${y1}H${x1}V${y1 - 9}`;
      out += `<path d="M${x0} ${y0}L${x1} ${y1}${head}" fill="none" stroke="currentColor" stroke-width="3" stroke-linecap="round" stroke-linejoin="round"/>`;
      x += 26;
      break;
    }
  }

  const w = Math.max(x + 3, 24);
  const top = 5;
  const h = H - 2 * top;
  return `<svg class="glyph-svg" viewBox="0 ${top} ${w} ${h}" width="${w}" height="${h}" aria-hidden="true">${out}</svg>`;
}

export function glyph(g: GlyphSpec): SVGElement {
  return svg(glyphMarkup(g));
}

export function ruleGlyph(rule: Rule): HTMLElement {
  return h('span', { class: `glyph glyph--${rule.type}` }, glyph(glyphSpec(rule)));
}

export function ruleBadge(rule: Rule): HTMLElement {
  const text = describeRule(rule);
  return h('span', { class: 'badge', title: text, 'aria-label': text, role: 'img' }, ruleGlyph(rule));
}
