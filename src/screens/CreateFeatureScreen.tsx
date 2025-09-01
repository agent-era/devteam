import React from 'react';
import {Box} from 'ink';
import CreateFeatureDialog from '../components/dialogs/CreateFeatureDialog.js';
import FullScreen from '../components/common/FullScreen.js';
import {useWorktreeContext} from '../contexts/WorktreeContext.js';
import {useUIContext} from '../contexts/UIContext.js';


interface CreateFeatureScreenProps {
  projects: Array<{name: string; path: string}>;
  defaultProject?: string;
  onCancel: () => void;
  onSuccess: () => void;
}

export default function CreateFeatureScreen({
  projects,
  defaultProject,
  onCancel,
  onSuccess
}: CreateFeatureScreenProps) {
  const {createFeature, attachSession, needsToolSelection} = useWorktreeContext();
  const {showAIToolSelection} = useUIContext();

  const handleSubmit = async (project: string, feature: string) => {
    try {
      const result = await createFeature(project, feature);
      if (result) {
        // Auto-attach functionality from main
        onSuccess();
        
        // Small delay to ensure UI is updated and tmux session is ready
        await new Promise(resolve => setTimeout(resolve, 100));
        
        // Check if tool selection is needed
        const needsSelection = await needsToolSelection(result);
        
        if (needsSelection) {
          // Show AI tool selection dialog
          showAIToolSelection(result);
        } else {
          // Auto-attach to the newly created session
          attachSession(result);
        }
      } else {
        onCancel();
      }
    } catch (error) {
      console.error('Failed to create feature:', error);
      onCancel();
    }
  };

  return (
    <FullScreen>
      <Box flexGrow={1} alignItems="center" justifyContent="center">
        <CreateFeatureDialog
          projects={projects as any}
          defaultProject={defaultProject}
          onCancel={onCancel}
          onSubmit={handleSubmit}
        />
      </Box>
    </FullScreen>
  );
}