import type { Legend } from '../src/plans/legend';
import { PLAN_TOKEN_MODIFIERS, PLAN_TOKEN_TYPES } from '../src/protocol';

// The plan legend as olifant 48f38ab announces it, and an encoder of absolute tokens into the
// LSP's relative 5-int data (the unit tests and the fake server's canned answers use it).
export const PLAN_LEGEND: Legend = { tokenTypes: PLAN_TOKEN_TYPES, tokenModifiers: PLAN_TOKEN_MODIFIERS };

export type TokSpec = [line: number, start: number, length: number, type: string, modifiers?: string[]];

export function encode(toks: TokSpec[]): number[] {
  const out: number[] = [];
  let line = 0;
  let start = 0;
  for (const [l, s, len, type, mods = []] of [...toks].sort((a, b) => a[0] - b[0] || a[1] - b[1])) {
    const ti = PLAN_TOKEN_TYPES.indexOf(type);
    if (ti < 0) throw new Error(`no token type ${type}`);
    const bits = mods.reduce((b, m) => b | (1 << PLAN_TOKEN_MODIFIERS.indexOf(m)), 0);
    out.push(l - line, l === line ? s - start : s, len, ti, bits);
    line = l;
    start = s;
  }
  return out;
}
