import * as assert from 'node:assert/strict';
import * as vscode from 'vscode';
import { actionLog, api, count, file, log, open, reply, revert, running, settle, sleep, until } from './helpers';

const MAIN = 'one/main.py';
const uri = () => file(MAIN).toString();
const BODY = 'class ${1:Name}:\n    ${2:pass}$0';
const FILLED = 'class ${1:Cancelled}:\n    ${2:reason: str}$0';
const RANGE = { start: { line: 1, character: 0 }, end: { line: 1, character: 0 } };
const DATA = { kind: 'action', path: '/one/main.py', generator: 'p/failure', sets: { app: 'bistro' }, line: 2 };

const inline = (o: Record<string, unknown> = {}) => reply('textDocument/inlineCompletion', {
  items: [{ insertText: { kind: 'snippet', value: BODY }, range: RANGE, filterText: '', ghost: ['class ⟨Name⟩:', '    pass'], data: DATA, ...o }],
});
const resolved = (o: Record<string, unknown> = {}) => reply('completionItem/resolve', { label: 'p/failure', data: DATA, textEdit: { range: RANGE, newText: FILLED }, ...o });
const asked = () => count('textDocument/inlineCompletion');
const events = (from: number, name: string) => actionLog().slice(from).filter(e => e.event === name);

// show opens main.py ("x = 1\n"), puts the cursor on the empty line 1 and asks VS Code for
// the inline suggestion until Durandal records it.
async function show(): Promise<vscode.TextEditor> {
  await settle(MAIN, 'x = 1\n');
  const ed = await open(file(MAIN));
  const at = new vscode.Position(1, 0);
  ed.selection = new vscode.Selection(at, at);
  const a = await api();
  await until(async () => {
    await vscode.commands.executeCommand('editor.action.inlineSuggest.trigger');
    await sleep(300);
    return a.suggest.state(uri())?.kind === 'snippet';
  }, 'the snippet ghost recorded');
  return ed;
}

describe('ghost text and snippets (fake server)', () => {
  // one editor group: the inline suggestion is asked of the focused editor, and an earlier
  // suite's second group may hold main.py with its cursor elsewhere
  before(() => vscode.commands.executeCommand('workbench.action.closeAllGroups'));

  afterEach(async () => {
    reply('textDocument/inlineCompletion', null);
    reply('completionItem/resolve', null);
    reply('textDocument/completion', null);
    await vscode.workspace.getConfiguration('durandal').update('ghosts', undefined, vscode.ConfigurationTarget.Global);
    const d = vscode.workspace.textDocuments.find(x => x.uri.toString() === uri());
    if (d?.isDirty) await revert(d);
    // the inserted snippet's session (its tab stops): VS Code shows no inline suggestion in one
    await vscode.commands.executeCommand('leaveSnippet');
  });

  it('the anticipated snippet: recorded and logged; Tab inserts it, resolve fills it in place', async () => {
    await running();
    inline();
    resolved();
    const from = actionLog().length;
    const ed = await show();
    assert.equal(events(from, 'snippet-shown').length, 1);
    // nothing more anticipated: VS Code asks again on the filled line, where the fake would
    // otherwise answer the same snippet
    reply('textDocument/inlineCompletion', null);
    await vscode.commands.executeCommand('editor.action.inlineSuggest.commit');
    await until(() => ed.document.getText().includes('class Cancelled:'), 'the filled body in place');
    assert.equal(ed.document.getText(), 'x = 1\nclass Cancelled:\n    reason: str');
    const r = log().filter(m => m.method === 'completionItem/resolve').at(-1)!;
    assert.deepEqual(r.params.label, 'p/failure');
    assert.deepEqual(r.params.data, DATA);
    assert.deepEqual(r.params.textEdit, { range: RANGE, newText: BODY });
    assert.equal((await api()).suggest.fills.at(-1), 'filled');
    assert.equal(events(from, 'snippet-applied').length, 1);
    assert.equal((await api()).suggest.state(uri()), undefined, 'the line changed: cleared');
  });

  it('an edit while the model fills keeps the user\'s text and the unfilled snippet', async () => {
    await running();
    inline();
    resolved({ delay: 2 });
    const ed = await show();
    const fills = (await api()).suggest.fills.length;
    await vscode.commands.executeCommand('editor.action.inlineSuggest.commit');
    await until(() => ed.document.getText().includes('class Name:'), 'the unfilled body inserted');
    await ed.edit(b => b.insert(new vscode.Position(0, 0), '# '));
    await until(async () => (await api()).suggest.fills.length > fills, 'the fill done', 10_000);
    assert.equal((await api()).suggest.fills.at(-1), 'changed');
    assert.equal(ed.document.getText(), '# x = 1\nclass Name:\n    pass');
  });

  it('Esc remembers the line: dismissed, logged, not shown again there', async () => {
    await running();
    inline();
    const from = actionLog().length;
    await show();
    await vscode.commands.executeCommand('durandal.suggest.dismiss');
    const a = await api();
    assert.equal(a.suggest.state(uri()), undefined);
    assert.equal(events(from, 'snippet-dismissed').length, 1);
    const n = asked();
    await vscode.commands.executeCommand('editor.action.inlineSuggest.trigger');
    await until(() => asked() > n, 'asked again');
    await sleep(300);
    assert.equal(a.suggest.state(uri()), undefined, 'still dismissed');
  });

  it('ghosts off: nothing asked, nothing shown; the toggle flips the setting', async () => {
    await running();
    inline();
    await vscode.commands.executeCommand('durandal.ghosts.toggle');
    assert.equal(vscode.workspace.getConfiguration('durandal').get('ghosts'), false);
    await settle(MAIN, 'x = 1\n');
    const ed = await open(file(MAIN));
    ed.selection = new vscode.Selection(1, 0, 1, 0);
    const n = asked();
    await vscode.commands.executeCommand('editor.action.inlineSuggest.trigger');
    await sleep(800);
    assert.equal(asked(), n);
    assert.equal((await api()).suggest.state(uri()), undefined);
    await vscode.commands.executeCommand('durandal.ghosts.toggle');
    assert.equal(vscode.workspace.getConfiguration('durandal').get('ghosts'), true);
  });

  it('a ghost of 9 lines is not shown', async () => {
    await running();
    inline({ ghost: Array(9).fill('x') });
    await settle(MAIN, 'x = 1\n');
    const ed = await open(file(MAIN));
    // a new version: VS Code keeps its last answer for a cursor and version (the ghosts-off
    // case's, none) and would not ask again
    await ed.edit(b => b.insert(new vscode.Position(0, 5), ' '));
    ed.selection = new vscode.Selection(1, 0, 1, 0);
    const atCursor = () => log().filter(m => m.method === 'textDocument/inlineCompletion' && m.params.position.line === 1).length;
    const n = atCursor();
    await vscode.commands.executeCommand('editor.action.inlineSuggest.trigger');
    await until(() => atCursor() > n, 'asked at the cursor');
    await sleep(300);
    assert.equal((await api()).suggest.state(uri()), undefined);
  });

  it('a snippet in the completion list carries the fill command', async () => {
    await running();
    reply('textDocument/completion', [{
      label: 'Failure', kind: 15, detail: 'p/failure', insertTextFormat: 2, filterText: 'Failure',
      textEdit: { range: RANGE, newText: BODY }, data: DATA,
    }]);
    await settle(MAIN, 'x = 1\n');
    await open(file(MAIN));
    const list = await vscode.commands.executeCommand<vscode.CompletionList>('vscode.executeCompletionItemProvider', file(MAIN), new vscode.Position(1, 0));
    const it = list.items.find(i => i.label === 'Failure');
    assert.ok(it, JSON.stringify(list.items.map(i => i.label)));
    assert.equal(it.command?.command, 'durandal.snippet.fill');
    const arg = it.command?.arguments?.[0] as { body: string; data: { generator: string }; uri: string };
    assert.equal(arg.body, BODY);
    assert.equal(arg.data.generator, 'p/failure');
    assert.equal(arg.uri, uri());
  });
});
