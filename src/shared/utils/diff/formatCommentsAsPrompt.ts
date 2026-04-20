export function formatCommentsAsPrompt(
  comments: any[],
  opts?: {workspaceFeature?: string; project?: string; baseCommitHash?: string}
): string {
  let prompt = "Please address the following code review comments:\n\n";
  if (opts?.workspaceFeature && opts?.project) {
    prompt += `Context: In workspace '${opts.workspaceFeature}', target child directory: ./${opts.project}\n\n`;
  }

  const commentsByFile: {[key: string]: typeof comments} = {};
  comments.forEach(comment => {
    if (!commentsByFile[comment.fileName]) {
      commentsByFile[comment.fileName] = [];
    }
    commentsByFile[comment.fileName].push(comment);
  });

  Object.entries(commentsByFile).forEach(([fileName, fileComments]) => {
    const header = opts?.baseCommitHash ? `File: ${fileName}@${opts.baseCommitHash}` : `File: ${fileName}`;
    prompt += `${header}\n`;
    fileComments.forEach(comment => {
      if (comment.lineIndex !== undefined) {
        prompt += `  Line ${comment.lineIndex + 1}: ${comment.lineText}\n`;
      } else if (
        comment.lineText &&
        comment.lineText.trim().length > 0 &&
        !comment.isFileLevel
      ) {
        if (comment.isRemoved && comment.originalLineIndex !== undefined) {
          prompt += `  Removed line ${comment.originalLineIndex}: ${comment.lineText}\n`;
        } else {
          prompt += `  Removed line: ${comment.lineText}\n`;
        }
      }
      prompt += `  Comment: ${comment.commentText}\n`;
    });
    prompt += "\n";
  });

  return prompt;
}
