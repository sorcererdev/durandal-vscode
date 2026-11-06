import * as vscode from 'vscode';
import { findRoot, rootOfConfig } from './root';
import type { Server } from './server';

// discover lists the window's projects at activation: every .olifant/config.toml under its
// folders (the activation event's own glob).
export async function discover(): Promise<string[]> {
  const uris = await vscode.workspace.findFiles('**/.olifant/config.toml', '**/node_modules/**');
  return [...new Set(uris.map(u => rootOfConfig(u.fsPath)))];
}

// trackProjects adds the project of every file opened (one outside the workspace folders too)
// and starts the server for it; and keeps durandal.inProject: the active editor's file is in a
// project.
export function trackProjects(context: vscode.ExtensionContext, server: Server): { inProject(): boolean } {
  let inProject = false;
  const onOpen = async (doc: vscode.TextDocument) => {
    if (doc.uri.scheme !== 'file') return;
    const root = await findRoot(doc.uri.fsPath);
    if (!root) return;
    await server.addRoot(root);
    await server.start();
  };
  const update = async (editor: vscode.TextEditor | undefined) => {
    const yes = !!editor && editor.document.uri.scheme === 'file' && !!(await findRoot(editor.document.uri.fsPath));
    // the last editor wins: a slower lookup for an earlier editor must not overwrite it
    if (editor !== vscode.window.activeTextEditor) return;
    inProject = yes;
    await vscode.commands.executeCommand('setContext', 'durandal.inProject', yes);
  };
  context.subscriptions.push(
    vscode.workspace.onDidOpenTextDocument(doc => void onOpen(doc)),
    vscode.window.onDidChangeActiveTextEditor(e => void update(e)),
  );
  for (const doc of vscode.workspace.textDocuments) void onOpen(doc);
  void update(vscode.window.activeTextEditor);
  return { inProject: () => inProject };
}
