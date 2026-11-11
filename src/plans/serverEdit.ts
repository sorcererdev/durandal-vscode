import type { WorkspaceEdit } from 'vscode-languageserver-protocol';
import { applyServerEdit } from '../applyEdit';
import { NOT_RUNNING, Say, Server } from '../server';
import { NOT_APPLIED } from './words';

export interface EditDeps { server: Server; say: Say }

// EditWord: applyServerEdit's notice, from the files saved, not saved, and kept unsaved
export type EditWord = (saved: string[], unsaved: string[], kept: string[]) => string | undefined;

// applyPlanEdit: a server's edit (a plan action's, a stub's) landed as every server edit lands,
// refused whole if stale; its notice said as info, a failure as an error. True when applied.
// WORD: the notice (default: applyServerEdit's, from LABEL).
export async function applyPlanEdit(d: EditDeps, label: string, edit: WorkspaceEdit, word?: EditWord): Promise<boolean> {
  const lc = d.server.client();
  if (!lc) {
    void d.say('error', NOT_RUNNING);
    return false;
  }
  const done = await applyServerEdit(lc, { label, edit }, t => void d.say('info', t), word);
  if (!done.applied) void d.say('error', done.failureReason ?? NOT_APPLIED);
  return done.applied;
}
