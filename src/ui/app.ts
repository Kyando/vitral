import type { Color } from '../core/types.ts';
import { emptyProgress, loadSave, writeSave, type ThemeChoice } from '../game/save.ts';
import { Session } from '../game/session.ts';
import { CATALOG } from '../levels/catalog.ts';
import { dieBody, ruleBadge, ruleGlyph } from './dice.ts';
import { h, svg } from './dom.ts';
import { ICONS } from './icons.ts';
import { LevelView } from './level-view.ts';
import { openModal, toast } from './overlay.ts';
import { Sfx } from './sfx.ts';

const GAME_NAME = 'Vitral';
const THEME_LABEL: Record<ThemeChoice, string> = { system: 'do sistema', light: 'claro', dark: 'escuro' };
const SQUARE: Record<Color, string> = { red: '🟥', yellow: '🟨', green: '🟩', blue: '🟦', purple: '🟪' };

const iconButton = (label: string, glyph: string, onClick: () => void) =>
  h('button', { type: 'button', class: 'icon-btn', 'aria-label': label, title: label, onclick: onClick }, svg(glyph));

export class App {
  private readonly save = loadSave();
  private readonly sfx = new Sfx(this.save.settings.sound);
  private readonly main: HTMLElement;
  private readonly soundBtn: HTMLButtonElement;
  private view: LevelView | null = null;
  private index = 0;

  constructor(root: HTMLElement) {
    this.applyTheme();
    this.soundBtn = iconButton('Som', ICONS.soundOn, () => this.toggleSound());
    this.updateSoundIcon();

    const header = h(
      'header',
      { class: 'topbar' },
      h('div', { class: 'topbar-side' }, iconButton('Capítulos', ICONS.book, () => this.openChapters())),
      h('div', { class: 'brand' }, h('span', { class: 'brand-mark', 'aria-hidden': 'true' }, '✦'), GAME_NAME),
      h(
        'div',
        { class: 'topbar-side end' },
        iconButton('Como jogar', ICONS.help, () => this.openHelp()),
        this.soundBtn,
        iconButton('Tema', ICONS.theme, () => this.cycleTheme()),
      ),
    );
    this.main = h('div', { class: 'main' });
    root.append(header, this.main);

    if (!CATALOG.length) {
      this.main.append(h('p', { class: 'empty' }, 'Nenhum nível válido encontrado em src/levels.'));
      return;
    }
    const last = CATALOG.findIndex((l) => l.def.id === this.save.settings.lastLevel);
    const firstOpen = CATALOG.findIndex((l) => !this.save.levels[l.def.id]?.done);
    this.openLevel(last >= 0 ? last : Math.max(0, firstOpen));

    if (!this.save.settings.seenHelp) {
      this.save.settings.seenHelp = true;
      this.persist();
      this.openHelp();
    }
  }

  private persist(): void {
    writeSave(this.save);
  }

  private openLevel(index: number): void {
    this.view?.destroy();
    this.index = index;
    const entry = CATALOG[index];
    const progress = (this.save.levels[entry.def.id] ??= emptyProgress());
    const session = new Session(entry.puzzle, entry.rating, progress, () => this.persist());
    this.view = new LevelView({
      session,
      number: index + 1,
      total: CATALOG.length,
      sfx: this.sfx,
      onSolved: () => this.showWin(session),
    });
    this.main.replaceChildren(this.view.el);
    this.save.settings.lastLevel = entry.def.id;
    this.persist();
  }

  // ── modals ──────────────────────────────────────────────────────────────

  private openChapters(): void {
    const modal = openModal({
      title: 'Capítulos',
      className: 'modal--chapters',
      body: h(
        'ol',
        { class: 'chapters' },
        ...CATALOG.map((entry, i) => {
          const progress = this.save.levels[entry.def.id];
          const classes = ['chapter-card', i === this.index && 'is-current', progress?.done && 'is-done'];
          const colors = [...new Set(entry.puzzle.dice.map((d) => d.color))];
          return h(
            'li',
            {},
            h(
              'button',
              {
                type: 'button',
                class: classes.filter(Boolean).join(' '),
                onclick: () => {
                  modal.close();
                  this.openLevel(i);
                },
              },
              h('span', { class: 'chapter-num' }, progress?.done ? '✓' : String(i + 1)),
              h('span', { class: 'chapter-icons', 'aria-hidden': 'true' }, ...colors.map((color) => h('i', { class: 'swatch', 'data-color': color }))),
              h('span', { class: 'chapter-title' }, entry.def.title),
              h('span', { class: 'chapter-meta' }, `${entry.puzzle.nRows}×${entry.puzzle.nCols} · ${entry.rating.label}`),
            ),
          );
        }),
      ),
    });
  }

  private openHelp(): void {
    const die = (color: Color, value: number) => h('span', { class: 'die ex-die' }, dieBody({ color, value }));
    const status = (className: string, text: string) =>
      h('li', { class: 'legend-item' }, h('span', { class: `badge ${className}` }, ruleGlyph({ type: 'sum', line: 'row', index: 0, value: 9 })), text);
    openModal({
      title: 'Como jogar',
      className: 'modal--help',
      body: h(
        'div',
        { class: 'help' },
        h('p', {}, 'Monte o vitral: arraste cada dado para um quadro, até o tabuleiro ficar cheio, sem quebrar nenhuma regra.'),
        h(
          'div',
          { class: 'example', 'aria-label': 'Exemplo: uma linha com soma 9 recebe os dados 2, 3 e 4' },
          h('span', { class: 'ex-head' }, ruleBadge({ type: 'sum', line: 'row', index: 0, value: 9 })),
          die('red', 2),
          die('blue', 3),
          die('yellow', 4),
        ),
        h(
          'ul',
          {},
          h('li', {}, 'As regras de cada ', h('b', {}, 'linha'), ' ficam à esquerda; as de cada ', h('b', {}, 'coluna'), ', no topo. Toque nelas para ler.'),
          h('li', {}, 'Alguns quadros pedem uma ', h('b', {}, 'cor'), ' ou um ', h('b', {}, 'valor'), ' específico.'),
          h('li', {}, 'As ', h('b', {}, 'regras gerais'), ' valem para o vitral inteiro e aparecem abaixo dos dados.'),
          h('li', {}, 'Tudo é conferido a cada jogada. Dá para resolver só com lógica, sem chutar.'),
        ),
        h(
          'ul',
          { class: 'legend' },
          status('', 'ainda em aberto'),
          status('is-ok', 'cumprida'),
          status('is-broken', 'quebrada: os dados culpados ficam marcados'),
        ),
      ),
      actions: [h('button', { type: 'button', class: 'btn btn--primary', onclick: (e: Event) => (e.target as HTMLElement).closest('dialog')?.close() }, 'Vamos lá')],
    });
  }

  private showWin(session: Session): void {
    const p = session.puzzle;
    const number = this.index + 1;
    const hasNext = number < CATALOG.length;
    const stat = (value: string | number, label: string) =>
      h('div', { class: 'stat' }, h('strong', {}, String(value)), h('span', {}, label));
    const grid = session.grid();
    const rows = Array.from({ length: p.nRows }, (_, r) =>
      grid.slice(r * p.nCols, (r + 1) * p.nCols).map((d) => (d ? SQUARE[d.color] : '⬜')).join(''),
    );

    const share = () => {
      const text = `${GAME_NAME} · Capítulo ${number} (${session.rating.label})\n${session.progress.moves} movimentos\n${rows.join('\n')}`;
      navigator.clipboard?.writeText(text).then(
        () => toast('Resultado copiado!'),
        () => toast('Não foi possível copiar'),
      );
    };

    const modal = openModal({
      title: 'Vitral completo!',
      className: 'modal--win',
      body: h(
        'div',
        { class: 'win' },
        h(
          'div',
          { class: 'win-art', 'aria-hidden': 'true', style: `--cols: ${p.nCols}` },
          ...grid.map((d, i) => h('i', { class: 'swatch', 'data-color': d?.color ?? '', style: `animation-delay: ${i * 30}ms` })),
        ),
        h('p', {}, `Você montou “${p.def.title}”.`),
        h('div', { class: 'stats' }, stat(session.progress.moves, 'movimentos'), stat(p.rules.length, 'regras cumpridas')),
      ),
      actions: [
        h('button', { type: 'button', class: 'btn', onclick: share }, svg(ICONS.share), h('span', {}, 'Compartilhar')),
        hasNext
          ? h('button', { type: 'button', class: 'btn btn--primary', onclick: () => { modal.close(); this.openLevel(this.index + 1); } }, h('span', {}, 'Próximo'), svg(ICONS.arrow))
          : h('button', { type: 'button', class: 'btn btn--primary', onclick: () => { modal.close(); this.openChapters(); } }, h('span', {}, 'Capítulos')),
      ],
    });
  }

  // ── settings ────────────────────────────────────────────────────────────

  private applyTheme(): void {
    const theme = this.save.settings.theme;
    if (theme === 'system') delete document.documentElement.dataset.theme;
    else document.documentElement.dataset.theme = theme;
  }

  private cycleTheme(): void {
    const order: ThemeChoice[] = ['system', 'light', 'dark'];
    const next = order[(order.indexOf(this.save.settings.theme) + 1) % order.length];
    this.save.settings.theme = next;
    this.applyTheme();
    this.persist();
    toast(`Tema ${THEME_LABEL[next]}`);
  }

  private toggleSound(): void {
    this.save.settings.sound = !this.save.settings.sound;
    this.sfx.enabled = this.save.settings.sound;
    this.updateSoundIcon();
    this.persist();
    if (this.sfx.enabled) this.sfx.pick();
  }

  private updateSoundIcon(): void {
    this.soundBtn.replaceChildren(svg(this.save.settings.sound ? ICONS.soundOn : ICONS.soundOff));
    this.soundBtn.setAttribute('aria-pressed', String(this.save.settings.sound));
  }
}
