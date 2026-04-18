import React, {useEffect, useState} from 'react';
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

const UNTRACKED_PREVIEW_LIMIT = 5;

export default function ArchiveConfirmScreen({
  featureInfo,
  onCancel,
  onSuccess
}: ArchiveConfirmScreenProps) {
  const {archiveFeature, archiveWorkspace, getUntrackedNonIgnoredFiles} = useWorktreeContext();
  const {isRawModeSupported} = useStdin();
  const [isArchiving, setIsArchiving] = useState(false);
  const [untrackedFiles, setUntrackedFiles] = useState<string[]>([]);

  useEffect(() => {
    if (featureInfo.project === 'workspace') return;
    try {
      setUntrackedFiles(getUntrackedNonIgnoredFiles(featureInfo.path));
    } catch {
      setUntrackedFiles([]);
    }
  }, [featureInfo.path, featureInfo.project, getUntrackedNonIgnoredFiles]);

  const handleConfirm = async () => {
    try {
      setIsArchiving(true);
      if (featureInfo.project === 'workspace') {
        await archiveWorkspace(featureInfo.feature);
      } else {
        // Archive single feature
        await archiveFeature(
          featureInfo.project,
          featureInfo.path,
          featureInfo.feature
        );
      }
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
          message={featureInfo.project === 'workspace'
            ? `Archiving workspace ${featureInfo.feature} and all children...`
            : `Archiving ${featureInfo.project}/${featureInfo.feature}...`}
          project={featureInfo.project}
        />
      ) : (
        <Box flexDirection="column" paddingX={2}>
          <Text bold color="cyan">Archive {featureInfo.project === 'workspace' ? 'Workspace' : 'Feature'}</Text>
          <Box marginTop={1}>
            {featureInfo.project === 'workspace' ? (
              <Text>Archive workspace {featureInfo.feature} and all project worktrees?</Text>
            ) : (
              <Text>Archive {featureInfo.project}/{featureInfo.feature}?</Text>
            )}
          </Box>
          {untrackedFiles.length > 0 && (
            <Box flexDirection="column" marginTop={1}>
              <Text color="yellow">
                Warning: {untrackedFiles.length} untracked file{untrackedFiles.length === 1 ? '' : 's'} will be deleted (git clean -fdx):
              </Text>
              {untrackedFiles.slice(0, UNTRACKED_PREVIEW_LIMIT).map((f) => (
                <Text key={f} color="yellow">  • {f}</Text>
              ))}
              {untrackedFiles.length > UNTRACKED_PREVIEW_LIMIT && (
                <Text color="yellow">  … and {untrackedFiles.length - UNTRACKED_PREVIEW_LIMIT} more</Text>
              )}
            </Box>
          )}
          <Box marginTop={1}>
            <Text color="magenta" wrap="truncate">Press y to confirm, n to cancel</Text>
          </Box>
        </Box>
      )}
    </Box>
  );
}
