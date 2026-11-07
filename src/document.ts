import { join } from 'node:path';

// document: which document a project command speaks for (durandal.nvim util.document_for):
// the active file when it is in a known project; else a project's .olifant/config.toml, the
// only one silently, one of several by asking. Pure.

export const NO_PROJECT = 'no Olifant project open';

export type DocumentChoice =
  | { kind: 'here'; root: string }
  | { kind: 'config'; root: string }
  | { kind: 'choose'; roots: string[] }
  | { kind: 'none' };

export function chooseDocument(activeRoot: string | undefined, roots: string[]): DocumentChoice {
  if (activeRoot && roots.includes(activeRoot)) return { kind: 'here', root: activeRoot };
  if (roots.length === 0) return { kind: 'none' };
  if (roots.length === 1) return { kind: 'config', root: roots[0] };
  return { kind: 'choose', roots: [...roots].sort() };
}

export const configPath = (root: string) => join(root, '.olifant', 'config.toml');
