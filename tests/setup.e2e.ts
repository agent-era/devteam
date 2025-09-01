// Jest setup for E2E tests using real Ink + ink-testing-library

// Keep real timers for ink-testing-library

// Stub process.exit so App's exit paths don't terminate the test process
const mockExit = jest.fn();
process.exit = mockExit as any;

// Reduce console noise but still allow debugging if needed
global.console = {
  ...console,
  log: jest.fn(),
  debug: jest.fn(),
  info: jest.fn(),
  warn: jest.fn(),
  error: jest.fn(),
};

// Ignore raw mode support check so app doesn't exit in test
process.env.E2E_IGNORE_RAWMODE = '1';
// Ensure Ink doesn't think it's running in CI (which suppresses writes)
try { delete (process.env as any).CI; } catch {}

beforeEach(() => {
  mockExit.mockClear();
});
