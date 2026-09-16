import { describeRule } from '../core/describe.ts';
import { colOf, rowOf } from '../core/puzzle.ts';
import { lineCells, ruleScope, type Status } from '../core/rules.ts';
import type { CellRule } from '../core/types.ts';
import type { Session } from '../game/session.ts';
import { dieBody, dieLabel, ruleBadge, ruleGlyph } from './dice.ts';
import { h, svg } from './dom.ts';
import { makeDraggable } from './drag.ts';
import { burst, flip, replay } from './fx.ts';
import { ICONS } from './icons.ts';
import { toast } from './overlay.ts';
import type { Sfx } from './sfx.ts';

export interface LevelViewOptions {
  session: Session;
  number: number;
  total: number;
  sfx: Sfx;
  onSolved(): void;
}

type DropTarget = number | 'tray' | null;

const HEADER_RATIO = 0.78;
/** Smallest header sizes (px): a row header fits one badge's width, a column header fits its stacked badges. */
const HEAD_MIN_WIDTH = 60;
const HEAD_MIN_HEIGHT = [30, 42, 84];
const RADII = ['12px 9px 13px 10px', '9px 13px 10px 12px', '13px 10px 9px 12px', '10px 12px 12px 9px'];
const STATUS_ICON: Record<Status, string> = { open: '', ok: ICONS.check, broken: ICONS.close };

const plural = (n: number, one: string, many: string) => `${n} ${n === 1 ? one : many}`;

export class LevelView {
  readonly el: HTMLElement;
  private readonly s: Session;
  private readonly opts: LevelViewOptions;
  private readonly boardWrap: HTMLElement;
  private readonly board: HTMLElement;
  private readonly cells: HTMLElement[] = [];
  private readonly pieces: HTMLElement[] = [];
  private readonly slots: HTMLElement[] = [];
  /** Every element showing a rule's status: header badge, rules list item, cell tag. */
  private readonly ruleEls: HTMLElement[][];
  /** Row/column headers and the rules they hold. */
  private readonly heads: { el: HTMLElement; rules: number[] }[] = [];
  private readonly undoBtn: HTMLButtonElement;
  private readonly summary: HTMLElement;
  private readonly trayScroll: HTMLElement;
  private readonly resizeObserver: ResizeObserver;
  private statuses: Status[];
  private selected = -1;
  /** Solved boards celebrate once; loading an already solved board doesn't celebrate again. */
  private celebrated: boolean;
  private hovered: HTMLElement | null = null;

  constructor(opts: LevelViewOptions) {
    this.opts = opts;
    this.s = opts.session;
    const p = this.s.puzzle;
    const def = p.def;
    this.ruleEls = p.rules.map(() => []);
    this.statuses = p.rules.map(() => 'open');
    this.celebrated = this.s.isSolved();

    // Chapter heading
    const rating = this.s.rating;
    const heading = h(
      'header',
      { class: 'chapter' },
      h(
        'p',
        { class: 'eyebrow' },
        h('span', {}, `Capítulo ${opts.number} de ${opts.total}`),
        h(
          'span',
          { class: 'difficulty', title: `Dificuldade: ${rating.label}` },
          ...[1, 2, 3].map((i) => h('i', { class: i <= rating.level ? 'on' : '' })),
          rating.label,
        ),
      ),
      h('h1', {}, def.title),
      def.subtitle ? h('p', { class: 'subtitle' }, def.subtitle) : null,
    );

    // Board: column rules on top, row rules on the left, window restrictions printed on cells.
    this.board = h('div', { class: 'board', 'aria-label': 'Vitral' });
    this.board.style.setProperty('--rows', String(p.nRows));
    this.board.style.setProperty('--cols', String(p.nCols));
    this.board.append(h('div', { class: 'corner', 'aria-hidden': 'true' }, '✦'));
    for (let c = 0; c < p.nCols; c++) this.board.append(this.makeHead('col', c));
    for (let r = 0; r < p.nRows; r++) {
      this.board.append(this.makeHead('row', r));
      for (let c = 0; c < p.nCols; c++) this.board.append(this.makeCell(r * p.nCols + c));
    }
    this.boardWrap = h('div', { class: 'board-wrap' }, this.board);

    // Tools sit next to the summary, so the board keeps every pixel of height on phones.
    const tool = (text: string, glyph: string, onClick: () => void) =>
      h('button', { type: 'button', class: 'icon-btn tool', 'aria-label': text, title: text, onclick: onClick }, svg(glyph));
    this.undoBtn = tool('Desfazer', ICONS.undo, () => this.undo());
    const tools = h('nav', { class: 'tools', 'aria-label': 'Ferramentas' }, tool('Recomeçar', ICONS.restart, () => this.restart()), this.undoBtn);

    // Tray, with the live rule feedback right under the dice.
    const tray = h('div', { class: 'tray' });
    p.dice.forEach((_, i) => {
      const slot = h('div', { class: 'slot' }, this.makePiece(i));
      this.slots.push(slot);
      tray.append(slot);
    });

    const boardRules = p.rules.flatMap((rule, i) => (ruleScope(rule) === 'board' ? [i] : []));
    // Modifiers apply to the whole window, so they sit right above it.
    const rulesList = h(
      'ul',
      { class: 'rules', 'aria-label': 'Modificadores' },
      ...boardRules.map((i) => {
        const text = describeRule(p.rules[i]);
        const item = h(
          'li',
          { class: 'rule', title: text, onclick: () => toast(text, 3200) },
          h('span', { class: 'rule-glyph', 'aria-hidden': 'true' }, ruleGlyph(p.rules[i])),
          h('span', { class: 'rule-text' }, text),
          h('span', { class: 'rule-status', 'aria-hidden': 'true' }),
        );
        this.ruleEls[i].push(item);
        return item;
      }),
    );
    this.summary = h('p', { class: 'summary', role: 'status', 'aria-live': 'polite' });
    this.trayScroll = h('div', { class: 'tray-scroll' }, tray);
    const trayPanel = h(
      'section',
      { class: 'tray-panel', 'aria-label': 'Dados' },
      this.trayScroll,
      h('div', { class: 'tray-foot' }, h('div', { class: 'foot-row' }, tools, this.summary)),
    );
    trayPanel.addEventListener('click', (e) => {
      if (!(e.target as Element).closest('.piece, .tray-foot')) this.onTrayTap();
    });

    this.el = h(
      'main',
      { class: 'stage' },
      heading,
      h('div', { class: 'play' }, h('div', { class: 'board-area' }, boardRules.length ? rulesList : null, this.boardWrap), trayPanel),
    );

    this.resizeObserver = new ResizeObserver(() => this.fit());
    this.resizeObserver.observe(this.boardWrap);
    this.resizeObserver.observe(this.trayScroll);
    this.sync();
  }

  destroy(): void {
    this.resizeObserver.disconnect();
  }

  // ── building ────────────────────────────────────────────────────────────

  private makeHead(line: 'row' | 'col', index: number): HTMLElement {
    const p = this.s.puzzle;
    const rules = p.rules.flatMap((rule, i) => ('line' in rule && rule.line === line && rule.index === index ? [i] : []));
    const text = rules.map((i) => describeRule(p.rules[i])).join(' · ');
    const el = h('div', {
      class: `head head--${line}${rules.length ? '' : ' is-empty'}`,
      role: rules.length ? 'button' : undefined,
      tabindex: rules.length ? 0 : undefined,
      'aria-label': text || `${line === 'row' ? 'Linha' : 'Coluna'} ${index + 1}: sem regra`,
    });
    this.heads.push({ el, rules });
    if (!rules.length) return el;

    for (const i of rules) {
      const badge = ruleBadge(p.rules[i]);
      this.ruleEls[i].push(badge);
      el.append(badge);
    }
    const cells = lineCells(p, { line, index });
    const focus = (on: boolean) => cells.forEach((cell) => this.cells[cell]?.classList.toggle('is-focus', on));
    el.addEventListener('pointerenter', () => focus(true));
    el.addEventListener('pointerleave', () => focus(false));
    el.addEventListener('focus', () => focus(true));
    el.addEventListener('blur', () => focus(false));
    el.addEventListener('click', () => toast(text, 3200));
    el.addEventListener('keydown', (e) => {
      if (e.key === 'Enter' || e.key === ' ') {
        e.preventDefault();
        toast(text, 3200);
      }
    });
    return el;
  }

  private makeCell(index: number): HTMLElement {
    const p = this.s.puzzle;
    const r = rowOf(p, index);
    const c = colOf(p, index);
    const reqIndex = p.rules.findIndex((rule) => 'row' in rule && !('line' in rule) && rule.row === r && rule.col === c);
    const req = reqIndex >= 0 ? (p.rules[reqIndex] as CellRule) : null;

    const cell = h(
      'div',
      {
        class: 'cell',
        'data-cell': index,
        role: 'button',
        tabindex: 0,
        'aria-label': `Linha ${r + 1}, coluna ${c + 1}${req ? `. ${describeRule(req)}` : ''}`,
        'data-req-color': req?.type === 'cell-color' ? req.color : undefined,
        style: `border-radius: ${RADII[(r * 3 + c) % RADII.length]}`,
      },
      req?.type === 'cell-value' ? h('span', { class: 'cell-req', 'aria-hidden': 'true' }, String(req.value)) : null,
      h('span', { class: 'cell-slot' }),
    );
    if (req) {
      // Stays visible over the die, so the restriction is never hidden.
      const tag = h('span', { class: 'cell-tag', title: describeRule(req), 'aria-hidden': 'true' }, ruleGlyph(req));
      this.ruleEls[reqIndex].push(tag);
      cell.append(tag);
    }
    cell.addEventListener('click', () => this.onCellTap(index));
    cell.addEventListener('keydown', (e) => {
      if (e.key === 'Enter' || e.key === ' ') {
        e.preventDefault();
        this.onCellTap(index);
      }
    });
    this.cells.push(cell);
    return cell;
  }

  private makePiece(index: number): HTMLElement {
    const die = this.s.puzzle.dice[index];
    const piece = h(
      'div',
      {
        class: 'piece die',
        'data-die': index,
        role: 'button',
        tabindex: 0,
        'aria-label': `Dado ${dieLabel(die)}`,
        style: `--tilt: ${((index * 37) % 7) - 3}deg`,
      },
      dieBody(die),
    );
    piece.addEventListener('click', (e) => e.stopPropagation());
    piece.addEventListener('keydown', (e) => {
      if (e.key === 'Enter' || e.key === ' ') {
        e.preventDefault();
        e.stopPropagation();
        this.onPieceTap(index);
      }
    });
    makeDraggable(piece, {
      onTap: () => this.onPieceTap(index),
      onStart: () => {
        this.selected = -1;
        this.board.classList.add('is-dragging');
        this.opts.sfx.pick();
        this.sync();
      },
      onMove: (x, y) => this.hover(this.dropTarget(x, y)),
      onDrop: (x, y, ghostRect) => {
        this.hover(null);
        this.board.classList.remove('is-dragging');
        const target = this.dropTarget(x, y);
        const from = new Map([[index, ghostRect]]);
        if (target === null) this.sync(from);
        else this.moveTo(index, target === 'tray' ? null : target, from);
      },
    });
    this.pieces.push(piece);
    return piece;
  }

  // ── interaction ─────────────────────────────────────────────────────────

  private dropTarget(x: number, y: number): DropTarget {
    const el = document.elementFromPoint(x, y);
    const cell = el?.closest<HTMLElement>('.cell');
    if (cell) return this.cells.indexOf(cell);
    return el?.closest('.tray-panel') ? 'tray' : null;
  }

  private hover(target: DropTarget): void {
    const next = typeof target === 'number' ? this.cells[target] : null;
    if (next === this.hovered) return;
    this.hovered?.classList.remove('is-hover');
    next?.classList.add('is-hover');
    this.hovered = next;
  }

  private onPieceTap(die: number): void {
    const at = this.s.placement[die];
    // With another die in hand, tapping a placed die means "put it here".
    if (this.selected >= 0 && this.selected !== die && at >= 0) {
      this.onCellTap(at);
      return;
    }
    this.selected = this.selected === die ? -1 : die;
    if (this.selected >= 0) this.opts.sfx.pick();
    this.sync();
  }

  private onCellTap(cell: number): void {
    if (this.selected >= 0) {
      this.moveTo(this.selected, cell);
      return;
    }
    const occupant = this.s.dieAt(cell);
    if (occupant >= 0) {
      this.selected = occupant;
      this.opts.sfx.pick();
      this.sync();
    }
  }

  private onTrayTap(): void {
    if (this.selected < 0) return;
    if (this.s.placement[this.selected] >= 0) this.moveTo(this.selected, null);
    else {
      this.selected = -1;
      this.sync();
    }
  }

  private moveTo(die: number, cell: number | null, from?: Map<number, DOMRect>): void {
    const occupant = cell === null ? -1 : this.s.dieAt(cell);
    const moved = this.s.move(die, cell);
    this.selected = -1;
    if (!moved) {
      this.sync(from);
      return;
    }
    this.opts.sfx.drop();
    this.sync(from, true);
    replay(this.pieces[die], 'pop');
    if (occupant >= 0 && occupant !== die) replay(this.pieces[occupant], 'pop');
  }

  private undo(): void {
    if (!this.s.undo()) return;
    this.selected = -1;
    this.sync(undefined, true);
  }

  private restart(): void {
    if (!this.s.placedCount) return;
    this.s.reset();
    this.selected = -1;
    this.sync();
    toast('Vitral limpo. Dá para desfazer.');
  }

  private celebrate(): void {
    const p = this.s.puzzle;
    this.s.markSolved();
    this.opts.sfx.win();
    this.s.placement.forEach((cell) => {
      const el = this.cells[cell];
      el.style.setProperty('--delay', `${(rowOf(p, cell) + colOf(p, cell)) * 70}ms`);
      replay(el, 'celebrate');
    });
    const r = this.board.getBoundingClientRect();
    burst(r.left + r.width / 2, r.top + r.height / 2, ['🟥', '🟨', '🟩', '🟦', '🟪', '✨', '⭐']);
    window.setTimeout(() => this.opts.onSolved(), 1150);
  }

  // ── rendering ───────────────────────────────────────────────────────────

  /**
   * Reflects session state in the DOM, animating dice that changed place.
   * With `feedback` (a move by the player), rules that just broke or just got satisfied animate and sound.
   */
  private sync(from?: Map<number, DOMRect>, feedback = false): void {
    const firsts = this.pieces.map((pc, i) => from?.get(i) ?? pc.getBoundingClientRect());

    this.pieces.forEach((pc, i) => {
      const cell = this.s.placement[i];
      const target = cell >= 0 ? this.cells[cell].querySelector('.cell-slot')! : this.slots[i];
      if (pc.parentElement !== target) target.append(pc);
      pc.classList.toggle('is-placed', cell >= 0);
      pc.classList.toggle('is-selected', this.selected === i);
      this.slots[i].classList.toggle('is-empty', cell >= 0);
    });
    this.cells.forEach((el, cell) => el.classList.toggle('has-piece', this.s.dieAt(cell) >= 0));
    this.board.classList.toggle('has-selection', this.selected >= 0);
    this.undoBtn.disabled = !this.s.canUndo;

    const verdicts = this.s.verdicts();
    let newlyBroken = false;
    let newlyOk = false;
    verdicts.forEach(({ status }, i) => {
      const changed = this.statuses[i] !== status;
      for (const el of this.ruleEls[i]) {
        el.classList.toggle('is-ok', status === 'ok');
        el.classList.toggle('is-broken', status === 'broken');
        el.querySelector('.rule-status')?.replaceChildren(...(STATUS_ICON[status] ? [svg(STATUS_ICON[status])] : []));
        if (feedback && changed && status !== 'open') replay(el, status === 'broken' ? 'wobble' : 'pop');
      }
      if (feedback && changed) {
        newlyBroken ||= status === 'broken';
        newlyOk ||= status === 'ok';
      }
    });
    this.statuses = verdicts.map((v) => v.status);

    const conflicts = new Set(verdicts.flatMap((v) => v.cells));
    this.cells.forEach((el, cell) => el.classList.toggle('is-conflict', conflicts.has(cell)));
    for (const head of this.heads) {
      const states = head.rules.map((i) => verdicts[i].status);
      head.el.classList.toggle('is-ok', states.length > 0 && states.every((st) => st === 'ok'));
      head.el.classList.toggle('is-broken', states.includes('broken'));
    }

    const solved = this.s.isSolved(verdicts);
    const ok = verdicts.filter((v) => v.status === 'ok').length;
    this.renderSummary(ok, verdicts.length, verdicts.filter((v) => v.status === 'broken').length, solved);

    if (feedback) {
      if (newlyBroken) this.opts.sfx.nope();
      else if (newlyOk) this.opts.sfx.ok();
      if (!solved && this.s.allPlaced) replay(this.board, 'shake');
    }
    if (solved && !this.celebrated) {
      this.celebrated = true;
      this.selected = -1;
      this.celebrate();
    } else if (!solved) {
      this.celebrated = false;
    }

    this.trayScroll.classList.toggle('is-scrollable', this.trayScroll.scrollWidth > this.trayScroll.clientWidth + 1);
    this.pieces.forEach((pc, i) => flip(pc, firsts[i]));
  }

  private renderSummary(ok: number, total: number, broken: number, solved: boolean): void {
    const p = this.s.puzzle;
    const message = solved
      ? 'Vitral completo!'
      : broken
        ? plural(broken, 'regra quebrada', 'regras quebradas')
        : this.s.placedCount
          ? 'Nenhuma regra quebrada'
          : 'Arraste os dados para o vitral';
    this.summary.className = `summary${broken ? ' is-broken' : ''}${solved ? ' is-solved' : ''}`;
    this.summary.replaceChildren(
      h('span', { class: 'summary-count' }, h('b', {}, `${this.s.placedCount}/${p.nCells}`), ' dados'),
      h('span', { class: 'check-meter', style: `--ratio: ${ok / total}`, title: `${ok} de ${total} regras cumpridas` }),
      h('span', { class: 'summary-text' }, message),
    );
  }

  /** Sizes cells and headers to the space available. */
  private fit(): void {
    const p = this.s.puzzle;
    const { width, height } = this.boardWrap.getBoundingClientRect();
    const gap = width < 480 ? 5 : 8;
    const colRules = Math.max(0, ...this.heads.filter((hd) => hd.el.classList.contains('head--col')).map((hd) => hd.rules.length));
    const headHeight = HEAD_MIN_HEIGHT[Math.min(colRules, 2)];
    // Cell size along one axis, with the header proportional to the cell but never below its floor.
    const along = (space: number, n: number, headMin: number) => {
      const proportional = (space - gap * n) / (n + HEADER_RATIO);
      return proportional * HEADER_RATIO >= headMin ? proportional : (space - gap * n - headMin) / n;
    };
    const size = Math.max(34, Math.min(120, Math.floor(Math.min(along(width, p.nCols, HEAD_MIN_WIDTH), along(height, p.nRows, headHeight)))));
    this.el.style.setProperty('--cell', `${size}px`);
    this.el.style.setProperty('--gap', `${gap}px`);
    this.el.style.setProperty('--head-w', `${Math.max(size * HEADER_RATIO, HEAD_MIN_WIDTH)}px`);
    this.el.style.setProperty('--head-h', `${Math.max(size * HEADER_RATIO, headHeight)}px`);
    this.trayScroll.classList.toggle('is-scrollable', this.trayScroll.scrollWidth > this.trayScroll.clientWidth + 1);
  }
}
