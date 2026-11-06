// The olifant/* wire contract: every custom method olifant lsp answers or sends, and the
// commands it names. References: the olifant book, user/16-the-language-server.md (the table
// "What it answers"), user/18-tdd-in-the-editor.md, user/19-plans.md, internals/03-plans.md;
// the truth is src/Olifant/Lsp.hs. No other file spells a method string. A milestone that
// consumes a result tightens its type here.
import {
  NotificationType, Position, RequestType, TextDocumentIdentifier, WorkspaceEdit,
} from 'vscode-languageserver-protocol';

export interface Doc { textDocument: TextDocumentIdentifier }
export interface At extends Doc { position: Position }
// Row: a 0-based line of a plan file.
export interface Row extends Doc { line: number }
export type Sets = Record<string, unknown>;
// Survivor: a mutate's surviving mutant (line 1-based), as olifant/mutate lists it.
export interface Survivor { line: number; operator: string; from: string; to: string; mutated: string }
type Open = Record<string, unknown>;

// --- generate (milestone 2)
export interface GeneratorsParams extends Doc { position?: Position }
export interface GeneratorItem extends Open { name: string; kind?: string; summary?: string; here?: boolean }
export interface GeneratorsResult extends Open { generators: GeneratorItem[] }
export interface ChoicesParams extends Doc { generator: string; sets: Sets }
export interface ChoicesResult extends Open { inputs: unknown[] }
export interface PreviewParams extends At { steps: unknown[] }
// olifant/plan: the generate picker's steps, a follow-up's planId, or a recognition's sets.
export type PlanParams =
  | (At & { steps: unknown[] })
  | { planId: string; fill?: boolean }
  | (Doc & { generator: string; sets: Sets; recognize: true });
export interface PlanResult extends Open { plan?: unknown; edit?: WorkspaceEdit }

// --- ghosts and follow-ups (milestone 3)
export interface Suggestion extends Open {
  uri: string; version: number; kind: string; label?: string; summary?: string; line?: number; lines?: unknown; at?: unknown; planId?: string;
}
export interface SuggestParams extends Doc { line: number }
export interface RecognitionFeedbackParams extends Doc { generator: string; outcome: string }

// --- the TDD loop (milestone 4)
export interface StubParams extends At { survivor?: Survivor }
export interface StubResult extends Open { file: string; line: number; name: string; edits: WorkspaceEdit }
export interface ConjureResume { token: string; choice: string; arg?: unknown; land?: boolean; hint?: string }
export interface ConjureParams extends At { selection?: { start: number; end: number }; resume?: ConjureResume }
export type ConjureResult =
  | (Open & { file: string; unit: string; edits: WorkspaceEdit; summary: string; green: boolean; tests?: unknown; rounds?: unknown; rungs?: unknown })
  | { paused: Open };
export interface MutateResult extends Open {
  file: string; unit: string; lines: unknown; killed: number; survived: number; survivors: (Survivor & { dim?: boolean })[]; summary: string;
}
export interface WaiveParams extends Doc { survivor: Survivor; reason: string }
export interface TestsRunResult extends Open {
  file: string; passed: number; failed: { id: string; line: number; message: string; output: string }[]; broken: string | null; seconds: number;
}
export interface TestsFileResult { file: string; kind: 'test' | 'module'; exists: boolean }

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
  preview: req<PreviewParams, Open>('olifant/preview'),
  plan: req<PlanParams, PlanResult>('olifant/plan'),
  fileActions: req<Doc, unknown>('olifant/fileActions'),
  holes: req<Doc, unknown>('olifant/holes'),
  model: req<Doc, Open>('olifant/model'),
  suggest: req<SuggestParams, Suggestion | null>('olifant/suggest'),
  stub: req<StubParams, StubResult>('olifant/stub'),
  conjure: req<ConjureParams, ConjureResult>('olifant/conjure'),
  mutate: req<At, MutateResult>('olifant/mutate'),
  waive: req<WaiveParams, unknown>('olifant/waive'),
  testsRun: req<Doc, TestsRunResult>('olifant/tests/run'),
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
