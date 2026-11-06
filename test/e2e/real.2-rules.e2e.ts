import * as assert from 'node:assert/strict';
import * as vscode from 'vscode';
import { file, open, revert, running, until } from './helpers';

const COMMAND = 'src/bistro/booking/commands/create_booking.py';
const codeOf = (d: vscode.Diagnostic) =>
  typeof d.code === 'object' && d.code !== null ? String(d.code.value) : String(d.code);
const cancelled = (err: unknown) => err instanceof Error && err.name === 'Canceled';

// finding adds a sqlite3 import to a command (unsaved) and waits for the rule's diagnostic.
async function finding(project: string) {
  const ed = await open(file(`${project}/${COMMAND}`));
  await running();
  await ed.edit(b => b.insert(new vscode.Position(0, 0), 'import sqlite3\n'));
  const d = await until(() => vscode.languages.getDiagnostics(ed.document.uri)
    .find(x => x.source === 'olifant' && codeOf(x) === 'commands-use-ports'), `the commands-use-ports finding in ${project}`, 90_000);
  return { ed, d };
}

describe('rules (olifant lsp)', () => {
  it('a rule finding is a diagnostic, with its quick fixes', async () => {
    const { ed, d } = await finding('py');
    assert.equal(d.severity, vscode.DiagnosticSeverity.Warning);
    assert.equal(d.range.start.line, 0);
    const titles = await until(async () => {
      // VS Code's own side can cancel a provider call (seen once in ~20 runs): ask again
      const acts = await vscode.commands.executeCommand<vscode.CodeAction[]>(
        'vscode.executeCodeActionProvider', ed.document.uri, d.range, vscode.CodeActionKind.QuickFix.value)
        .then(x => x, (err: unknown) => { if (cancelled(err)) return undefined; throw err; });
      const ts = (acts ?? []).map(a => a.title);
      return ts.some(t => t.includes('Use an existing port')) ? ts : undefined;
    }, 'the quick fixes', 60_000);
    assert.ok(titles.some(t => t.includes('Add a repository')), titles.join(' | '));
    await revert(ed.document);
  });

  it('the other project in the window gets its own finding', async () => {
    const { ed } = await finding('py2');
    await revert(ed.document);
  });
});
