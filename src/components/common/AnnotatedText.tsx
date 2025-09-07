import React from 'react';
import {Text} from 'ink';

type Props = {
  text: string;
  color?: string;
  wrap?: 'truncate' | 'wrap';
  bold?: boolean;
  dimColor?: boolean;
  backgroundColor?: string;
};

export default function AnnotatedText({text, color, wrap, bold, dimColor, backgroundColor}: Props) {
  const parts: React.ReactNode[] = [];
  const regex = /\[([A-Za-z])\]/g;
  let lastIndex = 0;
  let match: RegExpExecArray | null;
  while ((match = regex.exec(text)) !== null) {
    const index = match.index;
    if (index > lastIndex) {
      parts.push(text.slice(lastIndex, index));
    }
    const letter = match[1];
    parts.push('[', <Text key={`${index}-u`} underline>{letter}</Text>, ']');
    lastIndex = index + match[0].length;
  }
  if (lastIndex < text.length) {
    parts.push(text.slice(lastIndex));
  }

  return (
    <Text color={color as any} wrap={wrap as any} bold={bold} dimColor={dimColor} backgroundColor={backgroundColor as any}>
      {parts}
    </Text>
  );
}

