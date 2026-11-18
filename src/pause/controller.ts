import * as vscode from 'vscode';
import { applyServerEdit } from '../applyEdit';
import { errorMessage } from '../errors';
import type { Landed } from '../landed';
import { factEdits } from '../plans/facts';
import { lineEdits, linesOf } from '../plans/lineEdits';
import { Olifant } from '../protocol';
import type { ChooseResult, Fact, Review, StepChoice } from '../protocol';
import { NOT_RUNNING, Say, Server } from '../server';
import type { Conjure, StepWindow } from '../tdd/conjure';
import type { Ui } from '../uiTypes';
import type { VirtualDocs } from '../virtualDocs';
import { acted } from './acted';
import { reviewDetails } from './details';
import { layout } from './model';
import type { PausePanel } from './panel';
import { entryIndex, notOffered, reviewRows, reviewTitle, reviewView } from './reviewModel';
import { stepFiles, stepRefusal, stepView } from './stepModel';
import type { StepStore } from './stepStore';
import type { FromPage, View } from './viewModel';

export type SourceKind = 'step' | 'do' | 'errand' | 'reconcile';

// KeyAct: a key's action; true when it did something, else why not (the footer's notice)
export interface KeyAct { keys: string[]; act(key: string): Promise<true | string> | true | string }

export interface ControllerDeps {
  server: Server; say: Say; ui: () => Ui; docs: VirtualDocs; panel: PausePanel; landed: Landed;
  // the window's a, r and h (tdd/conjure.ts); the held steps it draws
  conjure: Pick<Conjure, 'answer'>; steps: StepStore;
  // redo: plans/do resuming a review's thread on the plan's LINE, landed as Plan: Do lands it (M6b)
  redo(planUri: string, line: number, id: string, text: string): Promise<void>;
}

// a step shown: its document (its held step, and the answer in the air, are in the store) and
// the selected file
interface StepState { uri: string; selected: number }

// a review shown: its plan, the payload, the selected file or reading, the choice in the air
interface RevState { planUri: string; review: Review; selected: number; busy?: string }

const BUSY = 'the last answer is still on its way';
// the files of a do, the readings of a reconcile
const countOf = (r: Review) => (r.kind === 'reconcile' ? r.entries.length : r.landing.files.length);

const keyName = (k: string) => (k === 'Escape' ? 'Esc' : k);

// touches: whether a server edit changes the document at uri (both parsed: the server's spelling
// of a uri can differ from VS Code's)
function touches(edit: NonNullable<ChooseResult['edit']>, uri: string): boolean {
  const key = vscode.Uri.parse(uri).toString();
  const same = (u: string) => vscode.Uri.parse(u).toString() === key;
  return Object.keys(edit.changes ?? {}).some(same)
    || (edit.documentChanges ?? []).some(c => 'textDocument' in c && same(c.textDocument.uri));
}

// PauseController: the window's source and its keys (spec §3, §4.4). The page sends what was
// pressed; the controller decides, re-lays out the model and sends it back.
export class PauseController implements StepWindow {
  // the source shown: a step, or a review (spec §5.4); at most one of the two is set
  private step: StepState | undefined;
  private rev: RevState | undefined;
  private cols = 120;
  // the size reports seen (the page's and the tests'): the e2e tests wait for the page's first one (#26)
  private sized = 0;
  private help = false;
  private flipped = false;
  private readonly said: string[] = [];

  constructor(private readonly d: ControllerDeps) {}

  // showReview: a review in the window (spec §5); entry selects a reading. The same review shown
  // again keeps its selection (and, while its answer is on its way, its state); a step shown
  // before stays held (§5.4).
  showReview(planUri: string, review: Review, entry?: string): void {
    const r = this.rev;
    const same = r !== undefined && r.planUri === planUri && r.review.id === review.id && r.review.kind === review.kind;
    if (same && r.busy) {
      r.review = review;
      r.selected = Math.min(r.selected, Math.max(countOf(review) - 1, 0));
      this.paint(undefined, true);
      return;
    }
    const selected = entry !== undefined ? entryIndex(review, entry)
      : same ? Math.min(r.selected, Math.max(countOf(review) - 1, 0)) : 0;
    this.step = undefined;
    this.help = false;
    this.rev = { planUri, review, selected };
    this.paint(undefined, true);
  }

  // showStep: URI's held step in the window (tdd/conjure.ts, spec §3.4): opened, or drawn again
  // in place after h with its first file selected
  showStep(uri: string): void {
    this.rev = undefined;
    this.help = false;
    this.step = { uri, selected: 0 };
    this.paint(undefined, true);
  }

  closeStep(uri: string): void {
    if (this.step?.uri === uri) this.hide();
  }

  // --- the page

  async receive(m: FromPage): Promise<void> {
    if (m.type === 'size') {
      this.sized++;
      this.cols = m.cols;
      this.paint();
    } else if (m.type === 'key') {
      await this.press(m.key);
    } else if (m.type === 'press') {
      const r = this.view()?.rows[m.row];
      if (r?.key) await this.press(r.key);
    } else if (m.type === 'select') {
      await this.answer('select', this.rev ? this.selectReview(this.rev, m.entry) : this.step ? this.selectFile(this.step, m.entry) : 'nothing to do here');
    }
  }

  async press(key: string): Promise<void> {
    // the key table is on: any key closes it (pause.lua: "any key closes this")
    if (this.help && key !== '?') {
      this.help = false;
      this.paint();
      return;
    }
    const k = this.table().find(x => x.keys.includes(key));
    await this.answer(key, k ? await acted(() => k.act(key), key) : 'nothing to do here');
  }

  view(): View | undefined { return this.d.panel.isOpen() ? this.d.panel.last() : undefined; }
  source(): SourceKind | undefined {
    if (!this.d.panel.isOpen()) return undefined;
    if (this.rev) return this.rev.review.kind;
    return this.step ? 'step' : undefined;
  }
  notices(): string[] { return [...this.said]; }
  sizes(): number {
    return this.sized;
  }

  // stopped: the server stopped; no step it showed stands
  stopped(): void {
    this.d.steps.dropAll();
    this.hide();
  }

  // --- drawing

  private paint(flash?: 'row' | 'entry', focus = false): void {
    const r = this.rev;
    if (r) {
      const view = reviewView(r.review, { cols: this.cols, selected: r.selected, flipped: this.flipped, help: this.help, busy: r.busy });
      const beside = vscode.window.visibleTextEditors.find(e => e.document.uri.toString() === r.planUri)?.viewColumn;
      this.d.panel.show(view, { beside, flash, focus });
      return;
    }
    const s = this.step;
    const h = s ? this.d.steps.get(s.uri) : undefined;
    if (!s || !h) return;
    const view = stepView(h.shown, { cols: this.cols, selected: s.selected, flipped: this.flipped, help: this.help, busy: h.busy });
    const beside = vscode.window.visibleTextEditors.find(e => e.document.uri.toString() === s.uri)?.viewColumn;
    this.d.panel.show(view, { beside, flash, focus });
  }

  private async answer(key: string, r: true | string): Promise<void> {
    if (r === true) return;
    const text = `${keyName(key)}: ${r}`;
    this.said.push(text);
    this.d.panel.notice(text);
  }

  private hide(): void {
    this.step = undefined;
    this.rev = undefined;
    this.help = false;
    this.flipped = false;
    this.d.panel.close();
  }

  // the panel's tab was closed: the source stays (the step held, the review on the server)
  closed(): void {
    this.step = undefined;
    this.rev = undefined;
    this.help = false;
    this.flipped = false;
  }

  private table(): KeyAct[] {
    if (this.rev) return this.reviewTable(this.rev);
    if (this.step) return this.stepTable(this.step);
    return [];
  }

  private flip(): true | string {
    if (!layout(this.cols).narrow) return 'both panes are shown';
    this.flipped = !this.flipped;
    this.paint();
    return true;
  }

  // --- the step source (step.lua M.keys)

  private stepTable(s: StepState): KeyAct[] {
    return [
      { keys: ['a'], act: () => this.answerStep(s, 'accept') },
      { keys: ['r'], act: () => this.answerStep(s, 'reject') },
      { keys: ['h'], act: () => this.answerStep(s, 'harder') },
      { keys: ['['], act: () => this.stepFile(s, -1) },
      { keys: [']'], act: () => this.stepFile(s, 1) },
      // the page scrolls the diff pane itself; reported so every key is accounted for
      { keys: ['j', 'k', 'PageUp', 'PageDown'], act: () => true },
      { keys: ['Tab'], act: () => this.flip() },
      { keys: ['d'], act: () => this.stepDetails(s) },
      { keys: ['q', 'Escape'], act: () => { this.hide(); return true; } },
      { keys: ['?'], act: () => { this.help = !this.help; this.paint(); return true; } },
    ];
  }

  // answerStep: the refusals first (nothing sent), then the answer with its busy footer (the
  // busy choice is the held step's, set by conjure as the request goes). A new shown step (h) is
  // drawn in place by showStep; a landing or a rejection closes the window; a failed h keeps
  // the step and says why.
  private async answerStep(s: StepState, choice: StepChoice): Promise<true | string> {
    const h = this.d.steps.get(s.uri);
    if (!h) return 'nothing to do here';
    const no = stepRefusal(h.shown, choice, h.busy !== undefined);
    if (no) return no;
    if (!this.d.server.client()) return NOT_RUNNING;
    const answered = this.d.conjure.answer(s.uri, choice);
    this.paint();
    const kept = await answered;
    if (kept === undefined) return true;
    // the window moved on (closed, or another source): the sentence as a notification
    if (this.step?.uri !== s.uri) {
      void this.d.say('error', kept);
      return true;
    }
    this.paint();
    return kept;
  }

  private stepFile(s: StepState, d: number): true | string {
    const h = this.d.steps.get(s.uri);
    const n = h ? stepFiles(h.shown).length : 0;
    if (n === 0) return 'the step changes no file';
    const to = Math.min(Math.max(s.selected + d, 0), n - 1);
    if (to === s.selected) return d < 0 ? 'the first file' : 'the last file';
    s.selected = to;
    this.paint('entry');
    return true;
  }

  private selectFile(s: StepState, i: number): true | string {
    const h = this.d.steps.get(s.uri);
    if (!h || i < 0 || i >= stepFiles(h.shown).length) return 'nothing to do here';
    s.selected = i;
    this.paint('entry');
    return true;
  }

  // stepDetails: what the writer read and what it replied, as markdown beside the window
  private async stepDetails(s: StepState): Promise<true | string> {
    const h = this.d.steps.get(s.uri);
    if (!h) return 'nothing to do here';
    const text = reviewDetails(`conjure · ${h.shown.unit}`, [
      { title: 'the situation the writer read', text: String(h.shown.situation ?? '') },
      { title: "the writer's reply", text: String(h.shown.reply ?? '') },
    ]);
    const uri = this.d.docs.set(`details/${h.shown.token}.md`, text);
    await vscode.window.showTextDocument(await vscode.workspace.openTextDocument(uri), { viewColumn: vscode.ViewColumn.Beside, preview: false });
    return true;
  }

  // --- the review source (review.lua keys :217-293, readings :383-430)

  private reviewTable(r: RevState): KeyAct[] {
    const shared: KeyAct[] = [
      { keys: ['['], act: () => this.stepReview(r, -1) },
      { keys: [']'], act: () => this.stepReview(r, 1) },
      // the page scrolls the diff pane itself; reported so every key is accounted for
      { keys: ['j', 'k', 'PageUp', 'PageDown'], act: () => true },
      { keys: ['Tab'], act: () => this.flip() },
      { keys: ['d'], act: () => this.reviewDetailsOpen(r) },
      { keys: ['q', 'Escape'], act: () => { this.hide(); return true; } },
      { keys: ['?'], act: () => { this.help = !this.help; this.paint(); return true; } },
    ];
    if (r.review.kind === 'errand') return [{ keys: ['o'], act: () => this.reopen(r) }, ...shared];
    if (r.review.kind === 'do') {
      const offer = (k: string, choice: string): KeyAct => ({ keys: [k], act: () => this.offer(r, k, choice) });
      return [offer('a', 'keep'), offer('r', 'revert'), offer('t', 'test'), offer('p', 'allow'), { keys: ['o'], act: () => this.reopen(r) }, ...shared];
    }
    return [{ keys: ['a', 'r', 'n', 'i', '1', '2', '3', '4', '5', '6', '7', '8', '9'], act: k => this.byKey(r, k) }, ...shared];
  }

  // offer: a do's fixed key answers with its choice when the review offers it
  private offer(r: RevState, key: string, choice: string): Promise<true | string> | string {
    if (r.busy) return BUSY;
    if (r.review.kind === 'reconcile' || !r.review.offers.some(o => o.choice === choice)) return notOffered(r.review, key);
    return this.choose(r, choice, {});
  }

  // byKey: a reading's offer by its key (digits place under the open step the offer names)
  private byKey(r: RevState, key: string): Promise<true | string> | string {
    if (r.busy) return BUSY;
    const row = reviewRows(r.review, r.selected).find(x => x.key === key);
    if (!row) return notOffered(r.review, key);
    const extra: { entry?: string; step?: number } = {};
    if (row.entry !== undefined) extra.entry = row.entry;
    if (row.step !== undefined) extra.step = row.step;
    return this.choose(r, row.choice, extra);
  }

  private async choose(r: RevState, choice: string, extra: { entry?: string; step?: number }): Promise<true | string> {
    if (!this.d.server.client()) return NOT_RUNNING;
    r.busy = choice;
    this.paint();
    let res: ChooseResult;
    try {
      res = await this.d.server.request(Olifant.plansReviewChoose, { textDocument: { uri: r.planUri }, id: r.review.id, choice, ...extra });
    } catch (err) {
      r.busy = undefined;
      // the window moved on (closed, or another source): the error as a notification
      if (this.rev !== r) {
        void this.d.say('error', errorMessage(err));
        return true;
      }
      this.paint();
      return errorMessage(err);
    }
    return this.answered(r, choice, res);
  }

  // answered: the edit as one undo step, the facts on the plan, then done (close and say) or the
  // new review in place with what it said (review.lua answered :168-200). files: VS Code reloads
  // unmodified files from disk itself. busy (set by the caller) holds until the answer has landed:
  // a press while the edit applies still waits.
  private async answered(r: RevState, choice: string, res: ChooseResult): Promise<true | string> {
    let failed: string | undefined;
    try {
      failed = await this.landReview(r.planUri, res.edit, res.facts);
    } finally {
      // a throw on the way (the plan unreadable) must not leave the review busy for good
      r.busy = undefined;
    }
    const kind = r.review.kind === 'reconcile' ? 'reconcile' : 'do';
    if (failed) {
      if (this.rev !== r) {
        void this.d.say('error', failed);
        return true;
      }
      if (res.review) {
        r.review = res.review;
        r.selected = Math.min(r.selected, Math.max(countOf(r.review) - 1, 0));
      }
      this.paint();
      return failed;
    }
    if (res.done) {
      if (this.rev === r) this.hide();
      void this.d.say('info', `${kind}: ${res.said ?? choice}`);
      // a review answered done landed (review.lua :192): the plan reconciles
      this.d.landed.fire('review');
      return true;
    }
    // the window moved on (closed, or another review): what it said is not that window's (nvim is silent)
    if (this.rev !== r) return true;
    if (res.review) {
      r.review = res.review;
      r.selected = Math.min(r.selected, Math.max(countOf(r.review) - 1, 0));
    }
    this.paint();
    return res.said ?? 'done';
  }

  // landReview: a choose's edit (versioned: refused whole if the plan moved) and its facts; the
  // reason when VS Code or the version check refused. A plan it changed that no editor shows
  // is said (#11).
  private async landReview(planUri: string, edit: ChooseResult['edit'], facts: Fact[] | undefined): Promise<string | undefined> {
    let changed = false;
    if (edit) {
      const lc = this.d.server.client();
      if (!lc) return NOT_RUNNING;
      const done = await applyServerEdit(lc, { label: 'review', edit }, () => undefined, () => undefined);
      if (!done.applied) return done.failureReason ?? 'VS Code did not apply the edit';
      changed = touches(edit, planUri);
    }
    if (facts && facts.length > 0) {
      const doc = await vscode.workspace.openTextDocument(vscode.Uri.parse(planUri));
      const edits = factEdits(linesOf(doc), facts);
      if (edits.length > 0) {
        if (!await vscode.workspace.applyEdit(lineEdits(doc, edits))) {
          // the edit may have landed in the hidden plan already: still say it, once
          if (changed) this.unseen(planUri);
          return 'VS Code did not apply the plan facts';
        }
        changed = true;
      }
    }
    if (changed) this.unseen(planUri);
    return undefined;
  }

  // unseen: a plan a review's answer changed, shown in no editor, is open and unsaved where the
  // person cannot see it (#11): said once, with Open. The plan is not opened for them (it would
  // cover the file they are in) and the edit is not refused (the server has moved on).
  private unseen(planUri: string): void {
    const uri = vscode.Uri.parse(planUri);
    if (vscode.window.visibleTextEditors.some(e => e.document.uri.toString() === uri.toString())) return;
    const name = uri.path.slice(uri.path.lastIndexOf('/') + 1);
    void this.d.say('info', `plan ${name} changed · unsaved`, 'Open').then(c => {
      if (c === 'Open') void vscode.window.showTextDocument(uri);
    });
  }

  private selectReview(r: RevState, i: number): true | string {
    if (i < 0 || i >= countOf(r.review)) return 'nothing to do here';
    r.selected = i;
    this.paint('entry');
    return true;
  }

  private stepReview(r: RevState, d: number): true | string {
    const reading = r.review.kind === 'reconcile';
    const count = countOf(r.review);
    if (count === 0) return reading ? 'nothing to review' : 'no file changed';
    const to = Math.min(Math.max(r.selected + d, 0), count - 1);
    if (to === r.selected) return d < 0 ? (reading ? 'the first reading' : 'the first file') : (reading ? 'the last reading' : 'the last file');
    r.selected = to;
    this.paint('entry');
    return true;
  }

  // reopen (o): what the do should change, then a live do is kept and its thread resumed; an
  // errand's thread is resumed at once (spec §5.3). The do's own handling is M6's: one line here.
  private async reopen(r: RevState): Promise<true | string> {
    if (r.busy) return BUSY;
    const review = r.review;
    if (review.kind === 'reconcile' || !review.offers.some(o => o.choice === 'reopen')) return notOffered(review, 'o');
    const text = (await this.d.ui().text({ title: 'more', value: '', prompt: 'what the do should change' }).result)?.trim();
    if (!text) return true;
    // the window moved on while the sentence was asked: nothing to send
    if (this.rev !== r) return true;
    const line = review.row ?? 0;
    if (review.kind === 'errand') {
      this.hide();
      await this.d.redo(r.planUri, line, review.id, text);
      return true;
    }
    if (!this.d.server.client()) return NOT_RUNNING;
    r.busy = 'reopen';
    this.paint();
    let res: ChooseResult;
    try {
      res = await this.d.server.request(Olifant.plansReviewChoose, { textDocument: { uri: r.planUri }, id: review.id, choice: 'reopen' });
    } catch (err) {
      r.busy = undefined;
      if (this.rev !== r) {
        void this.d.say('error', errorMessage(err));
        return true;
      }
      this.paint();
      return errorMessage(err);
    }
    const said = await this.answered(r, 'reopen', res);
    if (res.reopen) await this.d.redo(r.planUri, line, res.reopen.id, text);
    return said;
  }

  // the review's server-built details beside the window (spec §6)
  private async reviewDetailsOpen(r: RevState): Promise<true> {
    const uri = this.d.docs.set(`details/${r.review.id}.md`, reviewDetails(reviewTitle(r.review), r.review.details));
    await vscode.window.showTextDocument(await vscode.workspace.openTextDocument(uri), { viewColumn: vscode.ViewColumn.Beside, preview: false });
    return true;
  }
}
