import type { ActionEvent } from '../actionLog';
import type { Shown, SuggestKind } from './types';

// View is what the controller changes on screen: the context keys for the active editor's
// suggestion and (milestone 3b) the ⚡ decoration of a non-inline kind.
export interface View {
  keys(k: { visible: boolean; kind?: SuggestKind; band?: string }): void;
  show?(st: Shown): void;
  hide?(uri: string): void;
}

export interface ControllerDeps { view: View; log(e: ActionEvent): void }

// Controller is durandal.nvim suggest.lua's state: the suggestion shown per document, the
// dismissals remembered per document, the context keys. Pure: editor.ts feeds it.
export class Controller {
  protected readonly states = new Map<string, Shown>();
  private readonly dismissed = new Map<string, Set<string>>();
  private active: string | undefined;

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
    if (st.kind !== 'snippet') this.d.view.show?.(st);
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

  // dismissedHook: what else a dismissal does (milestone 3b: a recognition's feedback)
  // eslint-disable-next-line @typescript-eslint/no-unused-vars
  protected dismissedHook(_s: Shown): void {}

  closed(uri: string): void {
    this.clear(uri);
    this.dismissed.delete(uri);
  }

  off(): void {
    for (const uri of [...this.states.keys()]) this.clear(uri);
  }

  private keys(): void {
    const s = this.active ? this.states.get(this.active) : undefined;
    this.d.view.keys(s ? { visible: true, kind: s.kind, band: s.band } : { visible: false });
  }
}
