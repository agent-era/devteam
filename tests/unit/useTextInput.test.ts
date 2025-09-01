/**
 * @jest-environment jsdom
 */
import {describe, beforeEach, test, expect, jest, afterAll} from '@jest/globals';
import {renderHook, act} from '@testing-library/react';
import {useTextInput} from '../../src/components/dialogs/TextInput.js';

// Mock timers for testing debounced behavior
jest.useFakeTimers();

describe('useTextInput Hook', () => {
  beforeEach(() => {
    jest.clearAllTimers();
  });

  afterEach(() => {
    act(() => {
      jest.runOnlyPendingTimers();
    });
  });

  // Helper to wait for debounced updates
  const flushUpdates = () => {
    act(() => {
      jest.advanceTimersByTime(16); // Flush the 16ms debounce
    });
  };

  test('should initialize with empty value and cursor at end', () => {
    const {result} = renderHook(() => useTextInput());
    
    expect(result.current.value).toBe('');
    expect(result.current.cursorPos).toBe(0);
  });

  test('should initialize with provided value and cursor at end', () => {
    const {result} = renderHook(() => useTextInput('hello'));
    
    expect(result.current.value).toBe('hello');
    expect(result.current.cursorPos).toBe(5);
  });

  test('should handle typing at cursor position', () => {
    const {result} = renderHook(() => useTextInput('hello'));
    
    act(() => {
      result.current.handleKeyInput('!', {});
    });
    flushUpdates();
    
    expect(result.current.value).toBe('hello!');
    expect(result.current.cursorPos).toBe(6);
  });

  test('should handle typing in middle of text', () => {
    const {result} = renderHook(() => useTextInput('hello'));
    
    // Move cursor to position 2 (between 'e' and 'l')
    act(() => {
      result.current.handleKeyInput('', {leftArrow: true});
      result.current.handleKeyInput('', {leftArrow: true});
      result.current.handleKeyInput('', {leftArrow: true});
    });
    flushUpdates();
    
    expect(result.current.cursorPos).toBe(2);
    
    // Type 'X' at position 2
    act(() => {
      result.current.handleKeyInput('X', {});
    });
    flushUpdates();
    
    expect(result.current.value).toBe('heXllo');
    expect(result.current.cursorPos).toBe(3);
  });

  test('should handle delete key as backspace (terminal key mapping)', () => {
    const {result} = renderHook(() => useTextInput('hello'));
    
    act(() => {
      result.current.handleKeyInput('', {delete: true});
    });
    flushUpdates();
    
    expect(result.current.value).toBe('hell');
    expect(result.current.cursorPos).toBe(4);
  });

  test('should handle delete key as backspace in middle of text', () => {
    const {result} = renderHook(() => useTextInput('hello'));
    
    // Move cursor to position 2 (between 'e' and 'l')
    act(() => {
      result.current.handleKeyInput('', {leftArrow: true});
      result.current.handleKeyInput('', {leftArrow: true});
      result.current.handleKeyInput('', {leftArrow: true});
    });
    flushUpdates();
    
    expect(result.current.cursorPos).toBe(2);
    
    // Delete key should delete 'e' and move cursor to position 1
    act(() => {
      result.current.handleKeyInput('', {delete: true});
    });
    flushUpdates();
    
    expect(result.current.value).toBe('hllo');
    expect(result.current.cursorPos).toBe(1);
  });

  test('should not delete at beginning of text', () => {
    const {result} = renderHook(() => useTextInput('hello'));
    
    // Move cursor to beginning
    act(() => {
      result.current.handleKeyInput('', {home: true});
    });
    flushUpdates();
    
    expect(result.current.cursorPos).toBe(0);
    
    // Delete key should do nothing at beginning
    act(() => {
      result.current.handleKeyInput('', {delete: true});
    });
    flushUpdates();
    
    expect(result.current.value).toBe('hello');
    expect(result.current.cursorPos).toBe(0);
  });

  test('should handle backspace key as delete (terminal key mapping)', () => {
    const {result} = renderHook(() => useTextInput('hello'));
    
    // Move cursor to beginning
    act(() => {
      result.current.handleKeyInput('', {home: true});
    });
    flushUpdates();
    
    // Backspace key should remove 'h'
    act(() => {
      result.current.handleKeyInput('', {backspace: true});
    });
    flushUpdates();
    
    expect(result.current.value).toBe('ello');
    expect(result.current.cursorPos).toBe(0);
  });

  test('should not backspace at end of text', () => {
    const {result} = renderHook(() => useTextInput('hello'));
    
    expect(result.current.cursorPos).toBe(5);
    
    // Backspace key should do nothing at end
    act(() => {
      result.current.handleKeyInput('', {backspace: true});
    });
    flushUpdates();
    
    expect(result.current.value).toBe('hello');
    expect(result.current.cursorPos).toBe(5);
  });

  test('should handle arrow key navigation', () => {
    const {result} = renderHook(() => useTextInput('hello'));
    
    expect(result.current.cursorPos).toBe(5);
    
    // Left arrow
    act(() => {
      result.current.handleKeyInput('', {leftArrow: true});
    });
    flushUpdates();
    expect(result.current.cursorPos).toBe(4);
    
    // Right arrow
    act(() => {
      result.current.handleKeyInput('', {rightArrow: true});
    });
    flushUpdates();
    expect(result.current.cursorPos).toBe(5);
    
    // Home then left arrow at boundary
    act(() => {
      result.current.handleKeyInput('', {home: true});
    });
    flushUpdates();
    expect(result.current.cursorPos).toBe(0);
    
    act(() => {
      result.current.handleKeyInput('', {leftArrow: true});
    });
    flushUpdates();
    expect(result.current.cursorPos).toBe(0); // Should not go negative
  });

  test('should handle home and end keys', () => {
    const {result} = renderHook(() => useTextInput('hello'));
    
    // Home key
    act(() => {
      result.current.handleKeyInput('', {home: true});
    });
    flushUpdates();
    expect(result.current.cursorPos).toBe(0);
    
    // End key
    act(() => {
      result.current.handleKeyInput('', {end: true});
    });
    flushUpdates();
    expect(result.current.cursorPos).toBe(5);
  });

  test('should handle ctrl+a (home) and ctrl+e (end)', () => {
    const {result} = renderHook(() => useTextInput('hello'));
    
    // Ctrl+A (home)
    act(() => {
      result.current.handleKeyInput('a', {ctrl: true});
    });
    flushUpdates();
    expect(result.current.cursorPos).toBe(0);
    
    // Ctrl+E (end)
    act(() => {
      result.current.handleKeyInput('e', {ctrl: true});
    });
    flushUpdates();
    expect(result.current.cursorPos).toBe(5);
  });

  test('should ignore control and meta key combinations', () => {
    const {result} = renderHook(() => useTextInput('hello'));
    
    const originalValue = result.current.value;
    const originalCursorPos = result.current.cursorPos;
    
    // Ctrl+C should be ignored
    act(() => {
      const handled = result.current.handleKeyInput('c', {ctrl: true});
      expect(handled).toBe(false); // Should return false for unhandled keys
    });
    flushUpdates();
    
    expect(result.current.value).toBe(originalValue);
    expect(result.current.cursorPos).toBe(originalCursorPos);
    
    // Meta+X should be ignored
    act(() => {
      const handled = result.current.handleKeyInput('x', {meta: true});
      expect(handled).toBe(false); // Should return false for unhandled keys
    });
    flushUpdates();
    
    expect(result.current.value).toBe(originalValue);
    expect(result.current.cursorPos).toBe(originalCursorPos);
  });

  test('should handle reset method', () => {
    const {result} = renderHook(() => useTextInput('hello'));
    
    // Move cursor and modify text
    act(() => {
      result.current.handleKeyInput('', {home: true});
      result.current.handleKeyInput('X', {});
    });
    flushUpdates();
    
    expect(result.current.value).toBe('Xhello');
    expect(result.current.cursorPos).toBe(1);
    
    // Reset to new value
    act(() => {
      result.current.reset('world');
    });
    
    expect(result.current.value).toBe('world');
    expect(result.current.cursorPos).toBe(5);
    
    // Reset to empty
    act(() => {
      result.current.reset();
    });
    
    expect(result.current.value).toBe('');
    expect(result.current.cursorPos).toBe(0);
  });

  test('should handle setValue method', () => {
    const {result} = renderHook(() => useTextInput('hello'));
    
    // Move cursor to middle
    act(() => {
      result.current.handleKeyInput('', {home: true});
      result.current.handleKeyInput('', {rightArrow: true});
    });
    flushUpdates();
    
    expect(result.current.cursorPos).toBe(1);
    
    // Set new value - cursor should be clamped to new length
    act(() => {
      result.current.setValue('hi');
    });
    
    expect(result.current.value).toBe('hi');
    expect(result.current.cursorPos).toBe(1); // Cursor position preserved if within bounds
    
    // Set shorter value - cursor should be clamped
    act(() => {
      result.current.setValue('x');
    });
    
    expect(result.current.value).toBe('x');
    expect(result.current.cursorPos).toBe(1); // Clamped to length
  });

  test('should return false for unhandled keys', () => {
    const {result} = renderHook(() => useTextInput());
    
    // Unrecognized key should return false
    const handled = result.current.handleKeyInput('', {pageUp: true});
    expect(handled).toBe(false);
  });

  test('should return true for handled keys', () => {
    const {result} = renderHook(() => useTextInput());
    
    // Recognized keys should return true
    expect(result.current.handleKeyInput('a', {})).toBe(true);
    expect(result.current.handleKeyInput('', {leftArrow: true})).toBe(true);
    expect(result.current.handleKeyInput('', {delete: true})).toBe(true);
    expect(result.current.handleKeyInput('', {backspace: true})).toBe(true);
  });
  
  test('should handle rapid input buffering correctly', () => {
    const {result} = renderHook(() => useTextInput());
    
    // Simulate rapid typing without flushing
    act(() => {
      result.current.handleKeyInput('h', {});
      result.current.handleKeyInput('e', {});
      result.current.handleKeyInput('l', {});
      result.current.handleKeyInput('l', {});
      result.current.handleKeyInput('o', {});
    });
    
    // Before flush, value might not be updated due to buffering
    // After flush, all inputs should be processed
    flushUpdates();
    
    expect(result.current.value).toBe('hello');
    expect(result.current.cursorPos).toBe(5);
  });
  
  test('should handle complex editing operations in sequence', () => {
    const {result} = renderHook(() => useTextInput('test'));
    
    act(() => {
      // Go to beginning
      result.current.handleKeyInput('', {home: true});
      // Type at beginning
      result.current.handleKeyInput('X', {});
      // Move to end
      result.current.handleKeyInput('', {end: true});
      // Add at end
      result.current.handleKeyInput('Y', {});
      // Delete from end
      result.current.handleKeyInput('', {delete: true});
    });
    flushUpdates();
    
    expect(result.current.value).toBe('Xtest');
    expect(result.current.cursorPos).toBe(5);
  });
  
  test('should properly clean up on unmount', () => {
    const {result, unmount} = renderHook(() => useTextInput('test'));
    
    // Add some buffered input
    act(() => {
      result.current.handleKeyInput('X', {});
    });
    
    // Unmount should clean up timers and flush pending inputs
    unmount();
    
    // No errors should occur, and timers should be cleaned up
    expect(() => {
      act(() => {
        jest.runOnlyPendingTimers();
      });
    }).not.toThrow();
  });

  test('should handle renderText method correctly', () => {
    const {result} = renderHook(() => useTextInput('hello'));
    
    // Test renderText returns a valid React element
    const element = result.current.renderText('placeholder');
    expect(element).toBeDefined();
    expect(element.type).toBeDefined(); // Should be a React element
  });

  test('should handle edge case with empty string operations', () => {
    const {result} = renderHook(() => useTextInput());
    
    // Try operations on empty string
    act(() => {
      result.current.handleKeyInput('', {delete: true}); // Should do nothing
      result.current.handleKeyInput('', {backspace: true}); // Should do nothing
      result.current.handleKeyInput('', {leftArrow: true}); // Should stay at 0
      result.current.handleKeyInput('', {rightArrow: true}); // Should stay at 0
    });
    flushUpdates();
    
    expect(result.current.value).toBe('');
    expect(result.current.cursorPos).toBe(0);
  });
});

// Restore real timers after all tests
afterAll(() => {
  jest.useRealTimers();
});