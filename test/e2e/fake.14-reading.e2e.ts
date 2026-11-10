import * as assert from 'node:assert/strict';
import { writeFileSync } from 'node:fs';
import { join } from 'node:path';
import * as vscode from 'vscode';
import { Olifant } from '../../src/protocol';
import { encode } from '../planTokens';
import { docOf, file, log, open, reply, revert, running, settle, sleep, until, ws } from './helpers';

// The plans reading layer over the fake server (M6 spec §3, §8): detection, the reading model,
// glyphs, the verdict margin, folds and conclusions, the Enter rule, the excerpt guard.
const PLAN = 'one/plans/p.md';
const PLAN_DEFAULT = '# A plan\n\n- [ ] a step\n';
const plansConfig = () => vscode.workspace.getConfiguration('durandal.plans');

const PLAN_TEXT = [
  '# A plan',                                   // 0
  '',                                           // 1
  '- [ ] a step @src/a.py:F',                   // 2
  '- [x] done step @src/a.py:F ✓ abc1234',      // 3
  '  - 25 Oct 21:31 · do (sonnet) · answered',  // 4
  '- ? Why F?',                                 // 5
  '  - because @src/a.py:F ✓ abc1234',          // 6
  '  - A later note.',                          // 7
  '',
].join('\n');

const TOKENS = encode([
  [2, 0, 6, 'planMarker'], [2, 6, 6, 'planStep'], [2, 13, 10, 'planAnchorPath'], [2, 23, 1, 'planAnchorUnit'],
  [3, 0, 6, 'planMarker'], [3, 6, 9, 'planStepDone'], [3, 16, 10, 'planAnchorPath'], [3, 26, 1, 'planAnchorUnit'], [3, 28, 1, 'planVerdict'], [3, 30, 7, 'planFingerprint'],
  [4, 2, 2, 'planMarker', ['done']], [4, 4, 37, 'planJournal', ['done']],
  [5, 0, 4, 'planMarker'], [5, 4, 6, 'planQuestion'],
  [6, 2, 2, 'planMarker'], [6, 4, 7, 'planEvidence'], [6, 12, 10, 'planAnchorPath'], [6, 22, 1, 'planAnchorUnit'], [6, 24, 1, 'planVerdict'], [6, 26, 7, 'planFingerprint'],
  [7, 2, 2, 'planMarker'], [7, 4, 13, 'planClaim'],
]);
const FOLDS = [{ startLine: 3, endLine: 4, kind: 'region' }, { startLine: 5, endLine: 7, kind: 'region' }];
const uriOf = (rel: string) => file(rel).toString();

// canned: the plan's tokens, folds and lenses as the server would answer them
function canned(lenses: unknown[] = []): void {
  reply('textDocument/semanticTokens/full', { data: TOKENS });
  reply('textDocument/foldingRange', FOLDS);
  reply('textDocument/codeLens', lenses);
}

// a diagnostic as the server sends it (LSP severities 1 Error .. 4 Hint)
const diag = (line: number, code: string | undefined, severity: number, source = 'olifant-plan') =>
  ({ range: { start: { line, character: 4 }, end: { line, character: 10 } }, severity, source, message: 'm', ...(code ? { code } : {}) });

// repull: the server asks the client to pull diagnostics again (workspace/diagnostic/refresh),
// sent before the answer to a request the test makes
async function repull(uri: string): Promise<void> {
  const a = await running();
  reply('olifant/plans/files', { notify: [{ method: 'workspace/diagnostic/refresh', params: null, request: true }], items: [] });
  await a.server.request(Olifant.plansFiles, { textDocument: { uri } });
}

// fresh: the plan open, its reading at the document's version
async function fresh(): Promise<vscode.TextEditor> {
  const a = await running();
  const ed = await open(file(PLAN));
  const v = () => ed.document.version;
  await until(() => {
    const r = a.planView.reading(uriOf(PLAN));
    return r?.tokens?.version === v() && r.folds?.version === v();
  }, 'the plan\'s reading at its version');
  return ed;
}

const EXCERPT_TEXT = [
  '# Excerpts',                          // 0
  '',                                    // 1
  '- [ ] show F @src/a.py:F',            // 2
  '  ```python @src/a.py:F',             // 3
  '  def F():',                          // 4
  '      return 1',                      // 5
  '  ```',                               // 6
  '- [x] done @src/a.py:F ✓ abc1234',    // 7
  '  - a child',                         // 8
  '',
].join('\n');
const EXCERPT_FOLDS = [{ startLine: 3, endLine: 6, kind: 'region' }, { startLine: 7, endLine: 8, kind: 'region' }];

// a new plan file, its text written, opened
async function newPlan(name: string, text: string): Promise<vscode.TextEditor> {
  writeFileSync(join(ws(), `one/plans/${name}`), text);
  return open(file(`one/plans/${name}`));
}
const visibleRow = (ed: vscode.TextEditor, row: number) => ed.visibleRanges.some(r => r.start.line <= row && row <= r.end.line);

describe('the plans reading layer (fake server)', () => {
  before(async () => {
    await vscode.commands.executeCommand('workbench.action.closeAllGroups');
    // themes decide whether VS Code asks for semantic tokens: the suite does not depend on one
    await vscode.workspace.getConfiguration('editor').update('semanticHighlighting.enabled', true, vscode.ConfigurationTarget.Global);
  });

  after(async () => {
    await vscode.commands.executeCommand('workbench.action.closeAllEditors');
    await vscode.workspace.getConfiguration('editor').update('semanticHighlighting.enabled', undefined, vscode.ConfigurationTarget.Global);
    for (const k of ['dir', 'conceal', 'glyphs', 'foldDone']) await plansConfig().update(k, undefined, vscode.ConfigurationTarget.Global);
    await settle(PLAN, PLAN_DEFAULT);
    for (const n of ['f1', 'f2', 'f3', 'f4', 'f5', 'f6', 'x1', 'x2', 'e1']) await settle(`one/plans/${n}.md`, null);
    // the suites after this one get the fake's default answers again
    for (const m of ['textDocument/semanticTokens/full', 'textDocument/foldingRange', 'textDocument/codeLens']) reply(m, null);
  });

  beforeEach(async () => {
    canned();
    await settle(PLAN, PLAN_TEXT);
  });

  afterEach(async () => {
    reply('textDocument/diagnostic', null);
    for (const k of ['conceal', 'glyphs', 'foldDone']) await plansConfig().update(k, undefined, vscode.ConfigurationTarget.Global);
    const d = docOf(PLAN);
    if (d?.isDirty) await revert(d);
  });

  it('a plan\'s tokens, folds and lenses are copied at its version; another file\'s are not (spec §3.2)', async () => {
    const a = await running();
    canned([{ range: { start: { line: 2, character: 0 }, end: { line: 2, character: 0 } }, command: { title: '1 delegation', command: 'olifant.plans.errand', arguments: [uriOf(PLAN), 2] } }]);
    await fresh();
    const r = a.planView.reading(uriOf(PLAN))!;
    assert.deepEqual(r.tokens!.toks.filter(t => t.line === 3).map(t => t.type),
      ['planMarker', 'planStepDone', 'planAnchorPath', 'planAnchorUnit', 'planVerdict', 'planFingerprint']);
    assert.deepEqual([...r.tokens!.toks.find(t => t.line === 4)!.modifiers], ['done']);
    assert.deepEqual(r.folds!.ranges, [{ start: 3, end: 4 }, { start: 5, end: 7 }]);
    await until(() => a.planView.reading(uriOf(PLAN))?.lenses, 'the lenses');
    assert.deepEqual(a.planView.reading(uriOf(PLAN))!.lenses!.items, [{ line: 2, command: 'olifant.plans.errand', args: [uriOf(PLAN), 2] }]);
    await open(file('one/main.py'));
    await sleep(500);
    assert.equal(a.planView.reading(uriOf('one/main.py')), undefined);
  });

  it('a stop forgets every reading; a close forgets the plan\'s; neither leaves glyphs drawn (spec §3.2)', async () => {
    const a = await running();
    await plansConfig().update('conceal', true, vscode.ConfigurationTarget.Global);
    const hidden = () => a.planView.hidden(uriOf(PLAN));
    (await fresh()).selection = new vscode.Selection(0, 0, 0, 0);
    await until(() => hidden() > 0, 'the glyphs drawn');
    await a.server.stop();
    assert.equal(a.planView.reading(uriOf(PLAN)), undefined);
    assert.equal(hidden(), 0, 'a stop clears the glyphs');
    await a.server.start();
    const ed = await fresh();
    ed.selection = new vscode.Selection(0, 0, 0, 0);
    await until(() => hidden() > 0, 'the glyphs drawn again');
    // VS Code keeps a document open well past its last tab (over 60 s here); a language-mode
    // change reaches an extension as a close and an open, at once. The server then answers
    // nothing: a reading left after the close would still show.
    for (const m of ['textDocument/semanticTokens/full', 'textDocument/foldingRange', 'textDocument/codeLens']) reply(m, null);
    await vscode.languages.setTextDocumentLanguage(ed.document, 'plaintext');
    await until(() => docOf(PLAN)?.languageId === 'plaintext', 'the plan reopened as plain text');
    await sleep(500);
    assert.equal(a.planView.reading(uriOf(PLAN)), undefined);
    assert.equal(hidden(), 0, 'a close clears the glyphs of an editor left open');
    assert.deepEqual(a.planView.drawn(uriOf(PLAN)).glyphs, []);
    // later tests read a markdown plan
    await vscode.languages.setTextDocumentLanguage(docOf(PLAN)!, 'markdown');
    await until(() => docOf(PLAN)?.languageId === 'markdown', 'the plan markdown again');
  });

  it('durandal.isPlan follows a language change and the plans folder setting (spec §3.1)', async () => {
    const a = await running();
    writeFileSync(join(ws(), 'one/plans/notes'), '- [ ] a step\n');
    const ed = await open(file('one/plans/notes'));
    assert.notEqual(ed.document.languageId, 'markdown');
    await until(() => !a.isPlan() || undefined, 'not a plan as plain text');
    await vscode.languages.setTextDocumentLanguage(ed.document, 'markdown');
    await until(() => a.isPlan(), 'a plan once markdown');
    await open(file(PLAN));
    await until(() => a.isPlan(), 'p.md is a plan');
    await plansConfig().update('dir', 'docs', vscode.ConfigurationTarget.Global);
    await until(() => !a.isPlan() || undefined, 'p.md is not a plan under dir docs');
    await plansConfig().update('dir', undefined, vscode.ConfigurationTarget.Global);
    await until(() => a.isPlan(), 'p.md is a plan again');
    await vscode.commands.executeCommand('workbench.action.closeAllEditors');
    await settle('one/plans/notes', null);
  });

  it('conceal on: markers become glyphs, paths and fingerprints hide; the cursor line is raw; off draws none (spec §3.3)', async () => {
    const a = await running();
    await plansConfig().update('conceal', true, vscode.ConfigurationTarget.Global);
    const ed = await fresh();
    ed.selection = new vscode.Selection(0, 0, 0, 0);
    const glyphs = () => a.planView.drawn(uriOf(PLAN)).glyphs;
    await until(() => glyphs().some(g => g.line === 2), 'the glyphs drawn');
    assert.deepEqual(glyphs().filter(g => g.line === 2), [{ line: 2, start: 0, end: 5, text: '☐' }, { line: 2, start: 13, end: 23, text: '' }]);
    assert.deepEqual(glyphs().filter(g => g.line === 3).map(g => g.text), ['☑', '', '']);
    assert.deepEqual(glyphs().filter(g => g.line === 5), [{ line: 5, start: 0, end: 3, text: '?' }]);
    ed.selection = new vscode.Selection(2, 3, 2, 3);
    await until(() => !glyphs().some(g => g.line === 2) || undefined, 'the cursor line raw');
    assert.ok(glyphs().some(g => g.line === 0 || g.line === 3), 'other lines keep theirs');
    await plansConfig().update('glyphs', { todo: '[]' }, vscode.ConfigurationTarget.Global);
    ed.selection = new vscode.Selection(0, 0, 0, 0);
    await until(() => glyphs().find(g => g.line === 2 && g.start === 0)?.text === '[]', 'the todo override');
    await plansConfig().update('glyphs', undefined, vscode.ConfigurationTarget.Global);
    await plansConfig().update('conceal', false, vscode.ConfigurationTarget.Global);
    await until(() => glyphs().length === 0 || undefined, 'none with conceal off');
  });

  it('a stale reading leaves the glyphs as drawn until fresh tokens come (Review Focus)', async () => {
    const a = await running();
    await plansConfig().update('conceal', true, vscode.ConfigurationTarget.Global);
    const ed = await fresh();
    ed.selection = new vscode.Selection(0, 0, 0, 0);
    const glyphs = () => a.planView.drawn(uriOf(PLAN)).glyphs;
    await until(() => glyphs().some(g => g.line === 2), 'the glyphs drawn');
    const before = JSON.stringify(glyphs());
    // the next tokens answer comes 2 s late: the edit's version has none meanwhile
    reply('textDocument/semanticTokens/full', { delay: 2, data: TOKENS });
    await ed.edit(b => b.insert(new vscode.Position(1, 0), 'x\n'));
    ed.selection = new vscode.Selection(1, 0, 1, 0);
    await sleep(300);
    assert.equal(JSON.stringify(glyphs()), before, 'nothing redrawn from old tokens');
    await until(() => a.planView.reading(uriOf(PLAN))?.tokens?.version === ed.document.version, 'fresh tokens', 10_000);
    await until(() => JSON.stringify(glyphs()) !== before || undefined, 'redrawn from fresh tokens');
    await plansConfig().update('conceal', false, vscode.ConfigurationTarget.Global);
  });

  it('the margin: one mark per line, the worst wins, from olifant\'s diagnostics only (spec §3.4)', async () => {
    const a = await running();
    reply('textDocument/diagnostic', { kind: 'full', items: [
      diag(6, 'claim-right', 4), diag(6, 'claim-wrong', 2), diag(7, 'claim-queued', 4),
      diag(2, undefined, 4, 'olifant'), diag(5, 'claim-wrong', 2, 'cSpell'),
    ] });
    await fresh();
    await repull(uriOf(PLAN));
    const margin = () => a.planView.drawn(uriOf(PLAN)).verdicts;
    await until(() => margin().length === 3 || undefined, 'three marks');
    assert.deepEqual(margin(), [{ line: 2, kind: 'H', text: 'H' }, { line: 6, kind: 'wrong', text: '✗' }, { line: 7, kind: 'queued', text: '○' }]);
    await plansConfig().update('glyphs', { wrong: 'X' }, vscode.ConfigurationTarget.Global);
    await until(() => margin().find(m => m.line === 6)?.text === 'X', 'the wrong override');
    reply('textDocument/diagnostic', { kind: 'full', items: [] });
    await repull(uriOf(PLAN));
    await until(() => margin().length === 0 || undefined, 'no marks once the diagnostics go');
  });
  // Each test that needs a first entry uses a plan file of its own: a document stays open in VS
  // Code for a while after its last tab closes, and an entered document does not close its
  // folds again.
  it('done steps and answered questions close on entry; the heading does not; conclusions show (spec §3.6)', async () => {
    const a = await running();
    const ed = await newPlan('f1.md', PLAN_TEXT);
    const uri = ed.document.uri.toString();
    await until(() => a.planView.entered(uri), 'entered');
    await until(() => (!visibleRow(ed, 4) && !visibleRow(ed, 6)) || undefined, 'rows 4 and 6 folded');
    assert.ok(visibleRow(ed, 2) && visibleRow(ed, 3) && visibleRow(ed, 5), 'the heading\'s section and the fold starts stay shown');
    await until(() => a.planView.drawn(uri).conclusions.length === 2 || undefined, 'two conclusions');
    assert.deepEqual(a.planView.drawn(uri).conclusions, [{ line: 3, text: '  F ✓ ▸ 1' }, { line: 5, text: ' — A later note. ▸ 2' }]);
    await vscode.commands.executeCommand('editor.unfoldAll');
    await until(() => a.planView.drawn(uri).conclusions.length === 0 || undefined, 'no conclusion once open');
  });

  it('a fold that forms after entry starts open; the entered ones stay closed (spec §3.6)', async () => {
    const a = await running();
    const ed = await newPlan('f2.md', PLAN_TEXT);
    const uri = ed.document.uri.toString();
    await until(() => a.planView.entered(uri) && !visibleRow(ed, 4), 'entered, row 4 folded');
    reply('textDocument/foldingRange', [...FOLDS, { startLine: 8, endLine: 9, kind: 'region' }]);
    await ed.edit(b => b.insert(new vscode.Position(8, 0), '- [x] later\n  - its child\n'));
    await until(() => a.planView.reading(uri)?.folds?.ranges.some(f => f.start === 8) || undefined, 'the new fold read');
    await sleep(500);
    assert.ok(visibleRow(ed, 9), 'the new fold is open');
    assert.ok(!visibleRow(ed, 4), 'the entered fold is still closed');
  });

  it('foldDone off closes only the excerpts (spec §3.6)', async () => {
    const a = await running();
    await plansConfig().update('foldDone', false, vscode.ConfigurationTarget.Global);
    reply('textDocument/foldingRange', EXCERPT_FOLDS);
    reply('textDocument/semanticTokens/full', { data: [] });
    const ed = await newPlan('f3.md', EXCERPT_TEXT);
    await until(() => a.planView.entered(ed.document.uri.toString()) && !visibleRow(ed, 4), 'the excerpt folded');
    await sleep(300);
    assert.ok(visibleRow(ed, 8), 'the done step stays open');
  });

  it('no folds: gives up after 8 s, not entered; switching away during the wait leaves it not entered; folds that come later enter it (Review Focus)', async function () {
    this.timeout(60_000);
    const a = await running();
    reply('textDocument/foldingRange', null);
    const ed = await newPlan('f4.md', PLAN_TEXT);
    const uri = ed.document.uri.toString();
    await sleep(9_000);
    assert.equal(a.planView.entered(uri), false);
    // the folds answer comes 3 s late: another editor takes focus while the plan waits for it.
    // The plan stays visible beside it, so its folds still come (a hidden editor's request is
    // cancelled), and land while the other editor is active.
    reply('textDocument/foldingRange', { delay: 3, value: FOLDS });
    const ed5 = await newPlan('f5.md', PLAN_TEXT);
    const u5 = ed5.document.uri.toString();
    await until(() => log().some(m => m.method === 'textDocument/foldingRange' && m.params?.textDocument?.uri === u5) || undefined, 'f5\'s folds asked for');
    const other = await vscode.window.showTextDocument(await vscode.workspace.openTextDocument(file('one/main.py')), vscode.ViewColumn.Two);
    await until(() => a.planView.reading(u5)?.folds?.version === ed5.document.version || undefined, 'f5\'s folds read', 10_000);
    await sleep(500);
    assert.equal(vscode.window.activeTextEditor, other);
    assert.equal(a.planView.entered(u5), false);
    assert.ok(visibleRow(ed5, 4), 'nothing folded in the plan left');
    // one group again: editor.fold acts on the focused code editor, which in this test window
    // can stay in the first group while the second is active
    await vscode.commands.executeCommand('workbench.action.closeAllGroups');
    reply('textDocument/foldingRange', FOLDS);
    const back = await open(file('one/plans/f4.md'));
    await back.edit(b => b.insert(new vscode.Position(1, 0), ' '));
    await until(() => a.planView.entered(uri), 'entered once folds come');
    await until(() => !visibleRow(back, 4) || undefined, 'row 4 folded');
  });

  it('a plan closed and opened again closes its folds again (Review Focus)', async function () {
    this.timeout(120_000);
    const a = await running();
    const ed = await newPlan('f6.md', PLAN_TEXT);
    const uri = ed.document.uri.toString();
    await until(() => a.planView.entered(uri) && !visibleRow(ed, 4), 'entered');
    await vscode.commands.executeCommand('editor.unfoldAll');
    await until(() => visibleRow(ed, 4) || undefined, 'row 4 open');
    // VS Code keeps a document open well past its last tab (over 60 s here); a language-mode
    // change reaches an extension as a close and an open, at once
    await vscode.languages.setTextDocumentLanguage(ed.document, 'plaintext');
    await until(() => vscode.workspace.textDocuments.find(d => d.uri.toString() === uri)?.languageId === 'plaintext' || undefined, 'the plan closed and reopened as plain text');
    assert.equal(a.planView.entered(uri), false);
    const again = await vscode.languages.setTextDocumentLanguage(vscode.workspace.textDocuments.find(d => d.uri.toString() === uri)!, 'markdown');
    const shown = await open(again.uri);
    await until(() => a.planView.entered(uri) && !visibleRow(shown, 4), 'entered again, row 4 folded');
  });
});
