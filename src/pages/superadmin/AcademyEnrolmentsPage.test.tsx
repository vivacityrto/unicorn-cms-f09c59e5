import { fireEvent, render, screen } from '@testing-library/react';
import { MemoryRouter } from 'react-router-dom';
import { describe, expect, it, vi } from 'vitest';
import AcademyEnrolmentsPage from './AcademyEnrolmentsPage';

vi.mock('@/hooks/usePermission', () => ({ usePermission: () => false }));
vi.mock('@/components/academy/admin/EnrolmentProgressDrawer', () => ({ default: () => null }));
vi.mock('@/components/academy/admin/NewEnrolmentModal', () => ({ default: () => null }));
vi.mock('@/hooks/academy/useAcademyEnrollments', () => ({
  useEnrollmentRealtime: () => undefined,
  useAdminEnrollments: () => ({ isLoading: false, data: [
    { id: 1, course_id: 7, tenant_id: 12, source: 'self_enrol', status: 'active', user: { first_name: 'Chosen learner' } },
    { id: 2, course_id: 7, tenant_id: 12, source: 'manual', status: 'active', user: { first_name: 'Manual learner' } },
    { id: 3, course_id: 7, tenant_id: 12, source: 'auto_package', status: 'active', user: { first_name: 'Automatic learner' } },
    { id: 4, course_id: 7, tenant_id: 99, source: 'self_enrol', status: 'active', user: { first_name: 'Other tenant learner' } },
    { id: 5, course_id: 8, tenant_id: 12, source: 'self_enrol', status: 'active', user: { first_name: 'Other course learner' } },
  ] }),
  useEnrollmentProgress: () => ({ data: new Map() }),
  useEnrollmentFilterOptions: () => ({ courses: [{ id: 7, title: 'Example course' }], tenants: [{ id: 12, name: 'Example customer' }] }),
  useEnrollmentStats: () => ({ data: {}, isLoading: false }),
  useRevokeEnrollment: () => ({}),
  useReactivateEnrollment: () => ({}),
  useExtendEnrollment: () => ({}),
}));
vi.mock('@/hooks/academy/useAcademyEngagement', () => ({
  useAcademyEngagement: () => ({ data: {
    generated_at: '2026-11-19T00:00:00Z',
    totals: { enrolments: 1, learners: 1, video_started: 0, completed: 0, certificates: 0 },
    courses: [{ course_id: 7, title: 'Example course', enrolments: 1, learners: 1, video_started: 0, completed: 0, certificates: 0 }],
  }, isLoading: false, isError: false, isFetching: false, refetch: vi.fn() }),
}));

function openDashboard() {
  render(<MemoryRouter initialEntries={['/superadmin/academy/enrollments?view=engagement']}><AcademyEnrolmentsPage /></MemoryRouter>);
  fireEvent.change(screen.getByLabelText('Customer'), { target: { value: '12' } });
}

describe('Academy engagement enrolment drilldown', () => {
  it('keeps learner-chosen source, course and customer when navigating to management', () => {
    openDashboard();
    fireEvent.click(screen.getAllByRole('link', { name: /Review enrolments/ })[0]);
    expect(screen.getByText('Chosen learner')).toBeInTheDocument();
    for (const name of ['Manual learner', 'Automatic learner', 'Other tenant learner', 'Other course learner']) {
      expect(screen.queryByText(name)).not.toBeInTheDocument();
    }
    fireEvent.click(screen.getByRole('button', { name: 'self enrol' }));
    expect(screen.getByText('Manual learner')).toBeInTheDocument();
    expect(screen.getByText('Automatic learner')).toBeInTheDocument();
  });

  it('retains all sources when explicitly selected on the dashboard', () => {
    openDashboard();
    fireEvent.change(screen.getByLabelText('Enrolment source'), { target: { value: 'all' } });
    fireEvent.click(screen.getAllByRole('link', { name: /Review enrolments/ })[0]);
    for (const name of ['Chosen learner', 'Manual learner', 'Automatic learner']) {
      expect(screen.getByText(name)).toBeInTheDocument();
    }
    expect(screen.queryByText('Other tenant learner')).not.toBeInTheDocument();
    expect(screen.queryByText('Other course learner')).not.toBeInTheDocument();
  });
});
