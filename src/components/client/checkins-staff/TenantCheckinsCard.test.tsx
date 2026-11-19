import { readFileSync } from 'node:fs';
import { render, screen, within } from '@testing-library/react';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { daysSinceLastPulse, hasLowStreak, packageFlags, summariseOverview, categoryLabel, type TenantCheckinsOverview } from './tenantCheckins';

const h = vi.hoisted(() => ({ state: { data: undefined, isLoading: false, isError: false } as { data: unknown; isLoading: boolean; isError: boolean } }));
vi.mock('@/hooks/use-tenant-checkins', () => ({ useTenantCheckins: () => h.state }));

import { TenantCheckinsCard } from './TenantCheckinsCard';

const iso = (daysAgo: number) => new Date(Date.now() - daysAgo * 86_400_000).toISOString();
const pulse = (score: number, daysAgo: number) => ({ score, created_at: iso(daysAgo) });

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
      blockers: [{ category: 'evidence', comment: '<b>Cannot</b> find the records', created_at: iso(1), name: 'Ana Low' }],
    },
    { package_instance_id: 2, package_name: 'Quiet Package', people: [], blockers: [] },
  ],
};

beforeEach(() => {
  h.state = { data: overview, isLoading: false, isError: false };
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
