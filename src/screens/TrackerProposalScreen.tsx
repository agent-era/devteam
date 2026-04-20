import React, {useState} from 'react';
import {Box, Text, useInput} from 'ink';
import {TrackerService, ProposalCandidate} from '../services/TrackerService.js';

interface TrackerProposalScreenProps {
  project: string;
  projectPath: string;
  proposals: ProposalCandidate[];
  onBack: () => void;
  onResolved: () => void;
}

export default function TrackerProposalScreen({
  project,
  projectPath,
  proposals,
  onBack,
  onResolved,
}: TrackerProposalScreenProps) {
  const [selectedIndex, setSelectedIndex] = useState(0);
  const [accepted, setAccepted] = useState<Set<number>>(new Set());

  const toggleAccepted = (index: number) => {
    setAccepted(prev => {
      const next = new Set(prev);
      if (next.has(index)) {
        next.delete(index);
      } else {
        next.add(index);
      }
      return next;
    });
  };

  const handleSubmit = () => {
    const tracker = new TrackerService();
    for (const index of accepted) {
      const item = proposals[index];
      if (item) {
        tracker.createItem(projectPath, item.title, 'backlog', item.slug, item.description);
      }
    }
    tracker.clearPendingProposals(projectPath);
    onResolved();
  };

  const handleDiscard = () => {
    const tracker = new TrackerService();
    tracker.clearPendingProposals(projectPath);
    onResolved();
  };

  useInput((input, key) => {
    if (input === 'j' || key.downArrow) {
      setSelectedIndex(prev => Math.min(prev + 1, proposals.length - 1));
    } else if (input === 'k' || key.upArrow) {
      setSelectedIndex(prev => Math.max(prev - 1, 0));
    } else if (input === ' ' || input === 'a') {
      toggleAccepted(selectedIndex);
    } else if (key.return) {
      handleSubmit();
    } else if (input === 'd' || input === 'D') {
      handleDiscard();
    } else if (input === 'q' || key.escape) {
      onBack();
    }
  });

  return (
    <Box flexDirection="column" flexGrow={1} paddingX={1}>
      <Text color="cyan">{`Proposals: ${project}  (${accepted.size} of ${proposals.length} selected)`}</Text>
      <Box flexDirection="column" marginTop={1}>
        {proposals.map((proposal, index) => {
          const isSelected = selectedIndex === index;
          const isAccepted = accepted.has(index);
          const marker = isAccepted ? '◆' : '○';
          return (
            <Box key={proposal.slug} flexDirection="column" marginBottom={1}>
              <Box>
                <Text inverse={isSelected}>{`  ${marker} ${proposal.slug}`}</Text>
              </Box>
              <Text dimColor>{`    ${proposal.description}`}</Text>
            </Box>
          );
        })}
      </Box>
      <Box marginTop={1}>
        <Text color="magenta">[j/k] navigate  [space] toggle  [enter] create accepted  [d] discard all  [q] back (keep)</Text>
      </Box>
    </Box>
  );
}
