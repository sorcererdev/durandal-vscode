import * as vscode from 'vscode';
import { Olifant, TestsRunParams, TestsRunResult } from '../protocol';
import { NOT_RUNNING, Say, Server } from '../server';
import { DOC_SCHEME, tabsUnder, VirtualDocs } from '../virtualDocs';
import { here, NO_FILE, TddFlights, withCancel } from './common';
import { settle } from './flights';
import type { Marks } from './marks';
import { isGreen, levelOf, Link, render, RESULTS_PATH, summaryOf, worthOpening } from './results';

export type Scope = 'here' | 'file' | 'all';

export interface TestsDeps {
  server: Server; docs: VirtualDocs; say: Say; marks: Marks; flights: TddFlights;
  // the re-mutate after a green run of the tests of uri (spec §5)
  recheck(uri: string): void;
}

// Tests: the three runs (durandal.nvim test.lua), the results document and its links (spec §3).
// A new run cancels the one in the air; nothing is saved first (the server runs over the
// editor's text).
export class Tests implements vscode.DocumentLinkProvider {
  last: TestsRunResult | undefined;
  private lastParams: TestsRunParams | undefined;
  private links: Link[] = [];

  constructor(private readonly d: TestsDeps) {}

  register(context: vscode.ExtensionContext): void {
    context.subscriptions.push(
      vscode.commands.registerCommand('durandal.test.here', () => this.run('here')),
      vscode.commands.registerCommand('durandal.test.file', () => this.run('file')),
      vscode.commands.registerCommand('durandal.test.all', () => this.run('all')),
      vscode.languages.registerDocumentLinkProvider({ scheme: DOC_SCHEME }, this),
    );
  }

  private get resultsUri(): vscode.Uri {
    return this.d.docs.uri(RESULTS_PATH);
  }

  provideDocumentLinks(doc: vscode.TextDocument): vscode.DocumentLink[] {
    if (doc.uri.toString() !== this.resultsUri.toString()) return [];
    return this.links.filter(l => l.line < doc.lineCount).map(l => {
      const link = new vscode.DocumentLink(doc.lineAt(l.line).range, vscode.Uri.file(l.file).with({ fragment: `L${l.target}` }));
      link.tooltip = `${l.file}:${l.target}`;
      return link;
    });
  }

  // params: the active file with the cursor (here) or the scope; from the results document, the
  // last run's again (test.lua :245)
  private params(scope: Scope): TestsRunParams | string {
    const doc = vscode.window.activeTextEditor?.document;
    if (doc && doc.uri.toString() === this.resultsUri.toString()) {
      return this.lastParams ?? 'no tests have run yet: run them from a module or a test file';
    }
    const h = here();
    if (!h) return NO_FILE;
    const p: TestsRunParams = { textDocument: { uri: h.uri } };
    if (scope === 'here') p.position = h.position;
    else p.scope = scope;
    return p;
  }

  async run(scope: Scope): Promise<void> {
    const p = this.params(scope);
    if (typeof p === 'string') {
      void this.d.say('error', p);
      return;
    }
    if (!this.d.server.client()) {
      void this.d.say('error', NOT_RUNNING);
      return;
    }
    this.lastParams = p;
    const f = this.d.flights.start('test', true);
    this.d.marks.clearTests();
    const o = await withCancel('Durandal: testing…', f,
      () => settle(f, this.d.server.request(Olifant.testsRun, p, f.token), Olifant.testsRun.method));
    // superseded, stopped, or a Cancel click (silent for a run, plan decision 12)
    if (o.kind === 'cancelled') return;
    if (o.kind === 'error') {
      void this.d.say('error', o.message);
      return;
    }
    const a = o.value;
    this.show(a, worthOpening(a));
    void this.d.say(levelOf(a), summaryOf(a));
    if (p.scope !== 'all' && isGreen(a)) this.d.recheck(p.textDocument.uri);
  }

  // show: the answer's marks and the results document, refreshed in place; opened beside (focus
  // stays) when asked, in the tab it already has if it has one
  show(a: TestsRunResult, open: boolean): void {
    this.last = a;
    this.d.marks.setTests(a);
    const r = render(a);
    this.links = r.links;
    const uri = this.d.docs.set(RESULTS_PATH, r.text);
    if (!open) return;
    const tab = tabsUnder(this.resultsUri.path)[0];
    const column = tab ? vscode.window.tabGroups.all.find(g => g.tabs.includes(tab))?.viewColumn : undefined;
    void vscode.window.showTextDocument(uri, { viewColumn: column ?? vscode.ViewColumn.Beside, preserveFocus: true, preview: true });
  }
}
