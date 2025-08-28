import React from 'react';
import {Box, Text, useInput} from 'ink';
import FullScreen from '../components/common/FullScreen.js';
import {useWorktreeContext} from '../contexts/WorktreeContext.js';

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
  const {archiveFeature} = useWorktreeContext();

  const handleConfirm = async () => {
    try {
      // Archive the feature
      await archiveFeature(
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
  
  useInput((input, key) => {
    if (key.escape || input === 'n') {
      onCancel();
    } else if (key.return || input === 'y') {
      handleConfirm();
    }
  });

  return h(FullScreen, null,
    h(Box as any, {flexGrow: 1, alignItems: 'center', justifyContent: 'center'},
      h(Box, {flexDirection: 'column', paddingX: 2},
        h(Text, {bold: true, color: 'cyan'}, 'Archive Feature'),
        h(Box, {marginTop: 1},
          h(Text, null, `Archive ${featureInfo.project}/${featureInfo.feature}?`)
        ),
        h(Box, {marginTop: 1},
          h(Text, {color: 'gray'}, 'Press y to confirm, n to cancel')
        )
      )
    )
  );
}