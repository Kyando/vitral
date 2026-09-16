import { describe, expect, it } from 'vitest';
import { deduce, rate } from '../src/core/deduce.ts';
import { generateLevel } from '../src/core/generate.ts';
import { buildPuzzle, dieCode, LevelError, parseDie } from '../src/core/puzzle.ts';
import { cellsOfRule, compileRule, evaluate, type Grid } from '../src/core/rules.ts';
import { findSolutions } from '../src/core/solver.ts';
import type { LevelDef, Rule } from '../src/core/types.ts';

const levels = import.meta.glob<LevelDef>('../src/levels/*.json', { eager: true, import: 'default' });

const shape = { nRows: 2, nCols: 3 };
const LENIENT = new Set<Rule['type']>(['sum', 'ascending', 'descending']);
/** Builds a 2×3 grid from codes, "." for empty cells. */
const grid = (...codes: string[]): Grid => codes.map((c) => (c === '.' ? null : parseDie(c)));
const status = (rule: Rule, g: Grid) => evaluate(shape, rule, g).status;

describe('níveis publicados', () => {
  for (const [path, def] of Object.entries(levels)) {
    it(`${path}: tabuleiro cheio, solução única e dedutível sem chute`, () => {
      const p = buildPuzzle(def);
      expect(def.dice.length).toBe(def.rows * def.cols);
      expect(p.rules.every((rule) => evaluate(p, rule, p.solution).status === 'ok')).toBe(true);
      expect(findSolutions(p, 2).count).toBe(1);

      const { solved, grid: deduced } = deduce(p);
      expect(solved).toBe(true);
      expect(deduced.map((d) => dieCode(d!))).toEqual(def.solution);
      // A chapter that teaches a mechanic has to use it.
      for (const type of def.intro ?? []) expect(def.rules.map((r) => r.type), type).toContain(type);
    });
  }
});

describe('validação de níveis', () => {
  const base: LevelDef = {
    id: 'mini',
    title: 'mini',
    rows: 1,
    cols: 2,
    dice: ['R1', 'B2'],
    rules: [{ type: 'sum', line: 'row', index: 0, value: 3 }],
    solution: ['R1', 'B2'],
  };

  it('aceita um nível válido', () => {
    expect(buildPuzzle(base).nCells).toBe(2);
  });

  it('rejeita tabuleiros com quadros sobrando', () => {
    expect(() => buildPuzzle({ ...base, dice: ['R1'] })).toThrow(LevelError);
  });

  it('rejeita dados inválidos e soluções com outros dados', () => {
    expect(() => buildPuzzle({ ...base, dice: ['X1', 'B2'] })).toThrow(LevelError);
    expect(() => buildPuzzle({ ...base, dice: ['R7', 'B2'] })).toThrow(LevelError);
    expect(() => buildPuzzle({ ...base, solution: ['R1', 'G2'] })).toThrow(LevelError);
  });

  it('rejeita regras fora do tabuleiro', () => {
    expect(() => buildPuzzle({ ...base, rules: [{ type: 'sum', line: 'col', index: 5, value: 3 }] })).toThrow(LevelError);
    expect(() => buildPuzzle({ ...base, rules: [{ type: 'cell-value', row: 1, col: 0, value: 3 }] })).toThrow(LevelError);
  });
});

describe('regras', () => {
  it('vizinhos de mesma cor quebram e marcam os dois dados', () => {
    const rule: Rule = { type: 'adjacent-colors-differ' };
    expect(status(rule, grid('R1', '.', '.', '.', '.', '.'))).toBe('open');
    expect(evaluate(shape, rule, grid('R1', 'R2', '.', '.', '.', '.'))).toEqual({ status: 'broken', cells: [0, 1] });
    // Diagonals are not neighbours.
    expect(status(rule, grid('R1', 'B2', 'R3', 'B4', 'R5', 'B6'))).toBe('ok');
  });

  it('valores não se repetem em linha ou coluna', () => {
    const rule: Rule = { type: 'lines-values-unique' };
    expect(evaluate(shape, rule, grid('R1', '.', '.', 'B1', '.', '.'))).toEqual({ status: 'broken', cells: [0, 3] });
    expect(status(rule, grid('R1', 'R2', 'R3', 'B2', 'B3', 'B1'))).toBe('ok');
  });

  it('soma quebra ao passar do total, e só fica ok completa', () => {
    const rule: Rule = { type: 'sum', line: 'row', index: 0, value: 12 };
    expect(status(rule, grid('R6', '.', '.', '.', '.', '.'))).toBe('open');
    expect(status(rule, grid('R1', 'R1', '.', '.', '.', '.'))).toBe('open'); // short, but only a full line can be short
    expect(status(rule, grid('R6', 'R6', '.', '.', '.', '.'))).toBe('broken'); // total reached with a die still to place
    expect(status(rule, grid('R6', 'R4', 'B1', '.', '.', '.'))).toBe('broken');
    expect(status(rule, grid('R6', 'R5', 'B1', '.', '.', '.'))).toBe('ok');
  });

  it('contagem de cor', () => {
    const none: Rule = { type: 'color-count', line: 'col', index: 0, color: 'red', count: 0 };
    expect(evaluate(shape, none, grid('R1', '.', '.', '.', '.', '.'))).toEqual({ status: 'broken', cells: [0] });
    const two: Rule = { type: 'color-count', line: 'col', index: 0, color: 'red', count: 2 };
    expect(status(two, grid('R1', '.', '.', '.', '.', '.'))).toBe('open');
    expect(status(two, grid('B1', '.', '.', '.', '.', '.'))).toBe('broken');
    expect(status(two, grid('R1', '.', '.', 'R4', '.', '.'))).toBe('ok');
  });

  it('crescente só quebra com dois dados fora de ordem', () => {
    const rule: Rule = { type: 'ascending', line: 'row', index: 0 };
    expect(status(rule, grid('.', '.', 'R2', '.', '.', '.'))).toBe('open');
    expect(status(rule, grid('R6', '.', '.', '.', '.', '.'))).toBe('open');
    expect(status(rule, grid('R3', '.', 'B4', '.', '.', '.'))).toBe('open');
    expect(evaluate(shape, rule, grid('R4', '.', 'B4', '.', '.', '.'))).toEqual({ status: 'broken', cells: [0, 2] });
    expect(status(rule, grid('R1', 'B3', 'G6', '.', '.', '.'))).toBe('ok');
  });

  it('menor que e maior que', () => {
    const below: Rule = { type: 'values-below', line: 'row', index: 0, value: 4 };
    expect(status(below, grid('R3', '.', '.', '.', '.', '.'))).toBe('open');
    expect(evaluate(shape, below, grid('R3', 'B4', '.', '.', '.', '.'))).toEqual({ status: 'broken', cells: [1] });
    expect(status(below, grid('R3', 'B1', 'G2', '.', '.', '.'))).toBe('ok');
    const above: Rule = { type: 'values-above', line: 'col', index: 0, value: 2 };
    expect(status(above, grid('R2', '.', '.', '.', '.', '.'))).toBe('broken');
    expect(status(above, grid('R3', '.', '.', 'B6', '.', '.'))).toBe('ok');
  });

  it('restrição de quadro', () => {
    const rule: Rule = { type: 'cell-color', row: 1, col: 2, color: 'blue' };
    expect(status(rule, grid('.', '.', '.', '.', '.', '.'))).toBe('open');
    expect(status(rule, grid('.', '.', '.', '.', '.', 'R3'))).toBe('broken');
    expect(status(rule, grid('.', '.', '.', '.', '.', 'B3'))).toBe('ok');
  });

  it('a checagem compilada do solver concorda com a avaliação da interface (ou é mais rígida)', () => {
    const rules: Rule[] = [
      { type: 'adjacent-colors-differ' },
      { type: 'adjacent-values-differ' },
      { type: 'lines-colors-unique' },
      { type: 'lines-values-unique' },
      { type: 'sum', line: 'row', index: 1, value: 9 },
      { type: 'color-count', line: 'col', index: 1, color: 'green', count: 1 },
      { type: 'colors-same', line: 'row', index: 0 },
      { type: 'value-none', line: 'col', index: 1, value: 3 },
      { type: 'values-below', line: 'row', index: 1, value: 4 },
      { type: 'values-above', line: 'col', index: 2, value: 2 },
      { type: 'ascending', line: 'row', index: 0 },
      { type: 'descending', line: 'col', index: 2 },
      { type: 'colors-unique', line: 'row', index: 1 },
      { type: 'values-unique', line: 'col', index: 0 },
    ];
    const codes = ['R1', 'G2', 'B3', 'R3', 'G5', 'Y6', 'B4', 'P1'];
    let seed = 7;
    const rand = () => (seed = (seed * 16807) % 2147483647) / 2147483647;

    // Fill random boards die by die: for rules that see the cell and weren't broken yet, both must agree.
    for (let round = 0; round < 400; round++) {
      const g: (ReturnType<typeof parseDie>)[] = new Array(6).fill(null);
      for (const cell of [0, 1, 2, 3, 4, 5].sort(() => rand() - 0.5)) {
        const before = rules.map((rule) => evaluate(shape, rule, g).status);
        g[cell] = parseDie(codes[Math.floor(rand() * codes.length)]);
        rules.forEach((rule, i) => {
          if (before[i] === 'broken' || !cellsOfRule(shape, rule).includes(cell)) return;
          const compiled = compileRule(shape, rule)(g, cell);
          const broken = evaluate(shape, rule, g).status === 'broken';
          const label = `${rule.type} em ${g.map((d) => (d ? dieCode(d) : '.')).join(' ')}`;
          // Sums and order: the UI is lenient mid-line, the solver may prune earlier.
          if (LENIENT.has(rule.type)) {
            if (broken) expect(compiled, label).toBe(true);
            if (g.every((d, k) => d || !cellsOfRule(shape, rule).includes(k))) expect(compiled, label).toBe(broken);
          } else expect(compiled, label).toBe(broken);
        });
      }
    }
  });
});

describe('gerador', () => {
  for (const [rows, cols] of [
    [2, 3],
    [3, 3],
    [4, 4],
  ]) {
    it(`gera tabuleiros ${rows}×${cols} com solução única e dedutível`, () => {
      for (const seed of [1, 2, 3]) {
        const g = generateLevel({ rows, cols, seed, colors: 4, boardRules: ['adjacent-colors-differ'], cellRules: 1 });
        expect(g).not.toBeNull();
        const p = buildPuzzle({ id: 'g', title: 'g', ...g!.def });
        expect(findSolutions(p, 2).count).toBe(1);
        expect(rate(p).deducible).toBe(true);
      }
    });
  }

  it('é reproduzível com a mesma seed', () => {
    const a = generateLevel({ rows: 3, cols: 3, seed: 99 });
    const b = generateLevel({ rows: 3, cols: 3, seed: 99 });
    expect(a!.def).toEqual(b!.def);
  });
});
