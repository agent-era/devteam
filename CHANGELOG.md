# Changelog

All notable changes to this project will be documented in this file.

The format is based on Keep a Changelog, and this project adheres to Semantic Versioning.

## Unreleased
- Native markdown rendering in the tracker item detail view and the diff view
- Tracker detail view: tab strip across the top (Discovery / Requirements / Implement plus any extra `.md` files in the item dir); ←/→ moves tabs, ↑/↓ PgUp/PgDn g/G scroll. The first stage without an `.md` file shows a “press [enter] to advance” prompt; later empty stages are dimmed
- Diff view: `.md` lines render as styled markdown (headings/bold/italic/code/lists/blockquotes/HRs) instead of raw source. A pre-rendering pass scans each `.md` file’s pre/post images so per-line styling has full block context (e.g. lines inside fenced code render verbatim)
- 8 markdown themes (`bright`, `forest`, `sunset`, `ocean`, `neon`, `autumn`, `candy`, `mono`) with distinct colour palettes; press `[t]` to cycle
- Add changes here. The first bullet under each release is used as the short “what’s new” message in the app’s update notice.

## 1.1.2 - 2026-04-19
- Fix update banner showing stale current version when run from a directory that has its own `package.json`

## 1.1.1 - 2026-04-19
- Fix `Permission denied` when running `devteam` after global install (restore exec bit on bin script)

## 1.1.0 - 2026-04-19
- AI auto-resume, AI-assisted project settings screen, diff syntax highlighting, and major performance improvements

**New features**
- AI auto-resume: Enter reopens the last session (`claude --continue`, `codex resume --last`, `gemini --resume latest`); `T` forces the picker
- AI-assisted project settings screen (`c`) — Claude edits `.devteam/config.json` in the background; per-tool flags, `copyFiles`/`symlinkPaths`, and re-apply files after changes
- Diff view: syntax highlighting, green/red gutter on +/- lines, styled file/hunk headers, `p`/`n` to jump between files
- Worktree creation auto-suffixes names when a branch already exists from archive (`my-feature-2`, …)
- Archive now uses `git clean -fdx` and warns about untracked files before wiping them

**UI**
- Reorganized columns: `STATUS`, `AGENT`, `SHELL`, `EXEC`, `PROJECT/FEATURE`, `DIFF`, `COMMITS`, `PR` (CHANGES → COMMITS)
- Keybindings: `a` now opens agent session; `v` archives (was `a`)
- STATUS chip shows agent state (working/waiting) with color coding
- Consistent white row highlight; status column participates; SHELL/EXEC labels capitalized

**Performance**
- Cached `findBaseBranch` per repo path — eliminated the #1 CPU hotspot (~10% of CPU)
- New 30s-TTL cache for expensive git commands (merge-base, ahead/behind, upstream)
- GitHub API calls dramatically reduced (poll 5s → 5min) with event-based invalidation on push

**Fixes**
- Correct AI status detection for Claude Code; conservative terminal row budgeting; Claude `--continue` fallback
- Workspace row status chip rendering; `checking pr` now takes precedence over `pr ready`
- Shell pane closes when run program exits; don't show `not pushed` when an open PR exists

**Other**
- Updated vulnerable npm packages; added LICENSE

## 0.1.0 - 2025-09-07
- Initial public release.

