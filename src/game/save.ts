/** Local persistence (per browser). Keyed by level id so level edits don't corrupt other saves. */

export interface LevelProgress {
  /** die index (in the level's dice list) -> "row,col" */
  placements: Record<string, string>;
  done: boolean;
  moves: number;
}

export type ThemeChoice = 'system' | 'light' | 'dark';

export interface SaveData {
  version: 1;
  levels: Record<string, LevelProgress>;
  settings: { theme: ThemeChoice; sound: boolean; seenHelp: boolean; lastLevel: string | null; seenLessons: string[] };
}

export const SAVE_KEY = 'vitral:v1';

const defaults = (): SaveData => ({
  version: 1,
  levels: {},
  settings: { theme: 'system', sound: true, seenHelp: false, lastLevel: null, seenLessons: [] },
});

export const emptyProgress = (): LevelProgress => ({ placements: {}, done: false, moves: 0 });

export function loadSave(): SaveData {
  try {
    const raw = localStorage.getItem(SAVE_KEY);
    if (!raw) return defaults();
    const data = JSON.parse(raw) as SaveData;
    if (data.version !== 1) return defaults();
    return { ...defaults(), ...data, settings: { ...defaults().settings, ...data.settings } };
  } catch {
    return defaults();
  }
}

export function writeSave(data: SaveData): void {
  try {
    localStorage.setItem(SAVE_KEY, JSON.stringify(data));
  } catch {
    // Storage unavailable (private mode, quota): the game still works for this session.
  }
}
