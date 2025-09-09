import React, {useState} from 'react';
import {Box, Text, useInput, useStdin} from 'ink';
import {useWorktreeContext} from '../contexts/WorktreeContext.js';
import ProgressDialog from '../components/dialogs/ProgressDialog.js';


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
  const {isRawModeSupported} = useStdin();
  const [isArchiving, setIsArchiving] = useState(false);

  const handleConfirm = async () => {
    try {
      setIsArchiving(true);
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
    if (isArchiving) return; // Ignore input while archiving
    if (key.escape || input === 'n') {
      onCancel();
    } else if (key.return || input === 'y') {
      handleConfirm();
    }
  });

  return (
    <Box flexGrow={1} alignItems="center" justifyContent="center">
      {isArchiving ? (
        <ProgressDialog
          title="Archiving"
          message={`Archiving ${featureInfo.project}/${featureInfo.feature}...`}
          project={featureInfo.project}
        />
      ) : (
        <Box flexDirection="column" paddingX={2}>
          <Text bold color="cyan">Archive Feature</Text>
          <Box marginTop={1}>
            <Text>Archive {featureInfo.project}/{featureInfo.feature}?</Text>
          </Box>
          <Box marginTop={1}>
            <Text color="magenta" wrap="truncate">Press y to confirm, n to cancel</Text>
          </Box>
        </Box>
      )}
    </Box>
  );
}
