import React from 'react';
import {Box} from 'ink';
import {Spinner} from '@inkjs/ui';

export default function LoadingScreen() {
  return (
    <Box flexGrow={1} alignItems="center" justifyContent="center">
      <Spinner />
    </Box>
  );
}
