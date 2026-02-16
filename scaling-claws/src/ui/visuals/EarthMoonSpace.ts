import type { GameState } from '../../game/GameState.ts';
import { earthSvg, moonSvg } from '../../assets/sprites.ts';
import { fromBigInt } from '../../game/utils.ts';

const MAX_SAT_ELEMENTS = 50;

export class EarthMoonSpace {
  private container: HTMLElement;
  private stageEl: HTMLDivElement;
  private earthEl!: HTMLDivElement;
  private moonEl!: HTMLDivElement;
  private satContainer!: HTMLDivElement;
  private satRing!: HTMLDivElement;
  private lunarBaseEl!: HTMLDivElement;
  private massDriverContainer!: HTMLDivElement;

  private isVisible: boolean = false;
  private renderedSats: number = 0;
  private moonShown: boolean = false;
  private lunarBaseShown: boolean = false;
  private lastMassDriverTime: number = 0;

  constructor(container: HTMLElement) {
    this.container = container;
    this.stageEl = document.createElement('div');
    this.stageEl.className = 'visual-stage hidden';
    this.build();
    this.container.appendChild(this.stageEl);
  }

  private build(): void {
    // Space background
    const bg = document.createElement('div');
    bg.className = 'em-space-bg';
    this.stageEl.appendChild(bg);

    // Stars
    for (let i = 0; i < 40; i++) {
      const star = document.createElement('div');
      star.className = 'em-star';
      star.style.left = Math.random() * 100 + '%';
      star.style.top = Math.random() * 100 + '%';
      star.style.animationDelay = (Math.random() * 3) + 's';
      bg.appendChild(star);
    }

    // Earth (left side)
    this.earthEl = document.createElement('div');
    this.earthEl.className = 'em-earth';
    this.earthEl.innerHTML = earthSvg;
    this.stageEl.appendChild(this.earthEl);

    // Satellite container (orbiting dots around Earth)
    this.satContainer = document.createElement('div');
    this.satContainer.className = 'em-sat-container';
    this.stageEl.appendChild(this.satContainer);

    // Satellite ring overlay (for 50+ satellites)
    this.satRing = document.createElement('div');
    this.satRing.className = 'em-sat-ring';
    this.satRing.style.display = 'none';
    this.stageEl.appendChild(this.satRing);

    // Moon (upper right, hidden initially)
    this.moonEl = document.createElement('div');
    this.moonEl.className = 'em-moon';
    this.moonEl.style.display = 'none';
    this.moonEl.innerHTML = moonSvg;
    this.stageEl.appendChild(this.moonEl);

    // Lunar base dots (on moon surface)
    this.lunarBaseEl = document.createElement('div');
    this.lunarBaseEl.className = 'em-lunar-base';
    this.lunarBaseEl.style.display = 'none';
    this.stageEl.appendChild(this.lunarBaseEl);

    // Mass driver container
    this.massDriverContainer = document.createElement('div');
    this.massDriverContainer.className = 'em-mass-driver-container';
    this.stageEl.appendChild(this.massDriverContainer);
  }

  update(state: GameState): void {
    const shouldShow = state.completedResearch.includes('spaceSystems1') && state.satellites > 0n;

    if (shouldShow && !this.isVisible) {
      this.stageEl.classList.remove('hidden');
      this.isVisible = true;
    } else if (!shouldShow && this.isVisible) {
      this.stageEl.classList.add('hidden');
      this.isVisible = false;
    }

    if (!this.isVisible) return;

    const satCount = Math.floor(fromBigInt(state.satellites));

    // Add satellite dots (capped at MAX_SAT_ELEMENTS)
    const targetDots = Math.min(satCount, MAX_SAT_ELEMENTS);
    while (this.renderedSats < targetDots) {
      this.addSatellite();
      this.renderedSats++;
    }

    // Show ring overlay for 50+ satellites
    if (satCount >= MAX_SAT_ELEMENTS) {
      this.satRing.style.display = '';
      // Scale ring opacity with satellite count
      const intensity = Math.min(1, (satCount - MAX_SAT_ELEMENTS) / 200);
      this.satRing.style.opacity = (0.3 + intensity * 0.5).toString();
    }

    // Show Moon when 20+ satellites
    if (satCount >= 20 && !this.moonShown) {
      this.moonEl.style.display = '';
      this.moonShown = true;
    }

    // Show lunar base
    if (state.lunarBase && !this.lunarBaseShown) {
      this.lunarBaseEl.style.display = '';
      // Add glowing dots on the moon
      for (let i = 0; i < 3; i++) {
        const dot = document.createElement('div');
        dot.className = 'em-lunar-dot';
        dot.style.left = (40 + i * 15) + '%';
        dot.style.bottom = (20 + Math.random() * 15) + '%';
        this.lunarBaseEl.appendChild(dot);
      }
      this.lunarBaseShown = true;
    }

    // Mass driver streaks (periodic animation)
    if (state.lunarMassDriverRate > 0) {
      const now = Date.now();
      const interval = Math.max(1000, 60000 / state.lunarMassDriverRate);
      if (now - this.lastMassDriverTime > interval) {
        this.fireMassDriver();
        this.lastMassDriverTime = now;
      }
    }
  }

  private addSatellite(): void {
    const sat = document.createElement('div');
    sat.className = 'satellite';

    // Randomize orbit parameters
    const duration = 6 + Math.random() * 9; // 6-15s
    const a = 55 + Math.random() * 30; // semi-major axis
    const b = 40 + Math.random() * 20; // semi-minor axis
    const phase = Math.random() * 360; // starting angle

    // Create an elliptical orbit path
    sat.style.offsetPath = `path('M ${-a},0 A ${a},${b} 0 1,1 ${-a},0.01')`;
    sat.style.animationDuration = duration + 's';
    sat.style.animationDelay = -(Math.random() * duration) + 's';
    sat.style.offsetRotate = '0deg';

    // Slightly randomize starting position in the orbit
    sat.style.offsetDistance = phase / 3.6 + '%';

    this.satContainer.appendChild(sat);
  }

  private fireMassDriver(): void {
    const streak = document.createElement('div');
    streak.className = 'mass-driver-streak';
    // Position near the moon
    streak.style.right = '15%';
    streak.style.top = '25%';
    this.massDriverContainer.appendChild(streak);

    // Remove after animation completes
    setTimeout(() => {
      streak.remove();
    }, 600);
  }
}
