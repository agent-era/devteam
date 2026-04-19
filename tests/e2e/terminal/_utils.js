import {EventEmitter} from 'node:events';

export class CapturingStdout extends EventEmitter {
  constructor(){ super(); this.frames=[]; this._last=''; this._bestContent=''; this.isTTY=true; this.columns=100; this.rows=30; }
  write(chunk){
    const s = typeof chunk === 'string'? chunk: String(chunk);
    this.frames.push(s);
    this._last=s;
    // Track the last frame with substantial printable content (not just cursor codes)
    const printable = s.replace(/\u001b\[[^a-zA-Z]*[a-zA-Z]/g, '').trim();
    if (printable.length > 10) this._bestContent = s;
    return true;
  }
  // Returns the most recent frame that had actual content (not just cursor escape codes)
  lastFrame(){ return this._bestContent || this._last; }
  on(){ return super.on(...arguments); }
  off(){ return super.off(...arguments); }
}

export class StdinStub extends EventEmitter {
  constructor(){ super(); this.isTTY=true; this._readQueue=[]; }
  setEncoding(){}
  setRawMode(){}
  resume(){}
  pause(){}
  ref(){}
  unref(){}
  // Ink reads via readable + read(), not 'data' events.
  // Queue chunks here so handleReadable can dequeue them.
  read(){ return this._readQueue.length > 0 ? this._readQueue.shift() : null; }
  write(data){
    const buf = Buffer.isBuffer(data) ? data : Buffer.from(typeof data === 'string' ? data : String(data), 'utf8');
    this._push(buf);
    return true;
  }
  _push(buf){
    this._readQueue.push(buf);
    super.emit('readable');
  }
  emit(event, ...args){
    if (event === 'data') {
      const chunk = args[0];
      const buf = Buffer.isBuffer(chunk) ? chunk : Buffer.from(typeof chunk === 'string' ? chunk : String(chunk), 'utf8');
      this._push(buf);
    }
    return super.emit(event, ...args);
  }
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
const DEFAULT_WAIT = 12000;

export async function waitFor(predicate, {timeout = DEFAULT_WAIT, interval = 50, message = 'condition', onTimeout} = {}){
  const start = Date.now();
  /* eslint-disable no-constant-condition */
  while (true) {
    try {
      if (await predicate()) return true;
    } catch {
      // ignore predicate errors during polling
    }
    if (Date.now() - start > timeout) {
      try { onTimeout?.(); } catch {}
      throw new Error(`waitFor timeout waiting for ${message}`);
    }
    await new Promise(r => setTimeout(r, interval));
  }
}

// Wait for text to appear in a frame provider function
export async function waitForText(getFrame, text, {timeout = DEFAULT_WAIT, interval = 50, strip = true} = {}){
  const norm = (s) => strip ? stripAnsi(s || '') : (s || '');
  const msg = `text ${JSON.stringify(text)}`;
  return waitFor(() => {
    const frame = norm(getFrame());
    return frame.includes(text);
  }, {
    timeout,
    interval,
    message: msg,
    onTimeout: () => {
      try {
        const frame = norm(getFrame());
        const tail = frame.slice(-800); // dump last 800 chars for context
        // eslint-disable-next-line no-console
        console.error(`waitForText timeout for ${msg}. Last frame: ${JSON.stringify(tail)}`);
      } catch {}
    }
  });
}

// Worktree label helpers to tolerate alternate render formats
// Accept both "project/feature" and "feature [project]" styles across environments
export function worktreeLabel(project, feature){
  return `${feature} [${project}]`;
}

export function includesWorktree(frame = '', project, feature){
  const label = worktreeLabel(project, feature);
  const clean = stripAnsi(frame || '');
  return clean.includes(label);
}

function escapeRegExp(str){
  return str.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
}

export function worktreeRegex(project){
  const p = escapeRegExp(project);
  // Matches "feature-XX [project]" after stripping ANSI
  return new RegExp(`feature-\\d+ \\[${p}\\]`);
}

export function countWorktrees(frame = '', project){
  if (!frame) return 0;
  const clean = stripAnsi(frame || '');
  const p = escapeRegExp(project);
  const bracketMatches = clean.match(new RegExp(`feature-\\d+ \\[${p}\\]`, 'g')) || [];
  return bracketMatches.length;
}
