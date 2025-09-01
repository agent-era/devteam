import {render} from 'ink';
import React from 'react';
import App from './App.js';
import {reinitializeMemoryLogging} from './shared/utils/logger.js';


export function run() {
  const {waitUntilExit} = render(<App />);
  
  // Re-initialize logging after Ink's render() to ensure our overrides work
  reinitializeMemoryLogging();
  
  return waitUntilExit();
}