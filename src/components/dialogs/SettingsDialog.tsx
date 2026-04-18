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
  onDiscardResult,
  onCancel,
}: Props) {
  // TextInput from @inkjs/ui is uncontrolled; bump key to remount-and-clear after submit.
  const [inputKey, setInputKey] = useState(0);
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
    if (key.escape) { onCancel(); return; }
    if (!inPreview || !result) return;
    if (result.success && result.content) {
      if (input === 'a' || input === 'A') onApply(result.content);
      else if (input === 'd' || input === 'D') onDiscardResult();
    } else if (input === 'd' || input === 'D' || key.return) {
      onDiscardResult();
    }
  });

  const handleSubmit = (value: string) => {
    if (loading) return;
    const trimmed = value.trim();
    if (trimmed.length === 0) onGenerate();
    else onEdit(trimmed);
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

      {!inPreview ? (
        <Box marginTop={1} flexDirection="column">
          <Text>Ask Claude to update the config (empty prompt = regenerate from scratch):</Text>
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
          {inPreview
            ? (result?.success ? '[a] apply  [d] discard  [esc] back' : '[d] dismiss  [esc] back')
            : loading
              ? '[esc] back (AI keeps running)'
              : '[enter] send prompt (empty = regenerate)  [esc] back'}
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

function DiffView({leaves, current, proposed, layout}: {leaves: Leaf[]; current: unknown; proposed: unknown; layout: Layout}) {
  const changed: Array<{leaf: Leaf; before: unknown; after: unknown}> = [];
  for (const leaf of leaves) {
    const before = resolveValue(current, leaf.dotPath);
    const after = resolveValue(proposed, leaf.dotPath);
    if (!sameValue(before, after)) changed.push({leaf, before, after});
  }
  const unchangedCount = leaves.length - changed.length;

  if (changed.length === 0) {
    return <Text color="gray">(No changes — proposed config matches the current one.)</Text>;
  }

  return (
    <Box flexDirection="column">
      <Text bold color="green">Proposed changes:</Text>
      {changed.map(({leaf, before, after}) => (
        <Box key={leaf.dotPath} flexDirection="column" marginTop={1}>
          <Box width={layout.inner}>
            <Box width={KEY_WIDTH}><Text color="white">{leaf.displayKey}</Text></Box>
            <Box width={VAL_WIDTH}><Text color="red" wrap="truncate">{formatMissingOr(before)}</Text></Box>
            <Box width={ARROW_WIDTH}><Text color="gray">→</Text></Box>
            <Box width={layout.diffRight}><Text color="green" wrap="truncate">{formatMissingOr(after)}</Text></Box>
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
