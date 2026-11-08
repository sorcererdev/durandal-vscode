import type { Plan, Suggestion } from '../protocol';

// Pushed: the server's latest suggestion for a document (olifant/suggestion), and its plan
// once asked for (asked once per push: durandal.nvim suggest.lua M.pushed, :205-216).
export interface Pushed { s: Suggestion; asked: boolean; plan?: Plan }

export class Store {
  private readonly m = new Map<string, Pushed>();

  receive(s: Suggestion): void { this.m.set(s.uri, { s, asked: false }); }

  // current: the push for the document as it is, offered while the cursor (0-based) is on its line
  current(uri: string, version: number, line: number): Pushed | undefined {
    const p = this.m.get(uri);
    return p && p.s.version === version && p.s.at === line + 1 ? p : undefined;
  }

  forget(uri: string): void { this.m.delete(uri); }

  // clear: every push goes (the server that made them stopped)
  clear(): void { this.m.clear(); }
}
