#!/usr/bin/env bash
set -euo pipefail

echo "==> DevTeam CLI installer (@agent-era/devteam)"

# Check npm
if ! command -v npm >/dev/null 2>&1; then
  echo "Error: npm is not installed or not on PATH." >&2
  echo "Install Node.js 18+ from https://nodejs.org and try again." >&2
  exit 1
fi

# Check node version >= 18
NODE_MAJOR=$(node -v | sed -E 's/^v([0-9]+).*/\1/')
if [ "${NODE_MAJOR}" -lt 18 ]; then
  echo "Error: Node.js >= 18 is required. Found $(node -v)." >&2
  exit 1
fi

# Optional: check tmux presence and warn only
if ! command -v tmux >/dev/null 2>&1; then
  echo "Warning: tmux not found. DevTeam uses tmux for sessions." >&2
  if [ "$(uname -s)" = "Darwin" ]; then
    echo "Install via Homebrew: brew install tmux" >&2
  else
    echo "Install tmux from your package manager for the best experience." >&2
  fi
fi

echo "==> Installing @agent-era/devteam globally via npm"
npm i -g @agent-era/devteam

echo "==> Verifying install"
if command -v devteam >/dev/null 2>&1; then
  echo "Success! Try: devteam --help"
else
  echo "Installed, but 'devteam' not on PATH. You may need to rehash your shell or restart terminal."
fi
