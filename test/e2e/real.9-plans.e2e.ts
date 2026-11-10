import * as assert from 'node:assert/strict';
import { mkdirSync, rmSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import * as vscode from 'vscode';
import { DidChangeWatchedFilesNotification, FileChangeType } from 'vscode-languageserver-protocol';
import { lineTokens } from '../../src/plans/reading';
import { api, file, open, running, until, ws } from './helpers';

// The plans reading layer against olifant lsp at .olifant-ref (python-htmx): the six-modifier
// legend arrives and decodes, a ticked step and an excerpt fold and close on entry. A frozen
// excerpt (" · done"), so no reconcile rewrites it.
const PLAN = 'py/plans/m6a.md';
const TEXT = [
  '- [x] book a table',                                                          // 0
  '  - 25 Oct 21:31 · did it',                                                   // 1
  '- [ ] show the code',                                                         // 2
  '  ```python @src/bistro/booking/commands/create_booking.py:CreateBooking · done', // 3
  '  ```',                                                                       // 4
  '',
].join('\n');

describe('the plans reading layer against olifant lsp (python-htmx)', () => {
  before(async () => {
    await vscode.commands.executeCommand('workbench.action.closeAllGroups');
    await vscode.workspace.getConfiguration('editor').update('semanticHighlighting.enabled', true, vscode.ConfigurationTarget.Global);
  });

  after(async () => {
    await vscode.commands.executeCommand('workbench.action.closeAllEditors');
    await vscode.workspace.getConfiguration('editor').update('semanticHighlighting.enabled', undefined, vscode.ConfigurationTarget.Global);
    const path = join(ws(), PLAN);
    rmSync(path, { force: true });
    // tell the server, as the language client would: it keeps its file listing until it hears of a change
    await (await api()).server.notify(DidChangeWatchedFilesNotification.type,
      { changes: [{ uri: vscode.Uri.file(path).toString(), type: FileChangeType.Deleted }] });
  });

  it('the legend has six modifiers; the plan\'s tokens decode; a ticked step and an excerpt fold, closed on entry', async () => {
    const a = await running();
    const legend = a.server.client()!.initializeResult!.capabilities.semanticTokensProvider!.legend;
    assert.deepEqual(legend.tokenModifiers, ['done', 'stale', 'notFound', 'checked', 'wrong', 'resolved']);
    mkdirSync(join(ws(), 'py/plans'), { recursive: true });
    writeFileSync(join(ws(), PLAN), TEXT);
    const ed = await open(file(PLAN));
    const uri = ed.document.uri.toString();
    await until(() => a.planView.reading(uri)?.tokens?.version === ed.document.version || undefined, 'the tokens', 60_000);
    const row0 = lineTokens(a.planView.reading(uri)!.tokens!.toks, 0).map(t => t.type);
    assert.ok(row0.includes('planMarker') && row0.includes('planStepDone'), row0.join(' '));
    await until(() => a.planView.reading(uri)?.folds?.version === ed.document.version || undefined, 'the folds', 60_000);
    const folds = a.planView.reading(uri)!.folds!.ranges.map(f => `${f.start}-${f.end}`).sort();
    assert.ok(folds.includes('0-1') && folds.includes('3-4'), folds.join(' '));
    await until(() => a.planView.entered(uri), 'entered', 30_000);
    const shown = (row: number) => ed.visibleRanges.some(r => r.start.line <= row && row <= r.end.line);
    await until(() => (!shown(1) && !shown(4)) || undefined, 'rows 1 and 4 folded');
    assert.ok(shown(0) && shown(2) && shown(3));
  });
});
