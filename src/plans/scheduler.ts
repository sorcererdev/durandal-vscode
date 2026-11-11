// The reconcile state machine (durandal.nvim plans.lua reconcile :563-606, reconciled :550-558,
// entered :610-614; lsp.lua :44-51). One reconcile per plan in the air: olifant runs concurrent
// ones in parallel, so the client keeps them apart. No vscode import; the clock is injected.
import type { ReconcileResult } from '../protocol';
import { reconcileWord } from './words';

export type Start = 'send' | 'remembered' | 'skip' | 'notRunning';
export type Answer = { result: ReconcileResult | null } | { error: { code?: number; message: string } };
// After: what an answer leaves to do. again: run once more (its forced), undefined for none.
export interface After { say?: { level: 'info' | 'error'; text: string }; open: boolean; again?: boolean }

// ENTRY_MS: an entry does not reconcile again this soon after the last start (plans.lua :612)
export const ENTRY_MS = 1000;
const CANCELLED = -32800;

// State per plan. inFlight.tick: the plan's version the reconcile is for (moved on by the
// server's own edits). again: undefined none, else the remembered one's forced.
interface State {
  inFlight?: { tick: number; forced: boolean }; again?: boolean; lastStart?: number; lastError?: string; saidOpen?: number;
}

const num = (v: unknown): number => {
  const n = typeof v === 'number' ? v : typeof v === 'string' ? Number(v) : NaN;
  return Number.isFinite(n) ? n : 0;
};

export class Scheduler {
  private readonly st = new Map<string, State>();

  constructor(private readonly now: () => number) {}

  private of(uri: string): State {
    let s = this.st.get(uri);
    if (!s) this.st.set(uri, s = {});
    return s;
  }

  // start: a reconcile asked for URI at VERSION; RUNNING: a client is there to send it
  start(uri: string, forced: boolean, running: boolean, version: number): Start {
    const s = this.of(uri);
    if (s.inFlight) {
      // nvim: again = again or forced (nil or false is false; a forced one stays forced)
      s.again = s.again === true || forced;
      return 'remembered';
    }
    if (!running) return forced ? 'notRunning' : 'skip';
    s.lastStart = this.now();
    s.inFlight = { tick: version, forced };
    return 'send';
  }

  // recent: the last start was less than ENTRY_MS ago
  recent(uri: string): boolean {
    const t = this.st.get(uri)?.lastStart;
    return t !== undefined && this.now() - t < ENTRY_MS;
  }

  inFlight(uri: string): boolean { return !!this.st.get(uri)?.inFlight; }

  // ownEdit: the server's own reconcile or journal edit took the plan to VERSION during the
  // reconcile: that is not the plan moving (lsp.lua :44-51)
  ownEdit(uri: string, version: number): void {
    const f = this.st.get(uri)?.inFlight;
    if (f) f.tick = version;
  }

  // answer: the reconcile in flight on URI answered A; the plan is at VERSIONNOW
  answer(uri: string, a: Answer, versionNow: number): After {
    const s = this.of(uri);
    const f = s.inFlight;
    s.inFlight = undefined;
    const out: After = { open: false };
    if ('error' in a) {
      const { code, message } = a.error;
      if (code !== CANCELLED && (f?.forced || s.lastError !== message)) out.say = { level: 'error', text: message };
      if (code !== CANCELLED) s.lastError = message;
    } else {
      s.lastError = undefined;
      const r = a.result;
      if (r && typeof r === 'object') {
        // the server's facts were refused when the plan moved: one more, unforced (plans.lua :596)
        if (f && versionNow !== f.tick && s.again === undefined) s.again = false;
        const landed = num(r.landed);
        const open = num(r.readings);
        if (landed > 0 || open !== (s.saidOpen ?? 0)) {
          s.saidOpen = open;
          out.say = { level: 'info', text: reconcileWord(landed, open) };
        }
        out.open = !!f?.forced && open > 0;
      }
    }
    out.again = s.again;
    s.again = undefined;
    return out;
  }

  // cancel: drop the reconcile in flight on URI and the one remembered; true when one was in flight
  cancel(uri: string): boolean {
    const s = this.st.get(uri);
    if (!s?.inFlight) return false;
    s.inFlight = undefined;
    s.again = undefined;
    return true;
  }

  // forget: URI closed
  forget(uri: string): void { this.st.delete(uri); }

  // clear: the server stopped; nothing it said stands
  clear(): void { this.st.clear(); }
}
