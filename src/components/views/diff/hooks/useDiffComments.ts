import {useEffect, useMemo, useState} from 'react';
import {runCommand, runCommandAsync} from '../../../../shared/utils/commandExecutor.js';
import {findBaseBranch} from '../../../../shared/utils/gitHelpers.js';
import {BASE_BRANCH_CANDIDATES} from '../../../../constants.js';
import {commentStoreManager} from '../../../../services/CommentStoreManager.js';
import {TmuxService} from '../../../../services/TmuxService.js';
import {formatCommentsAsLines, formatCommentsAsPrompt} from '../../../../shared/utils/diff/formatCommentsAsPrompt.js';
import type {DiffLine, SideBySideLine, DiffType, ViewMode} from '../../../../shared/utils/diff/types.js';

type Params = {
  worktreePath: string;
  diffType: DiffType;
  workspaceFeature?: string;
  onClose: () => void;
  onAttachToSession?: (sessionName: string) => void;
  viewMode: ViewMode;
  lines: DiffLine[];
  sideBySideLines: SideBySideLine[];
  selectedLine: number;
  unifiedPerFileIndex: (number | undefined)[];
  sideBySidePerFileIndex: (number | undefined)[];
};

function getCommentTarget(params: Params) {
  const {viewMode, lines, sideBySideLines, selectedLine, unifiedPerFileIndex, sideBySidePerFileIndex} = params;

  if (viewMode === 'unified') {
    const line = lines[selectedLine];
    if (!line || !line.fileName) return null;
    const isFileLevel = line.type === 'header' && line.headerType === 'file';
    return {
      fileName: line.fileName,
      lineText: isFileLevel ? line.fileName : line.text,
      perFileIndex: unifiedPerFileIndex[selectedLine],
      isFileLevel,
      isRemoved: line.type === 'removed',
      originalLineIndex: line.oldLineIndex,
      isHunkHeader: line.type === 'header' && line.headerType === 'hunk',
    };
  }

  const line = sideBySideLines[selectedLine];
  const fileName = line?.right?.fileName || line?.left?.fileName;
  if (!line || !fileName) return null;
  const isFileLevel = line.left?.type === 'header' && line.left.headerType === 'file';
  const isRemoved = line.left?.type === 'removed';
  const rawText = line.right?.text || line.left?.text || '';
  return {
    fileName,
    lineText: isFileLevel ? fileName : (isRemoved ? (line.left?.text || rawText) : rawText),
    perFileIndex: sideBySidePerFileIndex[selectedLine],
    isFileLevel,
    isRemoved,
    originalLineIndex: line.left?.oldLineIndex,
    isHunkHeader: (line.left?.type === 'header' && line.left.headerType === 'hunk')
      || (line.right?.type === 'header' && line.right.headerType === 'hunk'),
  };
}

function getLastTwoCommentLines(comments: any[]): string[] {
  const describe = (c: any): string | null => {
    if (c.lineIndex !== undefined) return `  Line ${c.lineIndex + 1}: ${c.commentText}`;
    if (c.isRemoved && c.originalLineIndex !== undefined) return `  Removed line ${c.originalLineIndex}: ${c.commentText}`;
    return null;
  };
  const out: string[] = [];
  if (comments.length > 0) {
    const last = comments[comments.length - 1];
    const d = describe(last);
    if (d) out.push(d);
    out.push(`File: ${last.fileName}`);
  }
  if (comments.length > 1) {
    const d = describe(comments[comments.length - 2]);
    if (d) out.push(d);
  }
  return out.filter(line => line.trim().length > 0);
}

export function useDiffComments(params: Params) {
  const {worktreePath, diffType, workspaceFeature, onClose, onAttachToSession} = params;
  const commentStore = useMemo(() => commentStoreManager.getStore(worktreePath), [worktreePath]);
  const [tmuxService] = useState(() => new TmuxService());
  const [baseCommitHash, setBaseCommitHash] = useState<string>('');
  const [showCommentDialog, setShowCommentDialog] = useState(false);
  const [showAllComments, setShowAllComments] = useState(true);
  const [showSessionWaitingDialog, setShowSessionWaitingDialog] = useState(false);
  const [sessionWaitingInfo, setSessionWaitingInfo] = useState<{sessionName: string}>({sessionName: ''});
  const [showUnsubmittedCommentsDialog, setShowUnsubmittedCommentsDialog] = useState(false);

  useEffect(() => {
    (async () => {
      let computed = '';
      try {
        if (diffType === 'uncommitted') {
          computed = (await runCommandAsync(['git', '-C', worktreePath, 'rev-parse', 'HEAD']) || '').trim();
        } else {
          let ref = 'HEAD~1';
          const base = findBaseBranch(worktreePath, BASE_BRANCH_CANDIDATES);
          if (base) {
            const mb = await runCommandAsync(['git', '-C', worktreePath, 'merge-base', 'HEAD', base]);
            if (mb) ref = mb.trim();
          }
          computed = (await runCommandAsync(['git', '-C', worktreePath, 'rev-parse', ref]) || '').trim();
        }
      } catch {}
      setBaseCommitHash(computed);
      commentStore.baseCommitHash = computed || undefined;
    })();
  }, [worktreePath, diffType, commentStore]);

  const verifyCommentsReceived = async (sessionName: string, comments: any[]): Promise<boolean> => {
    const paneContent = await tmuxService.capturePane(sessionName);
    if (!paneContent || paneContent.trim().length === 0) return false;
    const lastTwoLines = getLastTwoCommentLines(comments);
    if (lastTwoLines.length === 0) return false;
    return lastTwoLines.some(line => paneContent.includes(line.trim()));
  };

  const sendCommentsToTmux = async () => {
    const comments = commentStore.getAllComments();
    if (comments.length === 0) return;

    try {
      const pathParts = worktreePath.split('/');
      const feature = pathParts[pathParts.length - 1];
      const projectWithBranches = pathParts[pathParts.length - 2];
      const project = projectWithBranches.replace(/-branches$/, '');
      const opts = {workspaceFeature, project, baseCommitHash: commentStore.baseCommitHash || baseCommitHash};

      const sessionName = workspaceFeature
        ? tmuxService.sessionName('workspace', workspaceFeature)
        : tmuxService.sessionName(project, feature);

      const sessions = await tmuxService.listSessions();
      const sessionExists = sessions.includes(sessionName);

      if (sessionExists) {
        const {status} = await tmuxService.getAIStatus(sessionName);

        if (status === 'waiting') {
          setSessionWaitingInfo({sessionName});
          setShowSessionWaitingDialog(true);
          return;
        }

        if (status === 'not_running') {
          tmuxService.sendText(sessionName, `claude ${JSON.stringify(formatCommentsAsPrompt(comments, opts))}`, {executeCommand: true});
        } else {
          tmuxService.sendMultilineText(sessionName, formatCommentsAsLines(comments, opts), {endWithAltEnter: true});
          runCommand(['sleep', '0.5']);
          if (!(await verifyCommentsReceived(sessionName, comments))) {
            setSessionWaitingInfo({sessionName});
            setShowSessionWaitingDialog(true);
            return;
          }
        }
      } else {
        tmuxService.createSession(sessionName, worktreePath);
        const hasClaude = runCommand(['bash', '-lc', 'command -v claude || true']).trim();
        if (hasClaude) {
          tmuxService.sendText(sessionName, `claude ${JSON.stringify(formatCommentsAsPrompt(comments, opts))}`, {executeCommand: true});
        }
      }

      commentStore.clear();
      onClose();
      if (onAttachToSession) onAttachToSession(sessionName);
    } catch (error) {
      console.error('Failed to send comments to tmux:', error);
    }
  };

  const handleCommentSave = (commentText: string) => {
    const target = getCommentTarget(params);
    // Preserve original guard: in side-by-side, skip save when there is no line text at all.
    const skipEmpty = params.viewMode === 'sidebyside' && !target?.lineText;
    if (target && !skipEmpty) {
      if (target.perFileIndex !== undefined) {
        commentStore.addComment(target.perFileIndex, target.fileName, target.lineText, commentText, false);
      } else if (target.isRemoved) {
        commentStore.addComment(undefined, target.fileName, target.lineText, commentText, false, {originalLineIndex: target.originalLineIndex, isRemoved: true});
      } else {
        commentStore.addComment(undefined, target.fileName, target.lineText, commentText, target.isFileLevel);
      }
    }
    setShowCommentDialog(false);
  };

  const deleteCurrentComment = () => {
    const target = getCommentTarget(params);
    if (target && target.perFileIndex !== undefined) {
      commentStore.removeComment(target.perFileIndex, target.fileName);
    }
  };

  const tryOpenCommentDialog = () => {
    const target = getCommentTarget(params);
    if (target && !target.isHunkHeader) setShowCommentDialog(true);
  };

  const requestClose = () => {
    if (commentStore.count > 0) {
      setShowUnsubmittedCommentsDialog(true);
      return;
    }
    onClose();
  };

  return {
    commentStore,
    baseCommitHash,
    showCommentDialog,
    showAllComments,
    toggleShowAllComments: () => setShowAllComments(prev => !prev),
    showSessionWaitingDialog,
    sessionWaitingInfo,
    showUnsubmittedCommentsDialog,
    anyDialogOpen: showCommentDialog || showSessionWaitingDialog || showUnsubmittedCommentsDialog,
    tryOpenCommentDialog,
    deleteCurrentComment,
    sendCommentsToTmux,
    handleCommentSave,
    handleCommentCancel: () => setShowCommentDialog(false),
    handleSessionWaitingGoToSession: () => {
      setShowSessionWaitingDialog(false);
      onClose();
      if (onAttachToSession) onAttachToSession(sessionWaitingInfo.sessionName);
    },
    handleSessionWaitingCancel: () => setShowSessionWaitingDialog(false),
    handleUnsubmittedCommentsSubmit: () => {
      setShowUnsubmittedCommentsDialog(false);
      sendCommentsToTmux().catch(error => console.error('Failed to send comments:', error));
    },
    handleUnsubmittedCommentsExitWithoutSubmitting: () => {
      setShowUnsubmittedCommentsDialog(false);
      onClose();
    },
    handleUnsubmittedCommentsCancel: () => setShowUnsubmittedCommentsDialog(false),
    requestClose,
  };
}
