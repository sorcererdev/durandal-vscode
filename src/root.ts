import { promises as fs } from 'node:fs';
import { dirname, join, resolve } from 'node:path';
import { isPlanPath } from './plans/isPlan';

// hasMarker reports whether dir has an entry named exactly `.olifant` that is a directory (or a
// symlink to one). It reads the listing instead of stat-ing dir/.olifant: on a case-insensitive
// file system that stat succeeds for `.Olifant`.
async function hasMarker(dir: string): Promise<boolean> {
  let entries;
  try {
    entries = await fs.readdir(dir, { withFileTypes: true });
  } catch {
    return false;
  }
  const e = entries.find(x => x.name === '.olifant');
  if (!e) return false;
  if (e.isDirectory()) return true;
  if (!e.isSymbolicLink()) return false;
  try {
    return (await fs.stat(join(dir, '.olifant'))).isDirectory();
  } catch {
    return false;
  }
}

// findRoot returns the Olifant project of a file or directory: its nearest ancestor holding
// .olifant/, as olifant lsp finds a file's project.
export async function findRoot(path: string): Promise<string | undefined> {
  const p = resolve(path);
  let dir = p;
  try {
    if (!(await fs.stat(p)).isDirectory()) dir = dirname(p);
  } catch {
    dir = dirname(p);
  }
  for (;;) {
    if (await hasMarker(dir)) return dir;
    const parent = dirname(dir);
    if (parent === dir) return undefined;
    dir = parent;
  }
}

// realRoot is a root's real path: roots are compared by it.
export async function realRoot(root: string): Promise<string> {
  try {
    return await fs.realpath(root);
  } catch {
    return resolve(root);
  }
}

// rootOfConfig is the project of a found .olifant/config.toml.
export function rootOfConfig(configPath: string): string {
  return dirname(dirname(configPath));
}

// isPlanFile: a markdown file under its project's plans/ folder, at any depth (the one plan
// rule, isPlanPath; a file's language is not known here, so only a .md name counts).
export async function isPlanFile(path: string): Promise<boolean> {
  return isPlanPath(resolve(path), await findRoot(path), '');
}
