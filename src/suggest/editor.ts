import * as vscode from 'vscode';
import type { ActionLog } from '../actionLog';
import type { Hints } from '../hints';
import type { Plans } from '../land';
import { Olifant, Suggestion } from '../protocol';
import type { Say, Server } from '../server';
import { settingsFrom } from '../settings';
import { toggleSetting } from '../toggleSetting';
import type { Ui } from '../uiTypes';
import { Accept } from './accept';
import { Controller } from './controller';
import { Decorations } from './decorate';
import { Fill, FillOutcome } from './fill';
import { GHOST_INSERTED, ServedLog } from './ghostItem';
import { Inline } from './inline';
import { inlineGhost } from './recognition';
import type { Shown, SuggestKind } from './types';

const HIDE_INLINE = 'editor.action.inlineSuggest.hide';

// GhostInsertedArgs: the ghost lines' item command's argument (a full commit: Tab is ours, so
// this is the hover toolbar's Accept)
export interface GhostInsertedArgs { uri: string; key: string; generator: string }

// Suggest is ghost text and snippets in VS Code (durandal.nvim suggest.lua, M3 spec): the
// controller fed by the active editor, the context keys, durandal.ghosts and its toggle
// (:DurandalGhosts), Esc's dismissal, the pushes, the ⚡ decoration with the hint it hides, and
// Tab's accept.
export class Suggest {
  readonly controller: Controller;
  readonly accept: Accept;
  readonly fill: Fill;
  readonly inline: Inline;
  private readonly decorations = new Decorations();
  // focused: the active editor's document (its suggestion goes when it is left, decision 7)
  private focused: string | undefined;

  constructor(private readonly d: {
    server: Server; log: ActionLog; say: Say; warn(m: string): void; hints: Hints; inProject(): boolean; plans: Plans; ui(): Ui;
  }) {
    this.controller = new Controller({
      view: {
        keys: k => this.keys(k),
        show: st => { this.decorations.show(st); d.hints.hide(st.uri, st.line); },
        hide: uri => { this.decorations.hide(uri); d.hints.hide(uri, undefined); },
        hideInline: () => void vscode.commands.executeCommand(HIDE_INLINE),
      },
      log: e => d.log.write(e),
    });
    this.accept = new Accept({ server: d.server, plans: d.plans, controller: this.controller, log: d.log, ui: d.ui });
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

  // recognitions: the ⚡ menu's view of the line's recognition (actions/command.ts)
  readonly recognitions = {
    at: (uri: string, line: number): Shown | undefined => {
      const st = this.controller.state(uri);
      return st && st.kind === 'recognition' && st.line === line ? st : undefined;
    },
    choose: (st: Shown) => this.accept.choose(st),
    reset: (st: Shown) => this.controller.feedback(st, 'reset'),
  };

  // pushed: olifant/suggestion, its uri read as VS Code spells it (decision 5)
  pushed(s: Suggestion): void {
    this.controller.pushed({ ...s, uri: vscode.Uri.parse(s.uri).toString() });
  }

  enabled(): boolean {
    return vscode.workspace.getConfiguration('durandal').get<boolean>('ghosts', true);
  }

  state(uri: string): Shown | undefined { return this.controller.state(uri); }
  get fills(): FillOutcome[] { return this.fill.outcomes; }
  // served: the asks on a suggestion ghost's line (the e2e tests read them)
  get served(): ServedLog { return this.inline.served; }
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
        const st = this.controller.state(uri);
        // the ghost lines first: they are VS Code's inline suggestion (M7 spec §4)
        if (st && inlineGhost(st)) await vscode.commands.executeCommand(HIDE_INLINE);
        this.controller.dismiss(uri);
        if (st?.kind === 'snippet') await vscode.commands.executeCommand(HIDE_INLINE);
      }),
      vscode.commands.registerCommand('durandal.suggest.accept', async () => {
        const ed = vscode.window.activeTextEditor;
        const st = ed && this.controller.state(ed.document.uri.toString());
        if (!st) return;
        if (inlineGhost(st)) await vscode.commands.executeCommand(HIDE_INLINE);
        await this.accept.run(st);
      }),
      vscode.commands.registerCommand(GHOST_INSERTED, (a: GhostInsertedArgs | undefined) => this.inserted(a)),
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

  // inserted: the ghost lines inserted as they stand (the hover toolbar's Accept, decision 9):
  // logged, the band cleared if the insert has not cleared it already; no fill
  private inserted(a: GhostInsertedArgs | undefined): void {
    if (!a) return;
    this.d.log.write({ event: 'ghost-inserted', generator: a.generator });
    if (this.controller.state(a.uri)?.key === a.key) this.controller.clear(a.uri);
  }

  private keys(k: { visible: boolean; kind?: SuggestKind; band?: string; inline?: true }): void {
    void vscode.commands.executeCommand('setContext', 'durandal.ghostInline', k.inline === true);
    void vscode.commands.executeCommand('setContext', 'durandal.ghostVisible', k.visible);
    void vscode.commands.executeCommand('setContext', 'durandal.ghostKind', k.kind ?? '');
    void vscode.commands.executeCommand('setContext', 'durandal.ghostBand', k.band ?? '');
  }
}
