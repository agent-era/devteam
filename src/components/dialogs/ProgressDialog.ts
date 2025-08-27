import React from 'react';
import {Box, Text} from 'ink';
const h = React.createElement;

type Props = {
  title?: string;
  message: string;
  project?: string;
};

export default function ProgressDialog({title = 'Progress', message, project}: Props) {
  return h(
    Box, {flexDirection: 'column', borderStyle: 'round', borderColor: 'blue', padding: 1},
    h(Text, {color: 'cyan'}, title),
    h(Text, null, ''),
    h(Text, null, message),
    project ? h(Text, {color: 'gray'}, `Project: ${project}`) : null,
    h(Text, null, ''),
    h(Text, {color: 'yellow'}, '⏳ Please wait...')
  );
}