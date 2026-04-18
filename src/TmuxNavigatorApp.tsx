import React, {useEffect, useMemo, useState} from 'react';
import {Box, Text, useApp, useStdin} from 'ink';
import path from 'node:path';
import fs from 'node:fs';
import FullScreen from './components/common/FullScreen.js';
import {GitService} from './services/GitService.js';
import {TmuxService} from './services/TmuxService.js';
import {getProjectsDirectory, isAppIntervalsEnabled} from './config.js';
import {aiLaunchCommand, RUN_CONFIG_FILE} from './constants.js';
import {detectAvailableAITools} from './shared/utils/commandExecutor.js';
import {getLastTool, setLastTool} from './shared/utils/aiSessionMemory.js';
import {baseSessionName, modeLabel, modeOrder, modeSessionName, sessionMode, type NavMode} from './shared/utils/tmuxNav.js';
import type {AITool} from './models.js';
import {useTerminalDimensions} from './hooks/useTerminalDimensions.js';

type NavWorktree = {
  project: string;
  feature: string;
  path: string;
  branch: string;
  lastCommitTs: number;
  sessions: Record<NavMode, boolean>;
};

export default function TmuxNavigatorApp(props: {sessionName: string}) {
  const {sessionName} = props;
  const {exit} = useApp();
  const {stdin, setRawMode} = useStdin();
  const {rows, columns} = useTerminalDimensions();

  const git = useMemo(() => new GitService(getProjectsDirectory()), []);
  const tmux = useMemo(() => new TmuxService(), []);
  const availableTools = useMemo(() => detectAvailableAITools(), []);

  const [items, setItems] = useState<NavWorktree[]>([]);
  const [selectedIndex, setSelectedIndex] = useState(0);
  const [statusMessage, setStatusMessage] = useState<string>('loading...');

  const currentMode = sessionMode(sessionName);
  const currentBase = baseSessionName(sessionName);

  const load = async () => {
    const projects = git.discoverProjects();
    const sessions = new Set(await tmux.listSessions());
    const next: NavWorktree[] = [];

    for (const project of projects) {
      const worktrees = await git.getWorktreesForProject(project);
      for (const worktree of worktrees) {
        next.push({
          project: worktree.project,
          feature: worktree.feature,
          path: worktree.path,
          branch: worktree.branch,
          lastCommitTs: worktree.last_commit_ts || 0,
          sessions: {
            agent: sessions.has(tmux.sessionName(worktree.project, worktree.feature)),
            shell: sessions.has(tmux.shellSessionName(worktree.project, worktree.feature)),
            run: sessions.has(tmux.runSessionName(worktree.project, worktree.feature)),
          }
        });
      }
    }

    next.sort((a, b) => (b.lastCommitTs || 0) - (a.lastCommitTs || 0) || `${a.project}/${a.feature}`.localeCompare(`${b.project}/${b.feature}`));
    setItems(next);

    const idx = next.findIndex((item) => tmux.sessionName(item.project, item.feature) === currentBase);
    if (idx >= 0) setSelectedIndex(idx);
    setStatusMessage(next.length ? 'enter switch  1/2/3 modes  esc focus main' : 'no worktrees found');
  };

  useEffect(() => {
    void load();
    if (!isAppIntervalsEnabled()) return;
    const timer = setInterval(() => { void load(); }, 5000);
    return () => clearInterval(timer);
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  useEffect(() => {
    setRawMode(true);
    const handler = (buf: Buffer) => {
      const input = buf.toString('utf8');
      if (handleMouseInput(input)) return;
      if (input === 'j' || input === '\u001b[B') setSelectedIndex((prev) => Math.min(prev + 1, Math.max(items.length - 1, 0)));
      else if (input === 'k' || input === '\u001b[A') setSelectedIndex((prev) => Math.max(prev - 1, 0));
      else if (input === 'r') void load();
      else if (input === '1') void activate('agent');
      else if (input === '2') void activate('shell');
      else if (input === '3') void activate('run');
      else if (input === '\r' || input === '\n') void activate(currentMode);
      else if (input === '\u001b' || input === 'q') {
        tmux.selectMainPane(sessionName);
        exit();
      }
    };
    stdin.on('data', handler);
    return () => {
      stdin.off('data', handler);
      setRawMode(false);
    };
  }, [currentMode, exit, items.length, load, sessionName, setRawMode, stdin, tmux]);

  const handleMouseInput = (input: string): boolean => {
    const match = input.match(/\x1b\[<(\d+);(\d+);(\d+)([Mm])/);
    if (!match) return false;

    const button = Number(match[1]);
    const x = Number(match[2]);
    const y = Number(match[3]);
    const eventType = match[4];

    if (eventType !== 'M') return true;
    if (button >= 64) return true;

    if (y === 2) {
      const mode = modeFromHeaderClick(x);
      if (mode) {
        void activate(mode);
        return true;
      }
    }

    const listRow = y - 3;
    if (listRow >= 0 && listRow < visible.length) {
      const absoluteIndex = start + listRow;
      setSelectedIndex(absoluteIndex);
      const clickedMode = modeFromRowClick(x, columns);
      void activate(clickedMode || currentMode, absoluteIndex);
      return true;
    }

    if (y === rows - 1) {
      tmux.selectMainPane(sessionName);
      exit();
      return true;
    }

    return true;
  };

  const activate = async (mode: NavMode, index: number = selectedIndex) => {
    const item = items[index];
    if (!item) return;
    const targetSession = modeSessionName(tmux, item.project, item.feature, mode);

    if (!tmux.hasSession(targetSession)) {
      if (mode === 'agent') {
        const remembered = getLastTool(item.path);
        const tool = ((remembered && remembered !== 'none') ? remembered : (availableTools[0] || 'none')) as AITool;
        if (tool === 'none') {
          tmux.createSession(targetSession, item.path, true);
        } else {
          tmux.createSessionWithCommand(targetSession, item.path, aiLaunchCommand(tool), true);
          setLastTool(tool, item.path);
        }
      } else if (mode === 'shell') {
        tmux.createSession(targetSession, item.path, false);
      } else {
        const configured = thisRunSession(tmux, item);
        if (!configured) return;
      }
    }

    tmux.prepareSessionNavigator(targetSession);
    tmux.selectMainPane(targetSession);
    tmux.switchClient(targetSession);
  };

  const visibleRows = Math.max(1, rows - 4);
  const start = Math.max(0, Math.min(selectedIndex - Math.floor(visibleRows / 2), Math.max(0, items.length - visibleRows)));
  const visible = items.slice(start, start + visibleRows);
  const selectedItem = items[selectedIndex] || null;
  const statusTone: 'cyan' | 'yellow' = items.length ? 'cyan' : 'yellow';

  return (
    <FullScreen enableAltScreen={false}>
      <Box flexDirection="column" paddingX={1}>
        <Box justifyContent="space-between">
          <Text color="black" backgroundColor="cyan">{' DEVTEAM NAV '}</Text>
          <Text color="gray">{truncateText(selectedItem ? `${selectedItem.feature} [${selectedItem.project}]` : 'no selection', Math.max(12, columns - 22))}</Text>
        </Box>
        <Box justifyContent="space-between">
          <Box>
            {modeOrder.map((mode, index) => {
              const active = mode === currentMode;
              return (
                <Text
                  key={mode}
                  color={active ? 'black' : 'gray'}
                  backgroundColor={active ? modeColor(mode) : undefined}
                >
                  {`${index === 0 ? '' : ' '}${modePill(mode)}`}
                </Text>
              );
            })}
          </Box>
          <Text color={statusTone}>{truncateText(statusMessage, Math.max(16, Math.floor(columns / 2)))} </Text>
        </Box>
        {visible.map((item, offset) => {
          const absoluteIndex = start + offset;
          const isSelected = absoluteIndex === selectedIndex;
          const isCurrent = tmux.sessionName(item.project, item.feature) === currentBase;
          const maxLabelWidth = Math.max(12, columns - 22);
          const label = truncateText(item.feature, Math.max(8, maxLabelWidth - item.project.length - 4));
          const project = truncateText(item.project, 16);
          return (
            <Box key={`${item.project}-${item.feature}`} justifyContent="space-between">
              <Box>
                <Text color={isSelected ? 'black' : isCurrent ? 'cyan' : 'white'} backgroundColor={isSelected ? 'yellow' : undefined}>
                  {`${isSelected ? '>' : ' '} ${label}`}
                </Text>
                <Text color={isSelected ? 'black' : 'gray'} backgroundColor={isSelected ? 'yellow' : undefined}>{` [${project}]`}</Text>
                {isCurrent ? <Text color="green">{'  live'}</Text> : null}
              </Box>
              <Box>
                {modeOrder.map((mode) => (
                  <Text
                    key={mode}
                    color={item.sessions[mode] ? 'black' : 'gray'}
                    backgroundColor={item.sessions[mode] ? modeColor(mode) : undefined}
                  >
                    {`${modeBadge(mode, item.sessions[mode])} `}
                  </Text>
                ))}
              </Box>
            </Box>
          );
        })}
        <Box justifyContent="space-between">
          <Text color="magenta">enter switch  1/2/3 mode  r refresh</Text>
          <Text color="gray">esc back</Text>
        </Box>
      </Box>
    </FullScreen>
  );
}

function modeFromHeaderClick(x: number): NavMode | null {
  if (x >= 1 && x <= 10) return 'agent';
  if (x >= 11 && x <= 20) return 'shell';
  if (x >= 21 && x <= 28) return 'run';
  return null;
}

function modeFromRowClick(x: number, columns: number): NavMode | null {
  const rightStart = Math.max(1, columns - 11);
  if (x < rightStart) return null;
  if (x < rightStart + 4) return 'agent';
  if (x < rightStart + 8) return 'shell';
  return 'run';
}

function modeColor(mode: NavMode): 'green' | 'blue' | 'magenta' {
  if (mode === 'agent') return 'green';
  if (mode === 'shell') return 'blue';
  return 'magenta';
}

function modePill(mode: NavMode): string {
  if (mode === 'agent') return ' 1 Agent ';
  if (mode === 'shell') return ' 2 Shell ';
  return ' 3 Run ';
}

function modeBadge(mode: NavMode, active: boolean): string {
  if (!active) return ` ${modeLabel(mode)} `;
  if (mode === 'agent') return ' A ';
  if (mode === 'shell') return ' S ';
  return ' R ';
}

function truncateText(value: string, width: number): string {
  if (value.length <= width) return value;
  if (width <= 3) return value.slice(0, width);
  return `${value.slice(0, width - 3)}...`;
}

function thisRunSession(tmux: TmuxService, item: NavWorktree): boolean {
  const sessionName = tmux.runSessionName(item.project, item.feature);
  tmux.createSession(sessionName, item.path, false);
  const configPath = path.join(getProjectsDirectory(), item.project, RUN_CONFIG_FILE);
  if (!fs.existsSync(configPath)) {
    return false;
  }

  const cfg = JSON.parse(fs.readFileSync(configPath, 'utf8'));
  const exec = (cfg?.executionInstructions ?? {}) as any;
  const mainCmd = exec.mainCommand as string | undefined;
  const pre: string[] = Array.isArray(exec.preRunCommands) ? exec.preRunCommands.filter(Boolean) : [];
  const env: Record<string, string> = (exec.environmentVariables && typeof exec.environmentVariables === 'object') ? exec.environmentVariables : {};
  const detachOnExit: boolean = !!exec.detachOnExit;
  try { tmux.setSessionOption(sessionName, 'remain-on-exit', detachOnExit ? 'on' : 'off'); } catch {}
  if (!mainCmd || typeof mainCmd !== 'string' || mainCmd.trim().length === 0) {
    return false;
  }
  for (const [k, v] of Object.entries(env)) {
    tmux.sendText(sessionName, `export ${k}=${JSON.stringify(String(v))}`, {executeCommand: true});
  }
  for (const cmd of pre) tmux.sendText(sessionName, cmd, {executeCommand: true});
  tmux.sendText(sessionName, mainCmd, {executeCommand: true});
  return true;
}
