import * as vscode from 'vscode';
import type { ReviewFile, ReviewModel } from './generate/review';
import type { Say } from './server';
import type { FormAnswer, FormModel, Item, PickOptions, ReviewAnswer, TextOptions, TextView, Ui } from './uiTypes';

// quickInput: the Ui on VS Code's quick inputs (alder-vscode ui.ts). Every step keeps
// ignoreFocusOut, so the preview and the review's diffs can update beside it. A hide nobody
// asked for (Escape) is the step's "nothing". Messages go through say (the e2e tests read it).

const mod = process.platform === 'darwin' ? 'Cmd' : 'Ctrl';
const reviewButton: vscode.QuickInputButton = { iconPath: new vscode.ThemeIcon('diff'), tooltip: 'Review the plan (Ctrl+O)' };
const applyButton: vscode.QuickInputButton = { iconPath: new vscode.ThemeIcon('check'), tooltip: `Apply (${mod}+Enter)` };
const SEP = vscode.QuickPickItemKind.Separator;

const setFormOpen = (on: boolean) => void vscode.commands.executeCommand('setContext', 'durandal.formOpen', on);

// once shows a quick input until wire's done answers it or it hides (none); either way, once.
function once<T>(q: vscode.QuickInput, wire: (done: (v: T) => void) => void, none: T): Promise<T> {
  return new Promise<T>(resolve => {
    let finished = false;
    const done = (v: T) => {
      if (finished) return;
      finished = true;
      q.dispose();
      resolve(v);
    };
    wire(done);
    q.onDidHide(() => done(none));
    q.show();
  });
}

interface FieldItem extends vscode.QuickPickItem { step?: number; name?: string; apply?: boolean }
interface ReviewItem extends vscode.QuickPickItem { file?: ReviewFile; jump?: { path: string; line: number }; apply?: boolean }

export function quickInputUi(say: Say): Ui {
  // steps: the quick inputs up besides the form, so closeSteps can hide them
  const steps = new Set<vscode.QuickInput>();
  const step = <Q extends vscode.QuickInput>(q: Q): Q => {
    steps.add(q);
    q.onDidHide(() => steps.delete(q));
    return q;
  };
  return {
    info: m => void say('info', m),
    warn: m => void say('warn', m),
    error: m => void say('error', m),
    ask: (level, text, actions) => Promise.resolve(say(level, text, ...actions)),

    pick<T>(o: PickOptions<T>): Promise<T | undefined> {
      type I = vscode.QuickPickItem & { value?: T };
      const qp = step(vscode.window.createQuickPick<I>());
      qp.title = o.title;
      qp.placeholder = o.placeholder;
      qp.ignoreFocusOut = true;
      qp.matchOnDescription = true;
      // with a query the caller ranks and filters: every item shown, in its order
      const items = (xs: Item<T>[]): I[] => xs.map(x => (x.separator
        ? { label: x.label, kind: SEP }
        : { label: x.label, description: x.description, detail: x.detail, value: x.value, alwaysShow: !!o.query }));
      qp.items = items(o.items);
      const a = qp.items.find(i => i.kind !== SEP && i.label === o.active);
      if (a) qp.activeItems = [a];
      if (o.query) qp.onDidChangeValue(t => { qp.items = items(o.query!(t)); });
      return once<T | undefined>(qp, done => qp.onDidAccept(() => {
        const v = qp.activeItems[0]?.value;
        if (v !== undefined) done(v);
      }), undefined);
    },

    text(o: TextOptions): TextView {
      const ib = step(vscode.window.createInputBox());
      ib.title = o.title;
      ib.value = o.value;
      ib.prompt = o.prompt;
      ib.ignoreFocusOut = true;
      ib.onDidChangeValue(t => o.onChange?.(t));
      const result = once<string | undefined>(ib, done => ib.onDidAccept(() => done(ib.value)), undefined);
      return { setValidation: m => { ib.validationMessage = m; }, result };
    },

    form(m: FormModel, answer: (a: FormAnswer) => void) {
      const qp = vscode.window.createQuickPick<FieldItem>();
      qp.ignoreFocusOut = true;
      qp.matchOnDescription = true;
      let closing = false;
      let lastActive: string | undefined;
      const key = (i: FieldItem) => (i.apply ? '\0apply' : i.name !== undefined ? `${i.step}:${i.name}` : undefined);
      const paint = (model: FormModel) => {
        const keep = qp.activeItems[0];
        // a new active field (the first of a + New step) wins; else the item you are on stays
        const want = model.active !== lastActive ? model.active : ((keep && key(keep)) ?? model.active);
        lastActive = model.active;
        qp.title = model.title;
        qp.busy = model.updating;
        qp.buttons = [vscode.QuickInputButtons.Back, reviewButton, ...(model.ready ? [applyButton] : [])];
        const items: FieldItem[] = [];
        if (model.error) items.push({ label: `$(error) ${model.error}`, alwaysShow: true });
        for (const r of model.rows) {
          if (r.kind === 'heading') items.push({ label: r.label, kind: SEP });
          else items.push({ label: r.name, description: r.description, detail: r.detail === undefined ? undefined : r.error ? `$(error) ${r.detail}` : r.detail, step: r.step, name: r.name });
        }
        items.push({ label: '$(check) Apply', description: model.ready ? '' : 'not ready', apply: true, alwaysShow: true });
        qp.items = items;
        const a = items.find(i => want !== undefined && key(i) === want);
        if (a) qp.activeItems = [a];
      };
      paint(m);
      qp.onDidAccept(() => {
        const item = qp.activeItems[0];
        if (!item) return;
        if (item.apply) answer({ kind: 'apply' });
        else if (item.name !== undefined) answer({ kind: 'field', step: item.step!, name: item.name });
      });
      qp.onDidTriggerButton(b => {
        if (b === vscode.QuickInputButtons.Back) answer({ kind: 'back' });
        else if (b === reviewButton) answer({ kind: 'review' });
        else if (b === applyButton) answer({ kind: 'apply' });
      });
      qp.onDidHide(() => {
        // a hide after close() is the flow's own: close() cleared the key already
        if (closing) return;
        closing = true;
        setFormOpen(false);
        qp.dispose();
        answer({ kind: 'escape' });
      });
      qp.show();
      setFormOpen(true);
      return {
        update: paint,
        close: () => {
          if (closing) return;
          closing = true;
          setFormOpen(false);
          qp.dispose();
        },
      };
    },

    review(m: ReviewModel, o: { title: string; onActive(f: ReviewFile): void }): Promise<ReviewAnswer> {
      const qp = step(vscode.window.createQuickPick<ReviewItem>());
      qp.title = `${o.title}: review`;
      qp.placeholder = m.canApply ? 'Enter applies · Escape closes' : 'cannot apply: a conflict (✗) · Escape closes';
      qp.ignoreFocusOut = true;
      const applyNow: vscode.QuickInputButton = { iconPath: new vscode.ThemeIcon('check'), tooltip: 'Apply' };
      qp.buttons = m.canApply ? [applyNow] : [];
      qp.items = [
        ...(m.notes.length > 0 ? [{ label: 'notes', kind: SEP }, ...m.notes.map(n => ({ label: n.text, jump: n.jump }))] : []),
        { label: 'files', kind: SEP },
        ...m.files.map(f => ({ label: `${f.mark} ${f.path}`, file: f })),
        ...(m.canApply ? [{ label: '$(check) Apply', apply: true, alwaysShow: true }] : []),
      ];
      const first = qp.items.find(i => i.file);
      if (first) {
        qp.activeItems = [first];
        o.onActive(first.file!);
      }
      qp.onDidChangeActive(items => { if (items[0]?.file) o.onActive(items[0].file); });
      return once<ReviewAnswer>(qp, done => {
        qp.onDidAccept(() => {
          const i = qp.activeItems[0];
          if (!i) return;
          if (i.jump) done({ kind: 'jump', ...i.jump });
          else if ((i.file || i.apply) && m.canApply) done({ kind: 'apply' });
        });
        qp.onDidTriggerButton(() => done({ kind: 'apply' }));
      }, { kind: 'close' });
    },

    closeSteps() {
      // each hide answers its step's "nothing"; a copy, as each hide deletes itself
      for (const q of [...steps]) q.hide();
    },
  };
}
