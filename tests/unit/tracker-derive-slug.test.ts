import {describe, test, expect, beforeEach, afterEach, jest} from '@jest/globals';
import fs from 'node:fs';
import path from 'node:path';
import os from 'node:os';

// Mock runClaudeAsync so deriveSlug's AI path is deterministic.
const mockRunClaudeAsync = jest.fn<(prompt: string, opts?: any) => Promise<{success: boolean; output: string; error?: string}>>();
jest.mock('../../src/shared/utils/commandExecutor.js', () => {
  const actual = jest.requireActual('../../src/shared/utils/commandExecutor.js') as any;
  return {...actual, runClaudeAsync: (...args: any[]) => mockRunClaudeAsync(...(args as [string, any?]))};
});

import {TrackerService} from '../../src/services/TrackerService.js';

let tmpDir: string;
let service: TrackerService;

beforeEach(() => {
  tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), 'tracker-derive-test-'));
  service = new TrackerService();
  mockRunClaudeAsync.mockReset();
});

afterEach(() => {
  fs.rmSync(tmpDir, {recursive: true, force: true});
});

describe('deriveSlug fallback paths', () => {
  test('uses AI output when it returns a clean kebab-case slug', async () => {
    mockRunClaudeAsync.mockResolvedValue({success: true, output: 'oauth-login\n'});
    const slug = await service.deriveSlug('Add OAuth sign-in for users', []);
    expect(slug).toBe('oauth-login');
  });

  test('falls back to slugify(title) when AI call fails', async () => {
    mockRunClaudeAsync.mockResolvedValue({success: false, output: '', error: 'claude not found'});
    const slug = await service.deriveSlug('My New Feature', []);
    expect(slug).toBe('my-new-feature');
  });

  test('falls back to slugify(title) when AI returns empty output', async () => {
    mockRunClaudeAsync.mockResolvedValue({success: true, output: ''});
    const slug = await service.deriveSlug('Empty Response Title', []);
    expect(slug).toBe('empty-response-title');
  });

  test('slugifies a sloppy AI response with extra whitespace and line breaks', async () => {
    mockRunClaudeAsync.mockResolvedValue({success: true, output: '  Oauth Login\n\n'});
    const slug = await service.deriveSlug('Add OAuth', []);
    // slugify normalizes the AI output
    expect(slug).toBe('oauth-login');
  });

  test('appends -2 when derived slug already exists', async () => {
    mockRunClaudeAsync.mockResolvedValue({success: true, output: 'oauth-login'});
    const slug = await service.deriveSlug('OAuth Login', ['oauth-login']);
    expect(slug).toBe('oauth-login-2');
  });

  test('increments suffix past existing -2 collisions', async () => {
    mockRunClaudeAsync.mockResolvedValue({success: true, output: 'oauth-login'});
    const slug = await service.deriveSlug('OAuth Login', ['oauth-login', 'oauth-login-2']);
    expect(slug).toBe('oauth-login-3');
  });

  test('falls back to title slugify when AI returns an unslugifiable response', async () => {
    mockRunClaudeAsync.mockResolvedValue({success: true, output: '!!!'});
    const slug = await service.deriveSlug('A Real Title', []);
    expect(slug).toBe('a-real-title');
  });
});
