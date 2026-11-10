import { execFileSync } from 'node:child_process';
import { existsSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { DidChangeWatchedFilesNotification, FileChangeType } from 'vscode-languageserver-protocol';
import * as vscode from 'vscode';
import type { Api } from '../../src/extension';
import { tabsUnder } from '../../src/virtualDocs';

export { tabsUnder };

export const ws = () => process.env.DURANDAL_E2E_WS!;
export const file = (rel: string) => vscode.Uri.file(join(ws(), rel));
// disk is a workspace file's text on disk (not VS Code's document).
export const disk = (rel: string) => readFileSync(join(ws(), rel), 'utf8');

export async function api(): Promise<Api> {
  const ext = vscode.extensions.getExtension<Api>('sorcererdev.durandal');
  if (!ext) throw new Error('extension sorcererdev.durandal is not loaded');
  return ext.activate();
}

// until polls f every 100 ms until it is truthy or the timeout passes.
export async function until<T>(f: () => Promise<T> | T, what: string, ms = 20_000): Promise<NonNullable<T>> {
  const end = Date.now() + ms;
  for (;;) {
    const v = await f();
    if (v) return v as NonNullable<T>;
    if (Date.now() > end) throw new Error(`timed out waiting for ${what}`);
    await new Promise(r => setTimeout(r, 100));
  }
}

export const sleep = (ms: number) => new Promise(r => setTimeout(r, ms));

// cleanTold runs `git clean -fdq` in cwd and tells the server what it removed, as the language
// client would (workspace/didChangeWatchedFiles, deleted). olifant lists a project's files once
// per change it hears of and keeps the listing (a save lists them again); VS Code's watcher can
// report a delete made behind its back a minute late, and a request sent before then is
// answered from a listing that still holds the removed files.
export async function cleanTold(a: Api, cwd: string): Promise<void> {
  const removed = execFileSync('git', ['clean', '-nd'], { cwd, encoding: 'utf8' })
    .split('\n').map(l => /^Would remove (.+?)\/?$/.exec(l)?.[1]).filter((p): p is string => !!p);
  execFileSync('git', ['clean', '-fdq'], { cwd });
  if (removed.length === 0) return;
  await a.server.notify(DidChangeWatchedFilesNotification.type,
    { changes: removed.map(p => ({ uri: vscode.Uri.file(join(cwd, p)).toString(), type: FileChangeType.Deleted })) });
}

export async function running(): Promise<Api> {
  const a = await api();
  await until(() => a.server.state() === 'running', 'olifant lsp running', 60_000);
  return a;
}

export async function restart(): Promise<Api> {
  await vscode.commands.executeCommand('durandal.restartServer');
  return running();
}

export async function open(uri: vscode.Uri): Promise<vscode.TextEditor> {
  return vscode.window.showTextDocument(await vscode.workspace.openTextDocument(uri));
}

// revert drops a document's unsaved edits (the command works on the active editor).
export async function revert(doc: vscode.TextDocument): Promise<void> {
  await vscode.window.showTextDocument(doc);
  await vscode.commands.executeCommand('workbench.action.files.revert');
}

// docOf is the open document of a workspace file, if any.
export const docOf = (rel: string) => vscode.workspace.textDocuments.find(d => d.uri.toString() === file(rel).toString());

// settle puts rel back to text on disk (null: no file) and waits until an open document of it
// reads the same. Before a delete, an open document is reverted and emptied and its tabs are
// closed: VS Code may keep the document, and a later create of rel must not land on old text.
export async function settle(rel: string, text: string | null): Promise<void> {
  const p = join(ws(), rel);
  const d = docOf(rel);
  if (text === null && d) {
    if (d.isDirty) await revert(d);
    await settle(rel, '');
    const tabs = vscode.window.tabGroups.all.flatMap(g => g.tabs)
      .filter(t => t.input instanceof vscode.TabInputText && t.input.uri.toString() === file(rel).toString());
    if (tabs.length > 0) await vscode.window.tabGroups.close(tabs);
  }
  if (text === null) rmSync(p, { force: true });
  else writeFileSync(p, text);
  if (d && text !== null) {
    // the file watcher can take seconds to report a write right after a save: revert reloads now
    await revert(d);
    await until(() => docOf(rel)?.getText() === text && !docOf(rel)!.isDirty, `${rel} reloaded`);
  }
}

// Msg is one message the fake server received.
// eslint-disable-next-line @typescript-eslint/no-explicit-any
export type Msg = { id?: string | number; method?: string; params?: any; result?: any };

export function log(): Msg[] {
  const p = process.env.FAKE_LSP_LOG!;
  if (!existsSync(p)) return [];
  return readFileSync(p, 'utf8').split('\n').filter(l => l !== '').map(l => JSON.parse(l) as Msg);
}

// reply sets the fake's answer to a request method.
export function reply(method: string, value: unknown): void {
  writeFileSync(join(process.env.FAKE_LSP_REPLIES!, `${method.replace(/\//g, '_')}.json`), JSON.stringify(value));
}

// added are the folders the client added, in order, from msgs (default: the whole log).
export function added(msgs: Msg[] = log()): string[] {
  return msgs.filter(m => m.method === 'workspace/didChangeWorkspaceFolders')
    .flatMap(m => (m.params.event.added as { uri: string }[]).map(f => f.uri));
}

export const count = (method: string) => log().filter(m => m.method === method).length;

// actionLog is the action log's lines ($DURANDAL_LOG_DIR/actions.jsonl), oldest first.
export function actionLog(): Record<string, unknown>[] {
  const p = join(process.env.DURANDAL_LOG_DIR!, 'actions.jsonl');
  if (!existsSync(p)) return [];
  return readFileSync(p, 'utf8').split('\n').filter(l => l !== '').map(l => JSON.parse(l) as Record<string, unknown>);
}
