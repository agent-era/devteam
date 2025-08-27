import fs from 'node:fs';
import path from 'node:path';

export interface ClaudePermissions {
  allow: string[];
  deny: string[];
  ask: string[];
}

export interface ClaudeSettings {
  permissions: ClaudePermissions;
}

export interface MergeResult {
  hasChanges: boolean;
  newPermissions: string[];
  mergedSettings: ClaudeSettings;
}

/**
 * Parse Claude settings from a file path
 */
export function parseClaudeSettings(filePath: string): ClaudeSettings | null {
  try {
    if (!fs.existsSync(filePath)) {
      return null;
    }
    
    const content = fs.readFileSync(filePath, 'utf8');
    const settings = JSON.parse(content) as ClaudeSettings;
    
    // Validate the structure
    if (!settings.permissions) {
      return null;
    }
    
    // Ensure all permission arrays exist
    if (!Array.isArray(settings.permissions.allow)) {
      settings.permissions.allow = [];
    }
    if (!Array.isArray(settings.permissions.deny)) {
      settings.permissions.deny = [];
    }
    if (!Array.isArray(settings.permissions.ask)) {
      settings.permissions.ask = [];
    }
    
    return settings;
  } catch (error) {
    console.warn(`Failed to parse Claude settings from ${filePath}:`, error);
    return null;
  }
}

/**
 * Merge permissions from source settings into target settings
 * Only adds new 'allow' permissions that don't already exist in target
 */
export function mergePermissions(sourceSettings: ClaudeSettings, targetSettings: ClaudeSettings): MergeResult {
  const newPermissions: string[] = [];
  const targetAllow = new Set(targetSettings.permissions.allow);
  
  // Find new permissions that don't exist in target
  for (const permission of sourceSettings.permissions.allow) {
    if (!targetAllow.has(permission)) {
      newPermissions.push(permission);
    }
  }
  
  // Create merged settings
  const mergedSettings: ClaudeSettings = {
    permissions: {
      allow: [...targetSettings.permissions.allow, ...newPermissions],
      deny: [...targetSettings.permissions.deny], // Keep existing deny permissions
      ask: [...targetSettings.permissions.ask] // Keep existing ask permissions
    }
  };
  
  return {
    hasChanges: newPermissions.length > 0,
    newPermissions,
    mergedSettings
  };
}

/**
 * Write Claude settings to a file
 */
export function writeClaudeSettings(filePath: string, settings: ClaudeSettings): boolean {
  try {
    // Ensure directory exists
    const dir = path.dirname(filePath);
    if (!fs.existsSync(dir)) {
      fs.mkdirSync(dir, { recursive: true });
    }
    
    // Write with pretty formatting
    const content = JSON.stringify(settings, null, 2);
    fs.writeFileSync(filePath, content, 'utf8');
    
    return true;
  } catch (error) {
    console.error(`Failed to write Claude settings to ${filePath}:`, error);
    return false;
  }
}

/**
 * Check if a worktree has Claude settings that could be merged to main project
 */
export function checkSettingsMergeOpportunity(worktreePath: string, mainProjectPath: string): {
  worktreeSettingsPath: string | null;
  mainSettingsPath: string | null;
  canMerge: boolean;
  scenario: 'no_worktree_settings' | 'copy_to_main' | 'merge_permissions';
} {
  const worktreeSettingsPath = path.join(worktreePath, '.claude', 'settings.local.json');
  const mainSettingsPath = path.join(mainProjectPath, '.claude', 'settings.local.json');
  
  const worktreeHasSettings = fs.existsSync(worktreeSettingsPath);
  const mainHasSettings = fs.existsSync(mainSettingsPath);
  
  if (!worktreeHasSettings) {
    return {
      worktreeSettingsPath: null,
      mainSettingsPath: null,
      canMerge: false,
      scenario: 'no_worktree_settings'
    };
  }
  
  if (!mainHasSettings) {
    return {
      worktreeSettingsPath,
      mainSettingsPath,
      canMerge: true,
      scenario: 'copy_to_main'
    };
  }
  
  return {
    worktreeSettingsPath,
    mainSettingsPath,
    canMerge: true,
    scenario: 'merge_permissions'
  };
}