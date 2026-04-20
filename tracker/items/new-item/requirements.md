---
title: new-item
slug: new-item
updated: 2026-04-20
---

## User stories

- As a developer, I want to type a full natural-language description when creating a tracker item so that I can capture my intent without worrying about slug constraints.
- As a developer, I want a meaningful short slug auto-derived from my description so that the board and filesystem remain navigable without me having to manually craft one.
- As a developer, I want visual feedback while the slug is being derived so I know something is happening.

## Summary

Currently, new item creation uses inline typing where the typed text is both the display title and the slug source. The slug is truncated to 20 characters, losing information when the user types a natural-language description. The fix: allow unrestricted inline typing, then call Claude Haiku async to derive a concise memorable slug. The item appears on the board immediately in a "deriving" state; once the slug is ready the item transitions to its final name. The board continues to display slugs (not full titles), but slugs will now be meaningful because they're AI-derived from a full description.

## Acceptance criteria

1. The inline input accepts any length of text with no truncation visible during typing.
2. On Enter, the item immediately appears on the board with a "pending" visual state (e.g. spinner or pulsing animation on the slug placeholder).
3. A Claude Haiku API call is made in the background with the full typed description, asking it to produce a short (2–4 word) kebab-case slug.
4. The derived slug is unique — if it conflicts with an existing item, append a numeric suffix (e.g. `login-button-2`).
5. Once the slug is received, the pending item transitions to its final slug with a brief visual transition (e.g. the text resolves/snaps into place).
6. If the AI call fails (error or timeout after ~5s), fall back to the current slugify behavior (first 20 chars, kebab-cased) so creation never hangs.
7. The full typed description is stored as the `title` in `tracker/index.json` sessions and in `requirements.md` frontmatter (not the slug).
8. The board card continues to show the slug as the primary display text (unchanged board layout).
