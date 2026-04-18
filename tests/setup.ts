// Jest setup file for testing configuration
import os from 'node:os';
import path from 'node:path';
import fs from 'node:fs';

// Keep per-worktree AI-session memory out of the user's real cache during tests.
// Using mkdtempSync gives each test process its own isolated dir.
const aiSessionTmp = fs.mkdtempSync(path.join(os.tmpdir(), 'devteam-ai-sessions-'));
process.env.DEVTEAM_AI_SESSION_DIR = aiSessionTmp;

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