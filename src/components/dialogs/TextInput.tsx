import React, {useState, useCallback, useRef, useEffect} from 'react';
import {Text} from 'ink';

interface InputBuffer {
  type: 'move' | 'edit' | 'insert';
  data: any;
  timestamp: number;
}

// Single-source-of-truth text input hook with debouncing and buffering
export function useTextInput(initialValue = '') {
  const [state, setState] = useState({
    value: initialValue,
    cursorPos: initialValue.length
  });
  
  const bufferRef = useRef<InputBuffer[]>([]);
  const timeoutRef = useRef<NodeJS.Timeout | null>(null);
  const isProcessingRef = useRef(false);

  // Flush buffered inputs with batched state update
  const flushBuffer = useCallback(() => {
    if (bufferRef.current.length === 0 || isProcessingRef.current) return;
    
    isProcessingRef.current = true;
    const bufferedInputs = [...bufferRef.current];
    bufferRef.current = [];
    
    setState(prevState => {
      let newValue = prevState.value;
      let newCursorPos = prevState.cursorPos;
      
      // Process all buffered inputs in sequence
      for (const input of bufferedInputs) {
        switch (input.type) {
          case 'move':
            if (input.data.direction === 'left') {
              newCursorPos = Math.max(0, newCursorPos - 1);
            } else if (input.data.direction === 'right') {
              newCursorPos = Math.min(newValue.length, newCursorPos + 1);
            } else if (input.data.direction === 'home') {
              newCursorPos = 0;
            } else if (input.data.direction === 'end') {
              newCursorPos = newValue.length;
            }
            break;
            
          case 'edit':
            if (input.data.action === 'backspace' && newCursorPos > 0) {
              newValue = newValue.slice(0, newCursorPos - 1) + newValue.slice(newCursorPos);
              newCursorPos = newCursorPos - 1;
            } else if (input.data.action === 'delete' && newCursorPos < newValue.length) {
              newValue = newValue.slice(0, newCursorPos) + newValue.slice(newCursorPos + 1);
            }
            break;
            
          case 'insert':
            newValue = newValue.slice(0, newCursorPos) + input.data.char + newValue.slice(newCursorPos);
            newCursorPos = newCursorPos + 1;
            break;
        }
      }
      
      return {
        value: newValue,
        cursorPos: newCursorPos
      };
    });
    
    isProcessingRef.current = false;
  }, []);

  // Schedule buffer flush with debouncing
  const scheduleFlush = useCallback(() => {
    if (timeoutRef.current) {
      clearTimeout(timeoutRef.current);
    }
    timeoutRef.current = setTimeout(flushBuffer, 16); // ~60fps
  }, [flushBuffer]);

  // Cleanup timeout on unmount
  useEffect(() => {
    return () => {
      if (timeoutRef.current) {
        clearTimeout(timeoutRef.current);
        flushBuffer(); // Flush any pending inputs
      }
    };
  }, [flushBuffer]);

  const handleKeyInput = useCallback((input: string, key: any): boolean => {
    const timestamp = Date.now();
    
    // Movement keys
    if (key.leftArrow) {
      bufferRef.current.push({
        type: 'move',
        data: {direction: 'left'},
        timestamp
      });
      scheduleFlush();
      return true;
    }
    if (key.rightArrow) {
      bufferRef.current.push({
        type: 'move',
        data: {direction: 'right'},
        timestamp
      });
      scheduleFlush();
      return true;
    }
    if (key.home || (key.ctrl && input === 'a')) {
      bufferRef.current.push({
        type: 'move',
        data: {direction: 'home'},
        timestamp
      });
      scheduleFlush();
      return true;
    }
    if (key.end || (key.ctrl && input === 'e')) {
      bufferRef.current.push({
        type: 'move',
        data: {direction: 'end'},
        timestamp
      });
      scheduleFlush();
      return true;
    }
    
    // Editing keys (swapped due to terminal key mapping)
    if (key.delete) {
      bufferRef.current.push({
        type: 'edit',
        data: {action: 'backspace'},
        timestamp
      });
      scheduleFlush();
      return true;
    }
    if (key.backspace) {
      bufferRef.current.push({
        type: 'edit',
        data: {action: 'delete'},
        timestamp
      });
      scheduleFlush();
      return true;
    }
    
    // Regular typing
    if (input && !key.ctrl && !key.meta) {
      bufferRef.current.push({
        type: 'insert',
        data: {char: input},
        timestamp
      });
      scheduleFlush();
      return true;
    }
    
    return false;
  }, [scheduleFlush]);

  const renderText = useCallback((placeholder = '', color?: string, cursorColor = 'inverse') => {
    const displayValue = state.value || placeholder;
    const beforeCursor = displayValue.slice(0, state.cursorPos);
    const atCursor = displayValue[state.cursorPos] || ' ';
    const afterCursor = displayValue.slice(state.cursorPos + 1);

    return (
      <Text color={state.value ? color : 'gray'}>
        {beforeCursor}
        <Text color={cursorColor}>{atCursor}</Text>
        {afterCursor}
      </Text>
    );
  }, [state.value, state.cursorPos]);

  const reset = useCallback((newValue = '') => {
    // Clear any pending buffer before resetting
    if (timeoutRef.current) {
      clearTimeout(timeoutRef.current);
      timeoutRef.current = null;
    }
    bufferRef.current = [];
    
    setState({
      value: newValue,
      cursorPos: newValue.length
    });
  }, []);

  return {
    value: state.value,
    cursorPos: state.cursorPos,
    handleKeyInput,
    renderText,
    reset,
    setValue: useCallback((newValue: string) => {
      // Clear any pending buffer before setting value
      if (timeoutRef.current) {
        clearTimeout(timeoutRef.current);
        timeoutRef.current = null;
      }
      bufferRef.current = [];
      
      setState(prev => ({
        value: newValue,
        cursorPos: Math.min(prev.cursorPos, newValue.length)
      }));
    }, [])
  };
}