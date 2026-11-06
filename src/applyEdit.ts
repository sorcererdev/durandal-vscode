import { basename } from 'node:path';
import * as vscode from 'vscode';
import type { ApplyWorkspaceEditParams, ApplyWorkspaceEditResult, LanguageClient } from 'vscode-languageclient/node';
import { appliedMessage, editedUris, stripAnnotations, versionConflict } from './edits';
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
export function applyServerEdit(
  lc: LanguageClient, params: ApplyWorkspaceEditParams, say: (text: string) => void,
): Promise<ApplyWorkspaceEditResult> {
  const run = lock.then(() => applyNow(lc, params, say));
  lock = run.catch(() => undefined);
  return run;
}

async function applyNow(
  lc: LanguageClient, params: ApplyWorkspaceEditParams, say: (text: string) => void,
): Promise<ApplyWorkspaceEditResult> {
  const edit = stripAnnotations(params.edit);
  let converted: vscode.WorkspaceEdit;
  try {
    converted = await lc.protocol2CodeConverter.asWorkspaceEdit(edit);
  } catch (err) {
    return { applied: false, failureReason: err instanceof Error ? err.message : String(err) };
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
    return { applied: false, failureReason: err instanceof Error ? err.message : String(err) };
  }
  if (!ok) return { applied: false, failureReason: 'VS Code did not apply the edit' };
  const saved: string[] = [];
  const unsaved: string[] = [];
  for (const uri of targets) {
    if (uri.scheme !== 'file' || dirtyBefore.has(uri.toString()) || await isPlanFile(uri.fsPath)) continue;
    // an edit to a file that was not open leaves it open, unsaved, in VS Code's documents
    const doc = openDoc(uri.toString()) ?? await vscode.workspace.openTextDocument(uri).then(d => d, () => undefined);
    if (!doc || !doc.isDirty) continue;
    (await doc.save() ? saved : unsaved).push(basename(uri.fsPath));
  }
  const text = appliedMessage(params.label, saved, unsaved);
  if (text) say(text);
  return { applied: true };
}
