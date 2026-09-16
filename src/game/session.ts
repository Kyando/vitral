import type { Rating } from '../core/deduce.ts';
import { cellKey, type Puzzle } from '../core/puzzle.ts';
import { evaluate, type Verdict } from '../core/rules.ts';
import type { Die } from '../core/types.ts';
import type { LevelProgress } from './save.ts';

const HISTORY_LIMIT = 200;

/** The state of one level being played. Indices internally, "row,col" keys in the saved progress. */
export class Session {
  readonly puzzle: Puzzle;
  readonly rating: Rating;
  readonly progress: LevelProgress;
  /** Cell per die, -1 when in the tray. */
  placement: number[];
  private history: number[][] = [];
  private readonly onSave: () => void;

  constructor(puzzle: Puzzle, rating: Rating, progress: LevelProgress, onSave: () => void) {
    this.puzzle = puzzle;
    this.rating = rating;
    this.progress = progress;
    this.onSave = onSave;

    const cellByKey = new Map(Array.from({ length: puzzle.nCells }, (_, c) => [cellKey(puzzle, c), c]));
    this.placement = new Array<number>(puzzle.nCells).fill(-1);
    puzzle.dice.forEach((_, i) => {
      const cell = cellByKey.get(progress.placements[i]);
      if (cell !== undefined && !this.placement.includes(cell)) this.placement[i] = cell;
    });
  }

  get canUndo(): boolean {
    return this.history.length > 0;
  }

  get placedCount(): number {
    return this.placement.filter((c) => c >= 0).length;
  }

  get allPlaced(): boolean {
    return this.placedCount === this.puzzle.nCells;
  }

  dieAt(cell: number): number {
    return this.placement.indexOf(cell);
  }

  /** The board as the rules see it. */
  grid(): (Die | null)[] {
    const grid: (Die | null)[] = new Array(this.puzzle.nCells).fill(null);
    this.placement.forEach((cell, die) => cell >= 0 && (grid[cell] = this.puzzle.dice[die]));
    return grid;
  }

  /** A verdict per rule, for the current board. */
  verdicts(): Verdict[] {
    const grid = this.grid();
    return this.puzzle.rules.map((rule) => evaluate(this.puzzle, rule, grid));
  }

  isSolved(verdicts = this.verdicts()): boolean {
    return this.allPlaced && verdicts.every((v) => v.status === 'ok');
  }

  /** Moves a die to a cell (swapping with its occupant) or back to the tray (`null`). */
  move(die: number, cell: number | null): boolean {
    const from = this.placement[die];
    const to = cell ?? -1;
    if (from === to) return false;
    this.snapshot();
    if (to >= 0) {
      const occupant = this.dieAt(to);
      if (occupant >= 0) this.placement[occupant] = from;
    }
    this.placement[die] = to;
    this.progress.moves++;
    this.commit();
    return true;
  }

  undo(): boolean {
    const last = this.history.pop();
    if (!last) return false;
    this.placement = last;
    this.commit();
    return true;
  }

  reset(): void {
    this.snapshot();
    this.placement.fill(-1);
    this.commit();
  }

  markSolved(): void {
    this.progress.done = true;
    this.commit();
  }

  private snapshot(): void {
    this.history.push([...this.placement]);
    if (this.history.length > HISTORY_LIMIT) this.history.shift();
  }

  private commit(): void {
    this.progress.placements = Object.fromEntries(
      this.placement.flatMap((cell, die) => (cell >= 0 ? [[String(die), cellKey(this.puzzle, cell)]] : [])),
    );
    this.onSave();
  }
}
