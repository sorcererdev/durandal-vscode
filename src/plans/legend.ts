// A semantic tokens answer decoded with the legend the server announced at initialize (spec
// §3.2), never protocol.ts's constants: a legend change cannot misdecode. No vscode import.

export interface Legend { tokenTypes: readonly string[]; tokenModifiers: readonly string[] }

// Tok: one token, absolute. type '' is an index the legend lacks (an older server's).
export interface Tok { line: number; start: number; length: number; type: string; modifiers: Set<string> }

export function decode(data: ArrayLike<number>, legend: Legend): Tok[] {
  const out: Tok[] = [];
  let line = 0;
  let start = 0;
  for (let i = 0; i + 4 < data.length; i += 5) {
    const dLine = data[i];
    line += dLine;
    start = dLine === 0 ? start + data[i + 1] : data[i + 1];
    const modifiers = new Set<string>();
    let bits = data[i + 4] >>> 0;
    for (let b = 0; bits !== 0 && b < 32; b++, bits >>>= 1) {
      const m = legend.tokenModifiers[b];
      if ((bits & 1) === 1 && m !== undefined) modifiers.add(m);
    }
    out.push({ line, start, length: data[i + 2], type: legend.tokenTypes[data[i + 3]] ?? '', modifiers });
  }
  return out;
}

// TokenEdit: an LSP SemanticTokensEdit (vscode.SemanticTokensEdit has the same shape).
export interface TokenEdit { start: number; deleteCount: number; data?: ArrayLike<number> }

// applyEdits: the edits refer to PREV as it was; applied from the last start down, each
// leaves the earlier starts where they were.
export function applyEdits(prev: readonly number[], edits: readonly TokenEdit[]): number[] {
  const out = [...prev];
  for (const e of [...edits].sort((a, b) => b.start - a.start)) out.splice(e.start, e.deleteCount, ...Array.from(e.data ?? []));
  return out;
}
