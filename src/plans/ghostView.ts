import * as vscode from 'vscode';
import { ServedLog } from '../suggest/ghostItem';
import { serve } from '../suggest/inline';
import { Ghost, Ghosts, hoverText, lineCount, markerText, rowLines } from './ghosts';
import { RowMarks } from './rowMarks';

export const GHOST_ACCEPTED = 'durandal.plan.ghostAccepted';
export const GHOST_ESCAPE = 'durandal.plan.ghostEscape';
const TRIGGER = 'editor.action.inlineSuggest.trigger';
const HIDE = 'editor.action.inlineSuggest.hide';

// GhostAcceptedArgs: the native commit's argument: the blocks it wrote by key (VS Code's own
// edit may move the row before the command runs), and the server start they came from
export interface GhostAcceptedArgs { uri: string; gen: number; keys: number[] }

// GhostView draws the ghost rows (M7 spec §3.2): each one ends in `ai · +N lines`, in VS Code's
// ghost-text colour, and its hover shows the row's proposal, so every ghost can be read without
// moving the cursor (nvim's "ai" sign and virtual lines). At the cursor row it hands VS Code the
// row's ghost as an inline item (§3.2), asks again on every cursor move on the row, and
// remembers an Esc there until the cursor leaves.
export class GhostView implements vscode.Disposable {
  // the markers; a row whose blocks have no lines gets none (there is nothing to show as
  // `+0 lines`); its chords still decide it
  private readonly marks = new RowMarks(
    { color: new vscode.ThemeColor('editorGhostText.foreground'), margin: '0 0 0 1.5em' },
    uri => this.rows(uri).filter(r => lineCount(r.blocks) > 0).map(r => ({ row: r.row, text: r.marker, hover: hoverText(r.blocks) })),
  );
  // served: every ask for a plan ghost's item, the last ones kept (the e2e tests read them)
  readonly served = new ServedLog();
  // escaped: the ghost row Esc hid; not asked for again until the cursor leaves it (spec §0.10)
  private escaped: { uri: string; row: number } | undefined;
  // onRow: durandal.planGhostRow as last set
  private onRow: boolean | undefined;

  // gen: the server start the ghosts came from; busy: a p y is writing the plan's ghosts
  constructor(protected readonly d: { ghosts: Ghosts; gen(): number; busy(uri: string): boolean }) {}

  register(context: vscode.ExtensionContext): void {
    context.subscriptions.push(
      this,
      vscode.commands.registerCommand(GHOST_ESCAPE, () => this.escape()),
      vscode.window.onDidChangeVisibleTextEditors(() => this.paintAll()),
      vscode.window.onDidChangeTextEditorSelection(e => this.selected(e.textEditor)),
      vscode.window.onDidChangeActiveTextEditor(ed => this.selected(ed)),
    );
    this.selected(vscode.window.activeTextEditor);
  }

  // rows: URI's ghost rows, top to bottom: the row, its blocks in answer order, its marker text
  rows(uri: string): { row: number; blocks: Ghost[]; marker: string }[] {
    return this.d.ghosts.rows(uri).map(row => {
      const blocks = this.d.ghosts.at(uri, row);
      return { row, blocks, marker: markerText(lineCount(blocks)) };
    });
  }

  // markers: the markers drawn on URI's visible editors now, top to bottom
  markers(uri: string): { row: number; text: string }[] { return this.marks.drawnOn(uri).map(m => ({ row: m.row, text: m.text })); }

  // paint: the markers of URI's ghost rows, in every editor on it
  paint(uri: string): void {
    this.marks.paint(uri);
    this.key(this.cursor());
  }

  paintAll(): void {
    this.marks.paintAll();
    this.key(this.cursor());
  }

  forget(uri: string): void { this.marks.forget(uri); }

  // settled: ghosts decided or dropped (on URI, or everywhere): redrawn; when the cursor's row
  // has lost its ghost, the ghost text VS Code may still show for it is hidden, so no commit
  // can write it
  settled(uri?: string): void {
    const was = this.onRow;
    if (uri === undefined) this.paintAll();
    else this.paint(uri);
    if (was && !this.onRow) void vscode.commands.executeCommand(HIDE);
  }

  // item: the inline middleware's answer at POSITION: the row's ghost as an item; [] when VS
  // Code cannot draw it (the marker and the hover remain) or a p y is writing it; undefined
  // when the row has no ghost (the suggestions' path runs)
  item(document: vscode.TextDocument, position: vscode.Position): vscode.InlineCompletionItem[] | undefined {
    const uri = document.uri.toString();
    const blocks = this.d.ghosts.at(uri, position.line);
    if (blocks.length === 0) return undefined;
    if (this.d.busy(uri)) return [];
    const args: GhostAcceptedArgs = { uri, gen: this.d.gen(), keys: blocks.map(b => b.key) };
    return serve(this.served, document, position.line, text => rowLines(text, blocks).join('\n'), GHOST_ACCEPTED, args);
  }

  // shown: a new ghost on URI: drawn, Esc's memory of it forgotten, shown if the cursor is there
  shown(uri: string): void {
    if (this.escaped?.uri === uri) this.escaped = undefined;
    this.paint(uri);
    this.selected(vscode.window.activeTextEditor);
  }

  // selected: the cursor on a ghost row asks VS Code for its ghost. VS Code hides an inline
  // suggestion on every cursor move and does not ask again (M7 plan checks §2), so every move
  // on the row asks; after an Esc there, not until the cursor has left the row.
  private selected(ed: vscode.TextEditor | undefined): void {
    if (ed && ed !== vscode.window.activeTextEditor) return;
    const at = this.cursor(ed);
    if (this.escaped && (!at || at.uri !== this.escaped.uri || at.row !== this.escaped.row)) this.escaped = undefined;
    this.key(at);
    if (at && !this.escaped) void vscode.commands.executeCommand(TRIGGER);
  }

  // cursor: the active editor's cursor (its primary selection) when it is on a ghost row
  private cursor(ed = vscode.window.activeTextEditor): { uri: string; row: number } | undefined {
    if (!ed) return undefined;
    const uri = ed.document.uri.toString();
    const row = ed.selection.active.line;
    return this.d.ghosts.at(uri, row).length > 0 ? { uri, row } : undefined;
  }

  private key(at: { uri: string; row: number } | undefined): void {
    const on = at !== undefined;
    if (on === this.onRow) return;
    this.onRow = on;
    void vscode.commands.executeCommand('setContext', 'durandal.planGhostRow', on);
  }

  // escape: Esc on a ghost row: hidden, and the row remembered
  private async escape(): Promise<void> {
    this.escaped = this.cursor();
    await vscode.commands.executeCommand(HIDE);
  }

  dispose(): void { this.marks.dispose(); }
}
