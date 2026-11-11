// The plan verbs' words, durandal.nvim's verbatim (plans.lua, ghosts.lua). No vscode import.
import type { ErrandResult, FileItem, StepResult } from '../protocol';
import type { Verb } from './blocks';

const num = (v: unknown): number => (typeof v === 'number' && Number.isFinite(v) ? v : 0);
const cost = (r: ErrandResult): string => (typeof r.cost === 'number' ? ` · $${r.cost}` : '');

// the pending mark at a running row's end
export const PENDING: Record<Verb, string> = { ask: ' ⋯ asking', validate: ' ⋯ validating', do: ' ⋯ doing' };

export const RUNNING_HERE = 'plans: a request is already running on this line';
export const NOTHING_RUNNING = 'plans: nothing is running';
export const CANCELLED_WORD = 'cancelled';
export const NO_PLAN = 'open a plan of an Olifant project first';
export const NO_FILES = 'plans: no files';
export const NO_NEW_STEP = 'no new step here';
export const EXCERPT_NOTHING = 'excerpt: nothing to show here';
export const TOGGLE_NOTHING = 'toggle: nothing to change here';
export const TOGGLE_NO_STEP = 'toggle: not on a step';
export const PLAN_CHANGED = ' · plan changed, press again';
export const NOT_APPLIED = 'VS Code did not apply the edit';

// a disabled excerpt or toggle action's reason, as said
export const excerptWord = (reason: string): string => `excerpt: ${reason}`;
export const toggleWord = (reason: string): string => `toggle: ${reason}`;

export const nothingBack = (verb: Verb): string => `${verb}: nothing came back`;

// doWord: a do that ends in a review (a git project)
export function doWord(r: ErrandResult): string {
  const n = Array.isArray(r.changed) ? r.changed.length : 0;
  return `do: ${n} ${n === 1 ? 'file' : 'files'} changed · to review · ${num(r.seconds)} s${cost(r)}`;
}

// landedWord: any other landing; LINES the blocks' lines, not found the dropped and unresolved
export const landedWord = (verb: Verb, lines: number, r: ErrandResult): string =>
  `${verb}: ${lines} lines · ${num(r.dropped) + num(r.unresolved)} not found · ${num(r.seconds)} s${cost(r)}`;

// promptWord: the blocks waiting beside the plan
export const promptWord = (verb: Verb, lines: number, blocks: number): string => `${verb}: ${lines} lines in ${blocks} blocks`;

export const testsWord = (r: StepResult): string =>
  `tests: ${num(r.passed)} passed · ${num(r.failed)} failed · ${num(r.seconds)} s`;

// fileItem: a files answer's item in the pick: "section · text", and where it opens
export function fileItem(it: FileItem): { label: string; detail: string } {
  const detail = typeof it.file === 'string' ? `${it.file}:${typeof it.line === 'number' ? it.line : 1}` : `line ${it.row + 1}`;
  return { label: `${it.section} · ${it.text}`, detail };
}

// STUBBED: a step's stub saved no name to say (the server answered none)
export const STUBBED = 'stubbed';
