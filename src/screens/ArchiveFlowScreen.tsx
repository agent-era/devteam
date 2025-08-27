import React, {useState} from 'react';
import {Box} from 'ink';
import FullScreen from '../components/common/FullScreen.js';
import SettingsMergeDialog from '../components/dialogs/SettingsMergeDialog.js';
import ConfirmDialog from '../components/dialogs/ConfirmDialog.js';
import {useServices} from '../contexts/ServicesContext.js';

const h = React.createElement;

type FlowStep = 'settings_merge' | 'confirm_archive';

interface ArchiveFlowScreenProps {
  featureInfo: {
    project: string;
    feature: string;
    path: string;
  };
  onCancel: () => void;
  onSuccess: () => void;
}

export default function ArchiveFlowScreen({featureInfo, onCancel, onSuccess}: ArchiveFlowScreenProps) {
  const {worktreeService} = useServices();
  
  // Check for settings merge opportunities on mount
  const mergeInfo = worktreeService.checkClaudeSettingsMerge(
    featureInfo.project,
    featureInfo.path,
    featureInfo.feature
  );
  
  // Determine initial step based on merge availability
  const initialStep: FlowStep = mergeInfo.canMerge ? 'settings_merge' : 'confirm_archive';
  const [currentStep, setCurrentStep] = useState<FlowStep>(initialStep);
  const [mergePerformed, setMergePerformed] = useState(false);
  
  const handleMergeAction = (action: 'merge' | 'skip' | 'cancel') => {
    if (action === 'cancel') {
      onCancel();
      return;
    }
    
    if (action === 'merge') {
      // Perform the merge
      const success = worktreeService.performClaudeSettingsMerge(
        featureInfo.project,
        featureInfo.path
      );
      
      if (success) {
        setMergePerformed(true);
      }
    }
    
    // Move to archive confirmation for both 'merge' and 'skip'
    setCurrentStep('confirm_archive');
  };
  
  const handleArchiveConfirm = () => {
    try {
      const result = worktreeService.archiveFeature(
        featureInfo.project,
        featureInfo.path,
        featureInfo.feature
      );
      
      if (result) {
        // Success will trigger parent to refresh
        onSuccess();
      } else {
        onCancel();
      }
    } catch (error) {
      console.error('Failed to archive feature:', error);
      onCancel();
    }
  };
  
  // Render based on current step
  if (currentStep === 'settings_merge' && mergeInfo.canMerge) {
    // Only show dialog if scenario is valid for merging
    if (mergeInfo.scenario === 'copy_to_main' || mergeInfo.scenario === 'merge_permissions') {
      return h(FullScreen, null,
        h(Box as any, {flexGrow: 1, alignItems: 'center', justifyContent: 'center'},
          h(SettingsMergeDialog, {
            scenario: mergeInfo.scenario,
            newPermissions: mergeInfo.newPermissions,
            projectName: featureInfo.project,
            featureName: featureInfo.feature,
            onAction: handleMergeAction
          })
        )
      );
    }
  }
  
  // Render archive confirmation dialog
  const message = mergePerformed 
    ? `Archive feature "${featureInfo.feature}" from project "${featureInfo.project}"?\n\nClaude settings have been merged to main project.`
    : `Archive feature "${featureInfo.feature}" from project "${featureInfo.project}"?`;
  
  return h(FullScreen, null,
    h(Box as any, {flexGrow: 1, alignItems: 'center', justifyContent: 'center'},
      h(ConfirmDialog, {
        title: 'Archive Feature',
        message,
        onConfirm: handleArchiveConfirm,
        onCancel: onCancel
      })
    )
  );
}