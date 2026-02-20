import { getHint } from './HintContent.ts';

const SHOW_DELAY_MS = 300;
const HIDE_DELAY_MS = 120;
const VIEWPORT_MARGIN = 8;
const OVERLAY_GAP = 10;
const BASE_Z_INDEX = 2500;

type HintDirection = 'top' | 'bottom' | 'left' | 'right';
type PlacementVariant =
  | 'bottom-start'
  | 'right-start'
  | 'left-start'
  | 'top-start'
  | 'bottom-center'
  | 'top-center'
  | 'right-center'
  | 'left-center';

interface OverlayLayer {
  overlay: HTMLDivElement;
  titleEl: HTMLDivElement;
  bodyEl: HTMLDivElement;
  activeAnchorEl: HTMLElement | null;
  activeAnchorRect: DOMRect | null;
}

export class HintOverlay {
  private readonly mountPoint: HTMLElement;
  private readonly layers: OverlayLayer[] = [];

  private showTimerId: number | null = null;
  private hideTimerId: number | null = null;
  private pendingHintId: string | null = null;
  private pendingAnchorEl: HTMLElement | null = null;
  private pendingDepth = 0;

  private hoveredHintTarget: HTMLElement | null = null;
  private readonly hoveredOverlayDepths = new Set<number>();

  constructor(mountPoint: HTMLElement = document.body) {
    this.mountPoint = mountPoint;

    document.addEventListener('mouseover', this.onMouseOver, true);
    document.addEventListener('mouseout', this.onMouseOut, true);

    window.addEventListener('resize', this.onViewportChanged);
    window.addEventListener('scroll', this.onViewportChanged, true);
  }

  private readonly onMouseOver = (event: MouseEvent): void => {
    const target = event.target as Element | null;
    if (!target) return;

    const hintTarget = target.closest<HTMLElement>('[data-hint-id]');
    if (!hintTarget) return;

    const related = event.relatedTarget as Node | null;
    if (related && hintTarget.contains(related)) return;

    const depth = this.getDepthForTarget(hintTarget);
    this.beginTargetHover(hintTarget, depth);
  };

  private readonly onMouseOut = (event: MouseEvent): void => {
    const target = event.target as Element | null;
    if (!target) return;

    const hintTarget = target.closest<HTMLElement>('[data-hint-id]');
    if (!hintTarget) return;

    const related = event.relatedTarget as Element | null;
    if (related && hintTarget.contains(related)) return;

    if (this.hoveredHintTarget === hintTarget) {
      this.hoveredHintTarget = null;
    }

    if (related) {
      const nextHintTarget = related.closest<HTMLElement>('[data-hint-id]');
      if (nextHintTarget) {
        const depth = this.getDepthForTarget(nextHintTarget);
        this.beginTargetHover(nextHintTarget, depth);
        return;
      }

      if (this.isElementInsideVisibleOverlay(related)) {
        // If a target that spawns child hints lost hover and we're not entering
        // that child layer, collapse the child chain immediately.
        const childDepth = this.getDepthForTarget(hintTarget);
        const relatedDepth = this.getVisibleOverlayDepthForElement(related);
        if (childDepth > 0 && (relatedDepth === null || relatedDepth < childDepth)) {
          this.hideFromDepth(childDepth);
        }
        return;
      }
    }

    // Leaving a hint target entirely should collapse any child chain it spawned.
    const childDepth = this.getDepthForTarget(hintTarget);
    if (childDepth > 0) {
      this.hideFromDepth(childDepth);
    }

    if (this.hoveredOverlayDepths.size === 0) {
      this.scheduleHide();
    }
  };

  private onOverlayMouseEnter(depth: number): void {
    this.hoveredOverlayDepths.add(depth);
    this.clearHideTimer();
  }

  private onOverlayMouseLeave(depth: number, event: MouseEvent): void {
    this.hoveredOverlayDepths.delete(depth);

    const related = event.relatedTarget as Element | null;
    if (related) {
      const nextHintTarget = related.closest<HTMLElement>('[data-hint-id]');
      if (nextHintTarget) {
        const nextDepth = this.getDepthForTarget(nextHintTarget);
        this.beginTargetHover(nextHintTarget, nextDepth);
        return;
      }

      if (this.isElementInsideVisibleOverlay(related)) {
        const relatedDepth = this.getVisibleOverlayDepthForElement(related);
        // If moving to a shallower layer, close this layer and deeper ones.
        if (relatedDepth !== null && relatedDepth < depth) {
          this.hideFromDepth(depth);
        }
        return;
      }
    }

    // Leaving a child layer entirely should close it immediately.
    if (depth > 0) {
      this.hideFromDepth(depth);
    }

    if (!this.hoveredHintTarget && this.hoveredOverlayDepths.size === 0) {
      this.scheduleHide();
    }
  }

  private readonly onViewportChanged = (): void => {
    for (let depth = 0; depth < this.layers.length; depth++) {
      const layer = this.layers[depth];
      if (!this.isLayerVisible(layer)) continue;

      if (layer.activeAnchorEl) {
        if (!layer.activeAnchorEl.isConnected) {
          if (!layer.activeAnchorRect) {
            this.hideFromDepth(depth);
            continue;
          }
        } else {
          layer.activeAnchorRect = layer.activeAnchorEl.getBoundingClientRect();
        }
      }

      if (!layer.activeAnchorRect) continue;
      this.positionLayer(layer, layer.activeAnchorRect);
    }
  };

  private beginTargetHover(hintTarget: HTMLElement, depth: number): void {
    const hintId = hintTarget.dataset.hintId;
    if (!hintId) return;

    this.hoveredHintTarget = hintTarget;
    this.pendingHintId = hintId;
    this.pendingAnchorEl = hintTarget;
    this.pendingDepth = depth;

    this.clearHideTimer();
    this.clearShowTimer();
    this.showTimerId = window.setTimeout(() => {
      if (!this.pendingHintId || !this.pendingAnchorEl) return;
      this.renderAndShow(this.pendingHintId, this.pendingAnchorEl, this.pendingDepth);
    }, SHOW_DELAY_MS);
  }

  private renderAndShow(hintId: string, anchorEl: HTMLElement, depth: number): void {
    const hint = getHint(hintId);
    if (!hint) {
      this.hideFromDepth(depth);
      return;
    }

    const anchorRect = anchorEl.getBoundingClientRect();
    const layer = this.ensureLayer(depth);

    layer.titleEl.textContent = hint.title;
    layer.bodyEl.innerHTML = hint.bodyHtml;
    layer.overlay.classList.remove('hidden');

    layer.activeAnchorEl = anchorEl;
    layer.activeAnchorRect = anchorRect;
    this.positionLayer(layer, anchorRect);

    this.hideFromDepth(depth + 1);
  }

  private ensureLayer(depth: number): OverlayLayer {
    while (this.layers.length <= depth) {
      this.layers.push(this.createLayer(this.layers.length));
    }
    return this.layers[depth];
  }

  private createLayer(depth: number): OverlayLayer {
    const overlay = document.createElement('div');
    overlay.className = 'hint-overlay hidden';
    overlay.setAttribute('role', 'tooltip');
    overlay.dataset.direction = 'bottom';
    overlay.style.zIndex = `${BASE_Z_INDEX + depth}`;

    const titleEl = document.createElement('div');
    titleEl.className = 'hint-overlay-title';

    const bodyEl = document.createElement('div');
    bodyEl.className = 'hint-overlay-body';

    overlay.appendChild(titleEl);
    overlay.appendChild(bodyEl);
    this.mountPoint.appendChild(overlay);

    overlay.addEventListener('mouseenter', () => this.onOverlayMouseEnter(depth));
    overlay.addEventListener('mouseleave', (event) => this.onOverlayMouseLeave(depth, event));

    return {
      overlay,
      titleEl,
      bodyEl,
      activeAnchorEl: null,
      activeAnchorRect: null,
    };
  }

  private isLayerVisible(layer: OverlayLayer): boolean {
    return !layer.overlay.classList.contains('hidden');
  }

  private isElementInsideVisibleOverlay(el: Element): boolean {
    for (const layer of this.layers) {
      if (this.isLayerVisible(layer) && layer.overlay.contains(el)) {
        return true;
      }
    }
    return false;
  }

  private getDepthForTarget(hintTarget: HTMLElement): number {
    for (let i = this.layers.length - 1; i >= 0; i--) {
      const layer = this.layers[i];
      if (!this.isLayerVisible(layer)) continue;
      if (layer.overlay.contains(hintTarget)) {
        return i + 1;
      }
    }
    return 0;
  }

  private getVisibleOverlayDepthForElement(el: Element): number | null {
    for (let i = this.layers.length - 1; i >= 0; i--) {
      const layer = this.layers[i];
      if (!this.isLayerVisible(layer)) continue;
      if (layer.overlay.contains(el)) return i;
    }
    return null;
  }

  private scheduleHide(): void {
    this.clearShowTimer();
    this.clearHideTimer();
    this.hideTimerId = window.setTimeout(() => {
      if (!this.hoveredHintTarget && this.hoveredOverlayDepths.size === 0) {
        this.hideNow();
      }
    }, HIDE_DELAY_MS);
  }

  private hideNow(): void {
    this.clearShowTimer();
    this.clearHideTimer();
    this.pendingHintId = null;
    this.pendingAnchorEl = null;
    this.pendingDepth = 0;
    this.hoveredHintTarget = null;
    this.hoveredOverlayDepths.clear();
    this.hideFromDepth(0);
  }

  private hideFromDepth(fromDepth: number): void {
    for (let i = fromDepth; i < this.layers.length; i++) {
      const layer = this.layers[i];
      layer.overlay.classList.add('hidden');
      layer.activeAnchorEl = null;
      layer.activeAnchorRect = null;
      this.hoveredOverlayDepths.delete(i);
    }
  }

  private clearShowTimer(): void {
    if (this.showTimerId !== null) {
      window.clearTimeout(this.showTimerId);
      this.showTimerId = null;
    }
  }

  private clearHideTimer(): void {
    if (this.hideTimerId !== null) {
      window.clearTimeout(this.hideTimerId);
      this.hideTimerId = null;
    }
  }

  private positionLayer(layer: OverlayLayer, anchorRect: DOMRect): void {
    const overlayRect = layer.overlay.getBoundingClientRect();
    const viewportW = window.innerWidth;
    const viewportH = window.innerHeight;

    // Preferred placement:
    // top-left of tooltip matches bottom-left of anchor.
    const priorities: PlacementVariant[] = [
      'bottom-start',
      'right-start',
      'left-start',
      'top-start',
      'bottom-center',
      'top-center',
      'right-center',
      'left-center',
    ];

    let best: { x: number; y: number; direction: HintDirection } | null = null;
    for (const variant of priorities) {
      const candidate = this.getCandidatePosition(variant, anchorRect, overlayRect);
      const fits =
        candidate.x >= VIEWPORT_MARGIN &&
        candidate.y >= VIEWPORT_MARGIN &&
        candidate.x + overlayRect.width <= viewportW - VIEWPORT_MARGIN &&
        candidate.y + overlayRect.height <= viewportH - VIEWPORT_MARGIN;

      if (fits) {
        best = candidate;
        break;
      }

      if (!best) best = candidate;
    }

    const fallback = best ?? this.getCandidatePosition('bottom-start', anchorRect, overlayRect);
    const clampedX = Math.min(
      Math.max(fallback.x, VIEWPORT_MARGIN),
      Math.max(VIEWPORT_MARGIN, viewportW - overlayRect.width - VIEWPORT_MARGIN),
    );
    const clampedY = Math.min(
      Math.max(fallback.y, VIEWPORT_MARGIN),
      Math.max(VIEWPORT_MARGIN, viewportH - overlayRect.height - VIEWPORT_MARGIN),
    );

    layer.overlay.style.left = `${Math.round(clampedX)}px`;
    layer.overlay.style.top = `${Math.round(clampedY)}px`;
    layer.overlay.dataset.direction = fallback.direction;
  }

  private getCandidatePosition(
    variant: PlacementVariant,
    anchorRect: DOMRect,
    overlayRect: DOMRect,
  ): { x: number; y: number; direction: HintDirection } {
    if (variant === 'bottom-start') {
      return {
        direction: 'bottom',
        x: anchorRect.left,
        y: anchorRect.bottom,
      };
    }
    if (variant === 'right-start') {
      return {
        direction: 'right',
        x: anchorRect.right + OVERLAY_GAP,
        y: anchorRect.top,
      };
    }
    if (variant === 'left-start') {
      return {
        direction: 'left',
        x: anchorRect.left - overlayRect.width - OVERLAY_GAP,
        y: anchorRect.top,
      };
    }
    if (variant === 'top-start') {
      return {
        direction: 'top',
        x: anchorRect.left,
        y: anchorRect.top - overlayRect.height - OVERLAY_GAP,
      };
    }
    if (variant === 'bottom-center') {
      return {
        direction: 'bottom',
        x: anchorRect.left + anchorRect.width / 2 - overlayRect.width / 2,
        y: anchorRect.bottom + OVERLAY_GAP,
      };
    }
    if (variant === 'top-center') {
      return {
        direction: 'top',
        x: anchorRect.left + anchorRect.width / 2 - overlayRect.width / 2,
        y: anchorRect.top - overlayRect.height - OVERLAY_GAP,
      };
    }
    if (variant === 'left-center') {
      return {
        direction: 'left',
        x: anchorRect.left - overlayRect.width - OVERLAY_GAP,
        y: anchorRect.top + anchorRect.height / 2 - overlayRect.height / 2,
      };
    }
    return {
      direction: 'right',
      x: anchorRect.right + OVERLAY_GAP,
      y: anchorRect.top + anchorRect.height / 2 - overlayRect.height / 2,
    };
  }
}
