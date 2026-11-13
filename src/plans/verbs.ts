import * as vscode from 'vscode';
import type { ActionLog } from '../actionLog';
import { errorMessage } from '../errors';
import type { Landed } from '../landed';
import { ErrandParams, ErrandResult, Olifant } from '../protocol';
import { NOT_RUNNING, Say, Server } from '../server';
import type { ServedLog } from '../suggest/ghostItem';
import { CANCELLED } from '../tdd/flights';
import { landing, Placed, placeBlocks, throughEdits, Verb } from './blocks';
import { applyLineEdits, factEdits, TextEdit0 } from './facts';
import { Ghost, Ghosts, rowLines } from './ghosts';
import { GHOST_ACCEPTED, GhostAcceptedArgs, GhostView } from './ghostView';
import { planHere, runningHere } from './here';
import { linesOf, writeLines } from './lineEdits';
import type { PlanDocs } from './planDocs';
import { LineChange, shiftRows } from './rows';
import { RowMarks } from './rowMarks';
import type { PlansOptions } from './settings';
import {
  CANCELLED_WORD, doWord, landedWord, NO_GHOST, NO_PLAN, NOT_APPLIED, NOTHING_RUNNING, nothingBack, PENDING, RUNNING_HERE,
} from './words';

export interface VerbsDeps {
  server: Server; say: Say; planDocs: PlanDocs; options: () => PlansOptions; landed: Landed; log: ActionLog;
}

export interface PlanVerbsApi {
  // the verbs in the air on a plan, at their rows as they are now
  running(uri: string): { row: number; verb: Verb }[];
  // the pending marks drawn on a plan's visible editors now, top to bottom
  pending(uri: string): string[];
  // each landing's flashed row
  flashes: { uri: string; row: number }[];
  // the ghost blocks on a plan, one entry per row, top to bottom: the row as it is now, its
  // blocks' lines in answer order, the marker the row carries (M7)
  ghosts(uri: string): { row: number; lines: string[]; marker: string }[];
  // the markers drawn on a plan's visible editors now, top to bottom
  markers(uri: string): { row: number; text: string }[];
  // every ask for a plan ghost's inline item, the item served or refused (the last ones kept)
  served: ServedLog;
}

// Entry: a verb in the air. row follows the edits (nvim's extmark); request is the row sent; tick
// the plan's version then; gone: its answer is not wanted any more (cancelled, plan closed,
// server stopped).
interface Entry { uri: string; verb: Verb; row: number; request: number; tick: number; cts: vscode.CancellationTokenSource; gone: boolean }

const REQUEST = { ask: Olifant.plansAsk, validate: Olifant.plansValidate, do: Olifant.plansDo } as const;
const FLASH_MS = 300;

const keyOf = (uri: string) => vscode.Uri.parse(uri).toString();
const openDoc = (uri: string) => vscode.workspace.textDocuments.find(d => d.uri.toString() === keyOf(uri));

// PlanVerbs: ask, validate and do on a plan row (durandal.nvim plans.lua dispatch, landed,
// cancel; M6 spec §4.1-4.2), and the ghosts their answers leave (M7; ghosts.lua). One request
// per row; the row shows a pending mark while it runs. The answer lands in nvim's order: facts
// (only at the version asked), a do's review notice, blocks (an ask's straight in, the others
// held as ghosts under their rows), the notice, a flash.
export class PlanVerbs {
  private readonly entries = new Set<Entry>();
  private readonly ghosts = new Ghosts();
  private readonly view: GhostView;
  // gen: bumped by every server stop; a ghost from an older start is gone
  private gen = 0;
  // the plan's reconcile, which Plan: Cancel also stops (set once both exist)
  private reconcile: { cancel(uri: string): boolean } | undefined;
  private readonly flashes: { uri: string; row: number }[] = [];
  // accepting: the plans whose p y edit is in the air; another p y or p n there finds no ghost
  private readonly accepting = new Set<string>();
  // the pending marks at the end of the running rows
  private readonly pending = new RowMarks({ color: new vscode.ThemeColor('editorCodeLens.foreground') }, uri =>
    [...this.entries].filter(e => e.uri === uri).sort((a, b) => a.row - b.row).map(e => ({ row: e.row, text: PENDING[e.verb] })));
  private readonly flash = vscode.window.createTextEditorDecorationType({
    isWholeLine: true, backgroundColor: new vscode.ThemeColor('diffEditor.insertedLineBackground'),
  });

  constructor(private readonly d: VerbsDeps) {
    this.view = new GhostView({ ghosts: this.ghosts, gen: () => this.gen, busy: uri => this.accepting.has(uri) });
  }

  setReconcile(r: { cancel(uri: string): boolean }): void { this.reconcile = r; }

  register(context: vscode.ExtensionContext): void {
    this.view.register(context);
    context.subscriptions.push(
      this.pending,
      this.flash,
      vscode.commands.registerCommand('durandal.plan.ask', () => this.command('ask')),
      vscode.commands.registerCommand('durandal.plan.validate', () => this.command('validate')),
      vscode.commands.registerCommand('durandal.plan.do', () => this.command('do')),
      vscode.commands.registerCommand('durandal.plan.cancel', () => this.cancel()),
      vscode.commands.registerCommand('durandal.plan.accept', () => this.decide('accepted')),
      vscode.commands.registerCommand('durandal.plan.reject', () => this.decide('rejected')),
      vscode.commands.registerCommand(GHOST_ACCEPTED, (a: GhostAcceptedArgs | undefined) => this.ghostAccepted(a)),
      vscode.workspace.onDidChangeTextDocument(e => this.moved(e)),
      vscode.workspace.onDidCloseTextDocument(doc => this.closed(doc.uri.toString())),
      vscode.window.onDidChangeVisibleTextEditors(() => this.pending.paintAll()),
    );
  }

  api(): PlanVerbsApi {
    return {
      running: uri => [...this.entries].filter(e => e.uri === keyOf(uri)).map(e => ({ row: e.row, verb: e.verb })),
      pending: uri => this.pending.drawnOn(keyOf(uri)).map(m => m.text),
      flashes: this.flashes,
      ghosts: uri => this.view.rows(keyOf(uri)).map(r => ({ row: r.row, lines: r.blocks.flatMap(b => b.lines), marker: r.marker })),
      markers: uri => this.view.markers(keyOf(uri)),
      served: this.view.served,
    };
  }

  // command: the verb on the active plan's cursor row
  async command(verb: Verb): Promise<void> {
    const h = await runningHere({ planDocs: this.d.planDocs, server: this.d.server, say: this.d.say });
    if (h) await this.run(h.uri, verb, h.row);
  }

  // run: VERB on ROW of the plan URI, its answer landed; PARAMS a reopen's resume and text. A
  // plan that is not open is opened (not shown): the review window's reopen names one.
  async run(uri: string, verb: Verb, row: number, params: { resume?: string; text?: string } = {}): Promise<void> {
    if (!this.d.server.client()) {
      void this.d.say('error', NOT_RUNNING);
      return;
    }
    let doc = openDoc(uri);
    if (!doc) {
      try {
        doc = await vscode.workspace.openTextDocument(vscode.Uri.parse(uri));
      } catch (err) {
        void this.d.say('error', errorMessage(err));
        return;
      }
    }
    const key = doc.uri.toString();
    if ([...this.entries].some(e => e.uri === key && e.row === row)) {
      void this.d.say('warn', RUNNING_HERE);
      return;
    }
    const e: Entry = { uri: key, verb, row, request: row, tick: doc.version, cts: new vscode.CancellationTokenSource(), gone: false };
    this.entries.add(e);
    this.pending.paint(key);
    const p: ErrandParams = { textDocument: { uri: key }, line: row, ...params };
    try {
      let r: ErrandResult | null;
      try {
        r = await this.d.server.request(REQUEST[verb], p, e.cts.token);
      } catch (err) {
        if (e.gone) return;
        if ((err as { code?: unknown } | null)?.code === CANCELLED) void this.d.say('info', CANCELLED_WORD);
        else void this.d.say('error', errorMessage(err));
        return;
      }
      if (e.gone) return;
      if (!r) {
        void this.d.say('info', nothingBack(verb));
        return;
      }
      // the entry stays in the air while it lands: the facts' own edit moves its row
      await this.land(e, r);
    } finally {
      this.drop(e);
    }
  }

  // land: R for entry E (plans.lua landed)
  private async land(e: Entry, r: ErrandResult): Promise<void> {
    const doc = openDoc(e.uri);
    if (!doc) return;
    // read, compute and write with no await between
    const lines = linesOf(doc);
    const facts = doc.version === e.tick && Array.isArray(r.facts) ? factEdits(lines, r.facts) : [];
    if (e.verb === 'do' && typeof r.review === 'string') {
      // a git project's do: its lines are its review's (opened by review/ready), its files are
      // reloaded by VS Code itself
      if (!(await writeLines(doc, lines, applyLineEdits(lines, facts)))) {
        void this.d.say('error', NOT_APPLIED);
        return;
      }
      void this.d.say('info', doWord(r));
      this.d.landed.fire('do');
      return;
    }
    // the request row where it is once the facts are in, computed before the write (no event order)
    const tracked = throughEdits(facts, e.row);
    const withFacts = applyLineEdits(lines, facts);
    const placed = placeBlocks(withFacts, r.blocks, e.verb, e.request, tracked);
    const straight = e.verb === 'ask' && !this.d.options().reviewAnswers;
    let rows: number[];
    if (straight) {
      // an ask's answer goes straight in: facts and blocks in one edit, one undo step
      const written = await this.writeBlocks(doc, lines, facts, placed, r.id);
      if (!written) return;
      rows = written;
    } else {
      // the facts now; the blocks become ghosts, placed on the plan as the facts left it
      if (!(await writeLines(doc, lines, withFacts))) {
        void this.d.say('error', NOT_APPLIED);
        return;
      }
      rows = placed.map(p => p.row);
    }
    const count = placed.reduce((k, p) => k + p.lines.length, 0);
    void this.d.say('info', landedWord(e.verb, count, r));
    this.flashRow(doc, rows.at(-1) ?? tracked);
    if (e.verb === 'do') this.d.landed.fire('do');
    if (!straight && placed.length > 0) this.hold(e.uri, e.verb, placed, typeof r.id === 'string' ? r.id : undefined);
  }

  // hold: the blocks as ghosts under their rows until a decision (M7 spec §3.1); a second
  // answer on a row goes after the first's blocks
  private hold(uri: string, verb: Verb, placed: readonly Placed[], id: string | undefined): void {
    this.ghosts.add(uri, verb, id, placed);
    this.d.log.write({ event: 'plan-ghost-shown', verb, blocks: placed.length });
    this.view.shown(uri);
  }

  // decide: p y / p n on the active plan's cursor row, for every ghost block there (spec §3.3,
  // decision 6). Accept writes them in one edit, one undo step; reject writes nothing. The blocks
  // stay in the store, following the edits, until the write lands: they are named by key, as
  // the write's own change moves the row. A refused write leaves them as they are (deviation 11).
  async decide(outcome: 'accepted' | 'rejected'): Promise<void> {
    const h = await planHere(this.d.planDocs);
    if (!h) {
      void this.d.say('error', NO_PLAN);
      return;
    }
    // a p y still writing this plan's row: its blocks are not to be decided twice
    const blocks = this.accepting.has(h.uri) ? [] : this.ghosts.at(h.uri, h.row);
    if (blocks.length === 0) {
      void this.d.say('warn', NO_GHOST);
      return;
    }
    const keys = blocks.map(b => b.key);
    if (outcome === 'rejected') {
      this.settle(h.uri, keys, outcome, 'chord');
      return;
    }
    this.accepting.add(h.uri);
    try {
      // the row's ghost text hidden first, so no Tab writes a second copy while this edit is in
      // the air; a commit VS Code made before the hide has decided the blocks by now
      await this.view.hide();
      // the blocks where they are now (typing during the hide moves them)
      const row = this.ghosts.rows(h.uri).find(r => this.ghosts.at(h.uri, r).some(b => keys.includes(b.key)));
      if (row === undefined) return;
      const now = this.ghosts.at(h.uri, row).filter(b => keys.includes(b.key));
      const doc = h.editor.document;
      // read, compute and write with no await between
      const lines = linesOf(doc);
      const after = rowLines(lines[row] ?? '', now);
      if (!(await writeLines(doc, lines, [...lines.slice(0, row), ...after, ...lines.slice(row + 1)]))) {
        // nothing was written: the ghosts stay (unless something else decided them meanwhile)
        if (this.ghosts.has(h.uri, now.map(b => b.key))) void this.d.say('error', NOT_APPLIED);
        return;
      }
      this.settle(h.uri, now.map(b => b.key), outcome, 'chord', row + after.length - 1);
    } finally {
      this.accepting.delete(h.uri);
    }
  }

  // item: the inline middleware's plan ghost at POSITION (ClientHooks.planGhost)
  item(document: vscode.TextDocument, position: vscode.Position): vscode.InlineCompletionItem[] | undefined {
    return this.view.item(document, position);
  }

  // ghostAccepted: VS Code wrote a row's ghost itself (Tab, the hover toolbar's Accept): its
  // blocks are decided as by p y's, once written (spec §3.3). From an older server start: nothing.
  // The item is not served while a p y writes the plan (busy), and whichever of the two takes
  // the blocks first decides them.
  // Called without arguments (a keybinding, a macro): nothing.
  private ghostAccepted(a: GhostAcceptedArgs | undefined): void {
    if (!a || a.gen !== this.gen) return;
    this.settle(a.uri, a.keys, 'accepted', 'tab', a.last);
  }

  // settle: the blocks named by KEYS, written (accepted, LAST the last row written, flashed) or
  // not (rejected), decided: those still in the store (a server stop, a close or the other
  // accept took the rest without an outcome). Nothing taken: nothing flashed either.
  private settle(uri: string, keys: readonly number[], outcome: 'accepted' | 'rejected', how: 'chord' | 'tab', last?: number): void {
    const taken = this.ghosts.takeKeys(uri, keys);
    if (taken.length === 0) return;
    if (last !== undefined) {
      const doc = openDoc(uri);
      if (doc) this.flashRow(doc, last);
    }
    this.decided(uri, taken, outcome, how);
  }

  // decided: BLOCKS (taken from the store) are decided: each one's outcome to the server, the
  // decision logged, an accept landed (ghosts.lua accept_id / reject: also a block with no lines)
  private decided(uri: string, blocks: readonly Ghost[], outcome: 'accepted' | 'rejected', how: 'chord' | 'tab'): void {
    this.outcomes(uri, blocks, outcome);
    this.d.log.write({ event: outcome === 'accepted' ? 'plan-ghost-accepted' : 'plan-ghost-rejected', verb: blocks[0].verb, blocks: blocks.length, how });
    if (outcome === 'accepted') this.d.landed.fire('accept');
    this.view.settled(uri);
  }

  // writeBlocks: DOC's LINES (read just now, no await since) with FACTS and the PLACED blocks
  // written in one edit, one undo step; then, nvim's `if wrote`, outcome accepted for each block
  // that had lines and landed accept, only when some did. The blocks' rows in the result, or
  // undefined (said) when VS Code did not apply the edit. An ask straight in.
  private async writeBlocks(
    doc: vscode.TextDocument, lines: readonly string[], facts: readonly TextEdit0[], placed: readonly Placed[], id: unknown,
  ): Promise<number[] | undefined> {
    const l = landing(lines, facts, placed);
    if (!(await writeLines(doc, lines, l.lines))) {
      void this.d.say('error', NOT_APPLIED);
      return undefined;
    }
    const wrote = placed.filter(p => p.lines.length > 0);
    if (wrote.length > 0) {
      this.outcomes(doc.uri.toString(), wrote.map(p => ({ id, index: p.index })), 'accepted');
      this.d.landed.fire('accept');
    }
    return l.rows;
  }

  // outcomes: each block's outcome, to the server, against its answer's id
  private outcomes(uri: string, blocks: readonly { id?: unknown; index: number }[], outcome: 'accepted' | 'rejected'): void {
    if (!this.d.server.client()) return;
    for (const b of blocks) {
      if (typeof b.id !== 'string') continue;
      this.d.server.notify(Olifant.plansOutcome, { textDocument: { uri }, id: b.id, block: b.index, outcome }).catch(() => undefined);
    }
  }

  // cancel: every verb in the air on the active plan, and its reconcile (plans.lua cancel)
  cancel(): void {
    const uri = vscode.window.activeTextEditor?.document.uri.toString();
    const mine = [...this.entries].filter(e => e.uri === uri);
    const reconciling = uri !== undefined && (this.reconcile?.cancel(uri) ?? false);
    if (mine.length === 0 && !reconciling) {
      void this.d.say('info', NOTHING_RUNNING);
      return;
    }
    for (const e of mine) {
      e.gone = true;
      e.cts.cancel();
      this.drop(e);
    }
    void this.d.say('info', CANCELLED_WORD);
  }

  // the server stopped: nothing it said stands (spec §5.7): no verb in the air, no ghost
  stopped(): void {
    this.gen++;
    for (const e of [...this.entries]) {
      e.gone = true;
      this.drop(e);
    }
    this.ghosts.clear();
    this.pending.paintAll();
    this.view.settled();
  }

  // a closed plan's verbs land nothing and say nothing; its ghosts go without an outcome
  private closed(uri: string): void {
    for (const e of [...this.entries]) {
      if (e.uri !== uri) continue;
      e.gone = true;
      this.drop(e);
    }
    this.ghosts.drop(uri);
    this.view.forget(uri);
  }

  private drop(e: Entry): void {
    if (!this.entries.delete(e)) return;
    e.cts.dispose();
    this.pending.paint(e.uri);
  }

  // moved: the rows in the air and the ghosts' rows follow the plan's edits
  private moved(ev: vscode.TextDocumentChangeEvent): void {
    if (ev.contentChanges.length === 0) return;
    const uri = ev.document.uri.toString();
    const cs: LineChange[] = ev.contentChanges.map(c => ({
      startLine: c.range.start.line, startChar: c.range.start.character, endLine: c.range.end.line,
      newLines: c.text.split('\n').length - 1,
    }));
    let any = false;
    for (const e of this.entries) {
      if (e.uri !== uri) continue;
      e.row = shiftRows(e.row, cs);
      any = true;
    }
    if (any) this.pending.paint(uri);
    if (this.ghosts.shift(uri, cs)) this.view.paint(uri);
  }

  // flashRow: the landed row for 300 ms (plans.lua flash)
  private flashRow(doc: vscode.TextDocument, row: number): void {
    if (row < 0 || row >= doc.lineCount) return;
    const uri = doc.uri.toString();
    this.flashes.push({ uri, row });
    const eds = vscode.window.visibleTextEditors.filter(ed => ed.document.uri.toString() === uri);
    const range = new vscode.Range(row, 0, row, 0);
    for (const ed of eds) ed.setDecorations(this.flash, [range]);
    setTimeout(() => { for (const ed of eds) ed.setDecorations(this.flash, []); }, FLASH_MS);
  }
}
