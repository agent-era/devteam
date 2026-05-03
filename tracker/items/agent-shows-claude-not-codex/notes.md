# Discovery — agent-shows-claude-not-codex

## Problem

When a worktree is running Codex (or Gemini), the kanban / status UI sometimes labels the agent as "Claude" instead of the tool that is actually attached. This was hit on this very branch: a Codex session launched with the tracker prompt for slug `agent-shows-claude-not-codex` is misdetected as `claude`.

## Findings

**Root cause** — `AIToolService.detectToolFromArgs` uses a loose substring match:

```ts
// src/services/AIToolService.ts:86-100
const argsLower = args.toLowerCase();
if (argsLower.includes('/claude') || argsLower.includes('claude')) return 'claude';
if (argsLower.includes('/codex')  || argsLower.includes('codex'))  return 'codex';
if (argsLower.includes('/gemini') || argsLower.includes('gemini')) return 'gemini';
```

The bare `.includes('claude')` matches any occurrence of the literal string anywhere in the process command line — not just the binary name. Claude is also checked first, so any string containing "claude" wins over "codex" / "gemini".

**Where args comes from** — `detectAllSessionAITools` reads `pane_pid` for each `dev-*` tmux session, then `ps -p <pid> -o args=` returns that process's command line (`AIToolService.ts:37-81`). For the resume-or-fresh chain (`WorktreeCore.launchAISessionWithFallback`, line 620), `tmux new-session ... '<resume> || <fresh>'` causes the pane's first process to be `/bin/sh -c "<resume> || <fresh>"`. So the args string includes the full resume + fresh commands, all flags, and `initialPrompt` if any — and any of those substrings can contain "claude".

**Reproduction** — verified with the exact detection function:

```
detectToolFromArgs("bash -c codex resume --last 'fix claude bug' || codex 'fix claude bug'")
  → "claude"   (BUG: actual tool is codex)

detectToolFromArgs("bash -c codex resume --last 'agent-shows-claude-not-codex' || codex 'agent-shows-claude-not-codex'")
  → "claude"   (BUG: this is the live scenario for this branch)

detectToolFromArgs("node /home/user/.claude-tools/codex/bin/codex")
  → "claude"   (BUG: codex installed under a path containing 'claude')
```

The opposite direction (claude misdetected as codex) doesn't trigger, because the `claude` binary name virtually always appears in a Claude pane's args before any `codex`/`gemini` substring.

**Triggers in practice**
1. `initialPrompt` passed to `launchAISessionWithFallback` (line 615) when the prompt text contains "claude" — common for tracker items whose slug or description mentions Claude (e.g. this branch).
2. `displayName` for Claude is set to `${feature} - ${project}` (`WorktreeCore.ts:403`); it's only attached for claude (`-n` flag), so it can't poison codex args. But fragments of feature/project names that contain "claude" can still arrive via `initialPrompt`.
3. Codex/Gemini installed under a path that contains "claude" (less common but possible — e.g. a `~/.claude*` shared tools directory).

**Test coverage gap** — `tests/unit/AIToolService.test.ts` only exercises clean fixtures (`node /usr/bin/codex`, `claude`, `node /usr/bin/gemini`). No test covers args strings that mix tool names or include prompt text.

## Recommendation

Tighten `detectToolFromArgs` to match the *binary*, not any substring. Two viable approaches:

**A. Word-boundary regex on the executable basename.** Match `claude`, `codex`, `gemini` only when they appear as a standalone token (start of string, after `/`, after whitespace) and are followed by whitespace or end-of-string. That excludes occurrences inside `agent-shows-claude-not-codex` or `--prompt 'fix claude'`.

**B. Parse the executable token explicitly.** Strip a leading `bash -c "..."` / `sh -c "..."` wrapper, take the first non-`node` token, and `path.basename()` it. Compare against the known set.

Recommendation: **A**. It's a one-line change to a single regex per tool, keeps the existing structure, and is robust against the `bash -c "<resume> || <fresh>"` shape without us having to faithfully tokenize the inner command line. A quote-unaware parser (B) gets brittle around prompt text with embedded quotes, whereas a regex like `/(?:^|[\s/])claude(?=\s|$)/` cleanly says "the binary, anywhere it might appear, but never as a substring inside another token". Order independence falls out of this for free.

Tests to add alongside the fix: codex launched with claude-bearing prompt; codex installed at a claude-bearing path; the bash-wrapper resume/fallback shape; gemini in the same scenarios.
