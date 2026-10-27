import type { EosRock, RockLevel, RockMilestoneStatus } from '@/types/eos';
import type { EditorMilestone, MilestonePriority, RockEditorValues } from '@/utils/rockEditor/types';

export interface StoredMilestone {
  id: string;
  title: string;
  owner_id: string | null;
  due_date: string | null;
  priority: string | null;
  status: string | null;
  exit_criteria: string | null;
  evidence_url: string | null;
}

export interface StoredLink {
  company_milestone_id: string;
  individual_milestone_id: string;
}

const PRIORITIES: readonly MilestonePriority[] = ['critical', 'high', 'medium', 'low'];
const STATUSES: readonly RockMilestoneStatus[] = ['not_started', 'in_progress', 'blocked', 'complete', 'off_track', 'deferred'];

const dateOnly = (value: string | null | undefined) => (value ? value.slice(0, 10) : '');

/** Milestones as the editor shows them. Saved owners, dates and statuses are carried exactly. */
export function milestonesFromRows(rows: readonly StoredMilestone[], links: readonly StoredLink[] = []): EditorMilestone[] {
  const supports = new Map<string, string[]>();
  for (const link of links) {
    const list = supports.get(link.individual_milestone_id) ?? [];
    list.push(link.company_milestone_id);
    supports.set(link.individual_milestone_id, list);
  }
  return rows.map(row => ({
    id: row.id,
    title: row.title,
    ownerId: row.owner_id,
    dueDate: dateOnly(row.due_date),
    priority: PRIORITIES.includes(row.priority as MilestonePriority) ? (row.priority as MilestonePriority) : 'medium',
    exitCriteria: row.exit_criteria ?? '',
    evidenceUrl: row.evidence_url ?? '',
    status: STATUSES.includes(row.status as RockMilestoneStatus) ? (row.status as RockMilestoneStatus) : 'not_started',
    supports: supports.get(row.id) ?? [],
    keepBlank: { owner: !row.owner_id, due: !row.due_date },
  }));
}

/** The values to edit for a saved Rock. */
export function valuesFromRock(rock: EosRock, milestones: readonly EditorMilestone[]): RockEditorValues {
  return {
    level: (rock.rock_level || 'company') as RockLevel,
    parentId: rock.parent_rock_id ?? null,
    functionId: rock.function_id ?? null,
    ownerId: rock.owner_id ?? null,
    title: rock.title ?? '',
    description: rock.description ?? '',
    issue: rock.issue ?? '',
    outcome: rock.outcome ?? '',
    quarterYear: rock.quarter_year ?? new Date().getFullYear(),
    quarterNumber: rock.quarter_number ?? Math.floor(new Date().getMonth() / 3) + 1,
    dueDate: dateOnly(rock.due_date),
    milestones: [...milestones],
  };
}

/** What the server compares against to decide whether the hierarchy changed. */
export function originalOf(values: RockEditorValues) {
  return { level: values.level, parentId: values.parentId, quarterYear: values.quarterYear, quarterNumber: values.quarterNumber };
}

/** Whether anything the person can change differs from what was loaded. */
export function isDirty(current: RockEditorValues, loaded: RockEditorValues, status?: { current: string; loaded: string }): boolean {
  if (status && status.current !== status.loaded) return true;
  return JSON.stringify(normalise(current)) !== JSON.stringify(normalise(loaded));
}

function normalise(values: RockEditorValues) {
  return {
    ...values,
    title: values.title.trim(),
    description: values.description.trim(),
    issue: values.issue.trim(),
    outcome: values.outcome.trim(),
    // An untouched blank row is not a change.
    milestones: values.milestones
      .filter(m => m.title.trim() || m.supports.length || m.exitCriteria.trim())
      .map(m => ({ ...m, title: m.title.trim(), exitCriteria: m.exitCriteria.trim(), evidenceUrl: m.evidenceUrl.trim(), supports: [...m.supports].sort() })),
  };
}
