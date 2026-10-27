import type { RockLevel } from '@/types/eos';
import { quarterBounds } from '@/utils/rockPanelMetrics';
import type { ParentCandidate, RockEditorValues, ValidationResult } from '@/utils/rockEditor/types';

/**
 * The server's rules for a Rock, mirrored so the form can say what is wrong
 * before saving instead of failing with a database error.
 *
 *  - Team and Individual Rocks need an owner (database trigger); a Team Rock also needs a team.
 *  - A Company Rock has no parent; a Team Rock's parent is a Company Rock; an
 *    Individual Rock's parent is a Company or Team Rock (server function).
 *  - A parent must be in the same quarter and not archived (server function).
 *  - The server only checks the hierarchy when it changes, so a legacy Rock that
 *    already breaks a rule can still be saved unrelated edits.
 *
 * One deliberate difference: the form also asks every Rock for an owner, because a
 * Rock has one accountable person. The server accepts a Company Rock with none.
 */

export const LEVEL_LABEL: Record<RockLevel, string> = { company: 'Company', team: 'Team', individual: 'Individual' };

const ALLOWED_PARENT_LEVELS: Record<RockLevel, readonly RockLevel[]> = {
  company: [],
  team: ['company'],
  individual: ['company', 'team'],
};

const MAX_TITLE = 200;
const DATE_RE = /^\d{4}-\d{2}-\d{2}$/;

export function allowedParentLevels(level: RockLevel): readonly RockLevel[] {
  return ALLOWED_PARENT_LEVELS[level];
}

export function needsParent(level: RockLevel): boolean {
  return ALLOWED_PARENT_LEVELS[level].length > 0;
}

export function isValidIsoDate(value: string): boolean {
  if (!DATE_RE.test(value)) return false;
  const d = new Date(`${value}T00:00:00Z`);
  return !Number.isNaN(d.getTime()) && d.toISOString().startsWith(value);
}

/** Active Rocks in this quarter that could parent a Rock of this level. */
export function candidateParents(
  level: RockLevel,
  quarter: { year: number; quarter: number },
  rocks: readonly ParentCandidate[],
): ParentCandidate[] {
  const levels = ALLOWED_PARENT_LEVELS[level];
  return rocks
    .filter(r => levels.includes(r.level) && !r.archived && r.quarterYear === quarter.year && r.quarterNumber === quarter.quarter)
    .sort((a, b) => a.level.localeCompare(b.level) || a.title.localeCompare(b.title));
}

export interface ValidationContext {
  /** Every Rock the form knows about, for looking a parent up. */
  rocks: readonly ParentCandidate[];
  /** Company milestone ids an Individual milestone may support. */
  companyMilestoneIds?: ReadonlySet<string>;
  /** When editing: how the Rock stood before, so an unchanged hierarchy is not re-judged. */
  original?: { level: RockLevel; parentId: string | null; quarterYear: number; quarterNumber: number };
  now?: Date;
}

function parentError(values: RockEditorValues, ctx: ValidationContext): string | null {
  const { level, parentId } = values;
  if (level === 'company') return parentId ? 'A Company Rock cannot have a parent.' : null;

  const unchanged =
    !!ctx.original &&
    ctx.original.level === level &&
    ctx.original.parentId === parentId &&
    ctx.original.quarterYear === values.quarterYear &&
    ctx.original.quarterNumber === values.quarterNumber;
  if (unchanged) return null; // the server leaves an unchanged hierarchy alone, so a legacy Rock can still be edited

  if (!parentId) return level === 'team' ? 'Choose the Company Rock this serves.' : 'Choose the Company or Team Rock this serves.';
  const parent = ctx.rocks.find(r => r.id === parentId);
  if (!parent) return 'That parent Rock could not be found.';
  if (parent.archived) return 'An archived Rock cannot be a parent.';
  if (!ALLOWED_PARENT_LEVELS[level].includes(parent.level)) {
    return level === 'team' ? 'A Team Rock must serve a Company Rock.' : 'An Individual Rock must serve a Company or Team Rock.';
  }
  if (parent.quarterYear !== values.quarterYear || parent.quarterNumber !== values.quarterNumber) {
    return `The parent must be in the same quarter (Q${values.quarterNumber} ${values.quarterYear}).`;
  }
  return null;
}

export function validateRockEditor(values: RockEditorValues, ctx: ValidationContext): ValidationResult {
  const errors: Record<string, string> = {};
  const warnings: Record<string, string> = {};
  const now = ctx.now ?? new Date();

  const title = values.title.trim();
  if (!title) errors.title = 'Give the Rock a title.';
  else if (title.length > MAX_TITLE) errors.title = `Keep the title under ${MAX_TITLE} characters.`;

  const parent = parentError(values, ctx);
  if (parent) errors.parent = parent;

  if (values.level === 'team' && !values.functionId) errors.function = 'Choose the team this Rock belongs to.';
  if (!values.ownerId) errors.owner = 'Choose one owner.';

  if (
    !Number.isInteger(values.quarterYear) || values.quarterYear < 2000 || values.quarterYear > 2100 ||
    !Number.isInteger(values.quarterNumber) || values.quarterNumber < 1 || values.quarterNumber > 4
  ) {
    errors.quarter = 'Choose a valid quarter.';
  }

  if (!values.dueDate) errors.dueDate = 'Choose a due date.';
  else if (!isValidIsoDate(values.dueDate)) errors.dueDate = 'That due date is not valid.';
  else if (!errors.quarter) {
    const { startIso, endIso } = quarterBounds(values.quarterYear, values.quarterNumber);
    if (values.dueDate < startIso || values.dueDate > endIso) {
      warnings.dueDate = `This is outside Q${values.quarterNumber} ${values.quarterYear}.`;
    } else if (!ctx.original) {
      const today = `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, '0')}-${String(now.getDate()).padStart(2, '0')}`;
      if (values.dueDate < today) warnings.dueDate = 'This date has already passed.';
    }
  }

  const companyIds = ctx.companyMilestoneIds ?? new Set<string>();
  for (const m of values.milestones) {
    if (!m.title.trim()) continue; // blank rows are ignored when saving
    if (m.title.trim().length > MAX_TITLE) errors[`milestone:${m.id}`] = `Keep the milestone under ${MAX_TITLE} characters.`;
    else if (m.dueDate && !isValidIsoDate(m.dueDate)) errors[`milestone:${m.id}`] = 'That milestone due date is not valid.';
    else if (values.level === 'individual' && m.supports.some(id => !companyIds.has(id))) {
      errors[`milestone:${m.id}`] = 'It supports a Company milestone that is not part of this Rock’s Company Rock.';
    }
    if (values.level === 'individual' && companyIds.size > 0 && m.supports.length === 0 && !errors[`milestone:${m.id}`]) {
      warnings[`milestone:${m.id}:link`] = 'Not linked to a Company milestone yet.';
    }
  }

  return { errors, warnings };
}

export function hasErrors(result: ValidationResult): boolean {
  return Object.keys(result.errors).length > 0;
}
