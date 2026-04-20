type FormatOpts = {workspaceFeature?: string; project?: string; baseCommitHash?: string};

export function formatCommentsAsLines(comments: any[], opts?: FormatOpts): string[] {
  const out: string[] = [];
  out.push("Please address the following code review comments:");
  out.push("");
  if (opts?.workspaceFeature && opts?.project) {
    out.push(`Context: In workspace '${opts.workspaceFeature}', target child directory: ./${opts.project}`);
    out.push("");
  }

  const commentsByFile: {[key: string]: typeof comments} = {};
  comments.forEach(comment => {
    if (!commentsByFile[comment.fileName]) commentsByFile[comment.fileName] = [];
    commentsByFile[comment.fileName].push(comment);
  });

  Object.entries(commentsByFile).forEach(([fileName, fileComments]) => {
    const header = opts?.baseCommitHash ? `File: ${fileName}@${opts.baseCommitHash}` : `File: ${fileName}`;
    out.push(header);
    fileComments.forEach(comment => {
      if (comment.lineIndex !== undefined) {
        out.push(`  Line ${comment.lineIndex + 1}: ${comment.lineText}`);
      } else if (
        comment.lineText &&
        comment.lineText.trim().length > 0 &&
        !comment.isFileLevel
      ) {
        if (comment.isRemoved && comment.originalLineIndex !== undefined) {
          out.push(`  Removed line ${comment.originalLineIndex}: ${comment.lineText}`);
        } else {
          out.push(`  Removed line: ${comment.lineText}`);
        }
      }
      out.push(`  Comment: ${comment.commentText}`);
    });
    out.push("");
  });

  return out;
}

export function formatCommentsAsPrompt(comments: any[], opts?: FormatOpts): string {
  return formatCommentsAsLines(comments, opts).join('\n') + '\n';
}
