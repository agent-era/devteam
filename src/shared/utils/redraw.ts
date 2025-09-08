import {EventEmitter} from 'node:events';

const emitter = new EventEmitter();

export function requestRedraw(): void {
  try { emitter.emit('redraw'); } catch {}
}

export function onRedraw(handler: () => void): () => void {
  emitter.on('redraw', handler);
  return () => {
    try { emitter.off('redraw', handler); } catch {}
  };
}

