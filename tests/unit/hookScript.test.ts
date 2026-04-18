// Tests for the event→status mapping logic used by devteam-status-hook.mjs.
// Duplicated inline (not imported) since the script is plain ESM with no exports.

type StatusResult = 'working' | 'waiting' | 'idle' | '__delete__' | null;

function mapStatus(tool: string, event: string, payload: Record<string, unknown>): StatusResult {
  if (event === 'SessionEnd') return '__delete__';
  if (event === 'Stop' || event === 'AfterAgent' || event === 'agent-turn-complete') return 'idle';
  if (['UserPromptSubmit', 'PreToolUse', 'BeforeAgent', 'BeforeModel', 'BeforeTool'].includes(event)) return 'working';
  if (event === 'approval-requested') return 'waiting';
  if (event === 'Notification') {
    const t = payload.notification_type as string || '';
    if (t === 'permission_prompt' || t === 'idle_prompt' || t === 'ToolPermission') return 'waiting';
    return null;
  }
  if (event === 'SessionStart') return 'idle';
  return null;
}

describe('hook script mapStatus', () => {
  test('UserPromptSubmit → working (all tools)', () => {
    for (const tool of ['claude', 'gemini', 'codex']) {
      expect(mapStatus(tool, 'UserPromptSubmit', {})).toBe('working');
    }
  });

  test('Stop → idle (Claude/Codex)', () => {
    expect(mapStatus('claude', 'Stop', {})).toBe('idle');
    expect(mapStatus('codex', 'Stop', {})).toBe('idle');
  });

  test('AfterAgent → idle (Gemini)', () => {
    expect(mapStatus('gemini', 'AfterAgent', {})).toBe('idle');
  });

  test('Notification with permission_prompt → waiting', () => {
    expect(mapStatus('claude', 'Notification', {notification_type: 'permission_prompt'})).toBe('waiting');
  });

  test('Notification with idle_prompt → waiting', () => {
    expect(mapStatus('claude', 'Notification', {notification_type: 'idle_prompt'})).toBe('waiting');
  });

  test('Notification with ToolPermission → waiting (Gemini)', () => {
    expect(mapStatus('gemini', 'Notification', {notification_type: 'ToolPermission'})).toBe('waiting');
  });

  test('Notification with unknown type → null (ignored)', () => {
    expect(mapStatus('claude', 'Notification', {notification_type: 'auth_success'})).toBeNull();
  });

  test('SessionEnd → __delete__', () => {
    expect(mapStatus('claude', 'SessionEnd', {})).toBe('__delete__');
  });

  test('approval-requested → waiting (Codex)', () => {
    expect(mapStatus('codex', 'approval-requested', {})).toBe('waiting');
  });

  test('BeforeAgent → working (Gemini)', () => {
    expect(mapStatus('gemini', 'BeforeAgent', {})).toBe('working');
  });

  test('PreToolUse → working', () => {
    expect(mapStatus('claude', 'PreToolUse', {})).toBe('working');
  });

  test('SessionStart → idle (tool is running but idle)', () => {
    expect(mapStatus('claude', 'SessionStart', {})).toBe('idle');
  });

  test('unknown event → null', () => {
    expect(mapStatus('claude', 'SubagentStop', {})).toBeNull();
  });
});
