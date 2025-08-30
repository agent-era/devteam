import os from 'node:os';
import path from 'node:path';

export const SESSION_PREFIX = 'dev-';
export const DIR_BRANCHES_SUFFIX = '-branches';
export const DIR_ARCHIVED_SUFFIX = '-archived';
export const ARCHIVE_PREFIX = 'archived-';

export const BASE_BRANCH_CANDIDATES = ['main', 'master', 'develop'];

export const CACHE_DURATION = 30_000; // 30s full refresh
export const AI_STATUS_REFRESH_DURATION = 2_000; // 2s AI status refresh
export const DIFF_STATUS_REFRESH_DURATION = 2_000; // 2s diff status refresh
export const GIT_REFRESH_DURATION = 5_000; // 5s git refresh
export const PR_REFRESH_DURATION = 30_000; // 30s PR status refresh (non-merged only)

export const ENV_FILE = '.env.local';
export const CLAUDE_SETTINGS_FILE = path.join('.claude', 'settings.local.json');
export const CLAUDE_CONFIG_PATTERNS = ['CLAUDE.md', '.claude*', 'claude.config*'];
export const RUN_CONFIG_FILE = 'run-session.config.json';

// UI constants (kept for parity; Ink layout differs)
export const UI_MIN_WIDTH = 50;
export const UI_MAX_WIDTH = 100;
export const DIALOG_DEFAULT_WIDTH = 40;
export const DIALOG_DEFAULT_HEIGHT = 15;

export const COL_NUMBER_WIDTH = 4;
export const COL_PROJECT_FEATURE_WIDTH = 25;
export const COL_AI_WIDTH = 3;
export const COL_DIFF_WIDTH = 10;
export const COL_CHANGES_WIDTH = 8;
export const COL_PR_WIDTH = 15;

export const COL_PROJECT_FEATURE_WIDTH_ARCHIVED = 50;
export const COL_ARCHIVED_WIDTH = 10;

export const COL_NUMBER_POS = 0;
export const COL_PROJECT_FEATURE_POS = 4;
export const COL_AI_POS = 30;
export const COL_DIFF_POS = 36;
export const COL_CHANGES_POS = 47;
export const COL_PR_POS = 58;
export const COL_ARCHIVED_POS = 55;

// Symbols
export const SYMBOL_NO_SESSION = '○';
export const SYMBOL_IDLE = '✓';
export const SYMBOL_WORKING = '⚡';
export const SYMBOL_WAITING = '❓';
export const SYMBOL_FAILED = '✗';
export const SYMBOL_ARCHIVED = '📦';
export const SYMBOL_MERGED = '⟫';
export const SYMBOL_PENDING = '⏳';
export const SYMBOL_THINKING = '🤔';

export const GIT_AHEAD = '↑';
export const GIT_BEHIND = '↓';

// Prefer ASCII-safe symbols to avoid wcwidth drift
export const USE_EMOJI_SYMBOLS = false;
// Some terminals render "ambiguous" symbols (e.g., ⚡) at width 2.
// When true, wcwidth treats a small allowlist of such symbols as wide.
export const AMBIGUOUS_EMOJI_ARE_WIDE = true;
export const ASCII_SYMBOLS = {
  NO_SESSION: 'o',
  IDLE: '✓',
  WORKING: '*',
  WAITING: '?',
  THINKING: '~',
  FAILED: 'x',
  MERGED: '>>',
  PENDING: '~',
};

// AI tool configurations with detection patterns
export const AI_TOOLS = {
  claude: {
    name: 'Claude',
    command: 'claude',
    processPatterns: ['claude'],
    statusPatterns: {
      working: 'esc to interrupt',
      waiting_numbered: ['❯', String.raw`\d+\.\s+\w+`],
      idle_prompt: ['│ >', '│']
    }
  },
  codex: {
    name: 'OpenAI Codex',
    command: 'codex',
    processPatterns: ['codex', 'openai'],
    statusPatterns: {
      working: 'generating',
      waiting_numbered: ['>', String.raw`\d+\.`],
      idle_prompt: ['>>>', '']
    }
  },
  gemini: {
    name: 'Gemini',
    command: 'gemini',
    processPatterns: ['gemini', 'bard'],
    statusPatterns: {
      working: 'thinking',
      waiting_numbered: ['gemini>', String.raw`\d+:`],
      idle_prompt: ['gemini>', '']
    }
  }
} as const;

// Claude status patterns (Python parity) - kept for backward compatibility
export const CLAUDE_PATTERNS = {
  working: 'esc to interrupt',
  waiting_numbered: ['❯', String.raw`\d+\.\s+\w+`],
  idle_prompt: ['│ >', '│']
} as const;

// Additional idle markers for other CLIs (e.g., GPT Codex)
export const ALT_IDLE_MARKERS: RegExp[] = [
  /Ctrl\+J\s+newline/i,
  /Ctrl\+C\s+quit/i,
  /tokens\s+used/i,
  /context\s+left/i,
  /▌/, // block cursor line
];

// Process timeouts (ms)
export const SUBPROCESS_TIMEOUT = 30_000;
export const SUBPROCESS_SHORT_TIMEOUT = 5_000;
// How long tmux shows messages (like "detached") in ms
// 0 disables message display entirely in supported tmux versions
export const TMUX_DISPLAY_TIME = 0;

/**
 * Generate help sections with dynamic projects directory path
 */
export function generateHelpSections(projectsDir: string): string[] {
  return [
    '',
    'NAVIGATION:',
    '  ↑/↓, j/k    Navigate list',
    '  PgUp/PgDn   Previous/next page',
    '  < / >       Previous/next page',
    '  1-9         Select item on current page',
    '  Enter       Open/create session',
    '',
    'ACTIVE VIEW:',
    '  n           Create new feature and activate',
    '  b           Create from existing branch',
    '  a           Archive selected feature',
    '  v           View archived sessions',
    '  s           Open shell in worktree',
    '  x           Execute/run program in worktree',
    '  X           Create/update run config with Claude',
    '  t           Switch AI tool for session',
    '',
    'NEW FEATURE DIALOG:',
    '  Type        Filter projects',
    '  ↑/↓, j/k    Navigate filtered list',
    '  1-9         Quick select by number',
    '  Enter       Select project',
    '  ESC         Cancel',
    '',
    'ARCHIVED VIEW:',
    '  v           Return to active sessions',
    '  d           Delete permanently',
    '',
    'TMUX:',
    '  Ctrl+b, d   Detach from session',
    '',
    'OTHER:',
    '  r           Refresh list',
    '  ?           Show this help',
    '  q           Quit manager',
    '',
    'CONFIGURATION:',
    '  --dir PATH  Specify projects directory',
    '  PROJECTS_DIR  Environment variable for projects directory',
    '  Default:    Current working directory',
    '',
    'FILES:',
    `  Active:     ${projectsDir}/{project}-branches/`,
    `  Archived:   ${projectsDir}/{project}-archived/`,
    '  Sessions:   dev-{project}-{feature}',
    '',
    'SYMBOLS:',
    '  ○  No session    ✓  Idle         ⚡  Working',
    '  🤔  Thinking      ❓  Waiting      📦  Archived',
    '',
    'GIT STATUS:',
    '  DIFF column:',
    '    +N/-N  Lines added/deleted from base branch',
    '  CHANGES column:',
    '    ↑N     N commits ahead of remote',
    '    ↓N     N commits behind remote',
    '    synced All changes pushed',
    '    clean  No changes or commits',
    '',
    'PULL REQUESTS:',
    '  #N✓  PR passing       #N✗  PR failing',
    '  #N⏳  PR pending       #N⟫  PR merged',
    ''
  ];
}

export const ARCHIVE_IGNORE_DIRS = ['venv', 'env', '.venv', 'node_modules', '__pycache__', '.pytest_cache'];
export const UI_REFRESH_RATE = 1.0;
export const UI_SLEEP_RATE = 0.05;
export const PAGE_SIZE = 10;
export const MIN_TERMINAL_WIDTH = 40;
export const MIN_TERMINAL_HEIGHT = 10;

// Claude prompt for generating run configurations
export const RUN_CONFIG_CLAUDE_PROMPT = `Analyze this project directory and generate a run-session.config.json file.

CRITICAL: Your response must be ONLY the JSON object. Do NOT use markdown code blocks or any formatting.

Example of what to output:
{"command": "npm start", "env": {}, "setup": [], "watch": true}

Fill in values based on the project files you see:
- "command": main run command (e.g. "npm run dev", "python app.py")
- "env": object with environment variables (usually empty {})
- "setup": array of setup commands (e.g. ["npm install"])
- "watch": true for servers/long-running, false for build/test commands

Your response must start with { and end with } - nothing else.`;
