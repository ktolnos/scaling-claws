import type { GameState } from '../../game/GameState.ts';
import { laptopSvg, micMiniSvg, serverRackSvg } from '../../assets/sprites.ts';

type Stage = 'laptop' | 'micmini' | 'rack' | 'datacenter' | 'fullroom';

export class DatacenterInterior {
  private container: HTMLElement;
  private currentStage: Stage = 'laptop';

  // Stage 1-2: Laptop + Mic-minis
  private stage1El!: HTMLDivElement;
  private micMiniStack!: HTMLDivElement;
  private renderedMicMinis: number = 0;

  // Stage 3: Server rack
  private stage3El!: HTMLDivElement;
  private rackArea!: HTMLDivElement;
  private gpuCountLabel!: HTMLSpanElement;

  // Stage 4: Multiple racks
  private stage4El!: HTMLDivElement;
  private rackCount: number = 0;
  private stage4RackArea!: HTMLDivElement;

  constructor(container: HTMLElement) {
    this.container = container;
    this.build();
  }

  private build(): void {
    // Stage 1-2: Laptop & Mic-minis
    this.stage1El = document.createElement('div');
    this.stage1El.className = 'visual-stage';

    const desk = document.createElement('div');
    desk.className = 'desk-surface';
    this.stage1El.appendChild(desk);

    const content1 = document.createElement('div');
    content1.className = 'dc-interior';

    const laptopContainer = document.createElement('div');
    laptopContainer.className = 'laptop-container';
    laptopContainer.innerHTML = laptopSvg;
    const label = document.createElement('div');
    label.className = 'laptop-label';
    label.textContent = 'Your laptop';
    laptopContainer.appendChild(label);
    content1.appendChild(laptopContainer);

    this.micMiniStack = document.createElement('div');
    this.micMiniStack.className = 'mic-mini-stack';
    content1.appendChild(this.micMiniStack);

    this.stage1El.appendChild(content1);
    this.container.appendChild(this.stage1El);

    // Stage 3: Single server rack
    this.stage3El = document.createElement('div');
    this.stage3El.className = 'visual-stage hidden';

    const desk3 = document.createElement('div');
    desk3.className = 'desk-surface';
    desk3.style.height = '20px';
    this.stage3El.appendChild(desk3);

    const content3 = document.createElement('div');
    content3.className = 'dc-interior';
    content3.style.gap = '24px';

    // Small laptop on left
    const miniLaptop = document.createElement('div');
    miniLaptop.className = 'laptop-container';
    miniLaptop.style.transform = 'scale(0.6)';
    miniLaptop.style.opacity = '0.5';
    miniLaptop.innerHTML = laptopSvg;
    content3.appendChild(miniLaptop);

    // Server rack
    this.rackArea = document.createElement('div');
    this.rackArea.className = 'rack-area';
    this.rackArea.style.display = 'flex';
    this.rackArea.style.flexDirection = 'column';
    this.rackArea.style.alignItems = 'center';
    this.rackArea.style.gap = '4px';

    const rackContainer = document.createElement('div');
    rackContainer.className = 'rack-unit';
    rackContainer.innerHTML = serverRackSvg;
    this.rackArea.appendChild(rackContainer);

    this.gpuCountLabel = document.createElement('div');
    this.gpuCountLabel.style.fontSize = '0.65rem';
    this.gpuCountLabel.style.color = 'var(--text-muted)';
    this.gpuCountLabel.style.textTransform = 'uppercase';
    this.gpuCountLabel.style.letterSpacing = '0.1em';
    this.rackArea.appendChild(this.gpuCountLabel);

    content3.appendChild(this.rackArea);
    this.stage3El.appendChild(content3);
    this.container.appendChild(this.stage3El);

    // Stage 4: Multiple racks (datacenter)
    this.stage4El = document.createElement('div');
    this.stage4El.className = 'visual-stage hidden';

    const floor4 = document.createElement('div');
    floor4.style.position = 'absolute';
    floor4.style.bottom = '0';
    floor4.style.left = '0';
    floor4.style.right = '0';
    floor4.style.height = '15px';
    floor4.style.background = 'linear-gradient(180deg, #14121c 0%, #0d0b14 100%)';
    floor4.style.borderTop = '1px solid #2a2840';
    this.stage4El.appendChild(floor4);

    this.stage4RackArea = document.createElement('div');
    this.stage4RackArea.style.display = 'flex';
    this.stage4RackArea.style.alignItems = 'flex-end';
    this.stage4RackArea.style.justifyContent = 'center';
    this.stage4RackArea.style.gap = '8px';
    this.stage4RackArea.style.padding = '0 16px 8px';
    this.stage4RackArea.style.width = '100%';
    this.stage4RackArea.style.height = '100%';
    this.stage4El.appendChild(this.stage4RackArea);

    this.container.appendChild(this.stage4El);
  }

  update(state: GameState): void {
    const targetStage = this.getTargetStage(state);

    if (targetStage !== this.currentStage) {
      this.transitionTo(targetStage);
    }

    // Stage-specific updates
    if (this.currentStage === 'laptop' || this.currentStage === 'micmini') {
      while (this.renderedMicMinis < state.micMiniCount) {
        const unit = document.createElement('div');
        unit.className = 'mic-mini-unit';
        unit.innerHTML = micMiniSvg;
        this.micMiniStack.appendChild(unit);
        this.renderedMicMinis++;
      }
    }

    if (this.currentStage === 'rack') {
      this.gpuCountLabel.textContent = state.gpuCount + ' GPUs';
    }

    if (this.currentStage === 'datacenter' || this.currentStage === 'fullroom') {
      const targetRacks = Math.max(1, Math.min(12, Math.ceil(state.gpuCount / 32)));
      while (this.rackCount < targetRacks) {
        const rack = document.createElement('div');
        rack.className = 'rack-unit';
        rack.innerHTML = serverRackSvg;
        // Depth effect: further racks are smaller and more transparent
        const depth = this.rackCount / 12;
        rack.style.opacity = (1 - depth * 0.5).toString();
        rack.style.transform = 'scale(' + (1 - depth * 0.3) + ')';
        this.stage4RackArea.appendChild(rack);
        this.rackCount++;
      }
    }
  }

  private getTargetStage(state: GameState): Stage {
    const totalDCs = state.datacenters.reduce((a, b) => a + b, 0);
    if (totalDCs >= 3) return 'fullroom';
    if (totalDCs >= 1) return 'datacenter';
    if (state.isPostGpuTransition) return 'rack';
    if (state.micMiniCount > 0) return 'micmini';
    return 'laptop';
  }

  private transitionTo(stage: Stage): void {
    // Hide all stages
    this.stage1El.classList.add('hidden');
    this.stage3El.classList.add('hidden');
    this.stage4El.classList.add('hidden');

    // Show target
    if (stage === 'laptop' || stage === 'micmini') {
      this.stage1El.classList.remove('hidden');
    } else if (stage === 'rack') {
      this.stage3El.classList.remove('hidden');
    } else {
      this.stage4El.classList.remove('hidden');
    }

    this.currentStage = stage;
  }
}
