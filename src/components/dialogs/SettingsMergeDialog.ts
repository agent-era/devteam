import React from 'react';
import {Box, Text, useInput, useStdin} from 'ink';
const h = React.createElement;

export type SettingsMergeAction = 'merge' | 'skip' | 'cancel';

type Props = {
  projectName: string;
  featureName: string;
  newPermissions: string[];
  scenario: 'copy_to_main' | 'merge_permissions';
  onAction: (action: SettingsMergeAction) => void;
};

export default function SettingsMergeDialog({
  projectName, 
  featureName, 
  newPermissions, 
  scenario,
  onAction
}: Props) {
  const {isRawModeSupported} = useStdin();
  
  useInput((input, key) => {
    if (!isRawModeSupported) return;
    
    if (key.escape || input === 'c') {
      onAction('cancel');
    } else if (input === 'm' || key.return) {
      onAction('merge');
    } else if (input === 's') {
      onAction('skip');
    }
  });

  const title = scenario === 'copy_to_main' 
    ? 'Copy Claude Settings' 
    : 'Merge Claude Settings';

  const description = scenario === 'copy_to_main'
    ? `The worktree ${projectName}/${featureName} has Claude settings, but the main project doesn't.`
    : `The worktree ${projectName}/${featureName} has new Claude permissions that can be merged to the main project.`;

  return h(
    Box,
    {flexDirection: 'column', padding: 1, borderStyle: 'round', borderColor: 'cyan'},
    
    // Title
    h(Text, {color: 'cyan', bold: true}, title),
    h(Text, null, ''),
    
    // Description
    h(Text, null, description),
    h(Text, null, ''),
    
    // Permissions list
    scenario === 'copy_to_main' 
      ? h(Text, {color: 'yellow'}, `All permissions from worktree will be copied (${newPermissions.length} permissions).`)
      : h(
          Box,
          {flexDirection: 'column'},
          h(Text, {color: 'yellow'}, `New permissions to be added to main project:`),
          h(Text, null, ''),
          ...newPermissions.slice(0, 8).map((permission, i) => 
            h(Text, {key: i, color: 'green'}, `  + ${permission}`)
          ),
          newPermissions.length > 8 ? h(Text, {color: 'gray'}, `  ... and ${newPermissions.length - 8} more`) : null
        ),
    
    h(Text, null, ''),
    
    // Actions
    h(
      Box,
      {flexDirection: 'column'},
      h(Text, {color: 'green'}, `m, Enter  ${scenario === 'copy_to_main' ? 'Copy' : 'Merge'} permissions`),
      h(Text, {color: 'yellow'}, `s         Skip and archive without ${scenario === 'copy_to_main' ? 'copying' : 'merging'}`),
      h(Text, {color: 'gray'}, `c, Esc    Cancel archive`)
    )
  );
}