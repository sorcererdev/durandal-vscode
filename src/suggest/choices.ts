import { errorMessage } from '../errors';
import type { ChoicesInput, ChoicesResult, Sets } from '../protocol';
import type { Ui } from '../uiTypes';
import { short } from './keys';

// choices: a recognition's choose flow (durandal.nvim picker.lua next_input, kind, complete
// :12-24, :92-121): ask each missing input, olifant/choices narrowing after each answer. Pure
// over Ui and the request.

const given = <T>(v: T | null | undefined): v is T => v !== null && v !== undefined;

export function nextInput(inputs: ChoicesInput[], sets: Sets): ChoicesInput | undefined {
  return inputs.find(i => !i.optional && !given(i.default) && sets[i.name] === undefined);
}

export const kind = (input: ChoicesInput): 'menu' | 'text' => (given(input.choices) ? 'menu' : 'text');

export interface ChooseDeps { choices(generator: string, sets: Sets): Promise<ChoicesResult>; ui: Ui }

// complete: the sets with every required input answered, or undefined (Escape, an input with
// no choices, the server's refusal: the last two said as the server put them).
export async function complete(d: ChooseDeps, generator: string, sets: Sets): Promise<Sets | undefined> {
  let cur: Sets = { ...sets };
  for (;;) {
    let shown: ChoicesResult;
    try {
      shown = await d.choices(generator, cur);
    } catch (err) {
      d.ui.error(errorMessage(err));
      return undefined;
    }
    const input = nextInput(shown.inputs ?? [], cur);
    if (!input) return cur;
    const title = input.name + (input.prompt ? `: ${input.prompt}` : '');
    let v: string | undefined;
    if (kind(input) === 'menu') {
      const cs = input.choices ?? [];
      if (cs.length === 0) {
        const errs = input.errors ? (Array.isArray(input.errors) ? input.errors : Object.values(input.errors)) : [];
        d.ui.error([`no choices for ${input.name}`, ...errs].join('\n'));
        return undefined;
      }
      v = await d.ui.pick<string>({ title, items: cs.map(c => ({ label: c, value: c })) });
    } else {
      v = await d.ui.text({ title, value: '' }).result;
    }
    if (!v) return undefined;
    cur = { ...cur, [input.name]: v };
  }
}

// chooseGenerator: two conventions fit; which is it (nvim :428-429)
export function chooseGenerator(ui: Ui, generator: string, or: string): Promise<string | undefined> {
  return ui.pick<string>({ title: 'Which is it?', items: [{ label: short(generator), value: generator }, { label: short(or), value: or }] });
}
