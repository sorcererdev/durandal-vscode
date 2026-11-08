import { relative } from 'node:path';
import * as vscode from 'vscode';
import { errorMessage } from '../errors';
import { Olifant, TestsFileResult } from '../protocol';
import { findRoot } from '../root';
import type { Say, Server } from '../server';
import { here, NO_FILE } from './common';

const STUB_CHORD = process.platform === 'darwin' ? '⌘⌥D S' : '⌃⌥D S';

// Jump: between a module and its test file (durandal.nvim jump.lua), in the active column. A
// test file not there yet opens as an untitled document at its path: its first save writes it.
export class Jump {
  constructor(private readonly d: { server: Server; say: Say }) {}

  register(context: vscode.ExtensionContext): void {
    context.subscriptions.push(vscode.commands.registerCommand('durandal.jump', () => this.run()));
  }

  async run(): Promise<void> {
    const h = here();
    if (!h) {
      void this.d.say('error', NO_FILE);
      return;
    }
    let r: TestsFileResult | null;
    try {
      r = await this.d.server.request(Olifant.testsFile, { textDocument: { uri: h.uri } });
    } catch (err) {
      void this.d.say('error', errorMessage(err));
      return;
    }
    if (!r || typeof r.file !== 'string') {
      void this.d.say('error', `${Olifant.testsFile.method} answered nothing`);
      return;
    }
    const target = vscode.Uri.file(r.file);
    if (r.exists) {
      await vscode.window.showTextDocument(target, { viewColumn: h.editor.viewColumn, preview: false });
      return;
    }
    const doc = await vscode.workspace.openTextDocument(target.with({ scheme: 'untitled' }));
    await vscode.window.showTextDocument(doc, { viewColumn: h.editor.viewColumn, preview: false });
    const root = await findRoot(r.file);
    void this.d.say('info', `new test file: ${root ? relative(root, r.file) : r.file} — stub a test with ${STUB_CHORD}`);
  }
}
