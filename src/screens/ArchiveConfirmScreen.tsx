import React from 'react';
import {Box} from 'ink';
import ConfirmDialog from '../components/dialogs/ConfirmDialog.js';
import FullScreen from '../components/common/FullScreen.js';
import {useServices} from '../contexts/ServicesContext.js';

const h = React.createElement;

interface ArchiveFeatureInfo {
  project: string;
  feature: string;
  path: string;
}

interface ArchiveConfirmScreenProps {
  featureInfo: ArchiveFeatureInfo;
  onCancel: () => void;
  onSuccess: () => void;
}

export default function ArchiveConfirmScreen({
  featureInfo,
  onCancel,
  onSuccess
}: ArchiveConfirmScreenProps) {
  const {worktreeService} = useServices();

  const handleConfirm = () => {
    try {
      worktreeService.archiveFeature(
        featureInfo.project,
        featureInfo.path,
        featureInfo.feature
      );
      onSuccess();
    } catch (error) {
      console.error('Failed to archive feature:', error);
      onCancel();
    }
  };

  return h(FullScreen, null,
    h(Box as any, {flexGrow: 1, alignItems: 'center', justifyContent: 'center'},
      h(ConfirmDialog, {
        title: 'Archive Feature',
        message: `Archive ${featureInfo.project}/${featureInfo.feature}?`,
        onCancel,
        onConfirm: handleConfirm
      })
    )
  );
}