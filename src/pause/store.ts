import type { Paused } from '../protocol';

// store: the paused conjures, one per document (spec §3.1, §3.4; nvim conjure.lua's
// paused[buf]). Pure: the controller watches the documents and calls drop.

// Pause: first and last are the unit's 0-based lines (the server's are 1-based, last clamped to
// the document); position is the conjure's original cursor (a resume re-sends it); version the
// document's when the pause was shown; selected the entry chosen, kept across a closed window.
export interface Pause {
  uri: string; token: string; position: { line: number; character: number }; first: number; last: number;
  paused: Paused; selected?: number; version: number;
}

export function held(uri: string, position: Pause['position'], paused: Paused, version: number, lineCount: number): Pause {
  const top = Math.max(lineCount - 1, 0);
  const first = Math.min(Math.max(paused.lines.first - 1, 0), top);
  const last = Math.max(Math.min(paused.lines.last - 1, top), first);
  return { uri, token: paused.token, position, first, last, paused, version };
}

export class PauseStore {
  private readonly held = new Map<string, Pause>();

  // dropped hears every pause dropped (not one taken or replaced); why undefined is silent
  constructor(private readonly dropped: (p: Pause, why: string | undefined) => void) {}

  set(p: Pause): void { this.held.set(p.uri, p); }

  get(uri: string): Pause | undefined { return this.held.get(uri); }

  // take: a resume's, before its request goes, so no token is sent twice
  take(uri: string): Pause | undefined {
    const p = this.held.get(uri);
    this.held.delete(uri);
    return p;
  }

  drop(uri: string, why?: string): void {
    const p = this.held.get(uri);
    if (!p) return;
    this.held.delete(uri);
    this.dropped(p, why);
  }

  // dropAll: the server stopped; nothing it said stands
  dropAll(): void {
    for (const uri of [...this.held.keys()]) this.drop(uri);
  }

  uris(): string[] { return [...this.held.keys()]; }
}
