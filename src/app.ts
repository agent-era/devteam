import {render} from 'ink';
import React from 'react';
import App from './App.js';

const h = React.createElement;

export function run() {
  const {waitUntilExit} = render(h(App));
  return waitUntilExit();
}