import { existsSync, readFileSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import * as vscode from 'vscode';
import type { Api } from '../../src/extension';

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
