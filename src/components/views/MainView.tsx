import React, {useMemo, useCallback, useRef, useEffect, useState} from 'react';
import {Box, measureElement} from 'ink';
import {useMouseRegion} from '../../contexts/MouseContext.js';
import {useListMouseHandler} from '../../hooks/useListMouseHandler.js';
import AnnotatedText from '../common/AnnotatedText.js';
import type {WorktreeInfo} from '../../models.js';
import type {MemoryStatus} from '../../services/MemoryMonitorService.js';
import type {VersionInfo} from '../../services/versionTypes.js';
import {calculatePaginationInfo} from '../../utils/pagination.js';
import {useTerminalDimensions} from '../../hooks/useTerminalDimensions.js';
import {useColumnWidths} from './MainView/hooks/useColumnWidths.js';
import {useGitHubContext} from '../../contexts/GitHubContext.js';
import {WorktreeRow} from './MainView/WorktreeRow.js';
import {WorkspaceGroupRow} from './MainView/WorkspaceGroupRow.js';
import {TableHeader} from './MainView/TableHeader.js';
import {PaginationFooter} from './MainView/PaginationFooter.js';
import {EmptyState} from './MainView/EmptyState.js';
import {MessageView} from './MainView/MessageView.js';
import {PromptView} from './MainView/PromptView.js';
import {getWorktreeKey} from './MainView/utils.js';

type Prompt = {title?: string; text?: string; hint?: string};

interface Props {
  worktrees: WorktreeInfo[];
  selectedIndex: number;
  onMove?: (delta: number) => void;
  onSelect?: (index: number) => void;
  onSelectAt?: (index: number) => void;
  onQuit?: () => void;
  mode?: 'message' | 'prompt';
  prompt?: Prompt;
  message?: string;
  page?: number;
  onMeasuredPageSize?: (pageSize: number) => void;
  memoryStatus?: MemoryStatus | null;
  versionInfo?: VersionInfo | null;
  hasProjects?: boolean;
}

const HEADER_TEXT = '[a]gent, [s]hell, e[x]ec, [n]ew, archi[v]e, [d]iff, [?]help, [q]uit';

export default function MainView({
  worktrees,
  selectedIndex,
  mode,
  prompt,
  message,
  page = 0,
  onMeasuredPageSize,
  onMove,
  onSelect,
  onSelectAt,
  memoryStatus,
  versionInfo,
  hasProjects,
}: Props) {
  const {rows: terminalRows, columns: terminalWidth} = useTerminalDimensions();
  
  // Get PR status data to pass to child components
  let pullRequests: Record<string, any> = {};
  try {
    ({pullRequests} = useGitHubContext() as any);
  } catch {
    // In non-context renders (tests), fall back to empty map
    pullRequests = {} as any;
  }

  // Measure-based calculation to ensure we don't render more rows than fit.
  const listRef = useRef<any>(null);
  const aboveListRef = useRef<any>(null);
  const [measuredPageSize, setMeasuredPageSize] = useState<number>(Math.max(1, worktrees?.length || 1));
  const [aboveListHeight, setAboveListHeight] = useState(0);

  const columnWidths = useColumnWidths(worktrees, terminalWidth, page, measuredPageSize);
  
  // Use measured page size for pagination info to align with what's rendered
  const paginationInfo = useMemo(() => 
    calculatePaginationInfo(worktrees.length, page, measuredPageSize),
    [worktrees.length, page, measuredPageSize]
  );
  
  const pageItems = useMemo(() => {
    if (!worktrees || worktrees.length === 0) return [];
    const start = page * measuredPageSize;
    // Clamp to the measured page size to avoid rendering more rows than fit
    return worktrees.slice(start, start + measuredPageSize);
  }, [worktrees, page, measuredPageSize]);

  const getRowKey = useCallback((worktree: WorktreeInfo, index: number) => 
    getWorktreeKey(worktree, index), []
  );

  const renderMemoryWarning = useMemo(() => {
    if (!memoryStatus || memoryStatus.severity === 'ok') return null;
    const color = memoryStatus.severity === 'critical' ? 'red' : 'yellow';
    const symbol = memoryStatus.severity === 'critical' ? '⛔' : '⚠';
    return (
      <Box marginBottom={1}>
        <AnnotatedText color={color} wrap="truncate" text={`${symbol} ${memoryStatus.message ?? ''}`} />
      </Box>
    );
  }, [memoryStatus]);

  const renderUpdateBanner = useMemo(() => {
    if (!versionInfo || !versionInfo.hasUpdate) return null;
    const whats = versionInfo.whatsNew ? ` — ${versionInfo.whatsNew}` : '';
    const cmd = 'npm install -g @agent-era/devteam';
    const text = `⬆ Update available: v${versionInfo.current} → v${versionInfo.latest}${whats} — press [u] to update (runs: ${cmd})`;
    return (
      <Box marginBottom={1}>
        <AnnotatedText color="cyan" wrap="truncate" text={text} />
      </Box>
    );
  }, [versionInfo]);

  // After render and on resize, measure the list container height to determine how many rows fit
  useEffect(() => {
    const measureAndUpdate = () => {
      const h = listRef.current ? measureElement(listRef.current).height : 0;
      // Always ensure parent knows the measured size at least once.
      // If h equals our initial optimistic value, we still want to propagate it
      // so parent pagination logic (WorktreeListScreen) doesn't use a stale pageSize.
      if (h > 0) {
        if (h !== measuredPageSize) {
          setMeasuredPageSize(h);
          onMeasuredPageSize?.(h);
        } else {
          // Propagate unchanged measurement on first tick to sync parent
          onMeasuredPageSize?.(h);
        }
      }
    };
    // Measure now and on next tick to ensure Yoga layout has settled
    measureAndUpdate();
    const t = setTimeout(measureAndUpdate, 0);
    return () => clearTimeout(t);
    // Re-measure when terminal size changes or item count might affect footer visibility
  }, [terminalRows, terminalWidth, onMeasuredPageSize]);

  // Also propagate when our internal measuredPageSize changes due to any reason
  useEffect(() => {
    if (measuredPageSize > 0) {
      onMeasuredPageSize?.(measuredPageSize);
    }
  }, [measuredPageSize, onMeasuredPageSize]);

  // Use a ref for comparison to avoid including aboveListHeight in its own deps
  const aboveListHeightRef = useRef(0);
  useEffect(() => {
    const measure = () => {
      const h = aboveListRef.current ? measureElement(aboveListRef.current).height : 0;
      if (h !== aboveListHeightRef.current) {
        aboveListHeightRef.current = h;
        setAboveListHeight(h);
      }
    };
    measure();
    const t = setTimeout(measure, 0);
    return () => clearTimeout(t);
  }, [terminalRows, terminalWidth, !!renderUpdateBanner, !!renderMemoryWarning]);

  const handleListMouseDown = useListMouseHandler({
    indexOffset: page * measuredPageSize,
    length: worktrees.length,
    onSelect: (idx) => onMove?.(idx - selectedIndex),
    onActivate: (idx) => { onMove?.(idx - selectedIndex); onSelectAt?.(idx); },
  });

  const handleListScroll = useCallback((direction: 'up' | 'down') => {
    onMove?.(direction === 'up' ? -3 : 3);
  }, [onMove]);

  const isListVisible = mode !== 'message' && mode !== 'prompt' && worktrees.length > 0;
  const listStartY = 1 + aboveListHeight;
  useMouseRegion('main-list', listStartY, isListVisible ? pageItems.length : 0, handleListMouseDown, handleListScroll);

  if (mode === 'message') {
    return <MessageView message={message} />;
  }
  
  if (mode === 'prompt') {
    return <PromptView prompt={prompt} />;
  }
  
  if (!worktrees.length) {
    return <EmptyState hasProjects={hasProjects} />;
  }

  return (
    <Box flexDirection="column" flexGrow={1}>
      <Box ref={aboveListRef} flexDirection="column">
        {renderUpdateBanner}
        {renderMemoryWarning}
        <TableHeader columnWidths={columnWidths} />
      </Box>
      <Box ref={listRef} flexDirection="column" flexGrow={1}>
        {pageItems.map((worktree, index) => {
          const globalIndex = page * measuredPageSize + index;
          const isSelected = globalIndex === selectedIndex;
          
          if ((worktree as any).is_workspace_header) {
            return (
              <WorkspaceGroupRow
                key={`ws-${getWorktreeKey(worktree, index)}`}
                workspace={worktree}
                index={index}
                globalIndex={globalIndex}
                selected={isSelected}
                columnWidths={columnWidths}
              />
            );
          }
          return (
            <WorktreeRow
              key={getWorktreeKey(worktree, index)}
              worktree={worktree}
              index={index}
              globalIndex={globalIndex}
              selected={isSelected}
              columnWidths={columnWidths}
              prStatus={pullRequests?.[worktree.path]}
            />
          );
        })}
      </Box>
      <PaginationFooter
        totalPages={paginationInfo.totalPages}
        paginationText={paginationInfo.paginationText}
      />
      <Box marginTop={1}>
        <AnnotatedText color="magenta" wrap="truncate" text={HEADER_TEXT} />
      </Box>
    </Box>
  );
}
