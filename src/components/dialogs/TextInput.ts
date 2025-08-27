import React, {useState} from 'react';
import {Text} from 'ink';
const h = React.createElement;

// Single-source-of-truth text input hook
export function useTextInput(initialValue = '') {
  const [state, setState] = useState({
    value: initialValue,
    cursorPos: initialValue.length
  });

  const handleKeyInput = (input: string, key: any): boolean => {
    // Movement keys
    if (key.leftArrow) {
      setState(prev => ({
        ...prev,
        cursorPos: Math.max(0, prev.cursorPos - 1)
      }));
      return true;
    }
    if (key.rightArrow) {
      setState(prev => ({
        ...prev,
        cursorPos: Math.min(prev.value.length, prev.cursorPos + 1)
      }));
      return true;
    }
    if (key.home || (key.ctrl && input === 'a')) {
      setState(prev => ({
        ...prev,
        cursorPos: 0
      }));
      return true;
    }
    if (key.end || (key.ctrl && input === 'e')) {
      setState(prev => ({
        ...prev,
        cursorPos: prev.value.length
      }));
      return true;
    }
    
    // Editing keys (swapped due to terminal key mapping)
    if (key.delete) {
      setState(prev => {
        if (prev.cursorPos > 0) {
          const newValue = prev.value.slice(0, prev.cursorPos - 1) + prev.value.slice(prev.cursorPos);
          return {
            value: newValue,
            cursorPos: prev.cursorPos - 1
          };
        }
        return prev;
      });
      return true;
    }
    if (key.backspace) {
      setState(prev => {
        if (prev.cursorPos < prev.value.length) {
          const newValue = prev.value.slice(0, prev.cursorPos) + prev.value.slice(prev.cursorPos + 1);
          return {
            ...prev,
            value: newValue
          };
        }
        return prev;
      });
      return true;
    }
    
    // Regular typing
    if (input && !key.ctrl && !key.meta) {
      setState(prev => {
        const newValue = prev.value.slice(0, prev.cursorPos) + input + prev.value.slice(prev.cursorPos);
        return {
          value: newValue,
          cursorPos: prev.cursorPos + 1
        };
      });
      return true;
    }
    
    return false;
  };

  const renderText = (placeholder = '', color?: string, cursorColor = 'inverse') => {
    const displayValue = state.value || placeholder;
    const beforeCursor = displayValue.slice(0, state.cursorPos);
    const atCursor = displayValue[state.cursorPos] || ' ';
    const afterCursor = displayValue.slice(state.cursorPos + 1);

    return h(
      Text,
      {color: state.value ? color : 'gray'},
      beforeCursor,
      h(Text, {color: cursorColor}, atCursor),
      afterCursor
    );
  };

  const reset = (newValue = '') => {
    setState({
      value: newValue,
      cursorPos: newValue.length
    });
  };

  return {
    value: state.value,
    cursorPos: state.cursorPos,
    handleKeyInput,
    renderText,
    reset,
    setValue: (newValue: string) => {
      setState(prev => ({
        value: newValue,
        cursorPos: Math.min(prev.cursorPos, newValue.length)
      }));
    }
  };
}