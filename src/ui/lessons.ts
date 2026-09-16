import type { RuleType } from '../core/types.ts';
import type { GlyphSpec } from './dice.ts';

/** How each mechanic is introduced the first time a chapter uses it (pt-BR). */
export interface Lesson {
  title: string;
  text: string;
  /** Glyphs shown as examples, with a short caption each. */
  examples: { glyph: GlyphSpec; caption: string }[];
  /** Modifiers apply to the whole window. */
  modifier?: boolean;
}

export const LESSONS: Partial<Record<RuleType, Lesson>> = {
  'cell-color': {
    title: 'Vidro colorido',
    text: 'Tudo no Vitral é um dado. A cor do dado é a cor pedida: um quadro tingido só aceita um dado daquela cor.',
    examples: [{ glyph: { color: 'red' }, caption: 'pede um dado vermelho' }],
  },
  'cell-value': {
    title: 'Pontos gravados',
    text: 'Os pontos do dado são o número pedido: um quadro com pontos gravados só aceita um dado com esse número. Dado vazio quer dizer qualquer cor e qualquer número.',
    examples: [
      { glyph: { number: 5 }, caption: 'pede um dado com 5' },
      { glyph: { color: 'any' }, caption: 'qualquer dado' },
    ],
  },
  'color-count': {
    title: 'Contando dados',
    text: 'Nas bordas, ×N diz quantos dados daquele tipo existem na linha ou coluna. ×0 quer dizer nenhum.',
    examples: [
      { glyph: { color: 'red', op: 'count', n: 2 }, caption: 'exatamente 2 vermelhos' },
      { glyph: { color: 'blue', op: 'none' }, caption: 'nenhum azul' },
    ],
  },
  'colors-unique': {
    title: 'Cores únicas',
    text: 'Três dados de cores diferentes: nenhuma cor se repete na linha ou coluna.',
    examples: [{ glyph: { color: 'any', op: 'different' }, caption: 'cores únicas' }],
  },
  sum: {
    title: 'Soma',
    text: 'Dado vazio com =12: os números da linha ou coluna somam 12. O número no canto mostra quanto a linha soma até agora.',
    examples: [{ glyph: { number: 'any', op: 'total', n: 12 }, caption: 'os números somam 12' }],
  },
  'values-unique': {
    title: 'Números únicos',
    text: 'Três dados com números diferentes: nenhum número se repete na linha ou coluna.',
    examples: [{ glyph: { number: 'any', op: 'different' }, caption: 'números únicos' }],
  },
  ascending: {
    title: 'Em ordem',
    text: 'A seta mostra para onde os números vão: só sobem ou só descem. Nas linhas, leia da esquerda para a direita; nas colunas, de cima para baixo.',
    examples: [
      { glyph: { number: 'any', op: 'up' }, caption: 'os números sobem' },
      { glyph: { number: 'any', op: 'down' }, caption: 'os números descem' },
    ],
  },
  'values-below': {
    title: 'Maior e menor',
    text: 'Dado vazio com <4: todos os números da linha ou coluna são menores que 4. Com >3, todos são maiores que 3.',
    examples: [
      { glyph: { number: 'any', op: 'below', n: 4 }, caption: 'todos menores que 4' },
      { glyph: { number: 'any', op: 'above', n: 3 }, caption: 'todos maiores que 3' },
    ],
  },
  'colors-same': {
    title: 'Cores idênticas',
    text: 'Três dados da mesma cor: todos os dados da linha ou coluna têm a mesma cor.',
    examples: [{ glyph: { color: 'any', op: 'same' }, caption: 'tudo da mesma cor' }],
  },
  'value-none': {
    title: 'Número proibido',
    text: 'O mesmo ×0, agora com um número: nenhum dado com esse número na linha ou coluna.',
    examples: [{ glyph: { number: 6, op: 'none' }, caption: 'nenhum 6' }],
  },
  'adjacent-colors-differ': {
    title: 'Modificador: vizinhos',
    text: 'Modificadores ficam acima do vitral e valem para ele inteiro. A cruz são os vizinhos: dados que se tocam pelo lado (diagonal não conta) têm cores diferentes.',
    examples: [{ glyph: { scope: 'neighbors', color: 'any', op: 'different' }, caption: 'vizinhos com cores diferentes' }],
    modifier: true,
  },
  'adjacent-values-differ': {
    title: 'Vizinhos com números diferentes',
    text: 'A mesma cruz, agora com números: dados que se tocam pelo lado nunca têm o mesmo número.',
    examples: [{ glyph: { scope: 'neighbors', number: 'any', op: 'different' }, caption: 'vizinhos com números diferentes' }],
    modifier: true,
  },
  'lines-values-unique': {
    title: 'Modificador: todas as linhas e colunas',
    text: 'A grade vale para todas as linhas e colunas ao mesmo tempo: nenhum número se repete em nenhuma delas.',
    examples: [{ glyph: { scope: 'lines', number: 'any', op: 'different' }, caption: 'números únicos em todas as linhas e colunas' }],
    modifier: true,
  },
  'lines-colors-unique': {
    title: 'Todas as linhas e colunas: cores',
    text: 'Nenhuma cor se repete em nenhuma linha ou coluna.',
    examples: [{ glyph: { scope: 'lines', color: 'any', op: 'different' }, caption: 'cores únicas em todas as linhas e colunas' }],
    modifier: true,
  },
};

/** The symbol alphabet, for the help screen. */
export const RADICALS: { title: string; items: { glyph: GlyphSpec; caption: string }[] }[] = [
  {
    title: 'Tudo é um dado',
    items: [
      { glyph: { color: 'any' }, caption: 'qualquer dado' },
      { glyph: { color: 'red' }, caption: 'vermelho' },
      { glyph: { number: 5 }, caption: 'o número 5' },
    ],
  },
  {
    title: 'O que precisa ser verdade',
    items: [
      { glyph: { color: 'any', op: 'different' }, caption: 'cores únicas' },
      { glyph: { number: 'any', op: 'different' }, caption: 'números únicos' },
      { glyph: { color: 'any', op: 'same' }, caption: 'cores idênticas' },
      { glyph: { color: 'red', op: 'count', n: 2 }, caption: 'exatamente 2' },
      { glyph: { color: 'red', op: 'none' }, caption: 'nenhum' },
      { glyph: { number: 'any', op: 'up' }, caption: 'em ordem' },
      { glyph: { number: 'any', op: 'total', n: 12 }, caption: 'soma 12' },
      { glyph: { number: 'any', op: 'below', n: 4 }, caption: 'menores que 4' },
      { glyph: { number: 'any', op: 'above', n: 3 }, caption: 'maiores que 3' },
    ],
  },
  {
    title: 'Modificadores: onde vale',
    items: [
      { glyph: { scope: 'neighbors', color: 'any', op: 'different' }, caption: 'vizinhos' },
      { glyph: { scope: 'lines', number: 'any', op: 'different' }, caption: 'todas as linhas e colunas' },
    ],
  },
];
