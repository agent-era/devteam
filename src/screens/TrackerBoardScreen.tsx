import React from 'react';
import {Box, Text, useInput} from 'ink';
import {TrackerBoard, TrackerItem, TrackerService, TrackerStage} from '../services/TrackerService.js';
import {useKeyboardShortcuts} from '../hooks/useKeyboardShortcuts.js';
import {useTerminalDimensions} from '../hooks/useTerminalDimensions.js';
import {useUIContext} from '../contexts/UIContext.js';
import {useWorktreeContext} from '../contexts/WorktreeContext.js';
import {useGitHubContext} from '../contexts/GitHubContext.js';
import {WorktreeInfo} from '../models.js';
import type {AIStatus, AITool} from '../models.js';
import {truncateDisplay} from '../shared/utils/formatting.js';
import {computeCardStatusFlags, isItemPRMerged} from '../shared/utils/trackerCardStatus.js';
import {logError} from '../shared/utils/logger.js';
import {startIntervalIfEnabled} from '../shared/utils/intervals.js';
import {VISIBLE_STATUS_REFRESH_DURATION} from '../constants.js';
import TrackerProjectPickerDialog from '../components/dialogs/TrackerProjectPickerDialog.js';
import AIToolDialog from '../components/dialogs/AIToolDialog.js';
import StatusChip from '../components/common/StatusChip.js';
import {computeRunningChips} from './runningChips.js';

interface TrackerBoardScreenProps {
  project: string;
  projectPath: string;
  onBack: () => void;
  onOpenItem: (item: TrackerItem) => void;
  onAttachItem: (item: TrackerItem) => void;
  onLaunchItemBackground?: (item: TrackerItem, tool: AITool) => Promise<void>;
  onCustomizeStages?: () => void;
}

type PendingNew = {
  title: string;
  stage: TrackerStage;
  columnIndex: number;
};

const SPINNER_CHARS = ['⠋', '⠙', '⠹', '⠸', '⠼', '⠴', '⠦', '⠧', '⠇', '⠏'];

const MIN_COLUMN_WIDTH = 20;
const MAX_COLUMN_WIDTH = 50;
const PLAN_COLOR = 'blue';
const IMPL_COLOR = 'magenta';
// Each item renders as up to 4 rows: slug + 2 secondary lines + marginBottom.
// Reserved as a fixed slot so mixed short/long descriptions don't overlap
// during scroll. Short descriptions just leave the second line blank.
const ROWS_PER_ITEM = 4;
const SECONDARY_MAX_LINES = 2;

// Word-wrap `text` onto at most `maxLines` of width `width`. Breaks on spaces
// when possible, falls back to character boundaries. Appends '…' to the last
// line when content was truncated. Returns an array of 0–maxLines strings.
function wrapToLines(text: string, width: number, maxLines: number): string[] {
  if (!text || width <= 0 || maxLines <= 0) return [];
  const out: string[] = [];
  let remaining = text.trim();
  while (remaining && out.length < maxLines) {
    if (remaining.length <= width) { out.push(remaining); break; }
    let breakAt = remaining.lastIndexOf(' ', width);
    if (breakAt <= 0) breakAt = width;
    out.push(remaining.slice(0, breakAt).trimEnd());
    remaining = remaining.slice(breakAt).trimStart();
  }
  if (remaining && out.length > 0) {
    const last = out[out.length - 1];
    const fitsEllipsis = last.length + 1 <= width;
    out[out.length - 1] = fitsEllipsis
      ? last + '…'
      : last.slice(0, Math.max(0, width - 1)) + '…';
  }
  return out;
}
// 2 borders + 1 header. Items area starts on the row directly below the title — no
// inter-row gap so we get one extra item per column.
const COLUMN_CHROME_ROWS = 3;

export function getTrackerCardDisplayState({
  prMerged,
  readyToAdvance,
  isWaiting,
  isWorking,
  hasSession,
  inactive,
  itemStatusDescription,
}: {
  prMerged: boolean;
  readyToAdvance: boolean;
  isWaiting: boolean;
  isWorking: boolean;
  hasSession: boolean;
  inactive: boolean;
  itemStatusDescription?: string;
}): {
  statusGlyph: string;
  statusColor?: string;
  titleColor?: string;
  titleBold: boolean;
  secondaryText: string;
  secondaryColor?: string;
  secondaryBold: boolean;
  secondaryDim: boolean;
  showApproveHint: boolean;
} {
  if (prMerged) {
    return {
      statusGlyph: '◆',
      statusColor: 'gray',
      titleColor: 'gray',
      titleBold: false,
      secondaryText: 'Merged',
      secondaryColor: 'gray',
      secondaryBold: false,
      secondaryDim: true,
      showApproveHint: false,
    };
  }

  if (readyToAdvance) {
    return {
      statusGlyph: '✓',
      statusColor: 'green',
      titleColor: 'green',
      titleBold: true,
      secondaryText: itemStatusDescription ? `Ready — ${itemStatusDescription}` : 'Ready',
      secondaryColor: inactive ? 'gray' : 'green',
      secondaryBold: !inactive,
      secondaryDim: inactive,
      showApproveHint: true,
    };
  }

  if (isWaiting) {
    return {
      statusGlyph: '!',
      statusColor: 'yellow',
      titleColor: 'yellow',
      titleBold: true,
      secondaryText: itemStatusDescription || 'waiting for you',
      secondaryColor: inactive ? 'gray' : 'yellow',
      secondaryBold: !inactive,
      secondaryDim: inactive,
      showApproveHint: false,
    };
  }

  if (isWorking) {
    return {
      statusGlyph: '⟳',
      statusColor: 'cyan',
      titleColor: inactive ? 'gray' : undefined,
      titleBold: false,
      secondaryText: itemStatusDescription || 'running',
      secondaryColor: inactive ? 'gray' : 'cyan',
      secondaryBold: false,
      secondaryDim: inactive,
      showApproveHint: false,
    };
  }

  return {
    statusGlyph: ' ',
    statusColor: inactive ? 'gray' : undefined,
    titleColor: inactive ? 'gray' : undefined,
    titleBold: false,
    secondaryText: '',
    secondaryColor: inactive ? 'gray' : undefined,
    secondaryBold: false,
    secondaryDim: true,
    showApproveHint: false,
  };
}

function computeColumnScroll(selected: number, total: number, visible: number): number {
  if (total <= visible) return 0;
  const max = total - visible;
  const top = selected - Math.floor((visible - 1) / 2);
  return Math.max(0, Math.min(max, top));
}

function findSlugPosition(board: TrackerBoard, slug: string): {column: number; row: number} | null {
  for (let ci = 0; ci < board.columns.length; ci++) {
    const ri = board.columns[ci].items.findIndex(it => it.slug === slug);
    if (ri >= 0) return {column: ci, row: ri};
  }
  return null;
}

export default function TrackerBoardScreen({
  project,
  projectPath,
  onBack,
  onOpenItem,
  onAttachItem,
  onLaunchItemBackground,
  onCustomizeStages,
}: TrackerBoardScreenProps) {
  const service = React.useMemo(() => new TrackerService(), []);
  const [rawBoard, setBoard] = React.useState<TrackerBoard>(() => service.loadBoard(project, projectPath));
  const [selectedColumn, setSelectedColumn] = React.useState(0);
  const [selectedRowByColumn, setSelectedRowByColumn] = React.useState<Record<number, number>>({});
  const [createMode, setCreateMode] = React.useState(false);
  const [createTitle, setCreateTitle] = React.useState('');
  const [pendingNew, setPendingNew] = React.useState<PendingNew | null>(null);
  const [spinnerFrame, setSpinnerFrame] = React.useState(0);
  const [toolPickPending, setToolPickPending] = React.useState<PendingNew | null>(null);
  const [proposalInputMode, setProposalInputMode] = React.useState(false);
  const [proposalPrompt, setProposalPrompt] = React.useState('');
  const [pickerMode, setPickerMode] = React.useState(false);

  const {
    proposalGenerating,
    proposalItems,
    proposalError,
    startProposalGeneration,
    finishProposalGeneration,
    showProposals,
    showTracker,
    getTrackerSelection,
    setTrackerSelection,
    showList,
    showDiffView,
    showArchiveConfirmation,
    showSettings,
    runWithLoading,
  } = useUIContext();

  const {
    worktrees,
    attachShellSession,
    attachRunSession,
    discoverProjects,
    getAvailableAITools,
    refreshProjectWorktrees,
    terminateFeatureSessions,
  } = useWorktreeContext();
  const {pullRequests, setVisibleWorktrees} = useGitHubContext();
  const availableTools = React.useMemo(() => getAvailableAITools(), [getAvailableAITools]);
  const {columns: termCols, rows: termRows} = useTerminalDimensions();

  // Chrome per row: outer paddingX (2) + group separator (2) + n marginRights.
  // Column width already includes its own border + paddingX (Ink uses border-box).
  const numColumns = rawBoard.columns.length;
  const colWidth = numColumns > 0
    ? Math.max(MIN_COLUMN_WIDTH, Math.min(MAX_COLUMN_WIDTH, Math.floor((termCols - 4 - numColumns) / numColumns)))
    : MIN_COLUMN_WIDTH;

  // Build slug → worktree session lookup for this project
  const sessionMap = React.useMemo(() => {
    const map = new Map<string, WorktreeInfo>();
    for (const w of worktrees) {
      if (w.project !== project) continue;
      if (!w.feature) continue;
      map.set(w.feature, w);
    }
    return map;
  }, [worktrees, project]);

  const getWorktreeForItem = React.useCallback(
    (item: TrackerItem): WorktreeInfo | null => sessionMap.get(item.slug) ?? null,
    [sessionMap]
  );

  const getSessionForItem = React.useCallback((item: TrackerItem): WorktreeInfo | null => {
    const w = sessionMap.get(item.slug);
    return (w?.session?.ai_status && w.session.ai_status !== 'not_running') ? w : null;
  }, [sessionMap]);

  // Worktrees that aren't backed by a tracker item show up as orphan items in the
  // implement column so users can still see and attach to them from the board.
  const board = React.useMemo<TrackerBoard>(() => {
    const knownSlugs = new Set<string>();
    for (const col of rawBoard.columns) for (const it of col.items) knownSlugs.add(it.slug);

    const orphans: TrackerItem[] = [];
    for (const w of worktrees) {
      if (w.project !== project) continue;
      if ((w as any).is_workspace || (w as any).is_workspace_header) continue;
      if (knownSlugs.has(w.feature)) continue;
      orphans.push({
        slug: w.feature,
        title: w.feature,
        project: w.project,
        projectPath,
        bucket: 'implementation',
        stage: 'implement',
        itemDir: '',
        requirementsPath: '',
        implementationPath: '',
        notesPath: '',
        requirementsBody: '',
        frontmatter: {},
        hasImplementationNotes: false,
        hasNotes: false,
        worktreePath: w.path,
        worktreeExists: true,
        inactive: false,
      });
    }
    if (orphans.length === 0) return rawBoard;
    // Splice orphans before the inactive tail to preserve active-first ordering.
    const newColumns = rawBoard.columns.map(col => {
      if (col.id !== 'implement') return col;
      const firstInactive = col.items.findIndex(it => it.inactive);
      const split = firstInactive === -1 ? col.items.length : firstInactive;
      return {...col, items: [...col.items.slice(0, split), ...orphans, ...col.items.slice(split)]};
    });
    return {...rawBoard, columns: newColumns};
  }, [rawBoard, worktrees, project, projectPath]);

  // useState's initializer loaded the first board; only reload when the project
  // actually changes (effect skips its first run via a ref guard).
  const isFirstMount = React.useRef(true);
  // Skip the first post-mount sync tick so the initial (0,0) render doesn't
  // overwrite a remembered slug before mount-restore has applied. Project switches
  // reset this too so the stale pre-switch item isn't written to the new project.
  const firstSyncRef = React.useRef(true);
  React.useEffect(() => {
    if (isFirstMount.current) {
      isFirstMount.current = false;
    } else {
      const newBoard = service.loadBoard(project, projectPath);
      setBoard(newBoard);
      const savedSlug = getTrackerSelection(project);
      const pos = savedSlug ? findSlugPosition(newBoard, savedSlug) : null;
      if (pos) {
        setSelectedColumn(pos.column);
        setSelectedRowByColumn({[pos.column]: pos.row});
      } else {
        setSelectedColumn(0);
        setSelectedRowByColumn({});
      }
      firstSyncRef.current = true;
    }
    // Resume any pending proposals from disk (survives app restart).
    if (!proposalItems && !proposalGenerating) {
      const pending = service.loadPendingProposals(projectPath);
      if (pending) finishProposalGeneration(pending);
    }
  }, [project, projectPath, service]);

  const hasPendingNew = pendingNew !== null;
  React.useEffect(() => {
    if (!hasPendingNew) return;
    const id = setInterval(() => setSpinnerFrame(f => (f + 1) % SPINNER_CHARS.length), 80);
    return () => clearInterval(id);
  }, [hasPendingNew]);

  // The top-level 60s refresh is too slow to pick up ai_status transitions after
  // a new item's session boots. Poll just this project's worktrees every 2s.
  React.useEffect(() => {
    return startIntervalIfEnabled(() => {
      refreshProjectWorktrees(project).catch(() => {});
    }, VISIBLE_STATUS_REFRESH_DURATION);
  }, [project, refreshProjectWorktrees]);

  // Scope PR auto-refresh to this project's currently-visible worktrees.
  const kanbanWorktreePaths = React.useMemo(
    () => Array.from(sessionMap.values(), w => w.path).sort(),
    [sessionMap],
  );
  React.useEffect(() => {
    setVisibleWorktrees(kanbanWorktreePaths);
  }, [kanbanWorktreePaths, setVisibleWorktrees]);

  // Mount-only: matches against `board` (not rawBoard) so worktree-only orphan items
  // can be restored too.
  React.useEffect(() => {
    const savedSlug = getTrackerSelection(project);
    if (!savedSlug) return;
    const pos = findSlugPosition(board, savedSlug);
    if (!pos) return;
    setSelectedColumn(pos.column);
    setSelectedRowByColumn({[pos.column]: pos.row});
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const reloadBoard = React.useCallback(() => {
    setBoard(service.loadBoard(project, projectPath));
  }, [service, project, projectPath]);

  const currentColumn = board.columns[selectedColumn];
  const currentRow = selectedRowByColumn[selectedColumn] || 0;
  const currentItem = currentColumn?.items[currentRow] || null;

  const currentItemSlug = currentItem?.slug;
  React.useEffect(() => {
    if (firstSyncRef.current) {
      firstSyncRef.current = false;
      return;
    }
    if (currentItemSlug) setTrackerSelection(project, currentItemSlug);
  }, [currentItemSlug, project, setTrackerSelection]);

  const handleVerticalMove = React.useCallback((delta: number) => {
    setSelectedRowByColumn(prev => {
      const items = board.columns[selectedColumn]?.items || [];
      const cur = prev[selectedColumn] || 0;
      const next = items.length === 0 ? 0 : Math.max(0, Math.min(cur + delta, items.length - 1));
      return {...prev, [selectedColumn]: next};
    });
  }, [board.columns, selectedColumn]);

  const handleHorizontalMove = React.useCallback((delta: number) => {
    setSelectedColumn(prev => Math.max(0, Math.min(prev + delta, board.columns.length - 1)));
  }, [board.columns.length]);

  const handleMoveItemNext = React.useCallback(() => {
    if (!currentItem) return;
    const nextStage = service.nextStage(currentItem.stage);
    if (!nextStage) return;
    service.moveItem(projectPath, currentItem.slug, nextStage);
    const newBoard = service.loadBoard(project, projectPath);
    setBoard(newBoard);
    const colItems = newBoard.columns[selectedColumn]?.items || [];
    const newRow = colItems.length === 0 ? 0 : Math.min(currentRow, colItems.length - 1);
    setSelectedRowByColumn(prev => ({...prev, [selectedColumn]: newRow}));
  }, [currentItem, service, projectPath, project, selectedColumn, currentRow]);

  // Actions launched from the kanban board return here, not to the worktree list.
  const backToTracker = React.useCallback(
    () => showTracker({name: project, path: projectPath}),
    [showTracker, project, projectPath]
  );

  const handleAttach = React.useCallback(() => {
    if (!currentItem) return;
    // Orphan items (worktree-only, no tracker entry) need a tracker item before
    // onAttachItem can build a prompt-free attach flow, same as the onSelect handler.
    if (!currentItem.requirementsPath) {
      service.createItem(projectPath, currentItem.title || currentItem.slug, 'implement', currentItem.slug);
      setBoard(service.loadBoard(project, projectPath));
    }
    onAttachItem(currentItem);
  }, [currentItem, onAttachItem, service, projectPath, project]);

  const handleShell = React.useCallback(() => {
    if (!currentItem) return;
    const wt = getWorktreeForItem(currentItem);
    if (!wt) return;
    runWithLoading(() => attachShellSession(wt), {onReturn: backToTracker});
  }, [currentItem, getWorktreeForItem, attachShellSession, runWithLoading, backToTracker]);

  const handleExecuteRun = React.useCallback(() => {
    if (!currentItem) return;
    const wt = getWorktreeForItem(currentItem);
    if (!wt) return;
    runWithLoading(() => attachRunSession(wt), {onReturn: backToTracker});
  }, [currentItem, getWorktreeForItem, attachRunSession, runWithLoading, backToTracker]);

  const handleDiff = React.useCallback((type: 'full' | 'uncommitted') => {
    if (!currentItem) return;
    const wt = getWorktreeForItem(currentItem);
    if (!wt) return;
    showDiffView(wt.path, type, {onReturn: backToTracker});
  }, [currentItem, getWorktreeForItem, showDiffView, backToTracker]);

  const handleArchiveItem = React.useCallback(() => {
    if (!currentItem) return;
    const wt = getWorktreeForItem(currentItem);
    const worktreeInfo = wt ?? new WorktreeInfo({
      project: currentItem.project,
      feature: currentItem.slug,
      path: '',
    });
    showArchiveConfirmation(worktreeInfo, {
      onReturn: backToTracker,
      projectPath: currentItem.projectPath,
    });
  }, [currentItem, getWorktreeForItem, showArchiveConfirmation, backToTracker]);

  const handleToggleInactive = React.useCallback(async () => {
    if (!currentItem) return;
    if (!currentItem.requirementsPath) {
      service.createItem(projectPath, currentItem.title || currentItem.slug, 'implement', currentItem.slug);
    }
    const shouldDeactivate = !currentItem.inactive;
    service.toggleItemInactive(projectPath, currentItem.slug);
    if (shouldDeactivate) {
      await terminateFeatureSessions(currentItem.project, currentItem.slug);
    }
    const newBoard = service.loadBoard(project, projectPath);
    setBoard(newBoard);
    const pos = findSlugPosition(newBoard, currentItem.slug);
    if (pos) {
      setSelectedColumn(pos.column);
      setSelectedRowByColumn(prev => ({...prev, [pos.column]: pos.row}));
    }
  }, [currentItem, service, projectPath, project, terminateFeatureSessions]);

  const unmountedRef = React.useRef(false);
  React.useEffect(() => () => { unmountedRef.current = true; }, []);

  const startDerivation = React.useCallback((pending: PendingNew, tool: AITool | null) => {
    setPendingNew(pending);
    // Reading slugs from disk (rather than the closure-captured board) avoids a
    // stale-read race when the user queues two items back-to-back within the
    // ~5s slug-derivation window.
    const slugsAtStart = new Set(service.loadBoard(project, projectPath).columns.flatMap(c => c.items.map(it => it.slug)));
    service.deriveSlug(pending.title, [...slugsAtStart]).then(slug => {
      if (unmountedRef.current) return;
      setPendingNew(null);
      // Re-check uniqueness right before creating in case a concurrent
      // derivation committed the same slug while this one was in flight.
      const taken = new Set(service.loadBoard(project, projectPath).columns.flatMap(c => c.items.map(it => it.slug)));
      let finalSlug = slug;
      for (let i = 2; taken.has(finalSlug); i++) finalSlug = `${slug}-${i}`;
      service.createItem(projectPath, pending.title, pending.stage, finalSlug);
      const freshBoard = service.loadBoard(project, projectPath);
      setBoard(freshBoard);
      if (!onLaunchItemBackground || !tool) return;
      const item = freshBoard.columns.flatMap(c => c.items).find(i => i.slug === finalSlug);
      if (!item) return;
      onLaunchItemBackground(item, tool).catch(err => {
        logError('launchSessionForItemBackground failed', {error: err instanceof Error ? err.message : String(err)});
      });
    }).catch(err => {
      if (unmountedRef.current) return;
      setPendingNew(null);
      logError('deriveSlug failed', {error: err instanceof Error ? err.message : String(err)});
    });
  }, [service, projectPath, project, onLaunchItemBackground]);

  const handleCreateSubmit = React.useCallback(() => {
    const title = createTitle.trim();
    setCreateMode(false);
    setCreateTitle('');
    if (!title || !service.slugify(title)) return;

    const stage = (currentColumn?.id || 'backlog') as TrackerStage;
    const pending: PendingNew = {title, stage, columnIndex: selectedColumn};

    if (onLaunchItemBackground && availableTools.length > 1) {
      setToolPickPending(pending);
    } else {
      const defaultTool: AITool | null = availableTools[0] ?? null;
      startDerivation(pending, onLaunchItemBackground ? defaultTool : null);
    }
  }, [createTitle, service, currentColumn, selectedColumn, availableTools, onLaunchItemBackground, startDerivation]);

  const handleToolSelect = React.useCallback((tool: AITool) => {
    if (!toolPickPending) return;
    const pending = toolPickPending;
    setToolPickPending(null);
    startDerivation(pending, tool);
  }, [toolPickPending, startDerivation]);

  const handleToolCancel = React.useCallback(() => {
    setToolPickPending(null);
  }, []);

  const handleProposalSubmit = React.useCallback(() => {
    if (proposalGenerating) return;
    const prompt = proposalPrompt.trim();
    setProposalInputMode(false);
    setProposalPrompt('');
    startProposalGeneration();
    void (async () => {
      const tracker = new TrackerService();
      const result = await tracker.generateProposals(project, projectPath, prompt || undefined);
      finishProposalGeneration(result.proposals || null, result.success ? undefined : result.error);
    })();
  }, [proposalPrompt, proposalGenerating, startProposalGeneration, finishProposalGeneration, project, projectPath]);

  const handleProposalKey = React.useCallback(() => {
    if (proposalGenerating) return;
    if (proposalItems) { showProposals(); return; }
    setProposalInputMode(true);
  }, [proposalGenerating, proposalItems, showProposals]);

  useInput((input, key) => {
    if (!createMode) return;
    if (key.return) { handleCreateSubmit(); }
    else if (key.escape) { setCreateMode(false); setCreateTitle(''); }
    else if (key.backspace || key.delete) { setCreateTitle(prev => prev.slice(0, -1)); }
    else if (!key.ctrl && !key.meta && input && input.length === 1) { setCreateTitle(prev => prev + input); }
  });

  useInput((input, key) => {
    if (!proposalInputMode) return;
    if (key.return) { handleProposalSubmit(); }
    else if (key.escape) { setProposalInputMode(false); setProposalPrompt(''); }
    else if (key.backspace || key.delete) { setProposalPrompt(prev => prev.slice(0, -1)); }
    else if (!key.ctrl && !key.meta && input && input.length === 1) { setProposalPrompt(prev => prev + input); }
  });

  const inputActive = createMode || proposalInputMode || pickerMode || !!toolPickPending;
  const currentItemSession = currentItem ? getSessionForItem(currentItem) : null;
  const currentItemWorktree = currentItem ? getWorktreeForItem(currentItem) : null;
  const hasWorktree = !!currentItemWorktree;

  useKeyboardShortcuts({
    onMove: handleVerticalMove,
    onMoveHorizontal: handleHorizontalMove,
    onSelect: () => {
      if (!currentItem) return;
      // Orphan items (worktree-only, no tracker entry) have empty requirementsPath.
      // Materialize a real tracker item — keyed by the worktree's slug — so the item
      // screen has something to load and the user can manage it like any other item.
      if (!currentItem.requirementsPath) {
        service.createItem(projectPath, currentItem.title || currentItem.slug, 'implement', currentItem.slug);
        setBoard(service.loadBoard(project, projectPath));
      }
      onOpenItem(currentItem);
    },
    onAttach: currentItem ? handleAttach : undefined,
    onCreate: () => setCreateMode(true),
    onMoveItemNext: handleMoveItemNext,
    onToggleInactive: currentItem ? handleToggleInactive : undefined,
    onGenerateProposals: handleProposalKey,
    onStagesConfig: onCustomizeStages,
    onPickProject: () => setPickerMode(true),
    onShell: hasWorktree ? handleShell : undefined,
    onExecuteRun: hasWorktree ? handleExecuteRun : undefined,
    onDiff: hasWorktree ? () => handleDiff('full') : undefined,
    onDiffUncommitted: hasWorktree ? () => handleDiff('uncommitted') : undefined,
    onArchive: currentItem ? handleArchiveItem : undefined,
    // `t` toggles between tracker and worktree list. Symmetric with `t` on the
    // worktree list which routes to the tracker.
    onTracker: showList,
    onSettings: () => showSettings(project, {onReturn: backToTracker}),
    onQuit: onBack,
  }, {enabled: !inputActive});

  const proposalStatus = (() => {
    if (proposalGenerating) return {text: '⟳ Generating proposals…', color: 'yellow'} as const;
    if (proposalError) return {text: `! Proposals failed: ${proposalError}  ·  [p] retry`, color: 'red'} as const;
    if (proposalItems) return {text: `${proposalItems.length} proposals ready  ·  [p] to review`, color: 'green'} as const;
    return null;
  })();

  // Read each item's status.json once per worktree refresh and reuse for both
  // the title-bar tally and the per-card render loop. Memoized on
  // `[board, worktrees]` so keystroke re-renders don't replay disk reads;
  // status.json updates land on the next refresh tick, matching the rest of
  // the kanban's refresh cadence.
  const itemStatusBySlug = React.useMemo(() => {
    const map = new Map<string, ReturnType<TrackerService['getItemStatus']>>();
    for (const col of board.columns) {
      for (const item of col.items) {
        map.set(item.slug, service.getItemStatus(projectPath, item.slug));
      }
    }
    return map;
    // `worktrees` isn't read inside the memo body — it's the refresh tick we
    // re-run on, since session state changes alongside it.
  }, [board, worktrees, service, projectPath]);

  // When the picker is open, render it full-screen instead of the board. The board
  // fills terminal height with its columns, so anything rendered below gets clipped.
  // discoverProjects does sync filesystem work; cache it across re-renders.
  const pickerProjects = React.useMemo(() => pickerMode ? discoverProjects() : [], [pickerMode, discoverProjects]);
  if (pickerMode) {
    return (
      <Box flexDirection="column" flexGrow={1} paddingX={1} paddingY={1}>
        <TrackerProjectPickerDialog
          projects={pickerProjects}
          worktrees={worktrees}
          currentProjectName={project}
          onCancel={() => setPickerMode(false)}
          onSelect={(p) => { setPickerMode(false); showTracker(p); }}
        />
      </Box>
    );
  }

  if (toolPickPending) {
    return (
      <Box flexDirection="column" flexGrow={1} alignItems="center" justifyContent="center">
        <AIToolDialog
          availableTools={availableTools}
          onSelect={handleToolSelect}
          onCancel={handleToolCancel}
        />
      </Box>
    );
  }

  let waitingCount = 0;
  let workingCount = 0;
  for (const col of board.columns) {
    for (const item of col.items) {
      const wt = getWorktreeForItem(item);
      const itemStatus = itemStatusBySlug.get(item.slug) ?? null;
      const flags = computeCardStatusFlags({
        aiStatus: wt?.session?.ai_status,
        prMerged: isItemPRMerged(wt, pullRequests),
        freshWaiting: service.isItemWaiting(itemStatus),
        freshReady: service.isItemReadyToAdvance(itemStatus),
      });
      if (flags.isWaiting) waitingCount++;
      else if (flags.isWorking) workingCount++;
    }
  }

  // Column height = termRows minus all vertical chrome:
  //   1 title row + 1 footer row + footerStatusRow (optional)
  //   + 1 reserved by FullScreen (prevents terminal scroll)
  //   + 1 margin (keeps content from touching the edge)
  const footerStatusRow = proposalStatus ? 1 : 0;
  const colHeight = Math.max(5, termRows - (4 + footerStatusRow));

  // Group columns
  const planColIndices: number[] = [];
  const implColIndices: number[] = [];
  board.columns.forEach((col, i) => {
    if (col.bucket === 'backlog') planColIndices.push(i);
    else if (col.bucket === 'implementation') implColIndices.push(i);
  });

  // Per-column space available for items (after the box's chrome). Subtract one extra
  // row when createMode is active to leave room for the inline composer.
  const itemAreaRows = Math.max(ROWS_PER_ITEM, colHeight - COLUMN_CHROME_ROWS);
  const visibleItemSlots = Math.max(1, Math.floor(itemAreaRows / ROWS_PER_ITEM));
  // When scrolling, indicators take ~2 extra rows; reserve them up front so we don't
  // accidentally render past the column's height.
  const scrollVisibleSlots = Math.max(1, Math.floor((itemAreaRows - 2) / ROWS_PER_ITEM));

  // Each column in a group is rendered at colWidth + 1 marginRight, so a group of N
  // columns spans N * (colWidth + 1). Pinning the group Box to that width stops the
  // header row from expanding the group when the label+dashes would otherwise overflow,
  // which was pushing one group's columns down and breaking alignment with the other.
  const groupWidthFor = (count: number) => count * (colWidth + 1);

  const renderGroup = (colIndices: number[]) => {
    if (colIndices.length === 0) return null;
    const width = groupWidthFor(colIndices.length);
    return (
      <Box flexDirection="row" width={width} flexShrink={0}>
        {colIndices.map(i => renderColumn(i))}
      </Box>
    );
  };

  const renderColumn = (columnIndex: number) => {
    const column = board.columns[columnIndex];
    const selectedRow = selectedRowByColumn[columnIndex] || 0;
    const isActiveColumn = selectedColumn === columnIndex;
    const accent = column.bucket === 'backlog' ? PLAN_COLOR : IMPL_COLOR;

    const total = column.items.length;
    const overflows = total > visibleItemSlots;
    const visibleCount = overflows ? scrollVisibleSlots : visibleItemSlots;
    const scrollTop = overflows ? computeColumnScroll(selectedRow, total, visibleCount) : 0;
    const visibleItems = column.items.slice(scrollTop, scrollTop + visibleCount);
    const moreAbove = scrollTop;
    const moreBelow = Math.max(0, total - (scrollTop + visibleCount));

    // Title shares the header line with the count. Inside paddingX={1} the usable
    // width is colWidth - 4 (2 border + 2 paddingX); the count takes its digits + 1 gap.
    const countText = String(total);
    const titleMax = Math.max(4, colWidth - 4 - countText.length - 1);
    const titleText = truncateDisplay(column.title, titleMax);

    return (
      <Box
        key={column.id}
        flexDirection="column"
        borderStyle="round"
        borderColor={isActiveColumn ? accent : 'gray'}
        width={colWidth}
        height={colHeight}
        paddingX={1}
        marginRight={1}
        flexShrink={0}
      >
        {/* Column header: title left, count right */}
        <Box justifyContent="space-between" flexShrink={0}>
          <Text bold color={isActiveColumn ? accent : 'white'} wrap="truncate">
            {titleText}
          </Text>
          <Text dimColor>{countText}</Text>
        </Box>

        {/* Items area */}
        <Box flexDirection="column" flexGrow={1} overflow="hidden">
          {moreAbove > 0 && (
            <Text dimColor>{`  ↑ ${moreAbove} more`}</Text>
          )}

          {visibleItems.map((item, sliceIndex) => {
            const itemIndex = scrollTop + sliceIndex;
            const isSelected = isActiveColumn && selectedRow === itemIndex;
            const wt = getWorktreeForItem(item);
            const aiStatus: AIStatus | undefined = wt?.session?.ai_status;
            const itemStatus = itemStatusBySlug.get(item.slug) ?? null;
            const prMerged = isItemPRMerged(wt, pullRequests);
            const {readyToAdvance, isWaiting, isWorking, hasSession} =
              computeCardStatusFlags({
                aiStatus,
                prMerged,
                freshWaiting: service.isItemWaiting(itemStatus),
                freshReady: service.isItemReadyToAdvance(itemStatus),
              });

            // Session presence is now signalled by the running-status chip row
            // (rendered separately below); the ◆ branch in
            // getTrackerCardDisplayState is dropped to avoid duplicating that
            // signal.
            const display = getTrackerCardDisplayState({
              prMerged,
              readyToAdvance,
              isWaiting,
              isWorking,
              hasSession,
              inactive: item.inactive,
              itemStatusDescription: itemStatus?.brief_description,
            });
            const runningChips = computeRunningChips(wt);

            // Slug row eats: 2 (border) + 2 (paddingX) + 2 (cursor) + 2 (status glyph) = 8 chars
            const slug = truncateDisplay(item.slug, Math.max(4, colWidth - 8));
            // Secondary row eats: 2 (border) + 2 (paddingX) + 4 (indent) = 8 chars
            const secMax = Math.max(4, colWidth - 8);
            const secondary = !hasSession ? renderSecondary(item) : '';

            return (
              <Box key={item.slug} flexDirection="column" marginBottom={1} flexShrink={0}>
                {/* Slug row: cursor + status + name */}
                <Box>
                  <Text color={accent} bold>{isSelected ? '▸ ' : '  '}</Text>
                  <Text color={display.statusColor} bold={display.titleBold}>{display.statusGlyph} </Text>
                  <Text
                    inverse={isSelected}
                    color={!isSelected ? display.titleColor : undefined}
                    bold={display.titleBold || isSelected}
                    dimColor={item.inactive && !isSelected}
                    wrap="truncate"
                  >
                    {slug}
                  </Text>
                </Box>
                {/* Status / secondary text — wraps to SECONDARY_MAX_LINES so
                    long brief_descriptions from the agent stay readable. */}
                {(() => {
                  const text = display.secondaryText || secondary || '';
                  if (!text) return null;
                  // Focused card gets more lines so the full (up to 200-char)
                  // brief_description is readable; other cards stay compact.
                  // Chip row eats one of those lines when present.
                  const baseMax = isSelected ? 4 : SECONDARY_MAX_LINES;
                  const maxLines = Math.max(1, baseMax - (runningChips.length > 0 ? 1 : 0));
                  const lines = wrapToLines(text, secMax, maxLines);
                  return lines.map((line, lineIdx) => (
                    <Text
                      key={lineIdx}
                      color={display.secondaryColor}
                      bold={display.secondaryBold}
                      dimColor={display.secondaryDim}
                      wrap="truncate"
                    >
                      {`    ${line}`}
                    </Text>
                  ));
                })()}
                {/* Dedicated approve-hint row — only when this card is the
                    selected one and ready for approval. Keeping it on its
                    own line (rather than suffixing the brief_description)
                    makes the shortcut visible even when the description
                    wraps to two lines. */}
                {display.showApproveHint && isSelected && (
                  <Text color="green" bold>
                    {`    press [m] to approve and advance`}
                  </Text>
                )}
                {/* Running-status chips: one per active tmux session, rendered
                    last so the card's textual signals (ready/waiting/working)
                    stay above. Indented to match the secondary-text gutter.
                    Eats one of the four rows budgeted per item, so secondary
                    maxLines drops by 1 when chips render to keep scroll math
                    intact. */}
                {runningChips.length > 0 && (
                  <Box marginLeft={4}>
                    {runningChips.map((chip, idx) => (
                      <React.Fragment key={chip.label}>
                        {idx > 0 && <Text> </Text>}
                        <StatusChip label={chip.label} color={chip.color} fg="white" />
                      </React.Fragment>
                    ))}
                  </Box>
                )}
              </Box>
            );
          })}

          {moreBelow > 0 && (
            <Text dimColor>{`  ↓ ${moreBelow} more`}</Text>
          )}

          {pendingNew?.columnIndex === columnIndex && (
            <Box flexDirection="column" marginBottom={1} flexShrink={0}>
              <Box>
                <Text color={accent} bold>{'  '}</Text>
                <Text color="yellow" bold>{SPINNER_CHARS[spinnerFrame]} </Text>
                <Text color="yellow" wrap="truncate">{truncateDisplay(pendingNew.title, Math.max(4, colWidth - 8))}</Text>
              </Box>
              <Text color="yellow" wrap="truncate">{`    ${truncateDisplay('deriving slug…', Math.max(4, colWidth - 8))}`}</Text>
            </Box>
          )}

          {total === 0 && !pendingNew && !(inputActive && isActiveColumn) && (
            <Text dimColor>  (empty)</Text>
          )}

          {createMode && isActiveColumn && (
            <Text color="yellow">+ {createTitle}<Text color="green">█</Text></Text>
          )}
        </Box>
      </Box>
    );
  };

  return (
    <Box flexDirection="column" flexGrow={1} paddingX={1} paddingY={0}>
      {/* Title bar — project name plus inline session-status summary so we don't burn
          three rows on a separate banner box. */}
      <Box flexShrink={0}>
        <Text bold color="cyan">{project}</Text>
        <Text dimColor>  ·  tracker</Text>
        {waitingCount > 0 && (
          <Text color="yellow" bold>
            {`  ·  ! ${waitingCount} waiting`}
            {workingCount > 0 ? ` · ${workingCount} running` : ''}
          </Text>
        )}
        {waitingCount === 0 && workingCount > 0 && (
          <Text color="cyan">{`  ·  ⟳ ${workingCount} running`}</Text>
        )}
      </Box>

      {/* Board — column borders/colors carry the planning vs implementation cue, so
          the dedicated group-label row is dropped. */}
      <Box flexDirection="row" alignItems="flex-start" flexShrink={0}>
        {renderGroup(planColIndices)}

        {/* Vertical separator between groups */}
        <Box
          flexDirection="column"
          borderStyle="single"
          borderColor="gray"
          borderTop={false}
          borderBottom={false}
          borderRight={false}
          marginRight={1}
          flexGrow={1}
          flexShrink={0}
        />

        {renderGroup(implColIndices)}
      </Box>

      {/* Footer — no marginTop; the column borders themselves give visual breathing room. */}
      <Box flexDirection="column" flexShrink={0}>
        {createMode && (
          <Text color="yellow">enter to create  ·  esc to cancel</Text>
        )}
        {proposalInputMode && (
          <Box flexDirection="column">
            <Text color="yellow">Proposal focus (optional — enter to skip):</Text>
            <Text color="yellow">  {proposalPrompt || ' '}<Text color="green">█</Text>  <Text dimColor>  ·  enter to generate  ·  esc to cancel</Text></Text>
          </Box>
        )}
        {!inputActive && proposalStatus && (
          <Text color={proposalStatus.color}>{proposalStatus.text}</Text>
        )}
        {!inputActive && (
          <Footer
            hasSession={!!currentItemSession}
            hasWorktree={hasWorktree}
            hasItem={!!currentItem}
            inactive={!!currentItem?.inactive}
          />
        )}
      </Box>
    </Box>
  );
}

const Footer = React.memo(function Footer({hasSession, hasWorktree, hasItem, inactive}: {hasSession: boolean; hasWorktree: boolean; hasItem: boolean; inactive: boolean}) {
  const sep = <Text dimColor>  ·  </Text>;
  return (
    <Box>
      <Text dimColor>nav </Text>
      <Text color="magenta">←/→</Text>
      <Text dimColor> cols </Text>
      <Text color="magenta">↑/↓</Text>
      <Text dimColor> items</Text>
      {sep}
      <Text color="magenta">↵</Text>
      <Text dimColor> open</Text>
      {hasItem && (
        <>
          <Text>  </Text>
          <Text color={hasSession ? 'yellow' : 'magenta'} bold={hasSession}>a</Text>
          <Text color={hasSession ? 'yellow' : undefined} dimColor={!hasSession}> attach</Text>
        </>
      )}
      {hasWorktree && (
        <>
          {sep}
          <Text color="magenta">s</Text>
          <Text dimColor> shell</Text>
          <Text>  </Text>
          <Text color="magenta">x</Text>
          <Text dimColor> run</Text>
          <Text>  </Text>
          <Text color="magenta">d</Text>
          <Text dimColor> diff</Text>
        </>
      )}
      {hasItem && (
        <>
          <Text>  </Text>
          <Text dimColor>archi</Text>
          <Text color="magenta">v</Text>
          <Text dimColor>e</Text>
        </>
      )}
      {sep}
      <Text color="magenta">n</Text>
      <Text dimColor> new</Text>
      <Text>  </Text>
      <Text color="magenta">m</Text>
      <Text dimColor> advance</Text>
      {hasItem && (
        <>
          <Text>  </Text>
          <Text color="magenta">i</Text>
          <Text dimColor>{inactive ? ' activate' : ' inactive'}</Text>
        </>
      )}
      {sep}
      <Text color="magenta">p</Text>
      <Text dimColor> proposals</Text>
      <Text>  </Text>
      <Text color="magenta">e</Text>
      <Text dimColor> stages</Text>
      <Text>  </Text>
      <Text color="magenta">c</Text>
      <Text dimColor> config</Text>
      <Text>  </Text>
      <Text color="magenta">P</Text>
      <Text dimColor> switch project</Text>
      <Text>  </Text>
      <Text color="magenta">t</Text>
      <Text dimColor> worktrees</Text>
      <Text>  </Text>
      <Text color="magenta">q</Text>
      <Text dimColor> back</Text>
    </Box>
  );
});

function renderSecondary(item: TrackerItem): string {
  if (item.hasImplementationNotes) return 'has impl notes';
  if (item.worktreeExists) return 'worktree exists';
  if (!item.requirementsBody.trim()) return 'needs requirements';
  return '';
}
