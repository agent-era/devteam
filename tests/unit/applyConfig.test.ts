import {describe, test, expect} from '@jest/globals';
import {WorktreeCore} from '../../src/cores/WorktreeCore.js';

// applyConfig should reject malformed JSON and surface the parse error
// without calling the git layer.
describe('WorktreeCore.applyConfig', () => {
  test('rejects malformed JSON without writing', () => {
    let writeCalls = 0;
    const git = {
      basePath: '/fake',
      writeRunConfig() { writeCalls++; },
    } as any;
    const core = new WorktreeCore({git, tmux: {} as any} as any);

    const result = core.applyConfig('proj', '{not valid');
    expect(result.success).toBe(false);
    expect(result.error).toMatch(/Invalid JSON/);
    expect(writeCalls).toBe(0);
  });

  test('writes when JSON is valid', () => {
    let writtenContent: string | null = null;
    const git = {
      basePath: '/fake',
      writeRunConfig(_project: string, content: string) { writtenContent = content; },
    } as any;
    const core = new WorktreeCore({git, tmux: {} as any} as any);

    const payload = '{"executionInstructions":{"mainCommand":"npm start"}}';
    const result = core.applyConfig('proj', payload);
    expect(result.success).toBe(true);
    expect(writtenContent).toBe(payload);
  });

  test('reports filesystem errors from the git layer', () => {
    const git = {
      basePath: '/fake',
      writeRunConfig() { throw new Error('ENOSPC: no space'); },
    } as any;
    const core = new WorktreeCore({git, tmux: {} as any} as any);

    const result = core.applyConfig('proj', '{}');
    expect(result.success).toBe(false);
    expect(result.error).toMatch(/ENOSPC/);
  });
});
