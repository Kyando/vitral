import type { Color, Rule } from './types.ts';

/** Player-facing wording (pt-BR). */

export const COLOR_NAME: Record<Color, { one: string; many: string }> = {
  red: { one: 'vermelho', many: 'vermelhos' },
  yellow: { one: 'amarelo', many: 'amarelos' },
  green: { one: 'verde', many: 'verdes' },
  blue: { one: 'azul', many: 'azuis' },
  purple: { one: 'roxo', many: 'roxos' },
};

export function describeRule(rule: Rule): string {
  const where = 'line' in rule ? `${rule.line === 'row' ? 'Linha' : 'Coluna'} ${rule.index + 1}` : '';
  const direction = 'line' in rule && rule.line === 'row' ? 'da esquerda para a direita' : 'de cima para baixo';

  switch (rule.type) {
    case 'adjacent-colors-differ':
      return 'Dados vizinhos não podem ter a mesma cor';
    case 'adjacent-values-differ':
      return 'Dados vizinhos não podem ter o mesmo valor';
    case 'lines-colors-unique':
      return 'Nenhuma cor se repete numa linha ou coluna';
    case 'lines-values-unique':
      return 'Nenhum valor se repete numa linha ou coluna';
    case 'cell-color':
      return `Este quadro pede um dado ${COLOR_NAME[rule.color].one}`;
    case 'cell-value':
      return `Este quadro pede um dado de valor ${rule.value}`;
    case 'sum':
      return `${where}: a soma dos valores é ${rule.value}`;
    case 'color-count': {
      const name = COLOR_NAME[rule.color];
      if (rule.count === 0) return `${where}: nenhum dado ${name.one}`;
      return `${where}: exatamente ${rule.count} ${rule.count === 1 ? `dado ${name.one}` : `dados ${name.many}`}`;
    }
    case 'parity':
      return `${where}: só valores ${rule.parity === 'even' ? 'pares' : 'ímpares'}`;
    case 'ascending':
      return `${where}: valores crescem ${direction}`;
    case 'descending':
      return `${where}: valores diminuem ${direction}`;
    case 'colors-unique':
      return `${where}: todas as cores são diferentes`;
    case 'values-unique':
      return `${where}: todos os valores são diferentes`;
  }
}
