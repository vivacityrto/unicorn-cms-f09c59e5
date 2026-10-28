import { describe, expect, it } from 'vitest';
import { buildMeetingRocksCascade } from '@/utils/meetingRocksCascade';
import {
  discussionDeck,
  discussionReasons,
  draftIssue,
  facilitatorCue,
  isOpenIssue,
  issueSourceFor,
  issueSuggestion,
  lastStatusChange,
  nodesById,
  wrapUp,
} from '@/utils/rockDiscussion';
import type { RockEvent } from '@/utils/rockLifecycle';
import type { RockWithHierarchy } from '@/types/eos';

const NOW = new Date('2026-10-28T00:00:00Z');
const rock = (id: string, title: string, status: string, over: Partial<RockWithHierarchy> = {}): RockWithHierarchy =>
  ({
    id, tenant_id: 6372, title, status, quarter_year: 2026, quarter_number: 4, due_date: '2026-12-31', owner_id: 'u1',
    rock_level: 'company', parent_rock_id: null, created_at: '', updated_at: '', ...over,
  }) as RockWithHierarchy;
const breakdown = (over: Partial<NonNullable<RockWithHierarchy['milestoneBreakdown']>> = {}) => ({ total: 4, complete: 1, inProgress: 1, blocked: 0, offTrack: 0, notStarted: 2, overdue: 0, ...over });

const rocks = [
  rock('c1', 'Launch portal', 'on_track'),
  rock('i1', 'Build onboarding', 'on_track', { rock_level: 'individual', parent_rock_id: 'c1' }),
  rock('i2', 'Vendor access', 'blocked', { rock_level: 'individual', parent_rock_id: 'c1' }),
  rock('c2', 'Hire two people', 'off_track', { owner_id: 'u2' }),
  rock('c3', 'Done already', 'complete'),
  rock('c4', 'Tidy the office', 'on_track', { owner_id: 'u3' }),
];
const owners = { u1: 'Ana', u2: 'Ben', u3: 'Cy' };
const cascade = (scope: string[]) => buildMeetingRocksCascade(rocks, scope, owners, NOW);

describe('discussionDeck', () => {
  it('walks Company Rocks in cascade order and leaves out complete ones', () => {
    expect(discussionDeck(cascade(['company']).roots)).toEqual(['c1', 'c2', 'c4']);
  });

  it('includes a level only when the meeting reviews that level, in cascade order', () => {
    expect(discussionDeck(cascade(['company', 'individual']).roots)).toEqual(['c1', 'i1', 'i2', 'c2', 'c4']);
  });

  it('can keep only Rocks that need the room, including a Company Rock whose Individual Rock is stuck', () => {
    expect(discussionDeck(cascade(['company']).roots, { attentionOnly: true })).toEqual(['c1', 'c2']);
  });

  it('is empty when nothing is under review', () => {
    expect(discussionDeck([])).toEqual([]);
  });

  it('finds any node by id so a slide can be re-read after a change', () => {
    const map = nodesById(cascade(['company']).roots);
    expect(map.get('i2')?.rock.title).toBe('Vendor access');
    expect(map.get('c3')).toBeUndefined();
  });
});

describe('discussionReasons', () => {
  const node = (id: string, scope = ['company']) => nodesById(cascade(scope).roots).get(id)!;

  it('says plainly why a Rock needs the room, with words not just colour', () => {
    expect(discussionReasons(node('c2')).map(r => r.text)).toEqual(['Off track']);
    expect(discussionReasons(node('c1')).map(r => r.text)).toEqual(['1 Rock below it is blocked']);
    expect(discussionReasons(node('i2', ['company', 'individual'])).map(r => r.text)).toEqual(['Blocked']);
  });

  it('reports milestone problems and ownerless Rocks', () => {
    const flagged = buildMeetingRocksCascade(
      [rock('c9', 'Ownerless', 'on_track', { owner_id: null, milestoneBreakdown: breakdown({ blocked: 2, overdue: 1 }) })],
      ['company'], {}, NOW,
    ).roots[0];
    expect(discussionReasons(flagged).map(r => r.text)).toEqual(['2 milestones are blocked', '1 milestone is overdue', 'Nobody owns it']);
  });

  it('has nothing to say about a clean on-track Rock', () => {
    expect(discussionReasons(node('c4'))).toEqual([]);
  });
});

describe('facilitatorCue and issueSuggestion', () => {
  const node = (id: string) => nodesById(cascade(['company', 'individual']).roots).get(id)!;

  it('asks one short question suited to the status, and never to solve it in the segment', () => {
    expect(facilitatorCue(node('c4'))).toEqual({ headline: 'On track', question: 'Confirm it is on track and move on.' });
    expect(facilitatorCue(node('c2')).question).toMatch(/Do not solve it here.*IDS/);
    expect(facilitatorCue(node('i2')).headline).toBe('Blocked');
  });

  it('challenges an on-track Rock that has flags', () => {
    const flagged = buildMeetingRocksCascade([rock('c9', 'X', 'on_track', { milestoneBreakdown: breakdown({ overdue: 2 }) })], ['company'], {}, NOW).roots[0];
    const cue = facilitatorCue(flagged);
    expect(cue.headline).toBe('On track, with flags');
    expect(cue.question).toContain('2 milestones are overdue');
  });

  it('suggests IDS strongly for stuck or late work, softly for a flag, and not at all for a clean Rock', () => {
    expect(issueSuggestion(node('c2'))).toBe('strong');
    expect(issueSuggestion(node('i2'))).toBe('strong');
    expect(issueSuggestion(node('c1'))).toBe('strong'); // a Rock below it is blocked
    expect(issueSuggestion(node('c4'))).toBe('none');
    const atRisk = buildMeetingRocksCascade([rock('c9', 'X', 'at_risk')], ['company'], {}, NOW).roots[0];
    expect(issueSuggestion(atRisk)).toBe('consider');
  });
});

describe('draftIssue', () => {
  it('titles it with what and why, and carries the facts so nobody re-explains them in IDS', () => {
    const draft = draftIssue({
      rockTitle: 'Vendor access', status: 'blocked', ownerName: 'Ana', dueLabel: '15 Dec 2026', quarterLabel: 'Q4 2026',
      milestonesDone: { complete: 1, total: 4 }, blockedMilestoneTitles: ['Get sandbox access'],
      blocker: { reason: 'Vendor has not issued credentials', nextAction: 'Escalate', nextActionOwner: 'Ben', dependency: 'Vendor onboarding' },
    });
    expect(draft.title).toBe('Vendor access: blocked: Vendor has not issued credentials');
    for (const line of ['Rock: Vendor access (Q4 2026)', 'Status: Blocked', 'Owner: Ana', 'Milestones: 1 of 4 done', 'Blocked milestones: Get sandbox access', 'Blocker: Vendor has not issued credentials', 'Depends on: Vendor onboarding', 'Next action: Escalate (Ben)', 'Raised from the Rock Review.']) {
      expect(draft.description).toContain(line);
    }
  });

  it('puts what the room has to decide first, and keeps titles and descriptions bounded', () => {
    const draft = draftIssue({ rockTitle: 'A'.repeat(300), status: 'off_track', note: 'Do we add budget?' });
    expect(draft.title.length).toBeLessThanOrEqual(140);
    expect(draft.title).toMatch(/…$/);
    expect(draft.description.startsWith('To decide: Do we add budget?')).toBe(true);
    expect(draftIssue({ rockTitle: 'X', status: 'off_track', blocker: { reason: 'r'.repeat(5000) } }).description.length).toBeLessThanOrEqual(2000);
  });

  it('calls a clean Rock something to discuss rather than a problem', () => {
    expect(draftIssue({ rockTitle: 'Tidy', status: 'on_track' }).title).toBe('Tidy: needs discussion');
    expect(draftIssue({ rockTitle: 'Hire', status: 'off_track' }).title).toBe('Hire: off track');
  });

  it('titles a flagged Rock by its first flag when its own status looks fine', () => {
    expect(draftIssue({ rockTitle: 'Launch', status: 'on_track', reasons: ['1 Rock below it is blocked', 'Past its due date'] }).title).toBe('Launch: 1 rock below it is blocked');
    expect(draftIssue({ rockTitle: 'Hire', status: 'off_track', reasons: ['Off track'] }).title).toBe('Hire: off track');
  });

  it('lists only the first three blocked milestones and says how many more', () => {
    const d = draftIssue({ rockTitle: 'X', status: 'blocked', blockedMilestoneTitles: ['a', 'b', 'c', 'd', 'e'] });
    expect(d.description).toContain('Blocked milestones: a; b; c (and 2 more)');
  });
});

describe('issueSourceFor and isOpenIssue', () => {
  it('records which kind of meeting raised it, as the IDS dialog does', () => {
    expect(issueSourceFor('L10')).toBe('meeting_l10');
    expect(issueSourceFor('Level 10')).toBe('meeting_l10');
    expect(issueSourceFor('Quarterly')).toBe('meeting_quarterly');
    expect(issueSourceFor('Annual')).toBe('meeting_annual');
    expect(issueSourceFor('Other')).toBe('meeting_ids');
    expect(issueSourceFor(undefined)).toBe('meeting_ids');
  });

  it('treats an issue as live until it is solved or closed', () => {
    expect(['Open', 'Discussing', null].map(isOpenIssue)).toEqual([true, true, true]);
    expect(['Solved', 'Closed', 'closed'].map(isOpenIssue)).toEqual([false, false, false]);
  });
});

describe('lastStatusChange', () => {
  const event = (id: number, action: RockEvent['action'], before: object | null, after: object | null, actor = 'u1'): RockEvent => ({
    id, action, actor_user_id: actor, before_data: before as Record<string, unknown> | null, after_data: after as Record<string, unknown> | null, occurred_at: `2026-10-${10 + id}T00:00:00Z`,
  });
  const nameOf = (id: string | null) => ({ u1: 'Ana' } as Record<string, string>)[id ?? ''] ?? 'Someone';

  it('reports the newest real status change and ignores other edits', () => {
    const events = [event(3, 'updated', { title: 'a' }, { title: 'b' }), event(2, 'updated', { status: 'on_track' }, { status: 'off_track' }), event(1, 'created', null, { status: 'on_track' })];
    expect(lastStatusChange(events, nameOf)).toEqual({ text: 'Ana moved it from on track to off track', occurredAt: '2026-10-12T00:00:00Z' });
  });

  it('says nothing when the status never moved', () => {
    expect(lastStatusChange([event(1, 'created', null, { status: 'on_track' })], nameOf)).toBeNull();
    expect(lastStatusChange([event(2, 'updated', { status: 'on_track' }, { status: 'on_track' })], nameOf)).toBeNull();
  });
});

describe('wrapUp', () => {
  const nodes = nodesById(cascade(['company']).roots);
  const deck = ['c1', 'c2', 'c4'];

  it('separates what was confirmed, changed and raised, and what was never reached', () => {
    const w = wrapUp(deck, { c4: ['confirmed'], c2: ['raised'] }, nodes, new Set());
    expect(w).toMatchObject({ total: 3, visited: 2, raised: ['Hire two people'], confirmed: ['Tidy the office'], changed: [], unvisited: ['Launch portal'] });
  });

  it('flags stuck Rocks that nobody raised and that have no open issue', () => {
    expect(wrapUp(deck, { c1: ['confirmed'], c2: ['confirmed'], c4: ['confirmed'] }, nodes, new Set()).unresolved).toEqual(['Launch portal', 'Hire two people']);
  });

  it('does not nag about a Rock that already has an open issue or was raised now', () => {
    expect(wrapUp(deck, { c1: ['confirmed'], c2: ['raised'], c4: ['confirmed'] }, nodes, new Set(['c1'])).unresolved).toEqual([]);
  });

  it('counts a changed status once, unless it was also raised', () => {
    const w = wrapUp(deck, { c4: ['changed'], c2: ['changed', 'raised'] }, nodes, new Set());
    expect(w.changed).toEqual(['Tidy the office']);
    expect(w.raised).toEqual(['Hire two people']);
  });
});
