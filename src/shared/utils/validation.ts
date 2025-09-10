import {kebabCase} from './formatting.js';

export function validateFeatureName(name: string): boolean {
  if (!name || !name.trim()) return false;
  
  const kebabName = kebabCase(name);
  if (!kebabName || kebabName.length < 2) return false;
  
  // Check for invalid file system characters
  if (/[<>:"|?*\\]/.test(name)) return false;
  
  return true;
}

export function getTerminalSize(): [number, number] {
  try {
    const {columns, rows} = (process.stdout as any);
    if (columns && rows) return [columns, rows];
  } catch {}
  return [80, 24];
}

// Sanitize a feature name for filesystem and session safety
export function sanitizeFeatureName(name: string): string {
  const safe = String(name || '')
    .replace(/[^a-zA-Z0-9_-]/g, '-')
    .replace(/-+/g, '-')
    .replace(/^-+|-+$/g, '')
    .slice(0, 100);
  return safe || 'feature';
}
