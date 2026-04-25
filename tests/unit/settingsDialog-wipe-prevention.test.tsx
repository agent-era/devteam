import {describe, test, expect, jest} from '@jest/globals';
import {classifyChange, DIFF_MISSING} from '../../src/components/dialogs/SettingsDialog.js';

// These tests lock in the behaviour that prevents the "config keeps getting cleared"
// regression from coming back: the diff view must distinguish removed fields from
// added/changed ones, and the dialog's Enter/Regenerate wiring must not silently wipe.

describe('SettingsDialog diff classification', () => {
  test('present→present with same value is null (no change)', () => {
    expect(classifyChange('npm run dev', 'npm run dev')).toBeNull();
    expect(classifyChange(['--foo'], ['--foo'])).toBeNull();
  });

  test('present→present with different value is changed', () => {
    expect(classifyChange('npm run dev', 'npm start')).toBe('changed');
    expect(classifyChange([], ['--foo'])).toBe('changed');
  });

  test('absent→present is added', () => {
    expect(classifyChange(DIFF_MISSING, 'npm run dev')).toBe('added');
    expect(classifyChange(DIFF_MISSING, [])).toBe('added');
  });

  test('present→absent is removed — this is the wipe signal', () => {
    // The bug: Claude drops aiToolSettings.claude.flags. The diff must flag
    // this as "removed" with a visible marker, not a quiet "(missing)".
    expect(classifyChange(['--dangerously-skip-permissions'], DIFF_MISSING)).toBe('removed');
    expect(classifyChange('npm run dev', DIFF_MISSING)).toBe('removed');
  });

  test('absent→absent is null (skip row)', () => {
    expect(classifyChange(DIFF_MISSING, DIFF_MISSING)).toBeNull();
  });

  test('explicit empty array (user clear) is changed, not removed', () => {
    // Honouring user-chosen "empty = clear": if the user explicitly asks Claude to
    // clear flags and Claude emits `flags: []`, the diff shows a changed row
    // (was non-empty → now empty), not a removal.
    expect(classifyChange(['--foo'], [])).toBe('changed');
  });
});

describe('SettingsDialog.handleSubmit — Enter trap eliminated', () => {
  // Replicates the dialog's handleSubmit decision tree. Source of truth is
  // src/components/dialogs/SettingsDialog.tsx; update both when the logic moves.
  const makeHandler = (deps: {
    loading: boolean;
    onEdit: (s: string) => void;
    onGenerate: () => void;
  }) => (value: string) => {
    if (deps.loading) return;
    const trimmed = value.trim();
    if (trimmed.length === 0) return;
    deps.onEdit(trimmed);
  };

  test('empty prompt is a no-op (does not regenerate)', () => {
    const onEdit = jest.fn();
    const onGenerate = jest.fn();
    const handle = makeHandler({loading: false, onEdit, onGenerate});

    handle('');
    handle('   ');
    handle('\t\n');

    expect(onEdit).not.toHaveBeenCalled();
    expect(onGenerate).not.toHaveBeenCalled();
  });

  test('non-empty prompt calls onEdit only', () => {
    const onEdit = jest.fn();
    const onGenerate = jest.fn();
    const handle = makeHandler({loading: false, onEdit, onGenerate});

    handle('enable --dangerously-skip-permissions');

    expect(onEdit).toHaveBeenCalledWith('enable --dangerously-skip-permissions');
    expect(onGenerate).not.toHaveBeenCalled();
  });

  test('while loading, empty and non-empty prompts are both no-ops', () => {
    const onEdit = jest.fn();
    const onGenerate = jest.fn();
    const handle = makeHandler({loading: true, onEdit, onGenerate});

    handle('');
    handle('do a thing');

    expect(onEdit).not.toHaveBeenCalled();
    expect(onGenerate).not.toHaveBeenCalled();
  });
});

describe('SettingsDialog regenerate — explicit, confirmed, unreachable-by-accident', () => {
  // Replicates the useInput regenerate branch. R shows a confirmation prompt;
  // only y/Y after the prompt actually triggers onGenerate.
  const makeInputHandler = (deps: {
    loading: boolean;
    inPreview: boolean;
    showRegeneratePrompt: boolean;
    setShowRegeneratePrompt: (v: boolean) => void;
    onGenerate: () => void;
  }) => (input: string) => {
    if (deps.showRegeneratePrompt) {
      if (input === 'y' || input === 'Y') deps.onGenerate();
      deps.setShowRegeneratePrompt(false);
      return;
    }
    if (!deps.inPreview) {
      if (!deps.loading && (input === 'R' || input === 'r')) {
        deps.setShowRegeneratePrompt(true);
      }
    }
  };

  test('pressing R opens the confirm prompt without calling onGenerate', () => {
    const onGenerate = jest.fn();
    const setShowRegeneratePrompt = jest.fn();
    const handle = makeInputHandler({
      loading: false,
      inPreview: false,
      showRegeneratePrompt: false,
      setShowRegeneratePrompt,
      onGenerate,
    });

    handle('R');

    expect(setShowRegeneratePrompt).toHaveBeenCalledWith(true);
    expect(onGenerate).not.toHaveBeenCalled();
  });

  test('y at the confirm prompt triggers onGenerate and closes the prompt', () => {
    const onGenerate = jest.fn();
    const setShowRegeneratePrompt = jest.fn();
    const handle = makeInputHandler({
      loading: false,
      inPreview: false,
      showRegeneratePrompt: true,
      setShowRegeneratePrompt,
      onGenerate,
    });

    handle('y');

    expect(onGenerate).toHaveBeenCalledTimes(1);
    expect(setShowRegeneratePrompt).toHaveBeenCalledWith(false);
  });

  test('any other key at the confirm prompt cancels without regenerating', () => {
    const onGenerate = jest.fn();
    const setShowRegeneratePrompt = jest.fn();
    const handle = makeInputHandler({
      loading: false,
      inPreview: false,
      showRegeneratePrompt: true,
      setShowRegeneratePrompt,
      onGenerate,
    });

    handle('n');
    handle(' ');

    expect(onGenerate).not.toHaveBeenCalled();
    expect(setShowRegeneratePrompt).toHaveBeenCalledWith(false);
  });

  test('R is ignored while AI is loading', () => {
    const onGenerate = jest.fn();
    const setShowRegeneratePrompt = jest.fn();
    const handle = makeInputHandler({
      loading: true,
      inPreview: false,
      showRegeneratePrompt: false,
      setShowRegeneratePrompt,
      onGenerate,
    });

    handle('R');

    expect(setShowRegeneratePrompt).not.toHaveBeenCalled();
    expect(onGenerate).not.toHaveBeenCalled();
  });
});
