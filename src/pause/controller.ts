import * as vscode from 'vscode';
import { applyServerEdit } from '../applyEdit';
import { errorMessage } from '../errors';
import { factEdits } from '../plans/facts';
import { Olifant } from '../protocol';
import type { ChooseResult, ConjureParams, ErrandResult, Fact, Paused, Review } from '../protocol';
import { findRoot } from '../root';
import { NOT_RUNNING, Say, Server } from '../server';
import { chordLabel } from '../settings';
import type { Conjure, PauseSink, ResumeHooks } from '../tdd/conjure';
import type { Flight } from '../tdd/flights';
import type { Ui } from '../uiTypes';
import type { VirtualDocs } from '../virtualDocs';
import { conjureDetails, reviewDetails } from './details';
import { conjureView, defaultSelected, entries, layout, noRow, PauseRow, rows, Running } from './model';
import type { PausePanel } from './panel';
import { Claim, ProgressClaims, ProgressValue } from './progress';
import type { Reminders } from './reminder';
import { acted, progressWords, resumeParams, runningLabel, runningRound } from './resume';
import { entryIndex, notOffered, reviewRows, reviewTitle, reviewView } from './reviewModel';
import { held, Pause, PauseStore } from './store';
import type { FromPage, View } from './viewModel';

export type SourceKind = 'conjure' | 'do' | 'errand' | 'reconcile';

// KeyAct: a key's action; true when it did something, else why not (the footer's notice)
export interface KeyAct { keys: string[]; act(key: string): Promise<true | string> | true | string }

export interface ControllerDeps {
  server: Server; say: Say; ui: () => Ui; docs: VirtualDocs; panel: PausePanel; reminders: Reminders; conjure: Conjure; platform: string;
}

// a run: a resume in the air, one at a time across documents; pause is the one it took, drawn
// until the answer comes; hooks are its identity (Conjure hands them back with its answer)
interface Run {
  uri: string; pause: Pause; row: PauseRow; started: number; timer: NodeJS.Timeout; hooks: ResumeHooks;
  flight?: Flight<vscode.CancellationToken>; message?: string; round?: number; claim?: Claim;
}

// a review shown: its plan, the payload, the selected file or reading, the choice in the air
interface RevState { planUri: string; review: Review; selected: number; busy?: string }

const BUSY = 'the last answer is still on its way';
// the files of a do, the readings of a reconcile
const countOf = (r: Review) => (r.kind === 'reconcile' ? r.entries.length : r.landing.files.length);

const DIGITS = ['0', '1', '2', '3', '4', '5', '6', '7', '8', '9'];
const keyName = (k: string) => (k === 'Escape' ? 'Esc' : k);
const docOf = (uri: string) => vscode.workspace.textDocuments.find(d => d.uri.toString() === uri);

// PauseController: the window's source and its keys (spec §3, §4.4). The page sends what was
// pressed; the controller decides, re-lays out the model and sends it back.
export class PauseController implements PauseSink {
  readonly store: PauseStore;
  // the source shown: a conjure's file, or a review (spec §5.4); at most one of the two is set
  private shownUri: string | undefined;
  private rev: RevState | undefined;
  private cols = 120;
  private help = false;
  private flipped = false;
  private run: Run | undefined;
  private readonly claims = new ProgressClaims();
  private readonly said: string[] = [];

  constructor(private readonly d: ControllerDeps) {
    this.store = new PauseStore((p, why) => this.dropped(p, why));
  }

  register(context: vscode.ExtensionContext): void {
    context.subscriptions.push(
      // any edit of the unit's file kills the pause server-side (ConjureNext.hs pruned)
      vscode.workspace.onDidChangeTextDocument(e => {
        const uri = e.document.uri.toString();
        const p = this.store.get(uri);
        if (p && e.contentChanges.length > 0 && e.document.version !== p.version) {
          this.store.drop(uri, 'conjure: the file changed, the pause is gone');
        }
      }),
      vscode.workspace.onDidCloseTextDocument(doc => this.store.drop(doc.uri.toString())),
      { dispose: () => this.endRun() },
    );
  }

  // --- the sink (tdd/conjure.ts)

  shown(params: ConjureParams, p: Paused, hooks?: ResumeHooks): void {
    const uri = params.textDocument.uri;
    // only this run's own answer ends it; a stale one's pause is held all the same
    const after = hooks !== undefined && this.run?.hooks === hooks;
    if (after) this.endRun();
    const doc = docOf(uri);
    const h = held(uri, params.position, p, doc?.version ?? 0, doc?.lineCount ?? p.lines.last);
    this.store.set(h);
    this.d.reminders.show(uri, h.last, `conjure paused · ${chordLabel(this.d.platform, 'C')} reopens`);
    void this.d.say('info', p.why ? `conjure paused · ${p.why}` : 'conjure paused');
    this.rev = undefined;
    this.shownUri = uri;
    this.help = false;
    this.paint(after ? 'entry' : undefined, true);
  }

  ended(hooks: ResumeHooks): void {
    // a stale run's end (stopped, then answered) never ends the run going now
    if (this.run?.hooks !== hooks) return;
    const uri = this.run.uri;
    this.endRun();
    if (uri !== undefined && this.shownUri === uri) this.hide();
  }

  atRun(uri: string, line: number, selection: boolean): boolean {
    // the file's resume is in the air (its pause taken): the running view again, no second request
    if (this.run?.uri === uri) {
      this.rev = undefined;
      this.shownUri = uri;
      this.help = false;
      this.paint(undefined, true);
      return true;
    }
    const p = this.store.get(uri);
    if (!p) return false;
    if (!selection && line >= p.first && line <= p.last) {
      this.rev = undefined;
      this.shownUri = uri;
      this.help = false;
      this.paint(undefined, true);
      return true;
    }
    this.store.drop(uri, 'the earlier pause is forgotten');
    return false;
  }

  // showReview: a review in the window (spec §5); entry selects a reading. The same review shown
  // again keeps its selection (and, while its answer is on its way, its state); a pause shown
  // before stays stored with its reminder (§5.4).
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
    this.shownUri = undefined;
    this.help = false;
    this.rev = { planUri, review, selected };
    this.paint(undefined, true);
  }

  // --- the page

  async receive(m: FromPage): Promise<void> {
    if (m.type === 'size') {
      this.cols = m.cols;
      this.paint();
    } else if (m.type === 'key') {
      await this.press(m.key);
    } else if (m.type === 'press') {
      const r = this.view()?.rows[m.row];
      if (r?.key) await this.press(r.key);
    } else if (m.type === 'select') {
      await this.answer('select', this.rev ? this.selectReview(this.rev, m.entry) : this.select(m.entry));
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
    return this.shownUri ? 'conjure' : undefined;
  }
  notices(): string[] { return [...this.said]; }

  // progress: the server's work-done progress (hooks.progress); a resume's words feed its run
  progress(token: string | number, v: ProgressValue): void {
    this.claims.hear(token, v);
  }

  // stopped: the server stopped; nothing it said stands
  stopped(): void {
    this.claims.clear();
    this.endRun();
    this.store.dropAll();
    this.hide();
  }

  // --- drawing

  private current(): { pause: Pause; running?: Running } | undefined {
    const uri = this.shownUri;
    if (!uri) return undefined;
    const r = this.run;
    if (r && r.uri === uri) {
      return {
        pause: r.pause,
        running: {
          label: runningLabel(r.row), message: r.message, seconds: Math.floor((Date.now() - r.started) / 1000),
          round: r.round ?? runningRound(r.row.choice, r.pause.paused), accepted: r.row.choice === 'accept',
        },
      };
    }
    const p = this.store.get(uri);
    return p ? { pause: p } : undefined;
  }

  private selectedOf(p: Pause): number {
    return p.selected ?? defaultSelected(entries(p.paused));
  }

  private paint(flash?: 'row' | 'entry', focus = false): void {
    const r = this.rev;
    if (r) {
      const view = reviewView(r.review, { cols: this.cols, selected: r.selected, flipped: this.flipped, help: this.help, busy: r.busy });
      const beside = vscode.window.visibleTextEditors.find(e => e.document.uri.toString() === r.planUri)?.viewColumn;
      this.d.panel.show(view, { beside, flash, focus });
      return;
    }
    const c = this.current();
    if (!c) return;
    const view = conjureView(c.pause.paused, {
      cols: this.cols, selected: this.selectedOf(c.pause), running: c.running, flipped: this.flipped, help: this.help,
      chord: chordLabel(this.d.platform, 'C'),
    });
    const beside = vscode.window.visibleTextEditors.find(e => e.document.uri.toString() === c.pause.uri)?.viewColumn;
    this.d.panel.show(view, { beside, flash, focus });
  }

  private async answer(key: string, r: true | string): Promise<void> {
    if (r === true) return;
    const text = `${keyName(key)}: ${r}`;
    this.said.push(text);
    this.d.panel.notice(text);
  }

  private hide(): void {
    this.shownUri = undefined;
    this.rev = undefined;
    this.help = false;
    this.flipped = false;
    this.d.panel.close();
  }

  // the panel's tab was closed: the source stays (pause stored, run going, review on the server)
  closed(): void {
    this.shownUri = undefined;
    this.rev = undefined;
    this.help = false;
    this.flipped = false;
  }

  private dropped(p: Pause, why: string | undefined): void {
    this.d.reminders.clear(p.uri);
    if (this.shownUri === p.uri && this.run?.uri !== p.uri) this.hide();
    if (why) void this.d.say('info', why);
  }

  // every path that ends a run comes here (its answer, its end, a stop, dispose): its claim goes with it
  private endRun(): void {
    if (this.run) {
      clearInterval(this.run.timer);
      this.run.claim?.release();
    }
    this.run = undefined;
  }

  // --- the keys (pause.lua M.keys :1095-1126)

  private table(): KeyAct[] {
    if (this.rev) return this.reviewTable(this.rev);
    return [
      { keys: ['c', 'h', 'C', 'w', 'W', 't', 'T', 'p', 'P', 's', 'a', 'r'], act: k => this.rowKey(k) },
      { keys: ['['], act: () => this.step(-1) },
      { keys: [']'], act: () => this.step(1) },
      { keys: DIGITS, act: k => this.jump(Number(k)) },
      // the page scrolls the diff pane itself; reported so every key is accounted for
      { keys: ['j', 'k', 'PageUp', 'PageDown'], act: () => true },
      { keys: ['Tab'], act: () => this.flip() },
      { keys: ['d'], act: () => this.details() },
      { keys: ['x'], act: () => this.cancel() },
      { keys: ['q', 'Escape'], act: () => { this.hide(); return true; } },
      { keys: ['?'], act: () => { this.help = !this.help; this.paint(); return true; } },
    ];
  }

  private rowsOf(p: Pause): PauseRow[] {
    const es = entries(p.paused);
    return rows(p.paused, es[this.selectedOf(p)], layout(this.cols).narrow);
  }

  private rowKey(k: string): true | string | Promise<true | string> {
    // one run at a time, whichever file it is in
    if (this.run) return 'a run is going on · x cancels it';
    const p = this.shownUri ? this.store.get(this.shownUri) : undefined;
    if (!p) return 'nothing to do here';
    const rs = this.rowsOf(p);
    const row = rs.find(r => r.key === k && r.pressable);
    if (row) return this.resume(p, row);
    // why not, with the proposal's own rule (pause.lua no_row :1033-1044)
    return noRow(rs, k);
  }

  private async resume(p: Pause, row: PauseRow): Promise<true | string> {
    // the server check comes first: the pause and the window stay (spec §3.5)
    if (!this.d.server.client()) return NOT_RUNNING;
    let hint: string | undefined;
    if (row.hint) {
      hint = (await this.d.ui().text({ title: 'hint', value: '', prompt: 'goes to the model with the next round' }).result)?.trim();
      if (!hint) return true;
      // dropped or replaced while the sentence was asked: nothing to send
      if (this.store.get(p.uri) !== p) return true;
      // a run began while the sentence was asked: one at a time
      if (this.run) return 'a run is going on · x cancels it';
    }
    const params = resumeParams({ uri: p.uri, position: p.position, token: p.token }, row, hint);
    this.store.take(p.uri);
    this.d.reminders.clear(p.uri);
    const hooks: ResumeHooks = { started: f => { if (this.run?.hooks === hooks) this.run.flight = f; } };
    // the running view ticks only while it is the one shown
    const timer = setInterval(() => { if (this.shownUri === p.uri) this.paint(); }, 1000);
    this.run = { uri: p.uri, pause: p, row, started: Date.now(), timer, hooks };
    const run = this.run;
    // this run's words; drawn, as the timer's tick, only while its file is the one shown
    run.claim = this.claims.claim('conjuring', m => {
      if (this.run !== run) return;
      const w = progressWords(m, runningLabel(row));
      run.message = w.text;
      if (w.round !== undefined) run.round = w.round;
      if (this.shownUri === run.uri) this.paint();
    });
    this.help = false;
    this.paint('row');
    void this.d.conjure.resume(params, hooks);
    return true;
  }

  private select(i: number): true | string {
    if (this.run && this.run.uri === this.shownUri) return 'a run is going on · x cancels it';
    const p = this.shownUri ? this.store.get(this.shownUri) : undefined;
    if (!p || i < 0 || i >= entries(p.paused).length) return 'nothing to do here';
    p.selected = i;
    this.paint('entry');
    return true;
  }

  private step(d: number): true | string {
    if (this.run && this.run.uri === this.shownUri) return 'a run is going on · x cancels it';
    const p = this.shownUri ? this.store.get(this.shownUri) : undefined;
    if (!p) return 'nothing to do here';
    const n = entries(p.paused).length;
    const from = this.selectedOf(p);
    const to = Math.min(Math.max(from + d, 0), n - 1);
    if (to === from || n === 0) return d < 0 ? 'the first entry' : 'the last entry';
    p.selected = to;
    this.paint('entry');
    return true;
  }

  private jump(n: number): true | string {
    if (this.run && this.run.uri === this.shownUri) return 'a run is going on · x cancels it';
    const p = this.shownUri ? this.store.get(this.shownUri) : undefined;
    if (!p) return 'nothing to do here';
    const i = entries(p.paused).findIndex(e => e.n === n && e.kind !== 'proposal');
    if (i < 0) return `no entry ${n}`;
    if (i === this.selectedOf(p)) return `entry ${n} is shown`;
    p.selected = i;
    this.paint('entry');
    return true;
  }

  private flip(): true | string {
    if (!layout(this.cols).narrow) return 'both panes are shown';
    this.flipped = !this.flipped;
    this.paint();
    return true;
  }

  private cancel(): true | string {
    // the run in the air, whichever file it is in
    const f = this.run?.flight;
    if (!f) return 'nothing is running';
    f.cancel('user');
    return true;
  }

  // details: the pause as a markdown document beside the window (spec §6); the window stays
  private async details(): Promise<true | string> {
    const c = this.current();
    if (!c) return 'nothing to do here';
    const unit = vscode.Uri.parse(c.pause.uri);
    const doc = docOf(c.pause.uri);
    const root = unit.scheme === 'file' ? await findRoot(unit.fsPath) : undefined;
    const text = conjureDetails(c.pause.paused, { root, lang: doc?.languageId ?? '' });
    const uri = this.d.docs.set(`details/${c.pause.token}.md`, text);
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
    r.busy = undefined;
    return this.answered(r, choice, res);
  }

  // answered: the edit as one undo step, the facts on the plan, then done (close and say) or the
  // new review in place with what it said (review.lua answered :168-200). files: VS Code reloads
  // unmodified files from disk itself.
  private async answered(r: RevState, choice: string, res: ChooseResult): Promise<true | string> {
    const failed = await this.landReview(r.planUri, res.edit, res.facts);
    const kind = r.review.kind === 'reconcile' ? 'reconcile' : 'do';
    if (failed) {
      if (this.rev !== r) {
        void this.d.say('error', failed);
        return true;
      }
      if (res.review) r.review = res.review;
      this.paint();
      return failed;
    }
    if (res.done) {
      if (this.rev === r) this.hide();
      void this.d.say('info', `${kind}: ${res.said ?? choice}`);
      return true;
    }
    if (this.rev === r) {
      if (res.review) {
        r.review = res.review;
        r.selected = Math.min(r.selected, Math.max(countOf(r.review) - 1, 0));
      }
      this.paint();
    }
    return res.said ?? 'done';
  }

  // landReview: a choose's edit (versioned: refused whole if the plan moved) and its facts; the
  // reason when VS Code or the version check refused
  private async landReview(planUri: string, edit: ChooseResult['edit'], facts: Fact[] | undefined): Promise<string | undefined> {
    if (edit) {
      const lc = this.d.server.client();
      if (!lc) return NOT_RUNNING;
      const done = await applyServerEdit(lc, { label: 'review', edit }, () => undefined, () => undefined);
      if (!done.applied) return done.failureReason ?? 'VS Code did not apply the edit';
    }
    if (facts && facts.length > 0) {
      const doc = await vscode.workspace.openTextDocument(vscode.Uri.parse(planUri));
      // lineAt, not split('\n'): a CRLF plan's lines without their '\r'
      const lines = Array.from({ length: doc.lineCount }, (_, i) => doc.lineAt(i).text);
      const edits = factEdits(lines, facts);
      if (edits.length > 0) {
        const we = new vscode.WorkspaceEdit();
        const uri = doc.uri;
        for (const e of edits) {
          if (e.end < doc.lineCount) {
            we.replace(uri, new vscode.Range(e.start, 0, e.end, 0), e.lines.map(l => l + '\n').join(''));
          } else {
            // the edit reaches past the last line: replace to the end, no trailing newline added
            const end = doc.lineAt(doc.lineCount - 1).range.end;
            const start = e.start < doc.lineCount ? new vscode.Position(e.start, 0) : end;
            we.replace(uri, new vscode.Range(start, end), (e.start >= doc.lineCount ? '\n' : '') + e.lines.join('\n'));
          }
        }
        if (!await vscode.workspace.applyEdit(we)) return 'VS Code did not apply the plan facts';
      }
    }
    return undefined;
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
      await this.redo(r.planUri, review.id, line, text);
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
    r.busy = undefined;
    const said = await this.answered(r, 'reopen', res);
    if (res.reopen) await this.redo(r.planUri, res.reopen.id, line, text);
    return said;
  }

  // redo: plans/do resuming a review's thread; its review arrives through review/ready again
  private async redo(planUri: string, id: string, line: number, text: string): Promise<void> {
    try {
      const a: ErrandResult = await this.d.server.request(Olifant.plansDo, { textDocument: { uri: planUri }, line, resume: id, text });
      const changed = Array.isArray(a.changed) ? a.changed.length : 0;
      const review = typeof a.review === 'string' ? ' · to review' : '';
      void this.d.say('info', `do: ${changed} ${changed === 1 ? 'file' : 'files'} changed${review} · ${Number(a.seconds) || 0} s`);
    } catch (err) {
      void this.d.say('error', errorMessage(err));
    }
  }

  // the review's server-built details beside the window (spec §6)
  private async reviewDetailsOpen(r: RevState): Promise<true> {
    const uri = this.d.docs.set(`details/${r.review.id}.md`, reviewDetails(reviewTitle(r.review), r.review.details));
    await vscode.window.showTextDocument(await vscode.workspace.openTextDocument(uri), { viewColumn: vscode.ViewColumn.Beside, preview: false });
    return true;
  }
}
