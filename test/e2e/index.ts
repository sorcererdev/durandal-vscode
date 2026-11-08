import { readdirSync } from 'node:fs';
import { join } from 'node:path';
import Mocha from 'mocha';

// run loads the suite's files (<suite>.*.e2e.js), in the order of their numbers (fake.10 after
// fake.9); DURANDAL_E2E_ONLY=<prefix> narrows them while iterating.
export function run(): Promise<void> {
  const suite = process.env.DURANDAL_E2E_SUITE ?? 'fake';
  const mocha = new Mocha({ ui: 'bdd', timeout: suite === 'real' ? 180_000 : 60_000, color: true });
  const only = process.env.DURANDAL_E2E_ONLY;
  // by the number after the suite's name (fake.10 after fake.9), then by name
  const order = (f: string) => Number(/^[a-z]+\.(\d+)/.exec(f)?.[1] ?? 0);
  const files = readdirSync(__dirname)
    .filter(f => f.startsWith(`${suite}.`) && f.endsWith('.e2e.js') && (!only || f.startsWith(only)))
    .sort((a, b) => order(a) - order(b) || a.localeCompare(b));
  for (const f of files) mocha.addFile(join(__dirname, f));
  return new Promise((res, rej) => mocha.run(failures => (failures ? rej(new Error(`${failures} failed`)) : res())));
}
