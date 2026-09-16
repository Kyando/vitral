import { allLines, cellsOfRule, compileRule, lineCells, type Grid } from './rules.ts';
import { dieCode } from './puzzle.ts';
import { deduce, rate, type Rating } from './deduce.ts';
import type { SolveInput } from './solver.ts';
import { COLORS, type BoardRule, type Color, type Die, type LevelDef, type LineRule, type Rule, type RuleType } from './types.ts';

export type LineRuleType = LineRule['type'];

export interface GenerateOptions {
  rows: number;
  cols: number;
  seed: number;
  /** How many colors the dice use (2 to 5). */
  colors?: number;
  boardRules?: BoardRule['type'][];
  /** Line rule types the generator may print on headers. */
  lineTypes?: LineRuleType[];
  /** Header space: rules per row/column. */
  maxLineRules?: number;
  /** Cell restrictions placed first and always kept, for the Sagrada window look. */
  cellRules?: number;
  /** Rule types the level must show at least once (the mechanics a chapter teaches). */
  require?: RuleType[];
  /** Extra redundant rules kept after minimizing: higher is easier. */
  redundancy?: number;
  attempts?: number;
}

export interface Generated {
  def: Omit<LevelDef, 'id' | 'title'>;
  rating: Rating;
}

const ALL_LINE_TYPES: LineRuleType[] = ['sum', 'color-count', 'ascending', 'descending', 'colors-unique', 'values-unique', 'colors-same', 'value-none', 'values-below', 'values-above'];

/** Rarer, more flavourful rules get picked first when they are true. */
const WEIGHT: Record<LineRuleType, number> = {
  sum: 1,
  'color-count': 1.2,
  'colors-same': 3,
  'value-none': 0.6,
  'values-below': 1.6,
  'values-above': 1.6,
  ascending: 3,
  descending: 3,
  'colors-unique': 1.5,
  'values-unique': 1.2,
};

function mulberry32(seed: number): () => number {
  let a = seed >>> 0;
  return () => {
    a = (a + 0x6d2b79f5) >>> 0;
    let t = a;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

const shuffle = <T>(items: T[], rand: () => number): T[] => {
  const out = [...items];
  for (let i = out.length - 1; i > 0; i--) {
    const j = Math.floor(rand() * (i + 1));
    [out[i], out[j]] = [out[j], out[i]];
  }
  return out;
};

/** Weighted random order (Efraimidis–Spirakis). */
const weightedShuffle = <T>(items: T[], weight: (item: T) => number, rand: () => number): T[] =>
  items
    .map((item) => ({ item, key: -Math.log(1 - rand()) / weight(item) }))
    .sort((a, b) => a.key - b.key)
    .map((x) => x.item);

const shapeOf = (o: GenerateOptions) => ({ nRows: o.rows, nCols: o.cols });

function indexRules(o: GenerateOptions, dice: Die[], rules: Rule[]): SolveInput {
  const shape = shapeOf(o);
  const rulesByCell: number[][] = Array.from({ length: o.rows * o.cols }, () => []);
  rules.forEach((rule, i) => cellsOfRule(shape, rule).forEach((cell) => rulesByCell[cell].push(i)));
  return { ...shape, dice, rules, rulesByCell };
}

/** A random full board that respects the board rules. */
function randomSolution(o: GenerateOptions, palette: Color[], boardRules: Rule[], rand: () => number): Die[] | null {
  const shape = shapeOf(o);
  const n = o.rows * o.cols;
  const grid: (Die | null)[] = new Array(n).fill(null);
  const all = palette.flatMap((color) => [1, 2, 3, 4, 5, 6].map((value) => ({ color, value })));
  const checks = boardRules.map((rule) => compileRule(shape, rule));
  let nodes = 0;

  const fill = (cell: number): boolean => {
    if (cell === n) return true;
    if (++nodes > 50_000) return false;
    for (const die of shuffle(all, rand)) {
      grid[cell] = die;
      if (!checks.some((breaks) => breaks(grid, cell)) && fill(cell + 1)) return true;
    }
    grid[cell] = null;
    return false;
  };
  return fill(0) ? grid.map((d) => d!) : null;
}

/** Every line and cell rule that is true for the solution. */
function trueRules(o: GenerateOptions, solution: Grid, palette: Color[], boardTypes: Set<RuleType>): { line: LineRule[]; cell: Rule[] } {
  const shape = shapeOf(o);
  const types = new Set(o.lineTypes ?? ALL_LINE_TYPES);
  const line: LineRule[] = [];

  for (const ref of allLines(shape)) {
    const dice = lineCells(shape, ref).map((cell) => solution[cell]!);
    const values = dice.map((d) => d.value);
    const add = (rule: LineRule) => types.has(rule.type) && line.push(rule);

    add({ ...ref, type: 'sum', value: values.reduce((a, b) => a + b, 0) });
    for (const color of palette) add({ ...ref, type: 'color-count', color, count: dice.filter((d) => d.color === color).length });
    if (dice.length > 1 && dice.every((d) => d.color === dice[0].color)) add({ ...ref, type: 'colors-same' });
    for (let value = 1; value <= 6; value++) if (!values.includes(value)) add({ ...ref, type: 'value-none', value });
    // The tightest bound is the informative one; "less than 7" says nothing.
    const [lo, hi] = [Math.min(...values), Math.max(...values)];
    if (hi < 6) add({ ...ref, type: 'values-below', value: hi + 1 });
    if (lo > 1) add({ ...ref, type: 'values-above', value: lo - 1 });
    if (dice.length > 1 && values.every((v, i) => i === 0 || v > values[i - 1])) add({ ...ref, type: 'ascending' });
    if (dice.length > 1 && values.every((v, i) => i === 0 || v < values[i - 1])) add({ ...ref, type: 'descending' });
    if (!boardTypes.has('lines-colors-unique') && new Set(dice.map((d) => d.color)).size === dice.length) add({ ...ref, type: 'colors-unique' });
    if (!boardTypes.has('lines-values-unique') && new Set(values).size === dice.length) add({ ...ref, type: 'values-unique' });
  }

  const cell: Rule[] = solution.flatMap((die, i) => {
    const row = Math.floor(i / o.cols);
    const col = i % o.cols;
    return [
      { type: 'cell-color' as const, row, col, color: die!.color },
      { type: 'cell-value' as const, row, col, value: die!.value },
    ];
  });
  return { line, cell };
}

const lineKey = (rule: LineRule) => `${rule.line}${rule.index}`;
const cellKeyOf = (rule: Rule) => ('row' in rule ? `${rule.row},${rule.col}` : '');

export function generateLevel(o: GenerateOptions): Generated | null {
  const rand = mulberry32(o.seed);
  const maxLine = o.maxLineRules ?? 2;
  const palette = shuffle([...COLORS], rand).slice(0, Math.max(2, Math.min(5, o.colors ?? 5)));
  const boardRules: Rule[] = (o.boardRules ?? []).map((type) => ({ type }));
  const boardTypes = new Set<RuleType>(o.boardRules ?? []);

  for (let attempt = 0; attempt < (o.attempts ?? 30); attempt++) {
    const solution = randomSolution(o, palette, boardRules, rand);
    if (!solution) continue;
    const dice = [...solution].sort((a, b) => COLORS.indexOf(a.color) - COLORS.indexOf(b.color) || a.value - b.value);
    const pool = trueRules(o, solution, palette, boardTypes);

    // Solvable by reasoning alone, which also proves the solution is unique.
    const unique = (rules: Rule[]) => {
      return deduce(indexRules(o, dice, rules)).solved;
    };

    // Seed the window restrictions, one per cell at most.
    const cellRules = shuffle(pool.cell, rand);
    const protectedRules: Rule[] = [];
    for (const rule of cellRules) {
      if (protectedRules.length >= (o.cellRules ?? 0)) break;
      if (!protectedRules.some((r) => cellKeyOf(r) === cellKeyOf(rule))) protectedRules.push(rule);
    }

    // Mechanics the chapter teaches are placed first and never removed.
    const required = (o.require ?? []).filter((type) => !boardTypes.has(type) && type !== 'cell-color' && type !== 'cell-value');
    const requiredRules = required.map((type) => shuffle(pool.line.filter((r) => r.type === type), rand)[0]);
    if (requiredRules.some((r) => !r)) continue;
    for (const type of ['cell-color', 'cell-value'] as const) {
      if (!o.require?.includes(type) || protectedRules.some((r) => r.type === type)) continue;
      const rule = cellRules.find((r) => r.type === type && !protectedRules.some((p) => cellKeyOf(p) === cellKeyOf(r)));
      if (rule) protectedRules.push(rule);
    }

    const chosen: Rule[] = [...boardRules, ...protectedRules];
    const perLine = new Map<string, LineRule[]>();
    const canAdd = (rule: LineRule) => {
      const rules = perLine.get(lineKey(rule)) ?? [];
      return rules.length < maxLine && !rules.some((r) => r.type === rule.type);
    };
    const addLine = (rule: LineRule) => {
      chosen.push(rule);
      perLine.set(lineKey(rule), [...(perLine.get(lineKey(rule)) ?? []), rule]);
    };
    requiredRules.forEach((rule) => addLine(rule!));
    protectedRules.push(...requiredRules.map((r) => r!));

    // Grow until the solution is the only one.
    let solved = unique(chosen);
    for (const rule of weightedShuffle(pool.line, (r) => WEIGHT[r.type], rand)) {
      if (solved) break;
      if (!canAdd(rule)) continue;
      addLine(rule);
      solved = unique(chosen);
    }
    for (const rule of cellRules) {
      if (solved) break;
      if (chosen.some((r) => cellKeyOf(r) && cellKeyOf(r) === cellKeyOf(rule))) continue;
      chosen.push(rule);
      solved = unique(chosen);
    }
    if (!solved) continue;

    // Shrink: drop every rule the solution does not need (cell rules first, board rules never).
    const removable = chosen.filter((r) => !boardRules.includes(r) && !protectedRules.includes(r));
    const order = [...shuffle(removable.filter((r) => 'row' in r), rand), ...shuffle(removable.filter((r) => 'line' in r), rand)];
    let rules = chosen;
    const removed: Rule[] = [];
    for (const rule of order) {
      const without = rules.filter((r) => r !== rule);
      if (unique(without)) {
        rules = without;
        removed.push(rule);
      }
    }
    rules = [...rules, ...removed.filter((r) => 'line' in r).slice(0, o.redundancy ?? 0)];

    const sortKey = (r: Rule) => ('line' in r ? (r.line === 'row' ? 100 : 200) + r.index : 'row' in r ? 300 + r.row * 10 + r.col : 0);
    rules.sort((a, b) => sortKey(a) - sortKey(b));

    const def = { rows: o.rows, cols: o.cols, dice: dice.map(dieCode), rules, solution: solution.map(dieCode) };
    return { def, rating: rate(indexRules(o, dice, rules)) };
  }
  return null;
}
