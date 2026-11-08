import * as assert from 'node:assert/strict';
import { execFileSync } from 'node:child_process';
import { readFileSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import * as vscode from 'vscode';
import { FakeUi } from '../fakeUi';
import { file, open, revert, running, until, ws } from './helpers';

const BOOKING = 'py/src/bistro/booking/commands/create_booking.py';
const FAILURES = 'py/src/bistro/web/bookings/failures.py';
const CLOSE = 'py/src/bistro/booking/commands/close_table.py';

// durandal.nvim tests/e2e_python_spec.lua :167-222, the second half: a failure class named
// Cancelled → the failure-arms follow-up → review → Apply (plan{fill:true}) → the arm written.
// CI has no model: the arm's body may be a hole; the case and the union member are asserted.
describe('follow-ups against olifant lsp (python-htmx)', () => {
  afterEach(async () => {
    (await running()).setUi(undefined);
    for (const rel of [BOOKING, FAILURES, CLOSE]) {
      const d = vscode.workspace.textDocuments.find(x => x.uri.toString() === file(rel).toString());
      if (d?.isDirty) await revert(d);
    }
    execFileSync('git', ['checkout', '--', '.'], { cwd: join(ws(), 'py') });
    execFileSync('git', ['clean', '-fdq'], { cwd: join(ws(), 'py') });
  });

  it('class Cancelled → the failure-arms follow-up → review → apply', async function () {
    this.timeout(600_000);
    const ed = await open(file(BOOKING));
    const a = await running();
    const lines = ed.document.getText().split('\n');
    const cls = lines.findIndex(l => l.includes('class TableNotFound'));
    assert.ok(cls >= 0);
    // a new failure after the last one, as the snippet ghost and its Name tab stop leave it
    await ed.edit(b => b.insert(ed.document.lineAt(cls + 1).range.end,
      '\n\n\n@dataclass(frozen=True)\nclass Cancelled:\n    reason: str'));
    const row = cls + 5;
    assert.equal(ed.document.lineAt(row - 1).text, '@dataclass(frozen=True)');
    assert.equal(ed.document.lineAt(row).text, 'class Cancelled:');
    const at = new vscode.Position(row, 8);
    // nudge the controller once, as nvim's settle() does (a cursor move on the line), then
    // wait without moving: each move re-schedules and cancels the olifant/suggest or
    // olifant/plan in flight, which a cold olifant would never get to answer
    ed.selection = new vscode.Selection(at.translate(0, 1), at.translate(0, 1));
    ed.selection = new vscode.Selection(at, at);
    await until(() => a.suggest.state(ed.document.uri.toString())?.kind === 'followup',
      'the failure-arms follow-up', 180_000);
    const st = a.suggest.state(ed.document.uri.toString())!;
    console.log(`py then: ⚡ Tab: review ${st.name} (${st.summary})`);
    const ui = new FakeUi();
    ui.onReview = () => ({ kind: 'apply' });
    a.setUi(ui);
    await vscode.commands.executeCommand('durandal.suggest.accept');
    const failures = await until(() => {
      const t = readFileSync(join(ws(), FAILURES), 'utf8');
      return /case create_booking\.Cancelled\(\):/.test(t) ? t : undefined;
    }, 'the arm written', 240_000);
    console.log(`py arm: ${/case create_booking\.Cancelled\(\):\n\s+return ([^\n]+)/.exec(failures)?.[1]}`);
    // the open file was dirty (the typed class), so the union member lands in its buffer, unsaved
    assert.ok(ed.document.getText().includes('| Cancelled'), 'the union names Cancelled');
  });

  // durandal.nvim tests/e2e_python_spec.lua :131 (its first recognised() call): a command
  // written by hand in commands/ is recognised as a command. Only the recognition is asserted:
  // applying it needs the model.
  it('a hand-written command in commands/ is recognised as a command', async () => {
    writeFileSync(join(ws(), CLOSE), [
      'class CloseTable:',
      '    def __init__(self, repo):',
      '        self.repo = repo',
      '',
      '    def run(self, table_id):',
      '        table = self.repo.table(table_id)',
      '        self.repo.save(table)',
      '',
    ].join('\n'));
    const ed = await open(file(CLOSE));
    const a = await running();
    const at = new vscode.Position(0, 0);
    // one nudge (off the class line and back), then wait without moving (see the first case)
    ed.selection = new vscode.Selection(at.translate(1, 0), at.translate(1, 0));
    ed.selection = new vscode.Selection(at, at);
    await until(() => a.suggest.state(ed.document.uri.toString())?.kind === 'recognition',
      'the recognition', 120_000);
    const st = a.suggest.state(ed.document.uri.toString())!;
    console.log(`py recognition: ${st.label} — ${st.summary ?? ''}`);
    assert.equal(st.label, 'This looks like a command (Close Table)');
  });
});
