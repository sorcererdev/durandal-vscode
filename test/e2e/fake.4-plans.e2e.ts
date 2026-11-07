import * as assert from 'node:assert/strict';
import { existsSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import * as vscode from 'vscode';
import type { WorkspaceEdit } from 'vscode-languageserver-protocol';
import type { Plan } from '../../src/protocol';
import { FakeUi } from '../fakeUi';
import { disk, file, open, revert, running, settle, tabsUnder, until, ws } from './helpers';

const R0 = { start: { line: 0, character: 0 }, end: { line: 0, character: 0 } };
const root = () => join(ws(), 'one');
const plan = (o: Partial<Plan>): Plan => ({ files: [], conflicts: [], warnings: [], holes: [], snippet: null, ...o });

// twoFiles: a plan that creates one/made.py and puts a line on top of one/other.py, and its edit.
function twoFiles(o: Partial<Plan> = {}) {
  const before = disk('one/other.py');
  return {
    before,
    plan: plan({ files: [{ path: 'made.py', before: null, after: 'made = 1\n' }, { path: 'other.py', before, after: `# planned\n${before}` }], ...o }),
    edit: { documentChanges: [
      { kind: 'create', uri: file('one/made.py').toString() },
      { textDocument: { uri: file('one/made.py').toString(), version: null }, edits: [{ range: R0, newText: 'made = 1\n' }] },
      { textDocument: { uri: file('one/other.py').toString(), version: null }, edits: [{ range: R0, newText: '# planned\n' }] },
    ] } as WorkspaceEdit,
  };
}

describe('landing a plan (fake server)', () => {
  it('lands: the new file and the edit written and saved, one notice', async () => {
    const a = await running();
    const t = twoFiles();
    const n = a.shown.length;
    assert.equal(await a.plans.land(root(), t.plan, t.edit, 'Made'), undefined);
    assert.equal(disk('one/made.py'), 'made = 1\n');
    assert.equal(disk('one/other.py'), `# planned\n${t.before}`);
    assert.deepEqual(a.shown.slice(n).map(s => s.text), ['Applied Made: 2 files']);
    await settle('one/made.py', null);
    await settle('one/other.py', t.before);
  });

  it('a file typed in since planning: nothing applied (Review Focus 2)', async () => {
    const a = await running();
    const t = twoFiles();
    const ed = await open(file('one/other.py'));
    await ed.edit(b => b.insert(new vscode.Position(0, 0), '# typed\n'));
    assert.equal(await a.plans.land(root(), t.plan, t.edit, 'Made'), 'other.py changed since planning; nothing was applied — plan again');
    assert.ok(!existsSync(join(root(), 'made.py')));
    await revert(ed.document);
  });

  it('a file the plan creates, there meanwhile: nothing applied (Review Focus 2)', async () => {
    const a = await running();
    const t = twoFiles();
    writeFileSync(join(root(), 'made.py'), 'already\n');
    assert.equal(await a.plans.land(root(), t.plan, t.edit, 'Made'), 'made.py changed since planning; nothing was applied — plan again');
    assert.equal(disk('one/made.py'), 'already\n');
    assert.equal(disk('one/other.py'), t.before);
    await settle('one/made.py', null);
  });

  it('nothing to change is said; a conflict is the answer and nothing lands', async () => {
    const a = await running();
    const n = a.shown.length;
    assert.equal(await a.plans.land(root(), plan({}), undefined, 'Made'), undefined);
    assert.ok(a.shown.slice(n).some(s => s.text === 'Nothing to change: the code already has it'));
    const t = twoFiles({ conflicts: [{ code: 'exists', message: 'made.py exists' }] });
    assert.equal(await a.plans.land(root(), t.plan, t.edit, 'Made'), 'made.py exists');
    assert.ok(!existsSync(join(root(), 'made.py')));
  });

  it('a snippet replaces its line with the body, its first tab stop selected', async () => {
    const a = await running();
    const ed = await open(file('one/main.py'));
    assert.ok(await a.plans.snippet(root(), { file: 'main.py', line: 1, body: 'def ${1:name}():\n    ${2:pass}' }));
    const doc = vscode.window.activeTextEditor!.document;
    assert.ok(doc.getText().startsWith('def name():\n    pass'), doc.getText());
    assert.equal(doc.getText(vscode.window.activeTextEditor!.selection), 'name');
    await revert(ed.document);
  });

  it('the review: a file\'s diff beside; Apply lands, says landed, closes the diffs', async () => {
    const a = await running();
    const t = twoFiles();
    const ui = new FakeUi();
    ui.onReview = async (m, o) => {
      assert.deepEqual(m.files.map(f => `${f.mark} ${f.path}`), ['+ made.py', '~ other.py']);
      o.onActive(m.files[1]);
      await until(() => tabsUnder('/plan/').length === 1, 'the plan diff tab');
      return { kind: 'apply' };
    };
    let landed = 0;
    await a.plans.review(ui, root(), t.plan, t.edit, { title: 'Made', landed: () => { landed++; } });
    assert.equal(landed, 1);
    assert.equal(disk('one/made.py'), 'made = 1\n');
    assert.equal(tabsUnder('/plan/').length, 0, 'the diff tabs closed');
    await settle('one/made.py', null);
    await settle('one/other.py', t.before);
  });

  it('the review: a conflict blocks Apply; closing applies nothing and closes the diffs', async () => {
    const a = await running();
    const t = twoFiles({ conflicts: [{ code: 'exists', message: 'made.py exists' }] });
    const ui = new FakeUi();
    ui.onReview = async (m, o) => {
      assert.equal(m.canApply, false);
      assert.deepEqual(m.notes.map(x => x.text), ['✗ made.py exists']);
      o.onActive(m.files[0]);
      await until(() => tabsUnder('/plan/').length === 1, 'the plan diff tab');
      return { kind: 'apply' };
    };
    let landed = 0;
    await a.plans.review(ui, root(), t.plan, t.edit, { title: 'Made', landed: () => { landed++; } });
    assert.equal(landed, 0);
    assert.ok(!existsSync(join(root(), 'made.py')));
    assert.equal(tabsUnder('/plan/').length, 0);
  });

  it('the review: a parse warning jumps to its line', async () => {
    const a = await running();
    const t = twoFiles({ warnings: ['main.py:1 does not parse: unexpected indent'] });
    const ui = new FakeUi();
    ui.onReview = async m => ({ kind: 'jump', ...m.notes[0].jump! });
    await a.plans.review(ui, root(), t.plan, t.edit, { title: 'Made', landed: () => assert.fail('nothing lands') });
    const ed = vscode.window.activeTextEditor!;
    assert.equal(ed.document.uri.toString(), file('one/main.py').toString());
    assert.equal(ed.selection.active.line, 0);
  });
});
