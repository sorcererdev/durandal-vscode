import type { Field, Source, Step, Values } from '../protocol';

// form: the generate form's model, ported from durandal.nvim generate.lua. One step per
// generator (a `+ New` step first, then the one it fills), each with the values you set and
// the last preview's fields. Pure.

export interface FormStep { generator: string; sets: Values; fields: Field[]; makes?: { target: FormStep; input: string } }

// NOTES: where a value came from (generate.lua `notes`); `you` has none.
export const NOTES: Record<Source, string | undefined> = {
  you: undefined, only: 'only one', path: 'from this file', here: 'from the cursor', default: 'default', new: 'new', suggested: 'suggested',
};
export const MAX_STEPS = 3;

const has = (o: object, k: string) => Object.prototype.hasOwnProperty.call(o, k);

export const short = (id: string) => id.replace(/^.*\//, '');
export const rowKey = (step: number, name: string) => `${step}:${name}`;

export function valueOf(st: FormStep, f: Field): string | null {
  return has(st.sets, f.name) ? st.sets[f.name] : f.value;
}

export type FormRow =
  | { kind: 'heading'; label: string }
  | { kind: 'field'; key: string; step: number; name: string; description: string; detail?: string; error: boolean };

// note is a field's line under its value: the server's why, else what it needs first, else
// where its value came from.
export function note(f: Field): { text?: string; error: boolean } {
  if (f.why) return { text: f.why, error: true };
  if (f.needs.length > 0) return { text: `set ${f.needs.join(', ')} first`, error: false };
  return { text: f.source ? NOTES[f.source] : undefined, error: false };
}

export function formRows(steps: FormStep[]): FormRow[] {
  const out: FormRow[] = [];
  steps.forEach((st, i) => {
    out.push({ kind: 'heading', label: st.makes ? `+ New ${short(st.generator)} (for ${st.makes.input})` : short(st.generator) });
    for (const f of st.fields) {
      const n = note(f);
      out.push({ kind: 'field', key: rowKey(i, f.name), step: i, name: f.name, description: valueOf(st, f) ?? `⟨${f.name}⟩`, detail: n.text, error: n.error });
    }
  });
  return out;
}

export interface Option { label: string; value?: string; generator?: string }

// A choice field lists its choices, or offers `+ New …` (generate.lua: `f.choices ~= nil or #f.new > 0`).
export const isChoice = (f: Field) => f.choices !== null || f.new.length > 0;

export function options(f: Field): Option[] {
  return [
    ...(f.choices ?? []).map(c => ({ label: c, value: c })),
    ...f.new.map(g => ({ label: `+ New ${short(g)}…`, generator: g })),
  ];
}

// firstMissing is generate.lua's first_missing: the first field of any step whose value is
// absent or that the server marked not valid.
export function firstMissing(steps: FormStep[]): { step: number; name: string } | undefined {
  for (let i = 0; i < steps.length; i++) {
    for (const f of steps[i].fields) {
      if (valueOf(steps[i], f) === null || f.valid === false) return { step: i, name: f.name };
    }
  }
  return undefined;
}

// stepsPayload is generate.lua's steps_payload: each step's generator and the values you set;
// with inferred, also what the last preview worked out (a value whose source is not you); a
// `+ New` step names the later step it fills by index.
export function stepsPayload(steps: FormStep[], inferred: boolean): Step[] {
  return steps.map(st => {
    const sets: Values = {};
    if (inferred) for (const f of st.fields) if (f.value !== null && f.source !== 'you') sets[f.name] = f.value;
    Object.assign(sets, st.sets);
    const out: Step = { generator: st.generator, sets };
    if (st.makes) {
      const j = steps.indexOf(st.makes.target);
      if (j >= 0) out.makes = { step: j, input: st.makes.input };
    }
    return out;
  });
}

// setValue sets name in step i (empty or undefined clears it, so the server falls back). A
// `+ New` step that made this input is dropped, and so is every step that made a dropped one.
export function setValue(steps: FormStep[], i: number, name: string, value: string | undefined): FormStep[] {
  const target = steps[i];
  if (value === undefined || value === '') delete target.sets[name];
  else target.sets[name] = value;
  const dropped = new Set(steps.filter(st => st.makes?.target === target && st.makes.input === name));
  for (let grew = true; grew;) {
    grew = false;
    for (const st of steps) {
      if (!dropped.has(st) && st.makes && dropped.has(st.makes.target)) {
        dropped.add(st);
        grew = true;
      }
    }
  }
  return steps.filter(st => !dropped.has(st));
}

// chooseNew is generate.lua's choose_new: a step for generator before step i, carrying the
// values of i's other fields, that fills i's input name. Undefined past three steps.
export function chooseNew(steps: FormStep[], i: number, name: string, generator: string): FormStep[] | undefined {
  const target = steps[i];
  const replacing = steps.some(s => s.makes?.target === target && s.makes.input === name);
  // refused before anything changes (nvim refuses at three steps)
  if (steps.length >= MAX_STEPS && !replacing) return undefined;
  // a + New already making this input is replaced (and the input cleared)
  const kept = setValue(steps, i, name, undefined);
  if (kept.length >= MAX_STEPS) return undefined;
  const carried: Values = {};
  for (const f of target.fields) {
    const v = valueOf(target, f);
    if (v !== null && f.name !== name) carried[f.name] = v;
  }
  const at = kept.indexOf(target);
  const fresh: FormStep = { generator, sets: carried, fields: [], makes: { target, input: name } };
  return [...kept.slice(0, at), fresh, ...kept.slice(at)];
}
