export interface WorkspaceLayoutOptions {
  leftPanelWidthPx?: number;
  rightPanelWidthPx?: number;
}

export interface WorkspaceRegions {
  leftRegion: HTMLDivElement;
  visualRegion: HTMLDivElement;
  tabsRegion: HTMLDivElement;
}

export function createWorkspaceLayout(
  host: HTMLElement,
  visualArea: HTMLElement,
  options: WorkspaceLayoutOptions = {},
): WorkspaceRegions {
  const leftPanelWidth = options.leftPanelWidthPx ?? 200;
  const rightPanelWidth = options.rightPanelWidthPx ?? 500;

  host.innerHTML = '';
  host.classList.add('workspace-layout');
  host.style.setProperty('--workspace-left-width', `${leftPanelWidth}px`);
  host.style.setProperty('--workspace-right-width', `${rightPanelWidth}px`);

  const leftRegion = document.createElement('div');
  leftRegion.className = 'workspace-left-region';

  const visualRegion = document.createElement('div');
  visualRegion.className = 'workspace-visual-region';
  visualRegion.appendChild(visualArea);

  const tabsRegion = document.createElement('div');
  tabsRegion.className = 'workspace-tabs-region';

  host.appendChild(leftRegion);
  host.appendChild(visualRegion);
  host.appendChild(tabsRegion);

  return { leftRegion, visualRegion, tabsRegion };
}
