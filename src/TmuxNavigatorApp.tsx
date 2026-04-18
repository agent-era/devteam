import React, {useEffect, useMemo, useState} from 'react';
import {Box, Text, useApp, useStdin, useStdout} from 'ink';
import path from 'node:path';
import fs from 'node:fs';
import FullScreen from './components/common/FullScreen.js';
import {GitService} from './services/GitService.js';
import {GitHubService} from './services/GitHubService.js';
import {TmuxService} from './services/TmuxService.js';
import {getProjectsDirectory, isAppIntervalsEnabled} from './config.js';
import {aiLaunchCommand, RUN_CONFIG_FILE} from './constants.js';
import {detectAvailableAITools} from './shared/utils/commandExecutor.js';
import {getLastTool, setLastTool} from './shared/utils/aiSessionMemory.js';
import {baseSessionName, modeLabel, modeOrder, modeSessionName, sessionMode, type NavMode} from './shared/utils/tmuxNav.js';
import {PRStatus, SessionInfo, WorktreeInfo} from './models.js';
import type {AITool} from './models.js';
import {useTerminalDimensions} from './hooks/useTerminalDimensions.js';
import StatusChip from './components/common/StatusChip.js';
import {getStatusMeta} from './components/views/MainView/highlight.js';
import {formatDiffStats, formatGitChanges, formatPRStatus} from './components/views/MainView/utils.js';
import {stringDisplayWidth} from './shared/utils/formatting.js';

type NavWorktree = {
  project: string;
  feature: string;
  path: string;
  branch: string;
  lastCommitTs: number;
  worktree: WorktreeInfo;
  statusMeta: {label: string; bg: string; fg: string};
  diffText: string;
  changesText: string;
  prText: string;
  sessions: Record<NavMode, {exists: boolean; usable: boolean}>;
};

export default function TmuxNavigatorApp(props: {sessionName: string}) {
  const {sessionName} = props;
  const {exit} = useApp();
  const {stdin, setRawMode} = useStdin();
  const {stdout} = useStdout();
  const {rows, columns} = useTerminalDimensions();

  const git = useMemo(() => new GitService(getProjectsDirectory()), []);
  const github = useMemo(() => new GitHubService(), []);
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
    const discovered: Array<{
      project: string;
      feature: string;
      path: string;
      branch: string;
      last_commit_ts: number;
    }> = [];

    for (const project of projects) {
      const worktrees = await git.getWorktreesForProject(project);
      discovered.push(...worktrees);
    }

    const prByPath = await github.batchGetPRStatusForWorktreesAsync(
      discovered.map((worktree) => ({project: worktree.project, path: worktree.path})),
      true
    );

    const next = await Promise.all(discovered.map(async (worktree) => {
      const agentSession = tmux.sessionName(worktree.project, worktree.feature);
      const attached = sessions.has(agentSession);
      const [gitStatus, aiResult] = await Promise.all([
        git.getGitStatus(worktree.path),
        attached
          ? tmux.getAIStatus(agentSession)
          : Promise.resolve({tool: 'none' as const, status: 'not_running' as const}),
      ]);
      const pr = prByPath[worktree.path] || new PRStatus({loadingStatus: 'not_checked'});
      const info = new WorktreeInfo({
        project: worktree.project,
        feature: worktree.feature,
        path: worktree.path,
        branch: worktree.branch,
        git: gitStatus,
        pr,
        session: new SessionInfo({
          session_name: agentSession,
          attached,
          ai_status: aiResult.status,
          ai_tool: aiResult.tool,
        }),
        last_commit_ts: worktree.last_commit_ts || 0,
      });
      return {
        project: worktree.project,
        feature: worktree.feature,
        path: worktree.path,
        branch: worktree.branch,
        lastCommitTs: worktree.last_commit_ts || 0,
        worktree: info,
        statusMeta: getStatusMeta(info, pr),
        diffText: formatDiffStats(info.git?.base_added_lines || 0, info.git?.base_deleted_lines || 0),
        changesText: formatGitChanges(info.git?.ahead || 0, info.git?.behind || 0),
        prText: formatPRStatus(pr) || '-',
        sessions: {
          agent: sessionState(tmux, agentSession, sessions),
          shell: sessionState(tmux, tmux.shellSessionName(worktree.project, worktree.feature), sessions),
          run: sessionState(tmux, tmux.runSessionName(worktree.project, worktree.feature), sessions),
        }
      };
    }));

    next.sort((a, b) => (b.lastCommitTs || 0) - (a.lastCommitTs || 0) || `${a.project}/${a.feature}`.localeCompare(`${b.project}/${b.feature}`));
    setItems(next);

    const currentSessionIndex = next.findIndex((item) => tmux.sessionName(item.project, item.feature) === currentBase);
    setSelectedIndex((prev) => {
      if (currentSessionIndex >= 0) return currentSessionIndex;
      return Math.max(0, Math.min(prev, next.length - 1));
    });
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
      else if (input === '\r' || input === '\n') void activate(selectedActionMode);
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

    const layout = computeLayout(columns, rows, items.length, selectedIndex);
    const tileHit = tileHitTarget(x, y, layout);
    if (tileHit !== null) {
      const absoluteIndex = layout.pageStart + tileHit;
      setSelectedIndex(absoluteIndex);
      void activate(selectedActionMode, absoluteIndex);
      return true;
    }

    const action = bottomActionHit(x, y, columns, layout, items[selectedIndex] || null, currentMode);
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

  const layout = computeLayout(columns, rows, items.length, selectedIndex);
  const visible = items.slice(layout.pageStart, layout.pageStart + layout.visibleCount);
  const selectedItem = items[selectedIndex] || null;
  const tileGroups = Array.from({length: layout.tileRows}, (_, row) => visible.slice(row * layout.tileColumns, (row + 1) * layout.tileColumns));

  return (
    <FullScreen enableAltScreen={false}>
      <Box flexDirection="column" paddingX={1}>
        {tileGroups.map((group, rowIndex) => (
          <Box key={`tile-row-${rowIndex}`}>
            {group.map((item, columnIndex) => {
              const absoluteIndex = layout.pageStart + (rowIndex * layout.tileColumns) + columnIndex;
              return (
                <Box
                  key={`${item.project}-${item.feature}`}
                  marginRight={columnIndex === group.length - 1 ? 0 : 1}
                  width={layout.tileWidth}
                  flexDirection="column"
                >
                  {renderTileHeader(
                    item,
                    absoluteIndex === selectedIndex,
                    itemSessionBase(item) === currentBase,
                    layout.tileWidth
                  )}
                  {renderTileFeatureLine(
                    item,
                    absoluteIndex === selectedIndex,
                    itemSessionBase(item) === currentBase,
                    layout.tileWidth
                  )}
                  {renderTileMetricsLine(item, absoluteIndex === selectedIndex, itemSessionBase(item) === currentBase, layout.tileWidth)}
                </Box>
              );
            })}
          </Box>
        ))}
        <Box justifyContent="space-between">
          <Text color="white">
            {selectedItem
              ? `${truncateText(selectedItem.feature, 24)} [${truncateText(selectedItem.project, 16)}]`
              : statusMessage}
          </Text>
          <Text color="gray">
            {selectedItem ? truncateText(`pr ${selectedItem.prText}  diff ${selectedItem.diffText}  sync ${selectedItem.changesText}`, Math.max(20, Math.floor(columns / 2))) : ''}
          </Text>
        </Box>
        <Box>
          {renderBottomActions(selectedItem, selectedActionMode, currentMode)}
        </Box>
      </Box>
    </FullScreen>
  );
}

const STATUS_CHIP_WIDTH = 13;
const MIN_TILE_WIDTH = 30;
const TILE_LINE_COUNT = 3;
const SUMMARY_LINE_Y = 1;
const ACTION_LINE_Y = 2;

export type LayoutInfo = {
  tileColumns: number;
  tileRows: number;
  visibleCount: number;
  tileWidth: number;
  pageStart: number;
};

export function computeLayout(columns: number, rows: number, itemCount: number, selectedIndex: number): LayoutInfo {
  const tileColumns = Math.min(3, Math.max(1, Math.floor((columns + 1) / (MIN_TILE_WIDTH + 1))));
  const tileRows = rows >= 8 ? 2 : 1;
  const visibleCount = Math.min(6, Math.max(1, tileColumns * tileRows));
  const computedWidth = Math.floor((columns - Math.max(0, tileColumns - 1)) / tileColumns);
  const tileWidth = Math.max(18, Math.min(columns, Math.max(MIN_TILE_WIDTH, computedWidth)));
  const pageStart = itemCount === 0
    ? 0
    : Math.max(0, Math.floor(selectedIndex / visibleCount) * visibleCount);
  return {tileColumns, tileRows, visibleCount, tileWidth, pageStart};
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

function truncateText(value: string, width: number): string {
  if (stringDisplayWidth(value) <= width) return value;
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

function renderTileHeader(item: NavWorktree, selected: boolean, current: boolean, width: number): JSX.Element {
  const metaWidth = Math.max(8, width - STATUS_CHIP_WIDTH - 1);
  const metaBg = selected ? 'yellow' : current ? 'cyan' : 'gray';
  const metaFg = selected || current ? 'black' : 'white';
  const right = current ? 'LIVE' : `${item.worktree.session?.attached ? 'ATTN' : 'NAV '}`;
  const left = truncateText(item.project, Math.max(5, metaWidth - right.length - 1));
  return (
    <Box>
      <StatusChip
        label={item.statusMeta.label || ''}
        color={item.statusMeta.bg}
        fg={item.statusMeta.fg}
        width={STATUS_CHIP_WIDTH}
      />
      <Text color={metaFg} backgroundColor={metaBg}>
        {padTile(left, right, metaWidth)}
      </Text>
    </Box>
  );
}

function renderTileFeatureLine(item: NavWorktree, selected: boolean, current: boolean, width: number): JSX.Element {
  const bg = selected ? 'yellow' : current ? 'cyan' : 'blue';
  const fg = selected || current ? 'black' : 'white';
  const left = truncateText(item.feature, Math.max(8, width - 10));
  const right = item.branch && item.branch !== item.feature ? truncateText(item.branch.replace(/^refs\/heads\//, ''), 8) : '';
  return (
    <Text color={fg} backgroundColor={bg}>
      {padTile(left, right, width)}
    </Text>
  );
}

function renderTileMetricsLine(item: NavWorktree, selected: boolean, current: boolean, width: number): JSX.Element {
  const bg = selected ? 'yellow' : current ? 'cyan' : 'black';
  const fg = selected || current ? 'black' : 'white';
  const left = `${modeStatusSummary(item)} ${item.diffText}`;
  const right = `${item.changesText} ${item.prText}`.trim();
  return (
    <Text color={fg} backgroundColor={bg}>
      {padTile(left, right, width)}
    </Text>
  );
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

export function renderActionLabel(mode: NavMode, state: {exists: boolean; usable: boolean} | undefined, current: boolean): string {
  const label = modePill(mode).trim();
  const status = state ? compactModeState(mode, state) : '--';
  return `${current ? '*' : ' '}${label} ${status} `;
}

function itemSessionBase(item: NavWorktree): string {
  return `dev-${item.project}-${item.feature}`;
}

export function tileHitTarget(x: number, y: number, layout: LayoutInfo): number | null {
  const maxTileY = layout.tileRows * TILE_LINE_COUNT;
  if (y < 1 || y > maxTileY || layout.visibleCount === 0) return null;
  const row = Math.floor((y - 1) / TILE_LINE_COUNT);
  const localIndex = Math.floor((x - 1) / (layout.tileWidth + 1));
  if (localIndex < 0 || localIndex >= layout.tileColumns) return null;
  const xOffset = (x - 1) % (layout.tileWidth + 1);
  if (xOffset >= layout.tileWidth) return null;
  const absoluteLocal = row * layout.tileColumns + localIndex;
  if (absoluteLocal >= layout.visibleCount) return null;
  return absoluteLocal;
}

export function bottomActionHit(
  x: number,
  y: number,
  columns: number,
  layout: LayoutInfo,
  selectedItem: NavWorktree | null,
  currentMode: NavMode
): NavMode | 'close' | 'back' | null {
  const summaryY = (layout.tileRows * TILE_LINE_COUNT) + SUMMARY_LINE_Y;
  const actionY = summaryY + ACTION_LINE_Y - 1;
  if (y !== actionY) return null;
  const labels: Array<{kind: NavMode | 'close' | 'back'; label: string}> = [
    {kind: 'agent', label: renderActionLabel('agent', selectedItem?.sessions.agent, currentMode === 'agent')},
    {kind: 'shell', label: renderActionLabel('shell', selectedItem?.sessions.shell, currentMode === 'shell')},
    {kind: 'run', label: renderActionLabel('run', selectedItem?.sessions.run, currentMode === 'run')},
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

export function compactModeState(mode: NavMode, state: {exists: boolean; usable: boolean}): string {
  if (state.usable) return modeLabel(mode);
  if (state.exists) return '!';
  return '-';
}

export function modeStatusSummary(item: NavWorktree): string {
  return modeOrder.map((mode) => `${modeLabel(mode)}${compactModeState(mode, item.sessions[mode])}`).join(' ');
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
