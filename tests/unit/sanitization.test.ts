import {describe, test, expect} from '@jest/globals';
import {sanitizeFeatureName} from '../../src/shared/utils/validation.js';
import {TmuxService} from '../../src/services/TmuxService.js';

describe('Sanitization helpers', () => {
  test('sanitizeFeatureName enforces allowed charset and length', () => {
    const raw = '../../weird name! with * chars and way-too-long-'.repeat(3);
    const safe = sanitizeFeatureName(raw);
    expect(safe).toMatch(/^[a-zA-Z0-9_-]+$/);
    expect(safe.length).toBeLessThanOrEqual(100);
    expect(safe).not.toContain('..');
    expect(safe).not.toContain(' ');
  });

  test('TmuxService.sessionName returns sanitized names', () => {
    const t = new TmuxService();
    const sess = t.sessionName('proj$', 'feat;rm -rf');
    // format: dev-<project>-<feature> with only safe chars
    expect(sess).toMatch(/^dev-[a-zA-Z0-9_-]+-[a-zA-Z0-9_-]+$/);
  });
});

