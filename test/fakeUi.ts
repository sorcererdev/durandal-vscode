import type { ReviewFile, ReviewModel } from '../src/generate/review';
import type { FormAnswer, FormModel, PickOptions, ReviewAnswer, TextOptions, TextView, Ui } from '../src/uiTypes';

// FakeUi answers the commands in a test (unit and e2e): pick and review call the handlers
// (default: nothing, as Escape); text and form record what was asked, for the test to answer.
export class FakeUi implements Ui {
  log: string[] = [];
  picks: PickOptions<unknown>[] = [];
  forms: { model: FormModel; answer(a: FormAnswer): void; closed: boolean }[] = [];
  texts: { title: string; value: string; onChange?(t: string): void; validation?: string; finish(v: string | undefined): void }[] = [];
  onPick: (o: PickOptions<unknown>) => unknown = () => undefined;
  onReview: (m: ReviewModel, o: { title: string; onActive(f: ReviewFile): void }) => ReviewAnswer | Promise<ReviewAnswer> = () => ({ kind: 'close' });
  stepsClosed = 0;

  info(m: string) { this.log.push(`info ${m}`); }
  warn(m: string) { this.log.push(`warn ${m}`); }
  error(m: string) { this.log.push(`error ${m}`); }

  async pick<T>(o: PickOptions<T>): Promise<T | undefined> {
    this.picks.push(o as PickOptions<unknown>);
    this.log.push(`pick ${o.title}`);
    return this.onPick(o as PickOptions<unknown>) as T | undefined;
  }

  text(o: TextOptions): TextView {
    let finish!: (v: string | undefined) => void;
    const result = new Promise<string | undefined>(r => { finish = r; });
    const entry = { title: o.title, value: o.value, onChange: o.onChange, validation: undefined as string | undefined, finish };
    this.texts.push(entry);
    this.log.push(`text ${o.title}`);
    return { setValidation: m => { entry.validation = m; }, result };
  }

  form(model: FormModel, answer: (a: FormAnswer) => void) {
    const call = { model, answer, closed: false };
    this.forms.push(call);
    return { update: (m: FormModel) => { call.model = m; }, close: () => { call.closed = true; } };
  }

  async review(m: ReviewModel, o: { title: string; onActive(f: ReviewFile): void }): Promise<ReviewAnswer> {
    this.log.push(`review ${o.title}`);
    return this.onReview(m, o);
  }

  closeSteps() {
    this.stepsClosed++;
    for (const t of this.texts) t.finish(undefined);
  }

  // openForm is the form that is up, if any
  get openForm() {
    const f = this.forms[this.forms.length - 1];
    return f && !f.closed ? f : undefined;
  }
}
