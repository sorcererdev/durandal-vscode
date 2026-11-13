import * as assert from 'node:assert/strict';
import * as vscode from 'vscode';
import { FakeUi } from '../fakeUi';
import { actionLog, api, disk, docOf, file, log, open, reply, restart, revert, running, settle, sleep, until } from './helpers';

// The plan verbs over the fake server (M6 spec §4, §8): dispatch, pending rows, cancel, landing,
// the prompt, new step / excerpt / toggle, files, stub and test.
const PLAN = 'one/plans/v.md';
// durandal.nvim plans_spec.lua :557
const LINES = ['# T', '- a', '- b', '- c', '- d', '- e target line', '- f', '## Next', '- [ ] step @src/a.py:Foo'];
const TEXT = LINES.join('\n') + '\n';
const uriOf = (rel: string) => file(rel).toString();
const sent = (method: string) => log().filter(m => m.method === method);
const REPLIES = [
  'olifant/plans/ask', 'olifant/plans/validate', 'olifant/plans/do', 'olifant/plans/files', 'olifant/plans/stub',
  'olifant/plans/test', 'textDocument/codeAction', 'codeAction/resolve', 'textDocument/foldingRange', 'textDocument/codeLens',
];
const lines = () => docOf(PLAN)!.getText().split('\n');
const events = (from: number, name: string) => actionLog().slice(from).filter(e => e.event === name);
const outcomeParams = (from: number) => sent('olifant/plans/outcome').slice(from).map(m => m.params);

// at: the plan open and active, the cursor on ROW, durandal.isPlan known
async function at(row: number, rel = PLAN): Promise<vscode.TextEditor> {
  const a = await running();
  const ed = await open(file(rel));
  const p = new vscode.Position(row, 0);
  ed.selection = new vscode.Selection(p, p);
  await until(() => a.isPlan(), 'durandal.isPlan');
  return ed;
}

describe('the plan verbs (fake server)', () => {
  before(async () => {
    await vscode.commands.executeCommand('workbench.action.closeAllGroups');
    await settle(PLAN, TEXT);
  });

  after(async () => {
    await vscode.commands.executeCommand('workbench.action.closeAllEditors');
    await settle(PLAN, null);
  });

  afterEach(async () => {
    const a = await api();
    a.setUi(undefined);
    for (const m of REPLIES) reply(m, null);
    const ed = vscode.window.activeTextEditor;
    if (ed && ed.document.uri.toString() === uriOf(PLAN)) {
      for (const g of a.planVerbs.ghosts(uriOf(PLAN))) {
        ed.selection = new vscode.Selection(g.row, 0, g.row, 0);
        await vscode.commands.executeCommand('durandal.plan.reject');
      }
    }
    const d = docOf(PLAN);
    if (d?.isDirty) await revert(d);
    await settle(PLAN, TEXT);
  });

  it('an ask goes straight in: facts and blocks, fingerprints stamped, outcomes accepted, one undo (plans_spec :575)', async () => {
    const a = await running();
    reply('olifant/plans/ask', {
      id: 'S1', verb: 'ask', facts: [{ row: 1, text: '- a fact' }],
      blocks: [
        { after: 3, after_text: null, lines: [{ text: '  - a @src/a.py:F', fp: 'abc1234' }, { text: '  - so', fp: null }] },
        { after: 3, after_text: null, lines: [{ text: '  - then', fp: null }] },
        { after: 1, after_text: null, lines: [{ text: '  - early', fp: null }] },
      ],
      dropped: 0, unresolved: 0, seconds: 1, cost: null, changed: [], review: null,
    });
    const outcomes = sent('olifant/plans/outcome').length;
    await at(3);
    await vscode.commands.executeCommand('durandal.plan.ask');
    assert.deepEqual(sent('olifant/plans/ask').at(-1)!.params, { textDocument: { uri: uriOf(PLAN) }, line: 3 });
    assert.deepEqual(lines().slice(0, 9), ['# T', '- a fact', '  - early', '- b', '- c', '  - a @src/a.py:F ✓ abc1234', '  - so', '  - then', '- d']);
    await until(() => sent('olifant/plans/outcome').length === outcomes + 3, 'three outcomes');
    const os = sent('olifant/plans/outcome').slice(outcomes).map(m => m.params);
    assert.deepEqual(os.map(p => [p.id, p.block, p.outcome]).sort(), [['S1', 0, 'accepted'], ['S1', 1, 'accepted'], ['S1', 2, 'accepted']]);
    assert.ok(os.every(p => p.textDocument.uri === uriOf(PLAN)));
    assert.equal(a.landed.fired.at(-1), 'accept');
    assert.equal(a.shown.at(-1)!.text, 'ask: 4 lines · 0 not found · 1 s');
    assert.ok(a.planVerbs.flashes.some(f => f.uri === uriOf(PLAN) && f.row === 1));
    assert.deepEqual(a.planVerbs.running(uriOf(PLAN)), []);
    await vscode.commands.executeCommand('undo');
    assert.equal(docOf(PLAN)!.getText(), TEXT);
  });

  it('a RequestFailed shows the reason and leaves the plan alone; an empty answer says so', async () => {
    const a = await running();
    reply('olifant/plans/ask', { lsp_error: 'claude exited 2: no credentials' });
    await at(1);
    await vscode.commands.executeCommand('durandal.plan.ask');
    assert.deepEqual([a.shown.at(-1)!.level, a.shown.at(-1)!.text], ['error', 'claude exited 2: no credentials']);
    assert.equal(docOf(PLAN)!.getText(), TEXT);
    reply('olifant/plans/ask', null);
    await vscode.commands.executeCommand('durandal.plan.ask');
    assert.equal(a.shown.at(-1)!.text, 'ask: nothing came back');
  });

  it('a second verb on a running row is refused; Plan: Cancel cancels it; nothing running says so', async () => {
    const a = await running();
    reply('olifant/plans/do', { hold: true, title: 'doing' });
    await at(8);
    const n = sent('olifant/plans/do').length;
    const cancels = sent('$/cancelRequest').length;
    void vscode.commands.executeCommand('durandal.plan.do');
    await until(() => a.planVerbs.running(uriOf(PLAN)).length === 1, 'the do in the air');
    assert.deepEqual(a.planVerbs.running(uriOf(PLAN)), [{ row: 8, verb: 'do' }]);
    assert.deepEqual(a.planVerbs.pending(uriOf(PLAN)), [' ⋯ doing']);
    await vscode.commands.executeCommand('durandal.plan.do');
    assert.equal(a.shown.at(-1)!.text, 'plans: a request is already running on this line');
    assert.equal(sent('olifant/plans/do').length, n + 1);
    const from = a.shown.length;
    await vscode.commands.executeCommand('durandal.plan.cancel');
    await until(() => sent('$/cancelRequest').length > cancels, '$/cancelRequest');
    assert.deepEqual(a.planVerbs.running(uriOf(PLAN)), []);
    assert.deepEqual(a.planVerbs.pending(uriOf(PLAN)), []);
    await sleep(500);
    assert.deepEqual(a.shown.slice(from).map(s => s.text), ['cancelled'], 'said once, by the cancel');
    await vscode.commands.executeCommand('durandal.plan.cancel');
    assert.equal(a.shown.at(-1)!.text, 'plans: nothing is running');
  });

  it('typing above the row while the answer is out: the block follows the row, the facts are dropped', async () => {
    const a = await running();
    reply('olifant/plans/ask', {
      delay: 2, id: 'S2', verb: 'ask', facts: [{ row: 1, text: '- a fact' }],
      blocks: [{ after: 3, after_text: null, lines: [{ text: '  - so', fp: null }] }],
      dropped: 0, unresolved: 0, seconds: 2, cost: null, changed: [], review: null,
    });
    const ed = await at(3);
    const p = vscode.commands.executeCommand('durandal.plan.ask');
    await until(() => a.planVerbs.running(uriOf(PLAN)).length === 1, 'the ask in the air');
    await ed.edit(b => b.insert(new vscode.Position(0, 0), 'typed\n'));
    assert.deepEqual(a.planVerbs.running(uriOf(PLAN)), [{ row: 4, verb: 'ask' }]);
    await p;
    assert.deepEqual(lines().slice(0, 7), ['typed', '# T', '- a', '- b', '- c', '  - so', '- d']);
  });

  it('a plan closed (reopened with another language) before the answer: nothing lands, nothing is sent or said', async () => {
    const a = await running();
    reply('olifant/plans/ask', {
      delay: 2, id: 'S3', verb: 'ask', facts: [], blocks: [{ after: 3, after_text: null, lines: [{ text: '  - so', fp: null }] }],
      dropped: 0, unresolved: 0, seconds: 2, cost: null, changed: [], review: null,
    });
    const ed = await at(3);
    const outcomes = sent('olifant/plans/outcome').length;
    const p = vscode.commands.executeCommand('durandal.plan.ask');
    await until(() => a.planVerbs.running(uriOf(PLAN)).length === 1, 'the ask in the air');
    const from = a.shown.length;
    // VS Code closes the document and opens a new one on a language change
    await vscode.languages.setTextDocumentLanguage(ed.document, 'plaintext');
    await p;
    await sleep(300);
    assert.equal(docOf(PLAN)!.getText(), TEXT);
    assert.equal(sent('olifant/plans/outcome').length, outcomes);
    assert.deepEqual(a.shown.slice(from), []);
    await vscode.languages.setTextDocumentLanguage(docOf(PLAN)!, 'markdown');
  });

  it('an ask whose blocks hold no lines: nothing lands, no outcome is sent, no accept fires', async () => {
    const a = await running();
    reply('olifant/plans/ask', {
      id: 'S4', verb: 'ask', facts: [],
      blocks: [{ after: 3, after_text: null, lines: [] }, { after: 3, after_text: null, lines: null }],
      dropped: 1, unresolved: 0, seconds: 1, cost: null, changed: [], review: null,
    });
    await at(3);
    const outcomes = sent('olifant/plans/outcome').length;
    const fired = a.landed.fired.length;
    await vscode.commands.executeCommand('durandal.plan.ask');
    assert.equal(a.shown.at(-1)!.text, 'ask: 0 lines · 1 not found · 1 s');
    await sleep(300);
    assert.equal(docOf(PLAN)!.getText(), TEXT);
    assert.equal(sent('olifant/plans/outcome').length, outcomes);
    assert.equal(a.landed.fired.length, fired);
  });

  it('a validate: the facts land now, the blocks are held under the request row as the facts moved it', async () => {
    const a = await running();
    reply('olifant/plans/validate', {
      id: 'V1', verb: 'validate', facts: [{ after: 0, lines: ['- new'] }],
      blocks: [{ after: 3, after_text: null, lines: [{ text: '  - checked', fp: null }] }],
      dropped: 0, unresolved: 0, seconds: 1, cost: 0.0123, changed: [], review: null,
    });
    await at(3);
    const outcomes = sent('olifant/plans/outcome').length;
    const fired = a.landed.fired.length;
    await vscode.commands.executeCommand('durandal.plan.validate');
    assert.deepEqual(sent('olifant/plans/validate').at(-1)!.params, { textDocument: { uri: uriOf(PLAN) }, line: 3 });
    assert.equal(docOf(PLAN)!.getText(), ['# T', '- new', ...LINES.slice(1)].join('\n') + '\n');
    assert.equal(a.shown.at(-1)!.text, 'validate: 1 lines · 0 not found · 1 s · $0.0123');
    assert.deepEqual(a.planVerbs.flashes.at(-1), { uri: uriOf(PLAN), row: 4 });
    assert.deepEqual(a.planVerbs.ghosts(uriOf(PLAN)), [{ row: 4, lines: ['  - checked'], marker: 'ai · +1 line' }]);
    await sleep(300);
    assert.equal(sent('olifant/plans/outcome').length, outcomes);
    assert.equal(a.landed.fired.length, fired);
  });

  it("a fact that takes the plan's last rows: they go, from the end of the row before them", async () => {
    const a = await running();
    reply('olifant/plans/validate', {
      id: 'V2', verb: 'validate', facts: [{ from: 7, to: 9, lines: [] }], blocks: [],
      dropped: 0, unresolved: 0, seconds: 1, cost: null, changed: [], review: null,
    });
    await at(1);
    await vscode.commands.executeCommand('durandal.plan.validate');
    assert.equal(docOf(PLAN)!.getText(), LINES.slice(0, 7).join('\n'));
    assert.equal(a.shown.at(-1)!.text, 'validate: 0 lines · 0 not found · 1 s');
  });

  it('a do with a review says so and fires landed do; no lines land', async () => {
    const a = await running();
    reply('olifant/plans/do', {
      id: 'D9', verb: 'do', facts: [], blocks: [], dropped: 0, unresolved: 0, seconds: 3, cost: 0.5,
      changed: ['/w/one/src/a.py'], review: 'D9',
    });
    await at(8);
    await vscode.commands.executeCommand('durandal.plan.do');
    assert.equal(a.shown.at(-1)!.text, 'do: 1 file changed · to review · 3 s · $0.5');
    assert.equal(a.landed.fired.at(-1), 'do');
    assert.equal(docOf(PLAN)!.getText(), TEXT);
  });

  it('a server stop while a do runs: the row and its mark go, the late end says nothing', async () => {
    const a = await running();
    reply('olifant/plans/do', { hold: true, title: 'doing' });
    await at(8);
    const p = vscode.commands.executeCommand('durandal.plan.do');
    await until(() => a.planVerbs.running(uriOf(PLAN)).length === 1, 'the do in the air');
    const from = a.shown.length;
    await restart();
    await p;
    assert.deepEqual(a.planVerbs.running(uriOf(PLAN)), []);
    await sleep(300);
    assert.deepEqual(a.shown.slice(from).filter(s => s.level !== 'info' || s.text === 'cancelled'), []);
  });

  it('a server stop while a stub and a files run: the late rejections say nothing, nothing is written', async () => {
    const a = await running();
    reply('olifant/plans/stub', { hold: true, title: 'stubbing' });
    reply('olifant/plans/files', { hold: true, title: 'listing' });
    await at(8);
    const stubs = sent('olifant/plans/stub').length;
    const files = sent('olifant/plans/files').length;
    const fired = a.landed.fired.length;
    const from = a.shown.length;
    const p = vscode.commands.executeCommand('durandal.plan.stub');
    const q = vscode.commands.executeCommand('durandal.plan.files');
    await until(() => sent('olifant/plans/stub').length > stubs && sent('olifant/plans/files').length > files, 'the stub and the files asked');
    await restart();
    await p;
    await q;
    await sleep(300);
    assert.deepEqual(a.shown.slice(from).filter(s => s.level !== 'info'), []);
    assert.ok(!a.shown.slice(from).some(s => /disposed|stub/i.test(s.text)), 'no late word');
    assert.equal(docOf(PLAN)!.getText(), TEXT);
    assert.equal(a.landed.fired.length, fired);
  });

  const VALIDATE = {
    id: 'V1', verb: 'validate', facts: [], blocks: [{ after: 0, after_text: '- e target line', lines: [{ text: '  - ok', fp: null }] }],
    dropped: 0, unresolved: 0, seconds: 1, cost: null, changed: [], review: null,
  };

  // validated: VALIDATE (or R) answered for the cursor on ROW; the plan's editor
  async function validated(row = 2, r: unknown = VALIDATE): Promise<vscode.TextEditor> {
    reply('olifant/plans/validate', r);
    const ed = await at(row);
    await vscode.commands.executeCommand('durandal.plan.validate');
    return ed;
  }

  const onRow = (ed: vscode.TextEditor, row: number, col = 0) => { ed.selection = new vscode.Selection(row, col, row, col); };

  it('validate: a ghost under the target row, marked, followed through typing; p y writes it as one undo step (plans_spec :631)', async () => {
    const a = await running();
    const outcomes = sent('olifant/plans/outcome').length;
    const from = actionLog().length;
    const said = a.shown.length;
    const ed = await validated();
    assert.ok(a.shown.slice(said).some(s => s.text === 'validate: 1 lines · 0 not found · 1 s'));
    assert.equal(docOf(PLAN)!.getText(), TEXT, 'nothing written before the decision');
    assert.deepEqual(a.planVerbs.ghosts(uriOf(PLAN)), [{ row: 5, lines: ['  - ok'], marker: 'ai · +1 line' }]);
    assert.deepEqual(a.planVerbs.markers(uriOf(PLAN)), [{ row: 5, text: 'ai · +1 line' }]);
    assert.deepEqual(events(from, 'plan-ghost-shown').map(e => [e.verb, e.blocks]), [['validate', 1]]);
    await sleep(300);
    assert.equal(sent('olifant/plans/outcome').length, outcomes, 'no outcome before the decision');
    await ed.edit(b => b.insert(new vscode.Position(0, 0), 'typed\n'));
    assert.deepEqual(a.planVerbs.ghosts(uriOf(PLAN)).map(g => g.row), [6]);
    assert.deepEqual(a.planVerbs.markers(uriOf(PLAN)), [{ row: 6, text: 'ai · +1 line' }]);
    const typed = docOf(PLAN)!.getText();
    const fired = a.landed.fired.length;
    onRow(ed, 6, 3);
    await vscode.commands.executeCommand('durandal.plan.accept');
    assert.deepEqual(lines().slice(6, 8), ['- e target line', '  - ok']);
    await until(() => sent('olifant/plans/outcome').length === outcomes + 1, 'the outcome');
    assert.deepEqual(outcomeParams(outcomes), [{ textDocument: { uri: uriOf(PLAN) }, id: 'V1', block: 0, outcome: 'accepted' }]);
    assert.deepEqual(a.landed.fired.slice(fired), ['accept']);
    assert.deepEqual(a.planVerbs.flashes.at(-1), { uri: uriOf(PLAN), row: 7 });
    assert.deepEqual(a.planVerbs.ghosts(uriOf(PLAN)), []);
    assert.deepEqual(a.planVerbs.markers(uriOf(PLAN)), []);
    assert.deepEqual(events(from, 'plan-ghost-accepted').map(e => [e.verb, e.blocks, e.how]), [['validate', 1, 'chord']]);
    await vscode.commands.executeCommand('undo');
    assert.equal(docOf(PLAN)!.getText(), typed, 'one undo step');
    assert.deepEqual(a.planVerbs.ghosts(uriOf(PLAN)), [], 'the ghost does not come back');
  });

  it('p n sends rejected for the row and writes nothing; no landing', async () => {
    const a = await running();
    const outcomes = sent('olifant/plans/outcome').length;
    const from = actionLog().length;
    const ed = await validated();
    const fired = a.landed.fired.length;
    onRow(ed, 5);
    await vscode.commands.executeCommand('durandal.plan.reject');
    await until(() => sent('olifant/plans/outcome').length === outcomes + 1, 'the outcome');
    assert.deepEqual(outcomeParams(outcomes), [{ textDocument: { uri: uriOf(PLAN) }, id: 'V1', block: 0, outcome: 'rejected' }]);
    assert.equal(docOf(PLAN)!.getText(), TEXT);
    assert.equal(a.landed.fired.length, fired);
    assert.deepEqual(a.planVerbs.ghosts(uriOf(PLAN)), []);
    assert.deepEqual(events(from, 'plan-ghost-rejected').map(e => [e.verb, e.blocks, e.how]), [['validate', 1, 'chord']]);
  });

  it('p y and p n where there is no ghost say "no ghost here" (plans.lua :49-50)', async () => {
    const a = await running();
    await at(1);
    await vscode.commands.executeCommand('durandal.plan.accept');
    assert.deepEqual([a.shown.at(-1)!.level, a.shown.at(-1)!.text], ['warn', 'no ghost here']);
    await vscode.commands.executeCommand('durandal.plan.reject');
    assert.equal(a.shown.at(-1)!.text, 'no ghost here');
    assert.equal(docOf(PLAN)!.getText(), TEXT);
  });

  it('p y on a row whose validate still runs says "no ghost here"; the answer then leaves its ghost', async () => {
    const a = await running();
    reply('olifant/plans/validate', { ...VALIDATE, delay: 2 });
    await at(5);
    const p = vscode.commands.executeCommand('durandal.plan.validate');
    await until(() => a.planVerbs.running(uriOf(PLAN)).length === 1, 'the validate in the air');
    await vscode.commands.executeCommand('durandal.plan.accept');
    assert.equal(a.shown.at(-1)!.text, 'no ghost here');
    await p;
    assert.deepEqual(a.planVerbs.ghosts(uriOf(PLAN)), [{ row: 5, lines: ['  - ok'], marker: 'ai · +1 line' }]);
  });

  it('two blocks of one validate under one row: one marker, both written in order by one p y, an outcome each', async () => {
    const a = await running();
    const outcomes = sent('olifant/plans/outcome').length;
    const ed = await validated(2, {
      ...VALIDATE, blocks: [
        { after: 0, after_text: '- e target line', lines: [{ text: '  - one', fp: null }] },
        { after: 0, after_text: '- e target line', lines: [{ text: '  - two', fp: null }, { text: '  - three', fp: null }] },
      ],
    });
    assert.deepEqual(a.planVerbs.ghosts(uriOf(PLAN)), [{ row: 5, lines: ['  - one', '  - two', '  - three'], marker: 'ai · +3 lines' }]);
    onRow(ed, 5);
    await vscode.commands.executeCommand('durandal.plan.accept');
    assert.deepEqual(lines().slice(5, 9), ['- e target line', '  - one', '  - two', '  - three']);
    await until(() => sent('olifant/plans/outcome').length === outcomes + 2, 'two outcomes');
    assert.deepEqual(outcomeParams(outcomes).map(p => [p.id, p.block, p.outcome]), [['V1', 0, 'accepted'], ['V1', 1, 'accepted']]);
  });

  it('a second answer on a ghost row goes after the first; p y writes both, each outcome against its own answer', async () => {
    const a = await running();
    const outcomes = sent('olifant/plans/outcome').length;
    await validated();
    const ed = await validated(2, { ...VALIDATE, id: 'V2', blocks: [{ after: 0, after_text: '- e target line', lines: [{ text: '  - again', fp: null }] }] });
    assert.deepEqual(a.planVerbs.ghosts(uriOf(PLAN)), [{ row: 5, lines: ['  - ok', '  - again'], marker: 'ai · +2 lines' }]);
    onRow(ed, 5);
    await vscode.commands.executeCommand('durandal.plan.accept');
    assert.deepEqual(lines().slice(5, 8), ['- e target line', '  - ok', '  - again']);
    await until(() => sent('olifant/plans/outcome').length === outcomes + 2, 'two outcomes');
    assert.deepEqual(outcomeParams(outcomes).map(p => [p.id, p.block]), [['V1', 0], ['V2', 0]]);
  });

  it('a do with no review (no git) leaves a ghost that replaces its step when accepted (plans_spec :641)', async () => {
    const a = await running();
    reply('olifant/plans/do', {
      id: 'D1', verb: 'do', facts: [], dropped: 0, unresolved: 0, seconds: 2, cost: null, changed: [], review: null,
      blocks: [{ after: 8, after_text: null, lines: [{ text: '- [x] step @src/a.py:Foo', fp: null }, { text: '  - did it', fp: null }] }],
    });
    const ed = await at(8);
    const fired = a.landed.fired.length;
    await vscode.commands.executeCommand('durandal.plan.do');
    assert.deepEqual(a.planVerbs.ghosts(uriOf(PLAN)), [{ row: 8, lines: ['- [x] step @src/a.py:Foo', '  - did it'], marker: 'ai · +2 lines' }]);
    assert.equal(docOf(PLAN)!.getText(), TEXT);
    onRow(ed, 8);
    await vscode.commands.executeCommand('durandal.plan.accept');
    assert.deepEqual(lines().slice(8, 10), ['- [x] step @src/a.py:Foo', '  - did it']);
    assert.deepEqual(a.landed.fired.slice(fired), ['do', 'accept']);
  });

  it('a block with no lines: held but not marked; p y writes nothing and still sends accepted and lands', async () => {
    const a = await running();
    const outcomes = sent('olifant/plans/outcome').length;
    const ed = await validated(3, { ...VALIDATE, blocks: [{ after: 3, after_text: null, lines: [] }] });
    assert.deepEqual(a.planVerbs.ghosts(uriOf(PLAN)), [{ row: 3, lines: [], marker: 'ai · +0 lines' }]);
    assert.deepEqual(a.planVerbs.markers(uriOf(PLAN)), [], 'no "+0 lines" marker is drawn');
    const fired = a.landed.fired.length;
    onRow(ed, 3);
    await vscode.commands.executeCommand('durandal.plan.accept');
    assert.equal(docOf(PLAN)!.getText(), TEXT);
    await until(() => sent('olifant/plans/outcome').length === outcomes + 1, 'the outcome');
    assert.equal(outcomeParams(outcomes)[0].outcome, 'accepted');
    assert.deepEqual(a.landed.fired.slice(fired), ['accept']);
  });

  it('with reviewAnswers an ask leaves a ghost; p y lands it stamped (plans_spec :560)', async () => {
    const a = await running();
    await vscode.workspace.getConfiguration('durandal.plans').update('reviewAnswers', true, vscode.ConfigurationTarget.Global);
    try {
      await sleep(200);
      reply('olifant/plans/ask', {
        id: 'S4', verb: 'ask', facts: [], blocks: [{ after: 3, after_text: null, lines: [{ text: '  - a @src/a.py:F', fp: 'abc1234' }, { text: '  - so', fp: null }] }],
        dropped: 1, unresolved: 0, seconds: 9.1, cost: 0.0123, changed: [], review: null,
      });
      const ed = await at(3);
      const said = a.shown.length;
      await vscode.commands.executeCommand('durandal.plan.ask');
      assert.ok(a.shown.slice(said).some(s => s.text === 'ask: 2 lines · 1 not found · 9.1 s · $0.0123'));
      assert.equal(docOf(PLAN)!.getText(), TEXT);
      onRow(ed, 3);
      await vscode.commands.executeCommand('durandal.plan.accept');
      assert.deepEqual(lines().slice(4, 6), ['  - a @src/a.py:F ✓ abc1234', '  - so']);
    } finally {
      await vscode.workspace.getConfiguration('durandal.plans').update('reviewAnswers', undefined, vscode.ConfigurationTarget.Global);
    }
  });

  it('a second p y while the first one\'s edit is in the air writes once and decides once', async () => {
    const a = await running();
    const outcomes = sent('olifant/plans/outcome').length;
    const from = actionLog().length;
    const said = a.shown.length;
    const ed = await validated();
    onRow(ed, 5);
    await Promise.all([vscode.commands.executeCommand('durandal.plan.accept'), vscode.commands.executeCommand('durandal.plan.accept')]);
    assert.deepEqual(lines().slice(5, 8), ['- e target line', '  - ok', '- f']);
    await until(() => sent('olifant/plans/outcome').length === outcomes + 1, 'the outcome');
    await sleep(300);
    assert.equal(sent('olifant/plans/outcome').length, outcomes + 1, 'one outcome');
    assert.equal(events(from, 'plan-ghost-accepted').length, 1);
    assert.deepEqual(a.shown.slice(said).filter(s => s.level !== 'info').map(s => s.text), ['no ghost here']);
  });

  it('p y whose edit VS Code refuses keeps the ghost where the plan moved it, and says so (deviation 11)', async () => {
    const a = await running();
    const ed = await validated();
    const outcomes = sent('olifant/plans/outcome').length;
    const from = actionLog().length;
    await ed.edit(b => b.insert(new vscode.Position(0, 0), 'typed\n'));
    onRow(ed, 6);
    // VS Code refuses p y's edit: applyEdit answers false once (the extension shares this API
    // object). Typing while p y runs no longer races its edit: p y hides the ghost text and
    // reads the plan only after the hide's answer, which follows the typing's change.
    const applyEdit = vscode.workspace.applyEdit;
    (vscode.workspace as { applyEdit: unknown }).applyEdit = async () => false;
    try {
      await vscode.commands.executeCommand('durandal.plan.accept');
    } finally {
      (vscode.workspace as { applyEdit: unknown }).applyEdit = applyEdit;
    }
    assert.deepEqual([a.shown.at(-1)!.level, a.shown.at(-1)!.text], ['error', 'VS Code did not apply the edit']);
    assert.equal(docOf(PLAN)!.getText(), 'typed\n' + TEXT);
    assert.deepEqual(a.planVerbs.ghosts(uriOf(PLAN)), [{ row: 6, lines: ['  - ok'], marker: 'ai · +1 line' }]);
    assert.deepEqual(a.planVerbs.markers(uriOf(PLAN)), [{ row: 6, text: 'ai · +1 line' }]);
    await sleep(300);
    assert.equal(sent('olifant/plans/outcome').length, outcomes, 'no outcome for a refused accept');
    assert.deepEqual(events(from, 'plan-ghost-accepted'), []);
    // the ghost that stayed is still decided by p y, at its row now
    onRow(ed, 6);
    await vscode.commands.executeCommand('durandal.plan.accept');
    assert.deepEqual(lines().slice(6, 8), ['- e target line', '  - ok']);
    await until(() => sent('olifant/plans/outcome').length === outcomes + 1, 'the outcome');
  });

  it('a server stop drops the ghosts and their markers without an outcome; p y then finds none', async () => {
    const a = await running();
    await validated();
    const outcomes = sent('olifant/plans/outcome').length;
    await restart();
    assert.deepEqual(a.planVerbs.ghosts(uriOf(PLAN)), []);
    assert.deepEqual(a.planVerbs.markers(uriOf(PLAN)), []);
    const ed = await at(5);
    onRow(ed, 5);
    await vscode.commands.executeCommand('durandal.plan.accept');
    assert.equal(a.shown.at(-1)!.text, 'no ghost here');
    await sleep(300);
    assert.equal(sent('olifant/plans/outcome').length, outcomes);
    assert.equal(docOf(PLAN)!.getText(), TEXT);
  });

  it('a plan reopened with another language drops its ghosts without an outcome or a word', async () => {
    const a = await running();
    const ed = await validated();
    const outcomes = sent('olifant/plans/outcome').length;
    const from = a.shown.length;
    // VS Code closes the document and opens a new one on a language change
    await vscode.languages.setTextDocumentLanguage(ed.document, 'plaintext');
    await vscode.languages.setTextDocumentLanguage(docOf(PLAN)!, 'markdown');
    assert.deepEqual(a.planVerbs.ghosts(uriOf(PLAN)), []);
    await sleep(300);
    assert.equal(sent('olifant/plans/outcome').length, outcomes);
    assert.deepEqual(a.shown.slice(from), []);
  });

  // asksAt: the asks for a plan ghost's item on ROW after the count FROM; servedAt: those served
  const asksAt = (a: Awaited<ReturnType<typeof api>>, from: number, row: number) =>
    a.planVerbs.served.since(from).filter(s => s.uri === uriOf(PLAN) && s.line === row);
  const servedAt = (a: Awaited<ReturnType<typeof api>>, from: number, row: number) =>
    asksAt(a, from, row).filter(s => s.insertText !== undefined);

  it('the cursor on a ghost row hands VS Code the row and its lines, mid-line; a commit (Tab) accepts them', async () => {
    const a = await running();
    const outcomes = sent('olifant/plans/outcome').length;
    const from = actionLog().length;
    const ed = await validated();
    const n = a.planVerbs.served.count;
    onRow(ed, 5, 4);
    await until(() => servedAt(a, n, 5).length > 0, 'the ghost served');
    assert.equal(servedAt(a, n, 5).at(-1)!.insertText, '- e target line\n  - ok');
    await sleep(400);
    const fired = a.landed.fired.length;
    await vscode.commands.executeCommand('editor.action.inlineSuggest.commit');
    await until(() => lines()[6] === '  - ok', 'the ghost committed');
    assert.equal(lines()[5], '- e target line');
    await until(() => sent('olifant/plans/outcome').length === outcomes + 1, 'the outcome');
    assert.deepEqual(outcomeParams(outcomes), [{ textDocument: { uri: uriOf(PLAN) }, id: 'V1', block: 0, outcome: 'accepted' }]);
    assert.deepEqual(a.landed.fired.slice(fired), ['accept']);
    assert.deepEqual(a.planVerbs.ghosts(uriOf(PLAN)), []);
    assert.deepEqual(a.planVerbs.markers(uriOf(PLAN)), []);
    assert.deepEqual(events(from, 'plan-ghost-accepted').map(e => e.how), ['tab']);
    assert.deepEqual(a.planVerbs.flashes.at(-1), { uri: uriOf(PLAN), row: 6 }, 'the last row written flashed, as by p y');
    await vscode.commands.executeCommand('undo');
    assert.equal(docOf(PLAN)!.getText(), TEXT, 'one undo step');
  });

  it('Tab while p y writes the row: the lines land once, decided once, nothing said but the landing', async () => {
    const a = await running();
    const outcomes = sent('olifant/plans/outcome').length;
    const from = actionLog().length;
    const ed = await validated();
    const n = a.planVerbs.served.count;
    onRow(ed, 5, 4);
    await until(() => servedAt(a, n, 5).length > 0, 'the ghost served');
    await sleep(400);
    const said = a.shown.length;
    // p y starts first (its edit goes out after the hide); VS Code's commit comes while it runs
    await Promise.all([
      vscode.commands.executeCommand('durandal.plan.accept'),
      vscode.commands.executeCommand('editor.action.inlineSuggest.commit'),
    ]);
    await sleep(400);
    assert.deepEqual(lines().slice(5, 8), ['- e target line', '  - ok', '- f']);
    assert.equal(sent('olifant/plans/outcome').length, outcomes + 1, 'one outcome');
    assert.equal(events(from, 'plan-ghost-accepted').length, 1);
    assert.deepEqual(a.shown.slice(said).filter(s => s.level !== 'info'), []);
  });

  it('typing on the ghost row: the item follows the row\'s text, and the commit lands under it', async () => {
    const a = await running();
    const ed = await validated();
    await ed.edit(b => b.insert(new vscode.Position(5, 15), ' more'));
    const n = a.planVerbs.served.count;
    onRow(ed, 5, 20);
    await until(() => servedAt(a, n, 5).length > 0, 'the ghost served');
    assert.equal(servedAt(a, n, 5).at(-1)!.insertText, '- e target line more\n  - ok');
    await sleep(400);
    await vscode.commands.executeCommand('editor.action.inlineSuggest.commit');
    await until(() => lines()[6] === '  - ok', 'committed under the typed row');
    assert.equal(lines()[5], '- e target line more');
  });

  it('Esc on a ghost row hides it until the cursor leaves the row and comes back (spec §0.10)', async () => {
    const a = await running();
    const ed = await validated();
    const n = a.planVerbs.served.count;
    onRow(ed, 5, 2);
    await until(() => servedAt(a, n, 5).length > 0, 'the ghost served');
    await sleep(400);
    await vscode.commands.executeCommand('durandal.plan.ghostEscape');
    const m = a.planVerbs.served.count;
    onRow(ed, 5, 6);
    await sleep(500);
    assert.deepEqual(a.planVerbs.served.since(m), [], 'not asked again on the row');
    await vscode.commands.executeCommand('editor.action.inlineSuggest.commit');
    await sleep(300);
    assert.equal(docOf(PLAN)!.getText(), TEXT, 'nothing to commit');
    onRow(ed, 1);
    await sleep(200);
    onRow(ed, 5, 6);
    await until(() => servedAt(a, m, 5).length > 0, 'asked again on return');
    assert.deepEqual(a.planVerbs.ghosts(uriOf(PLAN)).map(g => g.row), [5], 'Esc decides nothing');
  });

  it('p n with the ghost drawn hides it: a commit then writes nothing', async () => {
    const a = await running();
    const ed = await validated();
    const n = a.planVerbs.served.count;
    onRow(ed, 5, 3);
    await until(() => servedAt(a, n, 5).length > 0, 'the ghost served');
    await sleep(400);
    await vscode.commands.executeCommand('durandal.plan.reject');
    await vscode.commands.executeCommand('editor.action.inlineSuggest.commit');
    await sleep(300);
    assert.equal(docOf(PLAN)!.getText(), TEXT);
  });

  it('a do\'s step re-spelled is not drawn inline (no deletion in ghost text); its marker stays and p y writes it', async () => {
    const a = await running();
    reply('olifant/plans/do', {
      id: 'D2', verb: 'do', facts: [], dropped: 0, unresolved: 0, seconds: 2, cost: null, changed: [], review: null,
      blocks: [{ after: 8, after_text: null, lines: [{ text: '- [x] step @src/a.py:Foo', fp: null }, { text: '  - did it', fp: null }] }],
    });
    const ed = await at(8);
    const n = a.planVerbs.served.count;
    await vscode.commands.executeCommand('durandal.plan.do');
    onRow(ed, 8, 3);
    await until(() => asksAt(a, n, 8).length > 0, 'the ghost asked for');
    await sleep(300);
    assert.deepEqual(servedAt(a, n, 8), [], 'asked, and refused');
    assert.deepEqual(a.planVerbs.markers(uriOf(PLAN)), [{ row: 8, text: 'ai · +2 lines' }]);
    await vscode.commands.executeCommand('durandal.plan.accept');
    assert.deepEqual(lines().slice(8, 10), ['- [x] step @src/a.py:Foo', '  - did it']);
  });

  it('a native commit from before a restart does nothing, even with a new ghost on the row', async () => {
    const a = await running();
    const ed = await validated();
    const n = a.planVerbs.served.count;
    onRow(ed, 5);
    await until(() => servedAt(a, n, 5).length > 0, 'the ghost served');
    const old = servedAt(a, n, 5).at(-1)!.args;
    await restart();
    await validated();
    const outcomes = sent('olifant/plans/outcome').length;
    await vscode.commands.executeCommand('durandal.plan.ghostAccepted', old);
    await sleep(300);
    assert.equal(sent('olifant/plans/outcome').length, outcomes);
    assert.deepEqual(a.planVerbs.ghosts(uriOf(PLAN)), [{ row: 5, lines: ['  - ok'], marker: 'ai · +1 line' }]);
  });

  // the source code actions the plan chords asked (VS Code's lightbulb asks its own, without only)
  const actionsAsked = () => sent('textDocument/codeAction')
    .filter(m => m.params.textDocument.uri === uriOf(PLAN) && (m.params.context?.only ?? []).includes('source'));

  it('new step: the source action\'s edit under the row, the cursor at its end; only source asked', async () => {
    const a = await running();
    reply('textDocument/codeAction', [
      { title: 'Show why', kind: '', command: { title: 'Show why', command: 'olifant.showWhy', arguments: [] } },
      { title: 'New step below', kind: 'source', edit: { changes: { [uriOf(PLAN)]: [{ range: { start: { line: 3, character: 3 }, end: { line: 3, character: 3 } }, newText: '\n- [ ] step @anchor' }] } } },
    ]);
    const ed = await at(3);
    await vscode.commands.executeCommand('durandal.plan.newStep');
    assert.equal(lines()[4], '- [ ] step @anchor');
    assert.deepEqual([ed.selection.active.line, ed.selection.active.character], [4, '- [ ] step @anchor'.length]);
    const p = actionsAsked().at(-1)!.params;
    assert.deepEqual(p.context, { only: ['source'], diagnostics: [] });
    assert.deepEqual(p.range, { start: { line: 3, character: 0 }, end: { line: 3, character: 0 } });
    reply('textDocument/codeAction', []);
    await vscode.commands.executeCommand('durandal.plan.newStep');
    assert.deepEqual([a.shown.at(-1)!.level, a.shown.at(-1)!.text], ['warn', 'no new step here']);
  });

  it('excerpt: a disabled action says its reason; one that needs resolving is resolved and applied', async () => {
    const a = await running();
    reply('textDocument/codeAction', [{ title: 'Show the code here', kind: 'source', disabled: { reason: 'not on a step' }, data: { kind: 'excerpt', path: '/x', line: 1, version: null } }]);
    await at(1);
    await vscode.commands.executeCommand('durandal.plan.excerpt');
    assert.equal(a.shown.at(-1)!.text, 'excerpt: not on a step');
    const action = { title: 'Show the code here', kind: 'source', data: { kind: 'excerpt', path: '/x', line: 8, version: null } };
    reply('textDocument/codeAction', [action]);
    reply('codeAction/resolve', { ...action, edit: { documentChanges: [{ textDocument: { uri: uriOf(PLAN), version: null }, edits: [
      { range: { start: { line: 8, character: 24 }, end: { line: 8, character: 24 } }, newText: '\n  ```python @src/a.py:Foo\n  ```' },
    ] }] } });
    await at(8);
    await vscode.commands.executeCommand('durandal.plan.excerpt');
    assert.deepEqual(lines().slice(8, 11), ['- [ ] step @src/a.py:Foo', '  ```python @src/a.py:Foo', '  ```']);
    assert.deepEqual(sent('codeAction/resolve').at(-1)!.params.data, action.data);
  });

  it('a resolve against a plan that moved is refused with the server\'s words; nothing changes', async () => {
    const a = await running();
    reply('textDocument/codeAction', [{ title: 'Mark done', kind: 'source', data: { kind: 'toggle', path: '/x', line: 8, version: 1 } }]);
    reply('codeAction/resolve', { lsp_error: 'the plan changed since; ask again' });
    await at(8);
    await vscode.commands.executeCommand('durandal.plan.toggle');
    assert.deepEqual([a.shown.at(-1)!.level, a.shown.at(-1)!.text], ['error', 'the plan changed since; ask again']);
    assert.equal(docOf(PLAN)!.getText(), TEXT);
  });

  it('toggle: resolved and applied; disabled or absent says so', async () => {
    const a = await running();
    const action = { title: 'Mark done', kind: 'source', data: { kind: 'toggle', path: '/x', line: 8, version: null } };
    reply('textDocument/codeAction', [action]);
    reply('codeAction/resolve', { ...action, edit: { documentChanges: [{ textDocument: { uri: uriOf(PLAN), version: null }, edits: [
      { range: { start: { line: 8, character: 0 }, end: { line: 8, character: 5 } }, newText: '- [x]' },
    ] }] } });
    await at(8);
    await vscode.commands.executeCommand('durandal.plan.toggle');
    assert.equal(lines()[8], '- [x] step @src/a.py:Foo');
    reply('textDocument/codeAction', [{ ...action, disabled: { reason: 'not on a step' } }]);
    await vscode.commands.executeCommand('durandal.plan.toggle');
    assert.equal(a.shown.at(-1)!.text, 'toggle: not on a step');
    reply('textDocument/codeAction', []);
    await vscode.commands.executeCommand('durandal.plan.toggle');
    assert.equal(a.shown.at(-1)!.text, 'toggle: not on a step');
  });

  it('excerpt on a closed excerpt opens it without asking; again (no lens) asks, and the disabled answer folds it', async () => {
    const a = await running();
    const XPLAN = 'one/plans/x.md';
    const XTEXT = ['# X', '- [ ] show F @src/a.py:F', '  ```python @src/a.py:F', '  def F():', '      return 1', '  ```', '- [ ] next', ''].join('\n');
    reply('textDocument/foldingRange', [{ startLine: 2, endLine: 5, kind: 'region' }]);
    reply('textDocument/codeLens', []);
    await settle(XPLAN, XTEXT);
    try {
      const ed = await at(2, XPLAN);
      const ux = uriOf(XPLAN);
      const shown = (row: number) => ed.visibleRanges.some(r => r.start.line <= row && row <= r.end.line);
      const asked = () => sent('textDocument/codeAction')
        .filter(m => m.params.textDocument.uri === ux && (m.params.context?.only ?? []).includes('source')).length;
      await until(() => a.planView.entered(ux), 'entered');
      await until(() => !shown(3) || undefined, 'the excerpt closed on entry');
      const before = asked();
      ed.selection = new vscode.Selection(2, 0, 2, 0);
      await vscode.commands.executeCommand('durandal.plan.excerpt');
      await until(() => shown(3) || undefined, 'opened');
      assert.equal(asked(), before, 'nothing asked');
      reply('textDocument/codeAction', [{ title: 'Show the code here', kind: 'source', disabled: { reason: 'the step shows its code already' }, data: { kind: 'excerpt', open: 2 } }]);
      ed.selection = new vscode.Selection(1, 0, 1, 0);
      await vscode.commands.executeCommand('durandal.plan.excerpt');
      await until(() => !shown(3) || undefined, 'closed again');
      assert.equal(asked(), before + 1, 'asked once');
      assert.equal(ed.selection.active.line, 1, 'the cursor stays');
    } finally {
      await vscode.commands.executeCommand('workbench.action.closeActiveEditor');
      await settle(XPLAN, null);
    }
  });

  it('files: section · text in a pick; an item with a file opens it at its line, one without moves in the plan', async () => {
    const a = await running();
    const ui = new FakeUi();
    a.setUi(ui);
    const main = file('one/main.py').fsPath;
    reply('olifant/plans/files', { items: [
      { section: 'T', row: 1, text: '- a', file: null, line: null },
      { section: 'Next', row: 8, text: '- [ ] step', file: main, line: 1 },
    ] });
    ui.onPick = o => o.items[1].value;
    await at(1);
    await vscode.commands.executeCommand('durandal.plan.files');
    assert.deepEqual(ui.picks[0].items.map(i => [i.label, i.detail]), [['T · - a', 'line 2'], ['Next · - [ ] step', `${main}:1`]]);
    assert.equal(vscode.window.activeTextEditor!.document.uri.fsPath, main);
    ui.onPick = o => o.items[0].value;
    await at(5);
    await vscode.commands.executeCommand('durandal.plan.files');
    assert.equal(vscode.window.activeTextEditor!.selection.active.line, 1);
    reply('olifant/plans/files', { items: [] });
    await vscode.commands.executeCommand('durandal.plan.files');
    assert.equal(a.shown.at(-1)!.text, 'plans: no files');
  });

  it('stub on a step: the stub saved, its test line in the plan, the plan still active (plans_spec :736, :746)', async () => {
    const a = await running();
    const other = 'one/other.py';
    reply('olifant/plans/stub', {
      file: file(other).fsPath, line: 1, name: 'test_foo',
      edits: { changes: { [uriOf(other)]: [{ range: { start: { line: 0, character: 0 }, end: { line: 0, character: 0 } }, newText: 'def test_foo(): pass\n' }] } },
      facts: [{ after: 8, lines: ['  - test: foo @tests/test_a.py:test_foo'] }],
    });
    try {
      await at(8);
      await vscode.commands.executeCommand('durandal.plan.stub');
      assert.deepEqual(sent('olifant/plans/stub').at(-1)!.params, { textDocument: { uri: uriOf(PLAN) }, line: 8 });
      assert.ok(disk(other).includes('def test_foo'));
      assert.ok(a.shown.some(s => s.text.startsWith('stubbed test_foo')));
      assert.equal(lines()[9], '  - test: foo @tests/test_a.py:test_foo');
      assert.equal(vscode.window.activeTextEditor!.document.uri.toString(), uriOf(PLAN));
      assert.equal(a.landed.fired.at(-1), 'stub');
    } finally {
      await settle(other, 'y = 2\n');
    }
  });

  it('test on a step writes its facts; with the plan edited during the run it warns and writes none (plans_spec :757, :781)', async () => {
    const a = await running();
    reply('olifant/plans/test', { facts: [{ row: 8, text: '- [x] step @src/a.py:Foo' }], passed: 2, failed: 1, seconds: 0.5 });
    await at(8);
    await vscode.commands.executeCommand('durandal.plan.test');
    assert.equal(a.shown.at(-1)!.text, 'tests: 2 passed · 1 failed · 0.5 s');
    assert.equal(lines()[8], '- [x] step @src/a.py:Foo');
    assert.equal(a.landed.fired.at(-1), 'test');
    await revert(docOf(PLAN)!);
    reply('olifant/plans/test', { delay: 2, facts: [{ row: 8, text: '- [x] step @src/a.py:Foo ✓ abc1234' }], passed: 1, failed: 0, seconds: 3 });
    const ed = await at(8);
    const n = sent('olifant/plans/test').length;
    const p = vscode.commands.executeCommand('durandal.plan.test');
    await until(() => sent('olifant/plans/test').length > n, 'the second test asked');
    await ed.edit(b => b.insert(new vscode.Position(1, 0), 'typed\n'));
    await p;
    assert.deepEqual([a.shown.at(-1)!.level, a.shown.at(-1)!.text], ['warn', 'tests: 1 passed · 0 failed · 3 s · plan changed, press again']);
    assert.equal(lines()[9], '- [ ] step @src/a.py:Foo');
    assert.equal(a.landed.fired.at(-1), 'test');
  });
});
