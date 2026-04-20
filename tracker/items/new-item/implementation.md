---
title: new-item
slug: new-item
updated: 2026-04-20
---

## What was built

AI-driven slug derivation for new tracker items. When a user creates a new item by typing a full natural-language description and pressing Enter, the item now:

1. Appears immediately on the board with the slugified version of the title as a temporary slug, paired with a braille spinner animation (`deriving slug…` secondary text) so the user knows something is in progress.
2. Calls `claude -p` in the background via the existing `runClaudeAsync` utility asking for a concise 2–4 word kebab-case slug.
3. Once the AI responds (or falls back after 8s timeout), renames the item to the final slug and reloads the board. If the derived slug conflicts with an existing one, a numeric suffix is appended.

The full typed description is stored as `title` in `sessions[slug]` (and later in `requirements.md` frontmatter), while the slug is now meaningful and short.

## Key decisions

- **No dialog**: kept inline typing UX, just decoupled title from slug.
- **Immediate board appearance**: create with temp slug first, rename after AI responds. No waiting before the item is visible.
- **Spinner animation**: `SPINNER_CHARS` braille cycle driven by a `setInterval` that only runs when `pendingCreations.size > 0` to avoid unnecessary re-renders.
- **Graceful fallback**: on timeout or AI error, the slugified title stays as the final slug — no user-visible failure.
- **`renameItem` is atomic**: rewrites `index.json` via `writeJSONAtomic` and optionally renames the item directory if it already exists on disk.

## Files changed

- `src/services/TrackerService.ts`: added `deriveSlug()` and `renameItem()` public methods
- `src/screens/TrackerBoardScreen.tsx`: async `handleCreateSubmit`, `pendingCreations` state, spinner animation
- `tests/unit/tracker.test.ts`: 5 new tests for `renameItem`
