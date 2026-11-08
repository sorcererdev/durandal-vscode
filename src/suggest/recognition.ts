import type { Plan, Suggestion } from '../protocol';
import { short } from './keys';
import type { Offer } from './types';

// recognition: what the server pushed or answered, as the controller keeps it, and how it
// reads (durandal.nvim suggest.lua :64-100, :135-158). Pure.

export function recognitionOf(s: Suggestion, plan?: Plan): Offer {
  return {
    kind: 'recognition', generator: s.generator ?? s.label, name: s.label, sets: s.sets && typeof s.sets === 'object' ? s.sets : {},
    label: s.label, summary: s.summary, band: s.band === 'hint' ? 'hint' : 'offer', choice: typeof s.or === 'string' ? s.or : undefined,
    reasons: Array.isArray(s.reasons) ? s.reasons : [], score: s.score, plan, planId: s.planId,
  };
}

// a follow-up's and a ghost's generator is the server's label (nvim :275)
export function followupOf(s: Suggestion, plan?: Plan): Offer {
  return { kind: 'followup', generator: s.label, name: s.label, sets: {}, summary: s.summary, plan, planId: s.planId };
}

export function ghostOf(s: Suggestion): Offer {
  return { kind: 'ghost', generator: s.label, name: s.label, sets: {}, lines: Array.isArray(s.lines) ? s.lines : [], planId: s.planId };
}

// recognitionText: an offer, a choice of two, or a quiet hint (nvim :88-92)
export function recognitionText(o: Offer): string {
  const label = o.label ?? o.name;
  if (o.band === 'hint') return `⚡ ${label}`;
  if (o.choice) return `⚡ ${label} or a ${short(o.choice)} — Tab: choose`;
  return `⚡ ${label} — Tab: review`;
}

export function decorationText(o: Offer): string {
  if (o.kind === 'recognition') return recognitionText(o);
  if (o.kind === 'ghost') return `⚡ Tab: ${o.name} (+${(o.lines ?? []).length} lines)`;
  if (o.kind === 'followup') return `⚡ Tab: review ${o.name} (${o.summary ?? ''})`;
  return '';
}

// acceptWay: Tab on it (nvim accept_server, :371-373). The snippet ghost is VS Code's own.
export function acceptWay(o: Offer): 'review' | 'choose' | 'none' {
  if (o.kind === 'snippet') return 'none';
  if (o.kind === 'recognition' && (o.choice || (!o.plan && o.band !== 'offer'))) return 'choose';
  return 'review';
}
