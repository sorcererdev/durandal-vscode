import * as vscode from 'vscode';
import type { ActionLog } from '../actionLog';
import type { Say, Server } from '../server';
import { toggleSetting } from '../toggleSetting';
import { Controller } from './controller';
import type { Shown, SuggestKind } from './types';

const HIDE_INLINE = 'editor.action.inlineSuggest.hide';

// Suggest is ghost text and snippets in VS Code (durandal.nvim suggest.lua, M3 spec): the
// controller fed by the active editor, the context keys, durandal.ghosts and its toggle
// (:DurandalGhosts), and Esc's dismissal.
export class Suggest {
  readonly controller: Controller;

  constructor(private readonly d: { server: Server; log: ActionLog; say: Say }) {
    this.controller = new Controller({ view: { keys: k => this.keys(k) }, log: e => d.log.write(e) });
  }

  enabled(): boolean {
    return vscode.workspace.getConfiguration('durandal').get<boolean>('ghosts', true);
  }

  state(uri: string): Shown | undefined { return this.controller.state(uri); }

  register(context: vscode.ExtensionContext): void {
    context.subscriptions.push(
      vscode.commands.registerCommand('durandal.ghosts.toggle', () => toggleSetting('ghosts')),
      vscode.commands.registerCommand('durandal.suggest.dismiss', async () => {
        const ed = vscode.window.activeTextEditor;
        if (!ed) return;
        const uri = ed.document.uri.toString();
        const kind = this.controller.state(uri)?.kind;
        this.controller.dismiss(uri);
        if (kind === 'snippet') await vscode.commands.executeCommand(HIDE_INLINE);
      }),
      vscode.window.onDidChangeTextEditorSelection(e => this.moved(e.textEditor)),
      vscode.workspace.onDidChangeTextDocument(e => {
        const ed = vscode.window.activeTextEditor;
        if (ed && ed.document === e.document) this.moved(ed);
      }),
      vscode.window.onDidChangeActiveTextEditor(ed => this.controller.focus(ed?.document.uri.toString())),
      vscode.workspace.onDidCloseTextDocument(doc => this.controller.closed(doc.uri.toString())),
      vscode.workspace.onDidChangeConfiguration(e => {
        if (e.affectsConfiguration('durandal.ghosts') && !this.enabled()) {
          this.controller.off();
          void vscode.commands.executeCommand(HIDE_INLINE);
        }
      }),
    );
    this.controller.focus(vscode.window.activeTextEditor?.document.uri.toString());
  }

  private moved(ed: vscode.TextEditor): void {
    const line = ed.selection.active.line;
    this.controller.moved(ed.document.uri.toString(), line, ed.document.lineAt(line).text);
  }

  private keys(k: { visible: boolean; kind?: SuggestKind; band?: string }): void {
    void vscode.commands.executeCommand('setContext', 'durandal.ghostVisible', k.visible);
    void vscode.commands.executeCommand('setContext', 'durandal.ghostKind', k.kind ?? '');
    void vscode.commands.executeCommand('setContext', 'durandal.ghostBand', k.band ?? '');
  }
}
