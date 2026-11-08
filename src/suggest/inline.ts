import * as vscode from 'vscode';
import type { Range } from 'vscode-languageserver-protocol';
import type { InlineItem } from '../protocol';
import { findRoot } from '../root';
import type { ClientHooks } from '../server';
import type { Controller } from './controller';
import { fillCommand, Fill } from './fill';
import { early, GateIn, inlineGate, snippetData } from './gate';

const asRange = (r: Range) => new vscode.Range(r.start.line, r.start.character, r.end.line, r.end.character);
const protoRange = (r: vscode.Range): Range => ({
  start: { line: r.start.line, character: r.start.character }, end: { line: r.end.line, character: r.end.character },
});

// Inline is the client middleware's ghost and snippet hooks (M3 spec §3.1/3.2): the inline
// item olifant anticipates, gated and given the fill command; the completion list's snippets
// given the same command; resolved items' bodies stashed for the fill.
export class Inline implements NonNullable<ClientHooks['suggest']> {
  constructor(private readonly d: { controller: Controller; fill: Fill; enabled(): boolean }) {}

  async inline(document: vscode.TextDocument, position: vscode.Position, context: vscode.InlineCompletionContext,
    token: vscode.CancellationToken, fetch: () => Promise<InlineItem[]>): Promise<vscode.InlineCompletionItem[]> {
    const uri = document.uri.toString();
    const g: GateIn = {
      enabled: this.d.enabled(),
      inProject: document.uri.scheme === 'file' && !!(await findRoot(document.uri.fsPath)),
      completionOpen: !!context.selectedCompletionInfo,
      nonInline: this.d.controller.nonInline(uri, position.line),
      dismissed: k => this.d.controller.isDismissed(uri, k),
      line: position.line,
      lineText: document.lineAt(position.line).text,
    };
    if (early(g)) {
      this.d.controller.clearSnippet(uri);
      return [];
    }
    let items: InlineItem[];
    try {
      items = await fetch();
    } catch {
      // cancelled (-32800) or refused: no ghost
      return [];
    }
    // an answer VS Code no longer wants (the text or cursor moved meanwhile): dropped
    if (token.isCancellationRequested) return [];
    const raw = items[0];
    const r = inlineGate(raw, g);
    if (!r.ok) {
      this.d.controller.clearSnippet(uri);
      return [];
    }
    this.d.controller.inline({
      kind: 'snippet', uri, line: g.line, lineText: g.lineText, version: document.version, key: r.key,
      generator: r.data.generator, name: r.data.generator, sets: r.data.sets,
    });
    const item = new vscode.InlineCompletionItem(new vscode.SnippetString(r.body), asRange(raw.range),
      fillCommand({ uri, range: raw.range, body: r.body, data: r.data }));
    if (raw.filterText !== undefined) item.filterText = raw.filterText;
    return [item];
  }

  // completions gives the list's snippets (olifant's Snippet items with action data) the fill
  // command; durandal.ghosts does not apply to them (nvim).
  completions(document: vscode.TextDocument, items: vscode.CompletionItem[]): void {
    for (const it of items) {
      const data = snippetData((it as { data?: unknown }).data);
      if (!data || it.kind !== vscode.CompletionItemKind.Snippet || !(it.insertText instanceof vscode.SnippetString)) continue;
      const range = it.range instanceof vscode.Range ? it.range : it.range?.replacing;
      if (!range) continue;
      it.command = fillCommand({ uri: document.uri.toString(), range: protoRange(range), body: it.insertText.value, data });
    }
  }

  resolved(item: vscode.CompletionItem): void {
    const data = snippetData((item as { data?: unknown }).data);
    if (data && item.insertText instanceof vscode.SnippetString) this.d.fill.stash(data, item.insertText.value);
  }
}
