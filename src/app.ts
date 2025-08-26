import React, {useEffect, useState} from 'react';
import {render, useApp, useStdin, Box} from 'ink';
import MainView from './ui/MainView.js';
import CreateFeatureDialog from './ui/CreateFeatureDialog.js';
import ConfirmDialog from './ui/ConfirmDialog.js';
import ArchivedView from './ui/ArchivedView.js';
import HelpOverlay from './ui/HelpOverlay.js';
import FullScreen from './ui/FullScreen.js';
const h = React.createElement;
import {GitManager} from './gitManager.js';
import {TmuxManager} from './tmuxManager.js';
import {AppState, WorktreeInfo} from './models.js';
import {CACHE_DURATION, AI_STATUS_REFRESH_DURATION, DIFF_STATUS_REFRESH_DURATION, PR_REFRESH_DURATION, BASE_PATH, DIR_BRANCHES_SUFFIX} from './constants.js';
import {attachOrCreateSession, createFeature, archiveFeature, getPRStatus, deleteArchived, attachOrCreateShellSession, setupWorktreeEnvironment, createTmuxSession} from './ops.js';
import {runCommandQuick} from './utils.js';
import ProjectPickerDialog from './ui/ProjectPickerDialog.js';
import BranchPickerDialog from './ui/BranchPickerDialog.js';
import CleanDiffView from './ui/CleanDiffView.js';

const gm = new GitManager();
const tm = new TmuxManager();

function useInterval(callback: () => void, delay: number) {
  useEffect(() => {
    const id = setInterval(callback, delay);
    return () => clearInterval(id);
  }, [callback, delay]);
}

function collectWorktrees(): Array<{project: string; feature: string; path: string; branch: string; mtime?: number}> {
  const projects = gm.discoverProjects();
  const rows = [];
  for (const p of projects) {
    const wts = gm.getWorktreesForProject(p);
    for (const wt of wts) rows.push(wt);
  }
  return rows;
}

function attachRuntimeData(list: Array<{project: string; feature: string; path: string; branch: string}>): WorktreeInfo[] {
  return list.map((w: any) => {
    const git = gm.getGitStatus(w.path);
    const sessionName = tm.sessionName(w.project, w.feature);
    const attached = tm.listSessions().includes(sessionName);
    const claude = attached ? tm.getClaudeStatus(sessionName) : 'not_running';
    // last commit timestamp for sorting (fallback to mtime)
    let lastTs = 0;
    const tsOut = runCommandQuick(['git', '-C', w.path, 'log', '-1', '--format=%ct']);
    if (tsOut) {
      const n = Number(tsOut.trim());
      if (!Number.isNaN(n)) lastTs = n;
    }
    return new WorktreeInfo({
      project: w.project,
      feature: w.feature,
      path: w.path,
      branch: w.branch,
      git,
      session: {session_name: sessionName, attached, claude_status: claude},
      pr: undefined,
      mtime: (w as any).mtime || 0,
      last_commit_ts: lastTs,
    });
  });
}

function refreshAIStatus(worktrees: WorktreeInfo[]): WorktreeInfo[] {
  return worktrees.map(w => {
    const sessionName = tm.sessionName(w.project, w.feature);
    const attached = tm.listSessions().includes(sessionName);
    const claude = attached ? tm.getClaudeStatus(sessionName) : 'not_running';
    return new WorktreeInfo({
      ...w,
      session: {session_name: sessionName, attached, claude_status: claude}
    });
  });
}

function refreshDiffStatus(worktrees: WorktreeInfo[]): WorktreeInfo[] {
  return worktrees.map(w => {
    const git = gm.getGitStatus(w.path);
    return new WorktreeInfo({
      ...w,
      git
    });
  });
}

function mergeWorktreesPreservingData(newWorktrees: WorktreeInfo[], existingWorktrees: WorktreeInfo[]): WorktreeInfo[] {
  const existingMap = new Map<string, WorktreeInfo>();
  for (const wt of existingWorktrees) {
    existingMap.set(wt.path, wt);
  }
  
  return newWorktrees.map(newWt => {
    const existing = existingMap.get(newWt.path);
    if (existing) {
      // Preserve existing PR data and other fields, but update fresh data
      return new WorktreeInfo({
        ...newWt,
        pr: existing.pr || newWt.pr  // Preserve existing PR data
      });
    }
    return newWt;
  });
}

function sortWorktrees(wt: WorktreeInfo[]): WorktreeInfo[] {
  return wt.slice().sort((a, b) => {
    const ta = (a.last_commit_ts && a.last_commit_ts > 0 ? a.last_commit_ts : (a.mtime || 0));
    const tb = (b.last_commit_ts && b.last_commit_ts > 0 ? b.last_commit_ts : (b.mtime || 0));
    return tb - ta; // descending
  });
}

type UIMode = 'list' | 'create' | 'confirmArchive' | 'archived' | 'help' | 'pickProjectForBranch' | 'pickBranch' | 'diff';

export default function App() {
  const [state, setState] = useState(new AppState());
  const [shouldExit, setShouldExit] = useState(false);
  const {exit} = useApp();
  const {isRawModeSupported} = useStdin();
  const [uiMode, setUiMode] = useState<UIMode>('list');
  const [createProjects, setCreateProjects] = useState<any[]>([]);
  const [pendingArchive, setPendingArchive] = useState<{project: string; feature: string; path: string} | null>(null);
  const [archivedItems, setArchivedItems] = useState<any[]>([]);
  const [archivedIndex, setArchivedIndex] = useState(0);
  const [branchProject, setBranchProject] = useState<string | null>(null);
  const [branchList, setBranchList] = useState<any[]>([]);
  const [diffWorktree, setDiffWorktree] = useState<string | null>(null);
  const [diffType, setDiffType] = useState<'full' | 'uncommitted'>('full');

  useEffect(() => {
    // initial load (do not block on PR)
    const worktrees = collectWorktrees();
    const wtInfos = sortWorktrees(attachRuntimeData(worktrees));
    const rows = process.stdout.rows || 24;
    const pageSize = Math.max(1, rows - 3);
    setState((s) => ({...s, worktrees: wtInfos, lastRefreshedAt: Date.now(), pageSize}));
    Promise.resolve().then(async () => {
      try {
        const prMap = await gm.batchGetPRStatusForWorktreesAsync(wtInfos.map(w => ({project: w.project, path: w.path})), true);
        const withPr = sortWorktrees(wtInfos.map(w => new WorktreeInfo({...w, pr: prMap[w.path] || w.pr})));
        setState((s) => ({...s, worktrees: withPr}));
      } catch {}
    });
  }, []);

  // AI status refresh every 2 seconds
  useInterval(() => {
    setState((s) => ({
      ...s,
      worktrees: sortWorktrees(refreshAIStatus(s.worktrees)),
    }));
  }, AI_STATUS_REFRESH_DURATION);

  // Diff status refresh every 2 seconds
  useInterval(() => {
    setState((s) => ({
      ...s,
      worktrees: sortWorktrees(refreshDiffStatus(s.worktrees)),
    }));
  }, DIFF_STATUS_REFRESH_DURATION);

  // PR refresh every 30s for non-merged PRs only
  useInterval(() => {
    // Fire-and-forget async, don't block input
    (async () => {
      const current = state.worktrees;
      if (!current.length) return;
      try {
        // Only refresh PRs that are not merged
        const nonMergedWorktrees = current.filter(w => !w.pr?.is_merged);
        if (nonMergedWorktrees.length === 0) return;
        
        const prMap = await gm.batchGetPRStatusForWorktreesAsync(nonMergedWorktrees.map(w => ({project: w.project, path: w.path})), true);
        const updated = current.map(w => {
          // Only update PR status if this worktree was in the refresh batch, otherwise preserve existing PR data
          if (nonMergedWorktrees.some(nw => nw.path === w.path)) {
            return new WorktreeInfo({...w, pr: prMap[w.path] || w.pr});
          }
          return w;
        });
        setState((s) => ({...s, worktrees: sortWorktrees(updated)}));
      } catch {}
    })();
  }, PR_REFRESH_DURATION);

  useInterval(() => {
    // full discovery refresh (preserve existing data)
    const list = collectWorktrees();
    const freshWtInfos = attachRuntimeData(list);
    setState((s) => {
      const merged = sortWorktrees(mergeWorktreesPreservingData(freshWtInfos, s.worktrees));
      return {...s, worktrees: merged, lastRefreshedAt: Date.now()};
    });
    Promise.resolve().then(async () => {
      try {
        const prMap = await gm.batchGetPRStatusForWorktreesAsync(freshWtInfos.map(w => ({project: w.project, path: w.path})), true);
        setState((s) => {
          const withPr = s.worktrees.map(w => {
            const prData = prMap[w.path];
            return prData ? new WorktreeInfo({...w, pr: prData}) : w;
          });
          return {...s, worktrees: sortWorktrees(withPr)};
        });
      } catch {}
    });
    // Clean up orphaned tmux sessions
    try { tm.cleanupOrphanedSessions(freshWtInfos.map(w => w.path)); } catch {}
  }, CACHE_DURATION);

  // In non-interactive environments (no raw mode), auto-exit after initial render
  useEffect(() => {
    if (!isRawModeSupported) {
      const id = setTimeout(() => exit(), 800);
      return () => clearTimeout(id);
    }
  }, [isRawModeSupported, exit]);

  // Honor explicit quit (q)
  useEffect(() => {
    if (shouldExit) {
      exit();
      // Force process exit if Ink doesn't handle it properly
      setTimeout(() => process.exit(0), 100);
    }
  }, [shouldExit, exit]);

  const onMove = (delta: number) => {
    setState((s) => {
      const next = Math.max(0, Math.min(s.worktrees.length - 1, s.selectedIndex + delta));
      return {...s, selectedIndex: next};
    });
  };

  const onSelect = () => {
    const w = state.worktrees[state.selectedIndex];
    if (!w) return;
    try {
      attachOrCreateSession(w.project, w.feature, w.path);
    } catch {}
    // Refresh the specific row that was selected to get fresh AI/diff status
    const list = collectWorktrees();
    const freshWtInfos = attachRuntimeData(list);
    setState((s) => {
      const merged = sortWorktrees(mergeWorktreesPreservingData(freshWtInfos, s.worktrees));
      return {...s, worktrees: merged};
    });
    // Also refresh PR status for the selected row specifically
    Promise.resolve().then(async () => {
      try {
        const prMap = await gm.batchGetPRStatusForWorktreesAsync([{project: w.project, path: w.path}], true);
        setState((s) => {
          const updated = s.worktrees.map(wt => {
            if (wt.path === w.path) {
              const prData = prMap[wt.path];
              return prData ? new WorktreeInfo({...wt, pr: prData}) : wt;
            }
            return wt;
          });
          return {...s, worktrees: sortWorktrees(updated)};
        });
      } catch {}
    });
  };

  const onCreate = () => {
    const projects = gm.discoverProjects();
    if (!projects.length) {
      setState((s) => ({...s, mode: 'message', message: 'No projects found under ~/projects.'}));
      return;
    }
    setCreateProjects(projects);
    setUiMode('create');
  };

  const onArchive = () => {
    const w = state.worktrees[state.selectedIndex];
    if (!w) return;
    setPendingArchive({project: w.project, feature: w.feature, path: w.path});
    setUiMode('confirmArchive');
  };

  const onRefresh = () => {
    const list = collectWorktrees();
    setState((s) => ({...s, worktrees: sortWorktrees(attachRuntimeData(list)), lastRefreshedAt: Date.now()}));
  };

  const loadArchived = () => {
    const projs = gm.discoverProjects();
    const items: any[] = [];
    for (const p of projs) items.push(...gm.getArchivedForProject(p));
    setArchivedItems(items);
    setArchivedIndex((idx) => Math.min(Math.max(0, items.length - 1), idx));
  };

  // Raw-mode keybinds for create/archive/refresh
  const {stdin, setRawMode, isRawModeSupported: rawOk} = useStdin();
  useEffect(() => {
    if (!rawOk) return;
    setRawMode(true);
    const handler = (buf: Buffer) => {
      const s = buf.toString('utf8');
      if (uiMode === 'list') {
        if (s === 'n') onCreate();
        else if (s === 'a') onArchive();
        else if (s === 'r') onRefresh();
        else if (s === 'v') { loadArchived(); setUiMode('archived'); }
        else if (s === '?') { setUiMode('help'); }
        else if (s === 'b') {
          const projects = gm.discoverProjects();
          if (!projects.length) return;
          const defaultProject = state.worktrees[state.selectedIndex]?.project || projects[0].name;
          if (projects.length === 1) {
            setBranchProject(defaultProject);
            const repoPath = state.worktrees.find(w => w.project === defaultProject)?.path || `${BASE_PATH}/${defaultProject}`;
            const baseList = gm.getRemoteBranches(defaultProject);
            setBranchList(baseList);
            (async () => {
              try {
                const prMap = await gm.batchFetchPRDataAsync(repoPath, {includeChecks: true, includeTitle: true});
                const enriched = baseList.map((b: any) => {
                  const pr = prMap[b.local_name] || prMap[`feature/${b.local_name}`];
                  return pr ? {...b, pr_number: pr.number, pr_state: pr.state, pr_checks: pr.checks, pr_title: (pr as any).title} : b;
                });
                setBranchList(enriched);
              } catch {}
            })();
            setUiMode('pickBranch');
          } else {
            setCreateProjects(projects);
            setUiMode('pickProjectForBranch');
          }
        }
        else if (s === 's') {
          const w = state.worktrees[state.selectedIndex];
          if (w) {
            try { attachOrCreateShellSession(w.project, w.feature, w.path); } catch {}
            onRefresh();
          }
        }
        else if (s === 'd') {
          const w = state.worktrees[state.selectedIndex];
          if (w) {
            setDiffWorktree(w.path);
            setDiffType('full');
            setUiMode('diff');
          }
        }
        else if (s === 'D') {
          const w = state.worktrees[state.selectedIndex];
          if (w) {
            setDiffWorktree(w.path);
            setDiffType('uncommitted');
            setUiMode('diff');
          }
        }
        else if (s === '<' || s === ',') {
          // previous page
          setState((st) => {
            const total = Math.max(1, Math.ceil(st.worktrees.length / st.pageSize));
            const prev = (st.page - 1 + total) % total;
            const newIndex = Math.min(prev * st.pageSize, st.worktrees.length - 1);
            return {...st, page: prev, selectedIndex: newIndex};
          });
        } else if (s === '>' || s === '.') {
          setState((st) => {
            const total = Math.max(1, Math.ceil(st.worktrees.length / st.pageSize));
            const next = (st.page + 1) % total;
            const newIndex = Math.min(next * st.pageSize, st.worktrees.length - 1);
            return {...st, page: next, selectedIndex: newIndex};
          });
        }
      }
    };
    stdin.on('data', handler);
    const onResize = () => {
      const rows = process.stdout.rows || 24;
      const pageSize = Math.max(1, rows - 3);
      setState((st) => ({...st, pageSize}));
    };
    process.stdout.on('resize', onResize);
    return () => {
      stdin.off('data', handler);
      setRawMode(false);
      process.stdout.off?.('resize', onResize as any);
    };
  }, [rawOk, uiMode, state.selectedIndex, state.worktrees]);
  if (uiMode === 'create') {
    const defaultProject = state.worktrees[state.selectedIndex]?.project || createProjects[0]?.name;
    return h(FullScreen, null,
      h(Box as any, {flexGrow: 1, alignItems: 'center', justifyContent: 'center'},
        h(CreateFeatureDialog, {
          projects: createProjects as any,
          defaultProject,
          onCancel: () => setUiMode('list'),
          onSubmit: (project: string, feature: string) => {
            createFeature(project, feature);
            const list = collectWorktrees();
            const wtInfos = sortWorktrees(attachRuntimeData(list));
            setState((s) => ({...s, worktrees: wtInfos}));
            setUiMode('list');
          }
        })
      )
    );
  }

  if (uiMode === 'confirmArchive' && pendingArchive) {
    return h(FullScreen, null,
      h(Box as any, {flexGrow: 1, alignItems: 'center', justifyContent: 'center'},
        h(ConfirmDialog, {
          title: 'Archive Feature',
          message: `Archive ${pendingArchive.project}/${pendingArchive.feature}?`,
          onCancel: () => { setUiMode('list'); setPendingArchive(null); },
          onConfirm: () => {
            archiveFeature(pendingArchive.project, pendingArchive.path, pendingArchive.feature);
            const list = collectWorktrees();
            const wtInfos = sortWorktrees(attachRuntimeData(list));
            setState((s) => ({...s, worktrees: wtInfos}));
            setPendingArchive(null);
            setUiMode('list');
          }
        })
      )
    );
  }

  if (uiMode === 'archived') {
    return h(FullScreen, null,
      h(ArchivedView, {
        items: archivedItems as any,
        selectedIndex: archivedIndex,
        onMove: (d: number) => setArchivedIndex((i) => Math.max(0, Math.min((archivedItems.length - 1), i + d))),
        onDelete: (i: number) => {
          const it = archivedItems[i];
          if (!it) return;
          deleteArchived(it.path);
          loadArchived();
        },
        onBack: () => setUiMode('list')
      })
    );
  }

  if (uiMode === 'help') {
    return h(FullScreen, null,
      h(Box as any, {flexGrow: 1, paddingX: 1}, h(HelpOverlay, { onClose: () => setUiMode('list') }))
    );
  }

  if (uiMode === 'diff' && diffWorktree) {
    return h(FullScreen, null,
      h(Box as any, {flexGrow: 1, paddingX: 1},
        h(CleanDiffView, {
          worktreePath: diffWorktree, 
          title: diffType === 'uncommitted' ? 'Diff Viewer (Uncommitted Changes)' : 'Diff Viewer',
          diffType,
          onClose: () => { setUiMode('list'); setDiffWorktree(null); }
        })
      )
    );
  }

  if (uiMode === 'pickProjectForBranch') {
    const defaultProject = state.worktrees[state.selectedIndex]?.project || createProjects[0]?.name;
    return h(FullScreen, null,
      h(Box as any, {flexGrow: 1, alignItems: 'center', justifyContent: 'center'},
        h(ProjectPickerDialog, {
          projects: createProjects as any,
          defaultProject,
          onCancel: () => setUiMode('list'),
          onSubmit: (proj: string) => {
            setBranchProject(proj);
            const repoPath = state.worktrees.find(w => w.project === proj)?.path || `${BASE_PATH}/${proj}`;
            const baseList = gm.getRemoteBranches(proj);
            setBranchList(baseList);
            (async () => {
              try {
                const prMap = await gm.batchFetchPRDataAsync(repoPath, {includeChecks: true, includeTitle: true});
                const enriched = baseList.map((b: any) => {
                  const pr = prMap[b.local_name] || prMap[`feature/${b.local_name}`];
                  return pr ? {...b, pr_number: pr.number, pr_state: pr.state, pr_checks: pr.checks, pr_title: (pr as any).title} : b;
                });
                setBranchList(enriched);
              } catch {}
            })();
            setUiMode('pickBranch');
          }
        })
      )
    );
  }

  if (uiMode === 'pickBranch') {
    return h(FullScreen, null,
      h(Box as any, {flexGrow: 1, alignItems: 'center', justifyContent: 'center'},
        h(BranchPickerDialog, {
          branches: branchList as any,
          onCancel: () => { setUiMode('list'); setBranchProject(null); setBranchList([]); },
          onSubmit: async (remoteBranch: string, localName: string) => {
            const proj = branchProject || state.worktrees[state.selectedIndex]?.project;
            if (!proj) { setUiMode('list'); return; }
            const ok = gm.createWorktreeFromRemote(proj, remoteBranch, localName);
            if (ok) {
              const worktreePath = [BASE_PATH, `${proj}${DIR_BRANCHES_SUFFIX}`, localName].join('/');
              setupWorktreeEnvironment(proj, worktreePath);
              createTmuxSession(proj, localName, worktreePath);
            }
            const list = collectWorktrees();
            const wtInfos = sortWorktrees(attachRuntimeData(list));
            setState((s) => ({...s, worktrees: wtInfos}));
            setUiMode('list');
            setBranchProject(null);
            setBranchList([]);
            // Fetch PR status asynchronously without blocking UI
            Promise.resolve().then(async () => {
              try {
                const prMap = await gm.batchGetPRStatusForWorktreesAsync(wtInfos.map(w => ({project: w.project, path: w.path})), true);
                const withPr = sortWorktrees(wtInfos.map(w => new WorktreeInfo({...w, pr: prMap[w.path] || w.pr})));
                setState((s) => ({...s, worktrees: withPr}));
              } catch {}
            });
          },
          onRefresh: () => {
            if (!branchProject) return;
            const repoPath = state.worktrees.find(w => w.project === branchProject)?.path || `${BASE_PATH}/${branchProject}`;
            const baseList = gm.getRemoteBranches(branchProject);
            setBranchList(baseList);
            (async () => {
              try {
                const prMap = await gm.batchFetchPRDataAsync(repoPath, {includeChecks: true, includeTitle: true});
                const enriched = baseList.map((b: any) => {
                  const pr = prMap[b.local_name] || prMap[`feature/${b.local_name}`];
                  return pr ? {...b, pr_number: pr.number, pr_state: pr.state, pr_checks: pr.checks, pr_title: (pr as any).title} : b;
                });
                setBranchList(enriched);
              } catch {}
            })();
          }
        })
      )
    );
  }

  return h(FullScreen, null,
    h(MainView, {
    worktrees: state.worktrees,
    selectedIndex: state.selectedIndex,
    onMove,
    onSelect,
    onQuit: () => setShouldExit(true),
    mode: state.mode,
    message: state.message,
    page: state.page,
    pageSize: state.pageSize,
  })
  );
}

export function run() {
  const {waitUntilExit} = render(h(App));
  return waitUntilExit();
}
