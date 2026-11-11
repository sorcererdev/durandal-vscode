import * as vscode from 'vscode';
import { errorMessage } from '../errors';
import type { Landed } from '../landed';
import { ErrandParams, ErrandResult, Olifant } from '../protocol';
import { NOT_RUNNING, Say, Server } from '../server';
import { CANCELLED } from '../tdd/flights';
import type { Ui } from '../uiTypes';
import type { VirtualDocs } from '../virtualDocs';
import { landing, Placed, placeBlocks, throughEdits, Verb } from './blocks';
import { applyLineEdits, factEdits, TextEdit0 } from './facts';
import { runningHere } from './here';
import { linesOf, writeLines } from './lineEdits';
import type { PlanDocs } from './planDocs';
import { askBlocks } from './prompt';
import { LineChange, shiftRows } from './rows';
import type { PlansOptions } from './settings';
import {
  CANCELLED_WORD, doWord, landedWord, NOT_APPLIED, NOTHING_RUNNING, nothingBack, PENDING, RUNNING_HERE,
} from './words';

export interface VerbsDeps {
  server: Server; say: Say; ui: () => Ui; docs: VirtualDocs; planDocs: PlanDocs;
  options: () => PlansOptions; landed: Landed;
}

export interface PlanVerbsApi {
  // the verbs in the air on a plan, at their rows as they are now
  running(uri: string): { row: number; verb: Verb }[];
  // the pending marks drawn on a plan's visible editors now, top to bottom
  pending(uri: string): string[];
  // each landing's flashed row
  flashes: { uri: string; row: number }[];
  // the blocks a prompt holds on a plan, at their rows as they are now (Task 4)
  waiting(uri: string): { row: number; lines: string[] }[];
}

// Entry: a verb in the air. row follows the edits (nvim's extmark); request is the row sent; tick
// the plan's version then; gone: its answer is not wanted any more (cancelled, plan closed,
// server stopped).
interface Entry { uri: string; verb: Verb; row: number; request: number; tick: number; cts: vscode.CancellationTokenSource; gone: boolean }

// Wait: blocks a prompt holds; their rows follow the edits. gen: the server start they came from.
interface Wait { uri: string; placed: Placed[]; gen: number }

const REQUEST = { ask: Olifant.plansAsk, validate: Olifant.plansValidate, do: Olifant.plansDo } as const;
const FLASH_MS = 300;

const keyOf = (uri: string) => vscode.Uri.parse(uri).toString();
const openDoc = (uri: string) => vscode.workspace.textDocuments.find(d => d.uri.toString() === keyOf(uri));

// PlanVerbs: ask, validate and do on a plan row (durandal.nvim plans.lua dispatch, landed,
// cancel; M6 spec §4.1-4.2). One request per row; the row shows a pending mark while it runs.
// The answer lands in nvim's order: facts (only at the version asked), a do's review notice,
// blocks (an ask's straight in, the others held for the prompt), the notice, a flash.
export class PlanVerbs {
  private readonly entries = new Set<Entry>();
  private readonly waits = new Set<Wait>();
  // gen: bumped by every server stop; a prompt from an older start does nothing when answered
  private gen = 0;
  private readonly flashes: { uri: string; row: number }[] = [];
  // drawn: the pending marks' texts painted on each plan's visible editors, top to bottom
  private readonly drawn = new Map<string, string[]>();
  private readonly pending = vscode.window.createTextEditorDecorationType({
    after: { color: new vscode.ThemeColor('editorCodeLens.foreground') },
  });
  private readonly flash = vscode.window.createTextEditorDecorationType({
    isWholeLine: true, backgroundColor: new vscode.ThemeColor('diffEditor.insertedLineBackground'),
  });

  constructor(private readonly d: VerbsDeps) {}

  register(context: vscode.ExtensionContext): void {
    context.subscriptions.push(
      this.pending,
      this.flash,
      vscode.commands.registerCommand('durandal.plan.ask', () => this.command('ask')),
      vscode.commands.registerCommand('durandal.plan.validate', () => this.command('validate')),
      vscode.commands.registerCommand('durandal.plan.do', () => this.command('do')),
      vscode.commands.registerCommand('durandal.plan.cancel', () => this.cancel()),
      vscode.workspace.onDidChangeTextDocument(e => this.moved(e)),
      vscode.workspace.onDidCloseTextDocument(doc => this.closed(doc.uri.toString())),
      vscode.window.onDidChangeVisibleTextEditors(() => this.paintAll()),
    );
  }

  api(): PlanVerbsApi {
    return {
      running: uri => [...this.entries].filter(e => e.uri === keyOf(uri)).map(e => ({ row: e.row, verb: e.verb })),
      pending: uri => [...(this.drawn.get(keyOf(uri)) ?? [])],
      flashes: this.flashes,
      waiting: uri => [...this.waits].filter(w => w.uri === keyOf(uri)).flatMap(w => w.placed.map(p => ({ row: p.row, lines: p.lines }))),
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
    this.paint(key);
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
      await writeLines(doc, lines, applyLineEdits(lines, facts));
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
      // the facts now; the blocks wait for the prompt, placed on the plan as the facts left it
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
    if (!straight && placed.length > 0) this.hold(e.uri, e.verb, placed, typeof r.id === 'string' ? r.id : undefined, count);
  }

  // hold: blocks that wait for the prompt; their rows follow the plan's edits meanwhile
  private hold(uri: string, verb: Verb, placed: Placed[], id: string | undefined, lines: number): void {
    const w: Wait = { uri, placed, gen: this.gen };
    this.waits.add(w);
    void askBlocks({ docs: this.d.docs, ui: this.d.ui() }, uri, verb, placed, lines).then(async answer => {
      // a stop (another gen), or the plan closed (dropped from waits): the answer does nothing
      if (!this.waits.delete(w) || w.gen !== this.gen) return;
      if (answer === 'accept') await this.accept(uri, placed, id);
      else if (answer === 'reject') this.outcomes(uri, id, placed, 'rejected');
    }).catch((err: unknown) => {
      this.waits.delete(w);
      void this.d.say('error', errorMessage(err));
    });
  }

  // accept: the blocks written at their rows now (ghosts.lua accept_id), one edit. A plan no
  // longer open drops them without an outcome.
  private async accept(uri: string, placed: readonly Placed[], id: string | undefined): Promise<void> {
    const doc = openDoc(uri);
    if (!doc) return;
    const lines = linesOf(doc);
    const last = Math.max(lines.length - 1, 0);
    const at = placed.map(p => ({ ...p, row: Math.max(0, Math.min(p.row, last)) }));
    const rows = await this.writeBlocks(doc, lines, [], at, id);
    if (rows) this.flashRow(doc, rows.at(-1) ?? 0);
  }

  // writeBlocks: DOC's LINES (read just now, no await since) with FACTS and the PLACED blocks
  // written in one edit, one undo step; then, nvim's `if wrote`, outcome accepted for each block
  // that had lines and landed accept, only when some did. The blocks' rows in the result, or
  // undefined (said) when VS Code did not apply the edit. An ask straight in and Accept all.
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
      this.outcomes(doc.uri.toString(), id, wrote, 'accepted');
      this.d.landed.fire('accept');
    }
    return l.rows;
  }

  // outcomes: each placed block's outcome, to the server, against the answer's id
  private outcomes(uri: string, id: unknown, placed: readonly Placed[], outcome: 'accepted' | 'rejected'): void {
    if (typeof id !== 'string' || !this.d.server.client()) return;
    for (const p of placed) {
      this.d.server.notify(Olifant.plansOutcome, { textDocument: { uri }, id, block: p.index, outcome }).catch(() => undefined);
    }
  }

  // cancel: every verb in the air on the active plan (plans.lua cancel); M6c adds its reconcile
  cancel(): void {
    const uri = vscode.window.activeTextEditor?.document.uri.toString();
    const mine = [...this.entries].filter(e => e.uri === uri);
    if (mine.length === 0) {
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

  // the server stopped: nothing it said stands (spec §5.7)
  stopped(): void {
    this.gen++;
    for (const e of [...this.entries]) {
      e.gone = true;
      this.drop(e);
    }
    this.waits.clear();
    this.paintAll();
  }

  // a closed plan's verbs land nothing and say nothing; its waiting blocks are dropped
  private closed(uri: string): void {
    for (const e of [...this.entries]) {
      if (e.uri !== uri) continue;
      e.gone = true;
      this.drop(e);
    }
    for (const w of [...this.waits]) if (w.uri === uri) this.waits.delete(w);
  }

  private drop(e: Entry): void {
    if (!this.entries.delete(e)) return;
    e.cts.dispose();
    this.paint(e.uri);
  }

  // moved: the rows in the air and the waiting blocks' rows follow the plan's edits
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
    for (const w of this.waits) if (w.uri === uri) for (const p of w.placed) p.row = shiftRows(p.row, cs);
    if (any) this.paint(uri);
  }

  // paint: the pending marks at the end of the running rows, in every editor on URI
  private paint(uri: string): void {
    this.drawn.delete(uri);
    for (const ed of vscode.window.visibleTextEditors) if (ed.document.uri.toString() === uri) this.paintEditor(ed);
  }

  private paintAll(): void {
    this.drawn.clear();
    for (const ed of vscode.window.visibleTextEditors) this.paintEditor(ed);
  }

  private paintEditor(ed: vscode.TextEditor): void {
    const doc = ed.document;
    const uri = doc.uri.toString();
    const marks = [...this.entries].filter(e => e.uri === uri && e.row < doc.lineCount).sort((a, b) => a.row - b.row);
    ed.setDecorations(this.pending, marks.map(e => {
      const end = doc.lineAt(e.row).range.end;
      return { range: new vscode.Range(end, end), renderOptions: { after: { contentText: PENDING[e.verb] } } };
    }));
    if (marks.length > 0) this.drawn.set(uri, marks.map(e => PENDING[e.verb]));
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
