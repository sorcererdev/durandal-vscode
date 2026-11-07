import type { PlanFile } from '../protocol';

// stale: the pure half of applying a plan (durandal.nvim apply.lua, alder planCheck.ts):
// every planned file must still read as it did when planned, else nothing is applied.

export const staleMessage = (path: string) => `${path} changed since planning; nothing was applied — plan again`;
export const NOTHING_TO_CHANGE = 'Nothing to change: the code already has it';

// seenText is a file's text as an apply would meet it: a dirty document's text; else the
// disk's (null: not on disk). A clean document is not trusted: the file watcher can lag an
// outside write by seconds, and the edit would land on the old text and fail to save.
export function seenText(doc: { dirty: boolean; text: string } | undefined, disk: string | null): string | null {
  return doc?.dirty ? doc.text : disk;
}

// firstStale is the first file whose seen text is not its planned before (null: it must not exist).
export async function firstStale(files: PlanFile[], textOf: (path: string) => Promise<string | null>): Promise<string | undefined> {
  for (const f of files) {
    if ((await textOf(f.path)) !== f.before) return f.path;
  }
  return undefined;
}

export function landedMessage(name: string, count: number, unsaved: string[]): string {
  const n = `${count} file${count === 1 ? '' : 's'}`;
  return unsaved.length === 0 ? `Applied ${name}: ${n}` : `Applied ${name}: ${n} (unsaved: ${unsaved.join(', ')})`;
}
