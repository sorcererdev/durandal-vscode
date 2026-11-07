import type { Field } from '../src/protocol';
import type { FormStep } from '../src/generate/form';

// Shared builders for tests (not a test file: node --test does not run it).
export const fld = (o: Partial<Field> & { name: string }): Field =>
  ({ value: null, source: null, valid: true, why: null, choices: null, needs: [], new: [], ...o });
export const step = (generator: string, fields: Field[], sets: Record<string, string> = {}): FormStep => ({ generator, sets, fields });
