// The olifant/* wire contract: every custom method olifant lsp answers or sends, and the
// commands it names. References: the olifant book, user/16-the-language-server.md (the table
// "What it answers"), user/18-tdd-in-the-editor.md, user/19-plans.md, internals/03-plans.md;
// the truth is src/Olifant/Lsp.hs. No other file spells a method string. A milestone that
// consumes a result tightens its type here.
import {
  NotificationType, Position, Range, RequestType, TextDocumentIdentifier, WorkspaceEdit,
} from 'vscode-languageserver-protocol';

export interface Doc { textDocument: TextDocumentIdentifier }
export interface At extends Doc { position: Position }
// Row: a 0-based line of a plan file.
export interface Row extends Doc { line: number }
export type Sets = Record<string, unknown>;
// Survivor: a mutate's surviving mutant (line 1-based), as olifant/mutate lists it.
export interface Survivor { line: number; operator: string; from: string; to: string; mutated: string }
type Open = Record<string, unknown>;

// --- generate and actions (milestone 2)
export type Values = Record<string, string>;
// olifant/generators lists each generator's full showJson plus `here`; the client reads these.
// (`pack` is not in the detailed list.)
export interface GeneratorsParams extends Doc { position?: Position }
export interface GeneratorItem extends Open { id: string; name: string; kind?: string; summary?: string; here?: boolean }
export interface GeneratorsResult extends Open { generators: GeneratorItem[] }
export interface ChoicesParams extends Doc { generator: string; sets: Sets }
// one input as olifant/choices lists it (Output.hs): choices flat when known.
export interface ChoicesInput extends Open { name: string; type?: string; optional?: boolean; default?: string | null; prompt?: string | null; choices?: string[] | null; errors?: Record<string, string> | string[] | null }
export interface ChoicesResult extends Open { name?: string; inputs: ChoicesInput[] }

// olifant/preview: the form's fields for every step, the files it would write, the main one's text.
export type Source = 'you' | 'path' | 'here' | 'only' | 'default' | 'new' | 'suggested';
export interface Field {
  name: string; value: string | null; source: Source | null; valid: boolean; why: string | null;
  choices: string[] | null; needs: string[]; new: string[];
}
// Step: a generator of the form, with the values you set; a `+ New` step comes first and
// `makes` names the later step (0-based) whose input it fills.
export interface Step { generator: string; sets: Values; makes?: { step: number; input: string } }
export interface PreviewParams extends At { steps: Step[] }
export interface PreviewFile { path: string; new: boolean; added: number; removed: number }
// main: the first new file, else the first changed one; first: its first differing line (1-based)
export interface PreviewMain { path: string; text: string; first: number }
export interface PreviewResult {
  steps: { generator: string; fields: Field[] }[]; files: PreviewFile[]; main: PreviewMain | null; ready: boolean; error: string | null;
}

// olifant/plan (and codeAction/resolve's data.plan): files relative to the project root.
export interface PlanFile { path: string; before: string | null; after: string }
export interface Hole extends Open { name: string; status: string; model?: string | null; why?: string | null; fill?: string | null; file?: string; line?: number }
// snippet: line is 1-based; its text is replaced by body (TextMate-style tab stops)
export interface PlanSnippet { file: string; line: number; body: string; ghost?: unknown }
export interface Conflict { code: string; message: string }
export interface Plan extends Open {
  generator?: string; files?: PlanFile[]; conflicts: Conflict[]; warnings: string[]; holes: Hole[]; snippet: PlanSnippet | null;
}
// olifant/plan: the generate picker's steps, a follow-up's planId, or a recognition's sets.
export type PlanParams =
  | (At & { steps: Step[] })
  | { planId: number; fill?: boolean }
  | (Doc & { generator: string; sets: Sets; recognize: true });
export interface PlanResult extends Open { plan: Plan; edit?: WorkspaceEdit }

// olifant/fileActions: lines and columns 1-based; range null for a whole-file action.
export interface FileAction extends Open {
  generator: string; name: string; label: string; range: { start: [number, number]; end: [number, number] } | null;
  sets: Sets; missing: string[]; snippet: boolean; trigger?: boolean;
}
export interface Nearby extends Open { generator: string; name?: string; label?: string; why: string }
export interface FileActionsResult extends Open { actions: FileAction[]; nearby: Nearby[] }

// olifant/model's migration (present only while the project migrates).
export interface Migration extends Open { line: string; switches: { name: string; on: boolean }[]; added_legacy: string[]; unregistered: string[] }
export interface ModelResult extends Open { migration?: Migration }

// A code action's data (textDocument/codeAction): a generator's action or a rule's fix; what
// codeAction/resolve adds is the plan.
export interface ActionData extends Open {
  kind?: string; generator?: string; rule?: string; sets?: Values; missing?: string[];
  choices?: Record<string, string[]>; snippet?: boolean; plan?: Plan;
}

// --- ghosts and follow-ups (milestone 3)
// textDocument/inlineCompletion's item as olifant sends it (Lsp.hs ghostItems): the snippet's
// body over the cursor's whole line and, beyond LSP, the ghost (holes as ⟨name⟩) and the
// action completionItem/resolve fills (data, as a completion item's).
export interface SnippetData extends Open { kind: 'action'; path: string; generator: string; sets: Sets; line: number }
export interface InlineItem { insertText: string | { kind: 'snippet'; value: string }; range: Range; filterText?: string; ghost?: unknown; data?: unknown }
// olifant/suggestion (pushed) and olifant/suggest (pulled, with its plan and edit): Lsp.hs suggestionFields; at and line are 1-based; band, or, reasons and score only on a recognition.
export type SuggestionKind = 'ghost' | 'followup' | 'recognition' | 'snippet';
export interface Suggestion extends Open {
  uri: string; version: number; kind: SuggestionKind; label: string; summary: string;
  line: number | null; lines: string[] | null; at: number | null; planId: number;
  generator: string | null; sets: Sets;
  band?: 'offer' | 'hint'; or?: string | null; reasons?: string[]; score?: number;
}
export interface SuggestResult extends Suggestion { plan: Plan; edit?: WorkspaceEdit }
export interface SuggestParams extends Doc { line: number }
export interface RecognitionFeedbackParams extends Doc { generator: string; outcome: string }

// --- the TDD loop (milestone 4): Lsp.hs :608-944, Server/Tests.hs :199-209. Lines 1-based;
// a selection's start and end 0-based inclusive (the server adds 1).
export type TestScope = 'test' | 'file' | 'all';
export interface TestsRunParams extends Doc { scope?: 'file' | 'all'; position?: Position }
// line: the failing assertion's (null when the runner names none); file: absolute
export interface TestFailure { id: string; file: string; line: number | null; message: string; output: string }
export interface TestsRunResult {
  file: string; passed: string[]; scope: TestScope; test: string | null; failed: TestFailure[]; broken: string | null; seconds: number;
}
export interface TestsFileResult { file: string; kind: 'test' | 'module'; exists: boolean }
export interface StubParams extends At { survivor?: Survivor }
export interface StubResult { file: string; line: number; name: string; edits: WorkspaceEdit }
export interface ConjureResume { token: string; choice: string; arg?: unknown; land?: boolean; hint?: string }
export interface ConjureParams extends At { selection?: { start: number; end: number }; resume?: ConjureResume }
// landed: edits null when nothing changed; tests the after-run (scope "file")
export interface ConjureLanded extends Open {
  file: string; unit: string; edits: WorkspaceEdit | null; summary: string; green: boolean;
  tests: TestsRunResult; rounds: number; rungs: string[]; stopped?: boolean;
}
// paused: only what M4's warning reads; the full shape is M5's
export interface ConjurePaused { paused: Open & { token: string; diagnosis: string } }
export type ConjureResult = ConjureLanded | ConjurePaused;
export interface MutateSurvivor extends Survivor { dim: boolean }
export interface MutateResult {
  file: string; unit: string; lines: { first: number; last: number }; killed: number; survived: number; waived: number;
  survivors: MutateSurvivor[]; summary: string;
}
export interface WaiveParams extends Doc { survivor: Survivor; reason: string }
export interface WaiveResult { waived: true }

// --- plans (milestones 5 and 6)
export interface ErrandParams extends Row { resume?: unknown; text?: string }
export interface ErrandResult extends Open { id?: string; facts?: unknown; blocks?: unknown[]; review?: string }
export interface ReconcileParams extends Doc { forced: boolean }
export interface AnchorResult extends Open { file?: string; line?: number; unit?: string; fingerprint?: string }
export interface StepResult extends Open { edits?: WorkspaceEdit; facts?: unknown; name?: string; passed?: number; failed?: number; seconds?: number }
export type ErrandOneParams = Doc & ({ id: string } | { row: number });
export interface ErrandsParams extends Doc { row: number }
export interface ReviewParams extends Doc { id: string }
export interface ReviewChooseParams extends Doc { id: string; choice: string; [more: string]: unknown }
export interface ReviewReady { id: string; kind: string; textDocument: TextDocumentIdentifier }
export interface OutcomeParams extends Doc { id: string; block: number; outcome: 'accepted' | 'rejected' }

// --- tests of the server itself (initializationOptions.debug)
export interface DebugState extends Open { documents: unknown[]; projects: Record<string, number>; broken?: Record<string, string> }

const req = <P, R>(method: string) => new RequestType<P, R, void>(method);
const note = <P>(method: string) => new NotificationType<P>(method);

export const Olifant = {
  generators: req<GeneratorsParams, GeneratorsResult>('olifant/generators'),
  choices: req<ChoicesParams, ChoicesResult>('olifant/choices'),
  preview: req<PreviewParams, PreviewResult>('olifant/preview'),
  plan: req<PlanParams, PlanResult>('olifant/plan'),
  fileActions: req<Doc, FileActionsResult>('olifant/fileActions'),
  holes: req<Doc, unknown>('olifant/holes'),
  model: req<Doc, ModelResult | null>('olifant/model'),
  suggest: req<SuggestParams, SuggestResult | null>('olifant/suggest'),
  stub: req<StubParams, StubResult>('olifant/stub'),
  conjure: req<ConjureParams, ConjureResult>('olifant/conjure'),
  mutate: req<At, MutateResult>('olifant/mutate'),
  waive: req<WaiveParams, WaiveResult>('olifant/waive'),
  testsRun: req<TestsRunParams, TestsRunResult>('olifant/tests/run'),
  testsFile: req<Doc, TestsFileResult>('olifant/tests/file'),
  debugState: req<Record<string, never>, DebugState>('olifant/debugState'),
  plansAsk: req<ErrandParams, ErrandResult>('olifant/plans/ask'),
  plansValidate: req<ErrandParams, ErrandResult>('olifant/plans/validate'),
  plansDo: req<ErrandParams, ErrandResult>('olifant/plans/do'),
  plansReconcile: req<ReconcileParams, Open>('olifant/plans/reconcile'),
  plansAnchor: req<Row, AnchorResult | null>('olifant/plans/anchor'),
  plansFiles: req<Doc, Open>('olifant/plans/files'),
  plansStub: req<Row, StepResult>('olifant/plans/stub'),
  plansTest: req<Row, StepResult>('olifant/plans/test'),
  plansErrand: req<ErrandOneParams, Open>('olifant/plans/errand'),
  plansErrands: req<ErrandsParams, { errands: unknown[] }>('olifant/plans/errands'),
  plansReviews: req<Doc, { reviews: unknown[] }>('olifant/plans/reviews'),
  plansReview: req<ReviewParams, Open>('olifant/plans/review'),
  plansReviewChoose: req<ReviewChooseParams, Open>('olifant/plans/review/choose'),
  recognitionFeedback: note<RecognitionFeedbackParams>('olifant/recognitionFeedback'),
  plansOutcome: note<OutcomeParams>('olifant/plans/outcome'),
  suggestion: note<Suggestion>('olifant/suggestion'),
  plansReviewReady: note<ReviewReady>('olifant/plans/review/ready'),
} as const;

export const METHODS: string[] = Object.values(Olifant).map(t => t.method);

// The server's own command (workspace/executeCommand); the library registers it from the
// server's executeCommandProvider.
export const SERVER_COMMANDS = { doctor: 'olifant.doctor' } as const;

// Commands the server names in its inlay hints and code lenses; the client runs them.
export const CLIENT_COMMANDS = {
  showActions: 'olifant.showActions',
  planReview: 'olifant.plans.review',
  planExcerpt: 'olifant.plans.excerpt',
  planErrand: 'olifant.plans.errand',
} as const;

export interface DoctorCheck { name: string; status: 'ok' | 'warn' | 'error'; detail: string; fix: string | null }
export interface DoctorResult { checks: DoctorCheck[] }

// The plan files' semantic token legend (Server/Plans.hs planTokenTypes, planTokenModifiers).
export const PLAN_TOKEN_TYPES: readonly string[] = [
  'planMarker', 'planStep', 'planStepDone', 'planQuestion', 'planEvidence', 'planClaim', 'planTest',
  'planAlso', 'planJournal', 'planAnchorPath', 'planAnchorUnit', 'planVerdict', 'planFingerprint',
];
export const PLAN_TOKEN_MODIFIERS: readonly string[] = ['done', 'stale', 'notFound'];
