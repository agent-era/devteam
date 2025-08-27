import React, {useState} from 'react';
import {Text} from 'ink';
const h = React.createElement;

// Single-source-of-truth text input hook
export function useTextInput(initialValue = '') {
  const [value, setValue] = useState(initialValue);
  const [cursorPos, setCursorPos] = useState(initialValue.length);

  const handleKeyInput = (input: string, key: any): boolean => {
    // Movement keys
    if (key.leftArrow) {
      setCursorPos(Math.max(0, cursorPos - 1));
      return true;
    }
    if (key.rightArrow) {
      setCursorPos(Math.min(value.length, cursorPos + 1));
      return true;
    }
    if (key.home || (key.ctrl && input === 'a')) {
      setCursorPos(0);
      return true;
    }
    if (key.end || (key.ctrl && input === 'e')) {
      setCursorPos(value.length);
      return true;
    }
    
    // Editing keys
    if (key.backspace) {
      if (cursorPos > 0) {
        const newValue = value.slice(0, cursorPos - 1) + value.slice(cursorPos);
        setValue(newValue);
        setCursorPos(cursorPos - 1);
      }
      return true;
    }
    if (key.delete) {
      if (cursorPos < value.length) {
        const newValue = value.slice(0, cursorPos) + value.slice(cursorPos + 1);
        setValue(newValue);
      }
      return true;
    }
    
    // Regular typing
    if (input && !key.ctrl && !key.meta) {
      const newValue = value.slice(0, cursorPos) + input + value.slice(cursorPos);
      setValue(newValue);
      setCursorPos(cursorPos + 1);
      return true;
    }
    
    return false;
  };

  const renderText = (placeholder = '', color?: string, cursorColor = 'inverse') => {
    const displayValue = value || placeholder;
    const beforeCursor = displayValue.slice(0, cursorPos);
    const atCursor = displayValue[cursorPos] || ' ';
    const afterCursor = displayValue.slice(cursorPos + 1);

    return h(
      Text,
      {color: value ? color : 'gray'},
      beforeCursor,
      h(Text, {color: cursorColor}, atCursor),
      afterCursor
    );
  };

  const reset = (newValue = '') => {
    setValue(newValue);
    setCursorPos(newValue.length);
  };

  return {
    value,
    cursorPos,
    handleKeyInput,
    renderText,
    reset,
    setValue: (newValue: string) => {
      setValue(newValue);
      setCursorPos(Math.min(cursorPos, newValue.length));
    }
  };
}