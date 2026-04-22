import React, {useState, useEffect, useMemo} from 'react';
import {Box, Text, useInput} from 'ink';
import {TextInput} from '@inkjs/ui';
import {useInputFocus} from '../../contexts/InputFocusContext.js';
import {useTerminalDimensions} from '../../hooks/useTerminalDimensions.js';
import {CONFIG_SCHEMA, type SchemaNode} from '../../constants.js';
import type {SettingsAIResult} from '../../contexts/UIContext.js';

type Props = {
  project: string;
  configPath: string;
  currentContent: string | null;
  aiLoadingProject: string | null;
  pendingResult: SettingsAIResult;
  onGenerate: () => void;
  onEdit: (userPrompt: string) => void;
  onApply: (content: string) => void;
  onReapplyFiles: () => {count: number};
  onDiscardResult: () => void;
  onCancel: () => void;
};

const FOCUS_ID = 'settings-dialog';
const MAX_DIALOG_WIDTH = 110;
const MIN_DIALOG_WIDTH = 60;
const KEY_WIDTH = 22;
const VAL_WIDTH = 28;
const ARROW_WIDTH = 3;
const MISSING = Symbol('missing');

// Compute responsive widths that fit within the current terminal.
function computeLayout(termCols: number) {
  const dialog = Math.max(MIN_DIALOG_WIDTH, Math.min(MAX_DIALOG_WIDTH, termCols - 2));
  const inner = dialog - 4; // round border (2) + paddingX (1*2)
  const diffRight = Math.max(10, inner - KEY_WIDTH - VAL_WIDTH - ARROW_WIDTH);
  return {dialog, inner, diffRight};
}

type Leaf = {dotPath: string; displayKey: string; node: SchemaNode};

export default function SettingsDialog({
  project,
  configPath,
  currentContent,
  aiLoadingProject,
  pendingResult,
  onGenerate,
  onEdit,
  onApply,
  onReapplyFiles,
  onDiscardResult,
  onCancel,
}: Props) {
  // TextInput from @inkjs/ui is uncontrolled; bump key to remount-and-clear after submit.
  const [inputKey, setInputKey] = useState(0);
  const [showReapplyPrompt, setShowReapplyPrompt] = useState(false);
  const [showRegeneratePrompt, setShowRegeneratePrompt] = useState(false);
  const [reapplyStatus, setReapplyStatus] = useState<string | null>(null);
  const {requestFocus, releaseFocus} = useInputFocus();
  const {columns} = useTerminalDimensions();
  const layout = useMemo(() => computeLayout(columns), [columns]);

  const loading = aiLoadingProject === project;
  const result = pendingResult && pendingResult.project === project ? pendingResult : null;
  const inPreview = result !== null;

  const leaves = useMemo(() => flattenSchema(CONFIG_SCHEMA), []);
  const currentParsed = useMemo(() => safeParse(currentContent), [currentContent]);
  const proposedParsed = useMemo(
    () => result?.content ? safeParse(result.content) : null,
    [result]
  );

  useEffect(() => {
    requestFocus(FOCUS_ID);
    return () => releaseFocus(FOCUS_ID);
  }, [requestFocus, releaseFocus]);

  useInput((input, key) => {
    if (showReapplyPrompt) {
      if (input === 'y' || input === 'Y') {
        const {count} = onReapplyFiles();
        setReapplyStatus(`Re-applied files to ${count} worktree${count === 1 ? '' : 's'}`);
      }
      setShowReapplyPrompt(false);
      return;
    }
    if (showRegeneratePrompt) {
      if (input === 'y' || input === 'Y') onGenerate();
      setShowRegeneratePrompt(false);
      return;
    }
    if (key.escape) { onCancel(); return; }
    if (!inPreview || !result) {
      // Settings dialog without a pending AI proposal — allow triggering regenerate.
      if (!loading && (input === 'R' || input === 'r')) setShowRegeneratePrompt(true);
      return;
    }
    if (result.success && result.content) {
      if (input === 'a' || input === 'A') {
        const worktreeSetupChanged = !sameValue(
          resolveValue(currentParsed, 'worktreeSetup'),
          resolveValue(proposedParsed, 'worktreeSetup')
        );
        onApply(result.content);
        if (worktreeSetupChanged) setShowReapplyPrompt(true);
      } else if (input === 'd' || input === 'D') {
        onDiscardResult();
      }
    } else if (input === 'd' || input === 'D' || key.return) {
      onDiscardResult();
    }
  });

  const handleSubmit = (value: string) => {
    if (loading) return;
    const trimmed = value.trim();
    if (trimmed.length === 0) return;
    onEdit(trimmed);
    setInputKey((k) => k + 1);
  };

  return (
    <Box flexDirection="column" borderStyle="round" borderColor="blue" paddingX={1} paddingY={1} width={layout.dialog}>
      <Text bold color="cyan">Project Settings: {project}</Text>
      <Text color="gray">{configPath}</Text>

      <Box marginTop={1} flexDirection="column">
        {inPreview && result?.success && proposedParsed ? (
          <DiffView leaves={leaves} current={currentParsed} proposed={proposedParsed} layout={layout} />
        ) : (
          <CompactTable leaves={leaves} value={currentParsed} layout={layout} />
        )}
      </Box>

      {loading ? (
        <Box marginTop={1}>
          <Text color="yellow">Claude is working in the background... (press [esc] to leave, come back anytime)</Text>
        </Box>
      ) : null}

      {inPreview && result && !result.success ? (
        <Box marginTop={1} flexDirection="column" borderStyle="single" borderColor="red" paddingX={1}>
          <Text bold color="red">AI error</Text>
          <Text color="red">{result.error || 'Unknown error'}</Text>
        </Box>
      ) : null}

      {reapplyStatus ? (
        <Box marginTop={1}>
          <Text color="green">{reapplyStatus}</Text>
        </Box>
      ) : null}

      {showReapplyPrompt ? (
        <Box marginTop={1} flexDirection="column" borderStyle="single" borderColor="yellow" paddingX={1}>
          <Text color="yellow">File setup changed. Re-apply files to existing worktrees?</Text>
        </Box>
      ) : null}

      {showRegeneratePrompt ? (
        <Box marginTop={1} flexDirection="column" borderStyle="single" borderColor="red" paddingX={1}>
          <Text bold color="red">Discard current config and regenerate from scratch?</Text>
          <Text color="gray">This asks Claude to write a fresh config without seeing your current one — any custom flags, commands, or env vars may be replaced by schema defaults. Review the diff before applying.</Text>
        </Box>
      ) : null}

      {!inPreview && !showReapplyPrompt && !showRegeneratePrompt ? (
        <Box marginTop={1} flexDirection="column">
          <Text>Ask Claude to update the config:</Text>
          <Box borderStyle="single" borderColor="gray" paddingX={1}>
            <TextInput
              key={inputKey}
              defaultValue=""
              placeholder={loading ? 'AI busy — press [esc] to come back later' : 'e.g. enable --dangerously-skip-permissions for claude'}
              onSubmit={handleSubmit}
            />
          </Box>
        </Box>
      ) : null}

      <Box marginTop={1}>
        <Text color="magenta">
          {showReapplyPrompt
            ? '[y] re-apply files  [any other key] skip'
            : showRegeneratePrompt
              ? '[y] regenerate from scratch  [any other key] cancel'
              : inPreview
                ? (result?.success ? '[a] apply  [d] discard  [esc] back' : '[d] dismiss  [esc] back')
                : loading
                  ? '[esc] back (AI keeps running)'
                  : '[enter] send prompt  [R] regenerate from scratch  [esc] back'}
        </Text>
      </Box>
    </Box>
  );
}

type Layout = ReturnType<typeof computeLayout>;

function CompactTable({leaves, value, layout}: {leaves: Leaf[]; value: unknown; layout: Layout}) {
  return (
    <Box flexDirection="column">
      {leaves.map(({dotPath, displayKey, node}) => {
        const resolved = resolveValue(value, dotPath);
        const present = resolved !== MISSING;
        const valueText = present ? formatValue(resolved) : '(missing)';
        return (
          <Box key={dotPath} flexDirection="column" marginBottom={1}>
            <Box width={layout.inner}>
              <Box width={KEY_WIDTH}><Text color="white">{displayKey}</Text></Box>
              <Box width={layout.inner - KEY_WIDTH}>
                <Text color={present ? 'cyan' : 'gray'} wrap="truncate">{valueText}</Text>
              </Box>
            </Box>
            <Box width={layout.inner}>
              <Text color="gray" wrap="truncate">{'  '}{node.description}</Text>
            </Box>
          </Box>
        );
      })}
    </Box>
  );
}

export type ChangeKind = 'added' | 'changed' | 'removed';
type Change = {leaf: Leaf; before: unknown; after: unknown; kind: ChangeKind};

export function classifyChange(before: unknown, after: unknown): ChangeKind | null {
  const beforeMissing = before === MISSING;
  const afterMissing = after === MISSING;
  if (beforeMissing && afterMissing) return null;
  if (beforeMissing) return 'added';
  if (afterMissing) return 'removed';
  return sameValue(before, after) ? null : 'changed';
}

// Exported for tests.
export const DIFF_MISSING = MISSING;

function DiffView({leaves, current, proposed, layout}: {leaves: Leaf[]; current: unknown; proposed: unknown; layout: Layout}) {
  const changes: Change[] = [];
  for (const leaf of leaves) {
    const before = resolveValue(current, leaf.dotPath);
    const after = resolveValue(proposed, leaf.dotPath);
    const kind = classifyChange(before, after);
    if (kind) changes.push({leaf, before, after, kind});
  }
  const unchangedCount = leaves.length - changes.length;
  const removedCount = changes.filter(c => c.kind === 'removed').length;

  if (changes.length === 0) {
    return <Text color="gray">(No changes — proposed config matches the current one.)</Text>;
  }

  // Put removals first so they stand out; otherwise keep schema order.
  const ordered = [...changes].sort((a, b) => {
    if (a.kind === 'removed' && b.kind !== 'removed') return -1;
    if (a.kind !== 'removed' && b.kind === 'removed') return 1;
    return 0;
  });

  return (
    <Box flexDirection="column">
      <Text bold color="green">Proposed changes:</Text>
      {removedCount > 0 ? (
        <Text bold color="red">
          ⚠ {removedCount} field{removedCount === 1 ? '' : 's'} will be REMOVED — review before applying
        </Text>
      ) : null}
      {ordered.map(({leaf, before, after, kind}) => (
        <Box key={leaf.dotPath} flexDirection="column" marginTop={1}>
          <Box width={layout.inner}>
            <Box width={KEY_WIDTH}>
              <Text color={kind === 'removed' ? 'red' : 'white'}>
                {kindPrefix(kind)}{leaf.displayKey}
              </Text>
            </Box>
            <Box width={VAL_WIDTH}>
              <Text color={kind === 'added' ? 'gray' : 'red'} wrap="truncate">
                {kind === 'added' ? '(not set)' : formatMissingOr(before)}
              </Text>
            </Box>
            <Box width={ARROW_WIDTH}><Text color="gray">→</Text></Box>
            <Box width={layout.diffRight}>
              {kind === 'removed' ? (
                <Text bold color="red" wrap="truncate">REMOVED</Text>
              ) : (
                <Text color="green" wrap="truncate">{formatValue(after)}</Text>
              )}
            </Box>
          </Box>
          <Box width={layout.inner}>
            <Text color="gray" wrap="truncate">{'  '}{leaf.node.description}</Text>
          </Box>
        </Box>
      ))}
      <Box marginTop={1}>
        <Text color="gray">({unchangedCount} other field{unchangedCount === 1 ? '' : 's'} unchanged)</Text>
      </Box>
    </Box>
  );
}

function kindPrefix(kind: ChangeKind): string {
  if (kind === 'added') return '+ ';
  if (kind === 'removed') return '- ';
  return '~ ';
}

// Flatten the schema to leaf fields. Display keys drop the top-level section name so
// labels stay short ("mainCommand", "copyFiles", "claude.flags") and aligned.
function flattenSchema(schema: Record<string, SchemaNode>): Leaf[] {
  const out: Leaf[] = [];
  const walk = (nodes: Record<string, SchemaNode>, pathParts: string[]) => {
    for (const [key, node] of Object.entries(nodes)) {
      const next = [...pathParts, key];
      if (node.children) walk(node.children, next);
      else out.push({dotPath: next.join('.'), displayKey: next.slice(1).join('.') || key, node});
    }
  };
  walk(schema, []);
  return out;
}

function resolveValue(root: unknown, dotPath: string): unknown | typeof MISSING {
  let cur: unknown = root;
  for (const segment of dotPath.split('.')) {
    if (cur === null || typeof cur !== 'object' || !(segment in (cur as object))) return MISSING;
    cur = (cur as Record<string, unknown>)[segment];
  }
  return cur;
}

function formatMissingOr(v: unknown | typeof MISSING): string {
  return v === MISSING ? '(missing)' : formatValue(v);
}

function formatValue(v: unknown): string {
  if (v === undefined) return 'undefined';
  if (v === null) return 'null';
  if (typeof v === 'string') return JSON.stringify(v);
  if (typeof v === 'number' || typeof v === 'boolean') return String(v);
  const s = JSON.stringify(v);
  return s.length > 50 ? s.slice(0, 47) + '...' : s;
}

function sameValue(a: unknown, b: unknown): boolean {
  if (a === MISSING || b === MISSING) return a === b;
  return JSON.stringify(a) === JSON.stringify(b);
}

function safeParse(text: string | null): unknown {
  if (!text) return null;
  try { return JSON.parse(text); } catch { return null; }
}
