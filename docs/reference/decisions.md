# Design Decisions

Short ADR-style records for non-obvious choices.

---

## Core Engine pattern (not custom hooks)

**Decision:** Business logic lives in plain TypeScript classes (`WorktreeCore`, `GitHubCore`) that implement a `CoreBase<T>` observer interface. React contexts subscribe to them.

**Why:** React hooks tie logic to the render lifecycle, making it hard to test without rendering. Cores are testable as plain objects. The observer pattern lets React re-render on state change without polling.

**Trade-off:** Extra indirection (Core → Context → Component). Worth it because Cores can be unit-tested without fake React environments.

---

## PR status in a separate Core

**Decision:** `GitHubCore` is separate from `WorktreeCore`, not a field on the worktree refresh loop.

**Why:** PR fetching is network I/O with its own rate-limit budget. Keeping it separate lets us throttle and batch independently of the local git/tmux polling. It also means a slow GitHub API call does not delay the local refresh.

---

## Disk cache keyed by commit hash

**Decision:** `PRStatusCacheService` stores entries keyed by `{path}:{commitHash}`. No TTL.

**Why:** PR status is invalidated by new commits, not by time. A TTL would either expire too quickly (repeated API calls) or be stale for old commits. Commit-hash keying means reads are cache hits until the user actually pushes new work.

---

## Deterministic tmux session naming

**Decision:** Session names are derived from project + feature name, not stored IDs.

**Why:** The app may restart between user sessions. Storing session IDs would require a persistence layer. Deterministic names let the app re-attach after restart with no state.

**Trade-off:** If the user renames a branch, the old session is orphaned. The app does not clean up orphaned sessions automatically.

---

## Workspace header rows are synthetic

**Decision:** Workspace group headers in the list are `WorktreeInfo` objects with `is_workspace_header: true`, not a separate type.

**Why:** `WorktreeListScreen` renders a flat array of `WorktreeInfo`. A separate type would require union type handling throughout the render path. Synthetic rows with a flag are simpler.

**Trade-off:** Callers must guard against `is_workspace_header` rows when doing operations that only apply to real worktrees.

---

## ArchivedScreen removed

**Decision:** Archived worktrees are not shown in the main list. There is no separate archived view.

**Why:** The archived view added complexity without much utility. Users can restore archived branches via the branch picker (`b`).

---

## GitHub API polling frequency increase

**Decision:** PR refresh interval is deliberately long to reduce GitHub API rate-limit hits.

**Why:** In multi-project setups with many worktrees, a short interval causes consistent rate-limit errors during the workday. The longer interval trades freshness for reliability.
