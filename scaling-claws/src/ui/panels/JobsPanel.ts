import type { GameState } from '../../game/GameState.ts';
import type { Panel } from '../PanelManager.ts';
import { BALANCE } from '../../game/BalanceConfig.ts';
import { formatMoney } from '../../game/utils.ts';
import { nudgeAgent, incrementJobAssignments, decrementJobAssignments, assignAllToJob, removeAllFromJob } from '../../game/systems/JobSystem.ts';
import { hireEngineer, fireEngineer } from '../../game/systems/ComputeSystem.ts';
import type { JobType } from '../../game/BalanceConfig.ts';
import { ProgressBar } from '../components/ProgressBar.ts';

export class JobsPanel implements Panel {
  readonly el: HTMLElement;
  private state: GameState;

  // Job List Container
  private jobListEl!: HTMLDivElement;
  private jobRows: Map<JobType, {
    countEl: HTMLSpanElement;
    agentGrid: HTMLDivElement;
    humanRow?: HTMLDivElement;
    humanCountEl?: HTMLSpanElement;
    agentControlsBlock: HTMLDivElement;
    reqEl: HTMLSpanElement;
  }> = new Map();

  // Nudge
  private nudgeBtn!: HTMLButtonElement;
  private stuckCountEl!: HTMLSpanElement;

  constructor(state: GameState) {
    this.state = state;
    this.el = document.createElement('div');
    this.el.className = 'panel';
    this.build();
  }

  private build(): void {
    // Header
    const header = document.createElement('div');
    header.className = 'panel-header';
    header.textContent = 'JOBS';
    this.el.appendChild(header);

    const body = document.createElement('div');
    body.className = 'panel-body';

    // Job List Section
    this.jobListEl = document.createElement('div');
    this.jobListEl.className = 'job-list';
    body.appendChild(this.jobListEl);

    // --- Nudge footer ---
    const nudgeRow = document.createElement('div');
    nudgeRow.className = 'panel-row';
    nudgeRow.style.marginTop = '12px';
    nudgeRow.style.display = 'flex';
    nudgeRow.style.justifyContent = 'flex-end';
    nudgeRow.style.alignItems = 'center';
    nudgeRow.style.gap = '8px';
    
    this.stuckCountEl = document.createElement('span');
    this.stuckCountEl.style.fontSize = '0.8rem';
    
    this.nudgeBtn = document.createElement('button');
    this.nudgeBtn.className = 'btn-nudge';
    this.nudgeBtn.textContent = 'Nudge';
    this.nudgeBtn.addEventListener('click', () => {
      nudgeAgent(this.state);
    });

    nudgeRow.appendChild(this.stuckCountEl);
    nudgeRow.appendChild(this.nudgeBtn);
    body.appendChild(nudgeRow);

    this.el.appendChild(body);
  }

  update(state: GameState): void {
    this.state = state;

    // Group agents by job
    const agentsByJob = new Map<JobType, typeof state.agents>();
    for (const a of state.agents) {
      if (!agentsByJob.has(a.assignedJob)) {
        agentsByJob.set(a.assignedJob, []);
      }
      agentsByJob.get(a.assignedJob)!.push(a);
    }

    // Sync rows
    for (const [jobType, refs] of this.jobRows) {
      if (!state.unlockedJobs.includes(jobType)) {
        const row = refs.countEl.closest('.job-row');
        row?.remove();
        this.jobRows.delete(jobType);
      }
    }
    
    const currentIntel = state.intelligence;

    for (const jobType of state.unlockedJobs) {
      if (jobType === 'unassigned') continue;
      const config = BALANCE.jobs[jobType];
      let refs = this.jobRows.get(jobType);
      
      const intelTooLow = currentIntel < config.intelReq;
      
      // Agent assignment eligibility
      let agentEligibilityTooLow = false;
      if (currentIntel < config.intelReq) agentEligibilityTooLow = true;
      if (config.agentIntelReq && currentIntel < config.agentIntelReq) agentEligibilityTooLow = true;
      if (config.agentResearchReq) {
        for (const r of config.agentResearchReq) {
          if (!state.completedResearch.includes(r)) {
            agentEligibilityTooLow = true;
            break;
          }
        }
      }

      if (!refs) {
        // Create Row (Horizontal Layout)
        const row = document.createElement('div');
        row.className = 'job-row';
        row.style.display = 'flex';
        row.style.alignItems = 'center'; // Vertical alignment within row
        row.style.padding = '6px';
        row.style.marginBottom = '6px';
        row.style.backgroundColor = 'rgba(255,255,255,0.03)';
        row.style.borderRadius = '6px';
        row.style.gap = '8px';
        
        // 1. Title + Req Block (25%ish)
        const infoBlock = document.createElement('div');
        infoBlock.style.flex = '0 0 30%';
        infoBlock.style.display = 'flex';
        infoBlock.style.flexDirection = 'column';
        infoBlock.style.overflow = 'hidden';

        const name = document.createElement('span');
        name.textContent = config.displayName;
        name.style.fontWeight = '500';
        name.style.fontSize = '0.85rem';
        name.style.whiteSpace = 'nowrap';
        name.style.textOverflow = 'ellipsis';
        name.style.overflow = 'hidden';
        infoBlock.appendChild(name);

        const requirements = document.createElement('span');
        requirements.style.color = 'var(--accent-red)';
        requirements.style.fontSize = '0.7rem';
        infoBlock.appendChild(requirements);

        const money = document.createElement('span');
        if (config.reward > 0) {
           money.textContent = `${formatMoney(config.reward)} / ${(config.timeMs/1000)}s`;
        }
        money.style.fontSize = '0.7rem';
        money.style.color = 'var(--text-muted)';
        infoBlock.appendChild(money);
        
        row.appendChild(infoBlock);
        
        // 2. Progress Grid (40%)
        const grid = document.createElement('div');
        grid.className = 'agent-grid';
        grid.style.flex = '0 0 12%';
        grid.style.display = 'grid';
        grid.style.gridTemplateColumns = '1fr 1fr'; 
        grid.style.gridTemplateRows = 'repeat(4, 3px)'; // Even tighter
        grid.style.gap = '2px';
        grid.style.alignSelf = 'center';
        
        row.appendChild(grid);
        
        // 3. Stats & Controls Block (35%ish)
        const controlsBlock = document.createElement('div');
        controlsBlock.style.flex = '1';
        controlsBlock.style.display = 'flex';
        controlsBlock.style.flexDirection = 'column';
        controlsBlock.style.gap = '2px';

        // Agent Controls
        const agentRow = document.createElement('div');
        agentRow.className = 'agent-controls-row';
        agentRow.style.display = 'flex';
        agentRow.style.justifyContent = 'flex-end';
        agentRow.style.alignItems = 'center';
        agentRow.style.gap = '2px';
        
        const agentBtns = document.createElement('div');
        agentBtns.style.display = 'flex';
        agentBtns.style.gap = '2px';
        agentBtns.style.alignItems = 'center';

        const removeAllBtn = document.createElement('button');
        removeAllBtn.innerHTML = '&#128465;'; // Trash icon
        removeAllBtn.className = 'btn-mini btn-bulk-remove';
        removeAllBtn.title = 'Remove all agents from this job';
        removeAllBtn.addEventListener('click', () => removeAllFromJob(state, jobType as JobType));

        const decBtn = document.createElement('button');
        decBtn.textContent = '-';
        decBtn.className = 'btn-mini';
        decBtn.addEventListener('click', () => decrementJobAssignments(state, jobType as JobType));
        
        const countSpan = document.createElement('span');
        countSpan.textContent = '0';
        countSpan.style.minWidth = '16px';
        countSpan.style.textAlign = 'center';
        countSpan.style.fontSize = '0.75rem';
        
        const incBtn = document.createElement('button');
        incBtn.textContent = '+';
        incBtn.className = 'btn-mini inc-btn';
        incBtn.addEventListener('click', () => {
          if (!incrementJobAssignments(state, jobType as JobType)) {
            // Signal Agents panel to flash
            document.dispatchEvent(new CustomEvent('flash-unassigned'));
          }
        });

        const addAllBtn = document.createElement('button');
        addAllBtn.textContent = 'ALL';
        addAllBtn.className = 'btn-mini btn-bulk-add';
        addAllBtn.title = 'Add all unassigned agents to this job';
        addAllBtn.addEventListener('click', () => {
          assignAllToJob(state, jobType as JobType);
        });
        
        agentBtns.appendChild(removeAllBtn);
        agentBtns.appendChild(decBtn);
        agentBtns.appendChild(countSpan);
        agentBtns.appendChild(incBtn);
        agentBtns.appendChild(addAllBtn);
        
        agentRow.appendChild(agentBtns);
        controlsBlock.appendChild(agentRow);

        // Human Controls
        let humanCountSpan: HTMLSpanElement | undefined;
        let humanRowDiv: HTMLDivElement | undefined;
        if (config.canHireHumans) {
            humanRowDiv = document.createElement('div');
            humanRowDiv.style.display = 'flex';
            humanRowDiv.style.justifyContent = 'flex-end';
            humanRowDiv.style.alignItems = 'center';
            humanRowDiv.style.gap = '2px';
            
            const humanBtns = document.createElement('div');
            humanBtns.style.display = 'flex';
            humanBtns.style.gap = '2px';
            humanBtns.style.alignItems = 'center';

            const hDecBtn = document.createElement('button');
            hDecBtn.textContent = '-';
            hDecBtn.className = 'btn-mini';
            hDecBtn.addEventListener('click', () => fireEngineer(state));

            humanCountSpan = document.createElement('span');
            humanCountSpan.textContent = '0';
            humanCountSpan.style.minWidth = '16px';
            humanCountSpan.style.textAlign = 'center';
            humanCountSpan.style.fontSize = '0.75rem';

            const hIncBtn = document.createElement('button');
            hIncBtn.textContent = '+';
            hIncBtn.className = 'btn-mini';
            hIncBtn.addEventListener('click', () => hireEngineer(state));

            humanBtns.appendChild(hDecBtn);
            humanBtns.appendChild(humanCountSpan);
            humanBtns.appendChild(hIncBtn);

            humanRowDiv.appendChild(humanBtns);
            controlsBlock.appendChild(humanRowDiv);
        }

        row.appendChild(controlsBlock);
        this.jobListEl.appendChild(row);
        
        refs = {
          countEl: countSpan,
          agentGrid: grid,
          humanRow: humanRowDiv,
          humanCountEl: humanCountSpan,
          agentControlsBlock: agentRow,
          reqEl: requirements
        };
        this.jobRows.set(jobType, refs);
      }

      // -- UPDATE --
      
      // Intelligence Eligibility (Job visibility vs assignment)
      if (intelTooLow) {
          refs.reqEl.textContent = `(req Intel ${config.intelReq})`;
          refs.reqEl.style.display = 'block';
      } else {
          refs.reqEl.textContent = '';
      }

      // Agent Assignment Eligibility (Specific to job)
      if (agentEligibilityTooLow) {
          // If Engineer, hide buttons before requirement reached
          if (jobType === 'engineer') {
              refs.agentControlsBlock.style.display = 'none';
          } else {
              // For others, maybe just show warning?
              // User said "Hide Agents buttons before the requirement is reached" specifically for Engineers?
              // Or in general? "Hide Agents buttons before the requirement is reached" was a comment on the Engineer section.
              // I'll hide for Engineer, and maybe disable/warn for others.
              (refs.agentControlsBlock.querySelector('.inc-btn') as HTMLButtonElement).disabled = true;
              (refs.agentControlsBlock.querySelector('.btn-bulk-add') as HTMLButtonElement).disabled = true;
          }
      } else {
          refs.agentControlsBlock.style.display = 'flex';
          (refs.agentControlsBlock.querySelector('.inc-btn') as HTMLButtonElement).disabled = false;
          (refs.agentControlsBlock.querySelector('.btn-bulk-add') as HTMLButtonElement).disabled = false;
      }

      // Human stats
      if (config.canHireHumans && refs.humanCountEl) {
          refs.humanCountEl.textContent = state.engineerCount.toString();
      }

      // Agent progress
      const agents = agentsByJob.get(jobType) || [];
      const count = agents.length;
      refs.countEl.textContent = count.toString();
      
      refs.agentGrid.innerHTML = '';
      const barsToShow = (count > 7) ? 7 : count;
      
      for (let i = 0; i < barsToShow; i++) {
         const agent = agents[i];
         const bar = new ProgressBar();
         bar.el.style.height = '3px';
         if (agent.isIdle) {
             bar.update(0, false);
             bar.el.style.opacity = '0.5';
         } else {
             bar.update(agent.progress, agent.isStuck);
         }
         refs.agentGrid.appendChild(bar.el);
      }
      
      if (count > 7) {
          const overflow = document.createElement('div');
          overflow.textContent = `+${count - 7}`;
          overflow.style.fontSize = '0.6rem';
          overflow.style.color = 'var(--text-muted)';
          overflow.style.textAlign = 'center';
          overflow.style.lineHeight = '3px';
          refs.agentGrid.appendChild(overflow);
      }
    }

    // -- Nudge --
    if (state.stuckCount > 0) {
       this.stuckCountEl.textContent = `${state.stuckCount} stuck`;
       this.stuckCountEl.style.color = 'var(--accent-red)';
       this.nudgeBtn.disabled = false;
    } else {
       this.stuckCountEl.textContent = 'All running';
       this.stuckCountEl.style.color = 'var(--text-muted)';
       this.nudgeBtn.disabled = true;
    }
  }
}
