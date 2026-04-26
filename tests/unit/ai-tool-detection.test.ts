import {readFileSync, existsSync} from 'node:fs';
import {join} from 'node:path';
import {AIToolService} from '../../src/services/AIToolService.js';
import {AITool, AIStatus} from '../../src/models.js';

const FIXTURES_ROOT = join(process.cwd(), 'tests/fixtures/ai-states');
const TOOLS: AITool[] = ['claude', 'codex', 'gemini'];
const STATES: AIStatus[] = ['idle', 'working', 'waiting'];

function loadFixture(tool: AITool, state: AIStatus): string | null {
  const p = join(FIXTURES_ROOT, tool, `${state}.txt`);
  return existsSync(p) ? readFileSync(p, 'utf8') : null;
}

describe('AI Tool Detection (fixture-driven)', () => {
  const service = new AIToolService();

  for (const tool of TOOLS) {
    describe(tool, () => {
      for (const state of STATES) {
        const fixture = loadFixture(tool, state);
        const label = `classifies ${state} fixture as ${state}`;
        if (fixture === null) {
          // Skip cleanly if the capture skill hasn't produced this cell yet — keeps the
          // suite green on a fresh checkout, but a missing fixture should be obvious.
          test.skip(`${label} (fixture missing — run capture-ai-states skill)`, () => {});
          continue;
        }
        test(label, () => {
          expect(service.getStatusForTool(fixture, tool)).toBe(state);
        });
      }
    });
  }
});

describe('AIToolService.getStatusForTool — invariants', () => {
  const service = new AIToolService();

  test('returns not_running for tool=none', () => {
    expect(service.getStatusForTool('anything', 'none')).toBe('not_running');
  });

  test('Claude trust-folder consent prompt registers as waiting (it needs user action)', () => {
    const trust = [
      "Claude Code'll be able to read, edit, and execute files here.",
      'Security guide',
      '❯ 1. Yes, I trust this folder',
      '  2. No, exit',
      '',
      'Enter to confirm · Esc to cancel',
    ].join('\n');
    expect(service.getStatusForTool(trust, 'claude')).toBe('waiting');
  });

  test('Claude with working spinner AND a permission picker on screen classifies as waiting', () => {
    // Real frame from the bash-permission flow: the "Reading 1 file… (2s)" spinner is still
    // visible above the picker. Without waiting-before-working order, this would mis-classify.
    const mixed = [
      '● Reading 1 file… (2s)',
      '  ⎿  $ head -1 /etc/passwd',
      '',
      ' Bash command',
      '   head -1 /etc/passwd',
      '',
      ' Do you want to proceed?',
      ' ❯ 1. Yes',
      '   2. No',
    ].join('\n');
    expect(service.getStatusForTool(mixed, 'claude')).toBe('waiting');
  });
});
