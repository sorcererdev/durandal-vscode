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

export interface ListButton { id: string; icon: string; tooltip: string }
export interface ListItem<T> { label: string; description?: string; detail?: string; value: T; buttons?: ListButton[] }
export interface ListOptions<T> { title: string; placeholder?: string; items: ListItem<T>[]; onActive?(value: T): void }
export type ListAnswer<T> = { kind: 'accept'; value: T } | { kind: 'button'; id: string; value: T } | { kind: 'hidden' };
export interface ListView<T> { update(items: ListItem<T>[]): void; close(): void }

export type ReviewAnswer = { kind: 'apply' } | { kind: 'close' } | { kind: 'jump'; path: string; line: number };

export interface Ui {
  info(m: string): void;
  warn(m: string): void;
  error(m: string): void;
  // ask: a notice with buttons; the one chosen, or undefined when it is dismissed
  ask(level: 'info' | 'warn' | 'error', text: string, actions: string[]): Promise<string | undefined>;
  pick<T>(o: PickOptions<T>): Promise<T | undefined>;
  text(o: TextOptions): TextView;
  form(m: FormModel, answer: (a: FormAnswer) => void): FormView;
  // list: a list that stays up and is updated in place (the survivors picker): Enter and the
  // item buttons answer without closing it; a hide nobody asked for answers hidden; close() hides
  // it without an answer
  list<T>(o: ListOptions<T>, answer: (a: ListAnswer<T>) => void): ListView<T>;
  review(m: ReviewModel, o: { title: string; onActive(f: ReviewFile): void }): Promise<ReviewAnswer>;
  // closeSteps hides the pick, text or review that is up (each answers its "nothing")
  closeSteps(): void;
}
