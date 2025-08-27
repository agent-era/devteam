import React, {createContext, useContext, ReactNode} from 'react';
import {GitService} from '../services/GitService.js';
import {TmuxService} from '../services/TmuxService.js';
import {WorktreeService} from '../services/WorktreeService.js';

const h = React.createElement;

interface Services {
  gitService: GitService;
  tmuxService: TmuxService;
  worktreeService: WorktreeService;
}

const ServicesContext = createContext<Services | null>(null);

interface ServicesProviderProps {
  children: ReactNode;
  gitService?: GitService;
  tmuxService?: TmuxService;
  worktreeService?: WorktreeService;
}

export function ServicesProvider({
  children,
  gitService,
  tmuxService,
  worktreeService
}: ServicesProviderProps) {
  const git = gitService || new GitService();
  const tmux = tmuxService || new TmuxService();
  const worktree = worktreeService || new WorktreeService(git, tmux);

  const services: Services = {
    gitService: git,
    tmuxService: tmux,
    worktreeService: worktree
  };

  return h(ServicesContext.Provider, {value: services}, children);
}

export function useServices(): Services {
  const context = useContext(ServicesContext);
  if (!context) {
    throw new Error('useServices must be used within a ServicesProvider');
  }
  return context;
}

export function useGitService(): GitService {
  return useServices().gitService;
}

export function useTmuxService(): TmuxService {
  return useServices().tmuxService;
}

export function useWorktreeService(): WorktreeService {
  return useServices().worktreeService;
}