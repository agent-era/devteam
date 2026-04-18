import type {TmuxService} from '../../services/TmuxService.js';

export type NavMode = 'agent' | 'shell' | 'run';

export function sessionMode(sessionName: string): NavMode {
  if (sessionName.endsWith('-shell')) return 'shell';
  if (sessionName.endsWith('-run')) return 'run';
  return 'agent';
}

export function baseSessionName(sessionName: string): string {
  if (sessionName.endsWith('-shell')) return sessionName.slice(0, -6);
  if (sessionName.endsWith('-run')) return sessionName.slice(0, -4);
  return sessionName;
}

export function modeSessionName(tmux: TmuxService, project: string, feature: string, mode: NavMode): string {
  if (mode === 'shell') return tmux.shellSessionName(project, feature);
  if (mode === 'run') return tmux.runSessionName(project, feature);
  return tmux.sessionName(project, feature);
}

export function modeLabel(mode: NavMode): string {
  if (mode === 'agent') return 'A';
  if (mode === 'shell') return 'S';
  return 'R';
}

export const modeOrder: NavMode[] = ['agent', 'shell', 'run'];
