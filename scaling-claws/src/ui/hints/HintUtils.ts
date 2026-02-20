export function setHintTarget<T extends HTMLElement>(el: T, hintId: string): T {
  // Keep hints label-only: interactive controls (buttons/inputs) should not show hover tooltips.
  const tag = el.tagName.toLowerCase();
  if (tag === 'button' || tag === 'input' || tag === 'select' || tag === 'textarea') {
    return el;
  }

  el.dataset.hintId = hintId;
  el.classList.add('hint-target');
  return el;
}
