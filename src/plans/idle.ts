// Idle: a plan quiet for a second tells the server, which triages its claims (durandal.nvim
// plans.lua idle :1073-1104; M6 spec §5.3). Per plan; each change re-arms. No vscode import;
// the timers are injected.
export interface Timers { set(fn: () => void, ms: number): unknown; clear(handle: unknown): void }

export const IDLE_MS = 1000;

export class Idle {
  private readonly timers = new Map<string, unknown>();

  // fire: the plan URI is quiet; version: its version now (undefined once closed)
  constructor(
    private readonly t: Timers, private readonly fire: (uri: string) => void,
    private readonly version: (uri: string) => number | undefined, private readonly ms = IDLE_MS,
  ) {}

  // changed: URI changed and is at VERSION: a second from now, unless it changes again
  changed(uri: string, version: number): void {
    this.forget(uri);
    this.timers.set(uri, this.t.set(() => {
      this.timers.delete(uri);
      if (this.version(uri) === version) this.fire(uri);
    }, this.ms));
  }

  armed(uri: string): boolean { return this.timers.has(uri); }

  // forget: URI closed
  forget(uri: string): void {
    const h = this.timers.get(uri);
    if (h === undefined) return;
    this.t.clear(h);
    this.timers.delete(uri);
  }

  // clear: the server stopped
  clear(): void {
    for (const h of this.timers.values()) this.t.clear(h);
    this.timers.clear();
  }
}
