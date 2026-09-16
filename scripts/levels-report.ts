/**
 * Validates every level and prints its difficulty.
 *   npm run levels                 summary
 *   npm run levels -- --rules      also lists each level's rules
 */
import { readdirSync, readFileSync } from 'node:fs';
import { join } from 'node:path';
import { deduce, rate } from '../src/core/deduce.ts';
import { describeRule } from '../src/core/describe.ts';
import { buildPuzzle, dieCode } from '../src/core/puzzle.ts';
import { evaluate } from '../src/core/rules.ts';
import { findSolutions } from '../src/core/solver.ts';
import type { LevelDef } from '../src/core/types.ts';

const dir = join(import.meta.dirname, '../src/levels');
const showRules = process.argv.includes('--rules');
let failed = false;

for (const file of readdirSync(dir).filter((f) => f.endsWith('.json')).sort()) {
  try {
    const def = JSON.parse(readFileSync(join(dir, file), 'utf8')) as LevelDef;
    const p = buildPuzzle(def);
    const declaredOk = p.rules.every((rule) => evaluate(p, rule, p.solution).status === 'ok');
    const { count, solutions } = findSolutions(p, 2);
    const rating = rate(p);
    const ok = declaredOk && count === 1 && rating.deducible;
    failed ||= !ok;

    console.log(
      `${ok ? '✔' : '✘'} ${file.padEnd(26)} ${`${p.nRows}×${p.nCols}`.padEnd(5)} ${rating.label.padEnd(8)} ` +
        `regras=${p.rules.length} alcance=${rating.reachRounds} rodadas=${rating.rounds}`,
    );
    if (!declaredOk) console.log('    a solução declarada quebra alguma regra');
    if (count !== 1) console.log(count ? `    outra solução: ${solutions[1].map(dieCode).join(' ')}` : '    sem solução');
    if (count === 1 && !rating.deducible) {
      const stuck = deduce(p).grid.filter(Boolean).length;
      console.log(`    exige tentativa e erro (a dedução para em ${stuck}/${p.nCells} dados)`);
    }
    if (showRules) p.rules.forEach((r) => console.log(`    ${describeRule(r)}`));
  } catch (err) {
    failed = true;
    console.log(`✘ ${file}\n  ${(err as Error).message}`);
  }
}

process.exit(failed ? 1 : 0);
