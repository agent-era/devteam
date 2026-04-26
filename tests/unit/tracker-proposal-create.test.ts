import {describe, test, expect, beforeEach, afterEach} from '@jest/globals';
import fs from 'node:fs';
import path from 'node:path';
import os from 'node:os';
import {TrackerService, ProposalCandidate} from '../../src/services/TrackerService.js';

let tmpDir: string;
let service: TrackerService;

beforeEach(() => {
  tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), 'tracker-proposal-test-'));
  service = new TrackerService();
});

afterEach(() => {
  fs.rmSync(tmpDir, {recursive: true, force: true});
});

// Mirrors the logic in TrackerProposalScreen.handleSubmit
function acceptProposals(projectPath: string, proposals: ProposalCandidate[], accepted: Set<number>) {
  const tracker = new TrackerService();
  for (const index of accepted) {
    const item = proposals[index];
    if (item) {
      tracker.createItem(projectPath, item.title, 'backlog', item.slug, item.description);
    }
  }
}

describe('proposal acceptance: slug and description', () => {
  const proposals: ProposalCandidate[] = [
    {title: 'OAuth Login', slug: 'oauth-login', description: 'Implement Google and GitHub OAuth2 sign-in flows.'},
    {title: 'Dark Mode', slug: 'dark-mode', description: 'Add a dark color scheme toggle to settings.'},
  ];

  test('accepted proposal uses AI-derived slug (not slugified title)', () => {
    acceptProposals(tmpDir, proposals, new Set([0]));
    const index = JSON.parse(fs.readFileSync(path.join(tmpDir, 'tracker', 'index.json'), 'utf8'));
    expect(index.backlog.backlog).toContain('oauth-login');
    expect(index.backlog.backlog ?? []).not.toContain('oauth-login'.replace('-', '')); // not re-slugified
  });

  test('proposal description is stashed on sessions[slug].description for the worktree to drain', () => {
    acceptProposals(tmpDir, proposals, new Set([0]));
    const itemDir = path.join(tmpDir, 'tracker', 'items', 'oauth-login');
    expect(fs.existsSync(itemDir)).toBe(false);

    const index = JSON.parse(fs.readFileSync(path.join(tmpDir, 'tracker', 'index.json'), 'utf8'));
    expect(index.sessions['oauth-login'].title).toBe('OAuth Login');
    expect(index.sessions['oauth-login'].description).toBe('Implement Google and GitHub OAuth2 sign-in flows.');

    const worktreeDir = fs.mkdtempSync(path.join(os.tmpdir(), 'proposal-wt-'));
    try {
      service.ensureItemFiles(tmpDir, 'oauth-login', worktreeDir);
      const notesPath = path.join(worktreeDir, 'tracker', 'items', 'oauth-login', 'notes.md');
      expect(fs.readFileSync(notesPath, 'utf8')).toContain('Implement Google and GitHub OAuth2 sign-in flows.');
      expect(fs.existsSync(path.join(worktreeDir, 'tracker', 'items', 'oauth-login', 'requirements.md'))).toBe(false);
    } finally {
      fs.rmSync(worktreeDir, {recursive: true, force: true});
    }
  });

  test('accepting multiple proposals stashes a description for each on the index', () => {
    acceptProposals(tmpDir, proposals, new Set([0, 1]));
    const index = JSON.parse(fs.readFileSync(path.join(tmpDir, 'tracker', 'index.json'), 'utf8'));
    expect(index.backlog.backlog).toContain('oauth-login');
    expect(index.backlog.backlog).toContain('dark-mode');
    expect(index.sessions['dark-mode'].description).toBe('Add a dark color scheme toggle to settings.');
  });

  test('unaccepted proposals are not added to the index', () => {
    acceptProposals(tmpDir, proposals, new Set([0]));
    const index = JSON.parse(fs.readFileSync(path.join(tmpDir, 'tracker', 'index.json'), 'utf8'));
    expect(index.backlog.backlog ?? []).not.toContain('dark-mode');
    expect(index.sessions?.['dark-mode']).toBeUndefined();
  });
});
