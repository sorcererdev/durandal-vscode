import { appendFileSync, mkdirSync } from 'node:fs';
import { join } from 'node:path';

// The action log: which actions were offered where and which were picked, one JSON object per
// line, to tune where generators apply (durandal.nvim util.log; the olifant book ch. 14).
// Olifant logs nothing itself.
export type SuggestKind = 'snippet' | 'ghost' | 'followup' | 'recognition';

export type ActionEvent =
  | { event: 'shown'; file: string; generators: string[] }
  | { event: 'picked' | 'fix-picked'; file: string; generator: string }
  | { event: 'generate-applied'; generator: string }
  | { event: 'applied'; generator: string; files: number }
  | { event: 'hinted'; generator: string }
  // ghost text and snippets (durandal.nvim suggest.lua's util.log calls)
  | { event: `${SuggestKind}-${'shown' | 'dismissed' | 'reviewed' | 'applied'}`; generator: string; band?: string; score?: number; model?: boolean }
  | { event: 'snippet-anticipated'; generator: string; line: number };

// logDir is durandal.nvim's: $DURANDAL_LOG_DIR, else the cache directory's durandal folder
// (nvim's stdpath("cache") honours XDG_CACHE_HOME), so both editors write the same file.
export function logDir(env: Record<string, string | undefined>, home: string): string {
  if (env.DURANDAL_LOG_DIR) return env.DURANDAL_LOG_DIR;
  return join(env.XDG_CACHE_HOME || join(home, '.cache'), 'durandal');
}

export function stamp(d: Date): string {
  return d.toISOString().replace(/\.\d{3}Z$/, 'Z');
}

export function logLine(e: ActionEvent, now: Date): string {
  return JSON.stringify({ ...e, t: stamp(now) }) + '\n';
}

export class ActionLog {
  private warned = false;

  constructor(private readonly o: { dir(): string; enabled(): boolean; warn(m: string): void; now?(): Date }) {}

  // write appends e; a failure is said once (to the output channel) and never thrown.
  write(e: ActionEvent): void {
    if (!this.o.enabled()) return;
    const dir = this.o.dir();
    try {
      mkdirSync(dir, { recursive: true });
      appendFileSync(join(dir, 'actions.jsonl'), logLine(e, this.o.now ? this.o.now() : new Date()));
    } catch (err) {
      if (this.warned) return;
      this.warned = true;
      this.o.warn(`the action log could not be written (${dir}): ${err instanceof Error ? err.message : String(err)}`);
    }
  }
}
