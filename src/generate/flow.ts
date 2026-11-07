import type { RequestType, WorkspaceEdit } from 'vscode-languageserver-protocol';
import type { ActionEvent } from '../actionLog';
import { errorMessage } from '../errors';
import { Field, GeneratorItem, GeneratorsResult, Olifant, Plan, PlanResult, PlanSnippet, PreviewResult, Values } from '../protocol';
import type { FormAnswer, FormModel, FormView, Item, TextView, Ui } from '../uiTypes';
import { chooseNew, firstMissing, FormStep, formRows, isChoice, Option, options, rowKey, setValue, short, stepsPayload, valueOf } from './form';
import { fileSummary } from './preview';
import { pickerRows, rank } from './rank';

// flow: the generate picker's state, ported from durandal.nvim generate.lua (and alder-vscode's
// flow.ts): the list, the form of one or more steps, one preview per burst of typing with a
// sequence number so a late answer never counts, Enter's rules, the review, + New. No vscode
// here: the server, the UI and the preview come in through FlowEnv.

export const DEBOUNCE_MS = 80;

export interface Origin { uri: string; position: { line: number; character: number }; root: string }
export interface FlowServer { request<P, R>(type: RequestType<P, R, void>, params: P): Promise<R>; running(): boolean }
export interface PreviewSink { show(r: PreviewResult): void; dispose(): void }
export interface Preset { generator: string; sets?: Values; done?: boolean }
export type FlowEnd = { kind: 'closed' } | { kind: 'applied' } | { kind: 'snippet' } | { kind: 'reviewed' } | { kind: 'sets'; sets: Values };

export interface FlowEnv {
  server: FlowServer;
  ui: Ui;
  preview: PreviewSink;
  recent: string[];
  remember(id: string): void;
  log(e: ActionEvent): void;
  land(plan: Plan, edit: WorkspaceEdit | undefined, name: string): Promise<string | undefined>;
  snippet(s: PlanSnippet): Promise<boolean>;
  review(plan: Plan, edit: WorkspaceEdit | undefined, o: { title: string; landed(): void }): Promise<void>;
  debounceMs?: number;
}

// asPreset reads durandal.generate's argument: {generator, sets, done} (an action's preset).
export function asPreset(a: unknown): Preset | undefined {
  if (!a || typeof a !== 'object') return undefined;
  const o = a as { generator?: unknown; sets?: unknown; done?: unknown };
  if (typeof o.generator !== 'string') return undefined;
  const sets: Values = {};
  if (o.sets && typeof o.sets === 'object') {
    for (const [k, v] of Object.entries(o.sets)) if (typeof v === 'string') sets[k] = v;
  }
  return { generator: o.generator, sets, done: o.done === true };
}

const cancelled = (err: unknown) => !!err && typeof err === 'object' && (err as { code?: unknown }).code === -32800;
const has = (o: object, k: string) => Object.prototype.hasOwnProperty.call(o, k);

// shared by every flow, so a closed flow's answer never matches a new one's number
let seqCounter = 0;

export class Flow {
  readonly result: Promise<FlowEnd>;
  private finish!: (e: FlowEnd) => void;
  private closed = false;
  private items: GeneratorItem[] = [];
  private sel: GeneratorItem | undefined;
  private steps: FormStep[] = [];
  // kept: each generator's steps as Back left them
  private readonly kept = new Map<string, FormStep[]>();
  private doneMode = false;
  private seq = 0;
  private ready = false;
  private updating = false;
  private planning = false;
  private summary = '';
  private error: string | undefined;
  // afterPreview: what Enter or Review does once the newest preview has landed
  private afterPreview: (() => void) | undefined;
  // busy: a field editor is up, or a plan for Enter is being made and landed
  private busy = false;
  private timer: ReturnType<typeof setTimeout> | undefined;
  private view: FormView | undefined;
  private textView: { step: FormStep; name: string; view: TextView } | undefined;
  private active: string | undefined;
  // focusStep: a + New step whose first field gets the focus once its fields arrive
  private focusStep: FormStep | undefined;

  constructor(private readonly env: FlowEnv, private readonly origin: Origin) {
    this.result = new Promise(r => { this.finish = r; });
  }

  private at<E extends object>(extra: E) {
    return { textDocument: { uri: this.origin.uri }, position: this.origin.position, ...extra };
  }

  async start(preset?: Preset): Promise<void> {
    this.doneMode = preset?.done === true;
    let res: GeneratorsResult | null;
    try {
      res = await this.env.server.request(Olifant.generators, this.at({}));
    } catch (err) {
      if (!this.closed) {
        this.env.ui.error(errorMessage(err));
        this.close();
      }
      return;
    }
    if (this.closed) return;
    this.items = res?.generators ?? [];
    if (this.items.length === 0) {
      this.env.ui.error(`no generators in ${this.origin.root} (its packs: .olifant/config.toml)`);
      return this.close();
    }
    if (preset) {
      // an action may name a generator the menu leaves out (menu = false): open it by id
      const g = this.items.find(i => i.id === preset.generator) ?? { id: preset.generator, name: short(preset.generator) };
      return this.select(g, preset.sets ?? {});
    }
    await this.pick();
  }

  private async pick(): Promise<void> {
    const rows = (q: string): Item<GeneratorItem>[] => pickerRows(rank(this.items, q, this.env.recent), q).map(r => ('heading' in r
      ? { label: r.heading, separator: true }
      : { label: r.item.name || r.item.id, description: r.item.summary, value: r.item }));
    const g = await this.env.ui.pick<GeneratorItem>({ title: 'Generate', placeholder: 'a generator', items: rows(''), query: rows });
    if (this.closed) return;
    if (!g) return this.close();
    this.select(g);
  }

  private select(g: GeneratorItem, sets?: Values): void {
    this.sel = g;
    this.steps = (!sets && this.kept.get(g.id)) || [{ generator: g.id, sets: { ...(sets ?? {}) }, fields: [] }];
    this.active = undefined;
    this.error = undefined;
    this.summary = '';
    this.ready = false;
    this.openForm();
    void this.sendPreview();
  }

  private model(): FormModel {
    const name = this.sel ? this.sel.name || short(this.sel.id) : '';
    return {
      title: this.summary ? `${name} · ${this.summary}` : name,
      rows: formRows(this.steps),
      ready: this.ready,
      updating: this.updating || this.planning,
      error: this.error,
      active: this.active,
    };
  }

  private openForm(): void {
    if (this.closed || !this.sel) return;
    this.closeForm();
    this.view = this.env.ui.form(this.model(), a => void this.answer(a));
  }

  private closeForm(): void {
    this.view?.close();
    this.view = undefined;
  }

  private render(): void {
    if (this.sel) this.view?.update(this.model());
  }

  // invalidate makes every preview in flight or waiting stale: not ready until a newer answer.
  private invalidate(): void {
    seqCounter++;
    this.seq = seqCounter;
    this.ready = false;
    if (this.timer) clearTimeout(this.timer);
    this.timer = undefined;
  }

  // requestPreview asks after a pause (one request per burst of typing).
  private requestPreview(): void {
    if (this.closed) return;
    this.invalidate();
    this.error = undefined;
    this.updating = true;
    this.render();
    const ms = this.env.debounceMs ?? DEBOUNCE_MS;
    // no debounce asks at once: a 0 ms timer would still wait for the timers phase
    if (ms <= 0) {
      void this.sendPreview();
      return;
    }
    this.timer = setTimeout(() => void this.sendPreview(), ms);
  }

  private async sendPreview(): Promise<void> {
    if (this.closed || !this.sel) return;
    this.invalidate();
    const n = this.seq;
    this.updating = true;
    this.render();
    let r: PreviewResult;
    try {
      r = await this.env.server.request(Olifant.preview, this.at({ steps: stepsPayload(this.steps, false) }));
    } catch (err) {
      if (this.closed || n !== this.seq || cancelled(err)) return;
      if (!this.env.server.running()) {
        this.env.ui.error(errorMessage(err));
        return this.close();
      }
      return this.onPreviewFailed(n, errorMessage(err));
    }
    this.onPreview(n, r);
  }

  private whyOf(st: FormStep, name: string): string | undefined {
    return st.fields.find(f => f.name === name)?.why ?? undefined;
  }

  private onPreview(n: number, r: PreviewResult): void {
    if (this.closed || n !== this.seq) return;
    this.updating = false;
    (r.steps ?? []).forEach((s, i) => { if (this.steps[i]) this.steps[i].fields = s.fields ?? []; });
    this.ready = r.ready === true;
    this.summary = fileSummary(r.files ?? []);
    this.env.preview.show(r);
    if (this.textView) this.textView.view.setValidation(this.whyOf(this.textView.step, this.textView.name));
    const fresh = this.focusStep;
    if (fresh && fresh.fields.length > 0) {
      this.active = rowKey(this.steps.indexOf(fresh), fresh.fields[0].name);
      this.focusStep = undefined;
    }
    this.render();
    const k = this.afterPreview;
    this.afterPreview = undefined;
    // an answer with an error disarms a waiting Enter (it never applies later, unasked)
    if (k && !r.error) k();
  }

  private onPreviewFailed(n: number, text: string): void {
    if (this.closed || n !== this.seq) return;
    this.updating = false;
    this.ready = false;
    this.afterPreview = undefined;
    this.env.preview.show({ steps: [], files: [], main: null, ready: false, error: text });
    this.render();
  }

  async answer(a: FormAnswer): Promise<void> {
    if (this.closed) return;
    switch (a.kind) {
      case 'escape':
        return this.close();
      case 'back':
        if (this.busy || !this.sel) return;
        this.kept.set(this.sel.id, this.steps);
        this.closeForm();
        this.invalidate();
        this.updating = false;
        this.afterPreview = undefined;
        this.sel = undefined;
        return this.pick();
      case 'field':
        return this.edit(a.step, a.name);
      case 'apply':
        return this.enter();
      case 'review':
        return this.review();
    }
  }

  private async edit(i: number, name: string): Promise<void> {
    const sel = this.sel;
    const st = this.steps[i];
    const f = st?.fields.find(x => x.name === name);
    if (this.closed || this.busy || !sel || !st || !f) return;
    this.active = rowKey(i, name);
    this.closeForm();
    this.busy = true;
    try {
      await this.editor(st, f);
    } catch (err) {
      if (!this.closed) this.env.ui.error(errorMessage(err));
    } finally {
      this.busy = false;
    }
    if (!this.closed && this.sel === sel) this.openForm();
  }

  // editor asks for a field's value: a choice field from its choices and `+ New …`; else typed,
  // each keystroke previewed, Escape putting the value back.
  private async editor(st: FormStep, f: Field): Promise<void> {
    const ui = this.env.ui;
    const title = `${short(st.generator)}: ${f.name}`;
    const now = valueOf(st, f) ?? '';
    if (isChoice(f)) {
      const o = await ui.pick<Option>({ title, items: options(f).map(x => ({ label: x.label, value: x })), active: now || undefined });
      const i = this.steps.indexOf(st);
      if (!o || this.closed || i < 0) return;
      if (o.generator) {
        const next = chooseNew(this.steps, i, f.name, o.generator);
        if (!next) {
          ui.warn('+ New goes two levels deep at most');
          return;
        }
        this.focusStep = next[next.indexOf(st) - 1];
        this.steps = next;
      } else {
        this.steps = setValue(this.steps, i, f.name, o.value);
      }
      this.requestPreview();
      return;
    }
    const had = has(st.sets, f.name);
    const before = st.sets[f.name];
    const set = (v: string | undefined) => {
      const i = this.steps.indexOf(st);
      if (i >= 0) this.steps = setValue(this.steps, i, f.name, v);
      this.requestPreview();
    };
    const view = ui.text({ title, value: now, onChange: t => set(t) });
    this.textView = { step: st, name: f.name, view };
    view.setValidation(this.whyOf(st, f.name));
    const v = await view.result;
    this.textView = undefined;
    if (this.closed) return;
    if (v === undefined) {
      if (had ? st.sets[f.name] !== before : has(st.sets, f.name)) set(had ? before : undefined);
    } else if ((st.sets[f.name] ?? '') !== v) {
      set(v);
    }
  }

  // whenPreviewed runs k once the newest preview has landed: a waiting one is sent now.
  private whenPreviewed(k: () => void): void {
    if (this.timer) {
      this.afterPreview = k;
      void this.sendPreview();
      return;
    }
    if (this.updating) {
      this.afterPreview = k;
      return;
    }
    k();
  }

  private enter(): void {
    if (!this.sel || this.busy) return;
    this.whenPreviewed(() => void this.enterNow());
  }

  // enterNow is generate.lua's enter: not ready → the first missing field; done mode → the
  // values go back; else plan, then a snippet or the files.
  private async enterNow(): Promise<void> {
    const sel = this.sel;
    if (this.closed || !sel || this.busy) return;
    if (!this.ready) {
      const m = firstMissing(this.steps);
      // not awaited: the editor stays up until it answers
      if (m) void this.edit(m.step, m.name);
      return;
    }
    const last = this.steps.length - 1;
    const id = this.steps[last].generator;
    if (this.doneMode) return this.end({ kind: 'sets', sets: stepsPayload(this.steps, true)[last].sets });
    const r = await this.plan(true);
    if (!r || this.closed || this.sel !== sel) return;
    if (r.plan.snippet) {
      this.teardown();
      if (await this.env.snippet(r.plan.snippet)) this.applied(id);
      return this.finish({ kind: 'snippet' });
    }
    this.busy = true;
    this.planning = true;
    this.render();
    let err: string | undefined;
    try {
      err = await this.env.land(r.plan, r.edit, sel.name || short(id));
    } catch (e) {
      err = errorMessage(e);
    } finally {
      this.busy = false;
      this.planning = false;
    }
    if (this.closed) return;
    if (err) {
      // the form stays, with its values and why
      this.error = err;
      this.env.ui.error(err);
      this.render();
      return;
    }
    this.applied(id);
    this.end({ kind: 'applied' });
  }

  // plan asks for the plan of the fields as they are (with what the server inferred). hold
  // keeps every other answer out meanwhile (Enter); Review does not, and checks after.
  private async plan(hold: boolean): Promise<PlanResult | undefined> {
    if (hold) this.busy = true;
    this.planning = true;
    this.render();
    try {
      const r = await this.env.server.request(Olifant.plan, this.at({ steps: stepsPayload(this.steps, true) }));
      if (!r || typeof r.plan !== 'object' || r.plan === null) throw new Error('the server sent no plan');
      return r;
    } catch (err) {
      if (this.closed) return undefined;
      this.error = errorMessage(err);
      this.env.ui.error(this.error);
      if (!this.env.server.running()) this.close();
      return undefined;
    } finally {
      if (hold) this.busy = false;
      this.planning = false;
      this.render();
    }
  }

  private review(): void {
    const sel = this.sel;
    if (!sel || this.busy || this.doneMode) return;
    this.whenPreviewed(() => void this.reviewNow(sel));
  }

  private async reviewNow(sel: GeneratorItem): Promise<void> {
    if (this.closed || this.sel !== sel || this.busy) return;
    const asked = JSON.stringify(stepsPayload(this.steps, false));
    const r = await this.plan(false);
    // the form changed while it was planned, or an editor is up: not the plan of what is on screen
    if (!r || this.closed || this.busy || this.sel !== sel || JSON.stringify(stepsPayload(this.steps, false)) !== asked) return;
    const id = this.steps[this.steps.length - 1].generator;
    this.teardown();
    await this.env.review(r.plan, r.edit, { title: sel.name || short(id), landed: () => this.applied(id) });
    this.finish({ kind: 'reviewed' });
  }

  private applied(id: string): void {
    this.env.remember(id);
    this.env.log({ event: 'generate-applied', generator: id });
  }

  private teardown(): void {
    if (this.closed) return;
    this.closed = true;
    if (this.timer) clearTimeout(this.timer);
    this.timer = undefined;
    this.closeForm();
    this.env.ui.closeSteps();
    this.env.preview.dispose();
  }

  private end(e: FlowEnd): void {
    this.teardown();
    this.finish(e);
  }

  close(): void {
    this.end({ kind: 'closed' });
  }
}
