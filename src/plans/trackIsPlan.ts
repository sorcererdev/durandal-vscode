import * as vscode from 'vscode';
import type { PlanDocs } from './planDocs';

// trackIsPlan keeps durandal.isPlan: the active editor shows a plan of an Olifant project (M5
// spec §5.1, M6 spec §3.1), as projects.ts keeps durandal.inProject. The plan chords use it.
// It follows the active editor, its document reopened with another language (a language-mode
// change reaches an extension as a close and an open), its save (an untitled file saved into
// the plans folder) and refresh() (the plans folder setting changed). CHANGED hears each new
// answer (the Enter rule follows it).
export function trackIsPlan(context: vscode.ExtensionContext, docs: PlanDocs, changed: (yes: boolean) => void = () => undefined): { isPlan(): boolean; refresh(): void } {
  let isPlan = false;
  // FROM: the document an event names, when it is the active editor's (a reopened document is
  // a new object: the editor may still hold the old one while the event runs, so match by uri)
  const update = async (from?: vscode.TextDocument) => {
    const editor = vscode.window.activeTextEditor;
    const doc = editor && from && from.uri.toString() === editor.document.uri.toString() ? from : editor?.document;
    const yes = !!doc && await docs.is(doc);
    // the last editor wins: a slower lookup for an earlier editor must not overwrite it
    if (editor !== vscode.window.activeTextEditor) return;
    const was = isPlan;
    isPlan = yes;
    if (was !== yes) changed(yes);
    await vscode.commands.executeCommand('setContext', 'durandal.isPlan', yes);
  };
  const ofActive = (doc: vscode.TextDocument) => doc.uri.toString() === vscode.window.activeTextEditor?.document.uri.toString();
  context.subscriptions.push(
    vscode.window.onDidChangeActiveTextEditor(() => void update()),
    vscode.workspace.onDidOpenTextDocument(doc => { if (ofActive(doc)) void update(doc); }),
    vscode.workspace.onDidSaveTextDocument(doc => { if (ofActive(doc)) void update(doc); }),
  );
  void update();
  return { isPlan: () => isPlan, refresh: () => void update() };
}
