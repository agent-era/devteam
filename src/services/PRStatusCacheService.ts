import fs from 'node:fs';
import path from 'node:path';
import os from 'node:os';
import {PRStatus} from '../models.js';
import {
  PR_TTL_MERGED_MS,
  PR_TTL_NO_PR_MS,
  PR_TTL_ERROR_MS,
  PR_TTL_CHECKS_FAIL_MS,
  PR_TTL_CHECKS_PENDING_MS,
  PR_TTL_PASSING_OPEN_MS,
  PR_TTL_OPEN_MS,
  PR_TTL_CLOSED_MS,
  PR_TTL_UNKNOWN_MS,
  PR_TTL_FALLBACK_MS,
} from '../constants.js';
import {runCommandQuick} from '../shared/utils/commandExecutor.js';

interface CacheEntry {
  data: any; // Raw data that will be used to reconstruct PRStatus
  timestamp: number;
  commitHash?: string;
  remoteCommitHash?: string;
  ttl: number; // TTL in milliseconds
}

interface CacheData {
  [worktreePath: string]: CacheEntry;
}

export class PRStatusCacheService {
  private cacheFilePath: string;
  private cache: CacheData;
  private readonly CACHE_DIR = path.join(os.homedir(), '.cache', 'coding-agent-team');
  private static MEMORY_CACHE: CacheData = {};

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

    // Check git-aware invalidation (local commits)
    if (entry.commitHash && !this.isCommitHashValid(worktreePath, entry.commitHash)) {
      delete this.cache[worktreePath];
      this.saveToDisk();
      return null;
    }

    // Check remote commit invalidation
    if (entry.remoteCommitHash && !this.isRemoteCommitHashValid(worktreePath, entry.remoteCommitHash)) {
      delete this.cache[worktreePath];
      this.saveToDisk();
      return null;
    }

    // Reconstruct PRStatus with methods
    const prStatus = this.reconstructPRStatus(entry.data);
    
    // Safety check: don't return cached entries with invalid loadingStatus
    if (prStatus.loadingStatus === 'not_checked' || prStatus.loadingStatus === 'loading') {
      delete this.cache[worktreePath];
      this.saveToDisk();
      return null;
    }

    return prStatus;
  }

  /**
   * Store PR status in cache with appropriate TTL
   */
  set(worktreePath: string, prStatus: PRStatus): void {
    const ttl = this.getTTL(prStatus);
    
    // Don't cache states that have TTL = 0
    if (ttl === 0) {
      return;
    }
    
    const commitHash = this.getCurrentCommitHash(worktreePath);
    const remoteCommitHash = this.getRemoteCommitHash(worktreePath);

    this.cache[worktreePath] = {
      data: this.serializePRStatus(prStatus),
      timestamp: Date.now(),
      commitHash,
      remoteCommitHash,
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

    // Check local commit hash if present
    if (entry.commitHash && !this.isCommitHashValid(worktreePath, entry.commitHash)) {
      return false;
    }

    // Check remote commit hash if present
    if (entry.remoteCommitHash && !this.isRemoteCommitHashValid(worktreePath, entry.remoteCommitHash)) {
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
   * Invalidate multiple worktree cache entries
   */
  invalidateMultiple(worktreePaths: string[]): void {
    let invalidated = 0;
    for (const path of worktreePaths) {
      if (this.cache[path]) {
        delete this.cache[path];
        invalidated++;
      }
    }
    
    if (invalidated > 0) {
      this.saveToDisk();
    }
  }

  /**
   * Invalidate cache entries by PR number
   */
  invalidateByPRNumber(prNumber: number): void {
    const toDelete: string[] = [];
    
    for (const [path, entry] of Object.entries(this.cache)) {
      if (entry.data.number === prNumber) {
        toDelete.push(path);
      }
    }
    
    for (const path of toDelete) {
      delete this.cache[path];
    }
    
    if (toDelete.length > 0) {
      this.saveToDisk();
    }
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
    // Dynamic TTL based on loading status first, then PR state
    switch (prStatus.loadingStatus) {
      case 'not_checked':
      case 'loading':
        return 0;  // Don't cache these states
        
      case 'no_pr':
        return PR_TTL_NO_PR_MS;
        
      case 'error':
        return PR_TTL_ERROR_MS;  // errors cache briefly
        
      case 'exists':
        // For existing PRs, use dynamic TTL based on PR state
        if (prStatus.is_merged) {
          // Merged PRs never change - cache indefinitely (1 year)
          return PR_TTL_MERGED_MS;
        }

        if (prStatus.checks === 'failing') return PR_TTL_CHECKS_FAIL_MS;

        if (prStatus.checks === 'pending') return PR_TTL_CHECKS_PENDING_MS;

        if (prStatus.checks === 'passing' && prStatus.state === 'OPEN') return PR_TTL_PASSING_OPEN_MS;

        if (prStatus.state === 'OPEN') return PR_TTL_OPEN_MS;

        if (prStatus.state === 'CLOSED') return PR_TTL_CLOSED_MS;

        // Unknown PR state - moderate TTL
        return PR_TTL_UNKNOWN_MS;
        
      default:
        // Fallback for unknown loading status
        return PR_TTL_FALLBACK_MS;
    }
  }

  private getCurrentCommitHash(worktreePath: string): string | undefined {
    try {
      return runCommandQuick(['git', '-C', worktreePath, 'rev-parse', 'HEAD'])?.trim();
    } catch {
      return undefined;
    }
  }

  private getRemoteCommitHash(worktreePath: string): string | undefined {
    try {
      // Get the remote tracking branch for current branch
      const currentBranch = runCommandQuick(['git', '-C', worktreePath, 'branch', '--show-current'])?.trim();
      if (!currentBranch) return undefined;
      
      // Get remote commit hash for the tracking branch
      const remoteRef = `origin/${currentBranch}`;
      return runCommandQuick(['git', '-C', worktreePath, 'rev-parse', remoteRef])?.trim();
    } catch {
      return undefined;
    }
  }

  private isCommitHashValid(worktreePath: string, cachedHash: string): boolean {
    const currentHash = this.getCurrentCommitHash(worktreePath);
    return currentHash === cachedHash;
  }

  private isRemoteCommitHashValid(worktreePath: string, cachedRemoteHash: string): boolean {
    const currentRemoteHash = this.getRemoteCommitHash(worktreePath);
    return currentRemoteHash === cachedRemoteHash;
  }

  private serializePRStatus(prStatus: PRStatus): any {
    // Extract all properties for JSON serialization
    return {
      loadingStatus: prStatus.loadingStatus,
      number: prStatus.number,
      state: prStatus.state,
      checks: prStatus.checks,
      // Note: loading field removed, use loadingStatus instead
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
      } else if (Object.keys(PRStatusCacheService.MEMORY_CACHE).length > 0) {
        // Fallback to in-memory cache when file not present
        this.cache = {...PRStatusCacheService.MEMORY_CACHE};
      }
    } catch (error) {
      // Silent failure - start with empty cache
      this.cache = {...PRStatusCacheService.MEMORY_CACHE};
    }
  }

  private saveToDisk(): void {
    try {
      // Ensure cache directory exists
      if (!fs.existsSync(this.CACHE_DIR)) {
        fs.mkdirSync(this.CACHE_DIR, {recursive: true});
      }

      // Keep an in-memory copy to support test environments without filesystem persistence
      PRStatusCacheService.MEMORY_CACHE = {...this.cache};
      fs.writeFileSync(this.cacheFilePath, JSON.stringify(this.cache, null, 2), 'utf8');
    } catch (error) {
      // Silent failure - cache continues to work in memory
      PRStatusCacheService.MEMORY_CACHE = {...this.cache};
    }
  }
}
