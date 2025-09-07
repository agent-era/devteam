# DevTeam CLI (@agent-era/devteam)

DevTeam is a terminal UI (Ink + React) for managing development worktrees and tmux sessions. It helps you create, switch, and run feature workspaces fast.

## Install

Prerequisites: Node.js 18+ and tmux installed and on your PATH

Global install:

```
npm i -g @agent-era/devteam
```

This installs the `devteam` command.

## Usage

Run the TUI with the top-level directory that you keep your git projects in (e.g. ~/projects). It supports multiple projects:

```
devteam ~/projects
```

- Navigate projects and features
- Create worktrees from remote branches
- Attach to tmux sessions (interactive)
- Configure and run project commands

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
