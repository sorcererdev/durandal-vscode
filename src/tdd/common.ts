import * as vscode from 'vscode';
import { Flight, Flights } from './flights';

export const NO_FILE = 'open a file of an Olifant project first';

export type TddFlights = Flights<vscode.CancellationToken>;
export const newFlights = (): TddFlights => new Flights(() => new vscode.CancellationTokenSource());

export interface Here { editor: vscode.TextEditor; uri: string; position: { line: number; character: number } }

// here: the active editor's file and cursor, when it shows a file
export function here(): Here | undefined {
  const editor = vscode.window.activeTextEditor;
  if (!editor || editor.document.uri.scheme !== 'file') return undefined;
  const p = editor.selection.active;
  return { editor, uri: editor.document.uri.toString(), position: { line: p.line, character: p.character } };
}

// withCancel: work under a notification with a Cancel button. The library's progress for the
// server's own $/progress sits in the status bar (ProgressLocation.Window) and has none.
export function withCancel<R>(title: string, f: Flight<vscode.CancellationToken>, work: () => Promise<R>): Thenable<R> {
  return vscode.window.withProgress({ location: vscode.ProgressLocation.Notification, title, cancellable: true }, async (_p, token) => {
    const sub = token.onCancellationRequested(() => f.cancel('user'));
    try {
      return await work();
    } finally {
      sub.dispose();
    }
  });
}
