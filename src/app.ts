import {render} from 'ink';
import React from 'react';
import App from './App.js';
import {reinitializeMemoryLogging} from './shared/utils/logger.js';

const h = React.createElement;

export function run() {
  const {waitUntilExit} = render(h(App));
  
  // Re-initialize logging after Ink's render() to ensure our overrides work
  reinitializeMemoryLogging();
  
  return waitUntilExit();
}