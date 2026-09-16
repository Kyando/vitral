import { cellsOfRule, ruleScope } from './rules.ts';
import { COLOR_CODE, COLORS, type Color, type Die, type LevelDef, type Rule } from './types.ts';

export const MAX_SIDE = 6;

/** A validated level, indexed for fast rule checks. */
export interface Puzzle {
  def: LevelDef;
  nRows: number;
  nCols: number;
  /** Also the number of dice: every cell receives exactly one. */
  nCells: number;
  dice: Die[];
  rules: Rule[];
  /** Cells each rule looks at. */
  cellsByRule: number[][];
  /** Rules that look at each cell. */
  rulesByCell: number[][];
  /** Intended solution, a die per cell. */
  solution: Die[];
}

export class LevelError extends Error {}

const COLOR_BY_CODE = new Map(COLORS.map((c) => [COLOR_CODE[c], c]));

export const dieCode = (d: Die): string => `${COLOR_CODE[d.color]}${d.value}`;
export const sameDie = (a: Die | null, b: Die | null): boolean => !!a && !!b && a.color === b.color && a.value === b.value;

export function parseDie(code: string): Die | null {
  const color = COLOR_BY_CODE.get(code[0]);
  const value = Number(code.slice(1));
  return color && Number.isInteger(value) && value >= 1 && value <= 6 ? { color, value } : null;
}

export const rowOf = (p: Pick<Puzzle, 'nCols'>, cell: number): number => Math.floor(cell / p.nCols);
export const colOf = (p: Pick<Puzzle, 'nCols'>, cell: number): number => cell % p.nCols;
export const cellKey = (p: Pick<Puzzle, 'nCols'>, cell: number): string => `${rowOf(p, cell)},${colOf(p, cell)}`;

const multiset = (dice: Die[]): string => dice.map(dieCode).sort().join(' ');

export function buildPuzzle(def: LevelDef): Puzzle {
  const errors: string[] = [];
  const nRows = def.rows;
  const nCols = def.cols;
  const nCells = nRows * nCols;

  if (!(nRows >= 1 && nRows <= MAX_SIDE && nCols >= 1 && nCols <= MAX_SIDE)) {
    errors.push(`linhas e colunas devem ficar entre 1 e ${MAX_SIDE}`);
  }
  if (def.dice.length !== nCells) {
    errors.push(`o tabuleiro precisa ficar cheio: ${nCells} quadros pedem ${nCells} dados (tem ${def.dice.length})`);
  }

  const parseAll = (codes: string[], where: string): Die[] =>
    codes.map((code) => {
      const die = parseDie(code);
      if (!die) errors.push(`${where}: dado inválido "${code}" (use cor + valor, ex.: R3)`);
      return die ?? { color: 'red' as Color, value: 1 };
    });
  const dice = parseAll(def.dice, 'dados');
  const solution = parseAll(def.solution, 'solução');

  if (solution.length !== nCells) errors.push(`a solução precisa de ${nCells} dados (tem ${solution.length})`);
  else if (multiset(solution) !== multiset(dice)) errors.push('a solução não usa exatamente os dados do nível');

  const shape = { nRows, nCols };
  def.rules.forEach((rule, i) => {
    const scope = ruleScope(rule);
    if (scope === 'line') {
      const r = rule as { line: string; index: number };
      const max = r.line === 'row' ? nRows : nCols;
      if ((r.line !== 'row' && r.line !== 'col') || !(r.index >= 0 && r.index < max)) errors.push(`regra ${i + 1}: linha/coluna inválida`);
    } else if (scope === 'cell') {
      const r = rule as { row: number; col: number };
      if (!(r.row >= 0 && r.row < nRows && r.col >= 0 && r.col < nCols)) errors.push(`regra ${i + 1}: quadro inválido`);
    }
  });

  if (errors.length) throw new LevelError(`Nível "${def.id}":\n  - ${errors.join('\n  - ')}`);

  const cellsByRule = def.rules.map((rule) => cellsOfRule(shape, rule));
  const rulesByCell: number[][] = Array.from({ length: nCells }, () => []);
  cellsByRule.forEach((cells, rule) => cells.forEach((cell) => rulesByCell[cell].push(rule)));

  return { def, nRows, nCols, nCells, dice, rules: def.rules, cellsByRule, rulesByCell, solution };
}
