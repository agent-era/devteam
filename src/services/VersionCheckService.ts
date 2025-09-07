import fs from 'node:fs';
import path from 'node:path';
import {PACKAGE_NAME} from '../constants.js';
import {logDebug, logError} from '../shared/utils/logger.js';
import type {VersionInfo} from './versionTypes.js';

export class VersionCheckService {
  private packageName: string;

  constructor(packageName: string = PACKAGE_NAME) {
    this.packageName = packageName;
  }

  async check(): Promise<VersionInfo | null> {
    try {
      const current = await this.getCurrentVersion();
      if (!current) return null;

      const latest = await this.getLatestVersionFromNpm();
      if (!latest) return null;

      const hasUpdate = this.isNewer(latest, current);
      let whatsNew: string | undefined;
      if (hasUpdate) whatsNew = await this.tryFetchWhatsNew(latest);

      return {
        current,
        latest,
        hasUpdate,
        whatsNew,
        url: `https://www.npmjs.com/package/${this.packageName}`
      };
    } catch (err) {
      logError('Version check failed', err);
      return null;
    }
  }

  private async getCurrentVersion(): Promise<string> {
    // Prefer env-provided version (present in many npm-run contexts)
    const envVersion = process.env.npm_package_version || process.env.DEVTEAM_VERSION;
    if (envVersion) return envVersion;
    // Fallback: read package.json from current working directory
    try {
      const pkgPath = path.resolve(process.cwd(), 'package.json');
      const content = await fs.promises.readFile(pkgPath, 'utf-8');
      const pkg = JSON.parse(content);
      return String(pkg.version || '');
    } catch (err) {
      logError('Failed to read current version from package.json', err);
      return '';
    }
  }

  private async getLatestVersionFromNpm(): Promise<string> {
    try {
      const encoded = encodeURIComponent(this.packageName);
      const res = await fetch(`https://registry.npmjs.org/${encoded}`);
      if (!res.ok) return '';
      const data: any = await res.json();
      const latestTag = data?.['dist-tags']?.latest;
      if (typeof latestTag === 'string') return latestTag;
      return '';
    } catch (err) {
      logError('Failed to fetch latest version from npm', err);
      return '';
    }
  }

  private isNewer(a: string, b: string): boolean {
    // Semver-aware compare (loose): split by dots and compare numerically
    const pa = a.split('.').map(n => parseInt(n, 10));
    const pb = b.split('.').map(n => parseInt(n, 10));
    for (let i = 0; i < Math.max(pa.length, pb.length); i++) {
      const da = pa[i] || 0;
      const db = pb[i] || 0;
      if (da > db) return true;
      if (da < db) return false;
    }
    return false;
  }

  private async tryFetchWhatsNew(version: string): Promise<string | undefined> {
    // CHANGELOG.md via unpkg. No other fallbacks.
    try {
      const encoded = encodeURIComponent(this.packageName);
      const url = `https://unpkg.com/${encoded}@${version}/CHANGELOG.md`;
      const res = await fetch(url);
      if (!res.ok) return undefined;
      const text = await res.text();
      return this.parseChangelogTopEntry(text, version);
    } catch (err) {
      logDebug('CHANGELOG fetch not available or parse failed');
      return undefined;
    }
  }

  private parseChangelogTopEntry(content: string, version: string): string | undefined {
    // Simple parser: find the section for the specified version or the first section
    // and return the first bullet or first non-empty line.
    const lines = content.split(/\r?\n/);
    let inSection = false;
    for (let i = 0; i < lines.length; i++) {
      const l = lines[i].trim();
      if (/^##?\s*\[?v?\d+\.\d+\.\d+\]?/i.test(l)) {
        // Enter section; if version string is present, prefer it
        inSection = l.includes(version) || (!inSection && true);
        if (!inSection) continue;
        // From here, find the first bullet or non-empty line
        for (let j = i + 1; j < Math.min(lines.length, i + 50); j++) {
          const s = lines[j].trim();
          if (!s) continue;
          if (s.startsWith('- ') || s.startsWith('* ')) {
            return s.replace(/^[-*]\s+/, '').trim();
          }
          // If it's a plain sentence, use it
          if (!s.startsWith('#')) return s;
        }
        break;
      }
    }
    return undefined;
  }
}
