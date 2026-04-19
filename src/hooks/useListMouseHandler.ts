import {useCallback, useRef} from 'react';

interface Options {
  indexOffset?: number;
  length: number;
  onSelect: (index: number) => void;
  onActivate?: (index: number) => void;
}

export function useListMouseHandler({
  indexOffset = 0,
  length,
  onSelect,
  onActivate,
}: Options): (relativeY: number, button: string) => void {
  const lastClickRef = useRef<{index: number; time: number} | null>(null);
  const onSelectRef = useRef(onSelect);
  const onActivateRef = useRef(onActivate);
  onSelectRef.current = onSelect;
  onActivateRef.current = onActivate;

  return useCallback((relativeY: number, button: string) => {
    if (button !== 'left') return;
    const idx = indexOffset + relativeY;
    if (idx < 0 || idx >= length) return;

    const now = Date.now();
    const last = lastClickRef.current;
    const isDouble = last !== null && last.index === idx && now - last.time < 500;
    lastClickRef.current = {index: idx, time: now};

    if (isDouble) {
      onActivateRef.current?.(idx);
    } else {
      onSelectRef.current(idx);
    }
  }, [indexOffset, length]);
}
