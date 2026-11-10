import { basename } from 'node:path';
import * as vscode from 'vscode';
import type { ApplyWorkspaceEditParams, ApplyWorkspaceEditResult, LanguageClient } from 'vscode-languageclient/node';
import { appliedMessage, editedUris, stripAnnotations, versionConflict } from './edits';
import { errorMessage } from './errors';
import { readPlansOptions } from './plans/options';
import { isPlanFile } from './root';

// key compares a server's uri with VS Code's spelling of it (encoding differs: %3A, [, ]).
const key = (uri: string) => vscode.Uri.parse(uri).toString();
const openDoc = (k: string) => vscode.workspace.textDocuments.find(d => d.uri.toString() === k);

// lock runs the server's edits one after another, whole (the library's workspaceEditLock).
let lock: Promise<unknown> = Promise.resolve();

// applyServerEdit is durandal.nvim's workspace/applyEdit: refused whole if an open document
// moved past the version the edit was made at; applied without its annotations; then each
// edited file that had no unsaved changes before, and is not a plan, is saved (as regions are
// kept on save); one notice names the files saved, and those it could not save.
// word: the one notice, from the files saved, those that could not be, and those kept unsaved
// because they had unsaved edits before (default: the label and the names; a plan says
// "Applied <name>: N files").
export function applyServerEdit(
  lc: LanguageClient, params: ApplyWorkspaceEditParams, say: (text: string) => void,
  word: (saved: string[], unsaved: string[], kept: string[]) => string | undefined = (s, u) => appliedMessage(params.label, s, u),
): Promise<ApplyWorkspaceEditResult> {
  const run = lock.then(() => applyNow(lc, params, say, word));
  lock = run.catch(() => undefined);
  return run;
}

async function applyNow(
  lc: LanguageClient, params: ApplyWorkspaceEditParams, say: (text: string) => void,
  word: (saved: string[], unsaved: string[], kept: string[]) => string | undefined,
): Promise<ApplyWorkspaceEditResult> {
  const edit = stripAnnotations(params.edit);
  let converted: vscode.WorkspaceEdit;
  try {
    converted = await lc.protocol2CodeConverter.asWorkspaceEdit(edit);
  } catch (err) {
    return { applied: false, failureReason: errorMessage(err) };
  }
  // from the version check to vscode.workspace.applyEdit, no await: typing cannot slip between
  const conflict = versionConflict(edit, uri => openDoc(key(uri))?.version);
  if (conflict) return { applied: false, failureReason: conflict };
  const targets = editedUris(edit).map(u => vscode.Uri.parse(u));
  const dirtyBefore = new Set(targets.filter(u => openDoc(u.toString())?.isDirty).map(u => u.toString()));
  let ok: boolean;
  try {
    ok = await vscode.workspace.applyEdit(converted);
  } catch (err) {
    return { applied: false, failureReason: errorMessage(err) };
  }
  if (!ok) return { applied: false, failureReason: 'VS Code did not apply the edit' };
  const saved: string[] = [];
  const unsaved: string[] = [];
  // kept: files the edit left unsaved because they had unsaved edits before
  const kept: string[] = [];
  for (const uri of targets) {
    if (uri.scheme !== 'file' || await isPlanFile(uri.fsPath, readPlansOptions().dir)) continue;
    if (dirtyBefore.has(uri.toString())) {
      kept.push(basename(uri.fsPath));
      continue;
    }
    // an edit to a file that was not open leaves it open, unsaved, in VS Code's documents
    const doc = openDoc(uri.toString()) ?? await vscode.workspace.openTextDocument(uri).then(d => d, () => undefined);
    if (!doc || !doc.isDirty) continue;
    (await doc.save() ? saved : unsaved).push(basename(uri.fsPath));
  }
  const text = word(saved, unsaved, kept);
  if (text) say(text);
  return { applied: true };
}
