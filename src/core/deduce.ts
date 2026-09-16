import { dieCode } from './puzzle.ts';
import { compileRule, lineCells } from './rules.ts';
import type { SolveInput } from './solver.ts';
import type { Die } from './types.ts';

/**
 * Human-style solver: only sound eliminations, never trial and error.
 * If it fills the whole board, the solution is unique and can be reached by reasoning alone.
 *
 * Techniques, from easiest to hardest:
 *  1. direct  — a die can't go where it already breaks a rule with the dice placed;
 *               a cell with one possible die, or a die with as many possible cells as copies, is placed.
 *  2. reach   — looks at what the other empty cells of a rule could still receive
 *               (a row sum that can no longer be reached, a neighbour that must be red...).
 */

export interface Deduction {
  solved: boolean;
  /** Die per cell (null where reasoning got stuck). */
  grid: (Die | null)[];
  /** Rounds that needed the "reach" technique. */
  reachRounds: number;
  /** Rounds in total (one round = one sweep that placed dice). */
  rounds: number;
}

export function deduce(p: SolveInput): Deduction {
  const nCells = p.nRows * p.nCols;
  const types: Die[] = [];
  const left: number[] = [];
  const typeIndex = new Map<string, number>();
  for (const die of p.dice) {
    const code = dieCode(die);
    let t = typeIndex.get(code);
    if (t === undefined) {
      t = types.length;
      typeIndex.set(code, t);
      types.push(die);
      left.push(0);
    }
    left[t]++;
  }
  const nTypes = types.length;
  const checks = p.rules.map((rule) => compileRule(p, rule));
  const grid: (Die | null)[] = new Array(nCells).fill(null);
  /** cand[cell][type] */
  const cand: boolean[][] = Array.from({ length: nCells }, () => new Array(nTypes).fill(true));
  let reachRounds = 0;
  let rounds = 0;

  const place = (cell: number, t: number) => {
    grid[cell] = types[t];
    left[t]--;
    cand[cell].fill(false);
    cand[cell][t] = true;
  };

  /** Removes candidates that break a rule against the dice already placed. */
  const direct = (): boolean => {
    let changed = false;
    for (let cell = 0; cell < nCells; cell++) {
      if (grid[cell]) continue;
      for (let t = 0; t < nTypes; t++) {
        if (!cand[cell][t]) continue;
        grid[cell] = types[t];
        const breaks = !left[t] || p.rulesByCell[cell].some((r) => checks[r](grid, cell));
        grid[cell] = null;
        if (breaks) {
          cand[cell][t] = false;
          changed = true;
        }
      }
    }
    return changed;
  };

  const singles = (): boolean => {
    let placed = false;
    for (let cell = 0; cell < nCells; cell++) {
      if (grid[cell]) continue;
      const options = cand[cell].flatMap((ok, t) => (ok ? [t] : []));
      if (options.length === 1 && left[options[0]] > 0) {
        place(cell, options[0]);
        placed = true;
      }
    }
    for (let t = 0; t < nTypes; t++) {
      if (!left[t]) continue;
      const cells: number[] = [];
      for (let cell = 0; cell < nCells; cell++) if (!grid[cell] && cand[cell][t]) cells.push(cell);
      if (cells.length === left[t]) {
        cells.forEach((cell) => place(cell, t));
        placed = true;
      }
    }
    return placed;
  };

  const options = (cell: number): Die[] => (grid[cell] ? [grid[cell]!] : types.filter((_, t) => cand[cell][t]));

  /** Removes candidates the other empty cells of a rule can no longer make work. */
  const reach = (): boolean => {
    let changed = false;
    const drop = (cell: number, keep: (d: Die) => boolean) => {
      for (let t = 0; t < nTypes; t++) {
        if (cand[cell][t] && !keep(types[t])) {
          cand[cell][t] = false;
          changed = true;
        }
      }
    };
    const neighbours = (cell: number) => {
      const c = cell % p.nCols;
      return [c > 0 ? cell - 1 : -1, c + 1 < p.nCols ? cell + 1 : -1, cell - p.nCols, cell + p.nCols].filter((n) => n >= 0 && n < nCells);
    };
    /** A key every option of that cell shares, if any. */
    const forced = <K>(cell: number, key: (d: Die) => K): K | undefined => {
      const opts = options(cell);
      return opts.length && opts.every((d) => key(d) === key(opts[0])) ? key(opts[0]) : undefined;
    };
    const color = (d: Die) => d.color;
    const value = (d: Die) => d.value;

    for (const rule of p.rules) {
      switch (rule.type) {
        case 'adjacent-colors-differ':
        case 'adjacent-values-differ': {
          const key = rule.type === 'adjacent-colors-differ' ? color : value;
          for (let cell = 0; cell < nCells; cell++) {
            if (grid[cell]) continue;
            for (const n of neighbours(cell)) {
              const k = forced<string | number>(n, key);
              if (k !== undefined) drop(cell, (d) => key(d) !== k);
            }
          }
          break;
        }
        case 'lines-colors-unique':
        case 'lines-values-unique':
        case 'colors-unique':
        case 'values-unique': {
          const key = rule.type.includes('color') ? color : value;
          const lines =
            'line' in rule
              ? [lineCells(p, rule)]
              : [
                  ...Array.from({ length: p.nRows }, (_, index) => lineCells(p, { line: 'row', index })),
                  ...Array.from({ length: p.nCols }, (_, index) => lineCells(p, { line: 'col', index })),
                ];
          for (const cells of lines) {
            for (const cell of cells) {
              if (grid[cell]) continue;
              for (const other of cells) {
                if (other === cell || grid[other]) continue;
                const k = forced<string | number>(other, key);
                if (k !== undefined) drop(cell, (d) => key(d) !== k);
              }
            }
          }
          break;
        }
        case 'colors-same': {
          const cells = lineCells(p, rule);
          for (const cell of cells) {
            if (grid[cell]) continue;
            for (const other of cells) {
              if (other === cell) continue;
              const k = forced(other, color);
              if (k !== undefined) drop(cell, (d) => d.color === k);
            }
          }
          break;
        }
        case 'sum':
        case 'color-count':
        case 'ascending':
        case 'descending': {
          const cells = lineCells(p, rule);
          cells.forEach((cell, i) => {
            if (grid[cell]) return;
            const others = cells.map((other, j) => ({ j, opts: j === i ? [] : options(other) })).filter((o) => o.j !== i);
            if (rule.type === 'sum') {
              const lo = others.reduce((acc, o) => acc + Math.min(...o.opts.map(value)), 0);
              const hi = others.reduce((acc, o) => acc + Math.max(...o.opts.map(value)), 0);
              drop(cell, (d) => d.value + lo <= rule.value && d.value + hi >= rule.value);
            } else if (rule.type === 'color-count') {
              const must = others.filter((o) => o.opts.every((d) => d.color === rule.color)).length;
              const can = others.filter((o) => o.opts.some((d) => d.color === rule.color)).length;
              drop(cell, (d) => {
                const own = d.color === rule.color ? 1 : 0;
                return must + own <= rule.count && can + own >= rule.count;
              });
            } else {
              const rank = (d: Die) => (rule.type === 'ascending' ? d.value : 7 - d.value);
              drop(cell, (d) =>
                others.every(({ j, opts }) =>
                  j > i ? Math.max(...opts.map(rank)) - rank(d) >= j - i : rank(d) - Math.min(...opts.map(rank)) >= i - j,
                ),
              );
            }
          });
          break;
        }
        default:
          break;
      }
    }
    return changed;
  };

  for (;;) {
    if (grid.every(Boolean)) break;
    if (cand.some((c, cell) => !grid[cell] && !c.some(Boolean))) break;
    direct();
    if (singles()) {
      rounds++;
      continue;
    }
    // Deeper reasoning, repeated until it places something or stops helping.
    let progressed = false;
    while (reach()) {
      direct();
      if (singles()) {
        progressed = true;
        break;
      }
    }
    if (!progressed) break;
    rounds++;
    reachRounds++;
  }

  const solved = grid.every(Boolean) && p.rules.every((_, r) => grid.every((_, cell) => !p.rulesByCell[cell].includes(r) || !checks[r](grid, cell)));
  return { solved, grid, reachRounds, rounds };
}

export interface Rating {
  /** 1 easy, 2 medium, 3 hard */
  level: 1 | 2 | 3;
  label: string;
  /** False when reasoning alone can't finish the board (the level needs fixing). */
  deducible: boolean;
  reachRounds: number;
  rounds: number;
}

const LABELS = ['Fácil', 'Médio', 'Difícil'] as const;

/** Rates a level from board size and how often it needs the deeper "reach" reasoning. */
export function rate(p: SolveInput): Rating {
  const { solved, reachRounds, rounds } = deduce(p);
  const score = (p.nRows * p.nCols) / 8 + reachRounds;
  const level = !solved ? 3 : score < 3 ? 1 : score < 6 ? 2 : 3;
  return { level, label: LABELS[level - 1], deducible: solved, reachRounds, rounds };
}
