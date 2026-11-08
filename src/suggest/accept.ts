import * as vscode from 'vscode';
import type { ActionLog } from '../actionLog';
import { errorMessage } from '../errors';
import type { Plans } from '../land';
import { Olifant, type Plan, type PlanResult } from '../protocol';
import { findRoot, realRoot } from '../root';
import type { Server } from '../server';
import type { Ui } from '../uiTypes';
import { chooseGenerator, complete } from './choices';
import { Controller, noSuchPlan } from './controller';
import { short } from './keys';
import { acceptWay } from './recognition';
import type { Shown } from './types';

// Accept is Tab on a decoration suggestion (M3 spec §3.3-3.5, nvim accept_server :352-401,
// choose_recognition :406-433): the review window on its plan, Apply landing the plan asked for
// again with the model (nothing lands unseen); a choice or a hint chooses the convention and
// its inputs first. A recognition's outcome goes back to the server.
export class Accept {
  constructor(private readonly d: { server: Server; plans: Plans; controller: Controller; log: ActionLog; ui(): Ui }) {}

  async run(st: Shown): Promise<void> {
    const way = acceptWay(st);
    if (way === 'none') return;
    if (way === 'choose') return this.choose(st);
    const root = await this.root(st);
    if (!root || st.planId === undefined) return;
    const ui = this.d.ui();
    this.d.log.write({ event: `${st.kind}-reviewed`, generator: st.generator });
    let plan: Plan | undefined = st.plan;
    if (!plan) {
      try {
        plan = (await this.d.server.request(Olifant.plan, { planId: st.planId })).plan;
      } catch (err) {
        if (noSuchPlan(err)) {
          this.d.controller.clear(st.uri);
          this.d.controller.schedule();
          return;
        }
        ui.error(errorMessage(err));
        return;
      }
    }
    let landed = false;
    const planId = st.planId;
    await this.d.plans.review(ui, root, plan, undefined, {
      title: st.name,
      refill: () => {
        this.d.controller.clear(st.uri);
        return Promise.resolve(vscode.window.withProgress({ location: vscode.ProgressLocation.Window, title: st.name },
          () => this.d.server.request(Olifant.plan, { planId, fill: true })));
      },
      landed: () => {
        landed = true;
        this.d.log.write({ event: `${st.kind}-applied`, generator: st.generator });
        this.d.controller.feedback(st, 'accepted');
      },
    });
    // closed without applying: the suggestion is considered again (nvim on_cancel)
    if (!landed) this.d.controller.schedule();
  }

  // choose: which convention, then its inputs, then its plan as a recognition, reviewed
  async choose(st: Shown): Promise<void> {
    const root = await this.root(st);
    if (!root) return;
    const ui = this.d.ui();
    const gen = st.choice ? await chooseGenerator(ui, st.generator, st.choice) : st.generator;
    if (!gen) return;
    const sets = await complete({
      ui,
      choices: (generator, s) => this.d.server.request(Olifant.choices, { textDocument: { uri: st.uri }, generator, sets: s }),
    }, gen, gen === st.generator ? { ...st.sets } : {});
    if (!sets) return;
    let r: PlanResult;
    try {
      r = await this.d.server.request(Olifant.plan, { textDocument: { uri: st.uri }, generator: gen, sets, recognize: true });
    } catch (err) {
      ui.error(errorMessage(err));
      return;
    }
    await this.d.plans.review(ui, root, r.plan, r.edit, {
      title: short(gen),
      landed: () => {
        this.d.controller.clear(st.uri);
        this.d.log.write({ event: 'recognition-applied', generator: gen });
        this.d.controller.feedback({ ...st, generator: gen }, 'accepted');
      },
    });
  }

  private async root(st: Shown): Promise<string | undefined> {
    const u = vscode.Uri.parse(st.uri);
    const found = u.scheme === 'file' ? await findRoot(u.fsPath) : undefined;
    return found ? realRoot(found) : undefined;
  }
}
