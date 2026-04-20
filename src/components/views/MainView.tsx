import React, {useMemo, useCallback, useEffect} from 'react';
import {Box} from 'ink';
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
import {calculateMainViewPageSize} from '../../shared/utils/layout.js';

type Prompt = {title?: string; text?: string; hint?: string};

interface Props {
  worktrees: WorktreeInfo[];
  selectedIndex: number;
  onMove?: (delta: number) => void;
  onSelect?: (index: number) => void;
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

const HEADER_TEXT = '[a]gent, [s]hell, e[x]ec, [n]ew, [t]racker, archi[v]e, [d]iff, [?]help, [q]uit';

export default function MainView({
  worktrees,
  selectedIndex,
  mode,
  prompt,
  message,
  page = 0,
  onMeasuredPageSize,
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

  const pageSize = useMemo(() => calculateMainViewPageSize(terminalRows, terminalWidth, {
    hasMemoryWarning: !!memoryStatus && memoryStatus.severity !== 'ok',
    hasUpdateBanner: !!versionInfo?.hasUpdate,
  }), [terminalRows, terminalWidth, memoryStatus, versionInfo]);

  const columnWidths = useColumnWidths(worktrees, terminalWidth, page, pageSize);

  const paginationInfo = useMemo(() =>
    calculatePaginationInfo(worktrees.length, page, pageSize),
    [worktrees.length, page, pageSize]
  );

  const pageItems = useMemo(() => {
    if (!worktrees || worktrees.length === 0) return [];
    const start = page * pageSize;
    return worktrees.slice(start, start + pageSize);
  }, [worktrees, page, pageSize]);

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

  useEffect(() => {
    if (pageSize > 0) onMeasuredPageSize?.(pageSize);
  }, [pageSize, onMeasuredPageSize]);

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
      {renderUpdateBanner}
      {renderMemoryWarning}
      <TableHeader columnWidths={columnWidths} />
      <Box flexDirection="column">
        {pageItems.map((worktree, index) => {
          const globalIndex = page * pageSize + index;
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
