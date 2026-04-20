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

  test('proposal description is written to notes.md (discovery output)', () => {
    acceptProposals(tmpDir, proposals, new Set([0]));
    const notesPath = path.join(tmpDir, 'tracker', 'items', 'oauth-login', 'notes.md');
    expect(fs.existsSync(notesPath)).toBe(true);
    expect(fs.readFileSync(notesPath, 'utf8')).toContain('Implement Google and GitHub OAuth2 sign-in flows.');
    const reqPath = path.join(tmpDir, 'tracker', 'items', 'oauth-login', 'requirements.md');
    const reqContent = fs.readFileSync(reqPath, 'utf8');
    expect(reqContent).toMatch(/^title: "OAuth Login"$/m);
    expect(reqContent).toMatch(/^slug: oauth-login$/m);
    expect(reqContent).not.toContain('Implement Google and GitHub OAuth2 sign-in flows.');
  });

  test('accepting multiple proposals creates notes.md for each with its description', () => {
    acceptProposals(tmpDir, proposals, new Set([0, 1]));
    const index = JSON.parse(fs.readFileSync(path.join(tmpDir, 'tracker', 'index.json'), 'utf8'));
    expect(index.backlog.backlog).toContain('oauth-login');
    expect(index.backlog.backlog).toContain('dark-mode');

    const notesDark = path.join(tmpDir, 'tracker', 'items', 'dark-mode', 'notes.md');
    expect(fs.readFileSync(notesDark, 'utf8')).toContain('Add a dark color scheme toggle to settings.');
  });

  test('unaccepted proposals are not created', () => {
    acceptProposals(tmpDir, proposals, new Set([0]));
    const darkDir = path.join(tmpDir, 'tracker', 'items', 'dark-mode');
    expect(fs.existsSync(darkDir)).toBe(false);
  });
});
