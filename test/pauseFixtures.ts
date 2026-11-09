import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import type { ConjurePaused, Paused } from '../src/protocol';

// pauseFixtures: durandal.nvim's four paused answers (test/fixtures/paused). Compiled to
// out/test/, so the repository is two folders up.
export type PausedName = 'plain' | 'wired' | 'steps' | 'check';

const root = join(__dirname, '..', '..');

// wrapped: the file as the server answers it, { paused }
export function wrapped(name: PausedName): ConjurePaused {
  return JSON.parse(readFileSync(join(root, 'test', 'fixtures', 'paused', `${name}.json`), 'utf8')) as ConjurePaused;
}

// fixture: the paused object, a fresh copy each call
export function fixture(name: PausedName): Paused {
  return wrapped(name).paused;
}
