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

// Strip ANSI escape codes from a frame string
export function stripAnsi(str = ''){
  if (!str) return '';
  return str.replace(/\u001b\[[0-9;]*m/g, '');
}

// Wait for a predicate to become true within a timeout
export async function waitFor(predicate, {timeout = 2000, interval = 50, message = 'condition'} = {}){
  const start = Date.now();
  /* eslint-disable no-constant-condition */
  while (true) {
    try {
      if (await predicate()) return true;
    } catch {
      // ignore predicate errors during polling
    }
    if (Date.now() - start > timeout) {
      throw new Error(`waitFor timeout waiting for ${message}`);
    }
    await new Promise(r => setTimeout(r, interval));
  }
}

// Wait for text to appear in a frame provider function
export async function waitForText(getFrame, text, {timeout = 2000, interval = 50, strip = true} = {}){
  const norm = (s) => strip ? stripAnsi(s || '') : (s || '');
  const msg = `text ${JSON.stringify(text)}`;
  return waitFor(() => {
    const frame = norm(getFrame());
    return frame.includes(text);
  }, {timeout, interval, message: msg});
}
