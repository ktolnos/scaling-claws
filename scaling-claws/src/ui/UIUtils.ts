export function flashElement(el: HTMLElement, className: string = 'flash-red'): void {
  el.classList.remove(className);
  void el.offsetWidth; // trigger reflow
  el.classList.add(className);
}
