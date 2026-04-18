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
  const {rows} = useTerminalDimensions();

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

  const activate = async (mode: NavMode) => {
    const item = items[selectedIndex];
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

  const visibleRows = Math.max(1, rows - 3);
  const start = Math.max(0, Math.min(selectedIndex - Math.floor(visibleRows / 2), Math.max(0, items.length - visibleRows)));
  const visible = items.slice(start, start + visibleRows);

  return (
    <FullScreen enableAltScreen={false}>
      <Box flexDirection="column" paddingX={1}>
        <Text>{`devteam nav  current:${modeLabel(currentMode)}  ${statusMessage}`}</Text>
        {visible.map((item, offset) => {
          const absoluteIndex = start + offset;
          const isSelected = absoluteIndex === selectedIndex;
          const isCurrent = tmux.sessionName(item.project, item.feature) === currentBase;
          const modeCells = modeOrder.map((mode) => item.sessions[mode] ? modeLabel(mode) : '-').join(' ');
          const prefix = isSelected ? '>' : ' ';
          const current = isCurrent ? '*' : ' ';
          return (
            <Text key={`${item.project}-${item.feature}`}>
              {`${prefix}${current} ${item.feature} [${item.project}]  ${modeCells}`}
            </Text>
          );
        })}
      </Box>
    </FullScreen>
  );
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
