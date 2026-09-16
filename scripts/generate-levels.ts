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
import { generateLevel, type Generated, type GenerateOptions, type LineRuleType } from '../src/core/generate.ts';
import type { LevelDef, RuleType } from '../src/core/types.ts';

interface Chapter {
  file: string;
  id: string;
  title: string;
  subtitle: string;
  target: 1 | 2 | 3;
  /** Mechanics introduced here (shown as "new symbol" cards) and guaranteed to appear. */
  teaches: RuleType[];
  options: Omit<GenerateOptions, 'seed' | 'require'>;
}

// Line rule types grow chapter by chapter: each level may only use what was already taught.
const L1: LineRuleType[] = ['color-count'];
const L2: LineRuleType[] = [...L1, 'colors-unique'];
const L3: LineRuleType[] = [...L2, 'sum'];
const L4: LineRuleType[] = [...L3, 'values-unique'];
const L5: LineRuleType[] = [...L4, 'ascending', 'descending'];
const L6: LineRuleType[] = [...L5, 'colors-same'];
const L7: LineRuleType[] = [...L6, 'value-none'];
const L8: LineRuleType[] = [...L7, 'values-below', 'values-above'];

const PLAN: Chapter[] = [
  {
    file: '01-vidro-colorido',
    id: 'vidro-colorido',
    title: 'Vidro Colorido',
    subtitle: 'Cada quadro pede uma cor ou um número.',
    target: 1,
    teaches: ['cell-color', 'cell-value'],
    options: { rows: 2, cols: 3, colors: 3, lineTypes: [] },
  },
  {
    file: '02-contando-cores',
    id: 'contando-cores',
    title: 'Contando Cores',
    subtitle: 'O ×N nas bordas conta os dados de cada cor.',
    target: 1,
    teaches: ['color-count'],
    options: { rows: 3, cols: 3, colors: 3, lineTypes: L1, maxLineRules: 1, redundancy: 2 },
  },
  {
    file: '03-cores-diferentes',
    id: 'cores-diferentes',
    title: 'Cores Diferentes',
    subtitle: 'Três cores diferentes: nenhuma cor se repete.',
    target: 1,
    teaches: ['colors-unique'],
    options: { rows: 3, cols: 3, colors: 3, lineTypes: L2, maxLineRules: 1, redundancy: 2 },
  },
  {
    file: '04-soma',
    id: 'soma',
    title: 'A Soma',
    subtitle: 'Dado vazio com =N: os números somam N.',
    target: 1,
    teaches: ['sum'],
    options: { rows: 3, cols: 3, colors: 3, lineTypes: L3, maxLineRules: 1, redundancy: 2 },
  },
  {
    file: '05-numeros-diferentes',
    id: 'numeros-diferentes',
    title: 'Números Diferentes',
    subtitle: 'Agora são os números que não se repetem.',
    target: 2,
    teaches: ['values-unique'],
    options: { rows: 3, cols: 3, colors: 4, lineTypes: L4, maxLineRules: 1, redundancy: 1 },
  },
  {
    file: '06-em-ordem',
    id: 'em-ordem',
    title: 'Em Ordem',
    subtitle: 'A seta mostra para onde os números vão.',
    target: 2,
    teaches: ['ascending'],
    options: { rows: 3, cols: 4, colors: 4, lineTypes: L5, maxLineRules: 1, redundancy: 1 },
  },
  {
    file: '07-mesma-cor',
    id: 'mesma-cor',
    title: 'Mesma Cor',
    subtitle: 'Três dados da mesma cor: a linha inteira combina.',
    target: 2,
    teaches: ['colors-same'],
    options: { rows: 3, cols: 4, colors: 4, lineTypes: L6, maxLineRules: 1, redundancy: 1 },
  },
  {
    file: '08-numero-proibido',
    id: 'numero-proibido',
    title: 'Número Proibido',
    subtitle: 'Um número ×0 não pode aparecer.',
    target: 2,
    teaches: ['value-none'],
    options: { rows: 3, cols: 4, colors: 4, lineTypes: L7, maxLineRules: 2, redundancy: 1 },
  },
  {
    file: '09-maior-e-menor',
    id: 'maior-e-menor',
    title: 'Maior e Menor',
    subtitle: 'Com <4, tudo fica abaixo de 4; com >3, acima de 3.',
    target: 2,
    teaches: ['values-below', 'values-above'],
    options: { rows: 3, cols: 4, colors: 4, lineTypes: L8, maxLineRules: 2, redundancy: 1 },
  },
  {
    file: '10-vizinhos',
    id: 'vizinhos',
    title: 'Vizinhos',
    subtitle: 'O primeiro modificador vale para o vitral inteiro.',
    target: 2,
    teaches: ['adjacent-colors-differ'],
    options: { rows: 3, cols: 4, colors: 4, boardRules: ['adjacent-colors-differ'], lineTypes: L8, maxLineRules: 2, redundancy: 1 },
  },
  {
    file: '11-vizinhos-numeros',
    id: 'vizinhos-numeros',
    title: 'Vizinhos Numerados',
    subtitle: 'Quem se toca pelo lado nunca repete número.',
    target: 2,
    teaches: ['adjacent-values-differ'],
    options: { rows: 4, cols: 4, colors: 4, boardRules: ['adjacent-values-differ'], lineTypes: L8, maxLineRules: 2 },
  },
  {
    file: '12-linhas-e-colunas',
    id: 'linhas-e-colunas',
    title: 'Linhas e Colunas',
    subtitle: 'Nenhum número se repete em linha nenhuma. Parece Sudoku?',
    target: 3,
    teaches: ['lines-values-unique'],
    options: { rows: 4, cols: 4, colors: 4, boardRules: ['lines-values-unique'], lineTypes: L8, maxLineRules: 2 },
  },
  {
    file: '13-catedral',
    id: 'catedral',
    title: 'Catedral',
    subtitle: 'Tudo o que você aprendeu, numa janela só.',
    target: 3,
    teaches: [],
    options: { rows: 4, cols: 5, colors: 5, boardRules: ['adjacent-colors-differ', 'lines-values-unique'], lineTypes: L8, maxLineRules: 2, cellRules: 2 },
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

if (!dry && !only) for (const f of readdirSync(levelsDir)) if (f.endsWith('.json')) rmSync(join(levelsDir, f));

for (const [i, chapter] of PLAN.entries()) {
  if (only && Number(only) !== i + 1) continue;
  let best: Generated | null = null;
  for (let seed = 1; seed <= SEEDS; seed++) {
    const g = generateLevel({ ...chapter.options, require: chapter.teaches, seed: seed * 7919 + i });
    if (g?.rating.deducible && (!best || cost(chapter, g) < cost(chapter, best))) best = g;
  }
  if (!best) {
    console.log(`✘ ${chapter.file}: nenhuma semente gerou um nível dedutível`);
    process.exitCode = 1;
    continue;
  }

  const def: LevelDef = { id: chapter.id, title: chapter.title, subtitle: chapter.subtitle, intro: chapter.teaches, ...best.def };
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
