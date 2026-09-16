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
// Every rule is written as one composed symbol, read left to right:
//   [scope]  where it applies    ✚ neighbours · ⇹ every row and column · (none) this row/column/cell
//   subject  what it looks at    ● a color (split circle: any color) · ⚀ a number (die with "?": any number)
//   operator what must be true   ≠ all different · = all the same · ⟋ none · repetition exactly N
//                                ▁▃▅ going up/down · +N adds up to

export interface GlyphSpec {
  scope?: 'neighbors' | 'lines';
  /** A color, `'any'`, or undefined when the subject is a number. */
  color?: Color | 'any';
  /** A value 1–6, `'any'`, or undefined when the subject is a color. */
  number?: number | 'any';
  op?: 'different' | 'same' | 'none' | 'count' | 'up' | 'down' | 'total';
  /** For `count` (how many) and `total` (the sum). */
  n?: number;
  /** Column headers read top to bottom: going up/down turns vertical. */
  vertical?: boolean;
}

export function glyphSpec(rule: Rule): GlyphSpec {
  const vertical = 'line' in rule && rule.line === 'col';
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
    case 'ascending':
      return { number: 'any', op: 'up', vertical };
    case 'descending':
      return { number: 'any', op: 'down', vertical };
    case 'colors-unique':
      return { color: 'any', op: 'different' };
    case 'values-unique':
      return { number: 'any', op: 'different' };
  }
}

const H = 40;
const MID = H / 2;
const INK = 'stroke="currentColor" stroke-width="2.6" stroke-linecap="round" stroke-linejoin="round" fill="none"';
const fillOf = (color: Color) => `style="fill: var(--die-${color})"`;
const text = (x: number, content: string, size: number) =>
  `<text x="${x}" y="${MID + size * 0.36}" text-anchor="middle" font-size="${size}" font-weight="800" fill="currentColor" style="font-family: var(--font-display)">${content}</text>`;

function colorMark(cx: number, r: number, color: Color | 'any'): string {
  if (color !== 'any') return `<circle cx="${cx}" cy="${MID}" r="${r}" ${fillOf(color)}/><circle cx="${cx}" cy="${MID}" r="${r}" ${INK}/>`;
  const wedge = (a0: number, a1: number, c: Color) => {
    const p = (a: number) => `${cx + r * Math.cos(a)} ${MID + r * Math.sin(a)}`;
    return `<path d="M${cx} ${MID}L${p(a0)}A${r} ${r} 0 0 1 ${p(a1)}Z" ${fillOf(c)}/>`;
  };
  const t = (2 * Math.PI) / 3;
  const b = -Math.PI / 2;
  return wedge(b, b + t, 'red') + wedge(b + t, b + 2 * t, 'blue') + wedge(b + 2 * t, b + 3 * t, 'yellow') + `<circle cx="${cx}" cy="${MID}" r="${r}" ${INK}/>`;
}

function dieMark(x: number, value: number | 'any'): string {
  const s = 26;
  return `<rect x="${x}" y="${MID - s / 2}" width="${s}" height="${s}" rx="6" ${INK}/>` + text(x + s / 2, value === 'any' ? '?' : String(value), 17);
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
    const s = 22;
    const c = x + s / 2;
    out += `<path d="M${x} ${MID}H${x + s}M${x + 4} ${MID - 4}L${x} ${MID}L${x + 4} ${MID + 4}M${x + s - 4} ${MID - 4}L${x + s} ${MID}L${x + s - 4} ${MID + 4}M${c} ${MID - s / 2}V${MID + s / 2}M${c - 4} ${MID - s / 2 + 4}L${c} ${MID - s / 2}L${c + 4} ${MID - s / 2 + 4}M${c - 4} ${MID + s / 2 - 4}L${c} ${MID + s / 2}L${c + 4} ${MID + s / 2 - 4}" ${INK}/>`;
    x += s + 8;
  }

  const start = x;
  const copies = g.op === 'count' && g.n! <= 3 ? g.n! : 1;
  for (let i = 0; i < copies; i++) {
    if (g.color) {
      const r = copies > 1 ? 8 : 10;
      out += colorMark(x + r + 1, r, g.color);
      x += 2 * r + 5;
    } else if (g.number) {
      out += dieMark(x + 1, g.number);
      x += 31;
    }
  }
  if (g.op === 'none') {
    // A halo in the paper color keeps the struck-out digit readable.
    const slash = `M${start} ${MID + 15}L${x - 4} ${MID - 15}`;
    out += `<path d="${slash}" style="stroke: var(--panel)" stroke-width="7" stroke-linecap="round"/><path d="${slash}" stroke="currentColor" stroke-width="3" stroke-linecap="round"/>`;
    // The struck number goes back on top, outlined in paper color, so it stays readable.
    if (typeof g.number === 'number') {
      out += text(start + 14, String(g.number), 17).replace('<text ', '<text paint-order="stroke" stroke-width="5" style="stroke: var(--panel); font-family: var(--font-display)" ');
    }
  }
  if (x > start) x += 2;

  switch (g.op) {
    case 'count':
      if (g.n! > 3) {
        out += text(x + 13, `×${g.n}`, 18);
        x += 28;
      }
      break;
    case 'different':
    case 'same':
      out += text(x + 9, g.op === 'different' ? '≠' : '=', 26);
      x += 20;
      break;
    case 'total': {
      const label = `+${g.n}`;
      out += text(x + label.length * 7.5, label, 24);
      x += label.length * 15 + 2;
      break;
    }
    case 'up':
    case 'down': {
      const sizes = g.op === 'up' ? [7, 13, 19] : [19, 13, 7];
      sizes.forEach((len, i) => {
        out += g.vertical
          ? `<rect x="${x}" y="${MID - 11 + i * 8}" width="${len}" height="5" rx="1.2" fill="currentColor"/>`
          : `<rect x="${x + i * 7.5}" y="${MID + 10 - len}" width="5" height="${len}" rx="1.2" fill="currentColor"/>`;
      });
      x += g.vertical ? 22 : 23;
      break;
    }
  }

  const w = Math.max(x + 3, 24);
  return `<svg class="glyph-svg" viewBox="0 0 ${w} ${H}" width="${w}" height="${H}" aria-hidden="true">${out}</svg>`;
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
