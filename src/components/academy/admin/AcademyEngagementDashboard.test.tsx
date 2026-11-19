import { fireEvent, render, screen, within } from '@testing-library/react';
import { MemoryRouter } from 'react-router-dom';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import AcademyEngagementDashboard from './AcademyEngagementDashboard';
import { useAcademyEngagement } from '@/hooks/academy/useAcademyEngagement';
vi.mock('@/hooks/academy/useAcademyEngagement', () => ({ useAcademyEngagement: vi.fn() }));
const refetch = vi.fn();
const fixture = {
  generated_at: '2026-11-19T00:00:00Z',
  totals: { enrolments: 4, learners: 2, video_started: 1, completed: 2, certificates: 1 },
  courses: [{ course_id: 7, title: 'Assessment Validation', enrolments: 4, learners: 2, video_started: 1, completed: 2, certificates: 1 }],
};
function setup(value: object = {}) {
  vi.mocked(useAcademyEngagement, { partial: true }).mockReturnValue({ data: fixture, isError: false, isLoading: false, isFetching: false, refetch, ...value });
  render(<MemoryRouter><AcademyEngagementDashboard tenants={[{ id: 12, name: 'Example RTO' }]} /></MemoryRouter>);
}
beforeEach(() => vi.clearAllMocks());
describe('Academy dashboard', () => {
  it('separates certificates from completion, states the cohort and playback limitations', () => {
    setup();
    expect(screen.getByText(/not the date of viewing/)).toBeInTheDocument();
    expect(screen.getByText(/playback position is not watch time/)).toBeInTheDocument();
    const row = screen.getByRole('row', { name: /Assessment Validation/ });
    expect(within(row).getByText('50%')).toBeInTheDocument();
    expect(screen.getAllByRole('link', { name: /Review enrolments/ })[0]).toHaveAttribute('href', '/superadmin/academy/enrollments?course=7&source=self_enrol');
  });
  it('changes source/customer filters without treating automatic enrolments as demand', () => {
    setup();
    fireEvent.change(screen.getByLabelText('Customer'), { target: { value: '12' } });
    fireEvent.change(screen.getByLabelText('Enrolment source'), { target: { value: 'all' } });
    expect(vi.mocked(useAcademyEngagement).mock.lastCall?.[0]).toEqual({ from: '', to: '', tenantId: '12', source: 'all' });
  });
  it('hides metrics for invalid date ranges', () => {
    setup();
    fireEvent.change(screen.getByLabelText(/Enrolled from/), { target: { value: '2026-11-20' } });
    fireEvent.change(screen.getByLabelText(/Enrolled to/), { target: { value: '2026-11-19' } });
    expect(screen.getByRole('alert')).toHaveTextContent('start on or before the end');
    expect(screen.queryByText('Courses completed')).not.toBeInTheDocument();
  });
  it('does not present stale or zero data as a successful result after a failure', () => {
    setup({ isError: true });
    expect(screen.getByRole('alert')).toHaveTextContent('No zero totals');
    expect(screen.queryByText('Courses completed')).not.toBeInTheDocument();
    fireEvent.click(screen.getByRole('button', { name: 'Retry' }));
    expect(refetch).toHaveBeenCalledOnce();
  });
  it('shows a real empty cohort, not a failure', () => {
    setup({ data: { ...fixture, courses: [] } });
    expect(screen.getByText('No enrolments match this cohort.')).toBeInTheDocument();
    expect(screen.queryByRole('alert')).not.toBeInTheDocument();
  });
  it('shows loading without invented totals', () => {
    setup({ data: undefined, isLoading: true });
    expect(screen.getByRole('status')).toHaveTextContent('Loading');
    expect(screen.queryByText('Courses completed')).not.toBeInTheDocument();
  });
});
