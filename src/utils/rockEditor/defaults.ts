import type { RockLevel } from '@/types/eos';
import { quarterBounds } from '@/utils/rockPanelMetrics';
import type { EditorMilestone, ParentCandidate, RockEditorValues } from '@/utils/rockEditor/types';

export function quarterOf(now: Date): { year: number; quarter: number } {
  return { year: now.getFullYear(), quarter: Math.floor(now.getMonth() / 3) + 1 };
}

export const quarterEnd = (year: number, quarter: number) => quarterBounds(year, quarter).endIso;

export function newMilestone(title = '', id: string = crypto.randomUUID()): EditorMilestone {
  return {
    id,
    title,
    ownerId: null,
    dueDate: '',
    priority: 'medium',
    exitCriteria: '',
    evidenceUrl: '',
    status: 'not_started',
    supports: [],
  };
}

/**
 * A new Rock. The quarter comes from the Rock it serves (they must match), the due
 * date defaults to that quarter's end (what most Rocks use), and an Individual Rock
 * defaults to the person making it, who can change it.
 */
export function initialValues(options: {
  level: RockLevel;
  parent?: ParentCandidate | null;
  currentUserId?: string | null;
  now?: Date;
}): RockEditorValues {
  const { level, parent = null, currentUserId = null, now = new Date() } = options;
  const q = parent ? { year: parent.quarterYear, quarter: parent.quarterNumber } : quarterOf(now);
  return {
    level,
    parentId: parent?.id ?? null,
    functionId: null,
    ownerId: level === 'individual' ? currentUserId : null,
    title: '',
    description: '',
    issue: '',
    outcome: '',
    quarterYear: q.year,
    quarterNumber: q.quarter,
    dueDate: quarterEnd(q.year, q.quarter),
    milestones: [],
  };
}

/** Moving the quarter moves a due date that was still the old quarter's default end. */
export function changeQuarter(values: RockEditorValues, year: number, quarter: number): RockEditorValues {
  const wasDefault = values.dueDate === quarterEnd(values.quarterYear, values.quarterNumber);
  return {
    ...values,
    quarterYear: year,
    quarterNumber: quarter,
    dueDate: wasDefault ? quarterEnd(year, quarter) : values.dueDate,
  };
}

/** Choosing a parent adopts its quarter. Milestone links belong to the old parent, so they are cleared. */
export function changeParent(values: RockEditorValues, parent: ParentCandidate | null): RockEditorValues {
  const next = parent && (parent.quarterYear !== values.quarterYear || parent.quarterNumber !== values.quarterNumber)
    ? changeQuarter(values, parent.quarterYear, parent.quarterNumber)
    : values;
  return {
    ...next,
    parentId: parent?.id ?? null,
    milestones: next.milestones.map(m => (m.supports.length ? { ...m, supports: [] } : m)),
  };
}

/** Switching level resets what only made sense at the old one: the parent, the team and milestone links. */
export function changeLevel(values: RockEditorValues, level: RockLevel, currentUserId?: string | null): RockEditorValues {
  if (level === values.level) return values;
  return {
    ...values,
    level,
    parentId: null,
    functionId: null,
    ownerId: values.ownerId ?? (level === 'individual' ? currentUserId ?? null : null),
    milestones: values.milestones.map(m => (m.supports.length ? { ...m, supports: [] } : m)),
  };
}

/** The next Rock in a batch: same level, parent and quarter; everything specific to the last one cleared. */
export function nextInBatch(values: RockEditorValues): RockEditorValues {
  return {
    ...values,
    title: '',
    description: '',
    issue: '',
    outcome: '',
    milestones: [],
  };
}

/**
 * What carries over when a Rock is recreated at another level: the words, the owner,
 * the quarter and the milestones as fresh, not-started rows. The parent, team, links
 * and evidence belong to the old Rock's place in the hierarchy and are left behind.
 */
export function copyToNewLevel(values: RockEditorValues): Partial<RockEditorValues> {
  return {
    title: values.title,
    description: values.description,
    issue: values.issue,
    outcome: values.outcome,
    ownerId: values.ownerId,
    quarterYear: values.quarterYear,
    quarterNumber: values.quarterNumber,
    dueDate: values.dueDate,
    milestones: values.milestones
      .filter(m => m.title.trim())
      .map(m => ({ ...newMilestone(m.title), ownerId: m.ownerId, dueDate: m.dueDate, priority: m.priority, exitCriteria: m.exitCriteria })),
  };
}
