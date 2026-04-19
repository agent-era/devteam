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
export const PR_REFRESH_DURATION = 5 * 60_000; // 5min PR status refresh (visible + stale only)
export const VISIBLE_STATUS_REFRESH_DURATION = 2_000; // 2s visible rows git+AI refresh
export const MEMORY_REFRESH_DURATION = 20_000; // 20s memory status refresh (RAM warning)
// Version check
export const PACKAGE_NAME = '@agent-era/devteam';
export const VERSION_CHECK_INTERVAL = 24 * 60 * 60 * 1000; // 24h

// Time helpers
export const SECOND_MS = 1_000;
export const MINUTE_MS = 60_000;
export const HOUR_MS = 60 * MINUTE_MS;
export const DAY_MS = 24 * HOUR_MS;

export const ENV_FILE = '.env.local';
export const CLAUDE_SETTINGS_FILE = path.join('.claude', 'settings.local.json');
export const CLAUDE_CONFIG_PATTERNS = ['CLAUDE.md', '.claude*', 'claude.config*'];
// Run config now stored in project-local .devteam/config.json
export const RUN_CONFIG_FILE = path.join('.devteam', 'config.json');

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


export const COL_NUMBER_POS = 0;
export const COL_PROJECT_FEATURE_POS = 4;
export const COL_AI_POS = 30;
export const COL_DIFF_POS = 36;
export const COL_CHANGES_POS = 47;
export const COL_PR_POS = 58;

// Symbols
// Display symbols (ASCII only to avoid wrapping/width drift)
export const SYMBOL_NO_SESSION = '-';
export const SYMBOL_IDLE = '✓';
export const SYMBOL_WORKING = '*';
export const SYMBOL_WAITING = '?';
export const SYMBOL_FAILED = 'x';
export const SYMBOL_MERGED = '⟫';
export const SYMBOL_PENDING = '*';

export const GIT_AHEAD = '↑';
export const GIT_BEHIND = '↓';

// Prefer ASCII-safe symbols to avoid wcwidth drift
// Some terminals render certain symbols at different widths.
// Keep this false so we treat ambiguous symbols as narrow (width 1) for alignment.
export const AMBIGUOUS_EMOJI_ARE_WIDE = false;

// AI tool configurations with detection patterns.
// `.command` is the binary name (used by `which` for availability detection and by `ps`
// for pane-process matching). `.resumeArgs` is the suffix appended when launching, so
// a restart picks up the most recent on-disk session for the worktree's cwd. Each CLI
// gracefully falls back to a fresh session if there's nothing to resume.
export const AI_TOOLS = {
  claude: {
    name: 'Claude',
    command: 'claude',
    resumeArgs: '--continue',
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
    resumeArgs: 'resume --last',
    processPatterns: ['node'],
    statusPatterns: {
      working: 'Esc to interrupt',
      waiting_numbered: ['▌', '[A-Za-z]'],  // Check for prompt with text content after it
      idle_prompt: ['▌', '⏎ send']
    }
  },
  gemini: {
    name: 'Gemini',
    command: 'gemini',
    resumeArgs: '--resume latest',
    processPatterns: ['node'],
    statusPatterns: {
      working: 'esc to cancel',
      waiting_numbered: ['Waiting for user', String.raw`\d+\.`],
      idle_prompt: ['│ >', '']  // Just check for prompt, idle is default state
    }
  }
} as const;

export function aiLaunchCommand(tool: keyof typeof AI_TOOLS): string {
  const cfg = AI_TOOLS[tool];
  return `${cfg.command} ${cfg.resumeArgs}`;
}

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

// PR cache TTLs (ms)
// Kept long to minimize GitHub API rate limit usage. Commit-hash-based invalidation
// handles freshness on push; create/merge events trigger immediate targeted refreshes.
export const PR_TTL_MERGED_MS = 365 * DAY_MS;
export const PR_TTL_NO_PR_MS = 7 * DAY_MS;
export const PR_TTL_ERROR_MS = 10 * MINUTE_MS;
export const PR_TTL_CHECKS_FAIL_MS = 30 * MINUTE_MS;
export const PR_TTL_CHECKS_PENDING_MS = 5 * MINUTE_MS; // matches PR_REFRESH_DURATION — no benefit going shorter
export const PR_TTL_PASSING_OPEN_MS = 30 * MINUTE_MS;
export const PR_TTL_OPEN_MS = HOUR_MS;
export const PR_TTL_OPEN_NO_CHECKS_MS = 5 * MINUTE_MS;
export const PR_TTL_CLOSED_MS = HOUR_MS;
export const PR_TTL_UNKNOWN_MS = 30 * MINUTE_MS;
export const PR_TTL_FALLBACK_MS = 15 * MINUTE_MS;

/**
 * Generate help sections with dynamic projects directory path
 */
export function generateHelpSections(projectsDir: string): string[] {
  return [
    '',
    'NAVIGATION:',
    '  [↑]/[↓], [j]/[k]  navigate list',
    '  [PgUp]/[PgDn]     scroll half screen',
    '  [<]/[>]           previous/next page',
    '  [1]–[9]           select item on current page',
    '  [enter] or [a]    open/create agent session',
    '',
    'ACTIVE VIEW:',
    '  [n]ew             feature and activate',
    '  [b]ranch          create from existing branch',
    '  [a]gent           open/create agent session',
    '  [s]hell           open shell in worktree',
    '  e[x]ec            run program in worktree',
    '  [c]onfigure       project settings (AI-assisted)',
    '  [T]               open agent with a different AI tool (also: Shift+Enter)',
    '  [v]archive        archive selected feature',
    '',
  'NEW FEATURE DIALOG:',
    '  Type        filter projects',
    '  [↑]/[↓], [j]/[k]  navigate filtered list',
    '  [space]           select/unselect project',
    '  [1]–[9]           quick move to index',
    '  [enter]           continue to name input',
    '  [esc]             cancel',
    '',
    // Archived view removed; archived items remain on disk
    '',
    'TMUX:',
    '  Ctrl+b, d   detach from session',
    '',
  'OTHER:',
    '  Restore:    use [b] to create from branch; check -archived/ for uncommitted diffs',
  '  [r]efresh     list',
  '  [?]           show this help',
  '  [q]uit        manager',
    '',
    'CONFIGURATION:',
    '  --dir PATH  specify projects directory',
    '  PROJECTS_DIR  environment variable for projects directory',
    '  Default:    current working directory',
    '',
    'FILES:',
    `  Active:     ${projectsDir}/{project}-branches/`,
    `  Archived:   ${projectsDir}/{project}-archived/`,
    '  Sessions:   dev-{project}-{feature}',
    '',
    'SYMBOLS:',
    '  -  No session    ✓  Idle         *  Working',
    '  ?  Waiting       archived',
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
    '  #N✓  PR passing       #Nx  PR failing',
    '  #N*  PR pending       #N⟫  PR merged',
    ''
  ];
}

export const ARCHIVE_IGNORE_DIRS = ['venv', 'env', '.venv', 'node_modules', '__pycache__', '.pytest_cache'];
export const UI_REFRESH_RATE = 1.0;
export const UI_SLEEP_RATE = 0.05;
export const PAGE_SIZE = 10;
export const MIN_TERMINAL_WIDTH = 40;
export const MIN_TERMINAL_HEIGHT = 10;

// Single source of truth for the project config schema. Drives both the AI prompts
// (so Claude can't hallucinate fields) and the settings dialog (which uses the
// descriptions and the set of keys to show what's present vs. missing).
export type SchemaNode = {
  description: string;
  type: 'string' | 'string[]' | 'boolean' | 'object' | 'record<string,string>';
  example?: unknown;
  children?: Record<string, SchemaNode>;
};

export const CONFIG_SCHEMA: Record<string, SchemaNode> = {
  executionInstructions: {
    type: 'object',
    description: 'How to run the main project command for a worktree',
    children: {
      mainCommand: {
        type: 'string',
        description: 'Primary run command',
        example: 'npm run dev',
      },
      preRunCommands: {
        type: 'string[]',
        description: 'Commands to run before the main command',
        example: ['npm install'],
      },
      environmentVariables: {
        type: 'record<string,string>',
        description: 'Env vars exported before the command runs',
        example: {},
      },
      detachOnExit: {
        type: 'boolean',
        description: 'When the program being run exits: true closes the pane; false keeps it open so you can see the output.',
        example: false,
      },
    },
  },
  worktreeSetup: {
    type: 'object',
    description: 'What gets copied/linked into each new worktree',
    children: {
      copyFiles: {
        type: 'string[]',
        description: 'Relative paths (files or dirs) to copy from project root into each worktree',
        example: ['.env.local'],
      },
      symlinkPaths: {
        type: 'string[]',
        description: 'Relative paths to symlink from project root into each worktree',
        example: ['.claude'],
      },
    },
  },
  aiToolSettings: {
    type: 'object',
    description: 'Per-AI-tool CLI launch flags',
    children: {
      claude: {
        type: 'object',
        description: 'Flags for claude CLI',
        children: {
          flags: {
            type: 'string[]',
            description: 'e.g. ["--dangerously-skip-permissions"] to bypass permission prompts',
            example: [],
          },
        },
      },
      codex: {
        type: 'object',
        description: 'Flags for codex CLI',
        children: {
          flags: {
            type: 'string[]',
            description: 'e.g. ["--full-auto"] to skip confirmations',
            example: [],
          },
        },
      },
      gemini: {
        type: 'object',
        description: 'Flags for gemini CLI',
        children: {
          flags: {
            type: 'string[]',
            description: 'Additional CLI flags',
            example: [],
          },
        },
      },
    },
  },
};

export type ProjectConfig = {
  executionInstructions?: {
    mainCommand?: string;
    preRunCommands?: string[];
    environmentVariables?: Record<string, string>;
    detachOnExit?: boolean;
  };
  worktreeSetup?: {
    copyFiles?: string[];
    symlinkPaths?: string[];
  };
  aiToolSettings?: Partial<Record<keyof typeof AI_TOOLS, {flags?: string[]}>>;
};

// Render schema as an annotated JSON example that Claude can use directly.
// Each field is followed by an inline comment describing its purpose — the
// strict output rule at the bottom of the prompt forbids returning the comments.
function renderSchemaForPrompt(schema: Record<string, SchemaNode>, indent = 2): string {
  const pad = (n: number) => ' '.repeat(n);
  const render = (nodes: Record<string, SchemaNode>, depth: number): string[] => {
    const keys = Object.keys(nodes);
    const out: string[] = [];
    keys.forEach((key, i) => {
      const node = nodes[key];
      const isLast = i === keys.length - 1;
      const comma = isLast ? '' : ',';
      if (node.children) {
        out.push(`${pad(depth)}"${key}": {   // ${node.description}`);
        out.push(...render(node.children, depth + indent));
        out.push(`${pad(depth)}}${comma}`);
      } else {
        const example = JSON.stringify(node.example ?? null);
        out.push(`${pad(depth)}"${key}": ${example}${comma}   // ${node.type} — ${node.description}`);
      }
    });
    return out;
  };
  return ['{', ...render(schema, indent), '}'].join('\n');
}

const SCHEMA_DOC = renderSchemaForPrompt(CONFIG_SCHEMA);

export const RUN_CONFIG_CLAUDE_PROMPT = `Analyze this project directory and generate a .devteam/config.json file that matches EXACTLY this schema. Do not add, rename, or remove any top-level or nested keys.

Schema (values shown are illustrative; the inline // comments are documentation and MUST NOT appear in your output):
${SCHEMA_DOC}

Fill in values based on the project files you see. For any field you're unsure about, use the illustrative value shown above.

CRITICAL: Your response must be ONLY the final JSON object — no markdown, no code fences, no comments, no explanations. Start with { and end with }. Use the exact keys from the schema above and no others.`;

export const SETTINGS_EDIT_CLAUDE_PROMPT = `You are editing a project config file stored at .devteam/config.json.

The config MUST conform to this schema (values are illustrative; the inline // comments are documentation and MUST NOT appear in your output):
${SCHEMA_DOC}

Current config on disk:
---
{CURRENT_CONFIG}
---

The user requests: "{USER_PROMPT}"

Output the complete updated JSON config. Preserve any fields you don't need to change. Only use the exact keys defined in the schema above — do not invent new fields.

CRITICAL: Your response must be ONLY the final JSON object — no markdown, no code fences, no comments, no explanations. Start with { and end with }.`;
