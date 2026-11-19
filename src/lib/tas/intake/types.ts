// TAS intake question catalogue: types. Pure data and logic, no React, no Supabase, no I/O.
//
// The catalogue holds keys, structure, branching and PLACEHOLDER wording only. Real question
// wording is seeded privately after the content owner approves it (decision D19); nothing here may
// carry it. Relative imports use the .ts extension so Node can run the reconciliation script.

/** Content axis of an answer (decision D20). */
export type AnswerState = 'unanswered' | 'answered' | 'not_applicable' | 'not_decided' | 'needs_advice';

/** Checking axis of an answer (decision D20). */
export type ReviewState = 'none' | 'client_reported' | 'evidence_received' | 'verified' | 'rejected' | 'returned';

/** Where an answer came from. No AI or legacy-import values (D20, D19). */
export type SourceType =
  | 'client_typed'
  | 'client_button'
  | 'client_voice_confirmed'
  | 'prefill_tenant_profile'
  | 'prefill_tga'
  | 'prefill_prior_version'
  | 'consultant_entered';

/** Client types at launch (D18). GTO clients are refused. */
export type ClientType = 'rto' | 'cricos' | 'gto';

export type QuestionClass =
  | 'prefill_confirm'
  | 'starter_topic'
  | 'consultant_led'
  | 'branch_client'
  | 'research'
  | 'evidence_attachment';

/** When a question is asked. 'later' is never asked in the starter flow (for example fees). */
export type Phase = 'prefill' | 'starter' | 'branch' | 'consultant' | 'research' | 'later' | 'evidence_slot';

export type StarterTopic = 'q1_product' | 'q2_cohort' | 'q3_learners' | 'q4_delivery' | 'q5_readiness';

export type AskedOf = 'client' | 'confirm' | 'consultant' | 'research';
export type PopulateFrom = 'none' | 'tenant_profile' | 'tga' | 'research';
export type ReviewerAction = 'none' | 'verify' | 'draft' | 'clarify';
export type EvidenceSlot = 'none' | 'optional' | 'expected';
export type AnswerKind = 'text' | 'single' | 'multi' | 'yesno' | 'file';

/** Flags the engine can raise for the consultant brief. */
export type IntakeFlag = 'minor' | 'sensitive_information' | 'third_party_delivery' | 'licensing' | 'national_code_review';

/** A typed, JSON-serialisable condition over answers, so it can live in the database later. */
export type Condition =
  | { op: 'always' }
  | { op: 'answered'; key: string }
  | { op: 'eq'; key: string; value: string }
  | { op: 'in'; key: string; values: string[] }
  | { op: 'includes_any'; key: string; values: string[] }
  | { op: 'all'; of: Condition[] }
  | { op: 'any'; of: Condition[] }
  | { op: 'not'; of: Condition };

export interface CatalogueEntry {
  /** tas.<domain>.<concept>.v<n>: immutable, never reused; a changed meaning mints v2. */
  key: string;
  domain: string;
  cls: QuestionClass;
  phase: Phase;
  topic: StarterTopic | null;
  /** Legacy survey field ids (L001 to L113) this question absorbs. Ids only, never wording. */
  legacyIds: string[];
  askedOf: AskedOf;
  populateFrom: PopulateFrom;
  reviewerAction: ReviewerAction;
  evidenceSlot: EvidenceSlot;
  answerKind: AnswerKind;
  /** Option ids for single and multi answers that gate branches. */
  options?: string[];
  parentKey?: string;
  requiresWhen: Condition;
  /** Flag raised when the answer matches. */
  raisesFlag?: { flag: IntakeFlag; whenIn?: string[] };
  /** Known gap in the plan or source for this question, carried for the content owner. */
  openIssue?: string;
  /** Always "[<key>]". Real wording is seeded privately (D19). */
  placeholder: string;
}

export interface AnswerValue {
  state: AnswerState;
  value?: string | string[] | null;
}

export type AnswerMap = Record<string, AnswerValue | undefined>;
