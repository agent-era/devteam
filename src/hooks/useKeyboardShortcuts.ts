import {useEffect} from 'react';
import {useStdin} from 'ink';
import {useInputFocus} from '../contexts/InputFocusContext.js';

export interface KeyboardActions {
  onMove?: (delta: number) => void;
  onSelect?: () => void;
  onCreate?: () => void;
  onArchive?: () => void;
  onRefresh?: () => void;
  onHelp?: () => void;
  onBranch?: () => void;
  onShell?: () => void;
  onDiff?: () => void;
  onDiffUncommitted?: () => void;
  onPreviousPage?: () => void;
  onNextPage?: () => void;
  onJumpToFirst?: () => void;
  onJumpToLast?: () => void;
  onMoveHorizontal?: (delta: number) => void;
  onQuit?: () => void;
  onNumberSelect?: (number: number) => void;
  onExecuteRun?: () => void;
  onSelectWithToolPicker?: () => void;
  onSettings?: () => void;
  onUpdate?: () => void;
  onTracker?: () => void;
  onToggleInactive?: () => void;
  onGenerateProposals?: () => void;
  onStagesConfig?: () => void;
  onAttach?: () => void;
  onPickProject?: () => void;
}

export interface KeyboardShortcutsOptions {
  enabled?: boolean;
  page?: number;
  pageSize?: number;
  selectedIndex?: number;
  totalItems?: number;
}

export function handleKeyboardShortcutInput(
  actions: KeyboardActions,
  input: string,
  options: Required<Pick<KeyboardShortcutsOptions, 'page' | 'pageSize' | 'selectedIndex' | 'totalItems'>> = {
    page: 0,
    pageSize: 20,
    selectedIndex: 0,
    totalItems: 0,
  }
) {
  const {page, pageSize, selectedIndex, totalItems} = options;

  // Navigation
  if (input === 'j' || input === '\u001b[B') { // j or down arrow
    actions.onMove?.(1);
  } else if (input === 'k' || input === '\u001b[A') { // k or up arrow
    actions.onMove?.(-1);
  } else if (input === 'h' || input === '\u001b[D') { // h or left arrow
    actions.onMoveHorizontal?.(-1);
  } else if (input === 'l' || input === '\u001b[C') { // l or right arrow
    actions.onMoveHorizontal?.(1);
  } else if (input === '\u001b[13;2u') { // Shift+Enter (CSI-u capable terminals)
    actions.onSelectWithToolPicker?.();
  } else if (input === '\r' || input === '\n') { // Enter
    actions.onSelect?.();
  } else if (input === 'q' || input === '\u001b') { // q or Escape
    actions.onQuit?.();
  }

  // Actions
  else if (input === 'n') actions.onCreate?.();
  else if (input === 'a') { if (actions.onAttach) actions.onAttach(); else actions.onSelect?.(); }
  else if (input === 'v') actions.onArchive?.();
  else if (input === 'r') actions.onRefresh?.();
  else if (input === '?') actions.onHelp?.();
  else if (input === 'b') actions.onBranch?.();
  else if (input === 's') actions.onShell?.();
  else if (input === 'd') actions.onDiff?.();
  else if (input === 'D') actions.onDiffUncommitted?.();
  else if (input === 'x') actions.onExecuteRun?.();
  else if (input === 'T') actions.onSelectWithToolPicker?.();
  else if (input === 'c') actions.onSettings?.();
  else if (input === 't') actions.onTracker?.();
  else if (input === 'i') actions.onToggleInactive?.();
  else if (input === 'p') actions.onGenerateProposals?.();
  else if (input === 'e') actions.onStagesConfig?.();
  else if (input === 'P') actions.onPickProject?.();

  // Pagination
  else if (input === '<' || input === ',') actions.onPreviousPage?.();
  else if (input === '>' || input === '.') actions.onNextPage?.();

  // Number selection (1-9)
  else if (/^[1-9]$/.test(input)) {
    const number = Number(input) - 1;
    const absoluteIndex = (page * pageSize) + number;
    if (absoluteIndex < totalItems) {
      const delta = absoluteIndex - selectedIndex;
      actions.onMove?.(delta);
    }
  }

  // Page navigation keys
  else if (input === '\u001b[6~' || input === ' ') { // Page Down or Space
    const half = Math.max(1, Math.floor(pageSize / 2));
    actions.onMove?.(half);
  } else if (input === '\u001b[5~') { // Page Up
    const half = Math.max(1, Math.floor(pageSize / 2));
    actions.onMove?.(-half);
  }

  // Home and End keys for first/last item
  else if (input === '\u001b[H' || input === '\u001b[1~') { // Home
    actions.onJumpToFirst?.();
  } else if (input === '\u001b[F' || input === '\u001b[4~') { // End
    actions.onJumpToLast?.();
  }
}

export function useKeyboardShortcuts(
  actions: KeyboardActions,
  options: KeyboardShortcutsOptions = {}
) {
  const {stdin, setRawMode} = useStdin();
  const {hasFocus, requestFocus, isAnyDialogFocused} = useInputFocus();
  const {
    enabled = true,
    page = 0,
    pageSize = 20,
    selectedIndex = 0,
    totalItems = 0
  } = options;

  useEffect(() => {
    if (!enabled) return;

    // Request focus for main shortcuts if no dialog is focused
    if (!isAnyDialogFocused) {
      requestFocus('main');
    }

    setRawMode(true);

    const handler = (buf: Buffer) => {
      // Only process input if we have focus and no dialog is focused
      if (isAnyDialogFocused || !hasFocus('main')) {
        return;
      }

      handleKeyboardShortcutInput(actions, buf.toString('utf8'), {
        page,
        pageSize,
        selectedIndex,
        totalItems,
      });
    };

    stdin.on('data', handler);

    return () => {
      stdin.off('data', handler);
      setRawMode(false);
    };
  }, [
    enabled,
    actions,
    page,
    pageSize,
    selectedIndex,
    totalItems,
    stdin,
    setRawMode,
    hasFocus,
    requestFocus,
    isAnyDialogFocused
  ]);

  return {
    enabled
  };
}
