import * as vscode from 'vscode';
import { InlayHintRequest } from 'vscode-languageclient/node';
import type { ActionLog } from './actionLog';
import { generatorAt, Seen } from './hintLog';
import { Olifant } from './protocol';
import type { Server } from './server';

// Hints are the ⚡ hints: the library's inlay hints as olifant serves them (one per line with
// actions, every visible line; clicking runs olifant.showActions), gated by durandal.hints,
// each line logged once (hinted). durandal.hints.toggle is :DurandalHints.
export class Hints {
  private readonly seen = new Seen();

  constructor(private readonly d: { server: Server; log: ActionLog }) {}

  enabled(): boolean {
    return vscode.workspace.getConfiguration('durandal').get<boolean>('hints', true);
  }

  shown(uri: string, lines: number[]): void {
    const fresh = this.seen.fresh(uri, lines);
    if (fresh.length === 0) return;
    this.d.server.request(Olifant.fileActions, { textDocument: { uri } }).then(fa => {
      for (const l of fresh) {
        const g = generatorAt(fa, l + 1);
        if (g) this.d.log.write({ event: 'hinted', generator: g });
      }
    }, () => undefined);
  }

  register(context: vscode.ExtensionContext): void {
    context.subscriptions.push(
      vscode.commands.registerCommand('durandal.hints.toggle', async () => {
        const c = vscode.workspace.getConfiguration('durandal');
        const set = c.inspect<boolean>('hints');
        const target = set?.workspaceValue !== undefined ? vscode.ConfigurationTarget.Workspace : vscode.ConfigurationTarget.Global;
        await c.update('hints', !this.enabled(), target);
      }),
      vscode.workspace.onDidChangeConfiguration(e => {
        if (e.affectsConfiguration('durandal.hints')) this.refresh();
      }),
    );
  }

  // refresh has VS Code ask for the hints again (the library provider's change event).
  private refresh(): void {
    const lc = this.d.server.client();
    if (!lc) return;
    const feature = lc.getFeature(InlayHintRequest.method);
    for (const ed of vscode.window.visibleTextEditors) feature.getProvider(ed.document)?.onDidChangeInlayHints.fire();
  }
}
