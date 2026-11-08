import { CLIENT_COMMANDS } from './protocol';

// The commands later milestones build (spec §6); until then each says so when run.
export const NOT_YET: Record<string, { title: string; milestone: number }> = {
  'durandal.stub': { title: 'Stub a Test', milestone: 4 },
  'durandal.conjure': { title: 'Conjure', milestone: 4 },
  'durandal.mutate': { title: 'Mutate', milestone: 4 },
  'durandal.plan.ask': { title: 'Plan: Ask', milestone: 6 },
  'durandal.plan.validate': { title: 'Plan: Validate', milestone: 6 },
  'durandal.plan.do': { title: 'Plan: Do', milestone: 6 },
  'durandal.plan.accept': { title: 'Plan: Accept', milestone: 6 },
  'durandal.plan.reject': { title: 'Plan: Reject', milestone: 6 },
  'durandal.plan.files': { title: 'Plan: Files', milestone: 6 },
  'durandal.plan.reconcile': { title: 'Plan: Reconcile', milestone: 6 },
  'durandal.plan.excerpt': { title: 'Plan: Excerpt', milestone: 6 },
  'durandal.plan.review': { title: 'Plan: Review', milestone: 5 },
  'durandal.plan.toggle': { title: 'Plan: Toggle Reading', milestone: 6 },
};

// The commands built so far, contributed with these titles (spec §6's rest is NOT_YET). The
// form keys' commands (spec §9) are enabled only while the generate form is open; the
// suggestion's only while one is shown (M3 spec §4).
export const BUILT: Record<string, { title: string; enablement?: string }> = {
  'durandal.generate': { title: 'Generate…' },
  'durandal.actions': { title: 'Actions Here' },
  'durandal.hints.toggle': { title: 'Toggle ⚡ Hints' },
  'durandal.migration': { title: 'Migration Report' },
  'durandal.test.here': { title: 'Run the Test Here' },
  'durandal.test.file': { title: "Run This File's Tests" },
  'durandal.test.all': { title: 'Run All Tests' },
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
// showActions is built (actions/command.ts); the rest are later milestones'.
const SERVER_NAMED_INFO: Record<Exclude<keyof typeof CLIENT_COMMANDS, 'showActions'>, { title: string; milestone: number }> = {
  planReview: { title: 'Plan Review', milestone: 5 },
  planExcerpt: { title: 'Plan Excerpt', milestone: 6 },
  planErrand: { title: 'Plan Delegations', milestone: 6 },
};

export const SERVER_NAMED: Record<string, { title: string; milestone: number }> = Object.fromEntries(
  (Object.keys(SERVER_NAMED_INFO) as (keyof typeof SERVER_NAMED_INFO)[]).map(k => [CLIENT_COMMANDS[k], SERVER_NAMED_INFO[k]]),
);

export const notYet = (title: string) => `Durandal: ${title} is not implemented yet`;

// The chord prefix, then durandal.nvim's letters (spec §4).
export const PREFIX = { key: 'ctrl+alt+d', mac: 'cmd+alt+d' } as const;

export const KEYS: { command: string; keys: string; when: string }[] = [
  { command: 'durandal.actions', keys: 'a', when: 'durandal.inProject' },
  { command: 'durandal.generate', keys: 'g', when: 'durandal.inProject' },
  { command: 'durandal.test.here', keys: 't', when: 'durandal.inProject' },
  { command: 'durandal.test.file', keys: 'shift+t', when: 'durandal.inProject' },
  { command: 'durandal.jump', keys: 'j', when: 'durandal.inProject' },
  { command: 'durandal.stub', keys: 's', when: 'durandal.inProject' },
  { command: 'durandal.conjure', keys: 'c', when: 'durandal.inProject' },
  { command: 'durandal.mutate', keys: 'm', when: 'durandal.inProject' },
  { command: 'durandal.plan.ask', keys: 'p q', when: 'durandal.isPlan' },
  { command: 'durandal.plan.validate', keys: 'p v', when: 'durandal.isPlan' },
  { command: 'durandal.plan.do', keys: 'p d', when: 'durandal.isPlan' },
  { command: 'durandal.plan.accept', keys: 'p y', when: 'durandal.isPlan' },
  { command: 'durandal.plan.reject', keys: 'p n', when: 'durandal.isPlan' },
  { command: 'durandal.plan.files', keys: 'p f', when: 'durandal.isPlan' },
  { command: 'durandal.plan.reconcile', keys: 'p c', when: 'durandal.isPlan' },
  { command: 'durandal.plan.excerpt', keys: 'p e', when: 'durandal.isPlan' },
  { command: 'durandal.plan.review', keys: 'p r', when: 'durandal.isPlan' },
  { command: 'durandal.plan.toggle', keys: 'p x', when: 'durandal.isPlan' },
];
