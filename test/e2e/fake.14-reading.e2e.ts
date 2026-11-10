import * as assert from 'node:assert/strict';
import { writeFileSync } from 'node:fs';
import { join } from 'node:path';
import * as vscode from 'vscode';
import { file, open, running, settle, until, ws } from './helpers';

// The plans reading layer over the fake server (M6 spec §3, §8): detection, the reading model,
// glyphs, the verdict margin, folds and conclusions, the Enter rule, the excerpt guard.
const PLAN = 'one/plans/p.md';
const PLAN_DEFAULT = '# A plan\n\n- [ ] a step\n';
const plansConfig = () => vscode.workspace.getConfiguration('durandal.plans');

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
