import { CLIENT_COMMANDS } from './protocol';

// The commands, contributed with these titles. The form keys' commands (spec §9) are enabled
// only while the generate form is open; the suggestion's only while one is shown (M3 spec §4).
export const BUILT: Record<string, { title: string; enablement?: string }> = {
  'durandal.generate': { title: 'Generate…' },
  'durandal.actions': { title: 'Actions Here' },
  'durandal.hints.toggle': { title: 'Toggle ⚡ Hints' },
  'durandal.migration': { title: 'Migration Report' },
  'durandal.test.here': { title: 'Run the Test Here' },
  'durandal.test.file': { title: "Run This File's Tests" },
  'durandal.test.all': { title: 'Run All Tests' },
  'durandal.stub': { title: 'Stub a Test' },
  'durandal.conjure': { title: 'Conjure' },
  'durandal.plan.review': { title: 'Plan: Review' },
  'durandal.plan.ask': { title: 'Plan: Ask' },
  'durandal.plan.validate': { title: 'Plan: Validate' },
  'durandal.plan.do': { title: 'Plan: Do' },
  'durandal.plan.cancel': { title: 'Plan: Cancel' },
  'durandal.plan.accept': { title: 'Plan: Accept Ghost' },
  'durandal.plan.reject': { title: 'Plan: Reject Ghost' },
  'durandal.plan.reconcile': { title: 'Plan: Reconcile' },
  'durandal.plan.errand': { title: 'Plan: Open Past Do' },
  'durandal.plan.newStep': { title: 'Plan: New Step' },
  'durandal.plan.excerpt': { title: 'Plan: Excerpt' },
  'durandal.plan.toggle': { title: 'Plan: Toggle Step' },
  'durandal.plan.files': { title: 'Plan: Files' },
  'durandal.plan.stub': { title: 'Plan: Stub' },
  'durandal.plan.test': { title: 'Plan: Test' },
  'durandal.mutate': { title: 'Mutate' },
  'durandal.jump': { title: 'Jump to Test or Module' },
  'durandal.ghosts.toggle': { title: 'Toggle Ghost Text' },
  'durandal.suggest.dismiss': { title: 'Dismiss Suggestion', enablement: 'durandal.ghostVisible' },
  'durandal.suggest.accept': { title: 'Accept Suggestion', enablement: 'durandal.ghostVisible' },
  'durandal.generate.apply': { title: 'Generate: Apply', enablement: 'durandal.formOpen' },
  'durandal.generate.review': { title: 'Generate: Review Plan', enablement: 'durandal.formOpen' },
};

// The keys inside the generate form (a quick input): apply, and review the plan.
export const FORM_KEYS: { command: string; key: string; mac: string; when: string }[] = [
  { command: 'durandal.generate.apply', key: 'ctrl+enter', mac: 'cmd+enter', when: 'durandal.formOpen && inQuickOpen' },
  { command: 'durandal.generate.review', key: 'ctrl+o', mac: 'ctrl+o', when: 'durandal.formOpen && inQuickOpen' },
];

// The keys of a suggestion (M3 spec §4): Esc dismisses the snippet ghost while VS Code shows
// it and it is Durandal's (VS Code's own Esc hides it; ours also remembers the line), and a
// decoration (⚡ at the line's end) wherever Esc means nothing else. Tab on the snippet ghost
// is VS Code's own (editor.action.inlineSuggest.commit).
export const SUGGEST_KEYS: { command: string; key: string; when: string }[] = [
  { command: 'durandal.suggest.accept', key: 'tab', when: "durandal.ghostVisible && durandal.ghostKind != 'snippet' && durandal.ghostBand != 'hint' && editorTextFocus && !inlineSuggestionVisible && !suggestWidgetVisible && !inSnippetMode && !editorReadonly" },
  { command: 'durandal.suggest.dismiss', key: 'escape', when: "inlineSuggestionVisible && durandal.ghostVisible && durandal.ghostKind == 'snippet'" },
  { command: 'durandal.suggest.dismiss', key: 'escape', when: "durandal.ghostVisible && durandal.ghostKind != 'snippet' && durandal.ghostBand != 'hint' && editorTextFocus && !inlineSuggestionVisible && !suggestWidgetVisible && !editorHasSelection && !editorHasMultipleSelections && !findWidgetVisible && !parameterHintsVisible && !inSnippetMode && !renameInputVisible" },
];

// Commands the server names in its inlay hints (⚡) and code lenses: registered so a click
// never fails with "command not found", not contributed (they need the server's arguments).
// Keyed by protocol.ts CLIENT_COMMANDS' values, so a command added there must be given a
// title and milestone here (the Record type fails to compile otherwise).
// showActions is built (actions/command.ts), planReview (pause/review.ts), planExcerpt and
// planErrand (plans/lenses.ts): none is left for a later milestone.
const SERVER_NAMED_INFO: Record<Exclude<keyof typeof CLIENT_COMMANDS, 'showActions' | 'planReview' | 'planExcerpt' | 'planErrand'>, { title: string; milestone: number }> = {};

export const SERVER_NAMED: Record<string, { title: string; milestone: number }> = Object.fromEntries(
  (Object.keys(SERVER_NAMED_INFO) as (keyof typeof SERVER_NAMED_INFO)[]).map(k => [CLIENT_COMMANDS[k], SERVER_NAMED_INFO[k]]),
);

export const notYet = (title: string, milestone: number) => `Durandal: ${title} is not implemented yet (milestone ${milestone})`;

// The chord prefix, then durandal.nvim's letters (spec §4).
export const PREFIX = { key: 'ctrl+alt+d', mac: 'ctrl+alt+d' } as const;

// TDD_WHEN: the test and stub chords also work from the results document (durandal-doc: t and
// shift+t run the last run again) and the untitled test file the jump opens (s stubs there).
export const TDD_WHEN = 'durandal.inProject || resourceScheme == durandal-doc || resourceScheme == untitled';

// TDD_HERE_WHEN: t and s outside a plan; in a plan they are the plan step's (as durandal.nvim's
// buffer-local keys are)
export const TDD_HERE_WHEN = `(${TDD_WHEN}) && !durandal.isPlan`;

export const KEYS: { command: string; keys: string; when: string }[] = [
  { command: 'durandal.actions', keys: 'a', when: 'durandal.inProject' },
  { command: 'durandal.generate', keys: 'g', when: 'durandal.inProject' },
  { command: 'durandal.test.here', keys: 't', when: TDD_HERE_WHEN },
  { command: 'durandal.test.file', keys: 'shift+t', when: TDD_WHEN },
  { command: 'durandal.jump', keys: 'j', when: 'durandal.inProject' },
  { command: 'durandal.stub', keys: 's', when: TDD_HERE_WHEN },
  { command: 'durandal.conjure', keys: 'c', when: 'durandal.inProject' },
  { command: 'durandal.mutate', keys: 'm', when: 'durandal.inProject' },
  { command: 'durandal.plan.ask', keys: 'p q', when: 'durandal.isPlan' },
  { command: 'durandal.plan.validate', keys: 'p v', when: 'durandal.isPlan' },
  { command: 'durandal.plan.do', keys: 'p d', when: 'durandal.isPlan' },
  { command: 'durandal.plan.accept', keys: 'p y', when: 'durandal.isPlan' },
  { command: 'durandal.plan.reject', keys: 'p n', when: 'durandal.isPlan' },
  { command: 'durandal.plan.files', keys: 'p f', when: 'durandal.isPlan' },
  { command: 'durandal.plan.reconcile', keys: 'p c', when: 'durandal.isPlan' },
  { command: 'durandal.plan.errand', keys: 'p o', when: 'durandal.isPlan' },
  { command: 'durandal.plan.excerpt', keys: 'p e', when: 'durandal.isPlan' },
  { command: 'durandal.plan.review', keys: 'p r', when: 'durandal.isPlan' },
  { command: 'durandal.plan.toggle', keys: 'p x', when: 'durandal.isPlan' },
  { command: 'durandal.plan.newStep', keys: 'p enter', when: 'durandal.isPlan' },
  { command: 'durandal.plan.stub', keys: 'p s', when: 'durandal.isPlan' },
  { command: 'durandal.plan.test', keys: 'p t', when: 'durandal.isPlan' },
  { command: 'durandal.plan.stub', keys: 's', when: 'durandal.isPlan' },
  { command: 'durandal.plan.test', keys: 't', when: 'durandal.isPlan' },
];
