import { render, screen, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { MemoryRouter } from 'react-router-dom';
import { describe, expect, it, vi } from 'vitest';
import type { TenantAcademyLearnerAnalytics } from '@/features/pdp/useTenantAcademyStaffStats';

const state = vi.hoisted(() => ({ result: { data: undefined, isLoading: false, error: null } as unknown, detail: { data: undefined, isLoading: false, error: null } as unknown, detailArgs: [] as unknown[] }));
vi.mock('@/features/pdp/useTenantAcademyStaffStats', () => ({
  useTenantAcademyLearnerAnalytics: () => state.result,
  useTenantAcademyLearnerDetail: (...args: unknown[]) => {
    state.detailArgs = args;
    return state.detail;
  },
}));

import { AcademyActivityDashboard } from './AcademyActivityDashboard';

const now = new Date();
const daysAgo = (n: number) => new Date(now.getTime() - n * 86_400_000).toISOString();

const data = (over: Partial<TenantAcademyLearnerAnalytics> = {}): TenantAcademyLearnerAnalytics => ({
  last_updated_at: daysAgo(0),
  counted_source: 'self_enrol',
  totals: { learners: 2, chosen: 5, finished: 2, certificates: 2, lessons_completed: 30, minutes: 300, active_30d: 1, not_counted: { enrolments: 40, finished: 3 } },
  trend: Array.from({ length: 12 }, (_, i) => ({ week_start: `2026-09-${String(i + 1).padStart(2, '0')}`, active_learners: 1, chosen: 0, finished: 0, lessons: 3 })),
  courses: [{ course_id: 1, course_title: 'Governance basics', chosen: 3, started: 3, finished: 2, certified: 2, stalled: 1, median_days: 8 }],
  learners: [
    { user_id: 'a', name: 'Ana Active', email: 'ana@example.com', chosen: 3, finished: 2, lessons_completed: 20, minutes: 200, last_active: daysAgo(3), any_started: true },
    { user_id: 'b', name: 'Quinn Quiet', email: null, chosen: 2, finished: 0, lessons_completed: 10, minutes: 100, last_active: daysAgo(60), any_started: true },
  ],
  stalled: [{ name: 'Quinn Quiet', course_title: 'Governance basics', days_quiet: 60 }],
  ...over,
});

const show = () => render(<MemoryRouter><AcademyActivityDashboard tenantId={1} /></MemoryRouter>);

describe('AcademyActivityDashboard', () => {
  it('shows only learner-chosen figures and says what was left out', () => {
    state.result = { data: data(), isLoading: false, error: null };
    show();
    const numbers = screen.getByRole('region', { name: 'Key numbers' });
    expect(within(numbers).getByText('2 of 5')).toBeInTheDocument();
    expect(within(numbers).getByText('30')).toBeInTheDocument();
    expect(screen.getByText(/40 courses were added for your team another way and are not counted/)).toBeInTheDocument();
  });

  it('labels who is active and who has gone quiet, and lists untouched courses', () => {
    state.result = { data: data(), isLoading: false, error: null };
    show();
    expect(screen.getByText('Active')).toBeInTheDocument();
    expect(screen.getByText('Gone quiet')).toBeInTheDocument();
    expect(screen.getByText(/untouched for 60 days/)).toBeInTheDocument();
    expect(screen.getByRole('region', { name: 'At a glance' })).toHaveTextContent('2 team members chose 5 courses and finished 2 (40%).');
  });

  it('has a helpful empty state that still mentions automatic courses', () => {
    state.result = { data: data({ totals: { ...data().totals, chosen: 0, learners: 0, finished: 0 } }), isLoading: false, error: null };
    show();
    expect(screen.getByText('No courses chosen yet')).toBeInTheDocument();
    expect(screen.getByText(/40 courses were added for your team by Vivacity/)).toBeInTheDocument();
  });

  it('shows an error message when the figures cannot load', () => {
    state.result = { data: undefined, isLoading: false, error: new Error('x') };
    show();
    expect(screen.getByText('Failed to load Academy activity.')).toBeInTheDocument();
  });

  describe('one person detail', () => {
    const detail = {
      last_updated_at: daysAgo(0),
      learner: { user_id: 'b', name: 'Quinn Quiet', email: null },
      totals: { chosen: 2, finished: 0, certificates: 0, lessons_completed: 10, lessons_total: 24, minutes: 100, last_active: daysAgo(60) },
      courses: [
        { course_id: 1, course_title: 'Governance basics', enrolled_at: daysAgo(90), completed_at: null, started: true, certified: false, lessons_total: 12, lessons_completed: 6, minutes: 60, last_touch: daysAgo(60) },
        { course_id: 2, course_title: 'Risk essentials', enrolled_at: daysAgo(30), completed_at: null, started: false, certified: false, lessons_total: 12, lessons_completed: 0, minutes: 0, last_touch: null },
      ],
      trend: Array.from({ length: 12 }, (_, i) => ({ week_start: `2026-09-${String(i + 1).padStart(2, '0')}`, lessons: i === 3 ? 4 : 0, minutes: 10 })),
    };

    it('opens a mini page for the person clicked, asking for that person only', async () => {
      state.result = { data: data(), isLoading: false, error: null };
      state.detail = { data: detail, isLoading: false, error: null };
      show();
      await userEvent.click(screen.getByRole('button', { name: "Open Quinn Quiet's Academy activity" }));
      expect(state.detailArgs).toEqual([1, 'b']);
      const sheet = await screen.findByRole('dialog');
      expect(within(sheet).getByText('Quinn Quiet')).toBeInTheDocument();
      expect(within(sheet).getByText('Governance basics')).toBeInTheDocument();
      expect(within(sheet).getByText('Untouched 30+ days')).toBeInTheDocument();
      expect(within(sheet).getByText('Not started')).toBeInTheDocument();
      expect(within(sheet).getByRole('region', { name: 'At a glance' })).toHaveTextContent('Chose 2 courses and finished 0.');
    });

    it('shows a loading state and then a clear error if the details cannot load', async () => {
      state.result = { data: data(), isLoading: false, error: null };
      state.detail = { data: undefined, isLoading: true, error: null };
      show();
      await userEvent.click(screen.getByRole('button', { name: "Open Ana Active's Academy activity" }));
      expect((await screen.findByRole('dialog')).querySelector('[aria-busy="true"]')).not.toBeNull();
    });

    it('says so when the details fail to load', async () => {
      state.result = { data: data(), isLoading: false, error: null };
      state.detail = { data: undefined, isLoading: false, error: new Error('x') };
      show();
      await userEvent.click(screen.getByRole('button', { name: "Open Ana Active's Academy activity" }));
      expect(await screen.findByRole('alert')).toHaveTextContent(/Could not load/);
    });
  });
});
