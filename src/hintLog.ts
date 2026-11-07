import type { FileActionsResult } from './protocol';

// hintLog: what the hinted log line needs. olifant's ⚡ hint carries only its label and the
// line, so the generator comes from olifant/fileActions: the first action, not a snippet,
// whose range covers the line (1-based). Pure.

export function generatorAt(fa: FileActionsResult | null | undefined, line: number): string | undefined {
  return (fa?.actions ?? []).find(a => !a.snippet && a.range && a.range.start[0] <= line && line <= a.range.end[0])?.generator;
}

// Seen keeps the uri:line pairs already logged this session (hints.lua logs once per line).
export class Seen {
  private readonly keys = new Set<string>();
  fresh(uri: string, lines: number[]): number[] {
    return lines.filter(l => {
      const k = `${uri}:${l}`;
      if (this.keys.has(k)) return false;
      this.keys.add(k);
      return true;
    });
  }
}
