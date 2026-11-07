import type { CodeAction } from 'vscode-languageserver-protocol';
import type { ActionData, FileActionsResult } from '../protocol';

// menu: the actions-at-cursor menu and its miss, ported from durandal.nvim actions.lua. Pure.

export const dataOf = (a: CodeAction): ActionData => (a.data && typeof a.data === 'object' ? a.data : {}) as ActionData;
export const generatorOf = (a: CodeAction): string => dataOf(a).generator ?? dataOf(a).rule ?? '';

export interface MenuItem { label: string; description?: string; action: CodeAction }

// menuItems: a rule's fixes first (as "Fix: …"), then the rest in the server's order.
export function menuItems(actions: CodeAction[]): MenuItem[] {
  const fixes = actions.filter(a => a.kind === 'quickfix');
  const others = actions.filter(a => a.kind !== 'quickfix');
  return [...fixes, ...others].map(a => {
    const missing = dataOf(a).missing ?? [];
    return { label: `${a.kind === 'quickfix' ? 'Fix: ' : ''}${a.title}`, description: missing.length > 0 ? `(asks ${missing.join(', ')})` : undefined, action: a };
  });
}

export type AskWay = { kind: 'form'; generator: string; done: boolean } | { kind: 'direct'; missing: string[] };

// askWay: an action naming a generator with inputs missing asks in the generate form (a fix's
// form hands its values back, nothing planned there); else each missing input is asked.
export function askWay(a: CodeAction): AskWay {
  const d = dataOf(a);
  const missing = d.missing ?? [];
  if (missing.length > 0 && typeof d.generator === 'string') return { kind: 'form', generator: d.generator, done: a.kind === 'quickfix' };
  return { kind: 'direct', missing };
}

export interface MissItem { label: string; separator?: boolean; line?: number; col?: number }
export type Miss = { kind: 'elsewhere'; text: string; items: MissItem[] } | { kind: 'nearby' | 'none'; text: string };

// explainMiss is actions.lua's explain_miss: what a generator nearby waits for comes first;
// actions elsewhere in the file are listed by line (1-based) to jump to.
export function explainMiss(fa: FileActionsResult | null | undefined, rel: string): Miss {
  const nearby = (fa?.nearby ?? []).map(n => `${n.name ?? n.generator} applies ${n.why} — none yet`);
  const ranged = (fa?.actions ?? []).filter(a => a.range);
  if (ranged.length > 0) {
    return {
      kind: 'elsewhere',
      text: 'Nothing at the cursor. In this file:',
      items: [
        ...nearby.map(label => ({ label, separator: true })),
        ...ranged.map(a => ({ label: `⚡ ${a.label} — line ${a.range!.start[0]}`, line: a.range!.start[0], col: a.range!.start[1] })),
      ],
    };
  }
  if (nearby.length > 0) return { kind: 'nearby', text: nearby.join('\n') };
  return { kind: 'none', text: `No Olifant generators apply to ${rel}` };
}
