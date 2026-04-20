---
title: new-item
slug: new-item
updated: 2026-04-20
---

## User problem

When creating a new tracker item, the user types inline (good UX) but whatever they type is immediately slugified and truncated to 20 chars. The user wants to type a full description like "Fix login button color on mobile devices" but the current flow loses that information — the slug becomes `fix-login-button-col` and is used as both the identifier and display name. The user's natural-language description is not a good slug, and the slug is not a good description.

Root cause: `createTitle` state is used as both the display name and the slug source. `slugify()` truncates to 20 chars, so long titles lose information. The full title IS stored in `sessions[slug].title` and `requirements.md` frontmatter, but the 20-char truncation means even the title can be wrong.

## Recommendation

Decouple title from slug:

1. **Keep inline typing** for the full title/description — user likes this UX.
2. **After Enter**, call a small AI agent (Claude API, haiku) to derive a short memorable slug from the full title (e.g. "fix-login-button-color"). Show the proposed slug briefly or just accept it.
3. Store the full title as the display name on the board; use the AI-derived slug as the filesystem identifier.
4. No dialog needed — the async slug generation can happen after the item appears on the board with the full title already visible.

Alternatively (simpler, no AI): generate slug from first 3-4 significant words + short hash suffix to ensure uniqueness. This avoids async complexity but produces less memorable slugs.

AI approach is preferred per user's stated preference.
