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