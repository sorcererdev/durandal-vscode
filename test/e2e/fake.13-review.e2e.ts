import * as assert from 'node:assert/strict';
import * as vscode from 'vscode';
import type { ConjurePaused, DoReview, ReconcileReview } from '../../src/protocol';
import { Olifant } from '../../src/protocol';
import { plain } from '../../src/pause/viewModel';
import { FakeUi } from '../fakeUi';
import { reviewFixture, wrapped } from '../pauseFixtures';
import { api, file, log, open, reply, revert, running, settle, tabsUnder, until } from './helpers';

// The review sources over the fake server (M5 spec §5, §8): the push after a do, the lens, the
// chord, choose and its answers, reopen, durandal.isPlan.
const PLAN = 'one/plans/p.md';
const PLAN_TEXT = '# A plan\n\n- [ ] add a label @src/a.py:Table.label\n';
const MAIN = 'one/main.py';
const uriOf = (rel: string) => file(rel).toString();
const sent = (method: string) => log().filter(m => m.method === method);
const chooses = () => sent('olifant/plans/review/choose').map(m => m.params);

const planEdit = (text: string, version: number | null = null) => ({ documentChanges: [{ textDocument: { uri: uriOf(PLAN), version }, edits: [
  { range: { start: { line: 3, character: 0 }, end: { line: 3, character: 0 } }, newText: text },
] }] });

// showing: open the review the lens names and wait for its window
async function showing(review: DoReview | ReconcileReview, entry?: string): Promise<void> {
  const a = await api();
  reply('olifant/plans/review', review);
  await vscode.commands.executeCommand('olifant.plans.review', review.id, uriOf(PLAN), ...(entry ? [entry] : []));
  await until(() => a.pause.source() === review.kind, `the ${review.kind} window`);
}

describe('the review window (fake server)', () => {
  before(async () => {
    await vscode.commands.executeCommand('workbench.action.closeAllGroups');
    await settle(PLAN, PLAN_TEXT);
  });

  after(async () => {
    await vscode.commands.executeCommand('workbench.action.closeAllEditors');
    await settle(PLAN, '# A plan\n\n- [ ] a step\n');
  });

  afterEach(async () => {
    const a = await api();
    a.setUi(undefined);
    if (a.pause.view()) await a.pause.press('q');
    for (const m of ['olifant/plans/review', 'olifant/plans/reviews', 'olifant/plans/review/choose', 'olifant/plans/do', 'olifant/conjure']) reply(m, null);
    const d = vscode.workspace.textDocuments.find(x => x.uri.toString() === uriOf(PLAN));
    if (d?.isDirty) await revert(d);
    await settle(PLAN, PLAN_TEXT);
  });

  it('a do\'s review/ready opens the do review without opening the plan', async () => {
    const a = await running();
    await vscode.commands.executeCommand('workbench.action.closeAllEditors');
    reply('olifant/plans/review', reviewFixture('do'));
    reply('olifant/plans/do', {
      notify: [{ method: 'olifant/plans/review/ready', params: { id: 'R1', kind: 'do', textDocument: { uri: '$uri' } } }],
      review: 'R1', changed: ['src/a.py', 'src/b.py'], seconds: 42,
    });
    await a.server.request(Olifant.plansDo, { textDocument: { uri: uriOf(PLAN) }, line: 2 });
    await until(() => a.pause.source() === 'do', 'the do window');
    assert.ok(plain(a.pause.view()!.title).startsWith('do · step 1 · Table.label · ◆ answered'));
    assert.deepEqual(sent('olifant/plans/review').at(-1)!.params, { textDocument: { uri: uriOf(PLAN) }, id: 'R1' });
    assert.ok(!vscode.window.visibleTextEditors.some(e => e.document.uri.toString() === uriOf(PLAN)));
  });

  it('a keeps: choose keep, the plan edit lands, the window closes, do: kept; a second press waits', async () => {
    const a = await running();
    await open(file(PLAN));
    await showing(reviewFixture('do'));
    reply('olifant/plans/review/choose', { delay: 1, done: true, said: 'kept', edit: planEdit('  ✓ kept line\n') });
    const from = a.shown.length;
    const n = chooses().length;
    const fired = a.landed.fired.length;
    void a.pause.press('a');
    await until(() => chooses().length > n, 'the choose sent');
    await a.pause.press('a');
    assert.ok(a.pause.notices().includes('a: the last answer is still on its way'));
    assert.equal(a.pause.view()!.state, 'busy');
    await until(() => a.shown.slice(from).some(s => s.text === 'do: kept'), 'do: kept');
    await until(() => a.landed.fired.length > fired, 'the review landed');
    assert.equal(a.landed.fired.length, fired + 1);
    assert.equal(a.landed.fired.at(-1), 'review');
    assert.deepEqual(chooses()[n], { textDocument: { uri: uriOf(PLAN) }, id: 'R1', choice: 'keep' });
    assert.equal(chooses().length, n + 1);
    assert.equal(a.pause.view(), undefined);
    assert.ok(vscode.workspace.textDocuments.find(d => d.uri.toString() === uriOf(PLAN))!.getText().includes('  ✓ kept line'));
  });

  it('a press while the answer\'s edit lands still waits: one choose (final review I1)', async () => {
    const a = await running();
    await open(file(PLAN));
    await showing(reviewFixture('do'));
    reply('olifant/plans/review/choose', { done: false, said: 'kept', edit: planEdit('  ✓ kept line\n'), review: reviewFixture('do') });
    const n = chooses().length;
    // pressed from inside the landing: the plan's change event fires before the edit's promise settles
    let during: Promise<void> | undefined;
    const sub = vscode.workspace.onDidChangeTextDocument(e => {
      if (!during && e.document.uri.toString() === uriOf(PLAN)) during = a.pause.press('a');
    });
    try {
      await a.pause.press('a');
      await until(() => during !== undefined, 'a press during the landing');
      await during;
    } finally {
      sub.dispose();
    }
    assert.equal(chooses().length, n + 1);
    assert.ok(a.pause.notices().includes('a: the last answer is still on its way'));
  });

  it('t: the facts land on the plan and the window redraws with what it said', async () => {
    const a = await running();
    await open(file(PLAN));
    await showing(reviewFixture('do'));
    const next = reviewFixture('do');
    next.summary = 'The step\'s tests pass.';
    reply('olifant/plans/review/choose', { done: false, said: '1 passed · 0 failed', facts: [{ after: 2, lines: ['  ✓ test_label'] }], review: next });
    await a.pause.press('t');
    await until(() => a.pause.notices().includes('t: 1 passed · 0 failed'), 'the notice');
    assert.ok(a.pause.view()!.lines.some(l => plain(l).includes('The step\'s tests pass.')));
    const doc = vscode.workspace.textDocuments.find(d => d.uri.toString() === uriOf(PLAN))!;
    assert.equal(doc.lineAt(3).text, '  ✓ test_label');
  });

  it('keys the review does not offer say why; an engine error stays in the footer', async () => {
    const a = await running();
    const bare = reviewFixture('do');
    bare.offers = bare.offers.filter(o => o.choice === 'keep' || o.choice === 'test');
    await showing(bare);
    await a.pause.press(']');
    await a.pause.press('p');
    await a.pause.press('r');
    assert.ok(a.pause.notices().includes('p: nothing was refused'));
    assert.ok(a.pause.notices().includes('r: nothing to revert'));
    reply('olifant/plans/review/choose', { lsp_error: 'the step has no tests' });
    await a.pause.press('t');
    await until(() => a.pause.notices().includes('t: the step has no tests'), 'the error in the footer');
    assert.equal(a.pause.source(), 'do');
  });

  it('the chord p r picks the review on the cursor\'s line; none says so', async () => {
    const a = await running();
    const ed = await open(file(PLAN));
    await until(() => a.isPlan(), 'durandal.isPlan');
    ed.selection = new vscode.Selection(2, 0, 2, 0);
    reply('olifant/plans/reviews', { reviews: [
      { id: 'R0', kind: 'do', row: 7, step: 'other', status: 'answered' },
      { id: 'R1', kind: 'do', row: 2, step: 'add a label', status: 'answered' },
    ] });
    reply('olifant/plans/review', reviewFixture('do'));
    await vscode.commands.executeCommand('durandal.plan.review');
    await until(() => a.pause.source() === 'do', 'the do window');
    assert.equal(sent('olifant/plans/review').at(-1)!.params.id, 'R1');
    await a.pause.press('q');
    // the closed tab's focus goes back to an editor on its own time: the plan active first
    await open(file(PLAN));
    await until(() => vscode.window.activeTextEditor?.document.uri.toString() === uriOf(PLAN), 'the plan active');
    reply('olifant/plans/reviews', { reviews: [] });
    const from = a.shown.length;
    await vscode.commands.executeCommand('durandal.plan.review');
    await until(() => a.shown.slice(from).some(s => s.text === 'plans: nothing to review'), 'nothing to review');
  });

  it('reconcile: ] reads the next reading; a applies the first; a digit places with the offer\'s step; the last closes', async () => {
    const a = await running();
    await open(file(PLAN));
    const readings = reviewFixture('reconcile');
    await showing(readings);
    assert.equal(plain(a.pause.view()!.title), 'reconcile · 2 to review');
    await a.pause.press(']');
    assert.equal(a.pause.view()!.selected, 1);
    await a.pause.press('[');
    const rest = reviewFixture('reconcile');
    rest.entries = rest.entries.slice(1);
    reply('olifant/plans/review/choose', { done: false, said: 'applied', edit: null, review: rest });
    await a.pause.press('a');
    await until(() => a.pause.notices().includes('a: applied'), 'applied');
    assert.deepEqual(chooses().at(-1), { textDocument: { uri: uriOf(PLAN) }, id: 'reconcile', choice: 'apply', entry: readings.entries[0].id });
    const from = a.shown.length;
    reply('olifant/plans/review/choose', { done: true, said: 'placed', edit: null, review: null });
    await a.pause.press('2');
    await until(() => a.shown.slice(from).some(s => s.text === 'reconcile: placed'), 'reconcile: placed');
    assert.deepEqual(chooses().at(-1), { textDocument: { uri: uriOf(PLAN) }, id: 'reconcile', choice: 'place', entry: readings.entries[1].id, step: 3 });
    assert.equal(a.pause.view(), undefined);
  });

  it('the lens opens a reading selected', async () => {
    const a = await running();
    const readings = reviewFixture('reconcile');
    await showing(readings, readings.entries[1].id);
    assert.equal(a.pause.view()!.selected, 1);
  });

  it('errand o: what to change, then plans/do resumes its thread; Escape sends nothing', async () => {
    const a = await running();
    const ui = new FakeUi();
    a.setUi(ui);
    await showing(reviewFixture('errand'));
    await a.pause.press('a');
    assert.ok(a.pause.notices().at(-1)!.startsWith('a: '));
    const n = sent('olifant/plans/do').length;
    void a.pause.press('o');
    await until(() => ui.texts.length === 1, 'asked');
    ui.texts[0].finish(undefined);
    await new Promise(r => setTimeout(r, 300));
    assert.equal(sent('olifant/plans/do').length, n);
    reply('olifant/plans/do', { review: 'R2', changed: ['src/a.py'], seconds: 9 });
    void a.pause.press('o');
    await until(() => ui.texts.length === 2, 'asked again');
    assert.equal(ui.texts[1].title, 'more');
    ui.texts[1].finish('add a docstring');
    await until(() => sent('olifant/plans/do').length > n, 'plans/do');
    assert.deepEqual(sent('olifant/plans/do').at(-1)!.params, { textDocument: { uri: uriOf(PLAN) }, line: 2, resume: 'R1', text: 'add a docstring' });
    // the do lands as Plan: Do lands it (M6 spec §4.4)
    await until(() => a.shown.some(s => s.text === 'do: 1 file changed · to review · 9 s'), 'the do\'s notice');
    assert.equal(a.landed.fired.at(-1), 'do');
  });

  it('a live do\'s o: choose reopen, then plans/do with the id it answered', async () => {
    const a = await running();
    const ui = new FakeUi();
    a.setUi(ui);
    const live = reviewFixture('do');
    live.offers = [...live.offers, { choice: 'reopen', key: 'o', label: 'reopen', detail: 'say what to change' }];
    await showing(live);
    reply('olifant/plans/review/choose', { done: true, said: 'kept; say what to change', edit: null, reopen: { id: 'R1' } });
    reply('olifant/plans/do', { review: 'R3', changed: [], seconds: 4 });
    const n = sent('olifant/plans/do').length;
    void a.pause.press('o');
    await until(() => ui.texts.length === 1, 'asked');
    ui.texts[0].finish('rename it');
    await until(() => sent('olifant/plans/do').length > n, 'plans/do');
    assert.equal(chooses().at(-1)!.choice, 'reopen');
    assert.deepEqual(sent('olifant/plans/do').at(-1)!.params, { textDocument: { uri: uriOf(PLAN) }, line: 2, resume: 'R1', text: 'rename it' });
  });

  it('a stale plan: the edit is refused whole, the review stays, the footer says why (Review Focus 5)', async () => {
    const a = await running();
    const ed = await open(file(PLAN));
    await showing(reviewFixture('do'));
    // typed into the plan: a document edit, not ed.edit (the window's new column can re-create
    // the editor while it opens, and an edit through the old one is refused)
    const typed = new vscode.WorkspaceEdit();
    typed.insert(ed.document.uri, new vscode.Position(0, 0), '<!-- typed -->\n');
    assert.ok(await vscode.workspace.applyEdit(typed));
    const stale = ed.document.version - 1;
    reply('olifant/plans/review/choose', { done: true, said: 'kept', edit: planEdit('  ✓ kept line\n', stale) });
    const before = a.pause.notices().length;
    await a.pause.press('a');
    await until(() => a.pause.notices().length > before, 'the refusal');
    assert.equal(a.pause.notices().at(-1), 'a: p.md changed since');
    assert.equal(a.pause.source(), 'do');
    assert.ok(!ed.document.getText().includes('kept line'));
  });

  it('d opens the review\'s details as markdown beside the window', async () => {
    const a = await running();
    await showing(reviewFixture('do'));
    await a.pause.press('d');
    const tab = await until(() => tabsUnder('/details/R1').find(t => t.input instanceof vscode.TabInputText), 'the details tab');
    const doc = await vscode.workspace.openTextDocument((tab.input as vscode.TabInputText).uri);
    assert.equal(doc.languageId, 'markdown');
    assert.ok(doc.getText().includes('## the step'));
    await vscode.window.tabGroups.close(tab);
  });

  it('a review opened over a pause swaps the window; the pause stays; a conjure in the unit swaps back (spec §5.4)', async () => {
    const a = await running();
    await settle(MAIN, Array.from({ length: 10 }, (_, i) => `v${i} = ${i}`).join('\n') + '\n');
    const ed = await open(file(MAIN));
    ed.selection = new vscode.Selection(3, 0, 3, 0);
    const w: ConjurePaused = wrapped('plain');
    w.paused.lines = { first: 3, last: 5 };
    reply('olifant/conjure', w);
    await vscode.commands.executeCommand('durandal.conjure');
    await until(() => a.pause.source() === 'conjure', 'the pause window');
    await showing(reviewFixture('do'));
    assert.ok(a.pause.stored(uriOf(MAIN)));
    assert.equal(a.pause.reminders(uriOf(MAIN)), 1);
    const n = sent('olifant/conjure').length;
    const back = await open(file(MAIN));
    back.selection = new vscode.Selection(4, 0, 4, 0);
    await vscode.commands.executeCommand('durandal.conjure');
    await until(() => a.pause.source() === 'conjure', 'the pause again');
    assert.equal(sent('olifant/conjure').length, n);
    await a.pause.press('q');
    await settle(MAIN, 'x = 1\n');
  });

  it('durandal.isPlan: a plan of project one, not a file in no project', async () => {
    const a = await running();
    await open(file(PLAN));
    await until(() => a.isPlan(), 'isPlan for the plan');
    await open(file('plain/notes.txt'));
    await until(() => !a.isPlan(), 'not for notes.txt');
  });
});
