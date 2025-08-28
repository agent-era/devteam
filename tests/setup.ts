// Jest setup file for testing configuration

// Enable fake timers for all tests to speed up delays
jest.useFakeTimers();

// Mock process.exit to prevent tests from actually exiting
const mockExit = jest.fn();
process.exit = mockExit as any;

// Mock console methods to reduce noise in tests
global.console = {
  ...console,
  log: jest.fn(),
  debug: jest.fn(),
  info: jest.fn(),
  warn: jest.fn(),
  error: jest.fn(),
};

// Clean up after each test
beforeEach(() => {
  mockExit.mockClear();
  jest.clearAllTimers();
});

afterEach(() => {
  jest.runOnlyPendingTimers();
});