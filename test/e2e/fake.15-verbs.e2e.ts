import * as assert from 'node:assert/strict';
import * as vscode from 'vscode';
import { FakeUi } from '../fakeUi';
import { api, disk, docOf, file, log, open, reply, restart, revert, running, settle, sleep, tabsUnder, until } from './helpers';

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
    // the prompt dismissed (FakeUi's default): the held blocks send nothing
    a.setUi(new FakeUi());
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

  // held: a FakeUi whose prompt waits for the test to answer it
  function held(): { ui: FakeUi; answer(pick: string | undefined): void } {
    const ui = new FakeUi();
    let answer!: (pick: string | undefined) => void;
    ui.onAsk = () => new Promise(r => { answer = r; });
    return { ui, answer: pick => answer(pick) };
  }

  const VALIDATE = {
    id: 'V1', verb: 'validate', facts: [], blocks: [{ after: 0, after_text: '- e target line', lines: [{ text: '  - ok', fp: null }] }],
    dropped: 0, unresolved: 0, seconds: 1, cost: null, changed: [], review: null,
  };

  it('validate: the blocks beside the plan, then Accept all; the rows followed the typing (plans_spec :631)', async () => {
    const a = await running();
    const h = held();
    a.setUi(h.ui);
    reply('olifant/plans/validate', VALIDATE);
    const ed = await at(2);
    const outcomes = sent('olifant/plans/outcome').length;
    await vscode.commands.executeCommand('durandal.plan.validate');
    await until(() => h.ui.asks.length === 1, 'the prompt');
    assert.equal(h.ui.asks[0], 'validate: 1 lines in 1 blocks');
    assert.ok(a.shown.some(s => s.text === 'validate: 1 lines · 0 not found · 1 s'));
    await until(() => tabsUnder('/plans/v/').length === 1, 'the proposal beside the plan');
    assert.equal(docOf(PLAN)!.getText(), TEXT, 'nothing written before the answer');
    assert.deepEqual(a.planVerbs.waiting(uriOf(PLAN)), [{ row: 5, lines: ['  - ok'] }]);
    await ed.edit(b => b.insert(new vscode.Position(0, 0), 'typed\n'));
    assert.deepEqual(a.planVerbs.waiting(uriOf(PLAN)), [{ row: 6, lines: ['  - ok'] }]);
    h.answer('Accept all');
    await until(() => lines()[7] === '  - ok', 'the block under the target line');
    assert.equal(lines()[6], '- e target line');
    await until(() => sent('olifant/plans/outcome').length === outcomes + 1, 'the outcome');
    assert.deepEqual(sent('olifant/plans/outcome').at(-1)!.params, { textDocument: { uri: uriOf(PLAN) }, id: 'V1', block: 0, outcome: 'accepted' });
    assert.equal(a.landed.fired.at(-1), 'accept');
    await until(() => tabsUnder('/plans/v/').length === 0, 'the proposal closed');
    assert.deepEqual(a.planVerbs.waiting(uriOf(PLAN)), []);
  });

  it('Reject all sends rejected and writes nothing; a dismissed prompt sends nothing', async () => {
    const a = await running();
    const h = held();
    a.setUi(h.ui);
    reply('olifant/plans/validate', VALIDATE);
    await at(2);
    const outcomes = sent('olifant/plans/outcome').length;
    await vscode.commands.executeCommand('durandal.plan.validate');
    await until(() => h.ui.asks.length === 1, 'the prompt');
    h.answer('Reject all');
    await until(() => sent('olifant/plans/outcome').length === outcomes + 1, 'the outcome');
    assert.equal(sent('olifant/plans/outcome').at(-1)!.params.outcome, 'rejected');
    assert.equal(docOf(PLAN)!.getText(), TEXT);
    await vscode.commands.executeCommand('durandal.plan.validate');
    await until(() => h.ui.asks.length === 2, 'the second prompt');
    h.answer(undefined);
    await until(() => tabsUnder('/plans/v/').length === 0, 'the proposal closed');
    await sleep(300);
    assert.equal(sent('olifant/plans/outcome').length, outcomes + 1);
    assert.equal(docOf(PLAN)!.getText(), TEXT);
  });

  it('a do with no review (no git) replaces its step when accepted (plans_spec :641)', async () => {
    const a = await running();
    const ui = new FakeUi();
    ui.onAsk = () => 'Accept all';
    a.setUi(ui);
    reply('olifant/plans/do', {
      id: 'D1', verb: 'do', facts: [], dropped: 0, unresolved: 0, seconds: 2, cost: null, changed: [], review: null,
      blocks: [{ after: 8, after_text: null, lines: [{ text: '- [x] step @src/a.py:Foo', fp: null }, { text: '  - did it', fp: null }] }],
    });
    await at(8);
    await vscode.commands.executeCommand('durandal.plan.do');
    await until(() => lines()[9] === '  - did it', 'the do landed');
    assert.equal(lines()[8], '- [x] step @src/a.py:Foo');
    assert.ok(a.landed.fired.includes('do'));
  });

  it('with reviewAnswers an ask waits for the prompt (plans_spec :560)', async () => {
    const a = await running();
    const ui = new FakeUi();
    ui.onAsk = () => 'Accept all';
    a.setUi(ui);
    await vscode.workspace.getConfiguration('durandal.plans').update('reviewAnswers', true, vscode.ConfigurationTarget.Global);
    try {
      await sleep(200);
      reply('olifant/plans/ask', {
        id: 'S4', verb: 'ask', facts: [], blocks: [{ after: 3, after_text: null, lines: [{ text: '  - a @src/a.py:F', fp: 'abc1234' }, { text: '  - so', fp: null }] }],
        dropped: 1, unresolved: 0, seconds: 9.1, cost: 0.0123, changed: [], review: null,
      });
      await at(3);
      await vscode.commands.executeCommand('durandal.plan.ask');
      await until(() => ui.asks.length === 1, 'the prompt');
      assert.ok(a.shown.some(s => s.text === 'ask: 2 lines · 1 not found · 9.1 s · $0.0123'));
      await until(() => lines()[4] === '  - a @src/a.py:F ✓ abc1234', 'accepted, stamped');
    } finally {
      await vscode.workspace.getConfiguration('durandal.plans').update('reviewAnswers', undefined, vscode.ConfigurationTarget.Global);
    }
  });

  it('a server stop while the prompt waits: Accept all then writes and sends nothing', async () => {
    const a = await running();
    const h = held();
    a.setUi(h.ui);
    reply('olifant/plans/validate', VALIDATE);
    await at(2);
    await vscode.commands.executeCommand('durandal.plan.validate');
    await until(() => h.ui.asks.length === 1, 'the prompt');
    await restart();
    const outcomes = sent('olifant/plans/outcome').length;
    h.answer('Accept all');
    await sleep(500);
    assert.equal(docOf(PLAN)!.getText(), TEXT);
    assert.equal(sent('olifant/plans/outcome').length, outcomes);
  });

  it('p y and p n are milestone 7', async () => {
    const a = await running();
    await at(1);
    await vscode.commands.executeCommand('durandal.plan.accept');
    assert.equal(a.shown.at(-1)!.text, 'Durandal: Plan: Accept is not implemented yet (milestone 7)');
    await vscode.commands.executeCommand('durandal.plan.reject');
    assert.equal(a.shown.at(-1)!.text, 'Durandal: Plan: Reject is not implemented yet (milestone 7)');
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
