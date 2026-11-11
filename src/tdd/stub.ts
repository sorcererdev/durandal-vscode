import * as vscode from 'vscode';
import { applyServerEdit } from '../applyEdit';
import { errorMessage } from '../errors';
import type { Landed } from '../landed';
import { MutateSurvivor, Olifant, StubParams, StubResult } from '../protocol';
import { NOT_RUNNING, Say, Server } from '../server';
import { here, NO_FILE } from './common';
import { cursorColumn, stubWord } from './landing';
import { plainSurvivor } from './memory';

// Stub: a new test for the function at the cursor, or one that kills a survivor (durandal.nvim
// stub.lua). Its edit lands as every server edit does: refused if stale, files saved (M1's
// convention, spec §4); then the test file opens with the cursor on the test's name.
export class Stub {
  constructor(private readonly d: { server: Server; say: Say; landed: Landed }) {}

  register(context: vscode.ExtensionContext): void {
    context.subscriptions.push(vscode.commands.registerCommand('durandal.stub', () => this.run()));
  }

  async run(from?: { uri: string; survivor: MutateSurvivor }): Promise<void> {
    let params: StubParams;
    if (from) {
      params = {
        textDocument: { uri: from.uri }, position: { line: from.survivor.line - 1, character: 0 },
        survivor: plainSurvivor(from.survivor),
      };
    } else {
      const h = here();
      if (!h) {
        void this.d.say('error', NO_FILE);
        return;
      }
      params = { textDocument: { uri: h.uri }, position: h.position };
    }
    let r: StubResult | null;
    try {
      r = await this.d.server.request(Olifant.stub, params);
    } catch (err) {
      void this.d.say('error', errorMessage(err));
      return;
    }
    if (!r || typeof r.file !== 'string') {
      void this.d.say('error', `${Olifant.stub.method} answered nothing`);
      return;
    }
    const lc = this.d.server.client();
    if (!lc) {
      void this.d.say('error', NOT_RUNNING);
      return;
    }
    const name = String(r.name);
    const done = await applyServerEdit(lc, { label: `stub ${name}`, edit: r.edits },
      t => void this.d.say('info', t), (saved, unsaved, kept) => stubWord(name, saved, unsaved, kept));
    if (!done.applied) {
      void this.d.say('error', done.failureReason ?? 'VS Code did not apply the stub');
      return;
    }
    this.d.landed.fire('stub');
    const ed = await vscode.window.showTextDocument(vscode.Uri.file(r.file), { preview: false });
    const row = Math.max(0, Math.min((Number(r.line) || 1) - 1, ed.document.lineCount - 1));
    const at = new vscode.Position(row, cursorColumn(ed.document.lineAt(row).text, name));
    ed.selection = new vscode.Selection(at, at);
    ed.revealRange(new vscode.Range(at, at), vscode.TextEditorRevealType.InCenterIfOutsideViewport);
  }
}
