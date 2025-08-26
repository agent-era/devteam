import React from 'react';
import {Box} from 'ink';
import CreateFeatureDialog from '../components/dialogs/CreateFeatureDialog.js';
import FullScreen from '../components/common/FullScreen.js';
import {useServices} from '../contexts/ServicesContext.js';

const h = React.createElement;

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
  const {worktreeService} = useServices();

  const handleSubmit = async (project: string, feature: string) => {
    try {
      const result = worktreeService.createFeature(project, feature);
      if (result) {
        // Auto-attach functionality from main
        onSuccess();
        
        // Small delay to ensure UI is updated and tmux session is ready
        await new Promise(resolve => setTimeout(resolve, 100));
        
        // Auto-attach to the newly created session
        worktreeService.attachOrCreateSession(result.project, result.feature, result.path);
      } else {
        onCancel();
      }
    } catch (error) {
      console.error('Failed to create feature:', error);
      onCancel();
    }
  };

  return h(FullScreen, null,
    h(Box as any, {flexGrow: 1, alignItems: 'center', justifyContent: 'center'},
      h(CreateFeatureDialog, {
        projects: projects as any,
        defaultProject,
        onCancel,
        onSubmit: handleSubmit
      })
    )
  );
}