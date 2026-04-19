export type MouseButton = 'left' | 'right' | 'middle' | 'scroll-up' | 'scroll-down';

export interface MouseEvent {
  x: number;       // 1-indexed column
  y: number;       // 1-indexed row
  button: MouseButton;
  type: 'press' | 'release';
  shift: boolean;
  alt: boolean;
  ctrl: boolean;
}

// SGR extended mouse format: ESC[<{code};{x};{y}M (press) or m (release)
const SGR_RE = /\x1b\[<(\d+);(\d+);(\d+)([Mm])/g;

export function parseMouseEvents(data: string): MouseEvent[] {
  const events: MouseEvent[] = [];
  SGR_RE.lastIndex = 0;
  let match: RegExpExecArray | null;
  while ((match = SGR_RE.exec(data)) !== null) {
    const code = parseInt(match[1], 10);
    const x = parseInt(match[2], 10);
    const y = parseInt(match[3], 10);
    const isPress = match[4] === 'M';
    const isScroll = (code & 64) !== 0;
    const btnCode = code & 3;
    let button: MouseButton;
    if (isScroll) {
      button = btnCode === 0 ? 'scroll-up' : 'scroll-down';
    } else {
      button = btnCode === 0 ? 'left' : btnCode === 1 ? 'middle' : 'right';
    }
    events.push({
      x, y, button,
      type: isPress ? 'press' : 'release',
      shift: (code & 4) !== 0,
      alt: (code & 8) !== 0,
      ctrl: (code & 16) !== 0,
    });
  }
  return events;
}

export function enableMouse(stdout: NodeJS.WriteStream): void {
  stdout.write('\x1b[?1000h\x1b[?1006h');
}

export function disableMouse(stdout: NodeJS.WriteStream): void {
  stdout.write('\x1b[?1006l\x1b[?1000l');
}
