import React, {useEffect, useMemo, useRef, useState} from 'react';
import {render} from 'ink';
import {WorktreeProvider, useWorktreeContext} from '../contexts/WorktreeContext.js';
import {GitHubProvider, useGitHubContext} from '../contexts/GitHubContext.js';
import type {WorktreeInfo, PRStatus} from '../models.js';
import {computeStatusLabel} from '../shared/status.js';

type WorktreeSummary = import('./types.js').WorktreeSummary;

function toSummaryRow(w: WorktreeInfo, pr: PRStatus | undefined): WorktreeSummary {
  return {
    project: w.project,
    feature: w.feature,
    path: w.path,
    branch: w.branch,
    session: w.session?.session_name,
    attached: !!w.session?.attached,
    ai_tool: w.session?.ai_tool,
    ai_status: w.session?.ai_status,
    has_changes: !!w.git?.has_changes,
    base_added_lines: w.git?.base_added_lines || 0,
    base_deleted_lines: w.git?.base_deleted_lines || 0,
    ahead: w.git?.ahead || 0,
    behind: w.git?.behind || 0,
    status_label: computeStatusLabel({
      ai_status: w.session?.ai_status,
      attached: w.session?.attached,
      has_changes: w.git?.has_changes,
      ahead: w.git?.ahead,
      behind: w.git?.behind,
      pr: pr ? {
        number: pr.number,
        state: pr.state,
        checks: pr.checks,
        mergeable: pr.mergeable,
        has_conflicts: pr.has_conflicts,
        is_ready_to_merge: pr.is_ready_to_merge,
        is_open: pr.is_open,
        is_merged: pr.is_merged,
        noPR: pr.noPR,
      } : undefined,
    }),
    is_workspace: !!w.is_workspace,
    is_workspace_header: !!w.is_workspace_header,
    is_workspace_child: !!w.is_workspace_child,
    parent_feature: w.parent_feature,
    last_commit_ts: w.last_commit_ts || 0,
  };
}

function Poster({postUrl, tickMs = 3000}: {postUrl: string; tickMs?: number}) {
  const {worktrees, lastRefreshed, refresh} = useWorktreeContext();
  const {getPRStatus, refreshPRStatus} = useGitHubContext();
  const [version, setVersion] = useState(0);
  const lastPayloadRef = useRef<string>('');

  // Periodic context refresh to drive updates
  useEffect(() => {
    let timer: NodeJS.Timeout | null = null;
    const tick = async () => {
      try {
        await refresh('none');
        await refreshPRStatus(worktrees);
      } catch {}
    };
    timer = setInterval(tick, tickMs);
    tick().catch(() => {});
    return () => { if (timer) clearInterval(timer); };
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // Compute and POST snapshot when inputs change
  useEffect(() => {
    const items: WorktreeSummary[] = worktrees.map(w => toSummaryRow(w, getPRStatus(w.path)));
    const text = JSON.stringify({items});
    if (text === lastPayloadRef.current) return;
    lastPayloadRef.current = text;
    const nextVersion = version + 1;
    setVersion(nextVersion);
    const payload = {type: 'worktrees.snapshot', version: nextVersion, items};
    try {
      fetch(postUrl, {method: 'POST', headers: {'content-type': 'application/json'}, body: JSON.stringify(payload)}).catch(() => {});
    } catch {}
  }, [worktrees, lastRefreshed, getPRStatus, postUrl, version]);

  // Render nothing (headless)
  return null as any;
}

export function startSyncBridge(postUrl: string, tickMs?: number) {
  const instance = render(
    React.createElement(WorktreeProvider, null,
      React.createElement(GitHubProvider, null,
        React.createElement(Poster, {postUrl, tickMs})
      )
    )
  );
  return {
    stop: () => { try { instance.unmount(); } catch {} }
  };
}

