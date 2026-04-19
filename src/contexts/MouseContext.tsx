import React, {createContext, useCallback, useContext, useEffect, useRef} from 'react';
import {useStdin, useStdout} from 'ink';
import {parseMouseEvents, enableMouse, disableMouse, type MouseButton} from '../services/MouseService.js';

interface MouseRegion {
  id: string;
  top: number;    // inclusive, 1-indexed terminal row
  bottom: number; // inclusive, 1-indexed terminal row
  onMouseDown?: (relativeY: number, button: MouseButton) => void;
  onScroll?: (direction: 'up' | 'down') => void;
}

interface MouseContextValue {
  registerRegion: (region: MouseRegion) => () => void;
}

const MouseContext = createContext<MouseContextValue | null>(null);

const NOOP_CTX: MouseContextValue = {registerRegion: () => () => {}};

export function useMouseContext(): MouseContextValue {
  return useContext(MouseContext) ?? NOOP_CTX;
}

export function useMouseRegion(
  id: string,
  top: number,
  height: number,
  onMouseDown?: (relativeY: number, button: MouseButton) => void,
  onScroll?: (direction: 'up' | 'down') => void,
): void {
  const {registerRegion} = useMouseContext();
  const mouseDownRef = useRef(onMouseDown);
  const scrollRef = useRef(onScroll);
  mouseDownRef.current = onMouseDown;
  scrollRef.current = onScroll;

  useEffect(() => {
    if (top <= 0 || height <= 0) return;
    return registerRegion({
      id,
      top,
      bottom: top + height - 1,
      onMouseDown: (relY, btn) => mouseDownRef.current?.(relY, btn),
      onScroll: (dir) => scrollRef.current?.(dir),
    });
  }, [id, top, height, registerRegion]);
}

export function MouseProvider({children}: {children: React.ReactNode}) {
  const {stdin} = useStdin();
  const {stdout} = useStdout();
  // Map preserves insertion order; later-inserted region wins when Y ranges overlap
  const regions = useRef<Map<string, MouseRegion>>(new Map());

  useEffect(() => {
    if (!stdout?.isTTY) return;
    enableMouse(stdout as NodeJS.WriteStream);
    return () => {
      try { disableMouse(stdout as NodeJS.WriteStream); } catch {}
    };
  }, [stdout]);

  useEffect(() => {
    if (!stdout?.isTTY) return;

    const handler = (data: Buffer) => {
      const str = data.toString('utf8');
      const events = parseMouseEvents(str);
      for (const event of events) {
        // Walk forward, keeping the last match so most-recently inserted region wins
        let match: MouseRegion | undefined;
        for (const region of regions.current.values()) {
          if (event.y >= region.top && event.y <= region.bottom) match = region;
        }
        if (!match) continue;
        if (event.button === 'scroll-up') {
          match.onScroll?.('up');
        } else if (event.button === 'scroll-down') {
          match.onScroll?.('down');
        } else if (event.type === 'press') {
          match.onMouseDown?.(event.y - match.top, event.button);
        }
      }
    };

    stdin.on('data', handler);
    return () => { stdin.off('data', handler); };
  }, [stdin, stdout]);

  const registerRegion = useCallback((region: MouseRegion): (() => void) => {
    regions.current.set(region.id, region);
    return () => { regions.current.delete(region.id); };
  }, []);

  return (
    <MouseContext.Provider value={{registerRegion}}>
      {children}
    </MouseContext.Provider>
  );
}
