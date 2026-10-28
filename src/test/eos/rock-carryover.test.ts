import { describe, expect, it } from 'vitest';
import {
  carryoverLinksFor,
  carryoverPayload,
  carryoverPreview,
  classifyMilestones,
  destinationOptions,
  destinationQuarters,
  nextQuarter,
  quarterEndIso,
  validateCarryover,
  type CarryoverForm,
  type CarryoverMilestoneRow,
  type CarryoverRow,
  type DestinationRockOption,
} from '@/utils/rockCarryover';

const Q4 = { year: 2026, quarter: 4 };

describe('quarters', () => {
  it('rolls over the year and is not tied to Q4 to Q1', () => {
    expect(nextQuarter(Q4)).toEqual({ year: 2027, quarter: 1 });
    expect(nextQuarter({ year: 2026, quarter: 1 })).toEqual({ year: 2026, quarter: 2 });
    expect(destinationQuarters({ year: 2026, quarter: 2 }, 3)).toEqual([
      { year: 2026, quarter: 3 },
      { year: 2026, quarter: 4 },
      { year: 2027, quarter: 1 },
    ]);
  });

  it('suggests the last day of the quarter', () => {
    expect(quarterEndIso({ year: 2027, quarter: 1 })).toBe('2027-03-31');
    expect(quarterEndIso({ year: 2027, quarter: 2 })).toBe('2027-06-30');
    expect(quarterEndIso({ year: 2026, quarter: 4 })).toBe('2026-12-31');
  });
});

describe('classifyMilestones: only incomplete, not-yet-carried work can be carried', () => {
  it('never offers completed work or work already carried', () => {
    const result = classifyMilestones(
      [
        { id: 'a', title: 'A', status: 'in_progress', dueDate: null },
        { id: 'b', title: 'B', status: 'complete', dueDate: null },
        { id: 'c', title: 'C', status: 'not_started', dueDate: null },
        { id: 'd', title: 'D', status: 'blocked', dueDate: null },
        { id: 'e', title: 'E', status: 'deferred', dueDate: null },
      ],
      new Set(['c']),
    );
    expect(Object.fromEntries(result.map(r => [r.id, r.state]))).toEqual({ a: 'carry', b: 'completed', c: 'carried', d: 'carry', e: 'carry' });
  });
});

const rocks: DestinationRockOption[] = [
  { id: 'later', title: 'Later', level: 'individual', quarterYear: 2027, quarterNumber: 1, parentRockId: 'cq1', archived: false, tenantId: 1 },
  { id: 'same-q', title: 'Same quarter', level: 'individual', quarterYear: 2026, quarterNumber: 4, parentRockId: 'cq1', archived: false, tenantId: 1 },
  { id: 'earlier', title: 'Earlier', level: 'individual', quarterYear: 2026, quarterNumber: 3, parentRockId: 'cq1', archived: false, tenantId: 1 },
  { id: 'company', title: 'Company', level: 'company', quarterYear: 2027, quarterNumber: 1, parentRockId: null, archived: false, tenantId: 1 },
  { id: 'archived', title: 'Archived', level: 'individual', quarterYear: 2027, quarterNumber: 1, parentRockId: 'cq1', archived: true, tenantId: 1 },
  { id: 'other-tenant', title: 'Other tenant', level: 'individual', quarterYear: 2027, quarterNumber: 1, parentRockId: 'cq1', archived: false, tenantId: 2 },
  { id: 'taken', title: 'Already a destination', level: 'individual', quarterYear: 2027, quarterNumber: 1, parentRockId: 'cq1', archived: false, tenantId: 1 },
  { id: 'wrong-parent', title: 'Wrong parent', level: 'individual', quarterYear: 2027, quarterNumber: 2, parentRockId: 'other', archived: false, tenantId: 1 },
];
const source = { id: 'src', level: 'individual', quarterYear: 2026, quarterNumber: 4, tenantId: 1, parentRockId: 'cq4' };

describe('destinationOptions hides choices the database would refuse', () => {
  it('keeps only later, same-level, same-tenant, live Rocks not already carried to', () => {
    const ids = destinationOptions(source, rocks, new Set(['taken']), null).map(r => r.id);
    expect(ids).toEqual(['later', 'wrong-parent']);
  });

  it('requires the Rock the parent was carried into when the parent has been carried', () => {
    const ids = destinationOptions(source, rocks, new Set(['taken']), 'cq1').map(r => r.id);
    expect(ids).toEqual(['later']);
  });

  it('never offers the Rock itself', () => {
    expect(destinationOptions({ ...source, id: 'later' }, rocks, new Set(), null).map(r => r.id)).not.toContain('later');
  });
});

describe('validateCarryover', () => {
  const valid: CarryoverForm = {
    destination: { kind: 'new', year: 2027, quarter: 1, title: '', dueDate: '2027-03-31' },
    selected: { m1: '' },
    reason: 'Vendor delay',
  };

  it('accepts a complete form', () => {
    expect(validateCarryover(valid, Q4).valid).toBe(true);
  });

  it('requires a reason', () => {
    expect(validateCarryover({ ...valid, reason: '  ' }, Q4).errors.reason).toBeDefined();
  });

  it('refuses a destination that is not later', () => {
    expect(validateCarryover({ ...valid, destination: { kind: 'new', year: 2026, quarter: 4, title: '', dueDate: '2026-12-31' } }, Q4).errors.destination).toBeDefined();
    expect(validateCarryover({ ...valid, destination: { kind: 'new', year: 2026, quarter: 2, title: '', dueDate: '2026-06-30' } }, Q4).errors.destination).toBeDefined();
  });

  it('needs a due date for a new Rock and a Rock choice for an existing one', () => {
    expect(validateCarryover({ ...valid, destination: { kind: 'new', year: 2027, quarter: 1, title: '', dueDate: '' } }, Q4).errors.dueDate).toBeDefined();
    expect(validateCarryover({ ...valid, destination: { kind: 'existing', rockId: '' } }, Q4).errors.destination).toBeDefined();
  });

  it('allows carrying with no milestones, and rejects a malformed date', () => {
    expect(validateCarryover({ ...valid, selected: {} }, Q4).valid).toBe(true);
    expect(validateCarryover({ ...valid, selected: { m1: 'soon' } }, Q4).errors.milestoneDates).toBeDefined();
  });
});

describe('carryoverPayload', () => {
  it('describes a new destination and sends a new date only when one was chosen', () => {
    const payload = carryoverPayload({
      destination: { kind: 'new', year: 2027, quarter: 1, title: ' ', dueDate: '2027-03-31' },
      selected: { m1: '', m2: '2027-02-15' },
      reason: '  Vendor delay ',
    });
    expect(payload.destination).toEqual({ create: { title: undefined, quarter_year: 2027, quarter_number: 1, due_date: '2027-03-31' } });
    expect(payload.milestones).toEqual([{ source_milestone_id: 'm1' }, { source_milestone_id: 'm2', new_due_date: '2027-02-15' }]);
    expect(payload.reason).toBe('Vendor delay');
  });

  it('points at an existing Rock without also asking to create one', () => {
    const payload = carryoverPayload({ destination: { kind: 'existing', rockId: 'r1' }, selected: {}, reason: 'x' });
    expect(payload.destination).toEqual({ rock_id: 'r1' });
  });
});

describe('carryoverPreview', () => {
  it('says the source is untouched and not completed, and that finished work is not copied', () => {
    const text = carryoverPreview('Grow revenue', Q4, 'a new Rock in Q1 2027', 2, 1).join(' ');
    expect(text).toMatch(/2 milestones will be copied/);
    expect(text).toMatch(/stay exactly as they are/);
    expect(text).toMatch(/not marked complete/);
    expect(text).toMatch(/1 completed milestone stays in Q4 2026/);
  });
});

describe('carryoverLinksFor: both directions from the stored relations', () => {
  const carryovers: CarryoverRow[] = [
    { id: 'c1', tenant_id: 1, source_rock_id: 'q4', destination_rock_id: 'q1', reason: 'Delay', carried_by: 'u1', carried_at: '2026-12-20T00:00:00Z' },
    { id: 'c2', tenant_id: 1, source_rock_id: 'q1', destination_rock_id: 'q2', reason: 'Again', carried_by: 'u1', carried_at: '2027-03-20T00:00:00Z' },
    { id: 'c3', tenant_id: 1, source_rock_id: 'x', destination_rock_id: 'y', reason: 'Unrelated', carried_by: null, carried_at: '2026-12-01T00:00:00Z' },
  ];
  const pairs: CarryoverMilestoneRow[] = [
    { id: 'p1', tenant_id: 1, carryover_id: 'c1', source_milestone_id: 'm-q4', destination_milestone_id: 'm-q1', source_title: 'Ship it', source_status: 'in_progress', source_due_date: '2026-12-01', new_due_date: '2027-02-01', created_at: '2026-12-20T00:00:00Z' },
  ];

  it('shows "to" on the source and "from" on the destination, each naming the other Rock', () => {
    const onSource = carryoverLinksFor('q4', carryovers, pairs);
    expect(onSource).toHaveLength(1);
    expect(onSource[0]).toMatchObject({ direction: 'to', otherRockId: 'q1', reason: 'Delay' });
    expect(onSource[0].milestones[0]).toMatchObject({ sourceMilestoneId: 'm-q4', destinationMilestoneId: 'm-q1', sourceStatus: 'in_progress', newDueDate: '2027-02-01' });

    const onDestination = carryoverLinksFor('q1', carryovers, pairs);
    expect(onDestination.map(l => [l.direction, l.otherRockId])).toEqual([['to', 'q2'], ['from', 'q4']]);
  });

  it('keeps the original status, and the new date separate from the original date', () => {
    const [link] = carryoverLinksFor('q4', carryovers, pairs);
    expect(link.milestones[0].sourceStatus).toBe('in_progress');
    expect(link.milestones[0].newDueDate).toBe('2027-02-01');
  });

  it('shows nothing for a Rock that was never carried', () => {
    expect(carryoverLinksFor('lonely', carryovers, pairs)).toEqual([]);
  });
});
