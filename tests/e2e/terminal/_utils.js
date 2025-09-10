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
  write(data){
    const s = typeof data === 'string' ? data : String(data);
    this.emit('data', Buffer.from(s, 'utf8'));
    return true;
  }
  emit(event, ...args){
    // Also emit a keypress event for Ink's useInput parsing
    if (event === 'data') {
      try {
        const chunk = args[0];
        const str = typeof chunk === 'string' ? chunk : String(chunk);
        const key = {
          name: str,
          ctrl: false,
          meta: false,
          shift: false,
          escape: str === '\u001b',
          return: str === '\r'
        };
        super.emit('keypress', str, key);
      } catch {}
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
  return frame.includes(label);
}

function escapeRegExp(str){
  return str.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
}

export function worktreeRegex(project){
  const p = escapeRegExp(project);
  // Matches "feature-XX [project]"
  return new RegExp(`feature-\\d+ \\[${p}\\]`);
}

export function countWorktrees(frame = '', project){
  if (!frame) return 0;
  const p = escapeRegExp(project);
  const bracketMatches = frame.match(new RegExp(`feature-\\d+ \\[${p}\\]`, 'g')) || [];
  return bracketMatches.length;
}
