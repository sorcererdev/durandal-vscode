import type { FormRow } from './generate/form';
import type { ReviewFile, ReviewModel } from './generate/review';

// uiTypes: what the commands ask of the screen. src/quickInput.ts is VS Code's; test/fakeUi.ts
// answers in the tests. A step that is hidden (Escape) answers its "nothing".

export interface Item<T> { label: string; description?: string; detail?: string; separator?: boolean; value?: T }

export interface PickOptions<T> {
  title: string;
  placeholder?: string;
  items: Item<T>[];
  // active: the label of the item to start on
  active?: string;
  // query: the items for what is typed, ranked by the caller (VS Code's filter is bypassed)
  query?(text: string): Item<T>[];
}

export interface TextOptions { title: string; value: string; prompt?: string; onChange?(text: string): void }
export interface TextView { setValidation(message: string | undefined): void; result: Promise<string | undefined> }

export interface FormModel { title: string; rows: FormRow[]; ready: boolean; updating: boolean; error?: string; active?: string }
export type FormAnswer =
  | { kind: 'field'; step: number; name: string }
  | { kind: 'apply' }
  | { kind: 'review' }
  | { kind: 'back' }
  | { kind: 'escape' };
export interface FormView { update(m: FormModel): void; close(): void }

export type ReviewAnswer = { kind: 'apply' } | { kind: 'close' } | { kind: 'jump'; path: string; line: number };

export interface Ui {
  info(m: string): void;
  warn(m: string): void;
  error(m: string): void;
  // ask: a notice with buttons (a paused conjure's Continue / Stop); the one chosen, or
  // undefined when it is dismissed
  ask(level: 'info' | 'warn' | 'error', text: string, actions: string[]): Promise<string | undefined>;
  pick<T>(o: PickOptions<T>): Promise<T | undefined>;
  text(o: TextOptions): TextView;
  form(m: FormModel, answer: (a: FormAnswer) => void): FormView;
  review(m: ReviewModel, o: { title: string; onActive(f: ReviewFile): void }): Promise<ReviewAnswer>;
  // closeSteps hides the pick, text or review that is up (each answers its "nothing")
  closeSteps(): void;
}
