import {describe, test, expect} from '@jest/globals';
import {shouldPromptForAITool} from '../../src/contexts/WorktreeContext.js';

describe('AI Tool Selection Logic', () => {
  test('returns true when multiple tools available and no session/tool selected', () => {
    const result = shouldPromptForAITool(['claude', 'codex'], false, 'none');
    expect(result).toBe(true);
  });

  test('returns false when only one tool available', () => {
    const result = shouldPromptForAITool(['claude'], false, 'none');
    expect(result).toBe(false);
  });

  test('returns false when session already exists', () => {
    const result = shouldPromptForAITool(['claude', 'codex'], true, 'none');
    expect(result).toBe(false);
  });

  test('returns false when worktree already has a tool selected', () => {
    const result = shouldPromptForAITool(['claude', 'codex'], false, 'claude');
    expect(result).toBe(false);
  });
});

