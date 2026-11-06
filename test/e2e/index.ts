import { readdirSync } from 'node:fs';
import { join } from 'node:path';
import Mocha from 'mocha';

// run loads the suite's files (<suite>.*.e2e.js), in name order; DURANDAL_E2E_ONLY=<prefix>
// narrows them while iterating.
export function run(): Promise<void> {
  const suite = process.env.DURANDAL_E2E_SUITE ?? 'fake';
  const mocha = new Mocha({ ui: 'bdd', timeout: suite === 'real' ? 180_000 : 60_000, color: true });
  const only = process.env.DURANDAL_E2E_ONLY;
  for (const f of readdirSync(__dirname).filter(f => f.startsWith(`${suite}.`) && f.endsWith('.e2e.js') && (!only || f.startsWith(only))).sort()) {
    mocha.addFile(join(__dirname, f));
  }
  return new Promise((res, rej) => mocha.run(failures => (failures ? rej(new Error(`${failures} failed`)) : res())));
}
