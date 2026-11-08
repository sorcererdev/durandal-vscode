import * as vscode from 'vscode';
import type { ActionLog } from '../actionLog';
import type { Hints } from '../hints';
import { Olifant, Suggestion } from '../protocol';
import type { Say, Server } from '../server';
import { settingsFrom } from '../settings';
import { toggleSetting } from '../toggleSetting';
import { Controller } from './controller';
import { Decorations } from './decorate';
import { Fill, FillOutcome } from './fill';
import { Inline } from './inline';
import type { Shown, SuggestKind } from './types';

const HIDE_INLINE = 'editor.action.inlineSuggest.hide';

// Suggest is ghost text and snippets in VS Code (durandal.nvim suggest.lua, M3 spec): the
// controller fed by the active editor, the context keys, durandal.ghosts and its toggle
// (:DurandalGhosts), Esc's dismissal, the pushes, and the ⚡ decoration with the hint it hides.
export class Suggest {
  readonly controller: Controller;
  readonly fill: Fill;
  readonly inline: Inline;
  private readonly decorations = new Decorations();
  // focused: the active editor's document (its suggestion goes when it is left, decision 7)
  private focused: string | undefined;

  constructor(private readonly d: { server: Server; log: ActionLog; say: Say; warn(m: string): void; hints: Hints; inProject(): boolean }) {
    this.controller = new Controller({
      view: {
        keys: k => this.keys(k),
        show: st => { this.decorations.show(st); d.hints.hide(st.uri, st.line); },
        hide: uri => { this.decorations.hide(uri); d.hints.hide(uri, undefined); },
        hideInline: () => void vscode.commands.executeCommand(HIDE_INLINE),
      },
      log: e => d.log.write(e),
    });
    this.fill = new Fill({ server: d.server, log: d.log, say: d.say, warn: d.warn });
    this.inline = new Inline({ controller: this.controller, fill: this.fill, enabled: () => this.enabled(), warn: d.warn });
    this.controller.attach({
      enabled: () => this.enabled(),
      running: () => d.server.state() === 'running',
      cursor: () => {
        const ed = vscode.window.activeTextEditor;
        if (!ed || ed.document.uri.scheme !== 'file') return undefined;
        const line = ed.selection.active.line;
        return { uri: ed.document.uri.toString(), version: ed.document.version, line, lineText: ed.document.lineAt(line).text, inProject: d.inProject() };
      },
      suggest: (uri, line, token) => d.server.request(Olifant.suggest, { textDocument: { uri }, line }, token as unknown as vscode.CancellationToken),
      plan: (planId, token) => d.server.request(Olifant.plan, { planId }, token as unknown as vscode.CancellationToken),
      triggerInline: () => void vscode.commands.executeCommand('editor.action.inlineSuggest.trigger'),
      feedback: (uri, generator, outcome) => {
        d.server.notify(Olifant.recognitionFeedback, { textDocument: { uri }, generator, outcome }).catch(() => undefined);
      },
      debounceMs: () => {
        const c = vscode.workspace.getConfiguration('durandal');
        return settingsFrom((k, fallback) => c.get(k, fallback)).debounceMs;
      },
      timer: { set: (f, ms) => setTimeout(f, ms), clear: h => clearTimeout(h as NodeJS.Timeout) },
    });
  }

  // pushed: olifant/suggestion, its uri read as VS Code spells it (decision 5)
  pushed(s: Suggestion): void {
    this.controller.pushed({ ...s, uri: vscode.Uri.parse(s.uri).toString() });
  }

  enabled(): boolean {
    return vscode.workspace.getConfiguration('durandal').get<boolean>('ghosts', true);
  }

  state(uri: string): Shown | undefined { return this.controller.state(uri); }
  get fills(): FillOutcome[] { return this.fill.outcomes; }
  // decorated: the ⚡ text drawn at the end of uri's suggestion line (the e2e tests read it)
  decorated(uri: string): string | undefined { return this.decorations.drawn.get(uri); }

  register(context: vscode.ExtensionContext): void {
    this.fill.register(context);
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
      vscode.window.onDidChangeActiveTextEditor(ed => {
        if (this.focused && this.focused !== ed?.document.uri.toString()) this.controller.clear(this.focused);
        this.focused = ed?.document.uri.toString();
        this.controller.focus(this.focused);
      }),
      vscode.workspace.onDidCloseTextDocument(doc => this.controller.closed(doc.uri.toString())),
      vscode.workspace.onDidChangeConfiguration(e => {
        if (e.affectsConfiguration('durandal.ghosts') && !this.enabled()) {
          this.controller.off();
          void vscode.commands.executeCommand(HIDE_INLINE);
        }
      }),
      { dispose: () => this.decorations.dispose() },
    );
    this.focused = vscode.window.activeTextEditor?.document.uri.toString();
    this.controller.focus(this.focused);
  }

  private moved(ed: vscode.TextEditor): void {
    const line = ed.selection.active.line;
    this.controller.moved(ed.document.uri.toString(), line, ed.document.lineAt(line).text);
    this.controller.schedule();
  }

  private keys(k: { visible: boolean; kind?: SuggestKind; band?: string }): void {
    void vscode.commands.executeCommand('setContext', 'durandal.ghostVisible', k.visible);
    void vscode.commands.executeCommand('setContext', 'durandal.ghostKind', k.kind ?? '');
    void vscode.commands.executeCommand('setContext', 'durandal.ghostBand', k.band ?? '');
  }
}
