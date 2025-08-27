import {AMBIGUOUS_EMOJI_ARE_WIDE} from '../../constants.js';

export function kebabCase(text: string): string {
  let sanitized = text.replace(/[^\w\s-]/g, '');
  sanitized = sanitized.replace(/[_\s]+/g, '-');
  sanitized = sanitized.replace(/-+/g, '-');
  return sanitized.toLowerCase().replace(/^-+|-+$/g, '');
}

export function truncateText(text: string, maxLength: number, suffix = '...'): string {
  if (text.length <= maxLength) return text;
  if (suffix.length >= maxLength) return suffix.slice(0, maxLength);
  return text.slice(0, maxLength - suffix.length) + suffix;
}

export function formatDiffStats(added: number, deleted: number, maxLength = 10): string {
  if (added === 0 && deleted === 0) return '-';
  
  const addedStr = added >= 1000 ? `${Math.floor(added / 1000)}k` : String(added);
  const deletedStr = deleted >= 1000 ? `${Math.floor(deleted / 1000)}k` : String(deleted);
  
  return truncateText(`+${addedStr}/-${deletedStr}`, maxLength, '');
}

export function formatChangesStats(ahead: number, behind: number, maxLength = 10): string {
  const parts: string[] = [];
  if (ahead > 0) parts.push(`↑${ahead}`);
  if (behind > 0) parts.push(`↓${behind}`);
  
  const result = parts.join(' ');
  return truncateText(result, maxLength, '');
}

export function formatTimeAgo(timestamp: number): string {
  if (!timestamp) return '';
  
  const now = Math.floor(Date.now() / 1000);
  const diff = Math.max(0, now - timestamp);
  
  if (diff < 60) return `${diff}s`;
  if (diff < 3600) return `${Math.floor(diff / 60)}m`;
  if (diff < 86400) return `${Math.floor(diff / 3600)}h`;
  if (diff < 2592000) return `${Math.floor(diff / 86400)}d`;
  if (diff < 31536000) return `${Math.floor(diff / 2592000)}mo`;
  return `${Math.floor(diff / 31536000)}y`;
}

export function generateTimestamp(): string {
  const date = new Date();
  const pad = (num: number | string, length: number = 2): string => String(num).padStart(length, '0');
  
  return (
    `${date.getFullYear()}${pad(date.getMonth() + 1)}${pad(date.getDate())}` +
    `-${pad(date.getHours())}${pad(date.getMinutes())}${pad(date.getSeconds())}`
  );
}

// Display width helpers for terminal rendering
function isZeroWidth(codePoint: number): boolean {
  // Combining marks
  if (
    (codePoint >= 0x0300 && codePoint <= 0x036F) ||
    (codePoint >= 0x1AB0 && codePoint <= 0x1AFF) ||
    (codePoint >= 0x1DC0 && codePoint <= 0x1DFF) ||
    (codePoint >= 0x20D0 && codePoint <= 0x20FF) ||
    (codePoint >= 0xFE20 && codePoint <= 0xFE2F)
  ) return true;

  // Variation Selectors and Zero Width characters
  if (
    (codePoint >= 0xFE00 && codePoint <= 0xFE0F) ||
    codePoint === 0x200D || codePoint === 0x200C || codePoint === 0x200B
  ) return true;

  return false;
}

function isWide(codePoint: number): boolean {
  const baseWide = (
    (codePoint >= 0x1100 && codePoint <= 0x115F) ||
    codePoint === 0x2329 || codePoint === 0x232A ||
    (codePoint >= 0x2E80 && codePoint <= 0xA4CF) ||
    (codePoint >= 0xAC00 && codePoint <= 0xD7A3) ||
    (codePoint >= 0xF900 && codePoint <= 0xFAFF) ||
    (codePoint >= 0xFE10 && codePoint <= 0xFE19) ||
    (codePoint >= 0xFE30 && codePoint <= 0xFE6F) ||
    (codePoint >= 0xFF00 && codePoint <= 0xFF60) ||
    (codePoint >= 0xFFE0 && codePoint <= 0xFFE6) ||
    (codePoint >= 0x1F300 && codePoint <= 0x1F64F) ||
    (codePoint >= 0x1F900 && codePoint <= 0x1F9FF) ||
    (codePoint >= 0x1FA70 && codePoint <= 0x1FAFF)
  );
  
  if (baseWide) return true;
  
  if (AMBIGUOUS_EMOJI_ARE_WIDE) {
    const ambiguousWideSymbols = [0x26A1, 0x2713, 0x2717, 0x23F3, 0x27EB, 0x2191, 0x2193];
    if (ambiguousWideSymbols.includes(codePoint)) return true;
  }
  
  return false;
}

export function stringDisplayWidth(str: string): number {
  let width = 0;
  for (const ch of str) {
    const codePoint = ch.codePointAt(0)!;
    if (codePoint <= 0x1F || (codePoint >= 0x7F && codePoint <= 0x9F)) continue; // control chars
    if (isZeroWidth(codePoint)) continue;
    width += isWide(codePoint) ? 2 : 1;
  }
  return width;
}

export function truncateDisplay(str: string, targetWidth: number): string {
  let width = 0;
  let result = '';
  
  for (const ch of str) {
    const codePoint = ch.codePointAt(0)!;
    const charWidth = isZeroWidth(codePoint) ? 0 : (isWide(codePoint) ? 2 : 1);
    
    if (width + charWidth > targetWidth) break;
    
    result += ch;
    width += charWidth;
  }
  
  return result;
}

export function padEndDisplay(str: string, targetWidth: number): string {
  const currentWidth = stringDisplayWidth(str);
  if (currentWidth >= targetWidth) return str;
  return str + ' '.repeat(targetWidth - currentWidth);
}

export function padStartDisplay(str: string, targetWidth: number): string {
  const currentWidth = stringDisplayWidth(str);
  if (currentWidth >= targetWidth) return str;
  return ' '.repeat(targetWidth - currentWidth) + str;
}

export function fitDisplay(str: string, targetWidth: number): string {
  const truncated = truncateDisplay(str, targetWidth);
  return padEndDisplay(truncated, targetWidth);
}