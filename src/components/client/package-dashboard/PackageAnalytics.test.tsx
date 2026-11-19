import { readFileSync } from 'node:fs';
import { render, screen, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { describe, expect, it } from 'vitest';
import { PackageAnalytics } from './PackageAnalytics';
import type { PackageActivity } from './packageActivity';

const now = new Date();
const iso = (d: Date) => d.toISOString().slice(0, 10);
const daysAgo = (n: number) => iso(new Date(now.getTime() - n * 86_400_000));

const activity: PackageActivity = {
  window: { start: daysAgo(120), end: iso(new Date(now.getTime() + 240 * 86_400_000)) },
  daily: [
    { day: daysAgo(60), work_type: 'document_review', minutes: 90, entries: 2 },
    { day: daysAgo(30), work_type: 'meeting', minutes: 120, entries: 1 },
    { day: daysAgo(2), work_type: 'general', minutes: 60, entries: 1 },
  ],
  touchpoints: [{ week_start: daysAgo(30), kind: 'email', count: 2 }],
  tasks: [],
  documents: [],
};

const show = (over: Partial<Parameters<typeof PackageAnalytics>[0]> = {}) =>
  render(<PackageAnalytics activity={activity} isLoading={false} isError={false} stages={[{ completion_date: daysAgo(45), stage_shortname: 'Setup', stage_name: 'Setup' } as never]} hoursTotal={80} percentUsed={20} {...over} />);

describe('PackageAnalytics', () => {
  it('shows the weekly snapshot, the timeline, hours by week and the mix of work', () => {
    show();
    expect(screen.getByRole('region', { name: 'Weekly snapshot' })).toBeInTheDocument();
    expect(screen.getByRole('region', { name: 'Activity timeline' })).toHaveTextContent(/Work happened in 3 of \d+ weeks/);
    expect(screen.getByRole('region', { name: 'Hours by week and kind of work' })).toBeInTheDocument();
    expect(screen.getByRole('region', { name: 'Mix of work by month' }) ?? null).toBeTruthy();
  });

  it('shows the share of the package used on the ring as a percentage (the page passes 0 to 100)', () => {
    show({ percentUsed: 80 });
    const ring = screen.getByRole('img', { name: '80% of the package hours used' });
    expect(ring).toHaveTextContent('80%');
  });

  it('opens a mini page for a week from the table view, with counts only', async () => {
    show();
    await userEvent.click(screen.getByRole('button', { name: 'View as table' }));
    const table = screen.getByRole('table');
    await userEvent.click(within(table).getAllByRole('button')[1]);
    const dialog = await screen.findByRole('dialog');
    expect(within(dialog).getByText('Where the hours went')).toBeInTheDocument();
    expect(within(dialog).getByText(/counts only/i)).toBeInTheDocument();
  });

  it('opens the same mini page from a dot on the timeline, by keyboard', async () => {
    show();
    const dots = screen.getAllByRole('button', { name: /^Week of/ });
    expect(dots.length).toBeGreaterThanOrEqual(3);
    dots[0].focus();
    await userEvent.keyboard('{Enter}');
    expect(await screen.findByRole('dialog')).toBeInTheDocument();
  });

  it('has a clear empty state, a loading state and an error that does not break the page', () => {
    const { unmount } = show({ activity: { ...activity, daily: [] } });
    expect(screen.getByText('No hours logged yet')).toBeInTheDocument();
    unmount();
    const loading = show({ isLoading: true, activity: undefined });
    expect(loading.container.querySelector('[aria-busy="true"]')).not.toBeNull();
    loading.unmount();
    show({ isError: true, activity: undefined });
    expect(screen.getByRole('alert')).toHaveTextContent(/Couldn't load the activity analytics/);
  });
});

describe('get_client_package_activity safety', () => {
  const sql = readFileSync('supabase/migrations/20261120010000_get_client_package_activity.sql', 'utf8').replace(/--[^\n]*/g, '');
  it('never reads note text, titles, tags, staff or free text', () => {
    for (const forbidden of ['note_details', 'n.title', 'tags', 'assignees', 'uploaded_files', 'te.notes', 'user_id', 'meeting_summaries']) {
      expect(sql).not.toContain(forbidden);
    }
  });
  it('limits notes to four allow-listed kinds and checks the tenant against the caller', () => {
    expect(sql).toContain("n.note_type in ('email', 'meeting', 'phone-call', 'phone', 'follow-up')");
    expect(sql).toContain('app.user_can_access_tenant(p_tenant_id)');
    expect(sql).toContain('pi.tenant_id = p_tenant_id');
    expect(sql).toContain('from anon');
  });
});
