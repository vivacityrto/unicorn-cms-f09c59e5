import { readFileSync } from 'node:fs';
import { render, screen, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import type { CheckinState } from './checkins';

const h = vi.hoisted(() => ({
  state: { data: undefined, isLoading: false, isError: false } as { data: unknown; isLoading: boolean; isError: boolean },
  mutate: vi.fn(),
  pending: false,
}));

vi.mock('@/hooks/use-package-checkin', () => ({
  usePackageCheckinState: () => h.state,
  useSubmitCheckin: () => ({ mutate: h.mutate, isPending: h.pending }),
}));

import { PackageCheckIn } from './PackageCheckIn';

const due: CheckinState = { eligible: true, pulse_due: true, confidence_due: true, history: [], blockers_last_30_days: 0 };
const answered: CheckinState = {
  eligible: true,
  pulse_due: false,
  next_pulse_on: '2026-12-03',
  confidence_due: false,
  history: [
    { kind: 'pulse', score: 3, created_at: '2026-11-05T00:00:00Z' },
    { kind: 'pulse', score: 4, created_at: '2026-11-19T00:00:00Z' },
  ],
  blockers_last_30_days: 1,
};

beforeEach(() => {
  h.state = { data: due, isLoading: false, isError: false };
  h.mutate = vi.fn((_input, opts) => opts?.onSuccess?.());
  h.pending = false;
});

describe('PackageCheckIn', () => {
  it('shows nothing to anyone who is not eligible, on error, and a placeholder while loading', () => {
    h.state = { data: { eligible: false }, isLoading: false, isError: false };
    expect(render(<PackageCheckIn packageInstanceId={1} />).container).toBeEmptyDOMElement();
    h.state = { data: undefined, isLoading: false, isError: true };
    expect(render(<PackageCheckIn packageInstanceId={1} />).container).toBeEmptyDOMElement();
    h.state = { data: undefined, isLoading: true, isError: false };
    expect(render(<PackageCheckIn packageInstanceId={1} />).container.querySelector('[class*="animate-pulse"]')).not.toBeNull();
  });

  it('sends a pulse with an optional note, and thanks the person', async () => {
    render(<PackageCheckIn packageInstanceId={1} />);
    expect(screen.getByText(/Only you and your consultant see them/)).toBeInTheDocument();
    expect(screen.queryByRole('button', { name: 'Send' })).not.toBeInTheDocument();
    const pulse = screen.getByRole('radiogroup', { name: /How is this package going/ });
    await userEvent.click(within(pulse).getByRole('radio', { name: /4\s*Good/ }));
    await userEvent.type(screen.getByLabelText(/Anything you would like your consultant to know/), 'Busy month');
    await userEvent.click(screen.getByRole('button', { name: 'Send' }));
    expect(h.mutate).toHaveBeenCalledWith({ kind: 'pulse', score: 4, comment: 'Busy month' }, expect.anything());
    expect(await screen.findByRole('status')).toHaveTextContent('Thank you. Your consultant has your answer.');
  });

  it('saves a confidence rating on one tap', async () => {
    render(<PackageCheckIn packageInstanceId={1} />);
    const conf = screen.getByRole('radiogroup', { name: /Confidence about your next audit/ });
    await userEvent.click(within(conf).getByRole('radio', { name: /2\s*Not very/ }));
    expect(h.mutate).toHaveBeenCalledWith({ kind: 'confidence', score: 2 }, expect.anything());
  });

  it('needs a category and some detail before a blocker can be sent', async () => {
    render(<PackageCheckIn packageInstanceId={1} />);
    await userEvent.click(screen.getByRole('button', { name: /Something is blocking me/ }));
    const send = screen.getByRole('button', { name: 'Send to my consultant' });
    expect(send).toBeDisabled();
    await userEvent.click(screen.getByRole('button', { name: 'Evidence' }));
    await userEvent.type(screen.getByLabelText(/A little detail/), 'Cannot find the PD records');
    expect(send).toBeEnabled();
    await userEvent.click(send);
    expect(h.mutate).toHaveBeenCalledWith({ kind: 'blocker', category: 'evidence', comment: 'Cannot find the PD records' }, expect.anything());
    expect(await screen.findByRole('status')).toHaveTextContent('Your consultant will follow up');
  });

  it('shows the next check-in date and the person’s own trend once they have answered', () => {
    h.state = { data: answered, isLoading: false, isError: false };
    render(<PackageCheckIn packageInstanceId={1} />);
    expect(screen.getByText(/The next one is on 3 December/)).toBeInTheDocument();
    expect(screen.getByRole('img', { name: 'Your pulse answers: 3, 4 out of 5' })).toBeInTheDocument();
    expect(screen.getByText(/higher than the one before \(3 to 4\)/)).toBeInTheDocument();
    expect(screen.getByText(/You have flagged 1 thing in the last 30 days/)).toBeInTheDocument();
    expect(screen.queryByRole('radiogroup')).not.toBeInTheDocument();
  });

  it('shows the database refusal in plain words', async () => {
    h.mutate = vi.fn((_input, opts) => opts?.onError?.(new Error('RATE_LIMITED: you have already answered the pulse recently')));
    render(<PackageCheckIn packageInstanceId={1} />);
    await userEvent.click(within(screen.getByRole('radiogroup', { name: /How is this package going/ })).getByRole('radio', { name: /5\s*Great/ }));
    await userEvent.click(screen.getByRole('button', { name: 'Send' }));
    expect(await screen.findByRole('alert')).toHaveTextContent('You have already answered the pulse recently.');
  });
});

describe('package check-in migration safety', () => {
  const sql = readFileSync('supabase/migrations/20261120030000_package_checkins.sql', 'utf8').replace(/--[^\n]*/g, '');
  it('turns on row security and gives no direct way to write', () => {
    expect(sql).toContain('enable row level security');
    expect(sql).not.toMatch(/create policy[^;]*for (insert|update|delete|all)/i);
    expect(sql).toContain('revoke all on public.package_checkins from authenticated');
    expect(sql).toContain('grant select on public.package_checkins to authenticated');
    expect(sql).not.toMatch(/grant (insert|update|delete)/i);
  });
  it('lets a person read only their own answers, plus staff', () => {
    expect(sql).toContain('using (user_id = auth.uid())');
    expect(sql).toContain('using (app.is_vivacity_team())');
  });
  it('takes the person from the sign-in, limits who can answer, validates and rate-limits', () => {
    expect(sql).toContain('v_uid uuid := auth.uid()');
    expect(sql).toContain("tu.access_scope = 'full'");
    expect(sql).toContain('package_checkin_caller_ok');
    expect(sql).toContain("interval '13 days'");
    expect(sql).toContain('char_length(comment) <= 280');
    expect(sql).toContain('from anon');
  });
  it('refuses staff even if they also hold a membership, and serialises overlapping answers', () => {
    expect(sql).toContain('not app.is_vivacity_team()');
    expect(sql).toContain('not app.is_super_admin()');
    expect(sql).toContain('u.is_vivacity_internal = true');
    expect(sql).toContain('pg_advisory_xact_lock(hashtextextended(v_uid::text');
    // The lock is taken before any rate-limit check.
    expect(sql.indexOf('pg_advisory_xact_lock')).toBeLessThan(sql.indexOf("interval '13 days'"));
  });
  it('is not read by any AI code', () => {
    for (const f of ['supabase/functions/_shared/client-insights.ts', 'supabase/functions/client-insights/index.ts']) {
      expect(readFileSync(f, 'utf8')).not.toContain('package_checkins');
    }
  });
});
