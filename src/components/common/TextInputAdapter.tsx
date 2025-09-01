import React, {useEffect, useState, forwardRef, useImperativeHandle} from 'react';
import {TextInput} from '@inkjs/ui';
import {useInputFocus} from '../../contexts/InputFocusContext.js';

interface TextInputAdapterProps {
  placeholder?: string;
  initialValue?: string;
  onSubmit?: (value: string) => void;
  onChange?: (value: string) => void;
  focusId?: string;
  multiline?: boolean;
  mask?: string;
  disabled?: boolean;
}

export interface TextInputAdapterRef {
  getValue: () => string;
  setValue: (value: string) => void;
  reset: (newValue?: string) => void;
}

const TextInputAdapter = forwardRef<TextInputAdapterRef, TextInputAdapterProps>(
  function TextInputAdapter({
    placeholder = '',
    initialValue = '',
    onSubmit,
    onChange,
    focusId,
    multiline = false,
    mask,
    disabled = false
  }, ref) {
    const [value, setValue] = useState(initialValue);
    const {requestFocus, releaseFocus} = useInputFocus();

    // Request focus when component mounts if focusId is provided
    useEffect(() => {
      if (focusId) {
        requestFocus(focusId);
        return () => {
          releaseFocus(focusId);
        };
      }
    }, [focusId, requestFocus, releaseFocus]);

    // Update internal value when initialValue changes
    useEffect(() => {
      setValue(initialValue);
    }, [initialValue]);

    const handleChange = (newValue: string) => {
      setValue(newValue);
      onChange?.(newValue);
    };

    const handleSubmit = (submittedValue: string) => {
      onSubmit?.(submittedValue);
    };

    // Expose imperative interface
    useImperativeHandle(ref, () => ({
      getValue: () => value,
      setValue: (newValue: string) => {
        setValue(newValue);
      },
      reset: (newValue = '') => {
        setValue(newValue);
      }
    }), [value]);

    return (
      <TextInput
        value={value}
        placeholder={placeholder}
        onChange={handleChange}
        onSubmit={handleSubmit}
        isDisabled={disabled}
        // Cast to any to handle potential prop differences
        {...(multiline ? {multiline: true} as any : {})}
        {...(mask ? {mask} as any : {})}
      />
    );
  }
);

export default TextInputAdapter;