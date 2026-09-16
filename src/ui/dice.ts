import { COLOR_NAME, describeRule } from '../core/describe.ts';
import type { Color, Die, Rule } from '../core/types.ts';
import { h } from './dom.ts';

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

const swatch = (color: Color, extra = '') => h('i', { class: `swatch ${extra}`, 'data-color': color });

const stairs = (down: boolean) =>
  h(
    'span',
    { class: `stairs${down ? ' is-down' : ''}`, 'aria-hidden': 'true' },
    h('i', {}),
    h('i', {}),
    h('i', {}),
  );

/** Compact glyph for a rule, sized by its container (header badges and the rules list). */
export function ruleGlyph(rule: Rule): HTMLElement {
  const g = (...children: (Node | string)[]) => h('span', { class: `glyph glyph--${rule.type}` }, ...children);
  switch (rule.type) {
    case 'sum':
      return g(h('small', {}, 'Σ'), h('b', {}, String(rule.value)));
    case 'color-count':
      if (rule.count === 0) return g(swatch(rule.color, 'is-none'));
      if (rule.count <= 3) return g(...Array.from({ length: rule.count }, () => swatch(rule.color)));
      return g(h('b', {}, `${rule.count}×`), swatch(rule.color));
    case 'parity':
      return g(h('b', { class: 'word' }, rule.parity === 'even' ? 'par' : 'ímpar'));
    case 'ascending':
    case 'descending':
      return g(stairs(rule.type === 'descending'));
    case 'colors-unique':
      return g(swatch('red', 'is-mini'), swatch('yellow', 'is-mini'), swatch('blue', 'is-mini'), h('b', {}, '≠'));
    case 'values-unique':
      return g(h('b', { class: 'word' }, '1·2·3'), h('b', {}, '≠'));
    case 'adjacent-colors-differ':
      return g(swatch('red'), h('b', {}, '≠'), swatch('blue'));
    case 'adjacent-values-differ':
      return g(face(3, 'face face--mini'), h('b', {}, '≠'), face(3, 'face face--mini'));
    case 'lines-colors-unique':
      return g(swatch('green', 'is-mini'), swatch('purple', 'is-mini'), swatch('yellow', 'is-mini'));
    case 'lines-values-unique':
      return g(h('b', { class: 'word' }, '1·2·3'));
    case 'cell-color':
      return g(swatch(rule.color));
    case 'cell-value':
      return g(h('b', {}, String(rule.value)));
  }
}

export function ruleBadge(rule: Rule): HTMLElement {
  const text = describeRule(rule);
  return h('span', { class: 'badge', title: text, 'aria-label': text, role: 'img' }, ruleGlyph(rule));
}
