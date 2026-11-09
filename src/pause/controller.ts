import * as vscode from 'vscode';
import type { ConjureParams, Paused } from '../protocol';
import { findRoot } from '../root';
import { NOT_RUNNING, Say, Server } from '../server';
import { chordLabel } from '../settings';
import type { Conjure, PauseSink, ResumeHooks } from '../tdd/conjure';
import type { Flight } from '../tdd/flights';
import type { Ui } from '../uiTypes';
import type { VirtualDocs } from '../virtualDocs';
import { conjureDetails } from './details';
import { conjureView, defaultSelected, entries, layout, noRow, PauseRow, rows, Running } from './model';
import type { PausePanel } from './panel';
import type { Reminders } from './reminder';
import { resumeParams, runningLabel, runningRound } from './resume';
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
  flight?: Flight<vscode.CancellationToken>; message?: string; round?: number;
}

const DIGITS = ['0', '1', '2', '3', '4', '5', '6', '7', '8', '9'];
const keyName = (k: string) => (k === 'Escape' ? 'Esc' : k);
const docOf = (uri: string) => vscode.workspace.textDocuments.find(d => d.uri.toString() === uri);

// PauseController: the window's source and its keys (spec §3, §4.4). The page sends what was
// pressed; the controller decides, re-lays out the model and sends it back.
export class PauseController implements PauseSink {
  readonly store: PauseStore;
  private shownUri: string | undefined;
  private cols = 120;
  private help = false;
  private flipped = false;
  private run: Run | undefined;
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
      this.shownUri = uri;
      this.help = false;
      this.paint(undefined, true);
      return true;
    }
    const p = this.store.get(uri);
    if (!p) return false;
    if (!selection && line >= p.first && line <= p.last) {
      this.shownUri = uri;
      this.help = false;
      this.paint(undefined, true);
      return true;
    }
    this.store.drop(uri, 'the earlier pause is forgotten');
    return false;
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
      await this.answer('select', this.select(m.entry));
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
    await this.answer(key, k ? await k.act(key) : 'nothing to do here');
  }

  view(): View | undefined { return this.d.panel.isOpen() ? this.d.panel.last() : undefined; }
  source(): SourceKind | undefined { return this.d.panel.isOpen() && this.shownUri ? 'conjure' : undefined; }
  notices(): string[] { return [...this.said]; }

  // stopped: the server stopped; nothing it said stands
  stopped(): void {
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
    this.help = false;
    this.flipped = false;
    this.d.panel.close();
  }

  // the panel's tab was closed: the source stays (pause stored, run going)
  closed(): void {
    this.shownUri = undefined;
    this.help = false;
    this.flipped = false;
  }

  private dropped(p: Pause, why: string | undefined): void {
    this.d.reminders.clear(p.uri);
    if (this.shownUri === p.uri && this.run?.uri !== p.uri) this.hide();
    if (why) void this.d.say('info', why);
  }

  private endRun(): void {
    if (this.run) clearInterval(this.run.timer);
    this.run = undefined;
  }

  // --- the keys (pause.lua M.keys :1095-1126)

  private table(): KeyAct[] {
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
}
