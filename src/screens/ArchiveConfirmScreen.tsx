import React, {useState, useEffect} from 'react';
import {Box, Text, useInput, useStdin} from 'ink';
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
  const {isRawModeSupported} = useStdin();
  const [mergeSettings, setMergeSettings] = useState(true);
  const [newPermissions, setNewPermissions] = useState<string[] | null>(null);
  
  // Check for Claude settings on mount
  useEffect(() => {
    const permissions = worktreeService.getClaudeSettingsToMerge(
      featureInfo.project,
      featureInfo.path
    );
    setNewPermissions(permissions);
  }, [featureInfo, worktreeService]);

  const handleConfirm = () => {
    try {
      // Merge Claude settings if requested and available
      if (mergeSettings && newPermissions) {
        worktreeService.mergeClaudeSettings(featureInfo.project, featureInfo.path);
      }
      
      // Archive the feature
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
  
  useInput((input, key) => {
    if (!isRawModeSupported) return;
    
    if (key.escape || input === 'n') {
      onCancel();
    } else if (key.return || input === 'y') {
      handleConfirm();
    } else if (input === 'm' && newPermissions) {
      setMergeSettings(!mergeSettings);
    }
  });

  return h(FullScreen, null,
    h(Box as any, {flexGrow: 1, alignItems: 'center', justifyContent: 'center'},
      h(Box, {flexDirection: 'column', paddingX: 2},
        h(Text, {bold: true, color: 'cyan'}, 'Archive Feature'),
        h(Box, {marginTop: 1},
          h(Text, null, `Archive ${featureInfo.project}/${featureInfo.feature}?`)
        ),
        
        newPermissions && newPermissions.length > 0 && h(Box, {flexDirection: 'column', marginTop: 1},
          h(Text, {color: 'yellow'}, `Found ${newPermissions.length} Claude permission${newPermissions.length > 1 ? 's' : ''} to merge:`),
          h(Box, {flexDirection: 'column', marginLeft: 2},
            ...newPermissions.slice(0, 5).map((perm, i) => 
              h(Text, {key: i, color: 'green'}, `+ ${perm}`)
            ),
            newPermissions.length > 5 && h(Text, {color: 'gray'}, `  ... and ${newPermissions.length - 5} more`)
          ),
          h(Box, {marginTop: 1},
            h(Text, {color: mergeSettings ? 'green' : 'gray'}, 
              `[${mergeSettings ? '✓' : ' '}] Merge permissions (press 'm' to toggle)`)
          )
        ),
        
        h(Box, {marginTop: 1},
          h(Text, {color: 'gray'}, 'Press y to confirm, n to cancel')
        )
      )
    )
  );
}