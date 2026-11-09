import * as vscode from 'vscode';
import { findRoot } from '../root';
import { isPlanPath } from './isPlan';

// trackIsPlan keeps durandal.isPlan: the active editor shows a plan of an Olifant project (spec
// §5.1), as projects.ts keeps durandal.inProject. The plan chords use it. It follows the active
// editor only: a language-mode change or a save into plans/ counts at the next editor switch.
export function trackIsPlan(context: vscode.ExtensionContext): { isPlan(): boolean } {
  let isPlan = false;
  const update = async (editor: vscode.TextEditor | undefined) => {
    const doc = editor?.document;
    const root = doc && doc.uri.scheme === 'file' ? await findRoot(doc.uri.fsPath) : undefined;
    const yes = !!doc && doc.uri.scheme === 'file' && isPlanPath(doc.uri.fsPath, root, doc.languageId);
    // the last editor wins: a slower lookup for an earlier editor must not overwrite it
    if (editor !== vscode.window.activeTextEditor) return;
    isPlan = yes;
    await vscode.commands.executeCommand('setContext', 'durandal.isPlan', yes);
  };
  context.subscriptions.push(vscode.window.onDidChangeActiveTextEditor(e => void update(e)));
  void update(vscode.window.activeTextEditor);
  return { isPlan: () => isPlan };
}
