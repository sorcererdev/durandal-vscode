// durandal.plans.* read and checked (spec §3.1). No vscode import: options.ts reads VS Code's
// configuration through it.
import { DEFAULT_GLYPHS, GLYPH_NAMES, Glyphs } from './glyphs';
import { PLANS_DIR } from './isPlan';

export interface PlansOptions { dir: string; conceal: boolean; glyphs: Glyphs; foldDone: boolean; reviewAnswers: boolean; reconcile: 'auto' | 'key' }

// dir: under each project, the folder whose markdown files are plans; it must match the
// server's [plans] dir. Slashes at either end and spaces are dropped; empty is the default.
function dirOf(v: unknown): string {
  if (typeof v !== 'string') return PLANS_DIR;
  const d = v.trim().replace(/\\/g, '/').replace(/^\/+|\/+$/g, '');
  return d === '' ? PLANS_DIR : d;
}

function glyphsOf(v: unknown): Glyphs {
  const out: Glyphs = { ...DEFAULT_GLYPHS };
  if (typeof v !== 'object' || v === null) return out;
  for (const name of GLYPH_NAMES) {
    const g = (v as Record<string, unknown>)[name];
    if (typeof g === 'string') out[name] = g;
  }
  return out;
}

export function plansOptionsFrom(get: (key: string, fallback: unknown) => unknown): PlansOptions {
  const conceal = get('conceal', false);
  const foldDone = get('foldDone', true);
  return {
    dir: dirOf(get('dir', PLANS_DIR)),
    conceal: conceal === true,
    glyphs: glyphsOf(get('glyphs', {})),
    foldDone: typeof foldDone === 'boolean' ? foldDone : true,
    // an ask's answer waits beside the plan for Accept all / Reject all, as a validate's does
    reviewAnswers: get('reviewAnswers', false) === true,
    // "key": only Plan: Reconcile reconciles; "auto" also on entry, landings and saves elsewhere
    reconcile: get('reconcile', 'auto') === 'key' ? 'key' : 'auto',
  };
}
