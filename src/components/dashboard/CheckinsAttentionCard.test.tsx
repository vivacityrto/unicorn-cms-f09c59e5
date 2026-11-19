import { readFileSync } from 'node:fs';
import { render, screen, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { MemoryRouter } from 'react-router-dom';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { attentionSentence, describeItem, minePackages, type CheckinAttentionItem } from './checkinsAttention';

const h = vi.hoisted(() => ({
  state: { data: undefined, isLoading: false, isError: false } as { data: unknown; isLoading: boolean; isError: boolean },
  profile: { user_uuid: 'me' } as { user_uuid: string } | null,
}));
vi.mock('@/hooks/use-checkins-attention', () => ({ useCheckinsAttention: () => h.state }));
vi.mock('@/hooks/useAuth', () => ({ useAuth: () => ({ profile: h.profile }) }));

import { CheckinsAttentionCard } from './CheckinsAttentionCard';

const iso = (daysAgo: number) => new Date(Date.now() - daysAgo * 86_400_000).toISOString();
let n = 0;
const item = (over: Partial<CheckinAttentionItem> = {}): CheckinAttentionItem => ({
  package_instance_id: ++n, tenant_id: 100 + n, tenant_name: `Client ${n}`, package_name: 'Diamond RTO Membership', manager_id: 'someone', manager_name: 'Sam Manager',
  blocker_count: 0, latest_blocker: null, low_streak_people: 0, ...over,
});
const blocked = (over: Partial<CheckinAttentionItem> = {}) =>
  item({ blocker_count: 1, latest_blocker: { category: 'evidence', comment: '<i>Cannot</i> find records', name: 'Ana Low', created_at: iso(2) }, ...over });

beforeEach(() => {
  h.profile = { user_uuid: 'me' };
  h.state = { data: { items: [] }, isLoading: false, isError: false };
});

const show = () => render(<MemoryRouter><CheckinsAttentionCard /></MemoryRouter>);

describe('attention helpers', () => {
  it('picks out the packages a person manages, and none without a person', () => {
    const items = [item({ manager_id: 'me' }), item(), item({ manager_id: null })];
    expect(minePackages(items, 'me')).toHaveLength(1);
    expect(minePackages(items, null)).toEqual([]);
    expect(minePackages(items, undefined)).toEqual([]);
  });

  it('describes what is flagged in plain words', () => {
    expect(describeItem(blocked())[0]).toMatch(/^Blocker flagged: Evidence, Ana Low 2 days ago$/);
    expect(describeItem(blocked({ blocker_count: 3, low_streak_people: 2 }))).toEqual([
      expect.stringContaining('(3 in the last 30 days)'),
      '2 people have given two low pulses in a row',
    ]);
    expect(describeItem(item({ low_streak_people: 1 }))).toEqual(['1 person has given two low pulses in a row']);
    expect(describeItem(item())).toEqual([]);
  });

  it('writes one sentence for the top, counting clients not packages', () => {
    expect(attentionSentence([])).toBe('No client check-ins need attention right now.');
    const a = blocked({ tenant_id: 1 });
    const b = item({ tenant_id: 1, low_streak_people: 1 });
    expect(attentionSentence([a, b])).toBe('1 client to look at: 1 package has a blocker and 1 package has two low pulses in a row.');
    expect(attentionSentence([blocked({ tenant_id: 1 }), blocked({ tenant_id: 2 })])).toBe('2 clients to look at: 2 packages have a blocker.');
  });
});

describe('CheckinsAttentionCard', () => {
  it('opens on My clients when the person manages flagged packages, and can switch to all', async () => {
    h.state = { data: { items: [blocked({ manager_id: 'me', tenant_name: 'Mine Pty' }), blocked({ tenant_name: 'Theirs Pty' })] }, isLoading: false, isError: false };
    show();
    expect(screen.getByRole('button', { name: /My clients · 1/ })).toHaveAttribute('aria-pressed', 'true');
    expect(screen.getByText('Mine Pty')).toBeInTheDocument();
    expect(screen.queryByText('Theirs Pty')).not.toBeInTheDocument();
    await userEvent.click(screen.getByRole('button', { name: /All clients · 2/ }));
    expect(screen.getByText('Theirs Pty')).toBeInTheDocument();
  });

  it('opens on all clients when the person manages none, and links each row to the client page', () => {
    h.state = { data: { items: [blocked({ tenant_id: 777, tenant_name: 'Elsewhere Pty' })] }, isLoading: false, isError: false };
    show();
    expect(screen.getByRole('button', { name: /All clients · 1/ })).toHaveAttribute('aria-pressed', 'true');
    expect(screen.getByRole('link', { name: /Elsewhere Pty/ })).toHaveAttribute('href', '/tenant/777');
    expect(screen.getByRole('status')).toHaveTextContent('1 client to look at');
  });

  it('shows the client text as plain text, and who manages the package', () => {
    h.state = { data: { items: [blocked({ manager_name: 'Sam Manager' })] }, isLoading: false, isError: false };
    const { container } = show();
    expect(screen.getByText('<i>Cannot</i> find records')).toBeInTheDocument();
    expect(container.querySelector('i')).toBeNull();
    expect(screen.getByText('Managed by Sam Manager')).toBeInTheDocument();
  });

  it('says nothing needs attention, and says when a package has no manager', () => {
    show();
    expect(screen.getByText('No client check-ins need attention right now.')).toBeInTheDocument();
    expect(screen.queryByRole('status')).not.toBeInTheDocument();
    h.state = { data: { items: [item({ low_streak_people: 1, manager_name: null, manager_id: null })] }, isLoading: false, isError: false };
    render(<MemoryRouter><CheckinsAttentionCard /></MemoryRouter>);
    expect(screen.getByText('No package manager')).toBeInTheDocument();
  });

  it('shows six, then the rest on request', async () => {
    h.state = { data: { items: Array.from({ length: 8 }, () => blocked()) }, isLoading: false, isError: false };
    show();
    expect(screen.getAllByRole('link')).toHaveLength(6);
    await userEvent.click(screen.getByRole('button', { name: 'Show all 8' }));
    expect(screen.getAllByRole('link')).toHaveLength(8);
    await userEvent.click(screen.getByRole('button', { name: 'Show fewer' }));
    expect(screen.getAllByRole('link')).toHaveLength(6);
  });

  it('has a loading placeholder and hides itself on error', () => {
    h.state = { data: undefined, isLoading: true, isError: false };
    const loading = render(<MemoryRouter><CheckinsAttentionCard /></MemoryRouter>);
    expect(loading.container.querySelector('[class*="animate-pulse"]')).not.toBeNull();
    loading.unmount();
    h.state = { data: undefined, isLoading: false, isError: true };
    expect(render(<MemoryRouter><CheckinsAttentionCard /></MemoryRouter>).container).toBeEmptyDOMElement();
  });
});

describe('get_checkins_attention safety', () => {
  const sql = readFileSync('supabase/migrations/20261120070000_get_checkins_attention.sql', 'utf8').replace(/--[^\n]*/g, '');
  it('is staff only, writes nothing, and returns no email or person id', () => {
    expect(sql).toContain('app.is_vivacity_team() or app.is_super_admin()');
    expect(sql).toContain("raise exception 'Not authorized'");
    expect(sql).toContain('from anon');
    expect(sql).not.toMatch(/\b(insert|update|delete)\b/i);
    expect(sql).not.toMatch(/\bemail\b/);
    expect(sql).not.toMatch(/'user_id'/);
  });
  it('clips the client text and limits how old a flag can be', () => {
    expect(sql).toContain('left(c.comment, 160)');
    expect(sql).toContain("interval '30 days'");
    expect(sql).toContain("interval '45 days'");
  });
  it('is not read by any AI code', () => {
    for (const f of ['supabase/functions/_shared/client-insights.ts', 'supabase/functions/client-insights/index.ts']) {
      expect(readFileSync(f, 'utf8')).not.toContain('get_checkins_attention');
    }
  });
});
