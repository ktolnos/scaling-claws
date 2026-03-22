import { CountBulkBuyControls } from '../components/CountBulkBuyControls.ts';
import { setHintTarget } from '../hints/HintUtils.ts';

export interface ResourcePillRefs {
  pill: HTMLDivElement;
  label: HTMLSpanElement;
  amount: HTMLSpanElement;
  primary: HTMLSpanElement;
  secondary: HTMLSpanElement;
}

export type FacilityTone = 'normal' | 'warn' | 'bad';

export interface FacilityCardRefs {
  card: HTMLDivElement;
  formula: HTMLDivElement;
  output: HTMLSpanElement;
  progressFill: HTMLDivElement;
  progressLabel: HTMLSpanElement;
  inputResourceWrap: HTMLDivElement;
  outputResourceWrap: HTMLDivElement;
  price?: HTMLSpanElement;
  controls?: CountBulkBuyControls;
  pauseBtn?: HTMLButtonElement;
}

interface CreateFacilityCardOptions {
  title: string;
  iconSvg: string;
  hintId: string;
  onBuy?: (amount: number) => void;
  onPause?: () => void;
}

export function createResourcePill(parent: HTMLElement, labelHtml: string): ResourcePillRefs {
  const pill = document.createElement('div');
  pill.className = 'facility-card-pill';

  const topRow = document.createElement('div');
  topRow.className = 'facility-card-pill-top';

  const label = document.createElement('span');
  label.className = 'facility-card-pill-label';
  label.innerHTML = labelHtml;
  topRow.appendChild(label);

  const amount = document.createElement('span');
  amount.className = 'facility-card-pill-value facility-card-pill-amount';
  topRow.appendChild(amount);

  pill.appendChild(topRow);

  const detailWrap = document.createElement('div');
  detailWrap.className = 'facility-card-pill-details';

  const primary = document.createElement('span');
  primary.className = 'facility-card-pill-rate facility-card-pill-rate-primary';
  detailWrap.appendChild(primary);

  const secondary = document.createElement('span');
  secondary.className = 'facility-card-pill-rate facility-card-pill-rate-secondary';
  detailWrap.appendChild(secondary);

  pill.appendChild(detailWrap);

  parent.appendChild(pill);
  return { pill, label, amount, primary, secondary };
}

export function setResourcePillState(
  refs: ResourcePillRefs,
  amount: string,
  primary: string,
  secondary: string = '',
  tone: FacilityTone = 'normal',
  primaryColor: string = 'var(--text-muted)',
  secondaryColor: string = 'var(--text-muted)',
): void {
  if (refs.amount.textContent !== amount) {
    refs.amount.textContent = amount;
  }
  const nextPrimary = primary || '';
  if (refs.primary.textContent !== nextPrimary) {
    refs.primary.textContent = nextPrimary;
  }
  const primaryDisplay = primary ? '' : 'none';
  if (refs.primary.style.display !== primaryDisplay) {
    refs.primary.style.display = primaryDisplay;
  }
  if (refs.primary.style.color !== primaryColor) {
    refs.primary.style.color = primaryColor;
  }
  const nextSecondary = secondary || '';
  if (refs.secondary.textContent !== nextSecondary) {
    refs.secondary.textContent = nextSecondary;
  }
  const secondaryDisplay = secondary ? '' : 'none';
  if (refs.secondary.style.display !== secondaryDisplay) {
    refs.secondary.style.display = secondaryDisplay;
  }
  if (refs.secondary.style.color !== secondaryColor) {
    refs.secondary.style.color = secondaryColor;
  }
  const isWarn = tone === 'warn';
  const isBad = tone === 'bad';
  if (refs.pill.classList.contains('is-warn') !== isWarn) {
    refs.pill.classList.toggle('is-warn', isWarn);
  }
  if (refs.pill.classList.contains('is-bad') !== isBad) {
    refs.pill.classList.toggle('is-bad', isBad);
  }
}

export function updateFacilityCardProgress(
  fill: HTMLDivElement,
  label: HTMLSpanElement,
  ratio: number,
  activeBuildings: number,
  maxBuildings: number,
  timeMs: number,
  hasBuildings: boolean = true,
  paused: boolean = false,
): void {
  const clamped = Math.max(0, Math.min(1, ratio));
  const progressEl = fill.parentElement;
  if (progressEl) {
    const tone: FacilityTone = !hasBuildings
      ? 'normal'
      : paused
        ? 'bad'
        : clamped < 0.5
        ? 'bad'
        : clamped < 0.999
          ? 'warn'
          : 'normal';
    const isWarn = tone === 'warn';
    const isBad = tone === 'bad';
    if (progressEl.classList.contains('is-warn') !== isWarn) {
      progressEl.classList.toggle('is-warn', isWarn);
    }
    if (progressEl.classList.contains('is-bad') !== isBad) {
      progressEl.classList.toggle('is-bad', isBad);
    }
  }

  const clampedMax = Math.max(1, maxBuildings);
  const clampedActive = Math.max(0, Math.min(activeBuildings, clampedMax));
  const hasFlow = clampedActive > 0;
  const shouldShowFill = paused ? hasBuildings && fill.dataset.cycleDurationMs !== undefined : hasFlow;
  if (fill.classList.contains('is-active') !== shouldShowFill) {
    fill.classList.toggle('is-active', shouldShowFill);
  }

  const durationMs = hasFlow
    ? Math.max(500, 60_000 / clampedActive)
    : 0;

  const previousDuration = Number(fill.dataset.cycleDurationMs ?? '');
  const previousPhase = Number(fill.dataset.cyclePhase ?? '');
  const previousTime = Number(fill.dataset.cycleLastTimeMs ?? '');
  const wasPaused = fill.dataset.cyclePaused === '1';
  let cyclePhase = 0;

  if (hasBuildings && (hasFlow || paused)) {
    if (Number.isFinite(previousPhase) && Number.isFinite(previousTime)) {
      cyclePhase = previousPhase;
      if (!wasPaused) {
        const phaseDuration = Number.isFinite(previousDuration) && previousDuration > 0
          ? previousDuration
          : durationMs;
        if (phaseDuration > 0) {
          cyclePhase = (cyclePhase + Math.max(0, timeMs - previousTime) / phaseDuration) % 1;
        }
      }
    } else if (durationMs > 0) {
      cyclePhase = (((timeMs % durationMs) + durationMs) % durationMs) / durationMs;
    }
    fill.dataset.cyclePhase = cyclePhase.toFixed(6);
    fill.dataset.cycleLastTimeMs = `${timeMs}`;
  }

  if (!hasBuildings) {
    if (fill.style.animationName !== 'none') {
      fill.style.animationName = 'none';
    }
    if (fill.style.animationPlayState !== 'running') {
      fill.style.animationPlayState = 'running';
    }
    if (fill.style.width !== '0%') {
      fill.style.width = '0%';
    }
    delete fill.dataset.cycleDurationMs;
    delete fill.dataset.cyclePhase;
    delete fill.dataset.cycleLastTimeMs;
    delete fill.dataset.cyclePaused;
  } else if (paused) {
    fill.dataset.cyclePaused = '1';
    if (fill.style.animationPlayState !== 'paused') {
      fill.style.animationPlayState = 'paused';
    }
  } else if (!hasFlow) {
    if (fill.style.animationName !== 'none') {
      fill.style.animationName = 'none';
    }
    if (fill.style.animationPlayState !== 'running') {
      fill.style.animationPlayState = 'running';
    }
    if (fill.style.width !== '0%') {
      fill.style.width = '0%';
    }
    delete fill.dataset.cycleDurationMs;
    delete fill.dataset.cyclePhase;
    delete fill.dataset.cycleLastTimeMs;
    delete fill.dataset.cyclePaused;
  } else {
    const durationKey = durationMs.toFixed(1);
    const durationChanged = fill.dataset.cycleDurationMs !== durationKey;
    fill.dataset.cyclePaused = '0';
    if (durationChanged || fill.style.animationName !== 'facility-card-progress-cycle' || wasPaused) {
      const phaseMs = cyclePhase * durationMs;
      fill.style.animationName = 'facility-card-progress-cycle';
      fill.style.animationDuration = `${durationKey}ms`;
      fill.style.animationDelay = `-${phaseMs.toFixed(1)}ms`;
      fill.style.width = '';
      fill.dataset.cycleDurationMs = durationKey;
    }
    if (fill.style.animationPlayState !== 'running') {
      fill.style.animationPlayState = 'running';
    }
  }

  const labelText = `${Math.round(clamped * 100)}%`;
  if (label.textContent !== labelText) {
    label.textContent = labelText;
  }
  const labelColor = !hasBuildings
    ? 'var(--text-secondary)'
    : paused
      ? 'var(--accent-red)'
      : clamped < 0.5
      ? 'var(--accent-red)'
      : clamped < 0.999
        ? 'var(--accent-gold)'
        : 'var(--text-secondary)';
  if (label.style.color !== labelColor) {
    label.style.color = labelColor;
  }
}

export function setFacilityRecipeHtml(target: HTMLDivElement, html: string): void {
  if (target.innerHTML !== html) {
    target.innerHTML = html;
  }
  const compact = html.length > 120;
  if (target.classList.contains('is-compact') !== compact) {
    target.classList.toggle('is-compact', compact);
  }
}

export function formatRecipeInputsHtml(parts: string[]): string {
  if (parts.length <= 0) return '&nbsp;';
  return parts.map((part) => `<div class="facility-card-formula-line">${part}</div>`).join('');
}

export function setFacilityOutputHtml(target: HTMLElement, html: string): void {
  if (target.innerHTML !== html) {
    target.innerHTML = html;
  }
}

export function createFacilityCardUi(options: CreateFacilityCardOptions): FacilityCardRefs {
  const card = document.createElement('div');
  card.className = 'facility-card';

  const header = document.createElement('div');
  header.className = 'facility-card-header';

  const icon = document.createElement('div');
  icon.className = 'facility-card-icon';
  icon.innerHTML = options.iconSvg;
  header.appendChild(icon);

  const titleWrap = document.createElement('div');
  titleWrap.className = 'facility-card-title-wrap';

  const titleEl = document.createElement('span');
  titleEl.className = 'facility-card-title';
  titleEl.textContent = options.title;
  setHintTarget(titleEl, options.hintId);
  titleWrap.appendChild(titleEl);

  const statusRow = document.createElement('div');
  statusRow.className = 'facility-card-status-row';

  const inputResourceWrap = document.createElement('div');
  inputResourceWrap.className = 'facility-card-pills facility-card-pills-input';
  statusRow.appendChild(inputResourceWrap);

  const centerWrap = document.createElement('div');
  centerWrap.className = 'facility-card-center';

  const formula = document.createElement('div');
  formula.className = 'facility-card-formula';
  centerWrap.appendChild(formula);

  const progressRow = document.createElement('div');
  progressRow.className = 'facility-card-progress-row';

  const progressBar = document.createElement('div');
  progressBar.className = 'facility-card-progress';
  const progressFill = document.createElement('div');
  progressFill.className = 'facility-card-progress-fill';
  progressBar.appendChild(progressFill);
  progressRow.appendChild(progressBar);
  centerWrap.appendChild(progressRow);

  const output = document.createElement('span');
  output.className = 'facility-card-output';
  centerWrap.appendChild(output);

  const progressLabel = document.createElement('span');
  progressLabel.className = 'facility-card-progress-label';
  centerWrap.appendChild(progressLabel);

  statusRow.appendChild(centerWrap);

  const outputResourceWrap = document.createElement('div');
  outputResourceWrap.className = 'facility-card-pills facility-card-pills-output';
  statusRow.appendChild(outputResourceWrap);

  let pauseBtn: HTMLButtonElement | undefined;

  const refs: FacilityCardRefs = {
    card,
    formula,
    output,
    progressFill,
    progressLabel,
    inputResourceWrap,
    outputResourceWrap,
    pauseBtn,
  };

  if (options.onBuy) {
    const priceWrap = document.createElement('div');
    priceWrap.className = 'facility-card-build';
    const priceLabel = document.createElement('span');
    priceLabel.className = 'facility-card-build-label';
    priceLabel.textContent = 'Cost:';
    priceWrap.appendChild(priceLabel);
    const price = document.createElement('span');
    price.className = 'facility-card-build-value';
    priceWrap.appendChild(price);
    titleWrap.appendChild(priceWrap);
    refs.price = price;
  }

  header.appendChild(titleWrap);

  if (options.onPause) {
    pauseBtn = document.createElement('button');
    pauseBtn.className = 'btn-mini facility-card-pause';
    pauseBtn.style.background = 'transparent';
    pauseBtn.style.border = 'none';
    pauseBtn.style.boxShadow = 'none';
    pauseBtn.addEventListener('click', options.onPause);
    header.appendChild(pauseBtn);
    refs.pauseBtn = pauseBtn;
  }

  card.appendChild(header);
  card.appendChild(statusRow);

  if (options.onBuy) {
    const footer = document.createElement('div');
    footer.className = 'facility-card-footer';

    const controls = new CountBulkBuyControls((amt) => options.onBuy!(amt), {
      prefix: '+',
      countPrefix: 'x',
      countMinWidthPx: 28,
      bulkLayout: 'horizontal',
    });
    controls.el.classList.add('facility-card-controls');
    footer.appendChild(controls.el);
    card.appendChild(footer);

    refs.controls = controls;
  }

  return refs;
}
