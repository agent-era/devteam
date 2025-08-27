// Mock implementation of ink for Jest testing
const React = require('react');

// Mock hook implementations
function useApp() {
  return {
    exit: jest.fn()
  };
}

function useStdin() {
  return {
    stdin: {
      setEncoding: jest.fn(),
      resume: jest.fn(),
      pause: jest.fn(),
      on: jest.fn(),
      off: jest.fn()
    },
    setRawMode: jest.fn()
  };
}

function useInput(callback) {
  // Mock input handler - doesn't actually bind to stdin
  // Real tests would need to trigger this manually
}

// Mock Box component
function Box(props) {
  return React.createElement('div', props, props.children);
}

// Mock Text component
function Text(props) {
  return React.createElement('span', props, props.children);
}

// Mock render function (not used since we mock ink-testing-library separately)
function render() {
  return {
    waitUntilExit: () => Promise.resolve()
  };
}

module.exports = {
  useApp,
  useStdin,
  useInput,
  Box,
  Text,
  render
};