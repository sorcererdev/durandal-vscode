import { relative } from 'node:path';
import * as vscode from 'vscode';
import { CodeAction, CodeActionRequest, CodeActionResolveRequest, ExecuteCommandRequest, WorkspaceEdit } from 'vscode-languageserver-protocol';
import type { ActionLog } from '../actionLog';
import { applyServerEdit } from '../applyEdit';
import { errorMessage } from '../errors';
import type { Generate } from '../generate/command';
import type { Plans } from '../land';
import { NO_EDIT, NOT_APPLIED } from '../plans/words';
import { CLIENT_COMMANDS, FileActionsResult, Olifant, SERVER_COMMANDS, Values } from '../protocol';
import { findRoot, realRoot } from '../root';
import { APPLY_RESOLVED, NOT_RUNNING, Say, Server } from '../server';
import type { Shown } from '../suggest/types';
import type { Item, Ui } from '../uiTypes';
import { askWay, dataOf, explainMiss, generatorOf, MenuItem, menuItems, MissItem, recognitionItems } from './menu';

export const NOT_IN_PROJECT = 'not in an Olifant project (no .olifant/ above this file)';

export interface ActionsDeps {
  server: Server; plans: Plans; generate: Generate; log: ActionLog; ui(): Ui; say: Say;
  // recognition: the line's recognition (suggest/editor.ts), first in the menu
  recognition?: { at(uri: string, line: number): Shown | undefined; choose(st: Shown): Promise<void>; reset(st: Shown): void };
  // plan documents (M6c): the menu applies a plan action's edit itself (spec §5.6)
  planDocs?: { is(doc: vscode.TextDocument): Promise<boolean> };
}

// Actions is durandal.actions (the chord, at the cursor) and olifant.showActions (the ⚡ hint's
// command, at its line), ported from durandal.nvim actions.lua: the server's code actions as a
// menu (a rule's fixes first); the pick asks what it still needs, resolves to its plan and
// opens the review window (a snippet goes in its line). In a plan, and for a bare command
// anywhere, the pick runs or applies directly (direct). Nothing here: why, from the file's
// actions. Also APPLY_RESOLVED, the lightbulb path's apply.
export class Actions {
  constructor(private readonly d: ActionsDeps) {}

  register(context: vscode.ExtensionContext): void {
    context.subscriptions.push(
      vscode.commands.registerCommand('durandal.actions', () => {
        const ed = vscode.window.activeTextEditor;
        if (!ed) {
          this.d.ui().info(NOT_IN_PROJECT);
          return;
        }
        return this.at(ed.document.uri, ed.selection.active);
      }),
      vscode.commands.registerCommand(CLIENT_COMMANDS.showActions, (uri: string, pos: { line: number; character: number }) =>
        this.at(vscode.Uri.parse(uri), new vscode.Position(pos.line, pos.character))),
      vscode.commands.registerCommand(APPLY_RESOLVED, async (label: string, edit: WorkspaceEdit) => {
        const lc = this.d.server.client();
        if (!lc) return void this.d.say('error', NOT_RUNNING);
        const r = await applyServerEdit(lc, { label, edit }, text => void this.d.say('info', text));
        if (!r.applied) void this.d.say('error', r.failureReason ?? NOT_APPLIED);
      }),
    );
  }

  async at(uri: vscode.Uri, pos: vscode.Position): Promise<void> {
    const ui = this.d.ui();
    const found = uri.scheme === 'file' ? await findRoot(uri.fsPath) : undefined;
    if (!found) {
      ui.info(NOT_IN_PROJECT);
      return;
    }
    const root = await realRoot(found);
    const rel = relative(found, uri.fsPath);
    const at = { line: pos.line, character: pos.character };
    let actions: CodeAction[];
    try {
      const got = await this.d.server.request(CodeActionRequest.type,
        { textDocument: { uri: uri.toString() }, range: { start: at, end: at }, context: { diagnostics: [] } });
      // a bare Command (command: string) is not an action this menu offers
      actions = (got ?? []).filter((x): x is CodeAction => typeof (x as { command?: unknown }).command !== 'string');
    } catch (err) {
      ui.error(errorMessage(err));
      return;
    }
    // what the server recognised on this line comes first (an offer, a choice, a hint)
    const rec = this.d.recognition?.at(uri.toString(), pos.line);
    if (actions.length === 0 && !rec) return this.miss(uri, rel, ui);
    const items = menuItems(actions);
    this.d.log.write({ event: 'shown', file: rel, generators: items.map(i => generatorOf(i.action)) });
    type Pick = { kind: 'action'; item: MenuItem } | { kind: 'recognition' } | { kind: 'reset' };
    const picks: Item<Pick>[] = [
      ...(rec ? recognitionItems(rec).map(r => ({ label: r.label, value: { kind: r.pick } as Pick })) : []),
      ...items.map(i => ({ label: i.label, description: i.description, value: { kind: 'action', item: i } as Pick })),
    ];
    const picked = await ui.pick<Pick>({ title: 'Olifant', items: picks });
    if (!picked) return;
    if (picked.kind === 'recognition') return this.d.recognition!.choose(rec!);
    if (picked.kind === 'reset') return this.d.recognition!.reset(rec!);
    const a = picked.item.action;
    this.d.log.write({ event: a.kind === 'quickfix' ? 'fix-picked' : 'picked', file: rel, generator: generatorOf(a) });
    if (await this.direct(uri, a, ui)) return;
    const sets = await this.ask(a, ui);
    if (sets) await this.resolve(a, sets, root, ui);
  }

  // direct: an action outside the generators' review path (M6 spec §5.6). A bare command runs
  // (the claim pass's Check this, Show why, Show the code here: the server's go to the server);
  // in a plan, an action's own edit applies and a source action resolves to its edit
  // (Re-fingerprint this claim, Mark done, New step below). False: the review path's.
  private async direct(uri: vscode.Uri, a: CodeAction, ui: Ui): Promise<boolean> {
    if (a.command && !a.edit && a.data === undefined) {
      const { command, arguments: args = [] } = a.command;
      try {
        if ((Object.values(SERVER_COMMANDS) as string[]).includes(command)) {
          await this.d.server.request(ExecuteCommandRequest.type, { command, arguments: args });
        } else {
          await vscode.commands.executeCommand(command, ...args);
        }
      } catch (err) {
        ui.error(errorMessage(err));
      }
      return true;
    }
    const doc = vscode.workspace.textDocuments.find(d => d.uri.toString() === uri.toString());
    if (!doc || !(await this.d.planDocs?.is(doc))) return false;
    let edit = a.edit;
    if (!edit) {
      try {
        edit = (await this.d.server.request(CodeActionResolveRequest.type, a))?.edit;
      } catch (err) {
        ui.error(errorMessage(err));
        return true;
      }
      if (!edit) {
        ui.error(NO_EDIT);
        return true;
      }
    }
    const lc = this.d.server.client();
    if (!lc) {
      ui.error(NOT_RUNNING);
      return true;
    }
    const done = await applyServerEdit(lc, { label: a.title, edit }, text => void this.d.say('info', text));
    if (!done.applied) ui.error(done.failureReason ?? NOT_APPLIED);
    return true;
  }

  // ask is what the action still needs (actions.lua ask): undefined when skipped, or when the
  // generate form applied the action itself.
  private async ask(a: CodeAction, ui: Ui): Promise<Values | undefined> {
    const d = dataOf(a);
    const preset: Values = { ...(d.sets ?? {}) };
    const way = askWay(a);
    if (way.kind === 'form') {
      const end = await this.d.generate.run({ generator: way.generator, sets: preset, done: way.done });
      return end.kind === 'sets' ? { ...preset, ...end.sets } : undefined;
    }
    const sets = { ...preset };
    for (const k of way.missing) {
      const cs = d.choices?.[k] ?? [];
      const v = cs.length > 0
        ? await ui.pick<string>({ title: k, items: cs.map(c => ({ label: c, value: c })) })
        : await ui.text({ title: k, value: '' }).result;
      if (!v) return undefined;
      sets[k] = v;
    }
    return sets;
  }

  // resolve plans the action with sets (the server reports progress, titled as the action),
  // then reviews the plan, or puts a snippet in its line.
  private async resolve(a: CodeAction, sets: Values, root: string, ui: Ui): Promise<void> {
    const d = dataOf(a);
    let resolved: CodeAction | null;
    try {
      resolved = await this.d.server.request(CodeActionResolveRequest.type, { ...a, data: { ...d, sets } });
    } catch (err) {
      ui.error(errorMessage(err));
      return;
    }
    const plan = resolved ? dataOf(resolved).plan : undefined;
    if (!plan || typeof plan !== 'object') {
      ui.error('the server sent no plan');
      return;
    }
    if (plan.snippet && d.snippet === true) {
      await this.d.plans.snippet(root, plan.snippet);
      return;
    }
    await this.d.plans.review(ui, root, plan, resolved!.edit, {
      title: a.title,
      landed: () => this.d.log.write({ event: 'applied', generator: generatorOf(a), files: (plan.files ?? []).length }),
    });
  }

  // miss: nothing at the cursor. The file's actions are always asked again (a miss is asked
  // for); actions elsewhere are a menu, and picking one moves there and asks again.
  private async miss(uri: vscode.Uri, rel: string, ui: Ui): Promise<void> {
    let fa: FileActionsResult | null = null;
    try {
      fa = await this.d.server.request(Olifant.fileActions, { textDocument: { uri: uri.toString() } });
    } catch {
      // explained from nothing
    }
    const m = explainMiss(fa, rel);
    if (m.kind !== 'elsewhere') {
      ui.info(m.text);
      return;
    }
    const it = await ui.pick<MissItem>({ title: m.text, items: m.items.map(i => (i.separator ? { label: i.label, separator: true } : { label: i.label, value: i })) });
    if (!it || it.line === undefined) return;
    const ed = await vscode.window.showTextDocument(uri);
    const line = Math.max(Math.min(it.line, ed.document.lineCount) - 1, 0);
    const p = new vscode.Position(line, Math.max((it.col ?? 1) - 1, 0));
    ed.selection = new vscode.Selection(p, p);
    ed.revealRange(new vscode.Range(p, p));
    return this.at(uri, p);
  }
}
