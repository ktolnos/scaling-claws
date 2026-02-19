export interface PanelScaffold {
  panel: HTMLDivElement;
  body: HTMLDivElement;
}

interface PanelScaffoldOptions {
  panelClassName?: string;
  bodyClassName?: string;
}

export function createPanelScaffold(title: string, options: PanelScaffoldOptions = {}): PanelScaffold {
  const panel = document.createElement('div');
  panel.className = options.panelClassName ?? 'panel';

  const header = document.createElement('div');
  header.className = 'panel-header';
  header.textContent = title;
  panel.appendChild(header);

  const body = document.createElement('div');
  body.className = options.bodyClassName ?? 'panel-body';
  panel.appendChild(body);

  return { panel, body };
}

export function createPanelDivider(): HTMLHRElement {
  const hr = document.createElement('hr');
  hr.className = 'panel-divider';
  return hr;
}
