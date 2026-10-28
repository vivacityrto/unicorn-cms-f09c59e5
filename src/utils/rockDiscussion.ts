import type { RockCascadeNode } from '@/utils/meetingRocksCascade';
import type { RockEvent } from '@/utils/rockLifecycle';
import { getStatusConfig, dbToUiStatus } from '@/utils/rockStatusUtils';

/**
 * Logic behind the Rock Review "Discuss" view. Rock Review in EOS is a yes/no check
 * ("on track or off track") and the discussion belongs in IDS, so everything here is
 * about confirming quickly, saying plainly why a Rock needs the room, and handing the
 * problem to IDS with its facts attached. Nothing here tries to solve anything.
 */

/**
 * Every Rock the segment reviews, in cascade order: a Company Rock, then what cascades from it.
 * A completed Rock is never in the deck, whatever level it is at: the segment does not review it
 * (its top level already leaves it out) and the view's status buttons would reopen it.
 */
export function discussionDeck(roots: readonly RockCascadeNode[], options: { attentionOnly?: boolean } = {}): string[] {
  const ids: string[] = [];
  const walk = (nodes: readonly RockCascadeNode[]) => {
    for (const node of nodes) {
      if (node.reviewable && dbToUiStatus(node.rock.status) !== 'complete' && (!options.attentionOnly || node.needsAttention)) ids.push(node.rock.id);
      walk(node.children);
    }
  };
  walk(roots);
  return ids;
}

/** Every node by Rock id, so a slide can be re-read fresh after a status change without moving the deck. */
export function nodesById(roots: readonly RockCascadeNode[]): Map<string, RockCascadeNode> {
  const map = new Map<string, RockCascadeNode>();
  const walk = (nodes: readonly RockCascadeNode[]) => {
    for (const node of nodes) {
      map.set(node.rock.id, node);
      walk(node.children);
    }
  };
  walk(roots);
  return map;
}

export type ReasonTone = 'bad' | 'warn' | 'info';

export interface DiscussionReason {
  key: string;
  text: string;
  tone: ReasonTone;
}

const plural = (n: number, one: string, many: string) => `${n} ${n === 1 ? one : many}`;

/** Why this Rock needs the room, in words (never only a colour), most serious first. */
export function discussionReasons(node: RockCascadeNode): DiscussionReason[] {
  const { rock, attention, descendants } = node;
  const status = dbToUiStatus(rock.status);
  const out: DiscussionReason[] = [];
  const b = rock.milestoneBreakdown;

  if (status === 'blocked') out.push({ key: 'blocked', text: 'Blocked', tone: 'bad' });
  if (status === 'off_track') out.push({ key: 'off_track', text: 'Off track', tone: 'bad' });
  if (status === 'at_risk') out.push({ key: 'at_risk', text: 'At risk', tone: 'warn' });
  if (b && b.blocked > 0) out.push({ key: 'blocked_milestones', text: `${plural(b.blocked, 'milestone is', 'milestones are')} blocked`, tone: 'bad' });
  if (b && b.offTrack > 0) out.push({ key: 'off_track_milestones', text: `${plural(b.offTrack, 'milestone is', 'milestones are')} off track`, tone: 'bad' });
  if (descendants.blocked > 0) out.push({ key: 'below_blocked', text: `${plural(descendants.blocked, 'Rock below it is', 'Rocks below it are')} blocked`, tone: 'bad' });
  if (descendants.off_track > 0) out.push({ key: 'below_off_track', text: `${plural(descendants.off_track, 'Rock below it is', 'Rocks below it are')} off track`, tone: 'bad' });
  if (descendants.at_risk > 0) out.push({ key: 'below_at_risk', text: `${plural(descendants.at_risk, 'Rock below it is', 'Rocks below it are')} at risk`, tone: 'warn' });
  if (attention.includes('rock_overdue')) out.push({ key: 'rock_overdue', text: 'Past its due date', tone: 'warn' });
  if (b && b.overdue > 0) out.push({ key: 'overdue_milestones', text: `${plural(b.overdue, 'milestone is', 'milestones are')} overdue`, tone: 'warn' });
  if (attention.includes('no_owner')) out.push({ key: 'no_owner', text: 'Nobody owns it', tone: 'warn' });
  return out;
}

export interface FacilitatorCue {
  headline: string;
  question: string;
}

/**
 * The one question to ask. Deliberately short and in line with the segment's own rule:
 * confirm status, find the cause, and move anything that needs a real conversation to IDS.
 */
export function facilitatorCue(node: RockCascadeNode): FacilitatorCue {
  const status = dbToUiStatus(node.rock.status);
  const flags = discussionReasons(node).filter(r => !['blocked', 'off_track', 'at_risk'].includes(r.key));
  switch (status) {
    case 'blocked':
      return { headline: 'Blocked', question: 'What is blocking it, and who owns clearing it? If the room can unblock it, raise it for IDS.' };
    case 'off_track':
      return { headline: 'Off track', question: 'What is the cause? Do not solve it here. If it needs the room, raise it for IDS.' };
    case 'at_risk':
      return { headline: 'At risk', question: 'What could slip, and who owns the next step? If nobody can say, raise it for IDS.' };
    case 'not_started':
      return { headline: 'Not started', question: 'Why has it not started, and is it still a priority this quarter?' };
    default:
      return flags.length > 0
        ? { headline: 'On track, with flags', question: `It says on track, but ${flags.map(f => f.text.toLowerCase()).join(' and ')}. Is on track still true?` }
        : { headline: 'On track', question: 'Confirm it is on track and move on.' };
  }
}

export type IssueSuggestion = 'strong' | 'consider' | 'none';

/** Whether this Rock looks like it needs IDS: strongly when it is stuck or late, softly when it is only flagged. */
export function issueSuggestion(node: RockCascadeNode): IssueSuggestion {
  const status = dbToUiStatus(node.rock.status);
  const reasons = discussionReasons(node);
  if (status === 'blocked' || status === 'off_track') return 'strong';
  if (reasons.some(r => ['blocked_milestones', 'off_track_milestones', 'below_blocked', 'below_off_track'].includes(r.key))) return 'strong';
  if (status === 'at_risk' || reasons.length > 0) return 'consider';
  return 'none';
}

export interface IssueDraftInput {
  rockTitle: string;
  status: string | null | undefined;
  ownerName?: string | null;
  dueLabel?: string | null;
  milestonesDone?: { complete: number; total: number } | null;
  blockedMilestoneTitles?: string[];
  blocker?: { reason: string; nextAction?: string | null; nextActionOwner?: string | null; dependency?: string | null } | null;
  reasons?: string[];
  quarterLabel?: string | null;
  /** What the room needs to decide, as typed by the facilitator. */
  note?: string | null;
}

const clip = (text: string, max: number) => (text.length > max ? `${text.slice(0, max - 1).trimEnd()}…` : text);

/**
 * A ready-to-raise issue: the title says what and why, the description carries the facts so
 * nobody has to re-explain them in IDS. The facilitator can edit both before it is raised.
 */
export function draftIssue(input: IssueDraftInput): { title: string; description: string } {
  const status = dbToUiStatus(input.status);
  const label = getStatusConfig(status).label.toLowerCase();
  // The title says what is wrong. A Rock whose own status looks fine but is flagged (a Rock below it is
  // blocked, a milestone is overdue) is titled by its first flag; only a clean Rock is just "needs discussion".
  const firstFlag = input.reasons?.[0]?.toLowerCase();
  const lead =
    status === 'blocked' && input.blocker
      ? `blocked: ${clip(input.blocker.reason, 70)}`
      : status === 'on_track' || status === 'not_started'
        ? firstFlag ?? 'needs discussion'
        : label;
  const title = clip(`${input.rockTitle}: ${lead}`, 140);

  const lines: string[] = [];
  if (input.note?.trim()) lines.push(`To decide: ${input.note.trim()}`, '');
  lines.push(`Rock: ${input.rockTitle}${input.quarterLabel ? ` (${input.quarterLabel})` : ''}`);
  lines.push(`Status: ${getStatusConfig(status).label}`);
  if (input.ownerName) lines.push(`Owner: ${input.ownerName}`);
  if (input.dueLabel) lines.push(`Due: ${input.dueLabel}`);
  if (input.milestonesDone && input.milestonesDone.total > 0) lines.push(`Milestones: ${input.milestonesDone.complete} of ${input.milestonesDone.total} done`);
  if (input.reasons && input.reasons.length > 0) lines.push(`Flags: ${input.reasons.join('; ')}`);
  if (input.blockedMilestoneTitles && input.blockedMilestoneTitles.length > 0) {
    const shown = input.blockedMilestoneTitles.slice(0, 3).map(t => clip(t, 80));
    const more = input.blockedMilestoneTitles.length - shown.length;
    lines.push(`Blocked milestones: ${shown.join('; ')}${more > 0 ? ` (and ${more} more)` : ''}`);
  }
  if (input.blocker) {
    lines.push(`Blocker: ${input.blocker.reason}`);
    if (input.blocker.dependency) lines.push(`Depends on: ${input.blocker.dependency}`);
    if (input.blocker.nextAction) lines.push(`Next action: ${input.blocker.nextAction}${input.blocker.nextActionOwner ? ` (${input.blocker.nextActionOwner})` : ''}`);
  }
  lines.push('', 'Raised from the Rock Review.');
  return { title, description: clip(lines.join('\n'), 2000) };
}

/** The source value the IDS queue records for an issue raised in a meeting of this type. */
export function issueSourceFor(meetingType: string | null | undefined): string {
  if (!meetingType) return 'meeting_ids';
  const type = meetingType.toLowerCase();
  if (type === 'l10' || type === 'level 10') return 'meeting_l10';
  if (type === 'quarterly') return 'meeting_quarterly';
  if (type === 'annual') return 'meeting_annual';
  return 'meeting_ids';
}

/** An issue is still live until it is solved or closed. */
export function isOpenIssue(status: string | null | undefined): boolean {
  const s = (status ?? '').toLowerCase();
  return s !== 'solved' && s !== 'closed';
}

/** The latest status change, as one sentence, so the room sees what moved since last time. */
export function lastStatusChange(
  events: readonly RockEvent[],
  nameOf: (userId: string | null) => string,
): { text: string; occurredAt: string } | null {
  for (const event of events) {
    if (event.action !== 'updated') continue;
    const before = event.before_data ?? {};
    const after = event.after_data ?? {};
    if (!('status' in after) || before.status === after.status) continue;
    const who = event.actor_user_id ? nameOf(event.actor_user_id) : 'Someone';
    const from = before.status ? getStatusConfig(String(before.status)).label.toLowerCase() : 'nothing';
    const to = getStatusConfig(String(after.status)).label.toLowerCase();
    return { text: `${who} moved it from ${from} to ${to}`, occurredAt: event.occurred_at };
  }
  return null;
}

export type DiscussionOutcome = 'confirmed' | 'changed' | 'raised';

export interface WrapUp {
  total: number;
  visited: number;
  raised: string[];
  changed: string[];
  confirmed: string[];
  /** Stuck or late Rocks that nobody raised an issue for and that have no open issue already. */
  unresolved: string[];
  unvisited: string[];
}

/** What happened across the deck, and the Rocks that look like they still need IDS. */
export function wrapUp(
  deck: readonly string[],
  outcomes: Readonly<Record<string, DiscussionOutcome[]>>,
  nodes: ReadonlyMap<string, RockCascadeNode>,
  openIssueRockIds: ReadonlySet<string>,
): WrapUp {
  const has = (id: string, outcome: DiscussionOutcome) => outcomes[id]?.includes(outcome) ?? false;
  const title = (id: string) => nodes.get(id)?.rock.title ?? 'A Rock';
  const visited = deck.filter(id => (outcomes[id]?.length ?? 0) > 0);
  const raised = deck.filter(id => has(id, 'raised'));
  return {
    total: deck.length,
    visited: visited.length,
    raised: raised.map(title),
    changed: deck.filter(id => has(id, 'changed') && !has(id, 'raised')).map(title),
    confirmed: deck.filter(id => has(id, 'confirmed') && !has(id, 'raised') && !has(id, 'changed')).map(title),
    unresolved: deck
      .filter(id => {
        const node = nodes.get(id);
        return !!node && issueSuggestion(node) === 'strong' && !has(id, 'raised') && !openIssueRockIds.has(id);
      })
      .map(title),
    unvisited: deck.filter(id => !visited.includes(id)).map(title),
  };
}
