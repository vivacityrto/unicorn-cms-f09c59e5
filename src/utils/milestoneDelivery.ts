import type { RockMilestoneStatus } from '@/types/eos';
import { todayLocalIso } from '@/utils/localDate';

/**
 * Relationship and progress between Company milestones and the Individual
 * milestones linked to them (eos_rock_milestone_links).
 *
 * Everything here is derived for display. A Company milestone's stored status is
 * still signed off by a person; "delivery" only reports how far the Individual
 * milestones that feed it have got.
 */

export interface DeliveryMilestone {
  id: string;
  rockId: string;
  title: string;
  status: RockMilestoneStatus;
  ownerId: string | null;
  dueDate: string | null;
}

export interface DeliveryRock {
  id: string;
  title: string;
  ownerId: string | null;
  level: string | null;
}

export interface DeliveryLink {
  company_milestone_id: string;
  individual_milestone_id: string;
}

export interface DeliveryData {
  milestones: ReadonlyMap<string, DeliveryMilestone>;
  rocks: ReadonlyMap<string, DeliveryRock>;
  links: readonly DeliveryLink[];
}

export interface Contributor {
  milestone: DeliveryMilestone;
  rock: DeliveryRock | undefined;
  /** The milestone's own owner, else its Rock's owner (milestones default to the Rock owner). */
  ownerId: string | null;
  overdue: boolean;
}

export interface DeliveryCounts {
  /** Active contributors: every linked milestone except deferred ones. */
  active: number;
  complete: number;
  inProgress: number;
  notStarted: number;
  blocked: number;
  offTrack: number;
  deferred: number;
  overdue: number;
}

/**
 * Where a Company milestone stands, from its contributors:
 * - `complete`: a person has signed it off.
 * - `deferred`: it was deferred.
 * - `uncovered`: nothing active feeds it, so nobody is delivering it.
 * - `ready_for_review`: every active contributor is complete. A person signs it off.
 * - `blocked` / `at_risk`: a contributor is blocked / off track.
 * - `in_progress` / `not_started`: otherwise, by whether any contributor has started.
 */
export type DeliveryState =
  | 'complete'
  | 'deferred'
  | 'uncovered'
  | 'ready_for_review'
  | 'blocked'
  | 'at_risk'
  | 'in_progress'
  | 'not_started';

export interface CompanyMilestoneDelivery {
  companyMilestoneId: string;
  contributors: Contributor[];
  counts: DeliveryCounts;
  /** Delivered share of active contributors, 0 to 100; null when there are none. */
  percent: number | null;
  state: DeliveryState;
}

const STATUS_RANK: Record<RockMilestoneStatus, number> = {
  blocked: 0,
  off_track: 1,
  in_progress: 2,
  not_started: 3,
  complete: 4,
  deferred: 5,
};

export function emptyDeliveryCounts(): DeliveryCounts {
  return { active: 0, complete: 0, inProgress: 0, notStarted: 0, blocked: 0, offTrack: 0, deferred: 0, overdue: 0 };
}

const todayIso = (now: Date) => todayLocalIso(now);

function isOverdue(milestone: DeliveryMilestone, now: Date): boolean {
  if (!milestone.dueDate) return false;
  if (milestone.status === 'complete' || milestone.status === 'deferred') return false;
  return milestone.dueDate.slice(0, 10) < todayIso(now);
}

/** Needs attention first (blocked, off track, in progress), then not started, then done. */
export function sortContributors(contributors: readonly Contributor[]): Contributor[] {
  return [...contributors].sort(
    (a, b) =>
      STATUS_RANK[a.milestone.status] - STATUS_RANK[b.milestone.status] ||
      a.milestone.title.localeCompare(b.milestone.title),
  );
}

export function companyMilestoneDelivery(
  companyMilestoneId: string,
  data: DeliveryData,
  now: Date = new Date(),
): CompanyMilestoneDelivery {
  const seen = new Set<string>();
  const contributors: Contributor[] = [];
  for (const link of data.links) {
    if (link.company_milestone_id !== companyMilestoneId) continue;
    if (seen.has(link.individual_milestone_id)) continue; // a duplicated link must not double count
    seen.add(link.individual_milestone_id);
    const milestone = data.milestones.get(link.individual_milestone_id);
    if (!milestone) continue;
    const rock = data.rocks.get(milestone.rockId);
    contributors.push({
      milestone,
      rock,
      ownerId: milestone.ownerId ?? rock?.ownerId ?? null,
      overdue: isOverdue(milestone, now),
    });
  }

  const counts = emptyDeliveryCounts();
  for (const { milestone, overdue } of contributors) {
    if (milestone.status === 'deferred') {
      counts.deferred += 1;
      continue;
    }
    counts.active += 1;
    if (overdue) counts.overdue += 1;
    if (milestone.status === 'complete') counts.complete += 1;
    else if (milestone.status === 'in_progress') counts.inProgress += 1;
    else if (milestone.status === 'blocked') counts.blocked += 1;
    else if (milestone.status === 'off_track') counts.offTrack += 1;
    else counts.notStarted += 1;
  }

  const company = data.milestones.get(companyMilestoneId);
  let state: DeliveryState;
  if (company?.status === 'complete') state = 'complete';
  else if (company?.status === 'deferred') state = 'deferred';
  else if (counts.active === 0) state = 'uncovered';
  else if (counts.complete === counts.active) state = 'ready_for_review';
  else if (counts.blocked > 0) state = 'blocked';
  else if (counts.offTrack > 0) state = 'at_risk';
  else if (counts.complete > 0 || counts.inProgress > 0) state = 'in_progress';
  else state = 'not_started';

  return {
    companyMilestoneId,
    contributors: sortContributors(contributors),
    counts,
    percent: counts.active > 0 ? Math.round((counts.complete / counts.active) * 100) : null,
    state,
  };
}

export interface SupportedCompanyMilestone {
  milestone: DeliveryMilestone;
  rock: DeliveryRock | undefined;
  delivery: CompanyMilestoneDelivery;
}

/** The Company milestones an Individual milestone feeds, each with its overall delivery. */
export function supportedCompanyMilestones(
  individualMilestoneId: string,
  data: DeliveryData,
  now: Date = new Date(),
): SupportedCompanyMilestone[] {
  const ids = new Set<string>();
  for (const link of data.links) {
    if (link.individual_milestone_id === individualMilestoneId) ids.add(link.company_milestone_id);
  }
  const result: SupportedCompanyMilestone[] = [];
  for (const id of ids) {
    const milestone = data.milestones.get(id);
    if (!milestone) continue;
    result.push({
      milestone,
      rock: data.rocks.get(milestone.rockId),
      delivery: companyMilestoneDelivery(id, data, now),
    });
  }
  return result.sort((a, b) => a.milestone.title.localeCompare(b.milestone.title));
}

export interface RockDeliverySummary {
  milestones: number;
  /** Signed off by a person. */
  signedOff: number;
  /** Fed by at least one active Individual milestone. */
  covered: number;
  uncovered: number;
  readyForReview: number;
  blocked: number;
  /** Individual milestones feeding this Rock's Company milestones (each counted once). */
  contributors: number;
  contributorsComplete: number;
  percent: number | null;
}

/** Roll-up across all of a Company Rock's milestones, counting each contributor once. */
export function rockDeliverySummary(
  companyMilestoneIds: readonly string[],
  data: DeliveryData,
  now: Date = new Date(),
): RockDeliverySummary {
  const summary: RockDeliverySummary = {
    milestones: companyMilestoneIds.length,
    signedOff: 0,
    covered: 0,
    uncovered: 0,
    readyForReview: 0,
    blocked: 0,
    contributors: 0,
    contributorsComplete: 0,
    percent: null,
  };
  const counted = new Set<string>();
  for (const id of companyMilestoneIds) {
    const delivery = companyMilestoneDelivery(id, data, now);
    if (delivery.state === 'complete') summary.signedOff += 1;
    if (delivery.state === 'ready_for_review') summary.readyForReview += 1;
    if (delivery.state === 'blocked') summary.blocked += 1;
    if (delivery.counts.active > 0) summary.covered += 1;
    else if (delivery.state !== 'complete' && delivery.state !== 'deferred') summary.uncovered += 1;
    for (const { milestone } of delivery.contributors) {
      if (milestone.status === 'deferred' || counted.has(milestone.id)) continue;
      counted.add(milestone.id);
      summary.contributors += 1;
      if (milestone.status === 'complete') summary.contributorsComplete += 1;
    }
  }
  summary.percent = summary.contributors > 0
    ? Math.round((summary.contributorsComplete / summary.contributors) * 100)
    : null;
  return summary;
}

export interface RockDeliveryShare {
  rockId: string;
  rockTitle: string;
  ownerId: string | null;
  /** Active milestones this Rock contributes to the Company milestones (each counted once). */
  total: number;
  complete: number;
  inProgress: number;
  blocked: number;
  offTrack: number;
  overdue: number;
}

/**
 * Who is delivering a Company Rock: its linked Individual milestones grouped by
 * the Rock they belong to. A milestone feeding several Company milestones is
 * one piece of work and is counted once.
 */
export function deliveryByRock(
  companyMilestoneIds: readonly string[],
  data: DeliveryData,
  now: Date = new Date(),
): RockDeliveryShare[] {
  const counted = new Set<string>();
  const shares = new Map<string, RockDeliveryShare>();
  for (const id of companyMilestoneIds) {
    for (const { milestone, rock, overdue } of companyMilestoneDelivery(id, data, now).contributors) {
      if (milestone.status === 'deferred' || counted.has(milestone.id)) continue;
      counted.add(milestone.id);
      const share = shares.get(milestone.rockId) ?? {
        rockId: milestone.rockId,
        rockTitle: rock?.title ?? 'Unknown Rock',
        ownerId: rock?.ownerId ?? null,
        total: 0,
        complete: 0,
        inProgress: 0,
        blocked: 0,
        offTrack: 0,
        overdue: 0,
      };
      share.total += 1;
      if (milestone.status === 'complete') share.complete += 1;
      else if (milestone.status === 'in_progress') share.inProgress += 1;
      else if (milestone.status === 'blocked') share.blocked += 1;
      else if (milestone.status === 'off_track') share.offTrack += 1;
      if (overdue) share.overdue += 1;
      shares.set(milestone.rockId, share);
    }
  }
  return [...shares.values()].sort((a, b) => b.total - a.total || a.rockTitle.localeCompare(b.rockTitle));
}

/**
 * Company milestones whose delivery needs discussing: a contributor is blocked or
 * off track, or nothing is delivering them. Signed-off and deferred ones never do.
 */
export function deliveryAttentionIds(
  companyMilestoneIds: readonly string[],
  data: DeliveryData,
  now: Date = new Date(),
): Set<string> {
  const ids = new Set<string>();
  for (const id of companyMilestoneIds) {
    const { state } = companyMilestoneDelivery(id, data, now);
    if (state === 'blocked' || state === 'at_risk' || state === 'uncovered') ids.add(id);
  }
  return ids;
}

export const DELIVERY_STATE_LABEL: Record<DeliveryState, string> = {
  complete: 'Signed off',
  deferred: 'Deferred',
  uncovered: 'Nothing delivering this',
  ready_for_review: 'Ready for sign-off',
  blocked: 'Blocked',
  at_risk: 'At risk',
  in_progress: 'In progress',
  not_started: 'Not started',
};

/** Builds lookup maps from fetched rows. Rows missing a field are skipped. */
export function buildDeliveryData(input: {
  milestones: ReadonlyArray<{
    id: string;
    rock_id: string;
    title: string;
    status: string;
    owner_id: string | null;
    due_date: string | null;
  }>;
  rocks: ReadonlyArray<{ id: string; title: string; owner_id: string | null; rock_level: string | null }>;
  links: readonly DeliveryLink[];
}): DeliveryData {
  const known: RockMilestoneStatus[] = ['not_started', 'in_progress', 'blocked', 'complete', 'off_track', 'deferred'];
  const milestones = new Map<string, DeliveryMilestone>();
  for (const m of input.milestones) {
    milestones.set(m.id, {
      id: m.id,
      rockId: m.rock_id,
      title: m.title,
      status: (known as string[]).includes(m.status) ? (m.status as RockMilestoneStatus) : 'not_started',
      ownerId: m.owner_id,
      dueDate: m.due_date,
    });
  }
  const rocks = new Map<string, DeliveryRock>();
  for (const r of input.rocks) {
    rocks.set(r.id, { id: r.id, title: r.title, ownerId: r.owner_id, level: r.rock_level });
  }
  return { milestones, rocks, links: input.links };
}
