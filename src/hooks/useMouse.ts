import {useEffect, useRef} from 'react';
import {useStdin, useStdout} from 'ink';

export type MouseButton = 'left' | 'middle' | 'right' | 'wheelUp' | 'wheelDown' | 'unknown';
export type MouseEventType = 'down' | 'up' | 'drag' | 'move' | 'scroll';

export interface MouseEventData {
  type: MouseEventType;
  button: MouseButton;
  x: number; // 1-based column
  y: number; // 1-based row
  ctrl?: boolean;
  alt?: boolean;
  shift?: boolean;
}

export interface UseMouseOptions {
  enabled?: boolean;
  onEvent?: (ev: MouseEventData) => void;
}

/**
 * Minimal SGR mouse tracking parser for terminals that support xterm SGR mode.
 * Enables tracking on mount and disables on unmount. Does not interfere with
 * normal keyboard input handlers (parses only CSI < ... M/m sequences).
 */
export function useMouse({enabled = true, onEvent}: UseMouseOptions = {}) {
  const {stdin, setRawMode} = useStdin();
  const {stdout} = useStdout();
  const bufferRef = useRef<string>('');

  useEffect(() => {
    if (!enabled || !stdin || !stdout || !stdout.isTTY) return;
    // Avoid in Jest where TTY/mouse can cause noise
    if (process.env.JEST_WORKER_ID) return;

    try {
      setRawMode(true);
      // Enable SGR mouse reporting + button tracking + focus
      // 1000: button press/release; 1002: drag; 1003: any-motion; 1006: SGR; 1004: focus
      stdout.write('\u001b[?1000h');
      stdout.write('\u001b[?1002h');
      stdout.write('\u001b[?1003h');
      stdout.write('\u001b[?1006h');
      stdout.write('\u001b[?1004h');
    } catch {}

    const parseSGR = (chunk: string) => {
      // Append and parse any SGR mouse sequences: ESC [ < b ; x ; y (M|m)
      bufferRef.current += chunk;
      const re = /\u001b\[<([0-9]+);([0-9]+);([0-9]+)([mM])/g; // global
      let match: RegExpExecArray | null;
      while ((match = re.exec(bufferRef.current))) {
        const b = Number(match[1]);
        const x = Number(match[2]);
        const y = Number(match[3]);
        const up = match[4] === 'm';

        const shift = !!(b & 4);
        const meta = !!(b & 8);
        const ctrl = !!(b & 16);

        let type: MouseEventType = up ? 'up' : 'down';
        let button: MouseButton = 'unknown';

        // Wheel scrolls (SGR encodes 64 for wheel)
        if ((b & 64) === 64) {
          type = 'scroll';
          button = (b & 1) ? 'wheelDown' : 'wheelUp';
        } else {
          const base = b & 3; // 0 left, 1 middle, 2 right; 3 release or drag marker
          const dragging = !!(b & 32);
          if (dragging) {
            // Any-motion mode (1003) sends motion with base=3 and dragging bit on
            type = base === 3 ? 'move' : 'drag';
          }

          if (!up) {
            if (base === 0) button = 'left';
            else if (base === 1) button = 'middle';
            else if (base === 2) button = 'right';
          }
          // Release translates to up; keep last known button unknown if not tracked
          if (up && base === 3) type = 'up';
        }

        onEvent?.({ type, button, x, y, ctrl, alt: meta, shift });
      }
      // Trim processed sequences from buffer to avoid unbounded growth
      // Keep only the last 256 chars as safety
      if (bufferRef.current.length > 256) {
        bufferRef.current = bufferRef.current.slice(-256);
      }
    };

    const onData = (buf: Buffer) => {
      const str = buf.toString('utf8');
      if (str.includes('\u001b[<')) {
        parseSGR(str);
      }
    };

    stdin.on('data', onData);
    return () => {
      try {
        stdin.off('data', onData);
        // Disable mouse tracking
        stdout.write('\u001b[?1004l');
        stdout.write('\u001b[?1006l');
        stdout.write('\u001b[?1003l');
        stdout.write('\u001b[?1002l');
        stdout.write('\u001b[?1000l');
      } catch {}
      try { setRawMode(false); } catch {}
    };
  }, [enabled, stdin, setRawMode, stdout, onEvent]);
}
