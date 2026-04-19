# Branch Picking

## Goal

Create a new worktree from an existing remote branch, without having to type the branch name manually.

## User path

1. Press `b` on the list screen.
2. If multiple projects exist, UIContext transitions to `pickProjectForBranch` and a project picker dialog appears.
3. After selecting a project, UIContext transitions to `pickBranch`.
4. `WorktreeCore.getRemoteBranches(project)` fetches remote branches via `GitService`.
5. `BranchPickerDialog` renders a searchable list of remote branches.
6. User selects a branch; `WorktreeCore.createFromBranch(project, branch)` is called.
7. A worktree is created at `{root}/{project}-branches/{branch}/` checked out to that branch.

## createFromBranch vs createFeature

`createFromBranch` differs from `createFeature`:
- It checks out an existing remote branch rather than creating a new one.
- It does not create a new AI session automatically.
- If the branch name conflicts with an existing worktree directory, a numeric suffix is appended automatically.

## Modules

- `src/components/dialogs/` — `ProjectPickerDialog`, `BranchPickerDialog`
- `src/cores/WorktreeCore.ts` — `getRemoteBranches()`, `createFromBranch()`
- `src/services/GitService.ts` — remote branch listing
- `src/contexts/UIContext.tsx` — `showBranchPicker()`, `showBranchListForProject()`
