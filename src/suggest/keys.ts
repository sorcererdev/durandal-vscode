// keys: what a dismissal remembers (durandal.nvim suggest.lua key_of, :26-31). Pure.

// stable is JSON with object keys sorted, so the same sets give the same key.
function stable(v: unknown): string {
  if (Array.isArray(v)) return `[${v.map(stable).join(',')}]`;
  if (v && typeof v === 'object') {
    return `{${Object.keys(v).sort().map(k => `${JSON.stringify(k)}:${stable((v as Record<string, unknown>)[k])}`).join(',')}}`;
  }
  return JSON.stringify(v ?? null);
}

// keyOf: the suggestion and the line's text and, for a blank line, which line (one Esc is not
// every blank line's). line is 1-based, as nvim's.
export function keyOf(a: { generator: string; sets?: Record<string, unknown> }, lineText: string, line: number): string {
  const where = /^\s*$/.test(lineText) ? `\0${line}` : '';
  return `${a.generator}\0${stable(a.sets ?? {})}\0${lineText}${where}`;
}

// recognitionKey: a recognition's band and choice are part of what it is: a hint the model
// upgrades to an offer replaces the hint (suggest.lua :233).
export function recognitionKey(key: string, band?: string, choice?: string): string {
  return `${key}\0${band ?? 'nil'}\0${choice ?? 'nil'}`;
}

// short: a generator id as people read it (p/close_table → close table).
export const short = (id: string): string => id.replace(/^.*\//, '').replace(/[-_]/g, ' ');

// dataKey: a completion item's data as a map key (the resolved-fill stash).
export const dataKey = (data: unknown): string => stable(data);
