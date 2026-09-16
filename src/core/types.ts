/**
 * Level data format (the JSON files in src/levels).
 * This is the single source of truth shared by the web game, the generator and future exporters.
 */

export const COLORS = ['red', 'yellow', 'green', 'blue', 'purple'] as const;
export type Color = (typeof COLORS)[number];

/** One letter per color, used in die codes such as "R3" (red three). */
export const COLOR_CODE: Record<Color, string> = { red: 'R', yellow: 'Y', green: 'G', blue: 'B', purple: 'P' };

export interface Die {
  color: Color;
  /** 1 to 6 */
  value: number;
}

// ── Rules ──────────────────────────────────────────────────────────────────

/** Rules that apply to the whole board. */
export type BoardRule =
  | { type: 'adjacent-colors-differ' }
  | { type: 'adjacent-values-differ' }
  | { type: 'lines-colors-unique' }
  | { type: 'lines-values-unique' };

export interface LineRef {
  line: 'row' | 'col';
  /** 0-based row or column index. */
  index: number;
}

/** Rules printed on a row or column header. Rows read left→right, columns top→bottom. */
export type LineRule = LineRef &
  (
    | { type: 'sum'; value: number }
    /** Exactly `count` dice of that color (0 means "no dice of that color"). */
    | { type: 'color-count'; color: Color; count: number }
    /** Every die in the line has the same color. */
    | { type: 'colors-same' }
    /** No die in the line shows this value. */
    | { type: 'value-none'; value: number }
    /** Every die in the line shows less than `value`. */
    | { type: 'values-below'; value: number }
    /** Every die in the line shows more than `value`. */
    | { type: 'values-above'; value: number }
    | { type: 'ascending' }
    | { type: 'descending' }
    | { type: 'colors-unique' }
    | { type: 'values-unique' }
  );

export interface CellRef {
  row: number;
  col: number;
}

/** Sagrada-style window restrictions printed on a single cell. */
export type CellRule = CellRef & ({ type: 'cell-color'; color: Color } | { type: 'cell-value'; value: number });

export type Rule = BoardRule | LineRule | CellRule;
export type RuleType = Rule['type'];

export interface LevelDef {
  id: string;
  title: string;
  subtitle?: string;
  rows: number;
  cols: number;
  /** Die codes ("R3", "B5"...). Exactly one die per cell: the board is always full. */
  dice: string[];
  rules: Rule[];
  /** Mechanics this chapter teaches for the first time, shown as "new symbol" cards. */
  intro?: RuleType[];
  /** The intended solution, as die codes in reading order (row by row). */
  solution: string[];
}
