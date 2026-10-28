import type { Database } from '@/integrations/supabase/types';

export type CarryoverRow = Database['public']['Tables']['eos_rock_carryovers']['Row'];
export type CarryoverMilestoneRow = Database['public']['Tables']['eos_rock_carryover_milestones']['Row'];

export interface Quarter {
  year: number;
  quarter: number;
}

export const quarterIndex = (q: Quarter) => q.year * 4 + q.quarter;

export function nextQuarter(q: Quarter): Quarter {
  return q.quarter >= 4 ? { year: q.year + 1, quarter: 1 } : { year: q.year, quarter: q.quarter + 1 };
}

export function formatQuarter(q: Quarter): string {
  return `Q${q.quarter} ${q.year}`;
}

/** Last calendar day of a quarter, as YYYY-MM-DD, used as the suggested due date for a new destination Rock. */
export function quarterEndIso(q: Quarter): string {
  const lastMonth = q.quarter * 3;
  const day = new Date(Date.UTC(q.year, lastMonth, 0)).getUTCDate();
  return `${q.year}-${String(lastMonth).padStart(2, '0')}-${String(day).padStart(2, '0')}`;
}

/** Quarters offered as destinations: the next four after the source. Carryover is not tied to Q4 to Q1. */
export function destinationQuarters(source: Quarter, count = 4): Quarter[] {
  const out: Quarter[] = [];
  let q = nextQuarter(source);
  for (let i = 0; i < count; i++) {
    out.push(q);
    q = nextQuarter(q);
  }
  return out;
}

export type CarryCandidateState = 'carry' | 'completed' | 'carried';

export interface CarryCandidateInput {
  id: string;
  title: string;
  status: string;
  dueDate: string | null;
}

export interface CarryCandidate extends CarryCandidateInput {
  state: CarryCandidateState;
}

/**
 * Sort a Rock's milestones into what can be carried, what is finished and stays
 * where it is, and what has already been carried (never offered twice).
 */
export function classifyMilestones(milestones: CarryCandidateInput[], alreadyCarriedIds: ReadonlySet<string>): CarryCandidate[] {
  return milestones.map(m => ({
    ...m,
    state: m.status === 'complete' ? 'completed' : alreadyCarriedIds.has(m.id) ? 'carried' : 'carry',
  }));
}

export interface DestinationRockOption {
  id: string;
  title: string;
  level: string | null;
  quarterYear: number;
  quarterNumber: number;
  parentRockId: string | null;
  archived: boolean;
  tenantId: number;
}

export interface CarrySourceRock {
  id: string;
  level: string | null;
  quarterYear: number;
  quarterNumber: number;
  tenantId: number;
  parentRockId: string | null;
}

/**
 * Existing Rocks a source can be carried into: same tenant, same level, a later
 * quarter, not archived, not already carried to, and (when the source serves a
 * Rock that has itself been carried) serving that Rock's destination. The
 * database enforces every one of these; this only hides choices that would fail.
 */
export function destinationOptions(
  source: CarrySourceRock,
  rocks: DestinationRockOption[],
  alreadyCarriedToIds: ReadonlySet<string>,
  parentDestinationId: string | null,
): DestinationRockOption[] {
  const sourceIndex = quarterIndex({ year: source.quarterYear, quarter: source.quarterNumber });
  return rocks
    .filter(r => r.id !== source.id)
    .filter(r => r.tenantId === source.tenantId)
    .filter(r => r.level === source.level)
    .filter(r => !r.archived)
    .filter(r => quarterIndex({ year: r.quarterYear, quarter: r.quarterNumber }) > sourceIndex)
    .filter(r => !alreadyCarriedToIds.has(r.id))
    .filter(r => !parentDestinationId || r.parentRockId === parentDestinationId)
    .sort((a, b) => quarterIndex({ year: a.quarterYear, quarter: a.quarterNumber }) - quarterIndex({ year: b.quarterYear, quarter: b.quarterNumber }) || a.title.localeCompare(b.title));
}

export type DestinationChoice =
  | { kind: 'new'; year: number; quarter: number; title: string; dueDate: string }
  | { kind: 'existing'; rockId: string };

export interface CarryoverForm {
  destination: DestinationChoice;
  /** Milestone id -> the new target date chosen for it ('' keeps the destination's own date). */
  selected: Record<string, string>;
  reason: string;
}

export type CarryoverErrors = Partial<Record<'destination' | 'dueDate' | 'milestones' | 'reason' | 'milestoneDates', string>>;

const isIso = (value: string) => /^\d{4}-\d{2}-\d{2}$/.test(value) && !Number.isNaN(Date.parse(value));

/**
 * Validate before sending. A carryover with no milestones is allowed (the Rock
 * itself moves on), but a reason always is: carrying work forward is a decision
 * and the record should say why.
 */
export function validateCarryover(form: CarryoverForm, source: Quarter): { errors: CarryoverErrors; valid: boolean } {
  const errors: CarryoverErrors = {};
  if (form.destination.kind === 'new') {
    const dest = { year: form.destination.year, quarter: form.destination.quarter };
    if (quarterIndex(dest) <= quarterIndex(source)) errors.destination = 'Choose a quarter after this one.';
    if (!isIso(form.destination.dueDate)) errors.dueDate = 'Enter the new Rock’s due date.';
  } else if (!form.destination.rockId) {
    errors.destination = 'Choose the Rock to carry this into.';
  }
  if (!form.reason.trim()) errors.reason = 'Say why this is being carried forward.';
  else if (form.reason.trim().length > 1000) errors.reason = 'Keep the reason under 1000 characters.';
  if (Object.values(form.selected).some(date => date && !isIso(date))) errors.milestoneDates = 'Check the new dates you entered.';
  return { errors, valid: Object.keys(errors).length === 0 };
}

/** The JSON arguments for carry_forward_rock(). */
export function carryoverPayload(form: CarryoverForm): {
  destination: Record<string, unknown>;
  milestones: Array<Record<string, string>>;
  reason: string;
} {
  const destination =
    form.destination.kind === 'existing'
      ? { rock_id: form.destination.rockId }
      : {
          create: {
            title: form.destination.title.trim() || undefined,
            quarter_year: form.destination.year,
            quarter_number: form.destination.quarter,
            due_date: form.destination.dueDate,
          },
        };
  const milestones = Object.entries(form.selected).map(([id, date]) => {
    const item: Record<string, string> = { source_milestone_id: id };
    if (date) item.new_due_date = date;
    return item;
  });
  return { destination, milestones, reason: form.reason.trim() };
}

/** Plain-language lines for the preview, so the effect is clear before anything is saved. */
export function carryoverPreview(
  sourceTitle: string,
  source: Quarter,
  destinationLabel: string,
  carriedCount: number,
  completedStayingCount: number,
): string[] {
  const lines = [
    `${carriedCount === 0 ? 'No milestones' : carriedCount === 1 ? '1 milestone' : `${carriedCount} milestones`} will be copied into ${destinationLabel} as new work.`,
    `“${sourceTitle}” and everything in ${formatQuarter(source)} stay exactly as they are, including dates, status and evidence.`,
    'The original Rock is not marked complete.',
  ];
  if (completedStayingCount > 0) {
    lines.push(`${completedStayingCount === 1 ? '1 completed milestone stays' : `${completedStayingCount} completed milestones stay`} in ${formatQuarter(source)} and ${completedStayingCount === 1 ? 'is' : 'are'} not copied.`);
  }
  return lines;
}

/** Counterpart of a Rock in a carryover: where it went, or where it came from. */
export interface CarryoverLink {
  carryoverId: string;
  direction: 'to' | 'from';
  otherRockId: string;
  reason: string;
  carriedAt: string;
  carriedBy: string | null;
  milestones: Array<{
    id: string;
    sourceMilestoneId: string | null;
    destinationMilestoneId: string | null;
    sourceTitle: string;
    sourceStatus: string;
    newDueDate: string | null;
  }>;
}

export function carryoverLinksFor(
  rockId: string,
  carryovers: CarryoverRow[],
  milestones: CarryoverMilestoneRow[],
): CarryoverLink[] {
  return carryovers
    .filter(c => c.source_rock_id === rockId || c.destination_rock_id === rockId)
    .map(c => ({
      carryoverId: c.id,
      direction: c.source_rock_id === rockId ? ('to' as const) : ('from' as const),
      otherRockId: c.source_rock_id === rockId ? c.destination_rock_id : c.source_rock_id,
      reason: c.reason,
      carriedAt: c.carried_at,
      carriedBy: c.carried_by,
      milestones: milestones
        .filter(m => m.carryover_id === c.id)
        .map(m => ({
          id: m.id,
          sourceMilestoneId: m.source_milestone_id,
          destinationMilestoneId: m.destination_milestone_id,
          sourceTitle: m.source_title,
          sourceStatus: m.source_status,
          newDueDate: m.new_due_date,
        })),
    }))
    .sort((a, b) => b.carriedAt.localeCompare(a.carriedAt));
}
