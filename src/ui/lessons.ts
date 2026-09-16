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
    text: 'Um quadro tingido só aceita um dado daquela cor.',
    examples: [{ glyph: { color: 'red' }, caption: 'pede um dado vermelho' }],
  },
  'cell-value': {
    title: 'Número gravado',
    text: 'Um quadro com um número gravado só aceita um dado com esse número. O dado é o símbolo dos números.',
    examples: [{ glyph: { number: 5 }, caption: 'pede um dado com 5' }],
  },
  'color-count': {
    title: 'Contando cores',
    text: 'Nas bordas, cada círculo é um dado daquela cor na linha ou coluna. Um traço por cima quer dizer nenhum.',
    examples: [
      { glyph: { color: 'red', op: 'count', n: 2 }, caption: 'exatamente 2 vermelhos' },
      { glyph: { color: 'blue', op: 'none' }, caption: 'nenhum azul' },
    ],
  },
  'colors-unique': {
    title: 'Cores diferentes',
    text: 'O círculo dividido é uma cor qualquer. Com ≠, nenhuma cor se repete na linha ou coluna.',
    examples: [{ glyph: { color: 'any', op: 'different' }, caption: 'todas as cores diferentes' }],
  },
  sum: {
    title: 'Soma',
    text: 'O dado com ? é um número qualquer. +12 quer dizer que os números da linha ou coluna somam 12.',
    examples: [{ glyph: { number: 'any', op: 'total', n: 12 }, caption: 'os números somam 12' }],
  },
  'values-unique': {
    title: 'Números diferentes',
    text: 'Com ≠, nenhum número se repete na linha ou coluna.',
    examples: [{ glyph: { number: 'any', op: 'different' }, caption: 'todos os números diferentes' }],
  },
  ascending: {
    title: 'Em ordem',
    text: 'As barras mostram a ordem. Nas linhas, leia da esquerda para a direita; nas colunas, de cima para baixo.',
    examples: [
      { glyph: { number: 'any', op: 'up' }, caption: 'os números sobem' },
      { glyph: { number: 'any', op: 'down' }, caption: 'os números descem' },
    ],
  },
  'colors-same': {
    title: 'Mesma cor',
    text: 'Com =, todos os dados da linha ou coluna têm a mesma cor.',
    examples: [{ glyph: { color: 'any', op: 'same' }, caption: 'tudo da mesma cor' }],
  },
  'value-none': {
    title: 'Número proibido',
    text: 'Um dado riscado: nenhum dado com esse número na linha ou coluna.',
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
    text: 'A mesma cruz, agora com o dado: dados que se tocam pelo lado nunca têm o mesmo número.',
    examples: [{ glyph: { scope: 'neighbors', number: 'any', op: 'different' }, caption: 'vizinhos com números diferentes' }],
    modifier: true,
  },
  'lines-values-unique': {
    title: 'Modificador: todas as linhas e colunas',
    text: 'As setas valem para todas as linhas e colunas ao mesmo tempo: nenhum número se repete em nenhuma delas.',
    examples: [{ glyph: { scope: 'lines', number: 'any', op: 'different' }, caption: 'sem número repetido em linhas e colunas' }],
    modifier: true,
  },
  'lines-colors-unique': {
    title: 'Todas as linhas e colunas: cores',
    text: 'Nenhuma cor se repete em nenhuma linha ou coluna.',
    examples: [{ glyph: { scope: 'lines', color: 'any', op: 'different' }, caption: 'sem cor repetida em linhas e colunas' }],
    modifier: true,
  },
};

/** The symbol alphabet, for the help screen. */
export const RADICALS: { title: string; items: { glyph: GlyphSpec; caption: string }[] }[] = [
  {
    title: 'O que a regra olha',
    items: [
      { glyph: { color: 'any' }, caption: 'uma cor qualquer' },
      { glyph: { color: 'red' }, caption: 'vermelho' },
      { glyph: { number: 'any' }, caption: 'um número qualquer' },
      { glyph: { number: 5 }, caption: 'o número 5' },
    ],
  },
  {
    title: 'O que precisa ser verdade',
    items: [
      { glyph: { color: 'any', op: 'different' }, caption: 'tudo diferente' },
      { glyph: { color: 'any', op: 'same' }, caption: 'tudo igual' },
      { glyph: { color: 'red', op: 'none' }, caption: 'nenhum' },
      { glyph: { color: 'red', op: 'count', n: 2 }, caption: 'exatamente 2' },
      { glyph: { number: 'any', op: 'up' }, caption: 'em ordem' },
      { glyph: { number: 'any', op: 'total', n: 12 }, caption: 'soma 12' },
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
