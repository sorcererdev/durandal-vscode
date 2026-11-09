import * as vscode from 'vscode';
import { csp, nonce, shell } from './shell';
import type { FromPage, ToPage, View } from './viewModel';

// PausePanel: the one pause / review tab (spec §4.1). It knows nothing about conjure or reviews.
// It shows the View it is given, re-sends it whenever the page (re)loads (retainContextWhenHidden
// is off: the extension holds the model) and hands page messages on. durandal.pauseOpen is
// true while the panel exists and is visible. Disposing the tab is q: closed() tells the
// controller; a close() the controller asks for does not call it back.

const setOpen = (on: boolean) => void vscode.commands.executeCommand('setContext', 'durandal.pauseOpen', on);

// besideOf: the column right of the unit's file; VS Code's Beside when no column is known
const besideOf = (c: vscode.ViewColumn | undefined): vscode.ViewColumn =>
  c !== undefined && c >= vscode.ViewColumn.One ? Math.min(c + 1, vscode.ViewColumn.Nine) : vscode.ViewColumn.Beside;

export class PausePanel {
  private panel: vscode.WebviewPanel | undefined;
  private shown: View | undefined;
  private listeners: vscode.Disposable[] = [];

  constructor(private readonly d: { extensionUri: vscode.Uri; receive(m: FromPage): void; closed(): void }) {}

  // show: create the panel beside the file, or update it; an existing panel is revealed only
  // when focus is asked for (a running view re-sent each second never pulls a hidden tab forward)
  show(view: View, o: { beside?: vscode.ViewColumn; flash?: 'row' | 'entry'; focus: boolean }): void {
    this.shown = view;
    if (!this.panel) {
      this.create(view.tab, besideOf(o.beside), o.focus);
    } else {
      this.panel.title = view.tab;
      if (o.focus) this.panel.reveal(undefined, false);
    }
    this.post(o.flash ? { type: 'view', view, flash: o.flash } : { type: 'view', view });
  }

  notice(text: string): void {
    this.post({ type: 'notice', text });
  }

  isOpen(): boolean {
    return this.panel !== undefined;
  }

  // close: our listeners go before the dispose, so closed() (the user's q) is not called
  close(): void {
    const p = this.panel;
    if (!p) return;
    this.forget();
    p.dispose();
  }

  dispose(): void {
    this.close();
  }

  column(): vscode.ViewColumn | undefined {
    return this.panel?.viewColumn;
  }

  last(): View | undefined {
    return this.shown;
  }

  private create(title: string, column: vscode.ViewColumn, focus: boolean): void {
    const dist = vscode.Uri.joinPath(this.d.extensionUri, 'dist');
    const p = vscode.window.createWebviewPanel('durandal.pause', title, { viewColumn: column, preserveFocus: !focus }, {
      enableScripts: true,
      localResourceRoots: [dist],
      retainContextWhenHidden: false,
    });
    const n = nonce();
    p.webview.html = shell({
      csp: csp(p.webview.cspSource, n),
      script: p.webview.asWebviewUri(vscode.Uri.joinPath(dist, 'webview.js')).toString(),
      style: p.webview.asWebviewUri(vscode.Uri.joinPath(dist, 'pause.css')).toString(),
      nonce: n,
    });
    this.listeners = [
      p.webview.onDidReceiveMessage((m: unknown) => this.heard(m)),
      p.onDidChangeViewState(e => {
        setOpen(e.webviewPanel.visible);
        if (e.webviewPanel.visible) this.resend();
      }),
      p.onDidDispose(() => {
        this.forget();
        this.d.closed();
      }),
    ];
    this.panel = p;
    setOpen(true);
  }

  // heard: a page message; ready re-sends the view (the page has just loaded), then every
  // message goes on to the controller
  private heard(m: unknown): void {
    if (typeof m !== 'object' || m === null || typeof (m as { type?: unknown }).type !== 'string') return;
    const msg = m as FromPage;
    if (msg.type === 'ready') this.resend();
    this.d.receive(msg);
  }

  private resend(): void {
    if (this.shown) this.post({ type: 'view', view: this.shown });
  }

  private post(m: ToPage): void {
    void this.panel?.webview.postMessage(m);
  }

  private forget(): void {
    for (const l of this.listeners) l.dispose();
    this.listeners = [];
    this.panel = undefined;
    this.shown = undefined;
    setOpen(false);
  }
}
