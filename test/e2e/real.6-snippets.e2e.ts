import * as assert from 'node:assert/strict';
import { execFileSync } from 'node:child_process';
import { join } from 'node:path';
import * as vscode from 'vscode';
import { file, open, revert, running, sleep, until, ws } from './helpers';

const BOOKING = 'py/src/bistro/booking/commands/create_booking.py';

// durandal.nvim tests/e2e_python_spec.lua :167-203, the first half: a blank line under the
// last failure → the failure-variant ghost → Tab → `class Name:` (or the model's name). CI has
// no model and no [fills]: the holes are filled, or left intact.
describe('ghost text against olifant lsp (python-htmx)', () => {
  afterEach(async () => {
    const d = vscode.workspace.textDocuments.find(x => x.uri.toString() === file(BOOKING).toString());
    if (d?.isDirty) await revert(d);
    execFileSync('git', ['checkout', '--', '.'], { cwd: join(ws(), 'py') });
  });

  it('a blank line under the last failure: the failure ghost, committed, filled or left', async () => {
    const ed = await open(file(BOOKING));
    const a = await running();
    const lines = ed.document.getText().split('\n');
    const cls = lines.findIndex(l => l.includes('class TableNotFound'));
    assert.ok(cls >= 0, 'create_booking.py has class TableNotFound');
    // `o` below its `reason: str`: a new blank line
    await ed.edit(b => b.insert(ed.document.lineAt(cls + 1).range.end, '\n'));
    const at = new vscode.Position(cls + 2, 0);
    ed.selection = new vscode.Selection(at, at);
    await until(async () => {
      await vscode.commands.executeCommand('editor.action.inlineSuggest.trigger');
      await sleep(1000);
      return a.suggest.state(ed.document.uri.toString())?.kind === 'snippet';
    }, 'the failure-variant ghost', 120_000);
    const fills = a.suggest.fills.length;
    await vscode.commands.executeCommand('editor.action.inlineSuggest.commit');
    await until(() => a.suggest.fills.length > fills, 'the fill', 120_000);
    const out = a.suggest.fills.at(-1);
    assert.ok(out === 'filled' || out === 'same', `fill: ${out}`);
    // The pinned snippet body starts with blank lines and `@dataclass(frozen=True)`, so the
    // class row is the first one after the inserted blank line that matches.
    const all = ed.document.getText().split('\n');
    const row = all.findIndex((l, i) => i > cls + 1 && /^class \w+:$/.test(l));
    console.log(`py ghost committed: ${row >= 0 ? all[row] : '(no class row)'} at ${row} (${out})`);
    assert.ok(row >= 0, `a class row after line ${cls + 1}`);
    assert.match(all[row], /^class \w+:$/);
  });
});
