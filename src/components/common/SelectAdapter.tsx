import React, {useEffect, useState, useMemo} from 'react';
import {Select} from '@inkjs/ui';
import {useInput} from 'ink';
import {useInputFocus} from '../../contexts/InputFocusContext.js';

export interface SelectOption {
  label: string;
  value: string;
}

interface SelectAdapterProps {
  options: SelectOption[];
  onSelect: (value: string) => void;
  onCancel?: () => void;
  defaultSelected?: string;
  focusId?: string;
  supportNumberSelection?: boolean;
  supportJKNavigation?: boolean;
  filter?: string;
  onFilterChange?: (filter: string) => void;
  disabled?: boolean;
}

export default function SelectAdapter({
  options,
  onSelect,
  onCancel,
  defaultSelected,
  focusId,
  supportNumberSelection = true,
  supportJKNavigation = true,
  filter = '',
  onFilterChange,
  disabled = false
}: SelectAdapterProps) {
  const [selectedValue, setSelectedValue] = useState(defaultSelected || options[0]?.value || '');
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

  // Filter options based on filter string
  const filteredOptions = useMemo(() => {
    if (!filter) return options;
    const filterLower = filter.toLowerCase();
    return options.filter(option => 
      option.label.toLowerCase().includes(filterLower) || 
      option.value.toLowerCase().includes(filterLower)
    );
  }, [options, filter]);

  // Handle custom keyboard shortcuts that @inkjs/ui Select might not support
  useInput((input, key) => {
    if (disabled) return;
    
    // ESC to cancel
    if (key.escape && onCancel) {
      onCancel();
      return;
    }

    // Number keys for quick selection (1-9)
    if (supportNumberSelection && /^[1-9]$/.test(input)) {
      const idx = Number(input) - 1;
      if (idx >= 0 && idx < filteredOptions.length) {
        const option = filteredOptions[idx];
        onSelect(option.value);
      }
      return;
    }

    // j/k navigation support (if the Select component doesn't handle it)
    if (supportJKNavigation) {
      if (input === 'j') {
        const currentIndex = filteredOptions.findIndex(opt => opt.value === selectedValue);
        const nextIndex = Math.min(filteredOptions.length - 1, currentIndex + 1);
        if (nextIndex !== currentIndex) {
          setSelectedValue(filteredOptions[nextIndex].value);
        }
        return;
      }
      if (input === 'k') {
        const currentIndex = filteredOptions.findIndex(opt => opt.value === selectedValue);
        const prevIndex = Math.max(0, currentIndex - 1);
        if (prevIndex !== currentIndex) {
          setSelectedValue(filteredOptions[prevIndex].value);
        }
        return;
      }
    }

    // Handle filter input if onFilterChange is provided
    if (onFilterChange && !key.ctrl && !key.meta) {
      if (key.backspace || key.delete) {
        onFilterChange(filter.slice(0, -1));
        return;
      }
      
      // Regular typing
      if (input && input.length === 1) {
        onFilterChange(filter + input);
        return;
      }
    }
  });

  const handleSelect = (value: string) => {
    onSelect(value);
  };

  const handleChange = (newValue: string) => {
    setSelectedValue(newValue);
  };

  return (
    <Select
      options={filteredOptions}
      onChange={handleSelect}
      isDisabled={disabled}
    />
  );
}
