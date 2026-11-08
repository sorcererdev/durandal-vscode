import * as vscode from 'vscode';
import { CompletionResolveRequest } from 'vscode-languageserver-protocol';
import type { ActionLog } from '../actionLog';
import { errorMessage } from '../errors';
import type { Say, Server } from '../server';
import type { FillArgs } from './gate';
import { dataKey } from './keys';
import { spanOf } from './span';

export const FILL = 'durandal.snippet.fill';
export const CHANGED = 'holes left as they are: the text changed while the model filled';
export type FillOutcome = 'filled' | 'same' | 'changed' | 'failed';

export const fillCommand = (a: FillArgs): vscode.Command => ({ title: 'Fill holes', command: FILL, arguments: [a] });

// Fill is the model fill after a snippet was inserted (M3 spec §3.1/3.2, decision 2): VS Code
// ignores a resolve that changes the insert text, so the inserted item's command resolves it
// (olifant fills the holes on completionItem/resolve, Lsp.hs :455-462) and, if the document is
// as the insertion left it, puts the filled body over the lines the unfilled one covers.
export class Fill {
  readonly outcomes: FillOutcome[] = [];
  private readonly stashed = new Map<string, string>();

  constructor(private readonly d: { server: Server; log: ActionLog; say: Say; warn(m: string): void }) {}

  register(context: vscode.ExtensionContext): void {
    context.subscriptions.push(vscode.commands.registerCommand(FILL, (a: FillArgs) => this.run(a)));
  }

  // stash keeps a completion item's resolved body (VS Code resolves the focused item, so the
  // fill is often ready by the time Enter inserts it).
  stash(data: unknown, body: string): void {
    if (this.stashed.size > 50) this.stashed.clear();
    this.stashed.set(dataKey(data), body);
  }

  // run fills, then logs snippet-applied once the outcome is known (not for a failed fill).
  async run(a: FillArgs): Promise<FillOutcome> {
    const out = await this.fill(a);
    this.outcomes.push(out);
    if (out !== 'failed') this.d.log.write({ event: 'snippet-applied', generator: a.data.generator });
    return out;
  }

  private async fill(a: FillArgs): Promise<FillOutcome> {
    const doc = vscode.workspace.textDocuments.find(x => x.uri.toString() === a.uri);
    if (!doc) return 'failed';
    // the document as the insertion left it (nvim's changedtick, snippet.lua :10)
    const version = doc.version;
    const key = dataKey(a.data);
    let filled = this.stashed.get(key);
    this.stashed.delete(key);
    if (filled === undefined) {
      try {
        filled = await vscode.window.withProgress({ location: vscode.ProgressLocation.Window, title: 'Filling holes' }, () => this.resolve(a));
      } catch (err) {
        void this.d.say('error', errorMessage(err));
        return 'failed';
      }
    }
    if (filled === a.body) return 'same';
    if (doc.version !== version) {
      vscode.window.setStatusBarMessage(CHANGED, 5000);
      return 'changed';
    }
    const ed = vscode.window.visibleTextEditors.find(e => e.document === doc);
    if (!ed) {
      this.d.warn(`snippet fill: no editor shows ${a.uri}; holes left as they are`);
      return 'failed';
    }
    const s = spanOf(a.range.start.line, a.body);
    const end = Math.min(s.end, doc.lineCount - 1);
    const range = new vscode.Range(s.start, 0, end, doc.lineAt(end).text.length);
    if (await ed.insertSnippet(new vscode.SnippetString(filled), range)) return 'filled';
    this.d.warn('snippet fill: VS Code did not insert the filled body; holes left as they are');
    return 'failed';
  }

  private async resolve(a: FillArgs): Promise<string> {
    const r = await this.d.server.request(CompletionResolveRequest.type, {
      label: a.data.generator, data: a.data, textEdit: { range: a.range, newText: a.body },
    });
    const te = r?.textEdit;
    return te && 'newText' in te ? te.newText : a.body;
  }
}
