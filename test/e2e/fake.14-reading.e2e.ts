import * as assert from 'node:assert/strict';
import { writeFileSync } from 'node:fs';
import { join } from 'node:path';
import * as vscode from 'vscode';
import { encode } from '../planTokens';
import { docOf, file, open, reply, running, settle, sleep, until, ws } from './helpers';

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
    // the suites after this one get the fake's default answers again
    for (const m of ['textDocument/semanticTokens/full', 'textDocument/foldingRange', 'textDocument/codeLens']) reply(m, null);
  });

  beforeEach(async () => {
    canned();
    await settle(PLAN, PLAN_TEXT);
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

  it('a stop forgets every reading; a close forgets the plan\'s (spec §3.2)', async () => {
    const a = await running();
    await fresh();
    await a.server.stop();
    assert.equal(a.planView.reading(uriOf(PLAN)), undefined);
    await a.server.start();
    const ed = await fresh();
    // VS Code keeps a document open well past its last tab (over 60 s here); a language-mode
    // change reaches an extension as a close and an open, at once. The server then answers
    // nothing: a reading left after the close would still show.
    for (const m of ['textDocument/semanticTokens/full', 'textDocument/foldingRange', 'textDocument/codeLens']) reply(m, null);
    await vscode.languages.setTextDocumentLanguage(ed.document, 'plaintext');
    await until(() => docOf(PLAN)?.languageId === 'plaintext', 'the plan reopened as plain text');
    await sleep(500);
    assert.equal(a.planView.reading(uriOf(PLAN)), undefined);
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
});
