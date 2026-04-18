import React, {useEffect, useMemo, useState} from 'react';
import {Box, Text, useApp, useStdin, useStdout} from 'ink';
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
  sessions: Record<NavMode, {exists: boolean; usable: boolean}>;
};

export default function TmuxNavigatorApp(props: {sessionName: string}) {
  const {sessionName} = props;
  const {exit} = useApp();
  const {stdin, setRawMode} = useStdin();
  const {stdout} = useStdout();
  const {rows, columns} = useTerminalDimensions();

  const git = useMemo(() => new GitService(getProjectsDirectory()), []);
  const tmux = useMemo(() => new TmuxService(), []);
  const availableTools = useMemo(() => detectAvailableAITools(), []);
  const currentMode = sessionMode(sessionName);
  const currentBase = baseSessionName(sessionName);

  const [items, setItems] = useState<NavWorktree[]>([]);
  const [selectedIndex, setSelectedIndex] = useState(0);
  const [selectedActionMode, setSelectedActionMode] = useState<NavMode>('agent');
  const [statusMessage, setStatusMessage] = useState<string>('loading...');

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
            agent: sessionState(tmux, tmux.sessionName(worktree.project, worktree.feature), sessions),
            shell: sessionState(tmux, tmux.shellSessionName(worktree.project, worktree.feature), sessions),
            run: sessionState(tmux, tmux.runSessionName(worktree.project, worktree.feature), sessions),
          }
        });
      }
    }

    next.sort((a, b) => (b.lastCommitTs || 0) - (a.lastCommitTs || 0) || `${a.project}/${a.feature}`.localeCompare(`${b.project}/${b.feature}`));
    setItems(next);

    const idx = next.findIndex((item) => tmux.sessionName(item.project, item.feature) === currentBase);
    if (idx >= 0) setSelectedIndex(idx);
    setStatusMessage(next.length ? 'click tile or mode  x closes selected mode  esc back' : 'no worktrees found');
  };

  useEffect(() => {
    void load();
    if (!isAppIntervalsEnabled()) return;
    const timer = setInterval(() => { void load(); }, 5000);
    return () => clearInterval(timer);
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  useEffect(() => {
    if (!stdout?.isTTY) return;
    try {
      stdout.write('\x1b[?1000h');
      stdout.write('\x1b[?1002h');
      stdout.write('\x1b[?1006h');
    } catch {}
    return () => {
      try {
        stdout.write('\x1b[?1000l');
        stdout.write('\x1b[?1002l');
        stdout.write('\x1b[?1006l');
      } catch {}
    };
  }, [stdout]);

  useEffect(() => {
    setSelectedActionMode(currentMode);
  }, [currentMode]);

  useEffect(() => {
    setRawMode(true);
    const handler = (buf: Buffer) => {
      const input = buf.toString('utf8');
      if (handleMouseInput(input)) return;
      if (input === 'j' || input === '\u001b[B') setSelectedIndex((prev) => Math.min(prev + 1, Math.max(items.length - 1, 0)));
      else if (input === 'k' || input === '\u001b[A') setSelectedIndex((prev) => Math.max(prev - 1, 0));
      else if (input === 'h' || input === '\u001b[D') setSelectedActionMode((prev) => prev === 'run' ? 'shell' : prev === 'shell' ? 'agent' : 'agent');
      else if (input === 'l' || input === '\u001b[C') setSelectedActionMode((prev) => prev === 'agent' ? 'shell' : prev === 'shell' ? 'run' : 'run');
      else if (input === 'r') void load();
      else if (input === '1') { setSelectedActionMode('agent'); void activate('agent'); }
      else if (input === '2') { setSelectedActionMode('shell'); void activate('shell'); }
      else if (input === '3') { setSelectedActionMode('run'); void activate('run'); }
      else if (input === 'x' || input === 'X') void closeMode(selectedActionMode);
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
  }, [currentMode, exit, items.length, load, selectedActionMode, sessionName, setRawMode, stdin, tmux]);

  const handleMouseInput = (input: string): boolean => {
    const match = input.match(/\x1b\[<(\d+);(\d+);(\d+)([Mm])/);
    if (!match) return false;

    const button = Number(match[1]);
    const x = Number(match[2]);
    const y = Number(match[3]);
    const eventType = match[4];

    if (eventType !== 'M') return true;
    if (button >= 64) return true;

    const tileHit = tileHitTarget(x, y, columns, visible.length);
    if (tileHit !== null) {
      const absoluteIndex = pageStart + tileHit;
      setSelectedIndex(absoluteIndex);
      void activate(currentMode, absoluteIndex);
      return true;
    }

    const action = bottomActionHit(x, y, columns);
    if (action === 'back') {
      tmux.selectMainPane(sessionName);
      exit();
      return true;
    }
    if (action === 'close') {
      void closeMode(selectedActionMode);
      return true;
    }
    if (action) {
      setSelectedActionMode(action);
      void activate(action);
      return true;
    }

    return true;
  };

  const activate = async (mode: NavMode, index: number = selectedIndex) => {
    const item = items[index];
    if (!item) return;
    const targetSession = ensureModeReady(tmux, item, mode, availableTools);
    if (!targetSession) return;

    tmux.prepareSessionNavigator(targetSession);
    tmux.selectMainPane(targetSession);
    tmux.switchClient(targetSession);
  };

  const closeMode = async (mode: NavMode) => {
    const item = items[selectedIndex];
    if (!item) return;
    const targetSession = modeSessionName(tmux, item.project, item.feature, mode);
    if (!item.sessions[mode].exists) {
      setStatusMessage(`${mode} is not running`);
      return;
    }
    if (targetSession === sessionName) {
      const fallbackMode = fallbackModeForClose(mode);
      const fallbackSession = ensureModeReady(tmux, item, fallbackMode, availableTools);
      if (!fallbackSession || fallbackSession === targetSession) {
        setStatusMessage(`unable to switch away before closing ${mode}`);
        return;
      }
      tmux.prepareSessionNavigator(fallbackSession);
      tmux.selectMainPane(fallbackSession);
      tmux.switchClient(fallbackSession);
      tmux.killSession(targetSession);
      return;
    }
    tmux.killSession(targetSession);
    await load();
    setStatusMessage(`closed ${mode} for ${item.feature}`);
  };

  const tileColumns = Math.min(3, Math.max(1, Math.floor((columns + 1) / (MIN_TILE_WIDTH + 1))));
  const tileRows = rows >= 9 ? 2 : 1;
  const visibleCount = Math.min(6, tileColumns * tileRows);
  const tileWidth = Math.max(18, Math.floor((columns - Math.max(0, tileColumns - 1)) / tileColumns));
  const pageStart = Math.max(0, Math.floor(selectedIndex / Math.max(1, visibleCount)) * Math.max(1, visibleCount));
  const visible = items.slice(pageStart, pageStart + visibleCount);
  const selectedItem = items[selectedIndex] || null;
  const statusTone: 'cyan' | 'yellow' = items.length ? 'cyan' : 'yellow';
  const tileGroups = Array.from({length: tileRows}, (_, row) => visible.slice(row * tileColumns, (row + 1) * tileColumns));

  return (
    <FullScreen enableAltScreen={false}>
      <Box flexDirection="column" paddingX={1}>
        <Box justifyContent="space-between">
          <Text color="black" backgroundColor="cyan">{' DEVTEAM NAV '}</Text>
          <Text color="gray">{truncateText(selectedItem ? `${selectedItem.feature} [${selectedItem.project}]` : 'no selection', Math.max(12, columns - 22))}</Text>
        </Box>
        <Box justifyContent="space-between">
          <Text color="magenta">{`recent ${pageStart + 1}-${Math.min(pageStart + visible.length, items.length)} / ${items.length}`}</Text>
          <Text color={statusTone}>{truncateText(statusMessage, Math.max(16, Math.floor(columns / 2)))} </Text>
        </Box>
        {tileGroups.map((group, rowIndex) => (
          <Box key={`tile-row-${rowIndex}`} marginTop={rowIndex === 0 ? 0 : 0}>
            {group.map((item, columnIndex) => {
              const absoluteIndex = pageStart + (rowIndex * tileColumns) + columnIndex;
              return (
                <Box key={`${item.project}-${item.feature}`} marginRight={columnIndex === group.length - 1 ? 0 : 1} width={tileWidth} flexDirection="column">
                  {renderTileLine(
                    item,
                    absoluteIndex === selectedIndex,
                    itemSessionBase(item) === currentBase,
                    tileWidth,
                    0
                  )}
                  {renderTileLine(
                    item,
                    absoluteIndex === selectedIndex,
                    itemSessionBase(item) === currentBase,
                    tileWidth,
                    1
                  )}
                </Box>
              );
            })}
          </Box>
        ))}
        <Box justifyContent="space-between">
          <Text color="white">
            {selectedItem ? `${truncateText(selectedItem.feature, 20)} [${truncateText(selectedItem.project, 16)}]` : 'no selection'}
          </Text>
          <Text color="gray">{selectedItem ? truncateText(selectedItem.branch, 18) : ''}</Text>
        </Box>
        <Box>
          {selectedItem ? (
            <Text color="gray">
              {modeOrder.map((mode) => renderInlineMode(mode, selectedItem.sessions[mode], selectedActionMode === mode, mode === currentMode)).join('  ')}
            </Text>
          ) : (
            <Text color="gray">no worktrees discovered</Text>
          )}
        </Box>
        <Box>
          {renderBottomActions(selectedItem, selectedActionMode, currentMode)}
        </Box>
        <Box justifyContent="space-between">
          <Text color="magenta">click tile to open current mode  click bottom to switch/close</Text>
          <Text color="gray">esc back</Text>
        </Box>
      </Box>
    </FullScreen>
  );
}

const MIN_TILE_WIDTH = 20;

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

function truncateText(value: string, width: number): string {
  if (value.length <= width) return value;
  if (width <= 3) return value.slice(0, width);
  return `${value.slice(0, width - 3)}...`;
}

function sessionState(tmux: TmuxService, sessionName: string, sessions: Set<string>): {exists: boolean; usable: boolean} {
  const exists = sessions.has(sessionName);
  return {
    exists,
    usable: exists ? tmux.hasUsableMainPane(sessionName) : false,
  };
}

function renderTileLine(item: NavWorktree, selected: boolean, current: boolean, width: number, line: 0 | 1): JSX.Element {
  const bg = selected ? 'yellow' : current ? 'cyan' : 'blue';
  const fg = selected || current ? 'black' : 'white';
  if (line === 0) {
    const left = truncateText(item.feature, Math.max(8, width - 6));
    const right = current ? 'LIVE' : '    ';
    return (
      <Text color={fg} backgroundColor={bg}>
        {padTile(`${left}`, `${right}`, width)}
      </Text>
    );
  }

  const project = truncateText(item.project, Math.max(5, width - 8));
  const badges = modeOrder.map((mode) => compactModeState(mode, item.sessions[mode])).join(' ');
  return (
    <Text color={fg} backgroundColor={bg}>
      {padTile(project, badges, width)}
    </Text>
  );
}

function renderInlineMode(mode: NavMode, state: {exists: boolean; usable: boolean}, selected: boolean, current: boolean): string {
  const status = state.usable ? 'up' : state.exists ? 'stale' : 'off';
  const prefix = selected ? '>' : ' ';
  const live = current ? '*' : ' ';
  return `${prefix}${live}${modePill(mode).trim()} ${status}`;
}

function renderBottomActions(
  selectedItem: NavWorktree | null,
  selectedMode: NavMode,
  currentMode: NavMode
): JSX.Element {
  return (
    <Box>
      {modeOrder.map((mode, index) => (
        <Text
          key={mode}
          color={selectedMode === mode ? 'black' : 'white'}
          backgroundColor={selectedMode === mode ? modeColor(mode) : undefined}
        >
          {`${index === 0 ? '' : ' '}${renderActionLabel(mode, selectedItem?.sessions[mode], currentMode === mode)}`}
        </Text>
      ))}
      <Text color="black" backgroundColor="red">{' Close '}</Text>
      <Text color="black" backgroundColor="gray">{' Back '}</Text>
    </Box>
  );
}

function renderActionLabel(mode: NavMode, state: {exists: boolean; usable: boolean} | undefined, current: boolean): string {
  const label = modePill(mode).trim();
  const status = state ? compactModeState(mode, state) : '--';
  return `${current ? '*' : ' '}${label} ${status} `;
}

function itemSessionBase(item: NavWorktree): string {
  return `dev-${item.project}-${item.feature}`;
}

function tileHitTarget(x: number, y: number, columns: number, visibleCount: number): number | null {
  if (y < 3 || y > 6 || visibleCount === 0) return null;
  const tileColumns = Math.min(3, Math.max(1, Math.floor((columns + 1) / (MIN_TILE_WIDTH + 1))));
  const tileWidth = Math.max(18, Math.floor((columns - Math.max(0, tileColumns - 1)) / tileColumns));
  const row = Math.floor((y - 3) / 2);
  const rowY = (y - 3) % 2;
  if (rowY < 0 || rowY > 1) return null;
  const localIndex = Math.floor((x - 1) / (tileWidth + 1));
  if (localIndex < 0 || localIndex >= tileColumns) return null;
  const xOffset = (x - 1) % (tileWidth + 1);
  if (xOffset >= tileWidth) return null;
  const absoluteLocal = row * tileColumns + localIndex;
  if (absoluteLocal >= visibleCount) return null;
  return absoluteLocal;
}

function bottomActionHit(x: number, y: number, columns: number): NavMode | 'close' | 'back' | null {
  if (y !== 9) return null;
  const labels: Array<{kind: NavMode | 'close' | 'back'; label: string}> = [
    {kind: 'agent', label: ' 1 Agent up '},
    {kind: 'shell', label: ' 2 Shell up '},
    {kind: 'run', label: ' 3 Run up '},
    {kind: 'close', label: ' Close '},
    {kind: 'back', label: ' Back '},
  ];
  let cursor = 1;
  for (const item of labels) {
    const start = cursor;
    const end = start + item.label.length - 1;
    if (x >= start && x <= end) return item.kind;
    cursor = end + 2;
    if (cursor > columns) break;
  }
  return null;
}

function compactModeState(mode: NavMode, state: {exists: boolean; usable: boolean}): string {
  if (state.usable) return modeLabel(mode);
  if (state.exists) return '!';
  return '-';
}

function padTile(left: string, right: string, width: number): string {
  const innerWidth = Math.max(4, width);
  const availableLeft = Math.max(1, innerWidth - right.length - 1);
  const leftText = truncateText(left, availableLeft);
  const gap = Math.max(1, innerWidth - leftText.length - right.length);
  return `${leftText}${' '.repeat(gap)}${right}`;
}

function thisRunSession(tmux: TmuxService, item: NavWorktree, exists: boolean): boolean {
  const sessionName = tmux.runSessionName(item.project, item.feature);
  if (!exists) tmux.createSession(sessionName, item.path, false);
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
  if (exists) {
    tmux.ensureMainPane(sessionName, item.path);
  }
  for (const [k, v] of Object.entries(env)) {
    tmux.sendText(sessionName, `export ${k}=${JSON.stringify(String(v))}`, {executeCommand: true});
  }
  for (const cmd of pre) tmux.sendText(sessionName, cmd, {executeCommand: true});
  tmux.sendText(sessionName, mainCmd, {executeCommand: true});
  return true;
}

function ensureModeReady(
  tmux: TmuxService,
  item: NavWorktree,
  mode: NavMode,
  availableTools: AITool[]
): string | null {
  const targetSession = modeSessionName(tmux, item.project, item.feature, mode);
  const exists = tmux.hasSession(targetSession);
  const needsMainPane = exists && !tmux.hasUsableMainPane(targetSession);

  if (!exists || needsMainPane) {
    if (mode === 'agent') {
      const remembered = getLastTool(item.path);
      const tool = ((remembered && remembered !== 'none') ? remembered : (availableTools[0] || 'none')) as AITool;
      if (!exists) {
        if (tool === 'none') {
          tmux.createSession(targetSession, item.path, true);
        } else {
          tmux.createSessionWithCommand(targetSession, item.path, aiLaunchCommand(tool), true);
          setLastTool(tool, item.path);
        }
      } else if (tool !== 'none') {
        tmux.ensureMainPane(targetSession, item.path, aiLaunchCommand(tool as Exclude<AITool, 'none'>));
      } else {
        tmux.ensureMainPane(targetSession, item.path);
      }
    } else if (mode === 'shell') {
      if (!exists) tmux.createSession(targetSession, item.path, false);
      else tmux.ensureMainPane(targetSession, item.path);
    } else {
      const configured = thisRunSession(tmux, item, exists);
      if (!configured) return null;
    }
  }

  return targetSession;
}

function fallbackModeForClose(mode: NavMode): NavMode {
  if (mode === 'agent') return 'shell';
  return 'agent';
}
