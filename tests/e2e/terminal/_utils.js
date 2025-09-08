import {EventEmitter} from 'node:events';

export class CapturingStdout extends EventEmitter {
  constructor(){ super(); this.frames=[]; this._last=''; this.isTTY=true; this.columns=100; this.rows=30; }
  write(chunk){ const s = typeof chunk === 'string'? chunk: String(chunk); this.frames.push(s); this._last=s; return true; }
  lastFrame(){ return this._last; }
  on(){ return super.on(...arguments); }
  off(){ return super.off(...arguments); }
}

export class StdinStub extends EventEmitter {
  constructor(){ super(); this.isTTY=true; }
  setEncoding(){}
  setRawMode(){}
  ref(){}
  unref(){}
  read(){ return null; }
}

