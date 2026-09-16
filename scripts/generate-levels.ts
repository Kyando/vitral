/**
 * Generates the chapter levels into src/levels from the plan below.
 *   npm run levels:generate                 regenerate every chapter
 *   npm run levels:generate -- 3            regenerate only chapter 3
 *   npm run levels:generate -- --dry        print, don't write
 * Each chapter tries several seeds and keeps the one that best matches its target difficulty.
 */
import { readdirSync, rmSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { describeRule } from '../src/core/describe.ts';
import { generateLevel, type Generated, type GenerateOptions } from '../src/core/generate.ts';
import type { LevelDef } from '../src/core/types.ts';

interface Chapter {
  file: string;
  id: string;
  title: string;
  subtitle: string;
  target: 1 | 2 | 3;
  options: Omit<GenerateOptions, 'seed'>;
}

const PLAN: Chapter[] = [
  {
    file: '01-primeira-janela',
    id: 'primeira-janela',
    title: 'Primeira Janela',
    subtitle: 'Dados vizinhos nunca dividem a mesma cor.',
    target: 1,
    options: { rows: 3, cols: 3, colors: 3, boardRules: ['adjacent-colors-differ'], lineTypes: ['sum', 'color-count'], redundancy: 4 },
  },
  {
    file: '02-rosacea',
    id: 'rosacea',
    title: 'Rosácea',
    subtitle: 'Alguns quadros já pedem uma cor ou um valor.',
    target: 1,
    options: { rows: 3, cols: 3, colors: 4, boardRules: ['adjacent-values-differ'], cellRules: 3, redundancy: 3 },
  },
  {
    file: '03-claraboia',
    id: 'claraboia',
    title: 'Claraboia',
    subtitle: 'Como no Sudoku: nada de valores repetidos na mesma linha ou coluna.',
    target: 2,
    options: { rows: 3, cols: 4, colors: 4, boardRules: ['lines-values-unique'], redundancy: 2 },
  },
  {
    file: '04-capela',
    id: 'capela',
    title: 'Capela',
    subtitle: 'Quatro por quatro, e as cores continuam brigando com as vizinhas.',
    target: 2,
    options: { rows: 4, cols: 4, colors: 4, boardRules: ['adjacent-colors-differ'], cellRules: 3, redundancy: 1 },
  },
  {
    file: '05-vitral-do-norte',
    id: 'vitral-do-norte',
    title: 'Vitral do Norte',
    subtitle: 'Cada linha e coluna com cores únicas, e vizinhos com valores diferentes.',
    target: 2,
    options: { rows: 4, cols: 4, colors: 5, boardRules: ['lines-colors-unique', 'adjacent-values-differ'], redundancy: 1 },
  },
  {
    file: '06-nave-central',
    id: 'nave-central',
    title: 'Nave Central',
    subtitle: 'Uma janela mais larga, com duas regras gerais ao mesmo tempo.',
    target: 3,
    options: { rows: 4, cols: 5, colors: 5, boardRules: ['adjacent-colors-differ', 'lines-values-unique'], cellRules: 2 },
  },
  {
    file: '07-catedral',
    id: 'catedral',
    title: 'Catedral',
    subtitle: 'A grande janela: nenhum vizinho repete cor nem valor.',
    target: 3,
    options: { rows: 5, cols: 5, colors: 5, boardRules: ['adjacent-colors-differ', 'adjacent-values-differ'], cellRules: 3 },
  },
];

const SEEDS = 60;
const levelsDir = join(import.meta.dirname, '../src/levels');
const dry = process.argv.includes('--dry');
const only = process.argv.slice(2).find((a) => /^\d+$/.test(a));

const cellRuleCount = (g: Generated) => g.def.rules.filter((r) => 'row' in r && !('line' in r)).length;

/** Lower is better: right difficulty first, then fewer cell rules (headers carry the logic), then variety. */
function cost(chapter: Chapter, g: Generated): number {
  const kinds = new Set(g.def.rules.map((r) => r.type)).size;
  const extraCells = cellRuleCount(g) - (chapter.options.cellRules ?? 0);
  return Math.abs(g.rating.level - chapter.target) * 100 + extraCells * 3 - kinds * 2 + g.def.rules.length * 0.5;
}

for (const [i, chapter] of PLAN.entries()) {
  if (only && Number(only) !== i + 1) continue;
  let best: Generated | null = null;
  for (let seed = 1; seed <= SEEDS; seed++) {
    const g = generateLevel({ ...chapter.options, seed: seed * 7919 + i });
    if (g?.rating.deducible && (!best || cost(chapter, g) < cost(chapter, best))) best = g;
  }
  if (!best) {
    console.log(`✘ ${chapter.file}: nenhuma semente gerou um nível dedutível`);
    process.exitCode = 1;
    continue;
  }

  const def: LevelDef = { id: chapter.id, title: chapter.title, subtitle: chapter.subtitle, ...best.def };
  const { rating } = best;
  console.log(
    `${rating.level === chapter.target ? '✔' : '≈'} ${chapter.file.padEnd(22)} ${def.rows}×${def.cols} ${rating.label.padEnd(8)} ` +
      `regras=${def.rules.length} quadros=${cellRuleCount(best)} alcance=${rating.reachRounds}`,
  );
  if (dry) {
    def.rules.forEach((r) => console.log(`    ${describeRule(r)}${'row' in r && !('line' in r) ? ` (${r.row + 1},${r.col + 1})` : ''}`));
    continue;
  }
  for (const f of readdirSync(levelsDir)) if (f.startsWith(chapter.file.slice(0, 3)) && f.endsWith('.json')) rmSync(join(levelsDir, f));
  writeFileSync(join(levelsDir, `${chapter.file}.json`), `${JSON.stringify(def, null, 2)}\n`);
}
