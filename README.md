# DevTeam CLI (@agent-era/devteam)

A mostly vibe-coded terminal utility to run a team of local coding agents. Launch multiple Claude Code, Codex or Gemini agents, switch between them, review their changes and add comments, and push PRs all from one streamlined terminal UI. An exercise to push how fast development can happen with multiple parallel agents.

## Install

Prerequisites: Node.js 18+ and tmux installed and on your PATH

Global install:

```
npm i -g @agent-era/devteam
```

This installs the `devteam` command.

## Usage

Run the TUI in the top-level directory that you keep your git projects in:

```
cd ~/projects
devteam
```

Or point it at a directory explicitly:

```
devteam --dir /path/to/projects
# or
PROJECTS_DIR=/path/to/projects devteam
```

Features
--------

- Multi-project Git worktrees: discover, create, attach, archive
- Tmux automation: sessions `dev-{project}-{feature}`, plus `-shell` and `-run`
- Git awareness: diff counts and ahead/behind in the list
- PR awareness (GitHub CLI): PR number and checks (✓ passing / ⏳ pending / ✗ failing / ⟫ merged)
- Diff viewer: full vs uncommitted-only modes with per-file navigation
- Run sessions: generate `run-session.config.json` with Claude, then execute
- AI tools: detect/switch Claude, Codex, or Gemini per session

Quick guide
-----------

- Navigation: arrows or `j/k`; `1–9` quick select; `<`/`>` or `,`/`.` to page; PgUp/PgDn; Home/End
- Open/attach: `enter` on a feature to create/attach its session
- Create: `n` new feature; `b` from remote branch
- Manage: `a` archive selected; `s` open shell session
- Diff: `d` full diff vs base; `D` uncommitted changes only
- Run: `x` execute using run config; `X` create/update `run-session.config.json` with Claude
- AI tool: `t` select active AI tool for the session
- Misc: `r` refresh; `?` help overlay; `q` quit
- Tmux: detach with `Ctrl-b` then `d`

## Repository

- GitHub: https://github.com/agent-era/devteam
- Issues: https://github.com/agent-era/devteam/issues

## Development

- Build: `npm run build`
- Test: `npm test`
- Terminal E2E: `npm run test:terminal`

## Publishing (scoped public)

```
npm version <patch|minor|major>
npm publish --access public
```

Note: `prepublishOnly` runs the build to ensure `dist/` is included in the published tarball.
