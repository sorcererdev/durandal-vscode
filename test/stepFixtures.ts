import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import type { Shown } from '../src/protocol';

// stepFixtures: the hand-built shown steps of test/fixtures/step (see its README). Compiled to
// out/test/, so the repository is two folders up. A fresh copy each call.
export type StepName = 'took' | 'nostep' | 'failing';

const root = join(__dirname, '..', '..');

// stepAnswer: the file as the server answers it, { shown }
export function stepAnswer(name: StepName): { shown: Shown } {
  return JSON.parse(readFileSync(join(root, 'test', 'fixtures', 'step', `${name}.json`), 'utf8')) as { shown: Shown };
}

// stepFixture: the shown step itself
export function stepFixture(name: StepName): Shown {
  return stepAnswer(name).shown;
}
