import React from 'react';
import {Box} from 'ink';
import SettingsMergeDialog, { type SettingsMergeAction } from '../components/dialogs/SettingsMergeDialog.js';
import FullScreen from '../components/common/FullScreen.js';
import {useServices} from '../contexts/ServicesContext.js';
import {type SettingsMergeInfo} from '../services/WorktreeService.js';

const h = React.createElement;

interface ArchiveFeatureInfo {
  project: string;
  feature: string;
  path: string;
}

interface SettingsMergeScreenProps {
  featureInfo: ArchiveFeatureInfo;
  settingsMergeInfo: SettingsMergeInfo;
  onCancel: () => void;
  onContinueToArchive: () => void;
}

export default function SettingsMergeScreen({
  featureInfo,
  settingsMergeInfo,
  onCancel,
  onContinueToArchive
}: SettingsMergeScreenProps) {
  const {worktreeService} = useServices();

  const handleAction = (action: SettingsMergeAction) => {
    if (action === 'cancel') {
      onCancel();
      return;
    }
    
    if (action === 'merge') {
      // Perform the merge
      try {
        const success = worktreeService.performClaudeSettingsMerge(
          featureInfo.project,
          featureInfo.path
        );
        if (!success) {
          console.warn('Failed to merge Claude settings, but continuing with archive');
        }
      } catch (error) {
        console.error('Error merging Claude settings:', error);
      }
    }
    
    // Continue to archive confirmation (whether merge succeeded, skipped, or failed)
    onContinueToArchive();
  };

  return h(FullScreen, null,
    h(Box as any, {flexGrow: 1, alignItems: 'center', justifyContent: 'center'},
      h(SettingsMergeDialog, {
        projectName: featureInfo.project,
        featureName: featureInfo.feature,
        newPermissions: settingsMergeInfo.newPermissions,
        scenario: settingsMergeInfo.scenario as 'copy_to_main' | 'merge_permissions',
        onAction: handleAction
      })
    )
  );
}