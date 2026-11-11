// The olifant/* wire contract: every custom method olifant lsp answers or sends, and the
// commands it names. References: the olifant book, user/16-the-language-server.md (the table
// "What it answers"), user/18-tdd-in-the-editor.md, user/19-plans.md, internals/03-plans.md;
// the truth is src/Olifant/Lsp.hs. No other file spells a method string. A milestone that
// consumes a result tightens its type here.
import {
  CodeAction, CodeActionParams, Command, NotificationType, Position, Range, RequestType, TextDocumentIdentifier, WorkspaceEdit,
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
// a resume's choice: exactly what resumeOf accepts (Lsp.hs :1077)
export type ResumeChoice = 'continue' | 'climb' | 'stop' | 'reconjure' | 'accept' | 'reject' | 'wire' | 'port';
export interface ConjureResume { token: string; choice: ResumeChoice; arg?: string; land?: boolean; hint?: string }
export interface ConjureParams extends At { selection?: { start: number; end: number }; resume?: ConjureResume }
// landed: edits null when nothing changed; tests the after-run (scope "file"); stopped always sent
export interface ConjureLanded extends Open {
  file: string; unit: string; edits: WorkspaceEdit | null; summary: string; green: boolean;
  tests: TestsRunResult; rounds: number; rungs: string[]; stopped: boolean;
}
// The pause (ConjureNext.hs pausedJson :865-955). lines 1-based inclusive; file absolute; a
// round's, wire's or step's files root-relative. A thin answer may carry only token, lines and
// offers; nullable fields arrive as null. Read every field through given() (src/pause/text.ts).
export interface PausedFile { file: string; diff: string }
export interface PausedFailed {
  test: string; message: string; summary?: string | null; at?: number | string | null; assertion?: string | null;
  got?: string | null; expected?: string | null; output?: string | null;
}
export interface PausedDecide { choice: string; confidence: number; probabilities: Record<string, number> }
export interface PausedRound {
  round: number; rung: string; attempt?: string | null; line: string; verdict: 'green' | 'red';
  failing: string[]; failed: PausedFailed[]; passed: string[]; check?: string | null;
  decide?: PausedDecide | null; diff: string | null; files: PausedFile[];
}
// flipped: the round the test's status changed in (0 = before round 1)
export interface PausedTest {
  test: string; source?: string | null; status: 'failing' | 'passing'; flipped?: number | null; assertion?: string | null; note?: string | null;
}
export interface PausedWired { param: string; port: string; test?: string | null; files: PausedFile[] }
// an offer: choice `proposal` is an entry, not a resume verb; land and hint only on stop / continue
export interface PausedOffer { choice: string; arg?: string | null; label: string; detail: string; land?: boolean | null; hint?: boolean | null }
export interface PausedStep { after: number; kind?: 'wire' | 'test' | 'hint' | 'port' | null; text: string; files: PausedFile[]; test?: string | null }
export interface PausedProblem { file: string; line?: number | null; message: string }
export type PausedFailure =
  | { round: number; kind: 'check'; tool: string; problems: PausedProblem[] }
  | { round: number; kind: 'tests'; tests: string[] };
export interface PausedProposal {
  file: string; test: string; before?: string | null; after?: string | null; diff: string; refused?: string | null;
  step?: string | null; kind?: 'test' | 'port' | null; files?: string[] | null;
}
export interface PausedTitle { unit?: string | null; round?: number | null; of?: number | null; rung?: string | null; model?: string | null; seconds?: number | null }
export interface Paused {
  token: string; lines: { first: number; last: number }; offers: PausedOffer[];
  file?: string; round?: number; rung?: string; summary?: string; why?: string; title?: PausedTitle;
  diagnosis?: string[]; trigger?: string; rounds?: PausedRound[]; tests?: PausedTest[];
  unit?: { header: string; ports: string[] }; landing?: { diff: string }; wired?: PausedWired[];
  expires?: number; outcome?: string | null; steps?: PausedStep[]; failure?: PausedFailure | null;
  checker?: string | null; snippet?: { file: string; line: number; ghost: unknown; body: string } | null;
  proposal?: PausedProposal | null;
}
export interface ConjurePaused { paused: Paused }
export type ConjureResult = ConjureLanded | ConjurePaused;
export interface MutateSurvivor extends Survivor { dim: boolean }
export interface MutateResult {
  file: string; unit: string; lines: { first: number; last: number }; killed: number; survived: number; waived: number;
  survivors: MutateSurvivor[]; summary: string;
}
export interface WaiveParams extends Doc { survivor: Survivor; reason: string }
export interface WaiveResult { waived: true }

// --- plans (milestones 5 and 6)
// plans/do: `resume` is a review id (reopen), text what the do should change
export interface ErrandParams extends Row { resume?: string; text?: string }
// plans/ask, validate, do (Lsp.hs errandJson :1962-1977). Rows 0-based. A block's line carries
// its anchor's fingerprint (null when it did not resolve); after_text, when a string, names the
// line the block goes under, searched in the request row's section. The server sends no
// `replace`: the client infers it (a do's block whose first line is a step).
export interface BlockLine { text: string; fp?: string | null }
export interface Block { after?: number; after_text?: string | null; lines?: BlockLine[] | null; replace?: boolean }
export interface ErrandResult extends Open {
  id?: string; verb?: string; facts?: Fact[] | null; blocks?: Block[] | null; dropped?: number; unresolved?: number;
  seconds?: number; cost?: number | null; changed?: string[] | null; review?: string | null;
}
export interface ReconcileParams extends Doc { forced: boolean }
export interface AnchorResult extends Open { file?: string; line?: number; unit?: string; fingerprint?: string }
// plans/files: file absolute (null when it does not exist), line its unit's 1-based line
export interface FileItem { section: string; row: number; text: string; file?: string | null; line?: number | null }
export interface FilesResult { items: FileItem[] }
// plans/stub {file, line, name, edits, facts}; plans/test {facts, passed, failed, seconds}
export interface StepResult extends Open {
  file?: string; line?: number; name?: string; edits?: WorkspaceEdit | null; facts?: Fact[] | null;
  passed?: number; failed?: number; seconds?: number;
}
export type ErrandOneParams = Doc & ({ id: string } | { row: number });
export interface ErrandsParams extends Doc { row: number }
export interface ReviewParams extends Doc { id: string }
// --- reviews (milestone 5): Review.hs :565-619, ReviewReadings.hs :249-338, Lsp.hs :694-737, :2040-2236.
// row fields are 0-based plan lines.
export interface ReviewEntryRef { id: string; kind: string; row: number | null }
export interface ReviewListItem { id: string; kind: 'do' | 'reconcile'; row?: number | null; step?: string; status?: string; entries?: ReviewEntryRef[] }
export interface ReviewsResult { reviews: ReviewListItem[] }
// an offer: key is the letter (a reading's place offers carry digits and the open step's row)
export interface ReviewOffer { choice: string; key: string; label: string; detail: string; step?: number | null }
export interface DetailsSection { title: string; text: string; lang?: string | null }
export interface DoTitle { verb?: string; step?: number | null; unit?: string | null; badge?: string | null; model?: string | null; seconds?: number | null; cost?: number | null }
export interface DoReview {
  id: string; kind: 'do' | 'errand'; plan?: string; row?: number | null; title: DoTitle; summary: string; step?: string;
  said: string[]; tests?: { ran: boolean; passed: number; failed: number; list: { test: string; status: string }[] } | null;
  denials?: unknown[]; denied?: string | string[] | null;
  landing: { diff: string; files: { file: string; status: 'modified' | 'added' | 'deleted'; diff: string }[]; edit?: WorkspaceEdit | null };
  offers: ReviewOffer[]; details: DetailsSection[];
}
export interface ReadingEntry {
  id: string; kind: string; row: number | null; step?: number | null; unit?: { path: string; unit: string } | null;
  summary: string; offers: ReviewOffer[]; landing: { edit: WorkspaceEdit | null; diff: string; facts?: number };
}
export interface ReconcileReview {
  id: 'reconcile'; kind: 'reconcile'; plan?: string; title: { verb?: string; count?: number }; summary: string;
  entries: ReadingEntry[]; details: DetailsSection[];
}
export type Review = DoReview | ReconcileReview;
// facts (olifant Loop.hs factJson, ReviewReadings.hs applyFactsText): rows are 0-based rows of
// the plan text before the answer. {row, text} replaces a row; {after, lines} inserts below a
// row (several at one row in order); {from, to, lines} replaces rows from..to, to inclusive.
export type Fact = { row: number; text: string } | { after: number; lines: string[] } | { from: number; to: number; lines: string[] };
export interface ChooseResult {
  done: boolean; said?: string; edit?: WorkspaceEdit | null; facts?: Fact[]; files?: string[]; review?: Review | null; reopen?: { id: string } | null;
}
export interface ReviewChooseParams extends Doc { id: string; choice: string; entry?: string; step?: number }
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
  plansFiles: req<Doc, FilesResult>('olifant/plans/files'),
  plansStub: req<Row, StepResult>('olifant/plans/stub'),
  plansTest: req<Row, StepResult>('olifant/plans/test'),
  plansErrand: req<ErrandOneParams, Open>('olifant/plans/errand'),
  plansErrands: req<ErrandsParams, { errands: unknown[] }>('olifant/plans/errands'),
  plansReviews: req<Doc, ReviewsResult>('olifant/plans/reviews'),
  plansReview: req<ReviewParams, Review>('olifant/plans/review'),
  plansReviewChoose: req<ReviewChooseParams, ChooseResult>('olifant/plans/review/choose'),
  recognitionFeedback: note<RecognitionFeedbackParams>('olifant/recognitionFeedback'),
  plansOutcome: note<OutcomeParams>('olifant/plans/outcome'),
  // the plan is quiet: the server triages its claims (milestone 6c sends it)
  plansIdle: note<Doc>('olifant/plans/idle'),
  suggestion: note<Suggestion>('olifant/suggestion'),
  plansReviewReady: note<ReviewReady>('olifant/plans/review/ready'),
} as const;

export const METHODS: string[] = Object.values(Olifant).map(t => t.method);

// The standard requests the plan chords send themselves (M6b): source code actions never reach
// the lightbulb, so new step, excerpt and toggle ask for them, and resolve them, by hand.
export const Lsp = {
  codeAction: req<CodeActionParams, (Command | CodeAction)[] | null>('textDocument/codeAction'),
  codeActionResolve: req<CodeAction, CodeAction>('codeAction/resolve'),
} as const;

// The server's own commands (workspace/executeCommand); the library registers them from the
// server's executeCommandProvider. The claim pass's three (olifant 48f38ab) are code actions'
// commands: the chord-a menu runs them (milestone 6c), showWhy and showCode answer with
// window/showDocument.
export const SERVER_COMMANDS = {
  doctor: 'olifant.doctor',
  checkSentence: 'olifant.checkSentence',
  showWhy: 'olifant.showWhy',
  showCode: 'olifant.showCode',
} as const;

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
// At 48f38ab: checked and wrong mark a bare line's text by its stored check; resolved is no
// longer given and stays for older clients.
export const PLAN_TOKEN_MODIFIERS: readonly string[] = ['done', 'stale', 'notFound', 'checked', 'wrong', 'resolved'];
