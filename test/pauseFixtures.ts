import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import type { ConjurePaused, DoReview, Paused, ReconcileReview } from '../src/protocol';

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

// A review payload from test/fixtures/review (written from durandal.nvim review_spec.lua's
// builders): do = payload(), errand = past(), reconcile = readings(). A fresh copy each call.
export function reviewFixture(name: 'do' | 'errand'): DoReview;
export function reviewFixture(name: 'reconcile'): ReconcileReview;
export function reviewFixture(name: 'do' | 'errand' | 'reconcile'): DoReview | ReconcileReview {
  return JSON.parse(readFileSync(join(root, 'test', 'fixtures', 'review', `${name}.json`), 'utf8')) as DoReview | ReconcileReview;
}
