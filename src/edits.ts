import type { WorkspaceEdit } from 'vscode-languageserver-protocol';

// stripAnnotations: a server edit is what the person already asked for (a region refresh, a
// landing), so it goes in at once. Annotated as needing confirmation, VS Code would open the
// refactor preview for it (olifant marks a multi-file region refresh so).
export function stripAnnotations(edit: WorkspaceEdit): WorkspaceEdit {
  const copy = JSON.parse(JSON.stringify(edit ?? {})) as WorkspaceEdit;
  delete copy.changeAnnotations;
  const strip = (x: unknown) => { delete (x as { annotationId?: unknown }).annotationId; };
  for (const c of copy.documentChanges ?? []) {
    strip(c);
    if ('edits' in c) for (const e of c.edits) strip(e);
  }
  for (const es of Object.values(copy.changes ?? {})) for (const e of es) strip(e);
  return copy;
}

// editedUris are the files an edit writes: its text edits' documents and the files it creates.
export function editedUris(edit: WorkspaceEdit): string[] {
  const out: string[] = [];
  const add = (u: string) => { if (!out.includes(u)) out.push(u); };
  for (const c of edit.documentChanges ?? []) {
    if ('textDocument' in c) add(c.textDocument.uri);
    else if (c.kind === 'create') add(c.uri);
  }
  for (const u of Object.keys(edit.changes ?? {})) add(u);
  return out;
}

export function fileName(uri: string): string {
  const path = uri.replace(/[?#].*$/, '');
  return decodeURIComponent(path.slice(path.lastIndexOf('/') + 1));
}

// versionConflict: an edit made at a version of an open document that is not its version now
// is refused whole (durandal.nvim's rule; olifant ties its edits to versions).
export function versionConflict(edit: WorkspaceEdit, versionOf: (uri: string) => number | undefined): string | undefined {
  for (const c of edit.documentChanges ?? []) {
    if (!('textDocument' in c)) continue;
    const want = c.textDocument.version;
    if (typeof want !== 'number') continue;
    const have = versionOf(c.textDocument.uri);
    if (have !== undefined && have !== want) return `${fileName(c.textDocument.uri)} changed since`;
  }
  return undefined;
}

// appliedMessage is the one notice after an edit: the files it saved, then those it could not.
export function appliedMessage(label: string | undefined, saved: string[], unsaved: string[]): string | undefined {
  const names = [...saved, ...unsaved.map(n => `${n} (unsaved)`)];
  if (names.length === 0) return undefined;
  return `${label && label.trim() !== '' ? label : 'Olifant'}: ${names.join(', ')}`;
}
