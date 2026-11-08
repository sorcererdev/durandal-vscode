import * as vscode from 'vscode';
import { errorMessage } from '../errors';
import { MutateResult, MutateSurvivor, Olifant, WaiveResult } from '../protocol';
import type { Say, Server } from '../server';
import type { ListAnswer, ListItem, ListView, Ui } from '../uiTypes';
import type { Marks } from './marks';
import { plainSurvivor, rowsOf, shiftLine } from './memory';
import type { Stub } from './stub';

const WAIVE = { id: 'waive', icon: 'circle-slash', tooltip: 'Waive it (with a reason)' };

interface Open { uri: string; lines: { first: number; last: number }; title: string; view: ListView<MutateSurvivor>; labels: string }

// Survivors: the picker over a mutate's survivors (durandal.nvim survivors.lua, spec §5). Enter
// stubs a test that kills the one picked; the item button waives it with a reason. The editor
// shows the picked one's line. It closes when the active editor changes; its rows follow edits.
export class Survivors {
  private cur: Open | undefined;
  private readonly highlight = vscode.window.createTextEditorDecorationType({
    isWholeLine: true, backgroundColor: new vscode.ThemeColor('editor.rangeHighlightBackground'),
  });

  constructor(private readonly d: { server: Server; say: Say; ui: () => Ui; marks: Marks; stub: Stub }) {}

  register(context: vscode.ExtensionContext): void {
    context.subscriptions.push(
      this.highlight,
      vscode.window.onDidChangeActiveTextEditor(e => {
        if (this.cur && e?.document.uri.toString() !== this.cur.uri) this.close();
      }),
      // an edit moved the survivors (Marks): the unit's lines and the rows follow it (F5)
      this.d.marks.onDidShift(({ uri, changes }) => {
        const cur = this.cur;
        if (!cur || cur.uri !== uri.toString()) return;
        let { first, last } = cur.lines;
        for (const c of changes) {
          const r = c.range;
          const added = c.text.split('\n').length - 1;
          first = shiftLine(first, r.start.line, r.start.character, r.end.line, added);
          last = shiftLine(last, r.start.line, r.start.character, r.end.line, added);
        }
        cur.lines = { first, last };
        this.follow(cur);
      }),
    );
  }

  // open: the picker for an answer's unit, if it has survivors
  open(uri: vscode.Uri, a: MutateResult): void {
    this.close();
    this.show(uri.toString(), a.lines, String(a.summary));
  }

  // refresh: an open picker over the unit an answer covers follows it (the re-mutate)
  refresh(uri: vscode.Uri, a: MutateResult): void {
    const cur = this.cur;
    if (!cur || cur.uri !== uri.toString() || a.lines.last < cur.lines.first || a.lines.first > cur.lines.last) return;
    cur.lines = a.lines;
    // the answer's survivors are new values: the rows take them even when the labels match
    this.follow(cur, true);
  }

  // follow: the open picker's rows from the survivors its unit holds now; none left closes it.
  // An edit that moved nothing leaves the rows be.
  private follow(cur: Open, always = false): void {
    const rows = this.d.marks.memory.within(cur.uri, cur.lines);
    if (rows.length === 0) {
      this.close();
      return;
    }
    const items = this.items(rows);
    const labels = items.map(i => i.label).join('\n');
    if (labels === cur.labels && !always) return;
    cur.labels = labels;
    cur.view.update(items);
  }

  private items(rows: MutateSurvivor[]): ListItem<MutateSurvivor>[] {
    return rowsOf(rows).map(r => ({ ...r, buttons: [WAIVE] }));
  }

  private show(uri: string, lines: { first: number; last: number }, title: string): void {
    const rows = this.d.marks.memory.within(uri, lines);
    if (rows.length === 0) return;
    const items = this.items(rows);
    const view = this.d.ui().list<MutateSurvivor>({
      title, placeholder: 'Enter: stub a test that kills it · the button waives it', items,
      onActive: s => this.reveal(uri, s),
    }, a => this.answered(a));
    this.cur = { uri, lines, title, view, labels: items.map(i => i.label).join('\n') };
  }

  private answered(a: ListAnswer<MutateSurvivor>): void {
    const cur = this.cur;
    if (!cur) return;
    if (a.kind === 'hidden') {
      this.cur = undefined;
      this.unhighlight();
      return;
    }
    this.close();
    if (a.kind === 'accept') void this.d.stub.run({ uri: cur.uri, survivor: a.value });
    else if (a.id === 'waive') void this.waive(cur, a.value);
  }

  // waive: a reason, then olifant/waive; empty or cancelled sends nothing. Back to the picker
  // while the module is the active editor and survivors remain.
  private async waive(cur: Open, s: MutateSurvivor): Promise<void> {
    const reason = (await this.d.ui().text({ title: `Waive ${s.from} → ${s.to} (line ${s.line}), because:`, value: '' }).result)?.trim();
    if (reason) {
      try {
        const r: WaiveResult | null = await this.d.server.request(Olifant.waive, { textDocument: { uri: cur.uri }, survivor: plainSurvivor(s), reason });
        if (r?.waived !== true) throw new Error(`${Olifant.waive.method} answered nothing`);
        this.d.marks.unmark(vscode.Uri.parse(cur.uri), s);
        void this.d.say('info', `waived: ${s.from} → ${s.to} on line ${s.line}`);
      } catch (err) {
        void this.d.say('error', errorMessage(err));
      }
    }
    if (vscode.window.activeTextEditor?.document.uri.toString() === cur.uri) this.show(cur.uri, cur.lines, cur.title);
  }

  private reveal(uri: string, s: MutateSurvivor): void {
    const ed = vscode.window.visibleTextEditors.find(e => e.document.uri.toString() === uri);
    if (!ed) return;
    const row = Math.max(0, Math.min(s.line - 1, ed.document.lineCount - 1));
    const range = new vscode.Range(row, 0, row, 0);
    ed.setDecorations(this.highlight, [range]);
    ed.revealRange(range, vscode.TextEditorRevealType.InCenterIfOutsideViewport);
  }

  private unhighlight(): void {
    for (const e of vscode.window.visibleTextEditors) e.setDecorations(this.highlight, []);
  }

  private close(): void {
    const cur = this.cur;
    this.cur = undefined;
    this.unhighlight();
    cur?.view.close();
  }
}
