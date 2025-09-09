import React, {useEffect, useState} from 'react';
import {Text} from 'ink';

const FRAMES = ['⠋','⠙','⠹','⠸','⠼','⠴','⠦','⠧','⠇','⠏'];

export default function Spinner({label}: {label?: string}) {
  const [i, setI] = useState(0);
  useEffect(() => {
    const t = setInterval(() => setI(n => (n + 1) % FRAMES.length), 80);
    return () => clearInterval(t);
  }, []);
  return <Text color="magenta">{FRAMES[i]} {label || 'Launching tmux session...'}</Text>;
}

