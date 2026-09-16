export interface DragHandlers {
  onTap(): void;
  onStart(): void;
  onMove(x: number, y: number): void;
  /** `ghostRect` is where the dragged copy was released, for the landing animation. */
  onDrop(x: number, y: number, ghostRect: DOMRect): void;
}

const DRAG_THRESHOLD = 6;
/** How far a scrolling finger must stray across the strip before it picks the die up instead. */
const LIFT_DISTANCE = 14;

/**
 * Pointer-based drag (mouse, touch and pen) with a floating ghost; short presses count as taps.
 * The page never takes over the gesture (the pieces use `touch-action: none`), so a drag can go in
 * any direction. On touch, a die inside `scroller` that starts moving along the strip scrolls it by
 * hand, and turns into a drag as soon as the finger heads across or leaves the strip.
 */
export function makeDraggable(el: HTMLElement, handlers: DragHandlers, scroller?: () => HTMLElement | null): void {
  el.addEventListener('pointerdown', (down) => {
    if (down.button !== 0) return;
    down.preventDefault();
    let offsetX = 0;
    let offsetY = 0;
    let ghost: HTMLElement | null = null;
    let mode: 'press' | 'scroll' | 'drag' = 'press';
    let last = { x: down.clientX, y: down.clientY };
    el.setPointerCapture(down.pointerId);

    const strip = down.pointerType === 'mouse' ? null : (scroller?.() ?? null);
    const axis = strip && strip.scrollWidth > strip.clientWidth + 1 ? 'x' : strip && strip.scrollHeight > strip.clientHeight + 1 ? 'y' : null;

    const lift = () => {
      const rect = el.getBoundingClientRect();
      offsetX = Math.min(Math.max(last.x - rect.left, 0), rect.width);
      offsetY = Math.min(Math.max(last.y - rect.top, 0), rect.height);
      ghost = el.cloneNode(true) as HTMLElement;
      ghost.classList.add('ghost');
      ghost.classList.remove('is-selected', 'pop', 'nudge');
      ghost.style.width = `${rect.width}px`;
      ghost.style.height = `${rect.height}px`;
      document.body.append(ghost);
      el.classList.add('is-lifted');
      mode = 'drag';
      handlers.onStart();
    };

    const move = (e: PointerEvent) => {
      const dx = e.clientX - down.clientX;
      const dy = e.clientY - down.clientY;
      if (mode === 'press') {
        if (Math.hypot(dx, dy) < DRAG_THRESHOLD) return;
        const along = axis === 'x' ? Math.abs(dx) > Math.abs(dy) * 1.2 : axis === 'y' && Math.abs(dy) > Math.abs(dx) * 1.2;
        if (along) mode = 'scroll';
        else lift();
      }
      if (mode === 'scroll' && strip) {
        const box = strip.getBoundingClientRect();
        const across = axis === 'x' ? Math.abs(dy) : Math.abs(dx);
        const outside = e.clientX < box.left || e.clientX > box.right || e.clientY < box.top || e.clientY > box.bottom;
        if (across < LIFT_DISTANCE && !outside) {
          if (axis === 'x') strip.scrollLeft -= e.clientX - last.x;
          else strip.scrollTop -= e.clientY - last.y;
          last = { x: e.clientX, y: e.clientY };
          return;
        }
        last = { x: e.clientX, y: e.clientY };
        lift();
      }
      last = { x: e.clientX, y: e.clientY };
      ghost!.style.transform = `translate(${e.clientX - offsetX}px, ${e.clientY - offsetY}px)`;
      handlers.onMove(e.clientX, e.clientY);
    };

    const finish = (e: PointerEvent, cancelled: boolean) => {
      el.removeEventListener('pointermove', move);
      el.removeEventListener('pointerup', up);
      el.removeEventListener('pointercancel', cancel);
      if (!ghost) {
        if (!cancelled && mode === 'press') handlers.onTap();
        return;
      }
      const ghostRect = ghost.getBoundingClientRect();
      ghost.remove();
      el.classList.remove('is-lifted');
      // A cancelled gesture drops "nowhere", which animates the piece back home.
      handlers.onDrop(cancelled ? -1 : e.clientX, cancelled ? -1 : e.clientY, ghostRect);
    };
    const up = (e: PointerEvent) => finish(e, false);
    const cancel = (e: PointerEvent) => finish(e, true);

    el.addEventListener('pointermove', move);
    el.addEventListener('pointerup', up);
    el.addEventListener('pointercancel', cancel);
  });
}
