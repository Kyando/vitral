import { dieCode } from './puzzle.ts';
import { compileRule } from './rules.ts';
import type { Die, Rule } from './types.ts';

export interface SolveInput {
  nRows: number;
  nCols: number;
  dice: Die[];
  rules: Rule[];
  rulesByCell: number[][];
}

export interface SolveResult {
  count: number;
  /** Each solution is a die per cell. Identical dice are interchangeable, so they count once. */
  solutions: Die[][];
  /** Search nodes where more than one die could go in the chosen cell: a proxy for difficulty. */
  branches: number;
  /** True when the search gave up at `nodeLimit`: the count is then a lower bound. */
  aborted: boolean;
}

/**
 * Backtracking search that always fills the most constrained cell first.
 * Stops after `limit` solutions: 2 is enough to test uniqueness.
 */
export function findSolutions(p: SolveInput, limit = 2, nodeLimit = 2_000_000): SolveResult {
  const nCells = p.nRows * p.nCols;
  const types: Die[] = [];
  const counts: number[] = [];
  const typeIndex = new Map<string, number>();
  for (const die of p.dice) {
    const code = dieCode(die);
    let t = typeIndex.get(code);
    if (t === undefined) {
      t = types.length;
      typeIndex.set(code, t);
      types.push(die);
      counts.push(0);
    }
    counts[t]++;
  }

  const checks = p.rules.map((rule) => compileRule(p, rule));
  const grid: (Die | null)[] = new Array(nCells).fill(null);
  const solutions: Die[][] = [];
  let branches = 0;
  let nodes = 0;
  let aborted = false;

  const fits = (cell: number, t: number): boolean => {
    grid[cell] = types[t];
    let ok = true;
    for (const rule of p.rulesByCell[cell]) {
      if (checks[rule](grid, cell)) {
        ok = false;
        break;
      }
    }
    grid[cell] = null;
    return ok;
  };

  const search = (filled: number): void => {
    if (solutions.length >= limit || aborted) return;
    if (++nodes > nodeLimit) {
      aborted = true;
      return;
    }
    if (filled === nCells) {
      solutions.push(grid.map((d) => d!));
      return;
    }

    let bestCell = -1;
    let bestOptions: number[] = [];
    for (let cell = 0; cell < nCells; cell++) {
      if (grid[cell]) continue;
      const options: number[] = [];
      for (let t = 0; t < types.length; t++) if (counts[t] && fits(cell, t)) options.push(t);
      if (!options.length) return;
      if (bestCell < 0 || options.length < bestOptions.length) {
        bestCell = cell;
        bestOptions = options;
        if (options.length === 1) break;
      }
    }

    if (bestOptions.length > 1) branches++;
    for (const t of bestOptions) {
      grid[bestCell] = types[t];
      counts[t]--;
      search(filled + 1);
      counts[t]++;
      grid[bestCell] = null;
      if (solutions.length >= limit || aborted) return;
    }
  };

  search(0);
  return { count: solutions.length, solutions, branches, aborted };
}
