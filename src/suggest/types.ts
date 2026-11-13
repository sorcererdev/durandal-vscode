import type { Plan } from '../protocol';
import type { SuggestKind } from '../actionLog';

export type { SuggestKind };

// Offer: a suggestion as the controller keeps it (durandal.nvim suggest.lua's st.shown and
// st.action). generator is what the log and dismiss key name: a follow-up's and a ghost's is
// the server's label (nvim :275), a recognition's its generator; name is shown.
export interface Offer {
  kind: SuggestKind; generator: string; name: string; sets: Record<string, unknown>;
  label?: string; summary?: string; lines?: string[]; planId?: number; plan?: Plan;
  band?: 'offer' | 'hint'; choice?: string; reasons?: string[]; score?: number;
  // a ghost's block goes under the cursor line (server line === at + 1): VS Code draws its lines
  below?: boolean;
}

// Shown: an offer drawn on a document's line (0-based) at a version, with its dismiss key.
export interface Shown extends Offer { uri: string; line: number; lineText: string; version: number; key: string }
