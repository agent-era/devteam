import React from 'react';
import {Box, Text, useInput} from 'ink';
import {TrackerItem, TrackerService, StagesConfig, ExitCriterionResult, STAGE_LABELS} from '../services/TrackerService.js';
import {useKeyboardShortcuts} from '../hooks/useKeyboardShortcuts.js';
import {useTerminalDimensions} from '../hooks/useTerminalDimensions.js';

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

interface ContentLine {
  key: string;
  text: string;
  bold?: boolean;
  dimColor?: boolean;
  color?: string;
  indent?: number;
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

function buildContentLines(
  item: TrackerItem,
  stagesConfig: Required<StagesConfig>,
  exitResults: ExitCriterionResult[],
  preview: string[]
): ContentLine[] {
  const lines: ContentLine[] = [];
  const stageConf = item.stage !== 'archive' ? stagesConfig[item.stage] : null;

  if (stageConf) {
    lines.push({key: 'desc', text: stageConf.description, dimColor: true});
    lines.push({key: 'gap0', text: ''});
  }

  // Exit criteria — prominent
  if (exitResults.length > 0) {
    const allMet = exitResults.every(r => r.met);
    lines.push({key: 'ec-hdr', text: allMet ? '✓ Ready to advance' : '! Exit criteria to advance:', bold: true, color: allMet ? 'green' : 'yellow'});
    exitResults.forEach((r, i) => {
      lines.push({
        key: `ec-${i}`,
        text: `${r.met ? '✓' : '✗'} ${r.criterion.description}`,
        bold: !r.met,
        color: r.met ? 'green' : 'red',
        indent: 2,
      });
    });
    lines.push({key: 'ec-gap', text: ''});
  }

  // Non-enforced checklist
  if (stageConf && stageConf.checklist.length > 0) {
    lines.push({key: 'chk-hdr', text: 'Checklist (guidance)', bold: true});
    stageConf.checklist.forEach((step, i) => {
      lines.push({key: `chk-${i}`, text: `○ ${step}`, dimColor: true, indent: 2});
    });
    lines.push({key: 'chk-gap', text: ''});
  }

  lines.push({key: 'req-hdr', text: 'Requirements Preview', bold: true});
  if (preview.length > 0) {
    preview.forEach((line, i) => {
      lines.push({key: `req-${i}`, text: line || ' ', dimColor: true});
    });
  } else {
    lines.push({key: 'req-none', text: '(stub — no requirements yet)', dimColor: true});
  }
  lines.push({key: 'req-gap', text: ''});

  lines.push({key: 'sig-hdr', text: 'Signals', bold: true});
  lines.push({key: 'sig-wt', text: item.worktreeExists ? `worktree: ${item.worktreePath}` : 'worktree: none', dimColor: true});
  lines.push({key: 'sig-impl', text: item.hasImplementationNotes ? 'implementation notes: yes' : 'implementation notes: none', dimColor: true});
  lines.push({key: 'sig-notes', text: item.hasNotes ? 'notes: yes' : 'notes: none', dimColor: true});

  return lines;
}

export default function TrackerItemScreen({
  item,
  onBack,
  onAttachSession,
  onStageAction,
}: TrackerItemScreenProps) {
  const {rows} = useTerminalDimensions();
  const service = React.useMemo(() => new TrackerService(), []);
  const stagesConfig = React.useMemo(() => service.loadStagesConfig(item.projectPath), [item.projectPath, service]);
  const preview = React.useMemo(() => service.readRequirementsPreview(item), [item, service]);

  const stageConf = item.stage !== 'archive' ? stagesConfig[item.stage] : null;
  const exitResults = React.useMemo(
    () => stageConf ? service.evaluateExitCriteria(item, stageConf.exitCriteria) : [],
    [item, stageConf, service]
  );

  const actions = React.useMemo(
    () => buildActions(item, stagesConfig, service, exitResults),
    [item, stagesConfig, service, exitResults]
  );
  const contentLines = React.useMemo(
    () => buildContentLines(item, stagesConfig, exitResults, preview),
    [item, stagesConfig, exitResults, preview]
  );

  const [selectedAction, setSelectedAction] = React.useState(0);
  const [scrollTop, setScrollTop] = React.useState(0);

  // Fixed rows: header(3) + actions row(1) + gap(1) + footer(1)
  const fixedRows = 6;
  const contentViewHeight = Math.max(3, rows - fixedRows);
  const maxScroll = Math.max(0, contentLines.length - contentViewHeight);
  const visibleLines = contentLines.slice(scrollTop, scrollTop + contentViewHeight);

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
    if (key.upArrow) setScrollTop(prev => Math.max(0, prev - 1));
    else if (key.downArrow) setScrollTop(prev => Math.min(maxScroll, prev + 1));
  });

  useKeyboardShortcuts({
    onMoveHorizontal: (delta) => setSelectedAction(prev => Math.max(0, Math.min(prev + delta, actions.length - 1))),
    onSelect: handleSelect,
    onQuit: onBack,
  });

  const scrollIndicator = maxScroll > 0 ? ` (↑↓ scroll)` : '';
  const stageLabel = item.stage !== 'archive' ? STAGE_LABELS[item.stage] : item.stage;

  return (
    <Box flexDirection="column" flexGrow={1} paddingX={1}>
      {/* Fixed header */}
      <Text bold>{item.title}</Text>
      <Text dimColor>{`${item.project}  •  ${stageLabel}`}{scrollIndicator}</Text>

      {/* Scrollable content */}
      <Box flexDirection="column" height={contentViewHeight} marginTop={1}>
        {visibleLines.map(line => (
          <Text
            key={line.key}
            bold={line.bold}
            dimColor={line.dimColor}
            color={line.color}
          >
            {line.indent ? ' '.repeat(line.indent) : ''}{line.text}
          </Text>
        ))}
      </Box>

      {/* Fixed actions */}
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

      <Box marginTop={1}>
        <Text color="magenta">[h]/[l] select action  [↑]/[↓] scroll  [enter] run  [esc]/[q] back</Text>
      </Box>
    </Box>
  );
}
