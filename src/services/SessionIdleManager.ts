import {AIStatus} from '../models.js';
import {SESSION_PREFIX} from '../constants.js';
import {TmuxService} from './TmuxService.js';

type IdleState = {
  idleStart?: number | null;
  wasKilledIdle?: boolean;
};

export class SessionIdleManager {
  private readonly thresholdMs: number;
  private state: Map<string, IdleState> = new Map();

  constructor(thresholdMinutes = 30) {
    this.thresholdMs = thresholdMinutes * 60 * 1000;
  }

  wasKilledIdle(sessionName: string): boolean {
    return this.state.get(sessionName)?.wasKilledIdle === true;
  }

  clearWasKilledIdle(sessionName: string): void {
    const st = this.state.get(sessionName) || {};
    st.wasKilledIdle = false;
    this.state.set(sessionName, st);
  }

  updateFromStatus(sessionName: string, aiStatus: AIStatus, attached: boolean, tmux: TmuxService): void {
    const st = this.state.get(sessionName) || {};

    if (aiStatus === 'idle') {
      if (!st.idleStart) st.idleStart = Date.now();
      const idleMs = Date.now() - (st.idleStart || Date.now());
      if (idleMs > this.thresholdMs) {
        // Kill and mark; next attach may resume
        try { tmux.killSession(sessionName); } catch {}
        st.idleStart = null;
        st.wasKilledIdle = true;
      }
    } else {
      st.idleStart = null; // reset when not idle
      // Keep wasKilledIdle until the next attach clears it
    }

    // If session reappears after being killed, clear the flag on next attach
    if (attached && st.wasKilledIdle) {
      // Do not auto-clear here; let the attach path clear explicitly after resuming
    }

    this.state.set(sessionName, st);
  }

  async periodicCheck(tmux: TmuxService): Promise<void> {
    // Check all dev- sessions for idleness; cheap cadence (e.g., every 60s)
    const sessions = await tmux.listSessions();
    const devSessions = sessions.filter(s => s.startsWith(SESSION_PREFIX));
    if (devSessions.length === 0) return;

    for (const session of devSessions) {
      try {
        const {status} = await tmux.getAIStatus(session);
        // Session presence is known; "attached" here means present, but don't clear flags implicitly
        const present = true;
        this.updateFromStatus(session, status, present, tmux);
      } catch {}
    }
  }
}
