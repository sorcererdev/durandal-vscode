import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import type { DoReview, ReconcileReview } from '../src/protocol';

// pauseFixtures: the review payloads of test/fixtures/review. Compiled to out/test/, so the
// repository is two folders up.
const root = join(__dirname, '..', '..');

// A review payload from test/fixtures/review (written from durandal.nvim review_spec.lua's
// builders): do = payload(), errand = past(), reconcile = readings(). A fresh copy each call.
export function reviewFixture(name: 'do' | 'errand'): DoReview;
export function reviewFixture(name: 'reconcile'): ReconcileReview;
export function reviewFixture(name: 'do' | 'errand' | 'reconcile'): DoReview | ReconcileReview {
  return JSON.parse(readFileSync(join(root, 'test', 'fixtures', 'review', `${name}.json`), 'utf8')) as DoReview | ReconcileReview;
}
