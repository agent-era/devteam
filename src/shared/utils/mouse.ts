// Simple mouse input parser focused on SGR (1006) sequences.
// Returns wheel events for up/down scrolling.

export type MouseWheelDirection = 'up' | 'down';

export interface MouseWheelEvent {
  type: 'wheel';
  direction: MouseWheelDirection;
}

/**
 * Parse SGR mouse sequences from input buffer.
 * Supports sequences like: \x1b[<64;X;Y M (wheel up) and \x1b[<65;X;Y M (wheel down).
 * Returns an array of parsed wheel events; empty array if none found.
 */
export function parseMouseWheel(input: string | Buffer): MouseWheelEvent[] {
  const data = Buffer.isBuffer(input) ? input.toString('utf8') : String(input || '');
  const events: MouseWheelEvent[] = [];

  // SGR mouse pattern: ESC [ < btn ; x ; y (M|m)
  const sgrRegex = /\x1b\[<([0-9]+);([0-9]+);([0-9]+)[mM]/g;
  let match: RegExpExecArray | null;
  while ((match = sgrRegex.exec(data)) !== null) {
    const btn = Number(match[1]);
    if (btn === 64) {
      events.push({type: 'wheel', direction: 'up'});
    } else if (btn === 65) {
      events.push({type: 'wheel', direction: 'down'});
    }
  }

  return events;
}

/** Enable SGR mouse tracking on the terminal */
export function enableMouseTracking(): void {
  try {
    // Enable button tracking (1000) and SGR extended mode (1006)
    // Using process.stdout directly to avoid Ink abstractions here.
    process.stdout.write('\u001b[?1000h');
    process.stdout.write('\u001b[?1006h');
  } catch {}
}

/** Disable SGR mouse tracking on the terminal */
export function disableMouseTracking(): void {
  try {
    process.stdout.write('\u001b[?1006l');
    process.stdout.write('\u001b[?1000l');
  } catch {}
}

