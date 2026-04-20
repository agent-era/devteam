import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import {ensureDirectory} from './fileSystem.js';

function file(): string {
  return process.env.DEVTEAM_LAST_TRACKER_FILE
    || path.join(os.homedir(), '.cache', 'devteam', 'last-tracker.json');
}

export function getLastTrackerProject(): string | null {
  try {
    const parsed = JSON.parse(fs.readFileSync(file(), 'utf8'));
    return typeof parsed?.project === 'string' ? parsed.project : null;
  } catch {
    return null;
  }
}

export function setLastTrackerProject(name: string): void {
  try {
    ensureDirectory(path.dirname(file()));
    fs.writeFileSync(file(), JSON.stringify({project: name}), 'utf8');
  } catch {}
}
