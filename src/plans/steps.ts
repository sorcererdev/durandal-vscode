import * as vscode from 'vscode';
import type { Landed } from '../landed';
import { FileItem, Olifant, StepResult } from '../protocol';
import { Say, Server } from '../server';
import { stubWord } from '../tdd/landing';
import type { Ui } from '../uiTypes';
import { asked, runningHere } from './here';
import { writeFacts } from './lineEdits';
import type { PlanDocs } from './planDocs';
import { applyPlanEdit } from './serverEdit';
import { fileItem, NO_FILES, PLAN_CHANGED, STUBBED, testsWord } from './words';

export interface StepsDeps { server: Server; say: Say; ui: () => Ui; planDocs: PlanDocs; landed: Landed }

// PlanSteps: a plan's files, and stub and test on the step under the cursor (durandal.nvim
// plans.lua files, stub, test; M6 spec §4.4). The plan stays the active editor; the facts are
// written only when the plan is still at the version asked.
export class PlanSteps {
  constructor(private readonly d: StepsDeps) {}

  register(context: vscode.ExtensionContext): void {
    context.subscriptions.push(
      vscode.commands.registerCommand('durandal.plan.files', () => this.files()),
      vscode.commands.registerCommand('durandal.plan.stub', () => this.stub()),
      vscode.commands.registerCommand('durandal.plan.test', () => this.test()),
    );
  }

  // files: the plan's items in a pick; one opens its file at its unit, or moves to its plan row
  async files(): Promise<void> {
    const h = await runningHere(this.d);
    if (!h) return;
    const a = await asked(this.d, h, () => this.d.server.request(Olifant.plansFiles, { textDocument: { uri: h.uri } }));
    if (!a) return;
    const items: FileItem[] = Array.isArray(a.r?.items) ? a.r.items : [];
    if (items.length === 0) {
      void this.d.say('info', NO_FILES);
      return;
    }
    const it = await this.d.ui().pick<FileItem>({ title: 'plan files', items: items.map(x => ({ ...fileItem(x), value: x })) });
    if (!it) return;
    // a files item's line is a unit's line, 1-based; a plan row is 0-based
    const [uri, row] = typeof it.file === 'string'
      ? [vscode.Uri.file(it.file), Math.max((typeof it.line === 'number' ? it.line : 1) - 1, 0)]
      : [h.editor.document.uri, it.row];
    const ed = await vscode.window.showTextDocument(uri, { preview: false });
    const at = new vscode.Position(Math.max(0, Math.min(row, ed.document.lineCount - 1)), 0);
    ed.selection = new vscode.Selection(at, at);
    ed.revealRange(new vscode.Range(at, at), vscode.TextEditorRevealType.InCenterIfOutsideViewport);
  }

  // stub: a test stub for the step, saved as a stub is (M4); its test line in the plan
  async stub(): Promise<void> {
    const h = await runningHere(this.d);
    if (!h) return;
    const doc = h.editor.document;
    const tick = doc.version;
    const a = await asked(this.d, h, () => this.d.server.request(Olifant.plansStub, { textDocument: { uri: h.uri }, line: h.row }));
    if (!a) return;
    const r: StepResult | null = a.r;
    if (!r || typeof r !== 'object') return;
    const name = typeof r.name === 'string' ? r.name : undefined;
    if (r.edits) {
      const ok = await applyPlanEdit(this.d, name ? `stub ${name}` : 'stub', r.edits,
        (saved, unsaved, kept) => (name ? stubWord(name, saved, unsaved, kept) : STUBBED));
      if (!ok) return;
    } else {
      void this.d.say('info', name ? stubWord(name, [], [], []) : STUBBED);
    }
    if (!doc.isClosed && doc.version === tick && Array.isArray(r.facts)) await writeFacts(doc, r.facts);
    this.d.landed.fire('stub');
  }

  // test: the step's tests run; their facts written, or a warning when the plan moved meanwhile
  async test(): Promise<void> {
    const h = await runningHere(this.d);
    if (!h) return;
    const doc = h.editor.document;
    const tick = doc.version;
    const a = await asked(this.d, h, () => this.d.server.request(Olifant.plansTest, { textDocument: { uri: h.uri }, line: h.row }));
    if (!a) return;
    const r: StepResult | null = a.r;
    if (!r || typeof r !== 'object') return;
    const word = testsWord(r);
    if (!doc.isClosed && doc.version === tick) {
      if (Array.isArray(r.facts)) await writeFacts(doc, r.facts);
      void this.d.say('info', word);
    } else {
      void this.d.say('warn', word + PLAN_CHANGED);
    }
    this.d.landed.fire('test');
  }
}
