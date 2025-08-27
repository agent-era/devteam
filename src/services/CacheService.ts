import fs from 'node:fs';
import path from 'node:path';
import {PRStatus} from '../models.js';
import {runCommandQuick} from '../utils.js';

export interface CachedPREntry {
  pr: PRStatus;
  timestamp: number;
  git_commit_hash?: string;
  pr_state?: string;
  remote_ahead?: number;
}

export interface CachedPRData {
  [worktreePath: string]: CachedPREntry;
}

export class CacheService {
  private cacheDir: string;
  private cacheFile: string;

  constructor(cacheDir?: string) {
    this.cacheDir = cacheDir || path.join(process.env.HOME || '~', '.cache', 'coding-agent-team');
    this.cacheFile = path.join(this.cacheDir, 'pr-status.json');
  }

  private getTTLForPRState(entry: CachedPREntry): number {
    const pr = entry.pr;
    
    if (pr.state === 'MERGED') return Infinity;
    if (pr.checks === 'failing') return 2 * 60 * 1000;
    if (pr.state === 'OPEN') return 5 * 60 * 1000;
    if (!pr.number) return 10 * 60 * 1000;
    
    return 5 * 60 * 1000;
  }

  private getCurrentCommitHash(worktreePath: string): string | null {
    const hash = runCommandQuick(['git', '-C', worktreePath, 'rev-parse', 'HEAD']);
    return hash || null;
  }

  private getRemoteAheadCount(worktreePath: string): number {
    const result = runCommandQuick(['git', '-C', worktreePath, 'rev-list', '--left-right', '--count', 'HEAD...@{u}']);
    if (!result || result.includes('fatal') || result.includes('no upstream')) {
      return 0;
    }
    const counts = result.split('\t');
    return Number(counts[0]) || 0;
  }

  private ensureCacheDir(): void {
    if (!fs.existsSync(this.cacheDir)) {
      fs.mkdirSync(this.cacheDir, { recursive: true });
    }
  }

  loadCache(): CachedPRData {
    try {
      if (!fs.existsSync(this.cacheFile)) return {};
      
      const data = fs.readFileSync(this.cacheFile, 'utf8');
      return JSON.parse(data) as CachedPRData;
    } catch {
      return {};
    }
  }

  saveCache(prData: Record<string, PRStatus>): void {
    try {
      this.ensureCacheDir();
      
      const existingCache = this.loadCache();
      const now = Date.now();
      
      for (const [path, pr] of Object.entries(prData)) {
        existingCache[path] = {
          pr,
          timestamp: now,
          git_commit_hash: this.getCurrentCommitHash(path) || undefined,
          pr_state: pr.state || undefined,
          remote_ahead: this.getRemoteAheadCount(path)
        };
      }
      
      fs.writeFileSync(this.cacheFile, JSON.stringify(existingCache, null, 2));
    } catch {
      // Silent fail to prevent UI crashes
    }
  }

  clearCache(worktreePath?: string): void {
    try {
      if (worktreePath) {
        const cache = this.loadCache();
        delete cache[worktreePath];
        fs.writeFileSync(this.cacheFile, JSON.stringify(cache, null, 2));
      } else if (fs.existsSync(this.cacheFile)) {
        fs.unlinkSync(this.cacheFile);
      }
    } catch {
      // Silent fail to prevent UI crashes
    }
  }

  isEntryValid(worktreePath: string, entry: CachedPREntry): boolean {
    const ttl = this.getTTLForPRState(entry);
    if (Date.now() - entry.timestamp > ttl) return false;
    
    const currentCommitHash = this.getCurrentCommitHash(worktreePath);
    if (currentCommitHash && entry.git_commit_hash && currentCommitHash !== entry.git_commit_hash) {
      return false;
    }
    
    const currentRemoteAhead = this.getRemoteAheadCount(worktreePath);
    return entry.remote_ahead === undefined || currentRemoteAhead === entry.remote_ahead;
  }


  getCachedPRs(): Record<string, PRStatus> {
    const cache = this.loadCache();
    const result: Record<string, PRStatus> = {};
    
    for (const [path, entry] of Object.entries(cache)) {
      if (this.isEntryValid(path, entry)) {
        // Reconstruct PRStatus object to restore methods
        result[path] = new PRStatus(entry.pr);
      }
    }
    
    return result;
  }

  getInvalidatedPaths(worktreePaths: string[]): string[] {
    const cache = this.loadCache();
    const invalidated: string[] = [];
    
    for (const path of worktreePaths) {
      const entry = cache[path];
      if (!entry || !this.isEntryValid(path, entry)) {
        invalidated.push(path);
      }
    }
    
    return invalidated;
  }
}