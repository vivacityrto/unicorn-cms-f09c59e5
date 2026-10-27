import { describe, expect, it } from 'vitest';
import {
  buildDeliveryData,
  companyMilestoneDelivery,
  rockDeliverySummary,
  supportedCompanyMilestones,
  type DeliveryData,
} from '@/utils/milestoneDelivery';

const NOW = new Date('2026-11-10T00:00:00Z');

const ms = (id: string, rock: string, status: string, extra: Record<string, unknown> = {}) => ({
  id, rock_id: rock, title: `Milestone ${id}`, status, owner_id: null as string | null, due_date: null as string | null, ...extra,
});

const rocks = [
  { id: 'company', title: 'Company Rock', owner_id: 'u-carl', rock_level: 'company' },
  { id: 'khian', title: 'Khian Rock', owner_id: 'u-khian', rock_level: 'individual' },
  { id: 'rj', title: 'RJ Rock', owner_id: 'u-rj', rock_level: 'individual' },
];

const build = (milestones: ReturnType<typeof ms>[], pairs: Array<[string, string]>): DeliveryData =>
  buildDeliveryData({
    milestones,
    rocks,
    links: pairs.map(([company_milestone_id, individual_milestone_id]) => ({ company_milestone_id, individual_milestone_id })),
  });

describe('companyMilestoneDelivery', () => {
  it('counts contributors by status and reports the delivered share', () => {
    const data = build(
      [ms('C1', 'company', 'not_started'), ms('a', 'khian', 'complete'), ms('b', 'khian', 'in_progress'), ms('c', 'rj', 'not_started')],
      [['C1', 'a'], ['C1', 'b'], ['C1', 'c']],
    );
    const d = companyMilestoneDelivery('C1', data, NOW);

    expect(d.counts).toMatchObject({ active: 3, complete: 1, inProgress: 1, notStarted: 1, blocked: 0, deferred: 0 });
    expect(d.percent).toBe(33);
    expect(d.state).toBe('in_progress');
    expect(d.contributors).toHaveLength(3);
  });

  it('excludes deferred contributors from the denominator but still lists them', () => {
    const data = build(
      [ms('C1', 'company', 'not_started'), ms('a', 'khian', 'complete'), ms('b', 'rj', 'deferred')],
      [['C1', 'a'], ['C1', 'b']],
    );
    const d = companyMilestoneDelivery('C1', data, NOW);

    expect(d.counts).toMatchObject({ active: 1, complete: 1, deferred: 1 });
    expect(d.percent).toBe(100);
    expect(d.state).toBe('ready_for_review');
    expect(d.contributors).toHaveLength(2);
  });

  it('is ready for sign-off, never complete, when every active contributor is complete', () => {
    const data = build([ms('C1', 'company', 'in_progress'), ms('a', 'khian', 'complete'), ms('b', 'rj', 'complete')], [['C1', 'a'], ['C1', 'b']]);
    expect(companyMilestoneDelivery('C1', data, NOW).state).toBe('ready_for_review');
  });

  it('reports signed off from the Company milestone itself, whatever its contributors say', () => {
    const data = build([ms('C1', 'company', 'complete'), ms('a', 'khian', 'not_started')], [['C1', 'a']]);
    expect(companyMilestoneDelivery('C1', data, NOW).state).toBe('complete');
  });

  it('reports deferred from the Company milestone itself', () => {
    const data = build([ms('C1', 'company', 'deferred'), ms('a', 'khian', 'in_progress')], [['C1', 'a']]);
    expect(companyMilestoneDelivery('C1', data, NOW).state).toBe('deferred');
  });

  it('flags a Company milestone nothing is delivering', () => {
    const none = build([ms('C1', 'company', 'not_started')], []);
    expect(companyMilestoneDelivery('C1', none, NOW)).toMatchObject({ state: 'uncovered', percent: null });

    const onlyDeferred = build([ms('C1', 'company', 'not_started'), ms('a', 'khian', 'deferred')], [['C1', 'a']]);
    expect(companyMilestoneDelivery('C1', onlyDeferred, NOW).state).toBe('uncovered');
  });

  it('puts blocked above at risk above in progress', () => {
    const base = [ms('C1', 'company', 'not_started')];
    const blocked = build([...base, ms('a', 'khian', 'blocked'), ms('b', 'rj', 'off_track'), ms('c', 'rj', 'in_progress')], [['C1', 'a'], ['C1', 'b'], ['C1', 'c']]);
    expect(companyMilestoneDelivery('C1', blocked, NOW).state).toBe('blocked');

    const atRisk = build([...base, ms('b', 'rj', 'off_track'), ms('c', 'rj', 'in_progress')], [['C1', 'b'], ['C1', 'c']]);
    expect(companyMilestoneDelivery('C1', atRisk, NOW).state).toBe('at_risk');

    const started = build([...base, ms('c', 'rj', 'in_progress'), ms('d', 'rj', 'not_started')], [['C1', 'c'], ['C1', 'd']]);
    expect(companyMilestoneDelivery('C1', started, NOW).state).toBe('in_progress');

    const idle = build([...base, ms('d', 'rj', 'not_started')], [['C1', 'd']]);
    expect(companyMilestoneDelivery('C1', idle, NOW).state).toBe('not_started');
  });

  it('counts a duplicated link once and ignores links to milestones it has no row for', () => {
    const data = build([ms('C1', 'company', 'not_started'), ms('a', 'khian', 'complete')], [['C1', 'a'], ['C1', 'a'], ['C1', 'missing']]);
    const d = companyMilestoneDelivery('C1', data, NOW);

    expect(d.contributors).toHaveLength(1);
    expect(d.counts.active).toBe(1);
  });

  it('flags overdue active contributors only', () => {
    const data = build(
      [
        ms('C1', 'company', 'not_started'),
        ms('late', 'khian', 'in_progress', { due_date: '2026-11-01' }),
        ms('doneLate', 'khian', 'complete', { due_date: '2026-11-01' }),
        ms('deferredLate', 'rj', 'deferred', { due_date: '2026-11-01' }),
        ms('future', 'rj', 'not_started', { due_date: '2026-12-01' }),
      ],
      [['C1', 'late'], ['C1', 'doneLate'], ['C1', 'deferredLate'], ['C1', 'future']],
    );
    const d = companyMilestoneDelivery('C1', data, NOW);

    expect(d.counts.overdue).toBe(1);
    expect(d.contributors.find(c => c.milestone.id === 'late')?.overdue).toBe(true);
    expect(d.contributors.find(c => c.milestone.id === 'doneLate')?.overdue).toBe(false);
  });

  it("uses the milestone's own owner, else its Rock's owner", () => {
    const data = build(
      [ms('C1', 'company', 'not_started'), ms('a', 'khian', 'not_started'), ms('b', 'rj', 'not_started', { owner_id: 'u-special' })],
      [['C1', 'a'], ['C1', 'b']],
    );
    const owners = Object.fromEntries(companyMilestoneDelivery('C1', data, NOW).contributors.map(c => [c.milestone.id, c.ownerId]));

    expect(owners).toEqual({ a: 'u-khian', b: 'u-special' });
  });

  it('lists contributors needing attention first, then by title', () => {
    const data = build(
      [ms('C1', 'company', 'not_started'), ms('z', 'khian', 'complete'), ms('a', 'khian', 'not_started'), ms('m', 'rj', 'blocked'), ms('b', 'rj', 'in_progress')],
      [['C1', 'z'], ['C1', 'a'], ['C1', 'm'], ['C1', 'b']],
    );
    expect(companyMilestoneDelivery('C1', data, NOW).contributors.map(c => c.milestone.id)).toEqual(['m', 'b', 'a', 'z']);
  });

  it('treats an unknown status as not started', () => {
    const data = build([ms('C1', 'company', 'not_started'), ms('a', 'khian', 'mystery')], [['C1', 'a']]);
    expect(companyMilestoneDelivery('C1', data, NOW).counts.notStarted).toBe(1);
  });
});

describe('supportedCompanyMilestones', () => {
  it('returns each Company milestone an Individual milestone feeds, with that milestone’s overall delivery', () => {
    const data = build(
      [ms('C1', 'company', 'not_started'), ms('C2', 'company', 'complete'), ms('a', 'khian', 'complete'), ms('b', 'rj', 'not_started')],
      [['C1', 'a'], ['C1', 'b'], ['C2', 'a']],
    );
    const supported = supportedCompanyMilestones('a', data, NOW);

    expect(supported.map(s => s.milestone.id)).toEqual(['C1', 'C2']);
    expect(supported[0].delivery.counts).toMatchObject({ active: 2, complete: 1 });
    expect(supported[0].rock?.title).toBe('Company Rock');
    expect(supported[1].delivery.state).toBe('complete');
  });

  it('returns nothing for an unlinked milestone or a link to a missing Company milestone', () => {
    const data = build([ms('a', 'khian', 'not_started')], [['gone', 'a']]);
    expect(supportedCompanyMilestones('a', data, NOW)).toEqual([]);
    expect(supportedCompanyMilestones('nobody', data, NOW)).toEqual([]);
  });
});

describe('rockDeliverySummary', () => {
  it('rolls delivery up across Company milestones, counting a shared contributor once', () => {
    const data = build(
      [
        ms('C1', 'company', 'complete'),
        ms('C2', 'company', 'not_started'),
        ms('C3', 'company', 'not_started'),
        ms('C4', 'company', 'not_started'),
        ms('a', 'khian', 'complete'),
        ms('b', 'rj', 'blocked'),
        ms('c', 'rj', 'complete'),
      ],
      [['C1', 'a'], ['C2', 'a'], ['C2', 'b'], ['C3', 'c']],
    );
    const s = rockDeliverySummary(['C1', 'C2', 'C3', 'C4'], data, NOW);

    expect(s).toMatchObject({
      milestones: 4,
      signedOff: 1,
      covered: 3,
      uncovered: 1,
      readyForReview: 1, // C3: its only contributor is complete
      blocked: 1, // C2
      contributors: 3, // a, b, c: 'a' feeds two milestones but is one piece of work
      contributorsComplete: 2,
      percent: 67,
    });
  });

  it('has no percent and no contributors when nothing is linked', () => {
    const data = build([ms('C1', 'company', 'not_started')], []);
    const s = rockDeliverySummary(['C1'], data, NOW);

    expect(s).toMatchObject({ milestones: 1, covered: 0, uncovered: 1, contributors: 0, percent: null });
  });

  it('does not count a signed-off or deferred milestone as uncovered', () => {
    const data = build([ms('C1', 'company', 'complete'), ms('C2', 'company', 'deferred')], []);
    expect(rockDeliverySummary(['C1', 'C2'], data, NOW).uncovered).toBe(0);
  });
});
