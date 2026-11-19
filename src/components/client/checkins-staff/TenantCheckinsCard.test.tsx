import { readFileSync } from 'node:fs';
import { render, screen, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { daysSinceLastPulse, hasLowStreak, packageFlags, summariseOverview, categoryLabel, type TenantCheckinsOverview } from './tenantCheckins';

const h = vi.hoisted(() => ({ state: { data: undefined, isLoading: false, isError: false } as { data: unknown; isLoading: boolean; isError: boolean }, mutate: vi.fn(), pending: false }));
vi.mock('@/hooks/use-tenant-checkins', () => ({ useTenantCheckins: () => h.state }));
vi.mock('@/hooks/use-set-blocker-status', () => ({ useSetBlockerStatus: () => ({ mutate: h.mutate, isPending: h.pending }) }));

import { TenantCheckinsCard } from './TenantCheckinsCard';

const iso = (daysAgo: number) => new Date(Date.now() - daysAgo * 86_400_000).toISOString();
const pulse = (score: number, daysAgo: number) => ({ score, created_at: iso(daysAgo) });
let bn = 0;
type Blk = TenantCheckinsOverview['packages'][number]['blockers'][number];
const blocker = (over: Partial<Blk> = {}): Blk => ({
  id: `b${++bn}`, category: 'evidence', comment: 'a problem', created_at: iso(1), name: 'Ana Low', status: 'flagged', seen_by: null, acknowledged_at: null, resolved_at: null, staff_note: null, ...over,
});

const overview: TenantCheckinsOverview = {
  packages: [
    {
      package_instance_id: 1,
      package_name: 'Diamond RTO Membership',
      people: [
        { name: 'Ana Low', pulses: [pulse(2, 14), pulse(1, 1)], confidence: { score: 3, created_at: iso(2) } },
        { name: 'Ben Fine', pulses: [pulse(4, 14), pulse(5, 2)], confidence: null },
        { name: 'Cy Confidence', pulses: null, confidence: { score: 2, created_at: iso(3) } },
      ],
      blockers: [blocker({ id: 'b-main', comment: '<b>Cannot</b> find the records' })],
    },
    { package_instance_id: 2, package_name: 'Quiet Package', people: [], blockers: [] },
  ],
};

beforeEach(() => {
  h.state = { data: overview, isLoading: false, isError: false };
  h.mutate = vi.fn((_input, opts) => opts?.onSuccess?.());
  h.pending = false;
});

describe('staff check-in helpers', () => {
  it('flags a person only when their last two pulses are both low', () => {
    expect(hasLowStreak({ pulses: [pulse(2, 14), pulse(1, 1)] })).toBe(true);
    expect(hasLowStreak({ pulses: [pulse(5, 14), pulse(2, 1)] })).toBe(false);
    expect(hasLowStreak({ pulses: [pulse(1, 28), pulse(4, 14), pulse(2, 1)] })).toBe(false);
    expect(hasLowStreak({ pulses: [pulse(1, 1)] })).toBe(false);
    expect(hasLowStreak({ pulses: null })).toBe(false);
  });

  it('never reads a package with no answers as fine', () => {
    expect(packageFlags(overview.packages[1])).toMatchObject({ noAnswers: true, needsAttention: false });
    expect(packageFlags(overview.packages[0])).toMatchObject({ lowStreakNames: ['Ana Low'], blockerCount: 1, noAnswers: false, needsAttention: true });
  });

  it('writes one sentence in the words the flags use', () => {
    expect(summariseOverview(overview).sentence).toBe('1 blocker flagged in the last 30 days and 1 person has given two low pulses in a row.');
    expect(summariseOverview({ packages: [] }).sentence).toBe('This client has no live packages.');
    expect(summariseOverview({ packages: [overview.packages[1]] }).sentence).toBe('Nobody has answered a check-in yet.');
    const calm = { packages: [{ ...overview.packages[0], people: [overview.packages[0].people[1]], blockers: [] }] };
    expect(summariseOverview(calm).sentence).toBe('Nothing flagged. Answers are shown below.');
    const two = { packages: [{ ...overview.packages[0], people: [overview.packages[0].people[0], { ...overview.packages[0].people[0], name: 'Dee Low' }], blockers: [] }] };
    expect(summariseOverview(two).sentence).toBe('2 people have given two low pulses in a row.');
  });

  it('labels categories and counts days since the last pulse', () => {
    expect(categoryLabel('evidence')).toBe('Evidence');
    expect(categoryLabel('something-else')).toBe('Other');
    expect(daysSinceLastPulse({ pulses: [pulse(3, 10), pulse(3, 4)] })).toBe(4);
    expect(daysSinceLastPulse({ pulses: null })).toBeNull();
  });
});

describe('blocker status in the flags', () => {
  it('counts only unresolved blockers as needing attention, and keeps resolved ones listed', () => {
    const pkg = { ...overview.packages[1], people: [], blockers: [blocker({ status: 'resolved', resolved_at: iso(0) }), blocker({ status: 'seen', seen_by: 'Sam' })] };
    expect(packageFlags(pkg)).toMatchObject({ blockerCount: 1, needsAttention: true, noAnswers: false });
    const done = { ...pkg, blockers: [blocker({ status: 'resolved', resolved_at: iso(0) })] };
    expect(packageFlags(done)).toMatchObject({ blockerCount: 0, needsAttention: false, noAnswers: false });
    expect(summariseOverview({ packages: [done] }).sentence).toBe('Nothing flagged. Answers are shown below.');
  });
});

describe('TenantCheckinsCard', () => {
  it('shows each person with their pulse, confidence and flags, and the blocker as plain text', () => {
    render(<TenantCheckinsCard tenantId={5} />);
    const pkg = screen.getByRole('region', { name: 'Check-ins for Diamond RTO Membership' });
    expect(screen.getByRole('status')).toHaveTextContent('1 blocker flagged');
    expect(within(pkg).getByText('1 blocker')).toBeInTheDocument();
    expect(within(pkg).getByText('Two low pulses in a row')).toBeInTheDocument();
    expect(within(pkg).getByText(/Pulse 1\/5 1d ago · Audit confidence 3\/5/)).toBeInTheDocument();
    expect(within(pkg).getByRole('img', { name: "Ben Fine's recent pulse answers: 4, 5 out of 5" })).toBeInTheDocument();
    expect(within(pkg).getByText('No pulse yet')).toBeInTheDocument();
    // Client-written text is shown as text, never as markup.
    expect(within(pkg).getByText('<b>Cannot</b> find the records')).toBeInTheDocument();
    expect(pkg.querySelector('b')).toBeNull();
    expect(within(pkg).getByText('Evidence')).toBeInTheDocument();
  });

  it('says no check-ins yet for a quiet package rather than implying all is well', () => {
    render(<TenantCheckinsCard tenantId={5} />);
    const quiet = screen.getByRole('region', { name: 'Check-ins for Quiet Package' });
    expect(within(quiet).getByText('No check-ins yet')).toBeInTheDocument();
  });

  it('has a loading placeholder and a plain error message', () => {
    h.state = { data: undefined, isLoading: true, isError: false };
    expect(render(<TenantCheckinsCard tenantId={5} />).container.querySelector('[class*="animate-pulse"]')).not.toBeNull();
    h.state = { data: undefined, isLoading: false, isError: true };
    render(<TenantCheckinsCard tenantId={5} />);
    expect(screen.getByText(/could not be loaded/)).toBeInTheDocument();
  });
});

describe('get_tenant_checkins_overview safety', () => {
  const sql = readFileSync('supabase/migrations/20261120050000_get_tenant_checkins_overview.sql', 'utf8').replace(/--[^\n]*/g, '');
  it('is for staff only and takes nothing about the caller from the request', () => {
    expect(sql).toContain('app.is_vivacity_team() or app.is_super_admin()');
    expect(sql).toContain("raise exception 'Not authorized'");
    expect(sql).toContain('from anon');
    expect(sql).toContain('tenant_id = p_tenant_id');
  });
  it('returns names only, never an email or an id of a person, and writes nothing', () => {
    expect(sql).not.toMatch(/\bemail\b/);
    expect(sql).not.toMatch(/'user_id'/);
    expect(sql).not.toMatch(/\b(insert|update|delete)\b/i);
  });
  it('is not read by any AI code', () => {
    for (const f of ['supabase/functions/_shared/client-insights.ts', 'supabase/functions/client-insights/index.ts']) {
      expect(readFileSync(f, 'utf8')).not.toContain('get_tenant_checkins_overview');
    }
  });
});

describe('acting on a blocker', () => {
  it('marks a new blocker seen with an optional note for the client', async () => {
    render(<TenantCheckinsCard tenantId={5} />);
    await userEvent.click(screen.getByRole('button', { name: 'Mark seen' }));
    expect(screen.getByText(/They will see this/)).toBeInTheDocument();
    await userEvent.type(screen.getByRole('textbox'), 'We will call you Thursday');
    await userEvent.click(screen.getAllByRole('button', { name: 'Mark seen' }).at(-1)!);
    expect(h.mutate).toHaveBeenCalledWith({ id: 'b-main', action: 'acknowledge', note: 'We will call you Thursday' }, expect.anything());
  });

  it('resolves a blocker, and reopens a resolved one in one click', async () => {
    render(<TenantCheckinsCard tenantId={5} />);
    await userEvent.click(screen.getByRole('button', { name: 'Resolve' }));
    await userEvent.click(screen.getAllByRole('button', { name: 'Resolve' }).at(-1)!);
    expect(h.mutate).toHaveBeenCalledWith({ id: 'b-main', action: 'resolve', note: '' }, expect.anything());
  });

  it('shows a resolved blocker with its note and lets staff reopen it', async () => {
    h.state = { data: { packages: [{ ...overview.packages[1], people: [], blockers: [blocker({ id: 'b-done', status: 'resolved', resolved_at: iso(0), seen_by: 'Sam', staff_note: 'Sorted on the call' })] }] }, isLoading: false, isError: false };
    const { container } = render(<TenantCheckinsCard tenantId={5} />);
    expect(within(container).getByText('Resolved')).toBeInTheDocument();
    expect(within(container).getByText(/Sorted on the call/)).toBeInTheDocument();
    await userEvent.click(within(container).getByRole('button', { name: 'Reopen' }));
    expect(h.mutate).toHaveBeenCalledWith({ id: 'b-done', action: 'reopen', note: undefined }, expect.anything());
  });

  it('shows who saw it, and the refusal in plain words if the update fails', async () => {
    h.state = { data: { packages: [{ ...overview.packages[1], people: [], blockers: [blocker({ status: 'seen', seen_by: 'Sam Manager' })] }] }, isLoading: false, isError: false };
    h.mutate = vi.fn((_input, opts) => opts?.onError?.(new Error('Not authorized')));
    render(<TenantCheckinsCard tenantId={5} />);
    expect(screen.getByText(/seen by Sam Manager/)).toBeInTheDocument();
    await userEvent.click(screen.getByRole('button', { name: 'Resolve' }));
    await userEvent.click(screen.getAllByRole('button', { name: 'Resolve' }).at(-1)!);
    expect(await screen.findByRole('alert')).toHaveTextContent('Not authorized');
  });
});

describe('blocker status migration safety', () => {
  const sql = readFileSync('supabase/migrations/20261120090000_blocker_acknowledgement_and_notification.sql', 'utf8').replace(/--[^\n]*/g, '');
  const setFn = sql.slice(sql.indexOf('create or replace function public.set_package_blocker_status'), sql.indexOf('create or replace function public.submit_package_checkin'));
  const notify = sql.slice(sql.indexOf('insert into public.user_notifications'), sql.indexOf('on conflict do nothing'));

  it('lets only staff change a blocker, and only blockers', () => {
    expect(setFn).toContain('app.is_vivacity_team() or app.is_super_admin()');
    expect(setFn).toContain("kind = 'blocker' for update");
    expect(setFn).toContain("p_action not in ('acknowledge', 'resolve', 'reopen')");
    expect(sql).toContain('grant execute on function public.set_package_blocker_status(uuid, text, text) to authenticated');
    expect(sql).toContain('from anon');
  });
  it('keeps the new status columns to blockers and the note short', () => {
    expect(sql).toContain('package_checkins_status_only_blocker');
    expect(sql).toContain('char_length(staff_note) <= 280');
  });
  it('notifies the package manager once per blocker and never repeats the client words', () => {
    expect(notify).toContain("'client_blocker'");
    expect(notify).toContain("'client_blocker:' || v_row.id::text");
    expect(notify).not.toMatch(/v_comment|p_comment|comment/);
    expect(sql).toContain('on conflict do nothing');
  });
  it('lists only unresolved blockers for attention', () => {
    expect(sql).toContain("c.kind = 'blocker' and c.resolved_at is null");
  });
});
