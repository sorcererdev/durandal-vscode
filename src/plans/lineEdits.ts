import * as vscode from 'vscode';
import type { Fact } from '../protocol';
import { applyLineEdits, factEdits, hunks, TextEdit0 } from './facts';

// Line edits of a plan as VS Code edits (the review's facts, the verbs' landings). A landing reads
// the lines and writes them with no await between: typing cannot slip in, and VS Code refuses an
// edit made at an older version of an open document (the extension host stamps the version).

// linesOf: a document's lines (lineAt, not split('\n'): a CRLF plan's lines without their '\r')
export const linesOf = (doc: vscode.TextDocument): string[] =>
  Array.from({ length: doc.lineCount }, (_, i) => doc.lineAt(i).text);

// lineEdits: EDITS (rows of DOC as it is now, none overlapping) as one workspace edit
export function lineEdits(doc: vscode.TextDocument, edits: readonly TextEdit0[]): vscode.WorkspaceEdit {
  const we = new vscode.WorkspaceEdit();
  const uri = doc.uri;
  const docEnd = doc.lineAt(doc.lineCount - 1).range.end;
  for (const e of edits) {
    if (e.end < doc.lineCount) {
      we.replace(uri, new vscode.Range(e.start, 0, e.end, 0), e.lines.map(l => l + '\n').join(''));
    } else if (e.lines.length === 0 && e.start > 0 && e.start < doc.lineCount) {
      // the last rows go: from the end of the row before them
      we.replace(uri, new vscode.Range(doc.lineAt(e.start - 1).range.end, docEnd), '');
    } else {
      // the edit reaches past the last line: replace to the end, no trailing newline added
      const start = e.start < doc.lineCount ? new vscode.Position(e.start, 0) : docEnd;
      we.replace(uri, new vscode.Range(start, docEnd), (e.start >= doc.lineCount ? '\n' : '') + e.lines.join('\n'));
    }
  }
  return we;
}

// writeLines: DOC's lines BEFORE (read just now) become AFTER in one edit, one undo step, as
// one change per run of differing rows (hunks), so a row between two changes (a ghost's, a
// running verb's) stays where it is; true when it was written or there was nothing to write
export async function writeLines(doc: vscode.TextDocument, before: readonly string[], after: readonly string[]): Promise<boolean> {
  const es = hunks(before, after);
  if (es.length === 0) return true;
  return vscode.workspace.applyEdit(lineEdits(doc, es));
}

// writeFacts: the engine's facts over DOC as it is now, in one edit
export function writeFacts(doc: vscode.TextDocument, facts: readonly Fact[]): Promise<boolean> {
  const lines = linesOf(doc);
  return writeLines(doc, lines, applyLineEdits(lines, factEdits(lines, [...facts])));
}
