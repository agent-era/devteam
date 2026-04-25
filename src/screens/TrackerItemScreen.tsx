import React from 'react';
import fs from 'node:fs';
import path from 'node:path';
import {Box, Text, useInput} from 'ink';
import {TrackerItem, TrackerService, StagesConfig, ExitCriterionResult, STAGE_LABELS, type TrackerStage} from '../services/TrackerService.js';
import {useKeyboardShortcuts} from '../hooks/useKeyboardShortcuts.js';
import {useTerminalDimensions} from '../hooks/useTerminalDimensions.js';
import {useMarkdownTheme} from '../hooks/useMarkdownTheme.js';
import MarkdownView from '../components/views/markdown/MarkdownView.js';
import {renderMarkdown} from '../shared/utils/markdown/render.js';
import {cycleMarkdownTheme} from '../shared/utils/markdown/themes.js';
import type {MarkdownTheme} from '../shared/utils/markdown/themes.js';
import {stringDisplayWidth, truncateDisplay} from '../shared/utils/formatting.js';
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

interface StageMeta {
  stage: Exclude<TrackerStage, 'archive' | 'backlog'>;
  label: string;
  fileName: string;
}

const STAGE_TABS: StageMeta[] = [
  {stage: 'discovery', label: 'Discovery', fileName: 'notes.md'},
  {stage: 'requirements', label: 'Requirements', fileName: 'requirements.md'},
  {stage: 'implement', label: 'Implement', fileName: 'implementation.md'},
];

interface Tab {
  key: string;
  label: string;
  filePath: string;
  body: string;
  exists: boolean;
  enabled: boolean;
  isExtra: boolean;
  /** Stage this tab represents (for canonical stage tabs only). */
  stage?: TrackerStage;
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

function readBody(filePath: string): string {
  try { return fs.readFileSync(filePath, 'utf8'); } catch { return ''; }
}

function listExtraMdFiles(itemDir: string): string[] {
  try {
    const entries = fs.readdirSync(itemDir);
    const canonical = new Set(['requirements.md', 'notes.md', 'implementation.md']);
    return entries
      .filter(f => /\.(md|markdown)$/i.test(f) && !canonical.has(f.toLowerCase()))
      .sort();
  } catch {
    return [];
  }
}

function buildTabs(item: TrackerItem): Tab[] {
  const tabs: Tab[] = [];
  let firstGapMarked = false;

  for (const meta of STAGE_TABS) {
    const filePath = meta.fileName === 'requirements.md'
      ? item.requirementsPath
      : meta.fileName === 'notes.md'
      ? item.notesPath
      : item.implementationPath;
    const exists = fs.existsSync(filePath);
    const body = exists ? readBody(filePath) : '';

    let enabled: boolean;
    if (exists) {
      enabled = true;
    } else if (!firstGapMarked) {
      enabled = true;
      firstGapMarked = true;
    } else {
      enabled = false;
    }

    tabs.push({
      key: meta.stage,
      label: meta.label,
      filePath,
      body,
      exists,
      enabled,
      isExtra: false,
      stage: meta.stage,
    });
  }

  for (const fname of listExtraMdFiles(item.itemDir)) {
    const filePath = path.join(item.itemDir, fname);
    const body = readBody(filePath);
    tabs.push({
      key: `extra:${fname}`,
      label: fname,
      filePath,
      body,
      exists: true,
      enabled: true,
      isExtra: true,
    });
  }

  return tabs;
}

function buildPendingMessage(stageLabel: string, theme: MarkdownTheme): MdRow[] {
  return [
    {spans: [{text: ''}]},
    {spans: [{text: `The agent hasn't done the ${stageLabel} stage yet.`, color: theme.tabPendingColor, bold: true}]},
    {spans: [{text: ''}]},
    {spans: [{text: 'Press [enter] to advance the item and launch a session for this stage.', dim: true}]},
    {spans: [{text: 'Press [a] to just attach to the existing session.', dim: true}]},
  ];
}

function buildExtraHeader(label: string, width: number, theme: MarkdownTheme): MdRow[] {
  const headerText = ` ${label} `;
  const lead = '── ';
  const used = stringDisplayWidth(lead) + stringDisplayWidth(headerText);
  const trailing = Math.max(2, width - used);
  return [
    {spans: [
      {text: lead, color: theme.tabExtraColor},
      {text: headerText, color: theme.tabExtraColor, italic: true, bold: true},
      {text: '─'.repeat(trailing), color: theme.tabExtraColor, italic: true},
    ]},
    {spans: [{text: ''}]},
  ];
}

function buildTabContent(tab: Tab, width: number, theme: MarkdownTheme): MdRow[] {
  if (!tab.exists && tab.enabled) {
    return buildPendingMessage(tab.label, theme);
  }
  if (!tab.body.trim()) {
    return [{spans: [{text: '(empty file)', dim: true}]}];
  }
  if (tab.isExtra) {
    return [...buildExtraHeader(tab.label, width, theme), ...renderMarkdown(tab.body, width, theme)];
  }
  return renderMarkdown(tab.body, width, theme);
}

function buildStatusSummary(
  item: TrackerItem,
  exitResults: ExitCriterionResult[]
): {label: string; tone: 'ok' | 'pending' | 'archive'} {
  if (item.stage === 'archive') return {label: 'Archived', tone: 'archive'};
  const stageLabel = STAGE_LABELS[item.stage];
  if (exitResults.length === 0) return {label: stageLabel, tone: 'ok'};
  const unmet = exitResults.filter(r => !r.met).length;
  if (unmet === 0) return {label: `${stageLabel}  •  ✓ Ready to advance`, tone: 'ok'};
  return {label: `${stageLabel}  •  ✗ ${unmet} of ${exitResults.length} criteria pending`, tone: 'pending'};
}

interface TabStripProps {
  tabs: Tab[];
  activeIndex: number;
  theme: MarkdownTheme;
}

/**
 * Tab strip styled to match the stages-configuration screen
 * (`TrackerStagesScreen`): each tab is a padded label, the active one is
 * shown with `inverse` + `bold` + green colour, with a trailing `← →` hint
 * since left/right always navigates tabs in this view.
 */
function TabStrip({tabs, activeIndex, theme}: TabStripProps) {
  return (
    <Box flexDirection="row">
      {tabs.map((t, i) => {
        const isActive = i === activeIndex;
        const marker = !t.exists ? '○ ' : t.isExtra ? '• ' : '';
        const label = ` ${marker}${t.label} `;
        const color = isActive
          ? 'green'
          : !t.enabled
          ? undefined
          : t.isExtra
          ? theme.tabExtraColor
          : !t.exists
          ? theme.tabPendingColor
          : undefined;
        return (
          <Box key={t.key} marginRight={2}>
            <Text
              bold={isActive}
              inverse={isActive}
              italic={t.isExtra || undefined}
              dimColor={!t.enabled || undefined}
              color={color}
            >
              {label}
            </Text>
          </Box>
        );
      })}
      <Text dimColor> ← →</Text>
    </Box>
  );
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

  const theme = useMarkdownTheme();
  const width = Math.max(20, termCols - 2);

  const tabs = React.useMemo(() => buildTabs(item), [item]);

  const initialTabIndex = React.useMemo(() => {
    const currentStage = item.stage;
    const byStage = tabs.findIndex(t => t.stage === currentStage);
    if (byStage >= 0 && tabs[byStage].enabled) return byStage;
    const firstEnabled = tabs.findIndex(t => t.enabled);
    return firstEnabled >= 0 ? firstEnabled : 0;
  }, [tabs, item.stage]);

  const [activeTab, setActiveTab] = React.useState(initialTabIndex);
  const [scrollByTab, setScrollByTab] = React.useState<number[]>(() => tabs.map(() => 0));

  React.useEffect(() => { setActiveTab(initialTabIndex); }, [initialTabIndex]);
  React.useEffect(() => { setScrollByTab(tabs.map(() => 0)); }, [tabs.length]);

  const tab = tabs[activeTab];
  const tabContent = React.useMemo(
    () => tab ? buildTabContent(tab, width, theme) : [],
    [tab, width, theme]
  );

  const status = React.useMemo(() => buildStatusSummary(item, exitResults), [item, exitResults]);

  // Fixed rows: title(1) + status(1) + tab strip(1) + viewport gap(1) + footer(1) + outer padding(1) = 6
  const fixedRows = 6;
  const viewportHeight = Math.max(3, termRows - fixedRows);
  const maxScroll = Math.max(0, tabContent.length - viewportHeight);
  const scrollTop = Math.min(scrollByTab[activeTab] ?? 0, maxScroll);

  const setActiveScroll = React.useCallback((updater: (n: number) => number) => {
    setScrollByTab(prev => {
      const next = prev.slice();
      next[activeTab] = Math.max(0, Math.min(maxScroll, updater(prev[activeTab] ?? 0)));
      return next;
    });
  }, [activeTab, maxScroll]);

  const moveTab = React.useCallback((delta: number) => {
    setActiveTab(prev => {
      let i = prev;
      const len = tabs.length;
      for (let step = 0; step < len; step++) {
        i = (i + delta + len) % len;
        if (tabs[i]?.enabled) return i;
      }
      return prev;
    });
  }, [tabs]);

  const stageActionAction = actions.find(a => a.id === 'stage-action');
  const attachAction = actions.find(a => a.id === 'attach-session');

  const handlePrimary = React.useCallback(() => {
    // On a "pending" tab — or whenever we have a stage-advance action — pressing
    // enter triggers it. Otherwise fall back to attach.
    if (tab && !tab.exists && stageActionAction) { onStageAction(); return; }
    if (stageActionAction) { onStageAction(); return; }
    if (attachAction) { onAttachSession(); return; }
  }, [tab, stageActionAction, attachAction, onStageAction, onAttachSession]);

  useInput((input, key) => {
    if (key.leftArrow) moveTab(-1);
    else if (key.rightArrow) moveTab(1);
    else if (key.upArrow) setActiveScroll(n => n - 1);
    else if (key.downArrow) setActiveScroll(n => n + 1);
    else if (key.pageUp) setActiveScroll(n => n - viewportHeight);
    else if (key.pageDown) setActiveScroll(n => n + viewportHeight);
    else if (input === 'g') setActiveScroll(() => 0);
    else if (input === 'G') setActiveScroll(() => maxScroll);
    else if (input === 't') cycleMarkdownTheme();
    else if (input === 'a') { if (attachAction) onAttachSession(); }
  });

  useKeyboardShortcuts({
    onSelect: handlePrimary,
    onQuit: onBack,
  });

  const scrollHint = maxScroll > 0
    ? `  ${Math.min(scrollTop + viewportHeight, tabContent.length)}/${tabContent.length}`
    : '';

  const footerKeys = [
    '[←/→] tabs',
    '[↑↓ PgUp/PgDn g/G] scroll',
    `[t] theme: ${theme.name}`,
    stageActionAction ? `[enter] ${stageActionAction.label}${stageActionAction.warn ? ' (!)' : ''}` : null,
    attachAction ? '[a] attach' : null,
    '[esc]/[q] back',
  ].filter(Boolean).join('  ');

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
        <TabStrip tabs={tabs} activeIndex={activeTab} theme={theme} />
      </Box>

      <Box flexDirection="column" height={viewportHeight}>
        <MarkdownView rows={tabContent} width={width} height={viewportHeight} scrollTop={scrollTop} />
      </Box>

      <Box>
        <Text color="magenta" wrap="truncate">{truncateDisplay(footerKeys, width)}</Text>
      </Box>
    </Box>
  );
}
