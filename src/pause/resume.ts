import type { ConjureLanded, ConjureParams, ConjureResult, ConjureResume, Paused, ResumeChoice } from '../protocol';
import type { PauseRow } from './model';
import { errorMessage } from '../errors';
import { given } from './text';

// resume: what a pressed row sends (durandal.nvim conjure.lua :28-56), what the answer is
// (conjure.lua :159-207), and the running view's round and words (pause.lua :964-983,
// :1462-1500). Spec §3.5.

// Held: the pause a resume answers: its document, the opening conjure's cursor, its token
export interface Held { uri: string; position: { line: number; character: number }; token: string }

// resumeParams: arg only when the row has one (a null arg sends no key); land only for stop
// (true for a keep row, false for the stop row); hint only when the person typed one
export function resumeParams(h: Held, row: PauseRow, hint?: string): ConjureParams {
  const resume: ConjureResume = { token: h.token, choice: row.choice as ResumeChoice };
  if (given(row.arg)) resume.arg = row.arg;
  if (row.choice === 'stop') resume.land = row.land === true;
  if (given(hint) && hint !== '') resume.hint = hint;
  return { textDocument: { uri: h.uri }, position: { line: h.position.line, character: h.position.character }, resume };
}

export type Answer = { kind: 'paused'; paused: Paused } | { kind: 'landed'; landed: ConjureLanded };

// classify: the one branch point (conjure.lua :175): {paused: {…}} pauses again, else it landed
export function classify(v: ConjureResult): Answer {
  const paused = (v as { paused?: unknown }).paused;
  if (paused !== null && typeof paused === 'object') return { kind: 'paused', paused: paused as Paused };
  return { kind: 'landed', landed: v as ConjureLanded };
}

// the choices that run a round (pause.lua running :1470)
const RUNS_A_ROUND = new Set(['continue', 'climb', 'wire', 'accept']);

// runningRound: the round a choice runs: the last round's number + 1; none for the others
export function runningRound(choice: string, p: Paused): number | undefined {
  if (!RUNS_A_ROUND.has(choice)) return undefined;
  const rounds = p.rounds ?? [];
  const last = rounds.length > 0 ? Number(rounds[rounds.length - 1].round) || 0 : 0;
  return last + 1;
}

// progressWords: the engine's progress MESSAGE for the status line: without the run's own
// label and without 'round N of M · ' (the badge and the entry say the round); ROUND: the
// round the message names, when it starts with one (pause.lua progress :1490)
export function progressWords(message: string, label: string): { text: string; round?: number } {
  const named = /^round (\d+)/.exec(message);
  const lead = `${label} · `;
  let text = message.startsWith(lead) ? message.slice(lead.length) : message;
  text = text.replace(/^round \d+ of \d+ · /, '');
  return named ? { text, round: Number(named[1]) } : { text };
}

// runningLabel: the pressed row's label, trimmed; its choice when the label is blank
export function runningLabel(row: PauseRow): string {
  const label = row.label.trim();
  return label !== '' ? label : row.choice;
}

// acted: a key's action, a throw or a rejection told as the footer's notice (never silent)
export async function acted(act: () => Promise<true | string> | true | string, key: string): Promise<true | string> {
  try {
    return await act();
  } catch (e) {
    return `${key}: ${errorMessage(e)}`;
  }
}
