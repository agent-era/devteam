import {describe, expect, test, jest} from '@jest/globals';
import {handleKeyboardShortcutInput} from '../../src/hooks/useKeyboardShortcuts.js';

describe('handleKeyboardShortcutInput', () => {
  test('does not map m to an advance action', () => {
    const onMoveItemNext = jest.fn();

    handleKeyboardShortcutInput(
      {onMoveItemNext: onMoveItemNext as unknown as never} as any,
      'm'
    );

    expect(onMoveItemNext).not.toHaveBeenCalled();
  });

  test('still handles other shortcuts', () => {
    const onCreate = jest.fn();

    handleKeyboardShortcutInput({onCreate}, 'n');

    expect(onCreate).toHaveBeenCalledTimes(1);
  });
});
