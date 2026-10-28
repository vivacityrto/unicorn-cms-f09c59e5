export type DeleteBlocker = 'children' | 'linked_issues' | 'milestone_progress' | 'task_links' | 'milestone_links' | 'outcomes';

/** What archiving or deleting a Rock would touch, as reported by the rock_impact function. */
export interface RockImpact {
  rock: { id: string; title: string; level: string | null; archived_at: string | null; quarter_year: number | null; quarter_number: number | null };
  parent: { id: string; title: string; archived_at: string | null } | null;
  children_active: number;
  children_archived: number;
  descendants_active: number;
  linked_issues: number;
  milestones: { total: number; started: number; complete: number; with_evidence: number };
  task_links: number;
  milestone_links: number;
  outcomes: number;
  blockers: DeleteBlocker[];
  can_delete: boolean;
}

export interface RockEvent {
  id: number;
  action: 'created' | 'updated' | 'archived' | 'restored' | 'deleted';
  actor_user_id: string | null;
  before_data: Record<string, unknown> | null;
  after_data: Record<string, unknown> | null;
  occurred_at: string;
}

const plural = (n: number, one: string, many: string) => `${n} ${n === 1 ? one : many}`;

/** Why a Rock cannot be deleted, in the person's terms and with real numbers. */
export function blockerSentences(impact: RockImpact): string[] {
  const lines: string[] = [];
  for (const blocker of impact.blockers) {
    switch (blocker) {
      case 'children': {
        const total = impact.children_active + impact.children_archived;
        lines.push(`${plural(total, 'Rock serves', 'Rocks serve')} it.`);
        break;
      }
      case 'linked_issues':
        lines.push(`${plural(impact.linked_issues, 'issue is', 'issues are')} linked to it.`);
        break;
      case 'milestone_progress':
        lines.push(`Its milestones show progress or evidence (${impact.milestones.started} started, ${impact.milestones.with_evidence} with evidence).`);
        break;
      case 'task_links':
        lines.push(`${plural(impact.task_links, 'task is', 'tasks are')} linked to its milestones.`);
        break;
      case 'milestone_links':
        lines.push(`${plural(impact.milestone_links, 'milestone link ties', 'milestone links tie')} it to other Rocks.`);
        break;
      case 'outcomes':
        lines.push(`${plural(impact.outcomes, 'outcome has', 'outcomes have')} been recorded for it.`);
        break;
    }
  }
  return lines;
}

/** What stays and what changes when a Rock is archived. */
export function archiveEffects(impact: RockImpact, includeChildren: boolean): string[] {
  const lines = ['It disappears from the active views, the cascade and the L10 Rock Review. Nothing is deleted, and it can be restored.'];
  if (impact.descendants_active > 0) {
    lines.push(includeChildren
      ? `${plural(impact.descendants_active, 'Rock that serves it is', 'Rocks that serve it are')} archived with it.`
      : `${plural(impact.descendants_active, 'Rock that serves it stays', 'Rocks that serve it stay')} active, and will no longer show under it.`);
  }
  if (impact.linked_issues > 0) lines.push(`${plural(impact.linked_issues, 'linked issue keeps', 'linked issues keep')} the link.`);
  if (impact.milestones.total > 0) lines.push(`Its ${plural(impact.milestones.total, 'milestone', 'milestones')} and their progress are kept.`);
  return lines;
}

/** What permanent deletion removes. Only meaningful when the Rock can be deleted. */
export function deleteEffects(impact: RockImpact): string[] {
  const lines = ['The Rock is removed permanently. This cannot be undone.'];
  if (impact.milestones.total > 0) lines.push(`Its ${plural(impact.milestones.total, 'milestone', 'milestones')}, none of them started, ${impact.milestones.total === 1 ? 'is' : 'are'} removed with it.`);
  lines.push('A record that it was deleted, and by whom, stays in the change history.');
  return lines;
}

const STATUS_LABEL: Record<string, string> = {
  not_started: 'not started', on_track: 'on track', at_risk: 'at risk', off_track: 'off track', blocked: 'blocked', complete: 'complete',
};

const show = (value: unknown) => (value === null || value === undefined || value === '' ? 'nothing' : String(value));

/** One sentence for a history entry, e.g. "Carl changed the status from on track to at risk". */
export function describeEvent(event: RockEvent, nameOf: (userId: string | null) => string): string {
  const who = event.actor_user_id ? nameOf(event.actor_user_id) : 'Someone';
  switch (event.action) {
    case 'created': return `${who} created this Rock`;
    case 'archived': return `${who} archived this Rock`;
    case 'restored': return `${who} restored this Rock`;
    case 'deleted': return `${who} deleted this Rock`;
  }
  const before = event.before_data ?? {};
  const after = event.after_data ?? {};
  const parts: string[] = [];
  if ('status' in after) parts.push(`the status from ${STATUS_LABEL[String(before.status)] ?? show(before.status)} to ${STATUS_LABEL[String(after.status)] ?? show(after.status)}`);
  if ('owner_id' in after) parts.push(`the owner from ${before.owner_id ? nameOf(String(before.owner_id)) : 'nobody'} to ${after.owner_id ? nameOf(String(after.owner_id)) : 'nobody'}`);
  if ('due_date' in after) parts.push(`the due date from ${show(before.due_date)} to ${show(after.due_date)}`);
  if ('title' in after) parts.push('the title');
  if ('parent_rock_id' in after) parts.push('what it serves');
  if ('rock_level' in after) parts.push(`the level from ${show(before.rock_level)} to ${show(after.rock_level)}`);
  if ('function_id' in after) parts.push('the team');
  if ('quarter_year' in after || 'quarter_number' in after) parts.push('the quarter');
  if ('client_tenant_id' in after) parts.push('the client');
  if ('priority' in after) parts.push('the priority');
  if (parts.length === 0) return `${who} updated this Rock`;
  const joined = parts.length === 1 ? parts[0] : `${parts.slice(0, -1).join(', ')} and ${parts[parts.length - 1]}`;
  return `${who} changed ${joined}`;
}
