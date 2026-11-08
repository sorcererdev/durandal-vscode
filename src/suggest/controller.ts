import { CancellationTokenSource } from 'vscode-languageserver-protocol';
import type { CancellationToken } from 'vscode-languageserver-protocol';
import type { ActionEvent } from '../actionLog';
import { errorMessage } from '../errors';
import type { Plan, PlanResult, SuggestResult, Suggestion } from '../protocol';
import { keyOf, recognitionKey } from './keys';
import { followupOf, ghostOf, recognitionOf } from './recognition';
import { Pushed, Store } from './store';
import type { Offer, Shown, SuggestKind } from './types';

// View is what the controller changes on screen: the context keys for the active editor's
// suggestion and (milestone 3b) the ⚡ decoration of a non-inline kind.
export interface View {
  keys(k: { visible: boolean; kind?: SuggestKind; band?: string }): void;
  show?(st: Shown): void;
  hide?(uri: string): void;
  // hideInline: editor.action.inlineSuggest.hide, when a decoration replaces the snippet ghost
  hideInline?(): void;
}

export interface ControllerDeps { view: View; log(e: ActionEvent): void }

// Cursor: the active editor's file, its version, the cursor's line (0-based) and its text.
export interface Cursor { uri: string; version: number; line: number; lineText: string; inProject: boolean }
export interface Timer { set(f: () => void, ms: number): unknown; clear(h: unknown): void }

// ConsiderDeps: what the consideration (milestone 3b) asks of VS Code and the server.
export interface ConsiderDeps {
  enabled(): boolean;
  running(): boolean;
  cursor(): Cursor | undefined;
  // olifant/suggest at a 1-based line
  suggest(uri: string, line: number, token: CancellationToken): Promise<SuggestResult | null>;
  plan(planId: number, token: CancellationToken): Promise<PlanResult>;
  // editor.action.inlineSuggest.trigger: the inline provider answers with the snippet here
  triggerInline(): void;
  feedback(uri: string, generator: string, outcome: 'accepted' | 'dismissed' | 'reset'): void;
  debounceMs(): number;
  timer: Timer;
}

// noSuchPlan: olifant's answer for a planId whose document has moved on (Lsp.hs :542)
export const noSuchPlan = (err: unknown): boolean => errorMessage(err).startsWith('no such plan');

// Controller is durandal.nvim suggest.lua's state: the suggestion shown per document, the
// dismissals remembered per document, the context keys. Pure: editor.ts feeds it.
export class Controller {
  protected readonly states = new Map<string, Shown>();
  private readonly dismissed = new Map<string, Set<string>>();
  private active: string | undefined;
  readonly store = new Store();
  private c: ConsiderDeps | undefined;
  private cts: CancellationTokenSource | undefined;
  private timerHandle: unknown;

  constructor(protected readonly d: ControllerDeps) {}

  state(uri: string): Shown | undefined { return this.states.get(uri); }
  isDismissed(uri: string, key: string): boolean { return this.dismissed.get(uri)?.has(key) ?? false; }

  // nonInline: a decoration kind is shown on this line (the inline ghost yields to it)
  nonInline(uri: string, line: number): boolean {
    const s = this.states.get(uri);
    return !!s && s.kind !== 'snippet' && s.line === line;
  }

  focus(uri: string | undefined): void {
    this.active = uri;
    this.keys();
  }

  // inline: the snippet ghost the inline provider handed VS Code
  inline(st: Shown): void {
    if (this.states.get(st.uri)?.key === st.key) return;
    this.set(st);
  }

  protected set(st: Shown): void {
    const before = this.states.get(st.uri);
    this.states.set(st.uri, st);
    if (st.kind !== 'snippet') {
      // a decoration wins over the snippet ghost VS Code still shows (spec §5, nvim :334)
      if (before?.kind === 'snippet') this.d.view.hideInline?.();
      this.d.view.show?.(st);
    }
    else if (before && before.kind !== 'snippet') this.d.view.hide?.(st.uri);
    const hint = st.kind === 'recognition' && st.band === 'hint';
    this.d.log({
      event: `${st.kind}-shown`, generator: st.generator, band: st.band, score: st.score,
      ...(hint ? { model: (st.reasons ?? []).includes('the model agrees') } : {}),
    });
    this.keys();
  }

  // moved: the cursor or its line's text changed. Off the suggestion's line, or its text
  // changed, the suggestion goes at once (suggest.lua :451-455).
  moved(uri: string, line: number, lineText: string): void {
    const s = this.states.get(uri);
    if (s && (s.line !== line || s.lineText !== lineText)) this.clear(uri);
  }

  clear(uri: string): void {
    const s = this.states.get(uri);
    if (!s) return;
    this.states.delete(uri);
    if (s.kind !== 'snippet') this.d.view.hide?.(uri);
    this.keys();
  }

  clearSnippet(uri: string): void {
    if (this.states.get(uri)?.kind === 'snippet') this.clear(uri);
  }

  // dismiss is Esc: not offered again on this line's text (suggest.lua :103-112)
  dismiss(uri: string): void {
    const s = this.states.get(uri);
    if (!s) return;
    const set = this.dismissed.get(uri) ?? new Set<string>();
    set.add(s.key);
    this.dismissed.set(uri, set);
    this.d.log({ event: `${s.kind}-dismissed`, generator: s.generator, band: s.band, score: s.score });
    this.dismissedHook(s);
    this.clear(uri);
  }

  // dismissedHook: what else a dismissal does: a recognition's feedback
  protected dismissedHook(s: Shown): void { this.feedback(s, 'dismissed'); }

  closed(uri: string): void {
    this.clear(uri);
    this.dismissed.delete(uri);
  }

  // off: ghosts off (and the server stopped, through stopped): nothing shown, asked or pending
  off(): void {
    this.cts?.cancel();
    this.cts = undefined;
    if (this.timerHandle !== undefined) this.c?.timer.clear(this.timerHandle);
    this.timerHandle = undefined;
    for (const uri of [...this.states.keys()]) this.clear(uri);
  }

  // stopped: the server stopped or restarted: off, and its pushes go too (their planIds and
  // cached plans name offers the new server never made)
  stopped(): void {
    this.off();
    this.store.clear();
  }

  // keys: durandal.ghostBand is offer | hint | choice (spec §4)
  private keys(): void {
    const s = this.active ? this.states.get(this.active) : undefined;
    this.d.view.keys(s ? { visible: true, kind: s.kind, band: s.choice ? 'choice' : s.band } : { visible: false });
  }

  attach(c: ConsiderDeps): void { this.c = c; }

  // schedule: the cursor moved or the text changed (suggest.lua schedule, :449-461): the
  // suggestion goes at once if its line was left or edited; the rest waits for the pause.
  schedule(): void {
    const c = this.c;
    const at = c?.cursor();
    if (!c || !at) return;
    this.moved(at.uri, at.line, at.lineText);
    if (this.timerHandle !== undefined) c.timer.clear(this.timerHandle);
    this.timerHandle = c.timer.set(() => {
      this.timerHandle = undefined;
      void this.consider();
    }, c.debounceMs());
  }

  // pushed: olifant/suggestion (suggest.lua receive, :209-216)
  pushed(s: Suggestion): void {
    this.store.receive(s);
    if (this.c?.cursor()?.uri === s.uri) void this.consider();
  }

  // consider: the cursor line's suggestion (suggest.lua consider_server, :220-320): what the
  // server pushed for the document as it is, else what it answers for the line, else the
  // snippet anticipated here (the inline provider). An answer for a cursor, version or line
  // that has moved on, or after ghosts went off or the server stopped, draws nothing.
  async consider(): Promise<void> {
    const c = this.c;
    if (!c) return;
    const at = c.cursor();
    if (!at || !at.inProject) return;
    if (!c.enabled() || !c.running()) {
      this.clear(at.uri);
      return;
    }
    this.cts?.cancel();
    const cts = new CancellationTokenSource();
    this.cts = cts;
    const stale = (): boolean => {
      if (cts.token.isCancellationRequested || !c.enabled() || !c.running()) return true;
      const now = c.cursor();
      return !now || now.uri !== at.uri || now.version !== at.version || now.line !== at.line;
    };
    const p = this.store.current(at.uri, at.version, at.line);
    if (p && (await this.fromPush(c, p, at, stale, cts.token))) return;
    if (stale()) return;
    let sg: SuggestResult | null = null;
    try {
      sg = await c.suggest(at.uri, at.line + 1, cts.token);
    } catch {
      sg = null;
    }
    if (stale()) return;
    if (sg && this.fromAnswer(sg, at)) return;
    this.anticipated(at, sg?.kind === 'snippet');
  }

  // fromPush: true when the push decided (shown, or its plan was asked for); false: pull.
  private async fromPush(c: ConsiderDeps, p: Pushed, at: Cursor, stale: () => boolean, token: CancellationToken): Promise<boolean> {
    const s = p.s;
    if (s.kind === 'snippet') {
      // the push has no body: the inline completion at this line has it (nvim :276-281)
      this.d.log({ event: 'snippet-anticipated', generator: s.label, line: at.line + 1 });
      this.anticipated(at, true);
      return true;
    }
    if (s.kind === 'ghost') return this.offer(at, ghostOf(s));
    const make = (plan?: Plan): Offer => (s.kind === 'recognition' ? recognitionOf(s, plan) : followupOf(s, plan));
    const first = make(p.plan);
    // a hint or a choice needs no plan; an offer and a follow-up are shown with theirs in hand
    if (first.kind === 'recognition' && (first.band !== 'offer' || first.choice)) return this.offer(at, first);
    if (p.plan) return this.offer(at, first);
    if (p.asked) return false;
    p.asked = true;
    // asked once per push means once answered: a newer pass that cancels this request asks
    // again (reset as the cancel happens, so that pass sees it unasked)
    const unasked = token.onCancellationRequested(() => { if (!p.plan) p.asked = false; });
    try {
      p.plan = (await c.plan(s.planId, token)).plan;
    } catch (err) {
      if (token.isCancellationRequested) return true;
      if (!noSuchPlan(err)) return true;
      this.store.forget(at.uri);
      return false;
    } finally {
      unasked.dispose();
    }
    if (stale() || !p.plan) return true;
    this.offer(at, make(p.plan));
    return true;
  }

  // fromAnswer: olifant/suggest's answer (nvim :302-319): true when shown.
  private fromAnswer(sg: SuggestResult, at: Cursor): boolean {
    if (sg.kind === 'recognition') return this.offer(at, recognitionOf(sg, sg.plan));
    if (sg.kind === 'snippet') {
      this.d.log({ event: 'snippet-anticipated', generator: sg.label, line: at.line + 1 });
      return false;
    }
    if (!sg.plan || typeof sg.plan !== 'object') return false;
    return this.offer(at, sg.kind === 'ghost' ? ghostOf(sg) : followupOf(sg, sg.plan));
  }

  // anticipated: nothing else here; a decoration goes. Only when a push or the pull named a
  // snippet at the cursor is the inline ghost asked for (spec §0): the trigger asks every
  // inline provider, so an empty consideration leaves it to VS Code's own automatic trigger.
  private anticipated(at: Cursor, snippet: boolean): void {
    const s = this.states.get(at.uri);
    if (s && s.kind !== 'snippet') this.clear(at.uri);
    if (snippet) this.c?.triggerInline();
  }

  // offer: shown unless dismissed on this line (nvim offer, :229-239); true when it is shown
  private offer(at: Cursor, o: Offer): boolean {
    let key = keyOf(o, at.lineText, at.line + 1);
    if (o.kind === 'recognition') key = recognitionKey(key, o.band, o.choice);
    if (this.isDismissed(at.uri, key)) return false;
    if (this.states.get(at.uri)?.key === key) return true;
    this.set({ ...o, key, uri: at.uri, line: at.line, lineText: at.lineText, version: at.version });
    return true;
  }

  // feedback: what happened to a recognition (its earned quietness, nvim :95-100)
  feedback(st: Shown, outcome: 'accepted' | 'dismissed' | 'reset'): void {
    if (st.kind === 'recognition') this.c?.feedback(st.uri, st.generator, outcome);
  }
}
