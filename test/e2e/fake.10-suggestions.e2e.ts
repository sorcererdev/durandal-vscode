import * as assert from 'node:assert/strict';
import { mkdtempSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import * as vscode from 'vscode';
import { FakeUi } from '../fakeUi';
import { actionLog, api, file, log, open, reply, restart, revert, settle, sleep, until } from './helpers';

const MAIN = 'one/main.py';
const uri = () => file(MAIN).toString();
const pushFile = join(mkdtempSync(join(tmpdir(), 'durandal-push-')), 'suggestion.json');
// push sets what the fake pushes after every edit (FAKE_LSP_SUGGEST: its uri and version filled)
const push = (s: Record<string, unknown>) => writeFileSync(pushFile, JSON.stringify(s));
const FOLLOWUP = { kind: 'followup', label: 'Failure arms', summary: '1 file', line: 1, lines: null, at: 1, planId: 7, generator: null, sets: {} };
// a ghost going under line 0 (at 1, line 2: server lines are 1-based)
const GHOST = { ...FOLLOWUP, kind: 'ghost', label: 'Arms', lines: ['case A():', '    return x'], line: 2, at: 1 };
const GHOST_TEXT = 'x = 10\ncase A():\n    return x';
const plans = () => log().filter(m => m.method === 'olifant/plan');
const events = (from: number, name: string) => actionLog().slice(from).filter(e => e.event === name);

// edited opens main.py as "x = 1\n", types on line 0 (the fake pushes for that version) and
// leaves the cursor at its end.
async function edited(): Promise<vscode.TextEditor> {
  await settle(MAIN, 'x = 1\n');
  const ed = await open(file(MAIN));
  await ed.edit(b => b.insert(new vscode.Position(0, 5), '0'));
  const at = new vscode.Position(0, 6);
  ed.selection = new vscode.Selection(at, at);
  return ed;
}

const shownKind = async () => (await api()).suggest.state(uri())?.kind;

describe('pushed and pulled suggestions (fake server)', () => {
  before(async () => {
    push(FOLLOWUP);
    process.env.FAKE_LSP_SUGGEST = pushFile;
    await restart();
  });
  after(async () => {
    delete process.env.FAKE_LSP_SUGGEST;
    await restart();
  });
  afterEach(async () => {
    for (const m of ['olifant/plan', 'olifant/suggest', 'textDocument/inlayHint', 'olifant/choices', 'textDocument/codeAction']) reply(m, null);
    push(FOLLOWUP);
    (await api()).setUi(undefined);
    await vscode.workspace.getConfiguration('durandal').update('ghosts', undefined, vscode.ConfigurationTarget.Global);
    const d = vscode.workspace.textDocuments.find(x => x.uri.toString() === uri());
    if (d?.isDirty) await revert(d);
    // each case types the same line: a dismissal (forgotten when VS Code drops the document,
    // which it does lazily) must not carry over
    (await api()).suggest.controller.closed(uri());
  });

  it('a push shows for its version and line only; its plan is asked once', async () => {
    reply('olifant/plan', { plan: { files: [], conflicts: [], warnings: [], holes: [], snippet: null } });
    const from = actionLog().length;
    const before = plans().length;
    const ed = await edited();
    await until(async () => (await shownKind()) === 'followup', 'the follow-up shown');
    assert.deepEqual(plans().slice(before).map(m => m.params), [{ planId: 7 }]);
    assert.equal(events(from, 'followup-shown').length, 1);
    ed.selection = new vscode.Selection(1, 0, 1, 0);
    await until(async () => (await shownKind()) === undefined, 'cleared off its line');
    ed.selection = new vscode.Selection(0, 6, 0, 6);
    await until(async () => (await shownKind()) === 'followup', 'shown again on its line');
    assert.equal(plans().length - before, 1, 'the plan asked once per push');
  });

  it('the ⚡ hint is hidden on the suggestion\'s line and comes back', async () => {
    reply('olifant/plan', { plan: { files: [], conflicts: [], warnings: [], holes: [], snippet: null } });
    reply('textDocument/inlayHint', [{ position: { line: 0, character: 6 }, label: '⚡ Wire', paddingLeft: true }]);
    const hintsAt = () => vscode.commands.executeCommand<vscode.InlayHint[]>('vscode.executeInlayHintProvider', file(MAIN), new vscode.Range(0, 0, 1, 0));
    await edited();
    await until(async () => (await shownKind()) === 'followup', 'the follow-up shown');
    assert.equal((await hintsAt()).length, 0);
    await vscode.commands.executeCommand('durandal.suggest.dismiss');
    assert.equal((await hintsAt()).length, 1);
  });

  it('Esc dismisses and remembers the line; the action log says so', async () => {
    reply('olifant/plan', { plan: { files: [], conflicts: [], warnings: [], holes: [], snippet: null } });
    const from = actionLog().length;
    const ed = await edited();
    await until(async () => (await shownKind()) === 'followup', 'the follow-up shown');
    await vscode.commands.executeCommand('durandal.suggest.dismiss');
    assert.equal(await shownKind(), undefined);
    assert.equal(events(from, 'followup-dismissed').length, 1);
    ed.selection = new vscode.Selection(1, 0, 1, 0);
    await sleep(500);
    ed.selection = new vscode.Selection(0, 6, 0, 6);
    await sleep(1000);
    assert.equal(await shownKind(), undefined, 'not offered again on this line\'s text');
  });

  it('ghosts off: nothing pulled, nothing shown', async () => {
    await vscode.workspace.getConfiguration('durandal').update('ghosts', false, vscode.ConfigurationTarget.Global);
    const n = log().filter(m => m.method === 'olifant/suggest' || m.method === 'olifant/plan').length;
    await edited();
    await sleep(1000);
    assert.equal(log().filter(m => m.method === 'olifant/suggest' || m.method === 'olifant/plan').length, n);
    assert.equal(await shownKind(), undefined);
  });

  it('a restart clears the shown follow-up', async () => {
    reply('olifant/plan', { plan: { files: [], conflicts: [], warnings: [], holes: [], snippet: null } });
    await edited();
    await until(async () => (await shownKind()) === 'followup', 'the follow-up shown');
    assert.match((await api()).suggest.decorated(uri()) ?? '', /^⚡ Tab: review Failure arms/);
    await restart();
    assert.equal(await shownKind(), undefined);
    assert.equal((await api()).suggest.decorated(uri()), undefined, 'no decoration left');
  });

  // planned: main.py's plan as the fake answers it, against the text as it is now
  const planned = (before: string, after: string) => ({
    plan: { files: [{ path: 'main.py', before, after }], conflicts: [], warnings: [], holes: [], snippet: null },
    edit: { changes: { [uri()]: [{ range: { start: { line: 0, character: 0 }, end: { line: 1, character: 0 } }, newText: after.split('\n')[0] + '\n' }] } },
  });

  it('Tab reviews the follow-up; Apply asks plan{planId, fill:true} and lands it', async () => {
    reply('olifant/plan', planned('x = 10\n', 'x = 11\n'));
    const a = await api();
    const ui = new FakeUi();
    ui.onReview = () => ({ kind: 'apply' });
    a.setUi(ui);
    const from = actionLog().length;
    const ed = await edited();
    await until(async () => (await shownKind()) === 'followup', 'the follow-up shown');
    const before = plans().length;
    await vscode.commands.executeCommand('durandal.suggest.accept');
    await until(() => plans().slice(before).some(m => m.params.fill === true), 'plan{fill:true} sent');
    assert.deepEqual(plans().slice(before).find(m => m.params.fill === true)!.params, { planId: 7, fill: true });
    await until(() => ed.document.getText() === 'x = 11\n', 'landed');
    assert.ok(ui.log.includes('review Failure arms'));
    assert.equal(events(from, 'followup-reviewed').length, 1);
    assert.equal(events(from, 'followup-applied').length, 1);
  });

  // asks: the asks on a suggestion ghost's line 0 after the count FROM; served: those served
  const asks = (a: Awaited<ReturnType<typeof api>>, from: number) => a.suggest.served.since(from).filter(s => s.uri === uri() && s.line === 0);
  const served = (a: Awaited<ReturnType<typeof api>>, from: number) => asks(a, from).filter(s => s.insertText !== undefined);

  it('a ghost going above the line: the band only, reviewed first, Apply lands the filled plan (decision 8)', async () => {
    push({ ...FOLLOWUP, kind: 'ghost', label: 'Arms', lines: ['case A():', '    return x'] });
    reply('olifant/plan', planned('x = 10\n', 'x = 12\n'));
    const a = await api();
    const ui = new FakeUi();
    ui.onReview = () => ({ kind: 'apply' });
    a.setUi(ui);
    const ed = await edited();
    const n = a.suggest.served.count;
    await until(async () => (await shownKind()) === 'ghost', 'the ghost block shown');
    assert.equal(a.suggest.decorated(uri()), '⚡ Tab: Arms (+2 lines)');
    await vscode.commands.executeCommand('editor.action.inlineSuggest.trigger');
    await until(() => asks(a, n).length > 0, 'the inline provider asked on the ghost\'s line');
    await sleep(300);
    assert.deepEqual(served(a, n), [], 'no ghost lines served');
    await vscode.commands.executeCommand('durandal.suggest.accept');
    await until(() => ed.document.getText() === 'x = 12\n', 'landed');
    assert.ok(ui.log.includes('review Arms'));
  });

  it('a ghost going under the line: its lines served under it; Tab (ghostInline) hides them, reviews, Apply fills', async () => {
    push(GHOST);
    reply('olifant/plan', planned('x = 10\n', 'x = 12\n'));
    const a = await api();
    const ui = new FakeUi();
    ui.onReview = () => ({ kind: 'apply' });
    a.setUi(ui);
    const n = a.suggest.served.count;
    const ed = await edited();
    await until(() => served(a, n).some(s => s.insertText === GHOST_TEXT), 'the ghost lines served');
    assert.equal(a.suggest.decorated(uri()), '⚡ Tab: Arms (+2 lines)', 'the band stays');
    const before = plans().length;
    await vscode.commands.executeCommand('durandal.suggest.accept');
    await until(() => ed.document.getText() === 'x = 12\n', 'landed');
    assert.deepEqual(plans().slice(before).find(m => m.params.fill === true)!.params, { planId: 7, fill: true });
    assert.ok(ui.log.includes('review Arms'));
  });

  it('the hover toolbar\'s Accept (a commit) inserts the lines as they stand: ghost-inserted, the band gone, no fill', async () => {
    push(GHOST);
    const a = await api();
    const from = actionLog().length;
    const n = a.suggest.served.count;
    const ed = await edited();
    await until(() => served(a, n).some(s => s.insertText === GHOST_TEXT), 'the ghost lines served');
    await sleep(400);
    const before = plans().length;
    await vscode.commands.executeCommand('editor.action.inlineSuggest.commit');
    await until(() => ed.document.getText() === GHOST_TEXT + '\n', 'inserted');
    await until(() => events(from, 'ghost-inserted').length === 1, 'logged');
    assert.equal(events(from, 'ghost-inserted')[0].generator, 'Arms');
    await until(async () => (await shownKind()) !== 'ghost', 'the band gone');
    await sleep(300);
    assert.ok(!plans().slice(before).some(m => m.params.fill === true), 'no fill');
  });

  it('Esc (ghostInline) on the ghost lines hides them and dismisses the ghost on that line', async () => {
    push(GHOST);
    const a = await api();
    const from = actionLog().length;
    const n = a.suggest.served.count;
    const ed = await edited();
    await until(() => served(a, n).some(s => s.insertText === GHOST_TEXT), 'the ghost lines served');
    await sleep(400);
    await vscode.commands.executeCommand('durandal.suggest.dismiss');
    assert.equal(await shownKind(), undefined);
    assert.equal(events(from, 'ghost-dismissed').length, 1);
    await vscode.commands.executeCommand('editor.action.inlineSuggest.commit');
    await sleep(300);
    assert.equal(ed.document.getText(), 'x = 10\n', 'nothing left to commit');
  });

  const REC = { ...FOLLOWUP, kind: 'recognition', label: 'Command', generator: 'p/command', sets: { command: 'x' }, band: 'offer', or: null, reasons: ['the name fits'], score: 0.8, planId: 8 };
  const feedback = () => log().filter(m => m.method === 'olifant/recognitionFeedback').map(m => m.params.outcome as string);

  it('a recognition offer: Tab reviews, Apply lands and says accepted; Esc says dismissed', async () => {
    push(REC);
    reply('olifant/plan', planned('x = 10\n', 'x = 13\n'));
    const a = await api();
    const ui = new FakeUi();
    ui.onReview = () => ({ kind: 'apply' });
    a.setUi(ui);
    const n = feedback().length;
    const ed = await edited();
    await until(async () => (await shownKind()) === 'recognition', 'the offer shown');
    await vscode.commands.executeCommand('durandal.suggest.accept');
    await until(() => ed.document.getText() === 'x = 13\n', 'landed');
    await until(() => feedback().length > n, 'feedback');
    assert.deepEqual(feedback().slice(n), ['accepted']);
    await revert(ed.document);
    await edited();
    await until(async () => (await shownKind()) === 'recognition', 'offered again after the revert');
    await vscode.commands.executeCommand('durandal.suggest.dismiss');
    await until(() => feedback().length > n + 1, 'dismissed said');
    assert.equal(feedback().at(-1), 'dismissed');
  });

  it('a recognition choice: Which is it?, the choices loop, then plan{recognize: true}', async () => {
    push({ ...REC, or: 'p/add-query' });
    reply('olifant/choices', { inputs: [{ name: 'query', optional: false, default: null, prompt: 'its name', choices: null }] });
    reply('olifant/plan', planned('x = 10\n', 'x = 14\n'));
    const a = await api();
    const ui = new FakeUi();
    ui.onPick = o => (o.title === 'Which is it?' ? o.items[1].value : undefined);
    a.setUi(ui);
    await edited();
    await until(async () => (await shownKind()) === 'recognition', 'the choice shown');
    const run = vscode.commands.executeCommand('durandal.suggest.accept');
    const t = await until(() => ui.texts.at(-1), 'the input asked');
    assert.equal(t.title, 'query: its name');
    t.finish('find_tables');
    await run;
    const choices = log().filter(m => m.method === 'olifant/choices').at(-1)!;
    assert.deepEqual(choices.params, { textDocument: { uri: uri() }, generator: 'p/add-query', sets: { query: 'find_tables' } });
    const p = plans().at(-1)!;
    assert.deepEqual(p.params, { textDocument: { uri: uri() }, generator: 'p/add-query', sets: { query: 'find_tables' }, recognize: true });
    assert.ok(ui.log.includes('review add query'));
  });

  it('a recognition hint: quiet (no plan asked), first in the ⚡ menu, and "show again" says reset', async () => {
    push({ ...REC, band: 'hint' });
    reply('textDocument/codeAction', []);
    const a = await api();
    const ui = new FakeUi();
    let menu: string[] = [];
    ui.onPick = o => {
      if (o.title !== 'Olifant') return undefined;
      menu = o.items.map(i => i.label);
      return o.items[1].value;
    };
    a.setUi(ui);
    const before = plans().length;
    const n = feedback().length;
    await edited();
    await until(async () => (await api()).suggest.state(uri())?.band === 'hint', 'the hint shown');
    assert.equal(plans().length, before, 'a hint asks no plan');
    await vscode.commands.executeCommand('durandal.actions');
    assert.deepEqual(menu, ['⚡ Command  (the name fits)', 'Show recognitions for command again']);
    await until(() => feedback().length > n, 'reset said');
    assert.equal(feedback().at(-1), 'reset');
  });
});
