import * as vscode from 'vscode';
import type { RequestParam } from 'vscode-languageclient/node';
import type { ActionLog } from '../actionLog';
import type { Plans } from '../land';
import { findOrigin } from '../origin';
import type { Server } from '../server';
import type { Ui } from '../uiTypes';
import type { VirtualDocs } from '../virtualDocs';
import { asPreset, Flow, FlowEnd, Preset } from './flow';
import { PreviewDoc } from './previewDoc';
import { remember } from './rank';

export interface GenerateDeps { server: Server; docs: VirtualDocs; plans: Plans; log: ActionLog; state: vscode.Memento; ui(): Ui }

// Generate owns durandal.generate (an action's preset may come with it) and the form's keys,
// durandal.generate.apply and .review. One flow at a time: a new one closes the old.
export class Generate {
  private active: { closed: boolean; flow?: Flow } | undefined;
  private count = 0;

  constructor(private readonly d: GenerateDeps) {}

  register(context: vscode.ExtensionContext): void {
    context.subscriptions.push(
      vscode.commands.registerCommand('durandal.generate', (preset?: unknown) => this.run(asPreset(preset))),
      vscode.commands.registerCommand('durandal.generate.apply', () => this.active?.flow?.answer({ kind: 'apply' })),
      vscode.commands.registerCommand('durandal.generate.review', () => this.active?.flow?.answer({ kind: 'review' })),
    );
  }

  async run(preset?: Preset): Promise<FlowEnd> {
    if (this.active) {
      this.active.closed = true;
      this.active.flow?.close();
    }
    // claimed before findOrigin awaits, so a second quick run supersedes this one
    const slot: { closed: boolean; flow?: Flow } = { closed: false };
    this.active = slot;
    const n = ++this.count;
    const ui = this.d.ui();
    try {
      const found = await findOrigin(this.d.server, ui, 'Generate in which project?');
      if (!found || slot.closed) return { kind: 'closed' };
      const { origin } = found;
      const key = `durandal.recent:${origin.root}`;
      const recent = () => this.d.state.get<string[]>(key, []);
      const flow = new Flow({
        server: { request: (t, p) => this.d.server.request(t, p as RequestParam<typeof p>), running: () => this.d.server.state() === 'running' },
        ui,
        preview: new PreviewDoc(this.d.docs, n, origin.root),
        recent: recent(),
        remember: id => void this.d.state.update(key, remember(recent(), id)),
        log: e => this.d.log.write(e),
        land: (plan, edit, name) => this.d.plans.land(origin.root, plan, edit, name),
        snippet: s => this.d.plans.snippet(origin.root, s),
        review: (plan, edit, o) => this.d.plans.review(ui, origin.root, plan, edit, o),
      }, origin);
      slot.flow = flow;
      await flow.start(preset);
      const end = await flow.result;
      // back where you were (generate.lua close restores the cursor), after the form and its tabs
      if ((end.kind === 'closed' || end.kind === 'applied') && found.editor && found.selection) {
        await vscode.window.showTextDocument(found.editor.document, { viewColumn: found.editor.viewColumn, selection: found.selection })
          .then(() => undefined, () => undefined);
      }
      return end;
    } finally {
      if (this.active === slot) this.active = undefined;
    }
  }
}
