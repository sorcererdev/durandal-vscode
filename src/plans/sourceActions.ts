// Which of a plan row's source code actions a chord uses, and what it does with it (durandal.nvim
// plans.lua new_step, excerpt, toggle). olifant answers every action whatever `only` says, and
// adds the disabled excerpt and toggle placeholders only when `only` names source; the claim
// pass's "Show the code here" (kind "", a command) is not the excerpt's (kind source). No vscode
// import.
import type { CodeAction } from 'vscode-languageserver-protocol';
import { EXCERPT_NOTHING, excerptWord, NO_NEW_STEP, TOGGLE_NO_STEP, TOGGLE_NOTHING, toggleWord } from './words';

export type Next =
  | { kind: 'apply'; action: CodeAction }
  | { kind: 'resolve'; action: CodeAction; none: string }
  | { kind: 'fold'; row: number; reason: string }
  | { kind: 'say'; level: 'info' | 'warn'; text: string };

export const NEW_STEP_TITLE = 'New step below';
export const EXCERPT_TITLE = 'Show the code here';

const isAction = (x: unknown): x is CodeAction =>
  typeof x === 'object' && x !== null && typeof (x as CodeAction).title === 'string' && typeof (x as CodeAction).kind === 'string';

// sources: the answer's actions of kind source
export function sources(xs: unknown): CodeAction[] {
  if (!Array.isArray(xs)) return [];
  return xs.filter(isAction).filter(a => a.kind === 'source' || a.kind!.startsWith('source.'));
}

export function newStepNext(xs: readonly CodeAction[]): Next {
  const a = xs.find(x => x.title === NEW_STEP_TITLE && x.edit);
  return a ? { kind: 'apply', action: a } : { kind: 'say', level: 'warn', text: NO_NEW_STEP };
}

// excerptNext: disabled with data.open: the step shows its code already, its fold toggles
export function excerptNext(xs: readonly CodeAction[]): Next {
  const a = xs.find(x => x.title === EXCERPT_TITLE);
  if (!a) return { kind: 'say', level: 'info', text: EXCERPT_NOTHING };
  if (a.disabled) {
    const reason = excerptWord(a.disabled.reason);
    const open = (a.data as { open?: unknown } | undefined)?.open;
    return typeof open === 'number' && Number.isInteger(open) ? { kind: 'fold', row: open, reason } : { kind: 'say', level: 'info', text: reason };
  }
  if (a.edit) return { kind: 'apply', action: a };
  return { kind: 'resolve', action: a, none: EXCERPT_NOTHING };
}

export function toggleNext(xs: readonly CodeAction[]): Next {
  const a = xs.find(x => (x.data as { kind?: unknown } | undefined)?.kind === 'toggle');
  if (!a) return { kind: 'say', level: 'info', text: TOGGLE_NO_STEP };
  if (a.disabled) return { kind: 'say', level: 'info', text: toggleWord(a.disabled.reason) };
  if (a.edit) return { kind: 'apply', action: a };
  return { kind: 'resolve', action: a, none: TOGGLE_NOTHING };
}
