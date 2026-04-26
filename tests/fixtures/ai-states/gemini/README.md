These gemini fixtures are **curated**, not live captures.

The `capture-ai-states` skill (`.claude/skills/capture-ai-states/`) drives claude and codex live, but Gemini's per-project oauth picker fires on every fresh `mktemp` sandbox even with `--skip-trust` and a global `selectedAuthType`, and there's no automated way to dismiss it. The script raises a clear error per cell when it hits the auth picker.

When regenerating these fixtures, either:
1. Run `gemini` interactively in the target sandbox dir first, complete oauth, then re-run the capture skill on that dir, OR
2. Manually grab a `tmux capture-pane -p -S -50` while gemini is in each state and replace the file.

If gemini's UI changes meaningfully (banner, footer, picker shape), update these by hand and the detector tests will catch any regressions.
