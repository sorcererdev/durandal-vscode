import { basename } from 'node:path';
import type { TestsRunResult } from '../protocol';

// results: a test run's answer as durandal.nvim's results split says it (test.lua :70-118),
// its one-line summary, and the marks it leaves (test.lua :199-217). Spec §3.

export const RESULTS_PATH = 'tests/results.txt';

const SEP = ' · ';
const seconds = (s: number) => `${(Number(s) || 0).toFixed(1)} s`;
// the framework's colour codes (pytest runs without a tty; another runner may not)
const COLOURS = new RegExp(`${String.fromCharCode(27)}\\[[\\d;]*m`, 'g');

// lines: s split on newlines without colour codes; empty lines at either end dropped (vim.split's trimempty)
function lines(s: string | null | undefined): string[] {
  const out = (s ?? '').replace(COLOURS, '').split('\n');
  while (out.length > 0 && out[0] === '') out.shift();
  while (out.length > 0 && out[out.length - 1] === '') out.pop();
  return out;
}

// nameOf: a test id's name (src/a__test.py::test_f → test_f)
export function nameOf(id: string): string {
  const i = id.indexOf('::');
  return i < 0 ? id : id.slice(i + 2);
}

export function summaryOf(a: TestsRunResult): string {
  if (a.broken) return `broken: ${lines(a.broken)[0] ?? ''}`;
  const passed = a.passed.length;
  if (a.failed.length === 0) return `${passed === 0 ? 'no tests ran' : `all ${passed} passed`}${SEP}${seconds(a.seconds)}`;
  return `${passed} passed${SEP}${a.failed.length} failed${SEP}${seconds(a.seconds)}`;
}

// isGreen: nothing broken, nothing failed, something passed (the re-mutate's trigger, test.lua :232)
export const isGreen = (a: TestsRunResult): boolean => !a.broken && a.failed.length === 0 && a.passed.length > 0;
export const levelOf = (a: TestsRunResult): 'info' | 'warn' => (isGreen(a) ? 'info' : 'warn');
// worthOpening: the document opens beside when there is something to read
export const worthOpening = (a: TestsRunResult): boolean => !!a.broken || a.failed.length > 0;

// Link: the document's line (0-based) of a failure's ✗ row, and where it points (target 1-based)
export interface Link { line: number; file: string; target: number }

export function render(a: TestsRunResult): { text: string; links: Link[] } {
  const out: string[] = [];
  const links: Link[] = [];
  if (a.broken) {
    const why = lines(a.broken);
    out.push(`broken: ${why[0] ?? ''}`);
    for (const l of why.slice(1)) out.push(`  ${l}`);
    return { text: out.join('\n') + '\n', links };
  }
  out.push(summaryOf(a));
  for (const f of a.failed) {
    out.push('');
    const file = f.file || a.file;
    if (f.line !== null) links.push({ line: out.length, file, target: f.line });
    out.push(`✗ ${nameOf(f.id)}${f.line !== null ? `  (${basename(file)}:${f.line})` : ''}`);
    for (const l of lines(f.message)) out.push(`  ${l}`);
    for (const l of lines(f.output)) out.push(`    ${l}`);
  }
  return { text: out.join('\n') + '\n', links };
}

// Mark: an error a run leaves (line 0-based)
export interface Mark { file: string; line: number; message: string }

// marksOf: each failure with a line, in its own file; a broken run of a file, only line 0 of its
// file (spec §3); a broken run of the project's says why in the results only
export function marksOf(a: TestsRunResult): Mark[] {
  if (a.broken) return a.scope === 'all' ? [] : [{ file: a.file, line: 0, message: lines(a.broken).join('\n') }];
  const out: Mark[] = [];
  for (const f of a.failed) {
    if (f.line === null) continue;
    out.push({ file: f.file || a.file, line: f.line - 1, message: lines(f.message).join('\n') || `✗ ${nameOf(f.id)}` });
  }
  return out;
}
