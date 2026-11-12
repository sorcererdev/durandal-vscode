import * as vscode from 'vscode';
import { errorMessage } from '../errors';
import { ErrandsResult, Olifant, Review } from '../protocol';
import { NOT_RUNNING, Say, Server } from '../server';
import type { Ui } from '../uiTypes';
import { runningHere } from './here';
import { errandLabel, isJournal } from './journal';
import type { PlanDocs } from './planDocs';
import { NO_PAST_DO, NO_RECORD } from './words';

export interface ErrandsDeps {
  server: Server; say: Say; ui: () => Ui; planDocs: PlanDocs;
  // a past do in the pause window, read-only (M5b's errand review)
  show(planUri: string, review: Review): void;
}

type Lc = ReturnType<Server['client']>;

// PlanErrands: the past dos behind a plan's lines (durandal.nvim review.lua open_errand, the
// olifant.plans.errand lens; M6 spec §5.4-5.5). p o on a journal line opens its do; the lens
// lists a step's.
export class PlanErrands {
  constructor(private readonly d: ErrandsDeps) {}

  register(context: vscode.ExtensionContext): void {
    context.subscriptions.push(vscode.commands.registerCommand('durandal.plan.errand', () => this.here()));
  }

  // here: p o; a journal line opens the do behind it, any other line says there is none
  async here(): Promise<void> {
    const h = await runningHere(this.d);
    if (!h) return;
    if (!isJournal(h.editor.document.lineAt(h.row).text)) {
      void this.d.say('info', NO_RECORD);
      return;
    }
    await this.open(h.uri, { row: h.row }, h.lc);
  }

  // list: the lens on ROW of the plan URI: its past dos; one opens, several are picked from
  async list(uri: string, row: number): Promise<void> {
    const lc = this.d.server.client();
    if (!lc) {
      void this.d.say('error', NOT_RUNNING);
      return;
    }
    let r: ErrandsResult | null;
    try {
      r = await this.d.server.request(Olifant.plansErrands, { textDocument: { uri }, row });
    } catch (err) {
      if (this.d.server.client() === lc) void this.d.say('error', errorMessage(err));
      return;
    }
    if (this.d.server.client() !== lc) return;
    const es = Array.isArray(r?.errands) ? r.errands : [];
    if (es.length === 0) {
      void this.d.say('info', NO_PAST_DO);
      return;
    }
    const id = es.length === 1
      ? es[0].id
      : await this.d.ui().pick<string>({ title: 'past dos', items: es.map(e => ({ label: errandLabel(e), value: e.id })) });
    if (id) await this.open(uri, { id }, lc);
  }

  // open: the do by its journal ROW or ID; an error or an empty answer says there is no record
  // (nvim's otherwise); nothing after a server stop
  private async open(uri: string, which: { row: number } | { id: string }, lc: Lc): Promise<void> {
    let r: Review | null;
    try {
      r = await this.d.server.request(Olifant.plansErrand, { textDocument: { uri }, ...which });
    } catch {
      r = null;
    }
    if (this.d.server.client() !== lc) return;
    if (r && typeof r === 'object') this.d.show(uri, r);
    else void this.d.say('info', NO_RECORD);
  }
}
