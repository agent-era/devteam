import React from 'react';
import {Box} from 'ink';
import CreateFeatureDialog from '../components/dialogs/CreateFeatureDialog.js';
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
  const {createFeature, needsToolSelection, createWorkspace, attachWorkspaceSession, attachSession, workspaceExists} = useWorktreeContext();
  const {showAIToolSelection, showInfo} = useUIContext();

  // Updated: support multiple projects; if only one selected, do NOT create a workspace
  const handleSubmit = async (selectedProjects: string[], feature: string) => {
    try {
      // Block if a workspace already exists for this feature name
      if (workspaceExists(feature)) {
        showInfo(`A workspace named '${feature}' already exists. Please choose a different feature name.`, {
          title: 'Workspace Exists',
          onClose: onCancel
        });
        return;
      }
      // Create a worktree for each selected project
      const createdResults = [] as any[];
      for (const p of selectedProjects) {
        const r = await createFeature(p, feature);
        if (r) createdResults.push(r);
      }

      if (createdResults.length === 0) { onCancel(); return; }

      // If only a single project was selected, do not create a workspace.
      if (selectedProjects.length === 1) {
        const created = createdResults[0];
        if (created) {
          onSuccess();
          // Small delay to ensure UI state updates and worktree appears
          await new Promise(resolve => setTimeout(resolve, 100));
          const needsSelection = await needsToolSelection(created);
          if (needsSelection) {
            showAIToolSelection(created);
          } else {
            await attachSession(created);
          }
        } else {
          onCancel();
        }
        return;
      }

      // Multiple projects selected -> create a workspace and attach in workspace dir
      const wsPath = await createWorkspace(feature, selectedProjects);
      const workspaceWorktree = wsPath ? { project: 'workspace', feature, path: wsPath } as any : null;
      if (workspaceWorktree) {
        const needsSelection = await needsToolSelection(workspaceWorktree);
        onSuccess();
        await new Promise(resolve => setTimeout(resolve, 100));
        if (needsSelection) {
          showAIToolSelection(workspaceWorktree);
        } else {
          await attachWorkspaceSession(feature);
        }
      } else {
        onSuccess();
      }
    } catch (error) {
      console.error('Failed to create feature:', error);
      onCancel();
    }
  };

  return (
    <Box flexGrow={1} alignItems="center" justifyContent="center">
      <CreateFeatureDialog
        projects={projects as any}
        defaultProject={defaultProject}
        onCancel={onCancel}
        onSubmit={handleSubmit}
      />
    </Box>
  );
}
