# Typing Race Condition Fixes

## Problem Analysis
The typing cursor was jumping around during slow system performance due to multiple race conditions:

1. **Multiple Input Handlers Competing**: Both `useKeyboardShortcuts` and dialog `useInput` hooks were listening to stdin simultaneously
2. **Uncoordinated State Updates**: Filter state and text input state were updated independently, causing conflicts
3. **Background Refresh Interference**: Periodic refreshes (2s AI status, 5s diff status) were interrupting text input
4. **Raw Mode Conflicts**: Multiple components were calling `setRawMode(true)` without coordination

## Solution Implementation

### 1. Input Focus Management (`src/contexts/InputFocusContext.tsx`)
- **New Context**: Created centralized input focus management
- **Focus Coordination**: Only one component can handle input at a time
- **Dialog Priority**: When dialogs are active, background shortcuts are disabled

```typescript
const {hasFocus, requestFocus, releaseFocus, isAnyDialogFocused} = useInputFocus();
```

### 2. Enhanced Text Input Hook (`src/components/dialogs/TextInput.ts`)
- **Input Buffering**: All keystrokes are buffered before processing
- **Batched Updates**: State updates are batched at 60fps (16ms intervals) 
- **Atomic Operations**: All buffered inputs are applied in a single state update
- **Race Prevention**: Buffer is cleared on external value changes

```typescript
// Before: Individual state updates for each keystroke
setState(prev => ({...prev, cursorPos: prev.cursorPos + 1}));

// After: Buffered batch processing
bufferRef.current.push({type: 'insert', data: {char: input}});
scheduleFlush(); // Debounced to 16ms
```

### 3. Background Refresh Suspension (`src/contexts/WorktreeContext.tsx`)
- **Dialog-Aware Refreshes**: Background updates pause when dialogs are focused
- **Typing Protection**: Prevents interruption during active text input

```typescript
// Skip refreshes if any dialog is focused to avoid interrupting typing
if (!isAnyDialogFocused) {
  refreshSelected();
}
```

### 4. Keyboard Shortcut Focus Respect (`src/hooks/useKeyboardShortcuts.ts`)
- **Focus Checking**: Only processes input when main view has focus
- **Dialog Bypass**: Automatically releases focus when dialogs appear

```typescript
// Only process input if we have focus and no dialog is focused
if (isAnyDialogFocused || !hasFocus('main')) {
  return;
}
```

### 5. Component Memoization
- **Dialog Memoization**: `CreateFeatureDialog` and `CommentInputDialog` wrapped with `React.memo`
- **Callback Stability**: Text input methods use `useCallback` for stable references
- **Re-render Reduction**: Prevents unnecessary re-renders during typing

## Technical Details

### Input Buffer Processing
```typescript
interface InputBuffer {
  type: 'move' | 'edit' | 'insert';
  data: any;
  timestamp: number;
}

// Process all buffered inputs atomically
setState(prevState => {
  let newValue = prevState.value;
  let newCursorPos = prevState.cursorPos;
  
  for (const input of bufferedInputs) {
    // Apply each input in sequence
  }
  
  return {value: newValue, cursorPos: newCursorPos};
});
```

### Focus Management Flow
1. Dialog mounts → requests focus
2. `useKeyboardShortcuts` detects dialog focus → stops processing input
3. Background refreshes check dialog focus → pause updates
4. Dialog unmounts → releases focus → normal input resumes

## Performance Improvements

| Before | After |
|--------|-------|
| Individual state updates per keystroke | Batched updates at 60fps |
| Competing input handlers | Single focused handler |
| Background refreshes during typing | Suspended refreshes |
| Unlimited re-renders | Memoized components |
| Race conditions on slow systems | Atomic buffer processing |

## Files Modified

### Core Changes
- `src/contexts/InputFocusContext.tsx` - New focus management
- `src/components/dialogs/TextInput.ts` - Buffered input processing
- `src/contexts/WorktreeContext.tsx` - Pause refreshes during typing
- `src/hooks/useKeyboardShortcuts.ts` - Respect input focus

### Dialog Updates  
- `src/components/dialogs/CreateFeatureDialog.ts` - Focus management + memoization
- `src/components/dialogs/CommentInputDialog.ts` - Focus management + memoization
- `src/App.tsx` - Added InputFocusProvider

### Testing
- `test-typing-performance.js` - Functional verification of buffer mechanism

## Result
✅ Typing performance is now smooth even on slow systems
✅ Cursor position remains stable during rapid input  
✅ No more race conditions between input handlers
✅ Background operations don't interfere with typing
✅ Simplified state management with single source of truth