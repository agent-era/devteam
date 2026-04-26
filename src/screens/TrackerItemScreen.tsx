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

type CanonicalStage = Exclude<TrackerStage, 'archive' | 'backlog'>;

interface StageMeta {
  stage: CanonicalStage;
  label: string;
  /** Canonical .md file for the stage. `null` for stages with no canonical file (e.g. cleanup). */
  fileName: string | null;
}

const STAGE_TABS: StageMeta[] = [
  {stage: 'discovery', label: 'Discovery', fileName: 'notes.md'},
  {stage: 'requirements', label: 'Requirements', fileName: 'requirements.md'},
  {stage: 'implement', label: 'Implement', fileName: 'implementation.md'},
  {stage: 'cleanup', label: 'Cleanup', fileName: null},
];

type TabState = 'ready' | 'pending' | 'future' | 'extra';

interface Tab {
  key: string;
  label: string;
  filePath: string | null;
  body: string;
  state: TabState;
  /** Stage this tab represents (for canonical stage tabs only). */
  stage?: CanonicalStage;
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

/**
 * Build the tab list for an item. All four canonical stage tabs are always
 * present (even Cleanup, which has no canonical .md file). Tab `state` is:
 *
 * - `ready`   — has body content; renders the rendered markdown
 * - `pending` — at-or-before the item's next stage; shows a "press [enter]
 *               to move to <stage>" prompt and pressing [enter] advances
 * - `future`  — past the item's next stage; greyed; pressing [enter] still
 *               advances (one step at a time toward the tab's stage)
 * - `extra`   — extra `.md` files in the item dir, appended after the
 *               stage tabs with a distinct italic accent.
 */
function buildTabs(item: TrackerItem): Tab[] {
  const tabs: Tab[] = [];

  const itemStageIdx = STAGE_TABS.findIndex(t => t.stage === item.stage);
  // For items in 'backlog' or 'archive' (not in STAGE_TABS), itemStageIdx === -1
  // so the next stage is at index 0 (Discovery).
  const nextStageIdx = itemStageIdx + 1;

  for (let i = 0; i < STAGE_TABS.length; i++) {
    const meta = STAGE_TABS[i];
    let filePath: string | null = null;
    if (meta.fileName === 'notes.md') filePath = item.notesPath;
    else if (meta.fileName === 'requirements.md') filePath = item.requirementsPath;
    else if (meta.fileName === 'implementation.md') filePath = item.implementationPath;

    const exists = filePath ? fs.existsSync(filePath) : false;
    const body = exists && filePath ? readBody(filePath) : '';

    let state: TabState;
    if (body.trim()) {
      state = 'ready';
    } else if (i <= nextStageIdx) {
      state = 'pending';
    } else {
      state = 'future';
    }

    tabs.push({
      key: meta.stage,
      label: meta.label,
      filePath,
      body,
      state,
      stage: meta.stage,
    });
  }

  for (const fname of listExtraMdFiles(item.itemDir)) {
    const filePath = path.join(item.itemDir, fname);
    tabs.push({
      key: `extra:${fname}`,
      label: fname,
      filePath,
      body: readBody(filePath),
      state: 'extra',
    });
  }

  return tabs;
}

function buildPendingMessage(tab: Tab, theme: MarkdownTheme): MdRow[] {
  const verb = tab.state === 'future' ? 'move to' : 'work on';
  const accent = tab.state === 'future' ? theme.tabExtraColor : theme.tabPendingColor;
  return [
    {spans: [{text: ''}]},
    {spans: [{text: `Press [enter] to ${verb} ${tab.label}.`, color: accent, bold: true}]},
    {spans: [{text: ''}]},
    {spans: [{text: 'Each press advances the item one stage and launches a session for that stage.', dim: true}]},
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
  if (tab.state === 'extra') {
    if (!tab.body.trim()) return [{spans: [{text: '(empty file)', dim: true}]}];
    return [...buildExtraHeader(tab.label, width, theme), ...renderMarkdown(tab.body, width, theme)];
  }
  if (tab.state === 'ready') {
    return renderMarkdown(tab.body, width, theme);
  }
  // pending or future — show the "press enter to advance" prompt.
  return buildPendingMessage(tab, theme);
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
 * Tab strip styled to match the stages-configuration screen — padded
 * labels, active tab in `inverse + bold + theme.tabActiveColor`. Future
 * tabs are dim, pending tabs use `theme.tabPendingColor`, extras use
 * `theme.tabExtraColor` + italic.
 */
function TabStrip({tabs, activeIndex, theme}: TabStripProps) {
  return (
    <Box flexDirection="row">
      {tabs.map((t, i) => {
        const isActive = i === activeIndex;
        const marker =
          t.state === 'extra' ? '• '
          : t.state === 'ready' ? ''
          : '○ ';
        const label = ` ${marker}${t.label} `;
        const color = isActive
          ? theme.tabActiveColor
          : t.state === 'pending'
          ? theme.tabPendingColor
          : t.state === 'extra'
          ? theme.tabExtraColor
          : undefined;
        return (
          <Box key={t.key} marginRight={2}>
            <Text
              bold={isActive}
              inverse={isActive}
              italic={t.state === 'extra' || undefined}
              dimColor={t.state === 'future' && !isActive || undefined}
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
    // Prefer the tab matching the item's current stage; fall back to first ready tab.
    const byStage = tabs.findIndex(t => t.stage === item.stage);
    if (byStage >= 0) return byStage;
    const firstReady = tabs.findIndex(t => t.state === 'ready');
    return firstReady >= 0 ? firstReady : 0;
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
      const len = tabs.length;
      if (len === 0) return prev;
      return (prev + delta + len) % len;
    });
  }, [tabs.length]);

  const stageActionAction = actions.find(a => a.id === 'stage-action');
  const attachAction = actions.find(a => a.id === 'attach-session');

  // [enter] only triggers the stage advance when the active tab is a
  // non-ready stage tab (pending or future) — so "move to cleanup" only
  // fires when the user is actually on the cleanup tab. Ready tabs and
  // extra-file tabs treat [enter] as a no-op; [a] is the dedicated attach.
  const enterAdvances = !!(stageActionAction && tab && (tab.state === 'pending' || tab.state === 'future'));

  const handlePrimary = React.useCallback(() => {
    if (enterAdvances) onStageAction();
  }, [enterAdvances, onStageAction]);

  useInput((input, key) => {
    if (key.leftArrow) moveTab(-1);
    else if (key.rightArrow) moveTab(1);
    else if (key.upArrow) setActiveScroll(n => n - 1);
    else if (key.downArrow) setActiveScroll(n => n + 1);
    else if (key.pageUp) setActiveScroll(n => n - viewportHeight);
    else if (key.pageDown || input === ' ') setActiveScroll(n => n + viewportHeight);
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

  const enterHint = enterAdvances && tab
    ? `[enter] ${tab.state === 'future' ? 'move to' : 'work on'} ${tab.label}${stageActionAction?.warn ? ' (!)' : ''}`
    : null;

  const footerKeys = [
    '[←/→] tabs',
    '[↑↓ PgUp/PgDn space g/G] scroll',
    `[t] theme: ${theme.name}`,
    enterHint,
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
