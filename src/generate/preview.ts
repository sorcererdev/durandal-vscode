import type { PreviewFile, PreviewResult } from '../protocol';

// preview: what the live preview shows for an answer (durandal.nvim generate.lua
// render_preview): the error's parts; nothing to change; or the main file, changed (a diff
// against the file) or new (its text alone), at its first differing line. Pure.

export const NOTHING = 'Nothing to change';

export function fileLine(f: PreviewFile): string {
  return f.new ? `+ ${f.path}` : `~ ${f.path} +${f.added} −${f.removed}`;
}

export function fileSummary(files: PreviewFile[]): string {
  return files.map(fileLine).join(', ');
}

export type PreviewView =
  | { kind: 'error'; lines: string[] }
  | { kind: 'nothing' }
  | { kind: 'changed' | 'new'; path: string; text: string; line: number; title: string };

export function previewView(r: PreviewResult): PreviewView {
  if (r.error) return { kind: 'error', lines: r.error.split('; ') };
  const files = r.files ?? [];
  const main = r.main;
  if (files.length === 0 || !main) return { kind: 'nothing' };
  const f = files.find(x => x.path === main.path);
  return {
    kind: f && !f.new ? 'changed' : 'new',
    path: main.path,
    text: main.text,
    line: Math.max((main.first || 1) - 1, 0),
    title: fileSummary(files),
  };
}
