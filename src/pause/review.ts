import * as vscode from 'vscode';
import { errorMessage } from '../errors';
import { CLIENT_COMMANDS, Olifant, ReviewReady } from '../protocol';
import { NOT_RUNNING, Say, Server } from '../server';
import type { PauseController } from './controller';
import { pickAtCursor } from './reviewModel';

// Reviews: the ways into a review (spec §5.1): the server's push after a do, the plan lens
// (olifant.plans.review), and the chord p r on a plan. Each asks olifant/plans/review and shows it
// in the pause window. (Not generate/review.ts's reviewModel, the generate form's review, nor
// land.ts's plans.review, a landing's: those are other reviews.)
export class Reviews {
  constructor(private readonly d: { server: Server; say: Say; controller: PauseController }) {}

  register(context: vscode.ExtensionContext): void {
    context.subscriptions.push(
      vscode.commands.registerCommand('durandal.plan.review', () => this.pick()),
      // the lens: [id, planUri] for a do, ['reconcile', planUri, entry] for a reading
      vscode.commands.registerCommand(CLIENT_COMMANDS.planReview, (id: unknown, planUri: unknown, entry?: unknown) => {
        if (typeof id !== 'string' || typeof planUri !== 'string') return;
        return this.open(planUri, id, typeof entry === 'string' ? entry : undefined);
      }),
    );
  }

  async open(planUri: string, id: string, entry?: string): Promise<void> {
    if (!this.d.server.client()) {
      void this.d.say('error', NOT_RUNNING);
      return;
    }
    try {
      const review = await this.d.server.request(Olifant.plansReview, { textDocument: { uri: planUri }, id });
      this.d.controller.showReview(planUri, review, entry);
    } catch (err) {
      void this.d.say('error', errorMessage(err));
    }
  }

  // pick: the review on the cursor's line, else a reading there, else the first (review.lua at_cursor)
  async pick(): Promise<void> {
    const ed = vscode.window.activeTextEditor;
    if (!ed || ed.document.uri.scheme !== 'file') {
      void this.d.say('error', 'open a plan of an Olifant project first');
      return;
    }
    if (!this.d.server.client()) {
      void this.d.say('error', NOT_RUNNING);
      return;
    }
    const planUri = ed.document.uri.toString();
    let found: { id: string; entry?: string } | undefined;
    try {
      const list = await this.d.server.request(Olifant.plansReviews, { textDocument: { uri: planUri } });
      found = pickAtCursor(list.reviews ?? [], ed.selection.active.line);
    } catch (err) {
      void this.d.say('error', errorMessage(err));
      return;
    }
    if (!found) {
      void this.d.say('info', 'plans: nothing to review');
      return;
    }
    await this.open(planUri, found.id, found.entry);
  }

  // ready: the server's push; the plan need not be open
  ready(p: ReviewReady): void {
    if (typeof p?.id !== 'string' || typeof p.textDocument?.uri !== 'string') return;
    void this.open(p.textDocument.uri, p.id);
  }
}
