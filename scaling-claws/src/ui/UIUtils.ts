const flashSequence = new WeakMap<HTMLElement, number>();

export function flashElement(el: HTMLElement, className: string = 'flash-red'): void {
  const seq = (flashSequence.get(el) ?? 0) + 1;
  flashSequence.set(el, seq);

  el.classList.remove(className);
  void el.offsetWidth; // trigger reflow
  el.classList.add(className);

  const clearIfCurrent = (): void => {
    if (flashSequence.get(el) !== seq) return;
    el.classList.remove(className);
  };

  el.addEventListener('animationend', clearIfCurrent, { once: true });
  window.setTimeout(clearIfCurrent, 600);
}
