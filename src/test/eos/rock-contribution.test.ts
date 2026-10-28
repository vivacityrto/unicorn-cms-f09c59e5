import { describe, expect, it } from 'vitest';
import {
  buildContribution,
  contributionSummaryText,
  type ContributionInput,
  type ContributionMilestone,
  type ContributionRock,
} from '@/utils/rockContribution';

const rock = (id: string, over: Partial<ContributionRock> = {}): ContributionRock => ({
  id,
  title: id,
  status: 'on_track',
  owner_id: null,
  due_date: '2026-12-31',
  quarter_year: 2026,
  quarter_number: 4,
  rock_level: 'individual',
  parent_rock_id: 'co',
  ...over,
});
const ms = (id: string, rockId: string, status = 'in_progress', title = id): ContributionMilestone => ({
  id, rock_id: rockId, title, status, owner_id: null, due_date: null,
});

const base = (over: Partial<ContributionInput> = {}): ContributionInput => ({
  companyRock: rock('co', { rock_level: 'company', parent_rock_id: null }),
  companyMilestones: [ms('c1', 'co', 'in_progress', 'M1 - Launch'), ms('c2', 'co', 'not_started', 'M2 - Train')],
  childRocks: [rock('i1'), rock('i2')],
  childMilestones: [ms('i1a', 'i1'), ms('i1b', 'i1', 'complete'), ms('i2a', 'i2', 'blocked'), ms('i2b', 'i2', 'not_started')],
  links: [
    { company_milestone_id: 'c1', individual_milestone_id: 'i1a' },
    { company_milestone_id: 'c1', individual_milestone_id: 'i2a' },
  ],
  blockers: [],
  carryovers: [],
  destinationRocks: [],
  destinationMilestones: [],
  ...over,
});

describe('buildContribution', () => {
  it('maps each Individual milestone to the Company milestones it supports, from the stored links', () => {
    const model = buildContribution(base());
    const i1 = model.individuals.find(i => i.rock.id === 'i1')!;
    expect(i1.milestones.find(m => m.milestone.id === 'i1a')!.supports.map(c => c.id)).toEqual(['c1']);
    expect(model.coverage.find(c => c.milestone.id === 'c1')!.contributors.map(x => x.milestone.id)).toEqual(['i1a', 'i2a']);
  });

  it('does not match anything by title', () => {
    const model = buildContribution(base({
      companyMilestones: [ms('c1', 'co', 'in_progress', 'Launch')],
      childMilestones: [ms('i1a', 'i1', 'in_progress', 'Launch')],
      links: [],
    }));
    expect(model.individuals[0].milestones[0].supports).toEqual([]);
    expect(model.coverage[0].contributors).toEqual([]);
  });

  it('flags unmapped Individual work, but not finished or deferred work', () => {
    const model = buildContribution(base());
    expect(model.individuals.find(i => i.rock.id === 'i1')!.unmappedCount).toBe(0); // i1b is complete
    expect(model.individuals.find(i => i.rock.id === 'i2')!.unmappedCount).toBe(1); // i2b is not started and unlinked
    const deferred = buildContribution(base({ childMilestones: [ms('i1a', 'i1', 'deferred')], links: [] }));
    expect(deferred.individuals[0].unmappedCount).toBe(0);
  });

  it('flags Company milestones with no Individual work behind them', () => {
    const model = buildContribution(base());
    expect(model.coverage.find(c => c.milestone.id === 'c2')!.contributors).toEqual([]);
    expect(model.summary.uncoveredCompanyMilestones).toBe(1);
    const done = buildContribution(base({ companyMilestones: [ms('c1', 'co'), ms('c2', 'co', 'complete')] }));
    expect(done.summary.uncoveredCompanyMilestones).toBe(0);
  });

  it('ignores links that point outside this Company Rock and its Individual Rocks', () => {
    const model = buildContribution(base({
      links: [
        { company_milestone_id: 'c1', individual_milestone_id: 'elsewhere' },
        { company_milestone_id: 'other-company-milestone', individual_milestone_id: 'i1a' },
      ],
    }));
    expect(model.individuals.flatMap(i => i.milestones).every(m => m.supports.length === 0)).toBe(true);
  });

  it('shows only Individual-level children, with progress that leaves out deferred work', () => {
    const model = buildContribution(base({
      childRocks: [rock('i1'), rock('t1', { rock_level: 'team' })],
      childMilestones: [ms('i1a', 'i1', 'complete'), ms('i1b', 'i1', 'in_progress'), ms('i1c', 'i1', 'deferred')],
      links: [],
    }));
    expect(model.individuals.map(i => i.rock.id)).toEqual(['i1']);
    expect(model.individuals[0].progress).toEqual({ complete: 1, total: 2 });
  });

  it('carries open blockers and counts blocked work for the collapsed line', () => {
    const model = buildContribution(base({
      blockers: [
        { id: 'b1', rock_id: 'i2', milestone_id: null, reason: 'Vendor', review_date: null },
        { id: 'b2', rock_id: null, milestone_id: 'i2a', reason: 'Access', review_date: null },
      ],
    }));
    const i2 = model.individuals.find(i => i.rock.id === 'i2')!;
    expect(i2.blocker?.reason).toBe('Vendor');
    expect(i2.milestones.find(m => m.milestone.id === 'i2a')!.blocker?.reason).toBe('Access');
    expect(i2.blockedMilestones).toBe(1);
    expect(model.summary).toMatchObject({ blockedRocks: 1, blockedMilestones: 1 });
    expect(contributionSummaryText(model.summary)).toBe('2 Individual Rocks · 2 blocked · 1 unmapped · 1 with no support');
  });

  it('shows where an Individual Rock, and the Company Rock, were carried forward', () => {
    const model = buildContribution(base({
      carryovers: [
        {
          carryover: { id: 'k1', tenant_id: 1, source_rock_id: 'i1', destination_rock_id: 'i1-q1', reason: 'Delay', carried_by: null, carried_at: '2026-12-20T00:00:00Z' },
          milestones: [{ id: 'p1', tenant_id: 1, carryover_id: 'k1', source_milestone_id: 'i1a', destination_milestone_id: 'i1a-q1', source_title: 'i1a', source_status: 'in_progress', source_due_date: null, new_due_date: null, created_at: '' }],
        },
        {
          carryover: { id: 'k2', tenant_id: 1, source_rock_id: 'co', destination_rock_id: 'co-q1', reason: 'Delay', carried_by: null, carried_at: '2026-12-20T00:00:00Z' },
          milestones: [],
        },
      ],
      destinationRocks: [rock('i1-q1', { quarter_year: 2027, quarter_number: 1 }), rock('co-q1', { quarter_year: 2027, quarter_number: 1, rock_level: 'company' })],
      destinationMilestones: [ms('i1a-q1', 'i1-q1', 'not_started')],
    }));
    const i1 = model.individuals.find(i => i.rock.id === 'i1')!;
    expect(i1.carriedTo[0].rock?.id).toBe('i1-q1');
    expect(i1.carriedTo[0].milestones[0].destination?.id).toBe('i1a-q1');
    expect(model.individuals.find(i => i.rock.id === 'i2')!.carriedTo).toEqual([]);
    expect(model.companyCarriedTo[0].rock?.id).toBe('co-q1');
  });

  it('copes with a Company Rock that has no Individual Rocks', () => {
    const model = buildContribution(base({ childRocks: [], childMilestones: [], links: [] }));
    expect(model.individuals).toEqual([]);
    expect(contributionSummaryText(model.summary)).toMatch(/^0 Individual Rocks/);
  });
});
