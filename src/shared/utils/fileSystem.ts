import fs from 'fs';
import path from 'path';

export function ensureDirectory(dirPath: string): void {
  if (!fs.existsSync(dirPath)) {
    fs.mkdirSync(dirPath, {recursive: true});
  }
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

export function safeRemoveDirectory(dirPath: string): boolean {
  try {
    fs.rmSync(dirPath, {recursive: true, force: true});
    return true;
  } catch {
    return false;
  }
}

export function readFileOrNull(filePath: string): string | null {
  try {
    return fs.readFileSync(filePath, 'utf8');
  } catch {
    return null;
  }
}

// Extract a JSON object from arbitrary text, tolerating code fences or surrounding prose.
// Returns a pretty-printed string, or null if no valid object is found.
export function extractJsonObject(raw: string): string | null {
  if (!raw) return null;
  let text = raw.trim();
  const fence = text.match(/```(?:json)?\s*([\s\S]*?)\s*```/i);
  if (fence) text = fence[1].trim();
  const start = text.indexOf('{');
  const end = text.lastIndexOf('}');
  if (start < 0 || end <= start) return null;
  try {
    return JSON.stringify(JSON.parse(text.slice(start, end + 1)), null, 2);
  } catch {
    return null;
  }
}

// Quote a shell argument only if it contains unsafe characters.
export function shellQuote(arg: string): string {
  if (/^[A-Za-z0-9_\-./=:]+$/.test(arg)) return arg;
  return `'${arg.replace(/'/g, `'\\''`)}'`;
}