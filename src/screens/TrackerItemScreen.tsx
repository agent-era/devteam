import React from 'react';
import fs from 'node:fs';
import {Box, Text, useInput} from 'ink';
import {TrackerItem, TrackerService, StagesConfig, ExitCriterionResult, STAGE_LABELS} from '../services/TrackerService.js';
import {useKeyboardShortcuts} from '../hooks/useKeyboardShortcuts.js';
import {useTerminalDimensions} from '../hooks/useTerminalDimensions.js';
import MarkdownView from '../components/views/markdown/MarkdownView.js';
import {renderMarkdown} from '../shared/utils/markdown/render.js';
import {stringDisplayWidth} from '../shared/utils/formatting.js';
import type {MdRow} from '../shared/utils/markdown/types.js';

interface TrackerItemScreenProps {
  item: TrackerItem;
  onBack: () => void;
  onAttachSession: () => void;
  onStageAction: () => void;
}

interface Action {
  id: string;
  label: string;
  warn?: boolean;
}

type DocKey = 'requirements' | 'notes' | 'implementation';

interface DocInfo {
  key: DocKey;
  title: string;
  offset: number;
  length: number;
}

export function buildActions(
  item: TrackerItem,
  stagesConfig: Required<StagesConfig>,
  service: TrackerService,
  exitResults: ExitCriterionResult[]
): Action[] {
  if (item.bucket === 'archive') return [];
  const currentConf = item.stage !== 'archive' ? stagesConfig[item.stage] : null;
  if (!currentConf) return [];

  const actions: Action[] = [];

  actions.push({id: 'attach-session', label: 'Attach session'});

  const nextStage = service.nextStage(item.stage);
  if (nextStage) {
    const allMet = exitResults.every(r => r.met);
    actions.push({id: 'stage-action', label: currentConf.actionLabel, warn: !allMet});
  }

  return actions;
}

function readBody(filePath: string | undefined, present: boolean): string {
  if (!present || !filePath) return '';
  try { return fs.readFileSync(filePath, 'utf8'); } catch { return ''; }
}

function buildDocRows(item: TrackerItem, width: number): {rows: MdRow[]; docs: DocInfo[]} {
  const sources: Array<{key: DocKey; title: string; body: string}> = [];
  if (item.requirementsBody && item.requirementsBody.trim()) {
    sources.push({key: 'requirements', title: 'requirements.md', body: item.requirementsBody});
  }
  const notesBody = readBody(item.notesPath, item.hasNotes).trim();
  if (notesBody) sources.push({key: 'notes', title: 'notes.md', body: notesBody});
  const implBody = readBody(item.implementationPath, item.hasImplementationNotes).trim();
  if (implBody) sources.push({key: 'implementation', title: 'implementation.md', body: implBody});

  const rows: MdRow[] = [];
  const docs: DocInfo[] = [];

  if (sources.length === 0) {
    rows.push({spans: [{text: '(no markdown yet — add requirements.md, notes.md, or implementation.md)', dim: true}]});
    return {rows, docs};
  }

  for (let i = 0; i < sources.length; i++) {
    const src = sources[i];
    if (i > 0) rows.push({spans: [{text: ''}]});
    const offset = rows.length;
    const headerText = ` ${src.title} `;
    const lead = '── ';
    const used = stringDisplayWidth(lead) + stringDisplayWidth(headerText);
    const trailing = Math.max(2, width - used);
    rows.push({spans: [
      {text: lead, color: 'magenta'},
      {text: headerText, color: 'magenta', bold: true},
      {text: '─'.repeat(trailing), color: 'magenta'},
    ]});
    rows.push({spans: [{text: ''}]});
    const start = rows.length;
    rows.push(...renderMarkdown(src.body, width));
    docs.push({key: src.key, title: src.title, offset, length: rows.length - start + 2});
  }

  return {rows, docs};
}

function buildStatusSummary(
  item: TrackerItem,
  exitResults: ExitCriterionResult[]
): {label: string; tone: 'ok' | 'pending' | 'archive'} {
  if (item.stage === 'archive') return {label: 'Archived', tone: 'archive'};
  const stageLabel = STAGE_LABELS[item.stage];
  if (exitResults.length === 0) return {label: `${stageLabel}`, tone: 'ok'};
  const unmet = exitResults.filter(r => !r.met).length;
  if (unmet === 0) return {label: `${stageLabel}  •  ✓ Ready to advance`, tone: 'ok'};
  return {
    label: `${stageLabel}  •  ✗ ${unmet} of ${exitResults.length} criteria pending`,
    tone: 'pending',
  };
}

export default function TrackerItemScreen({
  item,
  onBack,
  onAttachSession,
  onStageAction,
}: TrackerItemScreenProps) {
  const {rows: termRows, columns: termCols} = useTerminalDimensions();
  const service = React.useMemo(() => new TrackerService(), []);
  const stagesConfig = React.useMemo(() => service.loadStagesConfig(item.projectPath), [item.projectPath, service]);

  const stageConf = item.stage !== 'archive' ? stagesConfig[item.stage] : null;
  const exitResults = React.useMemo(
    () => stageConf ? service.evaluateExitCriteria(item, stageConf.exitCriteria) : [],
    [item, stageConf, service]
  );

  const actions = React.useMemo(
    () => buildActions(item, stagesConfig, service, exitResults),
    [item, stagesConfig, service, exitResults]
  );

  const width = Math.max(20, termCols - 2);
  const {rows: docRows, docs} = React.useMemo(() => buildDocRows(item, width), [item, width]);

  const status = React.useMemo(() => buildStatusSummary(item, exitResults), [item, exitResults]);

  // Fixed rows: title(1) + status(1) + viewport gap(1) + actions(1) + footer(1) + outer padding(1) = 6
  const fixedRows = 6;
  const viewportHeight = Math.max(3, termRows - fixedRows);
  const maxScroll = Math.max(0, docRows.length - viewportHeight);

  const [scrollTop, setScrollTop] = React.useState(0);
  const [selectedAction, setSelectedAction] = React.useState(0);

  const clampScroll = (n: number) => Math.max(0, Math.min(maxScroll, n));

  React.useEffect(() => {
    setScrollTop(prev => clampScroll(prev));
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [maxScroll]);

  const jumpToDoc = (key: DocKey) => {
    const d = docs.find(x => x.key === key);
    if (!d) return;
    setScrollTop(clampScroll(d.offset));
  };

  const handleSelect = React.useCallback(() => {
    const action = actions[selectedAction];
    if (!action) return;
    if (action.id === 'attach-session') {
      onAttachSession();
    } else if (action.id === 'stage-action') {
      onStageAction();
    }
  }, [actions, selectedAction, onAttachSession, onStageAction]);

  useInput((input, key) => {
    if (key.upArrow) setScrollTop(prev => clampScroll(prev - 1));
    else if (key.downArrow) setScrollTop(prev => clampScroll(prev + 1));
    else if (key.pageUp) setScrollTop(prev => clampScroll(prev - viewportHeight));
    else if (key.pageDown) setScrollTop(prev => clampScroll(prev + viewportHeight));
    else if (input === 'g') setScrollTop(0);
    else if (input === 'G') setScrollTop(maxScroll);
    else if (input === '1') jumpToDoc('requirements');
    else if (input === '2') jumpToDoc('notes');
    else if (input === '3') jumpToDoc('implementation');
  });

  useKeyboardShortcuts({
    onMoveHorizontal: (delta) => setSelectedAction(prev => Math.max(0, Math.min(prev + delta, actions.length - 1))),
    onSelect: handleSelect,
    onQuit: onBack,
  });

  const scrollHint = maxScroll > 0
    ? `  ${Math.min(scrollTop + viewportHeight, docRows.length)}/${docRows.length}`
    : '';

  const docHints = docs.length > 1
    ? `  ${docs.map((d, i) => `[${i + 1}] ${d.title.replace(/\.md$/, '')}`).join('  ')}`
    : '';

  return (
    <Box flexDirection="column" flexGrow={1} paddingX={1}>
      <Text bold wrap="truncate">{item.title}</Text>
      <Text
        color={status.tone === 'ok' ? 'green' : status.tone === 'pending' ? 'yellow' : 'gray'}
        wrap="truncate"
      >
        {`${item.project}  •  ${status.label}${scrollHint}`}
      </Text>

      <Box marginTop={1}>
        <MarkdownView rows={docRows} width={width} height={viewportHeight} scrollTop={scrollTop} />
      </Box>

      <Box flexDirection="row" marginTop={1}>
        {actions.map((action, index) => (
          <Box key={action.id} marginRight={2}>
            <Text inverse={index === selectedAction} color={action.warn ? 'yellow' : undefined}>
              {action.label}{action.warn ? ' (!)' : ''}
            </Text>
          </Box>
        ))}
        {actions.length === 0 && <Text dimColor>(archived)</Text>}
      </Box>

      <Box>
        <Text color="magenta" wrap="truncate">
          {`[h]/[l] action  [↑↓ PgUp/PgDn g/G] scroll${docHints}  [enter] run  [esc]/[q] back`}
        </Text>
      </Box>
    </Box>
  );
}
