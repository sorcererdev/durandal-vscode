import * as vscode from 'vscode';
import { errorMessage } from './errors';
import { migrationLines, NOT_MIGRATING } from './migration';
import { findOrigin } from './origin';
import { ModelResult, Olifant } from './protocol';
import type { Server } from './server';
import type { Ui } from './uiTypes';
import type { VirtualDocs } from './virtualDocs';

// durandal.migration: the migration report of the active file's project (else a project's
// config.toml, as Generate finds it), read-only beside.
export function registerMigration(context: vscode.ExtensionContext, d: { server: Server; docs: VirtualDocs; ui(): Ui }): void {
  context.subscriptions.push(vscode.commands.registerCommand('durandal.migration', async () => {
    const ui = d.ui();
    const found = await findOrigin(d.server, ui, 'Migration report for which project?');
    if (!found) return;
    let model: ModelResult | null;
    try {
      model = await d.server.request(Olifant.model, { textDocument: { uri: found.origin.uri } });
    } catch (err) {
      ui.error(errorMessage(err));
      return;
    }
    if (!model?.migration) {
      ui.info(NOT_MIGRATING);
      return;
    }
    const uri = d.docs.set('Migration', migrationLines(model.migration).join('\n'));
    await vscode.window.showTextDocument(uri, { viewColumn: vscode.ViewColumn.Beside, preview: true });
  }));
}
