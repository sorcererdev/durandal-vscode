import * as vscode from 'vscode';
import type { MutateResult, Survivor, TestsRunResult } from '../protocol';
import { markText, SurvivorMemory } from './memory';
import { marksOf } from './results';

// a diagnostic over its whole line (VS Code clamps the end to the line's length)
const FULL = 10_000;
const wholeLine = (n: number) => new vscode.Range(n, 0, n, FULL);

// Marks are the tests' and mutate's diagnostics (durandal.nvim's durandal_tests and
// durandal_mutate namespaces), source olifant. The tests' errors are cleared at each run. The
// mutate warnings stay per document until replaced, waived, or the document closes; edits
// move them (memory.shift).
export class Marks {
  readonly memory = new SurvivorMemory();
  private readonly tests = vscode.languages.createDiagnosticCollection('durandal tests');
  private readonly mutate = vscode.languages.createDiagnosticCollection('durandal mutate');
  private readonly shifted = new vscode.EventEmitter<{ uri: vscode.Uri; changes: readonly vscode.TextDocumentContentChangeEvent[] }>();
  // onDidShift: a document with survivors changed, after its survivors followed the edit (the
  // open survivors picker follows it too, F5)
  readonly onDidShift = this.shifted.event;

  register(context: vscode.ExtensionContext): void {
    context.subscriptions.push(
      this.tests,
      this.mutate,
      this.shifted,
      vscode.workspace.onDidCloseTextDocument(d => this.forget(d.uri)),
      vscode.workspace.onDidChangeTextDocument(e => {
        const uri = e.document.uri.toString();
        if (e.contentChanges.length === 0 || this.memory.survivors(uri).length === 0) return;
        let moved = false;
        for (const c of e.contentChanges) {
          const r = c.range;
          moved = this.memory.shift(uri, r.start.line, r.start.character, r.end.line, c.text.split('\n').length - 1) || moved;
        }
        if (moved) this.draw(e.document.uri);
        this.shifted.fire({ uri: e.document.uri, changes: e.contentChanges });
      }),
    );
  }

  clearTests(): void {
    this.tests.clear();
  }

  setTests(a: TestsRunResult): void {
    this.tests.clear();
    const by = new Map<string, vscode.Diagnostic[]>();
    for (const m of marksOf(a)) {
      const d = new vscode.Diagnostic(wholeLine(m.line), m.message, vscode.DiagnosticSeverity.Error);
      d.source = 'olifant';
      const k = vscode.Uri.file(m.file).toString();
      by.set(k, [...(by.get(k) ?? []), d]);
    }
    for (const [k, ds] of by) this.tests.set(vscode.Uri.parse(k), ds);
  }

  setMutate(uri: vscode.Uri, a: MutateResult): void {
    this.memory.replace(uri.toString(), a);
    this.draw(uri);
  }

  unmark(uri: vscode.Uri, s: Survivor): void {
    this.memory.remove(uri.toString(), s);
    this.draw(uri);
  }

  forget(uri: vscode.Uri): void {
    this.memory.forget(uri.toString());
    this.mutate.delete(uri);
  }

  private draw(uri: vscode.Uri): void {
    this.mutate.set(uri, this.memory.survivors(uri.toString()).map(s => {
      const d = new vscode.Diagnostic(wholeLine(s.line - 1), markText(s), vscode.DiagnosticSeverity.Warning);
      d.source = 'olifant';
      return d;
    }));
  }
}
