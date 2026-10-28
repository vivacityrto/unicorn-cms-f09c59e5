import type { CarryoverMilestoneRow, CarryoverRow } from '@/utils/rockCarryover';

/**
 * How Individual Rocks deliver a Company Rock, built only from the stored
 * hierarchy (parent_rock_id) and the stored milestone links. Nothing is matched
 * by title or read from the legacy JSON, so what is shown is what the database
 * says is connected.
 */

export interface ContributionRock {
  id: string;
  title: string;
  status: string | null;
  owner_id: string | null;
  due_date: string | null;
  quarter_year: number;
  quarter_number: number;
  rock_level: string | null;
  parent_rock_id: string | null;
}

export interface ContributionMilestone {
  id: string;
  rock_id: string;
  title: string;
  status: string;
  owner_id: string | null;
  due_date: string | null;
}

export interface ContributionLink {
  company_milestone_id: string;
  individual_milestone_id: string;
}

export interface ContributionBlocker {
  id: string;
  rock_id: string | null;
  milestone_id: string | null;
  reason: string;
  review_date: string | null;
}

export interface ContributionCarry {
  carryover: CarryoverRow;
  milestones: CarryoverMilestoneRow[];
}

export interface ContributionInput {
  companyRock: ContributionRock;
  companyMilestones: ContributionMilestone[];
  /** Child Rocks of the Company Rock, and Individual Rocks under its Team Rocks. Only Individual-level ones are shown. */
  childRocks: ContributionRock[];
  /** Milestones of the child Rocks. */
  childMilestones: ContributionMilestone[];
  links: ContributionLink[];
  /** Open blockers on the child Rocks or their milestones. */
  blockers: ContributionBlocker[];
  /** Carryovers whose source is the Company Rock or one of its Individual Rocks. */
  carryovers: ContributionCarry[];
  /** Rocks named by those carryovers' destinations, for titles and status. */
  destinationRocks: ContributionRock[];
  destinationMilestones: ContributionMilestone[];
}

export interface CarriedMilestoneView {
  sourceTitle: string;
  destination: ContributionMilestone | null;
}

export interface CarriedTarget {
  carryoverId: string;
  rock: ContributionRock | null;
  reason: string;
  milestones: CarriedMilestoneView[];
}

export interface IndividualMilestoneView {
  milestone: ContributionMilestone;
  /** Company milestones this one supports, from the stored links. Empty means unmapped. */
  supports: ContributionMilestone[];
  blocker: ContributionBlocker | null;
}

export interface IndividualContribution {
  rock: ContributionRock;
  /** The Team Rock it serves the Company Rock through, if it does not serve it directly. */
  viaTeam: string | null;
  milestones: IndividualMilestoneView[];
  progress: { complete: number; total: number };
  blocker: ContributionBlocker | null;
  blockedMilestones: number;
  unmappedCount: number;
  carriedTo: CarriedTarget[];
}

export interface CompanyMilestoneCoverage {
  milestone: ContributionMilestone;
  contributors: Array<{ rock: ContributionRock; milestone: ContributionMilestone }>;
}

export interface ContributionModel {
  individuals: IndividualContribution[];
  coverage: CompanyMilestoneCoverage[];
  /** The Company Rock itself carried forward, if it has been. */
  companyCarriedTo: CarriedTarget[];
  summary: {
    individualCount: number;
    blockedRocks: number;
    blockedMilestones: number;
    unmappedMilestones: number;
    uncoveredCompanyMilestones: number;
  };
}

const progressOf = (milestones: ContributionMilestone[]) => {
  const counted = milestones.filter(m => m.status !== 'deferred');
  return { complete: counted.filter(m => m.status === 'complete').length, total: counted.length };
};

export function buildContribution(input: ContributionInput): ContributionModel {
  const companyById = new Map(input.companyMilestones.map(m => [m.id, m]));
  const milestoneById = new Map(input.childMilestones.map(m => [m.id, m]));
  const destRockById = new Map(input.destinationRocks.map(r => [r.id, r]));
  const destMilestoneById = new Map(input.destinationMilestones.map(m => [m.id, m]));

  // A link only counts when both ends are what this view shows: a Company milestone of
  // this Rock and a milestone of one of its Individual Rocks.
  const supportsByIndividual = new Map<string, ContributionMilestone[]>();
  const contributorsByCompany = new Map<string, string[]>();
  for (const link of input.links) {
    const company = companyById.get(link.company_milestone_id);
    const individual = milestoneById.get(link.individual_milestone_id);
    if (!company || !individual) continue;
    supportsByIndividual.set(individual.id, [...(supportsByIndividual.get(individual.id) ?? []), company]);
    contributorsByCompany.set(company.id, [...(contributorsByCompany.get(company.id) ?? []), individual.id]);
  }

  const blockerForRock = (rockId: string) => input.blockers.find(b => b.rock_id === rockId) ?? null;
  const blockerForMilestone = (milestoneId: string) => input.blockers.find(b => b.milestone_id === milestoneId) ?? null;

  const carriedFrom = (sourceRockId: string): CarriedTarget[] =>
    input.carryovers
      .filter(c => c.carryover.source_rock_id === sourceRockId)
      .map(c => ({
        carryoverId: c.carryover.id,
        rock: destRockById.get(c.carryover.destination_rock_id) ?? null,
        reason: c.carryover.reason,
        milestones: c.milestones.map(m => ({
          sourceTitle: m.source_title,
          destination: m.destination_milestone_id ? destMilestoneById.get(m.destination_milestone_id) ?? null : null,
        })),
      }));

  const individualRocks = input.childRocks
    .filter(r => r.rock_level === 'individual')
    .sort((a, b) => a.title.localeCompare(b.title));

  const individuals: IndividualContribution[] = individualRocks.map(rock => {
    const own = input.childMilestones.filter(m => m.rock_id === rock.id);
    const views: IndividualMilestoneView[] = own.map(m => ({
      milestone: m,
      supports: supportsByIndividual.get(m.id) ?? [],
      blocker: blockerForMilestone(m.id),
    }));
    const parent = rock.parent_rock_id ? input.childRocks.find(r => r.id === rock.parent_rock_id) : undefined;
    return {
      rock,
      viaTeam: parent && parent.rock_level === 'team' ? parent.title : null,
      milestones: views,
      progress: progressOf(own),
      blocker: blockerForRock(rock.id),
      blockedMilestones: own.filter(m => m.status === 'blocked').length,
      // Finished work that supports nothing is not a gap worth flagging.
      unmappedCount: views.filter(v => v.supports.length === 0 && v.milestone.status !== 'complete' && v.milestone.status !== 'deferred').length,
      carriedTo: carriedFrom(rock.id),
    };
  });

  const individualById = new Map(individualRocks.map(r => [r.id, r]));
  const coverage: CompanyMilestoneCoverage[] = input.companyMilestones.map(milestone => ({
    milestone,
    contributors: (contributorsByCompany.get(milestone.id) ?? [])
      .map(id => milestoneById.get(id))
      .filter((m): m is ContributionMilestone => !!m && individualById.has(m.rock_id))
      .map(m => ({ rock: individualById.get(m.rock_id)!, milestone: m })),
  }));

  return {
    individuals,
    coverage,
    companyCarriedTo: carriedFrom(input.companyRock.id),
    summary: {
      individualCount: individuals.length,
      blockedRocks: individuals.filter(i => i.blocker).length,
      blockedMilestones: individuals.reduce((n, i) => n + i.blockedMilestones, 0),
      unmappedMilestones: individuals.reduce((n, i) => n + i.unmappedCount, 0),
      // A completed or deferred Company milestone does not need further support.
      uncoveredCompanyMilestones: coverage.filter(c => c.contributors.length === 0 && c.milestone.status !== 'complete' && c.milestone.status !== 'deferred').length,
    },
  };
}

/** The collapsed line, kept short so a card stays scannable. */
export function contributionSummaryText(summary: ContributionModel['summary']): string {
  const parts = [summary.individualCount === 1 ? '1 Individual Rock' : `${summary.individualCount} Individual Rocks`];
  const blocked = summary.blockedRocks + summary.blockedMilestones;
  if (blocked > 0) parts.push(`${blocked} blocked`);
  if (summary.unmappedMilestones > 0) parts.push(`${summary.unmappedMilestones} unmapped`);
  if (summary.uncoveredCompanyMilestones > 0) parts.push(`${summary.uncoveredCompanyMilestones} with no support`);
  return parts.join(' · ');
}
