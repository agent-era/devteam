import {useEffect} from 'react';
import {useStdin} from 'ink';
import {useInputFocus} from '../contexts/InputFocusContext.js';

export interface KeyboardActions {
  onMove?: (delta: number) => void;
  onSelect?: () => void;
  onCreate?: () => void;
  onArchive?: () => void;
  onRefresh?: () => void;
  onViewArchived?: () => void;
  onHelp?: () => void;
  onBranch?: () => void;
  onShell?: () => void;
  onDiff?: () => void;
  onDiffUncommitted?: () => void;
  onPreviousPage?: () => void;
  onNextPage?: () => void;
  onQuit?: () => void;
  onNumberSelect?: (number: number) => void;
  onExecuteRun?: () => void;
  onConfigureRun?: () => void;
}

export interface KeyboardShortcutsOptions {
  enabled?: boolean;
  page?: number;
  pageSize?: number;
  selectedIndex?: number;
  totalItems?: number;
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

      const input = buf.toString('utf8');

      // Navigation
      if (input === 'j' || input === '\u001b[B') { // j or down arrow
        actions.onMove?.(1);
      } else if (input === 'k' || input === '\u001b[A') { // k or up arrow
        actions.onMove?.(-1);
      } else if (input === '\r') { // Enter
        actions.onSelect?.();
      } else if (input === 'q' || input === '\u001b') { // q or Escape
        actions.onQuit?.();
      }

      // Actions
      else if (input === 'n') actions.onCreate?.();
      else if (input === 'a') actions.onArchive?.();
      else if (input === 'r') actions.onRefresh?.();
      else if (input === 'v') actions.onViewArchived?.();
      else if (input === '?') actions.onHelp?.();
      else if (input === 'b') actions.onBranch?.();
      else if (input === 's') actions.onShell?.();
      else if (input === 'd') actions.onDiff?.();
      else if (input === 'D') actions.onDiffUncommitted?.();
      else if (input === 'x') actions.onExecuteRun?.();
      else if (input === 'X') actions.onConfigureRun?.();

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
      else if (input === '\u001b[6~') { // Page Down
        actions.onMove?.(pageSize);
      } else if (input === '\u001b[5~') { // Page Up  
        actions.onMove?.(-pageSize);
      }
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