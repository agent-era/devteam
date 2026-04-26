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
});
