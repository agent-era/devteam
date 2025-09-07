// Mock implementation of @inkjs/ui for testing
const React = require('react');

// Mock TextInput component
function TextInput({ value, placeholder, onChange, onSubmit, isDisabled = false, ...props }) {
  // Simulate basic text input behavior for testing
  React.useEffect(() => {
    if (onChange) {
      // Call onChange with current value to set up state
      onChange(value || '');
    }
  }, [value, onChange]);

  return React.createElement('div', {
    'data-testid': 'mock-text-input',
    'data-value': value || '',
    'data-placeholder': placeholder || '',
    'data-disabled': isDisabled
  }, value || placeholder || '');
}

// Mock Select component
function Select({ options = [], defaultValue, onChange, isDisabled = false, ...props }) {
  const [selectedValue, setSelectedValue] = React.useState(defaultValue || '');

  React.useEffect(() => {
    if (onChange && selectedValue) {
      onChange(selectedValue);
    }
  }, [selectedValue, onChange]);

  return React.createElement('div', {
    'data-testid': 'mock-select',
    'data-value': selectedValue,
    'data-disabled': isDisabled
  }, options.map((option, index) => 
    React.createElement('div', {
      key: option.value,
      'data-testid': 'mock-select-option',
      'data-value': option.value,
      'data-selected': option.value === selectedValue
    }, option.label)
  ));
}

// Mock other UI components as needed
function Badge(props) {
  return React.createElement('span', { 'data-testid': 'mock-badge' }, props.children);
}

function Spinner(props) {
  return React.createElement('div', { 'data-testid': 'mock-spinner' }, 'Loading...');
}

function ProgressBar(props) {
  return React.createElement('div', { 'data-testid': 'mock-progress-bar' }, `${props.value || 0}%`);
}

module.exports = {
  TextInput,
  Select,
  Badge,
  Spinner,
  ProgressBar
};