import React from 'react';
import fs from 'fs';
import {Box, Text, useInput} from 'ink';
import {TrackerService, StagesConfig, TrackerStage, WorkStyle} from '../services/TrackerService.js';
import {useTerminalDimensions} from '../hooks/useTerminalDimensions.js';

const STAGE_KEYS: Exclude<TrackerStage, 'archive'>[] = ['discovery', 'requirements', 'implement', 'cleanup'];
const STAGE_LABELS: Record<Exclude<TrackerStage, 'archive'>, string> = {
  backlog: 'Discovery',
  discovery: 'Discovery',
  requirements: 'Requirements',
  implement: 'Implement',
  cleanup: 'Cleanup',
};
const ALL_TABS = [...STAGE_KEYS, 'style'] as const;

interface OptionDef {
  key: string;
  label: string;
  choices: {value: string; label: string}[];
}

// Per-stage structured options (different per stage)
const STAGE_OPTION_DEFS: Partial<Record<Exclude<TrackerStage, 'archive'>, OptionDef[]>> = {
  discovery: [
    {key: 'skip', label: 'When to run', choices: [
      {value: 'always_run', label: 'Always'},
      {value: 'if_obvious', label: 'Skip if obvious'},
      {value: 'always_skip', label: 'Always skip'},
    ]},
    {key: 'depth', label: 'Depth', choices: [
      {value: 'quick', label: 'Quick'},
      {value: 'normal', label: 'Normal'},
      {value: 'thorough', label: 'Thorough'},
    ]},
    {key: 'web_search', label: 'Web search', choices: [
      {value: 'never', label: 'Never'},
      {value: 'if_needed', label: 'If needed'},
      {value: 'always', label: 'Always'},
    ]},
    {key: 'questions', label: 'Questions', choices: [
      {value: 'none', label: 'None'},
      {value: 'minimal', label: 'Minimal (1)'},
      {value: 'standard', label: 'Standard (1–3)'},
    ]},
  ],
  requirements: [
    {key: 'style', label: 'Style', choices: [
      {value: 'interview', label: 'Interview first'},
      {value: 'draft_first', label: 'Draft then refine'},
      {value: 'freeform', label: 'Free-form'},
    ]},
    {key: 'detail', label: 'Detail', choices: [
      {value: 'minimal', label: 'Minimal'},
      {value: 'standard', label: 'Standard'},
      {value: 'thorough', label: 'Thorough'},
    ]},
    {key: 'approval', label: 'Check-ins', choices: [
      {value: 'per_section', label: 'Per section'},
      {value: 'end_only', label: 'End only'},
      {value: 'none', label: 'None'},
    ]},
    {key: 'user_stories', label: 'User stories', choices: [
      {value: 'skip', label: 'Skip'},
      {value: 'include', label: 'Include'},
      {value: 'lead', label: 'Lead with'},
    ]},
  ],
  implement: [
    {key: 'start_with', label: 'Start with', choices: [
      {value: 'explore', label: 'Explore first'},
      {value: 'jump_in', label: 'Jump in'},
    ]},
    {key: 'tdd', label: 'TDD', choices: [
      {value: 'required', label: 'Required'},
      {value: 'suggested', label: 'Suggested'},
      {value: 'skip', label: 'Skip'},
    ]},
    {key: 'commit_style', label: 'Commits', choices: [
      {value: 'none', label: 'None'},
      {value: 'per_feature', label: 'Per feature'},
      {value: 'atomic', label: 'Atomic'},
      {value: 'conventional', label: 'Conventional'},
    ]},
    {key: 'impl_notes', label: 'Impl notes', choices: [
      {value: 'skip', label: 'Skip'},
      {value: 'brief', label: 'Brief'},
      {value: 'detailed', label: 'Detailed'},
    ]},
  ],
  cleanup: [
    {key: 'scope', label: 'Scope', choices: [
      {value: 'quick', label: 'Quick'},
      {value: 'standard', label: 'Standard'},
      {value: 'thorough', label: 'Thorough'},
    ]},
    {key: 'tests', label: 'Tests', choices: [
      {value: 'skip', label: 'Skip'},
      {value: 'run', label: 'Run only'},
      {value: 'fix', label: 'Run & fix'},
    ]},
    {key: 'docs', label: 'Docs', choices: [
      {value: 'skip', label: 'Skip'},
      {value: 'update', label: 'Update existing'},
      {value: 'write', label: 'Write new'},
    ]},
    {key: 'pr_prep', label: 'PR prep', choices: [
      {value: 'skip', label: 'Skip'},
      {value: 'notes', label: 'Key notes'},
      {value: 'full', label: 'Full description'},
    ]},
  ],
};

// Global style options (Style tab)
interface StyleOptionDef {
  key: keyof WorkStyle;
  label: string;
  choices: {value: string; label: string}[];
}

const STYLE_OPTIONS: StyleOptionDef[] = [
  {key: 'decisionStyle', label: 'Decisions', choices: [
    {value: 'ask', label: 'Always ask me'},
    {value: 'recommend', label: 'Research & recommend'},
    {value: 'decide', label: 'Decide autonomously'},
  ]},
  {key: 'verbosity', label: 'Verbosity', choices: [
    {value: 'brief', label: 'Brief'},
    {value: 'detailed', label: 'Detailed'},
  ]},
  {key: 'planning', label: 'Before starting', choices: [
    {value: 'dive_in', label: 'Dive in'},
    {value: 'plan_first', label: 'Show plan first'},
    {value: 'plan_approval', label: 'Plan + wait for approval'},
  ]},
  {key: 'questions', label: 'Questions', choices: [
    {value: 'minimal', label: 'Minimal'},
    {value: 'batch', label: 'Batch together'},
    {value: 'one_at_a_time', label: 'One at a time'},
  ]},
  {key: 'contextDepth', label: 'Research depth', choices: [
    {value: 'light', label: 'Light'},
    {value: 'moderate', label: 'Moderate'},
    {value: 'deep', label: 'Deep'},
  ]},
  {key: 'codeScope', label: 'Code scope', choices: [
    {value: 'minimal', label: 'Minimal'},
    {value: 'clean_as_go', label: 'Clean as you go'},
    {value: 'thorough', label: 'Thorough'},
  ]},
  {key: 'testing', label: 'Tests', choices: [
    {value: 'skip', label: 'Skip'},
    {value: 'suggest', label: 'Suggest'},
    {value: 'always', label: 'Always write'},
  ]},
  {key: 'commits', label: 'Commits', choices: [
    {value: 'never', label: 'Never'},
    {value: 'milestones', label: 'At milestones'},
    {value: 'often', label: 'Frequently'},
  ]},
  {key: 'onBlockers', label: 'On blockers', choices: [
    {value: 'ask', label: 'Stop & ask'},
    {value: 'try_first', label: 'Try alternatives first'},
    {value: 'continue', label: 'Note & continue'},
  ]},
];

const STYLE_CUSTOM_ROW = STYLE_OPTIONS.length;

interface ContentLine {
  key: string;
  text: string;
  bold?: boolean;
  dimColor?: boolean;
  color?: string;
}

function fileContentToLines(content: string): ContentLine[] {
  if (!content.trim()) return [{key: 'empty', text: '(file is empty)', dimColor: true}];
  return content.split('\n').map((text, i) => ({key: `l${i}`, text: text || ' ', dimColor: true}));
}

interface TrackerStagesScreenProps {
  projectPath: string;
  onBack: () => void;
}

export default function TrackerStagesScreen({projectPath, onBack}: TrackerStagesScreenProps) {
  const {rows} = useTerminalDimensions();
  const service = React.useMemo(() => new TrackerService(), []);
  const [config, setConfig] = React.useState<Required<StagesConfig>>(() => service.loadStagesConfig(projectPath));
  const [workStyle, setWorkStyle] = React.useState<WorkStyle>(() => service.loadWorkStyle(projectPath));
  const [selectedTab, setSelectedTab] = React.useState<number>(0);
  const [scrollTop, setScrollTop] = React.useState(0);
  const [selectedRow, setSelectedRow] = React.useState(0);
  const [editMode, setEditMode] = React.useState(false);
  const [editPrompt, setEditPrompt] = React.useState('');
  const [loading, setLoading] = React.useState(false);
  const [error, setError] = React.useState<string | null>(null);

  const currentTab = ALL_TABS[selectedTab];
  const isStyleTab = currentTab === 'style';
  const currentStage = isStyleTab ? null : currentTab as Exclude<TrackerStage, 'archive'>;
  const stageOpts = currentStage ? (STAGE_OPTION_DEFS[currentStage] || []) : [];
  const stageSettings = currentStage ? (config[currentStage].settings || {}) : {};

  // For stage tabs: generate preview in-memory from settings so it updates in real-time
  const stageFileContent = React.useMemo(() => {
    if (isStyleTab || !currentStage) return '';
    return service.defaultStageFileContent(currentStage, stageSettings);
  }, [isStyleTab, currentStage, stageSettings, service]);

  const stageFileLines = React.useMemo(() => fileContentToLines(stageFileContent), [stageFileContent]);

  // Layout: title(1) + path(1) + tabs(1) + gap(1) + border(2) + footer(2) = 8 fixed rows
  const fixedRows = 8;
  const contentViewHeight = Math.max(4, rows - fixedRows);

  // For stage tabs: options rows + separator(1) + file lines
  const optionRowCount = stageOpts.length;
  const fileScrollOffset = optionRowCount + 1; // rows before scrollable file content
  const fileViewHeight = Math.max(2, contentViewHeight - fileScrollOffset);
  const maxScroll = Math.max(0, stageFileLines.length - fileViewHeight);
  const visibleFileLines = stageFileLines.slice(scrollTop, scrollTop + fileViewHeight);

  // -1 = tab row focused, 0+ = content row focused
  const tabRowFocused = selectedRow === -1;

  React.useEffect(() => { setScrollTop(0); setSelectedRow(-1); }, [selectedTab]);

  const cycleStageOption = React.useCallback((delta: number) => {
    if (!currentStage) return;
    const opt = stageOpts[selectedRow];
    if (!opt) return;
    const cur = stageSettings[opt.key] ?? opt.choices[0].value;
    const idx = opt.choices.findIndex(c => c.value === cur);
    const next = opt.choices[(idx + delta + opt.choices.length) % opt.choices.length].value;
    const newSettings = {...stageSettings, [opt.key]: next};
    service.saveStageSettings(projectPath, currentStage, newSettings);
    // Write updated file to disk so the agent gets the new settings
    const updatedContent = service.defaultStageFileContent(currentStage, newSettings);
    const filePath = service.getStageFilePath(projectPath, currentStage);
    try { fs.writeFileSync(filePath, updatedContent, 'utf8'); } catch {}
    setConfig(service.loadStagesConfig(projectPath));
  }, [currentStage, stageOpts, selectedRow, stageSettings, service, projectPath]);

  const cycleStyleOption = React.useCallback((delta: number) => {
    const opt = STYLE_OPTIONS[selectedRow];
    if (!opt) return;
    const cur = workStyle[opt.key] as string;
    const idx = opt.choices.findIndex(c => c.value === cur);
    const next = opt.choices[(idx + delta + opt.choices.length) % opt.choices.length].value;
    const updated = {...workStyle, [opt.key]: next};
    setWorkStyle(updated);
    service.saveWorkStyle(projectPath, updated);
  }, [selectedRow, workStyle, service, projectPath]);

  const handleEditSubmit = React.useCallback(() => {
    const prompt = editPrompt.trim();
    setEditMode(false);
    setEditPrompt('');
    if (!prompt) return;
    setLoading(true);
    setError(null);
    if (isStyleTab) {
      void (async () => {
        const result = await service.editWorkStyleWithAI(projectPath, prompt);
        setLoading(false);
        if (result.success && result.workStyle) setWorkStyle(result.workStyle);
        else setError(result.error || 'AI edit failed');
      })();
    } else if (currentStage) {
      void (async () => {
        const result = await service.editStageFileWithAI(projectPath, currentStage, prompt);
        setLoading(false);
        if (!result.success) setError(result.error || 'AI edit failed');
        // Force re-read by toggling tab
        setSelectedTab(t => t);
      })();
    }
  }, [editPrompt, isStyleTab, currentStage, service, projectPath]);

  useInput((input, key) => {
    if (editMode) {
      if (key.return) handleEditSubmit();
      else if (key.escape) { setEditMode(false); setEditPrompt(''); }
      else if (key.backspace || key.delete) setEditPrompt(p => p.slice(0, -1));
      else if (!key.ctrl && !key.meta && input?.length === 1) setEditPrompt(p => p + input);
      return;
    }
    if (loading) return;

    const goUp = input === 'k' || key.upArrow;
    const goDown = input === 'j' || key.downArrow;
    const goLeft = input === 'h' || key.leftArrow;
    const goRight = input === 'l' || key.rightArrow;

    if (tabRowFocused) {
      // In tab row: left/right switches tabs, down enters content
      if (goLeft) setSelectedTab(t => Math.max(0, t - 1));
      else if (goRight) setSelectedTab(t => Math.min(ALL_TABS.length - 1, t + 1));
      else if (goDown) setSelectedRow(0);
      else if (input === 'q' || key.escape) onBack();
    } else if (isStyleTab) {
      const maxRow = STYLE_CUSTOM_ROW;
      if (goDown) setSelectedRow(r => Math.min(maxRow, r + 1));
      else if (goUp) {
        if (selectedRow === 0) setSelectedRow(-1); // go to tab row
        else setSelectedRow(r => r - 1);
      }
      else if (goLeft) cycleStyleOption(-1);
      else if (goRight) cycleStyleOption(1);
      else if (input === 'e') { setEditMode(true); setError(null); }
      else if (input === 'q' || key.escape) onBack();
    } else {
      // Stage tab content
      if (goDown) {
        if (selectedRow < optionRowCount - 1) setSelectedRow(r => r + 1);
        else setScrollTop(s => Math.min(maxScroll, s + 1));
      } else if (goUp) {
        if (scrollTop > 0) setScrollTop(s => Math.max(0, s - 1));
        else if (selectedRow > 0) setSelectedRow(r => r - 1);
        else setSelectedRow(-1); // go to tab row
      } else if (goLeft && selectedRow < optionRowCount) cycleStageOption(-1);
      else if (goRight && selectedRow < optionRowCount) cycleStageOption(1);
      else if (input === 'e') { setEditMode(true); setError(null); }
      else if (input === 'q' || key.escape) onBack();
    }
  });

  const stageFilePath = currentStage ? service.getStageFilePath(projectPath, currentStage) : '';
  const tabLabel = isStyleTab ? 'Style' : STAGE_LABELS[currentTab as Exclude<TrackerStage, 'archive'>];
  const scrollIndicator = maxScroll > 0 ? ` ↑↓` : '';

  return (
    <Box flexDirection="column" flexGrow={1} paddingX={1}>
      <Text color="cyan" bold>Stage Configuration</Text>
      <Text dimColor>{projectPath}</Text>

      <Box marginTop={1}>
        {ALL_TABS.map((tab, index) => {
          const label = tab === 'style' ? 'Style' : STAGE_LABELS[tab as Exclude<TrackerStage, 'archive'>];
          const active = index === selectedTab;
          const focusedHere = tabRowFocused && active;
          return (
            <Box key={tab} marginRight={2}>
              <Text
                bold={active}
                inverse={active}
                color={focusedHere ? 'green' : undefined}
              >
                {` ${label} `}
              </Text>
            </Box>
          );
        })}
        {tabRowFocused && <Text dimColor> ← →</Text>}
      </Box>

      <Box flexDirection="column" borderStyle="round" borderColor="green" paddingX={1} height={contentViewHeight + 2}>
        <Text bold color="green">{tabLabel}</Text>

        {isStyleTab ? (
          <Box flexDirection="column">
            {STYLE_OPTIONS.map((opt, rowIdx) => {
              const cur = workStyle[opt.key] as string;
              const isRowSelected = selectedRow === rowIdx;
              return (
                <Box key={opt.key as string} flexDirection="column" marginBottom={1}>
                  <Text bold={isRowSelected}>{opt.label}</Text>
                  <Box flexDirection="row">
                    {opt.choices.map(choice => (
                      <Box key={choice.value} marginRight={1}>
                        <Text
                          inverse={cur === choice.value}
                          color={isRowSelected && cur === choice.value ? 'green' : undefined}
                        >
                          {` ${choice.label} `}
                        </Text>
                      </Box>
                    ))}
                  </Box>
                </Box>
              );
            })}
            <Box flexDirection="column" marginTop={1}>
              <Text bold={selectedRow === STYLE_CUSTOM_ROW}>
                Custom instructions
              </Text>
              {!workStyle.customInstructions.trim()
                ? <Text dimColor>(none — press [e] to add)</Text>
                : <Text dimColor>{workStyle.customInstructions.trim()}</Text>}
            </Box>
          </Box>
        ) : (
          <Box flexDirection="column" height={contentViewHeight}>
            {/* Per-stage options */}
            {stageOpts.map((opt, rowIdx) => {
              const cur = stageSettings[opt.key] ?? opt.choices[0].value;
              const isRowSelected = selectedRow === rowIdx;
              return (
                <Box key={opt.key} flexDirection="row" marginBottom={0}>
                  <Box width={16}>
                    <Text bold={isRowSelected}>{opt.label}</Text>
</Box>
                  {opt.choices.map(choice => (
                    <Box key={choice.value} marginRight={1}>
                      <Text
                        inverse={cur === choice.value}
                        color={isRowSelected && cur === choice.value ? 'green' : undefined}
                      >
                        {` ${choice.label} `}
                      </Text>
                    </Box>
                  ))}
                </Box>
              );
            })}
            {stageOpts.length > 0 && <Text dimColor>{`── ${stageFilePath}${scrollIndicator}`}</Text>}
            {/* Stage file preview */}
            <Box flexDirection="column">
              {visibleFileLines.map(line => (
                <Text key={line.key} bold={line.bold} dimColor={line.dimColor} color={line.color}>
                  {line.text}
                </Text>
              ))}
            </Box>
          </Box>
        )}
      </Box>

      <Box flexDirection="column" marginTop={1}>
        {loading && <Text color="yellow">⟳ Updating with AI...</Text>}
        {error && <Text color="red">{`! ${error}`}</Text>}
        {editMode && (
          <Box flexDirection="column">
            <Text color="yellow">{isStyleTab ? 'Describe custom instructions:' : 'Describe changes to the stage guide:'}</Text>
            <Text color="yellow">{editPrompt || ' '}<Text color="green">█</Text>  <Text dimColor>[enter] apply  [esc] cancel</Text></Text>
          </Box>
        )}
        {!editMode && !loading && tabRowFocused && (
          <Text color="magenta">[←]/[→] switch tab  [j] enter options  [q] back</Text>
        )}
        {!editMode && !loading && !tabRowFocused && isStyleTab && (
          <Text color="magenta">[j]/[k] select row  [←]/[→] change value  [k] at top → tabs  [e] edit instructions  [q] back</Text>
        )}
        {!editMode && !loading && !tabRowFocused && !isStyleTab && (
          <Text color="magenta">[j]/[k] navigate  [←]/[→] change option  [k] at top → tabs  [e] edit guide with AI  [q] back</Text>
        )}
      </Box>
    </Box>
  );
}
