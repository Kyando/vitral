import type { Die, LineRef, Rule } from './types.ts';

/**
 * Rule checking on partial boards.
 *
 * Feedback never looks at the intended solution or at the dice still in the tray: a rule is
 * `broken` only when the dice already placed make it impossible to satisfy, whatever the empty
 * cells receive. That keeps it honest for the player and sound for the solver's pruning.
 */

export type Status = 'open' | 'ok' | 'broken';

export interface Verdict {
  status: Status;
  /** Cells whose dice break the rule (empty unless broken). */
  cells: number[];
}

export type Grid = readonly (Die | null)[];

interface Shape {
  nRows: number;
  nCols: number;
}

export type Scope = 'board' | 'line' | 'cell';

export function ruleScope(rule: Rule): Scope {
  if ('line' in rule) return 'line';
  if ('row' in rule) return 'cell';
  return 'board';
}

export function lineCells(s: Shape, { line, index }: LineRef): number[] {
  return line === 'row'
    ? Array.from({ length: s.nCols }, (_, c) => index * s.nCols + c)
    : Array.from({ length: s.nRows }, (_, r) => r * s.nCols + index);
}

export function allLines(s: Shape): LineRef[] {
  return [
    ...Array.from({ length: s.nRows }, (_, index) => ({ line: 'row' as const, index })),
    ...Array.from({ length: s.nCols }, (_, index) => ({ line: 'col' as const, index })),
  ];
}

export function cellsOfRule(s: Shape, rule: Rule): number[] {
  if ('line' in rule) return lineCells(s, rule);
  if ('row' in rule) return [rule.row * s.nCols + rule.col];
  return Array.from({ length: s.nRows * s.nCols }, (_, i) => i);
}

/** Right and down neighbours of every cell, each pair once. */
function adjacentPairs(s: Shape): [number, number][] {
  const pairs: [number, number][] = [];
  for (let r = 0; r < s.nRows; r++) {
    for (let c = 0; c < s.nCols; c++) {
      const i = r * s.nCols + c;
      if (c + 1 < s.nCols) pairs.push([i, i + 1]);
      if (r + 1 < s.nRows) pairs.push([i, i + s.nCols]);
    }
  }
  return pairs;
}

const verdict = (bad: Iterable<number>, complete: boolean): Verdict => {
  const cells = [...new Set(bad)].sort((a, b) => a - b);
  if (cells.length) return { status: 'broken', cells };
  return { status: complete ? 'ok' : 'open', cells };
};

/** Cells holding a repeated key within `cells`. */
function duplicates(grid: Grid, cells: number[], key: (d: Die) => string | number): number[] {
  const seen = new Map<string | number, number[]>();
  for (const cell of cells) {
    const die = grid[cell];
    if (!die) continue;
    const k = key(die);
    seen.set(k, [...(seen.get(k) ?? []), cell]);
  }
  return [...seen.values()].filter((group) => group.length > 1).flat();
}

export function evaluate(s: Shape, rule: Rule, grid: Grid): Verdict {
  switch (rule.type) {
    case 'adjacent-colors-differ':
    case 'adjacent-values-differ': {
      const key = rule.type === 'adjacent-colors-differ' ? (d: Die) => d.color : (d: Die) => d.value;
      const bad = adjacentPairs(s).flatMap(([a, b]) => {
        const da = grid[a];
        const db = grid[b];
        return da && db && key(da) === key(db) ? [a, b] : [];
      });
      return verdict(bad, grid.every(Boolean));
    }

    case 'lines-colors-unique':
    case 'lines-values-unique': {
      const key = rule.type === 'lines-colors-unique' ? (d: Die) => d.color : (d: Die) => d.value;
      const bad = allLines(s).flatMap((line) => duplicates(grid, lineCells(s, line), key));
      return verdict(bad, grid.every(Boolean));
    }

    case 'cell-color':
    case 'cell-value': {
      const cell = rule.row * s.nCols + rule.col;
      const die = grid[cell];
      if (!die) return { status: 'open', cells: [] };
      const fits = rule.type === 'cell-color' ? die.color === rule.color : die.value === rule.value;
      return verdict(fits ? [] : [cell], true);
    }
  }

  const cells = lineCells(s, rule);
  const placed = cells.filter((cell) => grid[cell]);
  const empty = cells.length - placed.length;
  const complete = empty === 0;
  const die = (cell: number) => grid[cell]!;

  switch (rule.type) {
    case 'sum': {
      const sum = placed.reduce((acc, cell) => acc + die(cell).value, 0);
      const reachable = sum + empty <= rule.value && sum + empty * 6 >= rule.value;
      return verdict(reachable ? [] : placed, complete);
    }

    case 'color-count': {
      const matching = placed.filter((cell) => die(cell).color === rule.color);
      if (matching.length > rule.count) return verdict(matching, complete);
      if (matching.length + empty < rule.count) return verdict(placed.filter((cell) => !matching.includes(cell)), complete);
      return verdict([], complete);
    }

    case 'parity': {
      const want = rule.parity === 'even' ? 0 : 1;
      return verdict(placed.filter((cell) => die(cell).value % 2 !== want), complete);
    }

    case 'ascending':
    case 'descending': {
      // Strictly monotonic: positions i < j need a gap of at least j - i between their values.
      const n = cells.length;
      const rank = (i: number) => (rule.type === 'ascending' ? die(cells[i]).value : 7 - die(cells[i]).value);
      const filled = cells.map((cell, i) => (grid[cell] ? i : -1)).filter((i) => i >= 0);
      const bad: number[] = [];
      for (const i of filled) {
        if (rank(i) < i + 1 || rank(i) > 6 - (n - 1 - i)) bad.push(cells[i]);
      }
      for (let a = 0; a < filled.length; a++) {
        for (let b = a + 1; b < filled.length; b++) {
          const [i, j] = [filled[a], filled[b]];
          if (rank(j) - rank(i) < j - i) bad.push(cells[i], cells[j]);
        }
      }
      return verdict(bad, complete);
    }

    case 'colors-unique':
      return verdict(duplicates(grid, cells, (d) => d.color), complete);

    case 'values-unique':
      return verdict(duplicates(grid, cells, (d) => d.value), complete);
  }
}

/**
 * Placement check for search: `(grid, cell) => true` when the die just placed in `cell` breaks the rule.
 * It assumes `cell` is in the rule's scope and the board was not already breaking it,
 * so it only looks at what that die changes.
 * Allocation-free: the solver calls it millions of times.
 */
export type BreakCheck = (grid: Grid, cell: number) => boolean;

export function compileRule(s: Shape, rule: Rule): BreakCheck {
  const { nRows, nCols } = s;
  const sameKey =
    rule.type.includes('color') ? (a: Die, b: Die) => a.color === b.color : (a: Die, b: Die) => a.value === b.value;

  switch (rule.type) {
    case 'adjacent-colors-differ':
    case 'adjacent-values-differ':
      return (grid, cell) => {
        const die = grid[cell]!;
        const c = cell % nCols;
        const at = (other: number) => {
          const d = grid[other];
          return !!d && sameKey(d, die);
        };
        return (c > 0 && at(cell - 1)) || (c + 1 < nCols && at(cell + 1)) || (cell >= nCols && at(cell - nCols)) || (cell + nCols < nRows * nCols && at(cell + nCols));
      };

    case 'lines-colors-unique':
    case 'lines-values-unique':
      return (grid, cell) => {
        const die = grid[cell]!;
        const r = Math.floor(cell / nCols);
        const c = cell % nCols;
        for (let k = 0; k < nCols; k++) {
          const other = r * nCols + k;
          const d = grid[other];
          if (other !== cell && d && sameKey(d, die)) return true;
        }
        for (let k = 0; k < nRows; k++) {
          const other = k * nCols + c;
          const d = grid[other];
          if (other !== cell && d && sameKey(d, die)) return true;
        }
        return false;
      };

    case 'cell-color':
      return (grid, cell) => grid[cell]!.color !== rule.color;
    case 'cell-value':
      return (grid, cell) => grid[cell]!.value !== rule.value;
  }

  const cells = lineCells(s, rule);
  const n = cells.length;

  switch (rule.type) {
    case 'sum':
      return (grid) => {
        let sum = 0;
        let empty = 0;
        for (let k = 0; k < n; k++) {
          const d = grid[cells[k]];
          if (d) sum += d.value;
          else empty++;
        }
        return sum + empty > rule.value || sum + empty * 6 < rule.value;
      };

    case 'color-count':
      return (grid) => {
        let matching = 0;
        let empty = 0;
        for (let k = 0; k < n; k++) {
          const d = grid[cells[k]];
          if (!d) empty++;
          else if (d.color === rule.color) matching++;
        }
        return matching > rule.count || matching + empty < rule.count;
      };

    case 'parity': {
      const want = rule.parity === 'even' ? 0 : 1;
      return (grid, cell) => grid[cell]!.value % 2 !== want;
    }

    case 'ascending':
    case 'descending': {
      const up = rule.type === 'ascending';
      return (grid, cell) => {
        const i = cells.indexOf(cell);
        const rank = (d: Die) => (up ? d.value : 7 - d.value);
        const ri = rank(grid[cell]!);
        if (ri < i + 1 || ri > 6 - (n - 1 - i)) return true;
        for (let j = 0; j < n; j++) {
          const d = grid[cells[j]];
          if (!d || j === i) continue;
          if (j > i ? rank(d) - ri < j - i : ri - rank(d) < i - j) return true;
        }
        return false;
      };
    }

    case 'colors-unique':
    case 'values-unique':
      return (grid, cell) => {
        const die = grid[cell]!;
        for (let k = 0; k < n; k++) {
          const d = grid[cells[k]];
          if (cells[k] !== cell && d && sameKey(d, die)) return true;
        }
        return false;
      };
  }
}
