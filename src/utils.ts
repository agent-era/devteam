import {execFileSync, spawnSync} from 'node:child_process';
import {execFile} from 'node:child_process';
import fs from 'node:fs';
import path from 'node:path';
import {ARCHIVE_IGNORE_DIRS, ARCHIVE_PREFIX, SUBPROCESS_SHORT_TIMEOUT, SUBPROCESS_TIMEOUT, AMBIGUOUS_EMOJI_ARE_WIDE} from './constants.js';

export function runCommand(args: string[], opts: {timeout?: number; cwd?: string} = {}): string {
  try {
    const out = execFileSync(args[0], args.slice(1), {
      encoding: 'utf8',
      stdio: ['ignore', 'pipe', 'pipe'],
      timeout: opts.timeout ?? SUBPROCESS_TIMEOUT,
      cwd: opts.cwd,
    });
    return out.trim();
  } catch (e) {
    return '';
  }
}

export function runCommandQuick(args: string[], cwd?: string): string {
  try {
    const out = execFileSync(args[0], args.slice(1), {
      encoding: 'utf8',
      stdio: ['ignore', 'pipe', 'pipe'],
      timeout: SUBPROCESS_SHORT_TIMEOUT,
      cwd,
    });
    return out.trim();
  } catch {
    return '';
  }
}

export function runCommandAsync(args: string[], opts: {timeout?: number; cwd?: string} = {}): Promise<string> {
  return new Promise((resolve) => {
    try {
      const child = execFile(args[0], args.slice(1), {
        encoding: 'utf8' as any,
        timeout: opts.timeout ?? SUBPROCESS_TIMEOUT,
        cwd: opts.cwd,
        maxBuffer: 10 * 1024 * 1024,
      }, (err, stdout, stderr) => {
        if (err) return resolve('');
        resolve((stdout || '').toString().trim());
      });
    } catch {
      resolve('');
    }
  });
}

export function runCommandQuickAsync(args: string[], cwd?: string): Promise<string> {
  return runCommandAsync(args, {timeout: SUBPROCESS_SHORT_TIMEOUT, cwd});
}

export function commandExitCode(args: string[], cwd?: string): number {
  const res = spawnSync(args[0], args.slice(1), {cwd, stdio: 'ignore'});
  return res.status ?? 1;
}

export function runClaudeSync(prompt: string, cwd?: string): {success: boolean; output: string; error?: string} {
  try {
    const res = spawnSync('claude', ['-p', prompt], {
      cwd,
      encoding: 'utf8',
      stdio: ['ignore', 'pipe', 'pipe'],
      timeout: SUBPROCESS_TIMEOUT,
    });
    
    if (res.status === 0 && res.stdout) {
      return {
        success: true,
        output: res.stdout.trim()
      };
    }
    
    const errorMessage = res.stderr || `Claude exited with code ${res.status}`;
    return {
      success: false,
      output: '',
      error: errorMessage
    };
  } catch (error) {
    const errorMessage = error instanceof Error ? error.message : 'Unknown error running Claude';
    return {
      success: false,
      output: '',
      error: errorMessage
    };
  }
}

export function runInteractive(cmd: string, args: string[], opts: {cwd?: string} = {}): number {
  const res = spawnSync(cmd, args, {cwd: opts.cwd, stdio: 'inherit'});
  return res.status ?? 0;
}

export function ensureDirectory(p: string): void {
  if (!fs.existsSync(p)) fs.mkdirSync(p, {recursive: true});
}

export function copyWithIgnore(src: string, dest: string): void {
  if (!fs.existsSync(src)) return;
  const stat = fs.statSync(src);
  if (stat.isDirectory()) {
    ensureDirectory(dest);
    for (const entry of fs.readdirSync(src)) {
      copyWithIgnore(path.join(src, entry), path.join(dest, entry));
    }
  } else if (stat.isFile()) {
    fs.copyFileSync(src, dest);
  }
}

export function safeRemoveDirectory(p: string): boolean {
  try {
    fs.rmSync(p, {recursive: true, force: true});
    return true;
  } catch {
    return false;
  }
}

export function parseGitShortstat(s: string): [number, number] {
  if (!s) return [0, 0];
  const added = /([0-9]+) insertion/.exec(s)?.[1] || 0;
  const deleted = /([0-9]+) deletion/.exec(s)?.[1] || 0;
  return [Number(added), Number(deleted)];
}

export function generateTimestamp(): string {
  const d = new Date();
  const pad = (n: number | string, l: number = 2): string => String(n).padStart(l, '0');
  return (
    `${d.getFullYear()}${pad(d.getMonth() + 1)}${pad(d.getDate())}` +
    `-${pad(d.getHours())}${pad(d.getMinutes())}${pad(d.getSeconds())}`
  );
}

export function findBaseBranch(repoPath: string, candidates: string[] = ['main', 'master', 'develop']): string {
  // Try origin/candidate first
  for (const c of candidates) {
    const origin = `origin/${c}`;
    const out = runCommandQuick(['git', '-C', repoPath, 'rev-parse', '--verify', origin]);
    if (out) return origin;
  }
  // Then local branches
  for (const c of candidates) {
    const out = runCommandQuick(['git', '-C', repoPath, 'rev-parse', '--verify', c]);
    if (out) return c;
  }
  // Finally origin/HEAD
  const originHead = runCommandQuick(['git', '-C', repoPath, 'symbolic-ref', 'refs/remotes/origin/HEAD']);
  if (originHead && !/fatal/i.test(originHead)) {
    return originHead.trim().replace('refs/remotes/', '');
  }
  return '';
}

export function kebabCase(text: string): string {
  let s = text.replace(/[^\w\s-]/g, '');
  s = s.replace(/[_\s]+/g, '-');
  s = s.replace(/-+/g, '-');
  return s.toLowerCase().replace(/^-+|-+$/g, '');
}

export function truncateText(text: string, maxLength: number, suffix = '...'): string {
  if (text.length <= maxLength) return text;
  if (suffix.length >= maxLength) return suffix.slice(0, maxLength);
  return text.slice(0, maxLength - suffix.length) + suffix;
}

export function formatDiffStats(added: number, deleted: number, maxLength = 10): string {
  if (added === 0 && deleted === 0) return '-';
  const a = added >= 1000 ? `${Math.floor(added / 1000)}k` : String(added);
  const d = deleted >= 1000 ? `${Math.floor(deleted / 1000)}k` : String(deleted);
  return truncateText(`+${a}/-${d}`, maxLength, '');
}

export function formatChangesStats(ahead: number, behind: number, maxLength = 10): string {
  const parts: string[] = [];
  if (ahead > 0) parts.push(`↑${ahead}`);
  if (behind > 0) parts.push(`↓${behind}`);
  const result = parts.join(' ');
  return truncateText(result, maxLength, '');
}

export function getTerminalSize(): [number, number] {
  try {
    const {columns, rows} = (process.stdout as any);
    if (columns && rows) return [columns, rows];
  } catch {}
  return [80, 24];
}

export function validateFeatureName(name: string): boolean {
  if (!name || !name.trim()) return false;
  const kebab = kebabCase(name);
  if (!kebab || kebab.length < 2) return false;
  if (/[<>:"|?*\\]/.test(name)) return false;
  return true;
}

export function formatTimeAgo(timestamp: number): string {
  if (!timestamp) return '';
  const now = Math.floor(Date.now() / 1000);
  let diff = Math.max(0, now - timestamp);
  if (diff < 60) return `${diff}s`;
  if (diff < 3600) return `${Math.floor(diff / 60)}m`;
  if (diff < 86400) return `${Math.floor(diff / 3600)}h`;
  if (diff < 2592000) return `${Math.floor(diff / 86400)}d`;
  if (diff < 31536000) return `${Math.floor(diff / 2592000)}mo`;
  return `${Math.floor(diff / 31536000)}y`;
}

// Display width helpers to handle wide emoji and CJK correctly
function isZeroWidth(codePoint: number): boolean {
  // Combining marks
  if (
    (codePoint >= 0x0300 && codePoint <= 0x036F) ||
    (codePoint >= 0x1AB0 && codePoint <= 0x1AFF) ||
    (codePoint >= 0x1DC0 && codePoint <= 0x1DFF) ||
    (codePoint >= 0x20D0 && codePoint <= 0x20FF) ||
    (codePoint >= 0xFE20 && codePoint <= 0xFE2F)
  ) return true;

  // Variation Selectors (emoji/text presentation) — zero width
  if (codePoint >= 0xFE00 && codePoint <= 0xFE0F) return true;

  // Zero Width Joiner/Non-Joiner and Zero Width Space
  if (codePoint === 0x200D || codePoint === 0x200C || codePoint === 0x200B) return true;

  return false;
}

function isWide(codePoint: number): boolean {
  // Only count known East Asian Wide/Fullwidth and Emoji ranges as width 2.
  // Ambiguous-width symbols (e.g., Dingbats, Misc Symbols) are treated as 1,
  // with specific overrides for commonly wide glyphs seen in terminals.
  const baseWide = (
    (codePoint >= 0x1100 && codePoint <= 0x115F) || // Hangul Jamo init
    codePoint === 0x2329 || codePoint === 0x232A ||
    (codePoint >= 0x2E80 && codePoint <= 0xA4CF) || // CJK Radicals, Kangxi, etc.
    (codePoint >= 0xAC00 && codePoint <= 0xD7A3) || // Hangul Syllables
    (codePoint >= 0xF900 && codePoint <= 0xFAFF) || // CJK Compatibility Ideographs
    (codePoint >= 0xFE10 && codePoint <= 0xFE19) || // Vertical forms
    (codePoint >= 0xFE30 && codePoint <= 0xFE6F) || // CJK Compatibility Forms
    (codePoint >= 0xFF00 && codePoint <= 0xFF60) || // Fullwidth forms
    (codePoint >= 0xFFE0 && codePoint <= 0xFFE6) ||
    (codePoint >= 0x1F300 && codePoint <= 0x1F64F) || // Emoji/pictographs
    (codePoint >= 0x1F900 && codePoint <= 0x1F9FF) ||
    (codePoint >= 0x1FA70 && codePoint <= 0x1FAFF)
  );
  if (baseWide) return true;
  // Ambiguous symbols allowlist (treated as wide when enabled)
  if (AMBIGUOUS_EMOJI_ARE_WIDE) {
    // Common ambiguous symbols seen as wide in some terminals
    if (
      codePoint === 0x26A1 || // ⚡ HIGH VOLTAGE SIGN
      codePoint === 0x2713 || // ✓ CHECK MARK
      codePoint === 0x2717 || // ✗ BALLOT X
      codePoint === 0x23F3 || // ⏳ HOURGLASS NOT DONE
      codePoint === 0x27EB || // ⟫ MATHEMATICAL RIGHT DOUBLE ANGLE BRACKET
      codePoint === 0x2191 || // ↑ UPWARDS ARROW
      codePoint === 0x2193    // ↓ DOWNWARDS ARROW
    ) return true;
  }
  return false;
}

export function stringDisplayWidth(str: string): number {
  let width = 0;
  for (const ch of str) {
    const cp = ch.codePointAt(0)!;
    if (cp <= 0x1F || (cp >= 0x7F && cp <= 0x9F)) continue; // control
    if (isZeroWidth(cp)) continue;
    width += isWide(cp) ? 2 : 1;
  }
  return width;
}

export function truncateDisplay(str: string, targetWidth: number): string {
  let width = 0;
  let out = '';
  for (const ch of str) {
    const cp = ch.codePointAt(0)!;
    const w = isZeroWidth(cp) ? 0 : (isWide(cp) ? 2 : 1);
    if (width + w > targetWidth) break;
    out += ch;
    width += w;
  }
  return out;
}

export function padEndDisplay(str: string, targetWidth: number): string {
  const w = stringDisplayWidth(str);
  if (w >= targetWidth) return str;
  return str + ' '.repeat(targetWidth - w);
}

export function padStartDisplay(str: string, targetWidth: number): string {
  const w = stringDisplayWidth(str);
  if (w >= targetWidth) return str;
  return ' '.repeat(targetWidth - w) + str;
}

export function fitDisplay(str: string, targetWidth: number): string {
  const t = truncateDisplay(str, targetWidth);
  return padEndDisplay(t, targetWidth);
}
