# GitHub and PR Caching

## Overview

`GitHubCore` manages PR status for all visible worktrees. It batches GitHub API calls, caches results on disk, and throttles refreshes to avoid rate limits.

## Cache design

`PRStatusCacheService` stores `PRStatus` objects keyed by `{worktree-path}:{commit-hash}`.

**Invalidation rule:** a cache entry is valid only when the worktree's current HEAD commit matches the cached commit. A new commit or a merge automatically causes a cache miss on the next poll.

This means:
- Reading PRs is fast (disk hit) when code hasn't changed.
- No manual cache busting is needed; git history drives freshness.

## Refresh strategy

GitHubCore tracks which worktrees are currently visible on screen (`visibleWorktrees`). Only those paths are polled on each refresh cycle (~30 s). When the user scrolls, `setVisibleWorktrees()` updates the set.

Batch fetches call `gh pr list` or `gh pr view` via `GitHubService`. Results are merged into the `pullRequests` map and written to the disk cache.

Rate-limit avoidance: the refresh interval is deliberately long to avoid GitHub API rate limits in multi-project setups with many worktrees. See `src/cores/GitHubCore.ts` for current interval constants.

## PRStatus model

See [concepts/status-model.md](../concepts/status-model.md) for the full `PRStatus` definition.

## PR operations

`GitHubContext` exposes `createPR()` and `mergePR()`. Both call through to `GitHubService` which shells out to `gh pr create` / `gh pr merge`. After a successful operation the cache entry for the affected worktree is cleared and a refresh is triggered.
