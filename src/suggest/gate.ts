import type { Range } from 'vscode-languageserver-protocol';
import { errorMessage } from '../errors';
import type { InlineItem, SnippetData } from '../protocol';
import { keyOf } from './keys';

// gate: which inline item (the snippet anticipated at the cursor) is shown (spec §3.1, nvim
// suggest.lua :241-255), and what its fill command carries. Pure.

export const MAX_GHOST_LINES = 8;

export interface GateIn {
  enabled: boolean; inProject: boolean;
  // VS Code's completion widget is open (context.selectedCompletionInfo): Tab is its
  completionOpen: boolean;
  // the controller shows a decoration kind on this line (a follow-up wins, nvim :334)
  nonInline: boolean;
  dismissed(key: string): boolean;
  line: number; lineText: string;
}

export type Gate = { ok: true; data: SnippetData; body: string; key: string } | { ok: false; why: string };

// FillArgs: durandal.snippet.fill's one argument (protocol range: the item's, the whole line).
export interface FillArgs { uri: string; range: Range; body: string; data: SnippetData }

export function snippetData(d: unknown): SnippetData | undefined {
  if (!d || typeof d !== 'object') return undefined;
  const o = d as Record<string, unknown>;
  if (o.kind !== 'action' || typeof o.generator !== 'string') return undefined;
  return { ...(o as unknown as SnippetData), sets: o.sets && typeof o.sets === 'object' ? (o.sets as Record<string, unknown>) : {} };
}

// early: why nothing is asked at all (undefined: ask the server).
export function early(g: GateIn): string | undefined {
  if (!g.enabled) return 'ghosts are off';
  if (!g.inProject) return 'not in a project';
  if (g.completionOpen) return 'the completion widget is open';
  if (g.nonInline) return 'a suggestion is shown on this line';
  return undefined;
}

export function inlineGate(item: InlineItem | undefined, g: GateIn): Gate {
  const why = early(g);
  if (why) return { ok: false, why };
  if (!item) return { ok: false, why: 'no item' };
  const { start, end } = item.range;
  if (start.line !== g.line || end.line !== g.line) return { ok: false, why: 'not on the cursor line' };
  const data = snippetData(item.data);
  if (!data) return { ok: false, why: 'not an action' };
  if (!Array.isArray(item.ghost) || item.ghost.length > MAX_GHOST_LINES) return { ok: false, why: 'no ghost of at most 8 lines' };
  const key = keyOf(data, g.lineText, g.line + 1);
  if (g.dismissed(key)) return { ok: false, why: 'dismissed here' };
  const body = typeof item.insertText === 'string' ? item.insertText : item.insertText.value;
  return { ok: true, data, body, key };
}

// fetchFailure: what to write to the output channel when the inline fetch failed: the server's
// words as sent, or nothing for a cancelled fetch (-32800, or VS Code no longer wants it).
export function fetchFailure(err: unknown, cancelled: boolean): string | undefined {
  if (cancelled || (!!err && typeof err === 'object' && (err as { code?: unknown }).code === -32800)) return undefined;
  return errorMessage(err);
}
