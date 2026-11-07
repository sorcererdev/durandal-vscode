import * as vscode from 'vscode';
import { chooseDocument, configPath, NO_PROJECT } from './document';
import type { Origin } from './generate/flow';
import { findRoot, realRoot } from './root';
import type { Server } from './server';
import type { Ui } from './uiTypes';

export interface Found { origin: Origin; editor?: vscode.TextEditor; selection?: vscode.Selection }

const configOrigin = (root: string): Origin =>
  ({ uri: vscode.Uri.file(configPath(root)).toString(), position: { line: 0, character: 0 }, root });

// findOrigin is the document a project command speaks for (document.ts): the active editor's
// file at its cursor, or a project's config.toml at 0:0. editor and selection are where to
// come back to.
export async function findOrigin(server: Server, ui: Ui, title: string): Promise<Found | undefined> {
  const editor = vscode.window.activeTextEditor;
  const doc = editor?.document;
  const here = doc && doc.uri.scheme === 'file' ? await findRoot(doc.uri.fsPath) : undefined;
  const c = chooseDocument(here ? await realRoot(here) : undefined, server.roots());
  const back = editor ? { editor, selection: editor.selection } : {};
  switch (c.kind) {
    case 'here': {
      const p = editor!.selection.active;
      return { origin: { uri: doc!.uri.toString(), position: { line: p.line, character: p.character }, root: c.root }, ...back };
    }
    case 'config':
      return { origin: configOrigin(c.root), ...back };
    case 'choose': {
      const root = await ui.pick<string>({ title, placeholder: 'a project', items: c.roots.map(r => ({ label: r, value: r })) });
      return root ? { origin: configOrigin(root), ...back } : undefined;
    }
    case 'none':
      ui.info(NO_PROJECT);
      return undefined;
  }
}
