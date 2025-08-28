import fs from 'node:fs';
import path from 'node:path';
import os from 'node:os';
import {PRStatus} from '../models.js';
import {runCommandQuick} from '../utils.js';

interface CacheEntry {
  data: any; // Raw data that will be used to reconstruct PRStatus
  timestamp: number;
  commitHash?: string;
  ttl: number; // TTL in milliseconds
}

interface CacheData {
  [worktreePath: string]: CacheEntry;
}

export class PRStatusCacheService {
  private cacheFilePath: string;
  private cache: CacheData;
  private readonly CACHE_DIR = path.join(os.homedir(), '.cache', 'coding-agent-team');

  constructor() {
    this.cacheFilePath = path.join(this.CACHE_DIR, 'pr-cache.json');
    this.cache = {};
    this.loadFromDisk();
  }

  /**
   * Get PR status from cache if valid, otherwise return null
   */
  get(worktreePath: string): PRStatus | null {
    const entry = this.cache[worktreePath];
    if (!entry) return null;

    // Check if cache entry has expired
    if (Date.now() - entry.timestamp > entry.ttl) {
      delete this.cache[worktreePath];
      this.saveToDisk();
      return null;
    }

    // Check git-aware invalidation
    if (entry.commitHash && !this.isCommitHashValid(worktreePath, entry.commitHash)) {
      delete this.cache[worktreePath];
      this.saveToDisk();
      return null;
    }

    // Reconstruct PRStatus with methods
    return this.reconstructPRStatus(entry.data);
  }

  /**
   * Store PR status in cache with appropriate TTL
   */
  set(worktreePath: string, prStatus: PRStatus): void {
    const ttl = this.getTTL(prStatus);
    const commitHash = this.getCurrentCommitHash(worktreePath);

    this.cache[worktreePath] = {
      data: this.serializePRStatus(prStatus),
      timestamp: Date.now(),
      commitHash,
      ttl
    };

    this.saveToDisk();
  }

  /**
   * Check if cache entry is valid without returning the data
   */
  isValid(worktreePath: string): boolean {
    const entry = this.cache[worktreePath];
    if (!entry) return false;

    // Check TTL
    if (Date.now() - entry.timestamp > entry.ttl) {
      return false;
    }

    // Check commit hash if present
    if (entry.commitHash && !this.isCommitHashValid(worktreePath, entry.commitHash)) {
      return false;
    }

    return true;
  }

  /**
   * Invalidate specific worktree cache entry
   */
  invalidate(worktreePath: string): void {
    delete this.cache[worktreePath];
    this.saveToDisk();
  }

  /**
   * Clear all cache entries
   */
  clear(): void {
    this.cache = {};
    this.saveToDisk();
  }

  /**
   * Get all cached worktree paths
   */
  getCachedPaths(): string[] {
    return Object.keys(this.cache);
  }

  /**
   * Get cache statistics
   */
  getStats(): {total: number; valid: number; expired: number} {
    const total = Object.keys(this.cache).length;
    let valid = 0;
    let expired = 0;

    for (const worktreePath of Object.keys(this.cache)) {
      if (this.isValid(worktreePath)) {
        valid++;
      } else {
        expired++;
      }
    }

    return {total, valid, expired};
  }

  /**
   * Clean up expired entries
   */
  cleanup(): void {
    const paths = Object.keys(this.cache);
    let cleaned = 0;

    for (const worktreePath of paths) {
      if (!this.isValid(worktreePath)) {
        delete this.cache[worktreePath];
        cleaned++;
      }
    }

    if (cleaned > 0) {
      this.saveToDisk();
    }
  }

  // Private methods

  private getTTL(prStatus: PRStatus): number {
    // Dynamic TTL based on PR state
    if (prStatus.is_merged) {
      // Merged PRs never change - cache indefinitely (1 year)
      return 365 * 24 * 60 * 60 * 1000;
    }

    if (prStatus.checks === 'failing') {
      // Failing checks might be fixed quickly
      return 2 * 60 * 1000; // 2 minutes
    }

    if (prStatus.state === 'OPEN') {
      // Open PRs change moderately
      return 5 * 60 * 1000; // 5 minutes
    }

    if (prStatus.state === 'CLOSED') {
      // Closed PRs rarely change
      return 60 * 60 * 1000; // 1 hour
    }

    // No PR or unknown state
    return 10 * 60 * 1000; // 10 minutes
  }

  private getCurrentCommitHash(worktreePath: string): string | undefined {
    try {
      return runCommandQuick(['git', '-C', worktreePath, 'rev-parse', 'HEAD'])?.trim();
    } catch {
      return undefined;
    }
  }

  private isCommitHashValid(worktreePath: string, cachedHash: string): boolean {
    const currentHash = this.getCurrentCommitHash(worktreePath);
    return currentHash === cachedHash;
  }

  private serializePRStatus(prStatus: PRStatus): any {
    // Extract all properties for JSON serialization
    return {
      number: prStatus.number,
      state: prStatus.state,
      checks: prStatus.checks,
      loading: prStatus.loading,
      url: prStatus.url,
      head: prStatus.head,
      title: prStatus.title,
      mergeable: prStatus.mergeable
    };
  }

  private reconstructPRStatus(data: any): PRStatus {
    // Reconstruct PRStatus instance with methods
    return new PRStatus(data);
  }

  private loadFromDisk(): void {
    try {
      // Ensure cache directory exists
      if (!fs.existsSync(this.CACHE_DIR)) {
        fs.mkdirSync(this.CACHE_DIR, {recursive: true});
      }

      if (fs.existsSync(this.cacheFilePath)) {
        const content = fs.readFileSync(this.cacheFilePath, 'utf8');
        this.cache = JSON.parse(content);
      }
    } catch (error) {
      // Silent failure - start with empty cache
      this.cache = {};
    }
  }

  private saveToDisk(): void {
    try {
      // Ensure cache directory exists
      if (!fs.existsSync(this.CACHE_DIR)) {
        fs.mkdirSync(this.CACHE_DIR, {recursive: true});
      }

      fs.writeFileSync(this.cacheFilePath, JSON.stringify(this.cache, null, 2), 'utf8');
    } catch (error) {
      // Silent failure - cache continues to work in memory
    }
  }
}