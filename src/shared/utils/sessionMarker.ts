import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import crypto from 'node:crypto';
import {DIR_BRANCHES_SUFFIX, SESSION_PREFIX} from '../../constants.js';
import {ensureDirectory} from './fileSystem.js';
import {logError} from './logger.js';

type SessionMarkerKind = 'worktree' | 'workspace';

type SessionMarkerPayload = {
  v: 1;
  session: string;
  project: string;
  feature: string;
  kind: SessionMarkerKind;
};

function baseDir(): string {
  return process.env.DEVTEAM_SESSION_MARKER_DIR
    || path.join(os.homedir(), '.cache', 'devteam', 'session-markers');
}

function legacyPath(cwd: string): string {
  return path.join(cwd, '.devteam-session');
}

function fileFor(cwd: string): string {
  const key = crypto.createHash('sha1').update(path.resolve(cwd)).digest('hex');
  return path.join(baseDir(), `${key}.json`);
}

function derivePayload(cwd: string): SessionMarkerPayload | null {
  const resolved = path.resolve(cwd);
  const feature = path.basename(resolved);
  const parent = path.basename(path.dirname(resolved));

  if (parent === 'workspaces') {
    return {
      v: 1,
      session: `${SESSION_PREFIX}workspace-${feature}`,
      project: 'workspace',
      feature,
      kind: 'workspace',
    };
  }

  if (parent.endsWith(DIR_BRANCHES_SUFFIX)) {
    const project = parent.slice(0, -DIR_BRANCHES_SUFFIX.length);
    return {
      v: 1,
      session: `${SESSION_PREFIX}${project}-${feature}`,
      project,
      feature,
      kind: 'worktree',
    };
  }

  return null;
}

export function getSessionMarkerPath(cwd: string): string {
  return fileFor(cwd);
}

export function writeCurrentSessionMarker(cwd: string = process.cwd()): void {
  const payload = derivePayload(cwd);
  if (!payload) return;

  try {
    ensureDirectory(baseDir());
    fs.writeFileSync(fileFor(cwd), JSON.stringify(payload, null, 2), 'utf8');
  } catch (err) {
    logError('sessionMarker.writeCurrentSessionMarker failed', {
      error: err instanceof Error ? err.message : String(err),
      cwd,
    });
    return;
  }

  try {
    fs.rmSync(legacyPath(cwd), {force: true});
  } catch {}
}
