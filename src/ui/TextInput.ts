import React, {useState} from 'react';
import {Text} from 'ink';
const h = React.createElement;

type Props = {
  value: string;
  onChange: (value: string) => void;
  onInput: (input: string, key: any) => boolean; // return true to handle, false to pass through
  placeholder?: string;
  color?: string;
  cursorColor?: string;
};

export default function TextInput({value, onChange, onInput, placeholder = '', color, cursorColor = 'inverse'}: Props) {
  const [cursorPos, setCursorPos] = useState(value.length);

  const handleInput = (input: string, key: any) => {
    if (onInput(input, key)) return;

    if (key.leftArrow) {
      setCursorPos((pos: number) => Math.max(0, pos - 1));
    } else if (key.rightArrow) {
      setCursorPos((pos: number) => Math.min(value.length, pos + 1));
    } else if (key.home) {
      setCursorPos(0);
    } else if (key.end) {
      setCursorPos(value.length);
    } else if (key.backspace) {
      if (cursorPos > 0) {
        const newValue = value.slice(0, cursorPos - 1) + value.slice(cursorPos);
        onChange(newValue);
        setCursorPos((pos: number) => pos - 1);
      }
    } else if (key.delete) {
      if (cursorPos < value.length) {
        const newValue = value.slice(0, cursorPos) + value.slice(cursorPos + 1);
        onChange(newValue);
      }
    } else if (input && !key.ctrl && !key.meta) {
      const newValue = value.slice(0, cursorPos) + input + value.slice(cursorPos);
      onChange(newValue);
      setCursorPos((pos: number) => pos + 1);
    }
  };

  // Reset cursor position when value changes externally
  React.useEffect(() => {
    setCursorPos((currentPos) => Math.min(currentPos, value.length));
  }, [value.length]);

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
}

// Simple text display with cursor - parent handles all input
export function useTextDisplay(value: string) {
  const [cursorPos, setCursorPos] = useState(0);

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

  const moveCursor = (direction: 'left' | 'right' | 'home' | 'end') => {
    switch (direction) {
      case 'left':
        setCursorPos((pos) => Math.max(0, pos - 1));
        break;
      case 'right':
        setCursorPos((pos) => Math.min(value.length, pos + 1));
        break;
      case 'home':
        setCursorPos(0);
        break;
      case 'end':
        setCursorPos(value.length);
        break;
    }
  };

  const setCursorPosition = (position: number) => {
    setCursorPos(Math.max(0, Math.min(value.length, position)));
  };

  return {renderText, moveCursor, cursorPos, setCursorPosition};
}