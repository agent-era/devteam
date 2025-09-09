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
  resume(){}
  pause(){}
  ref(){}
  unref(){}
  read(){ return null; }
}

// Install global timer guards to prevent hanging between tests
export function installTimerGuards(){
  const original = {
    setInterval: global.setInterval,
    clearInterval: global.clearInterval,
    setTimeout: global.setTimeout,
    clearTimeout: global.clearTimeout,
  };
  const intervals = [];
  const timeouts = [];

  global.setInterval = function(fn, ...args){
    const id = original.setInterval(fn, ...args);
    intervals.push(id);
    return id;
  };
  global.setTimeout = function(fn, ...args){
    const id = original.setTimeout(fn, ...args);
    timeouts.push(id);
    return id;
  };

  function restore(){
    try { for(const id of intervals) original.clearInterval(id); } catch {}
    try { for(const id of timeouts) original.clearTimeout(id); } catch {}
    global.setInterval = original.setInterval;
    global.clearInterval = original.clearInterval;
    global.setTimeout = original.setTimeout;
    global.clearTimeout = original.clearTimeout;
  }

  return restore;
}
