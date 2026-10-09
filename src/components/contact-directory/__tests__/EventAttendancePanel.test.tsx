import { render, screen, waitFor, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { beforeEach, describe, expect, it, vi } from 'vitest';

const mocks = vi.hoisted(() => ({
  loadEventParticipants: vi.fn(),
  setAttendance: vi.fn(),
  toastSuccess: vi.fn(),
  toastError: vi.fn(),
  exportToCSV: vi.fn(),
}));

vi.mock('@/services/teamsEventRegistryService', () => ({ loadEventParticipants: mocks.loadEventParticipants }));
vi.mock('@/services/teamsEventsService', async () => {
  const actual = await vi.importActual<typeof import('@/services/teamsEventsService')>('@/services/teamsEventsService');
  return { ...actual, teamsEventsService: { ...actual.teamsEventsService, setAttendance: mocks.setAttendance } };
});
vi.mock('@/lib/exportCsv', () => ({ exportToCSV: mocks.exportToCSV }));
vi.mock('sonner', () => ({ toast: { success: mocks.toastSuccess, error: mocks.toastError } }));
vi.mock('../WalkInPanel', () => ({ WalkInPanel: () => <div>walk-in panel</div> }));

import { EventAttendancePanel } from '../EventAttendancePanel';
import { TeamsEventsError } from '@/services/teamsEventsService';

const event = {
  eventId: 'evt-1@t',
  name: 'The Compliance Lab',
  startUtc: '2020-01-01T03:00:00.000Z', // already started
  firstRegisteredAt: '2019-12-20T03:00:00.000Z',
  registered: 2,
  attended: 0,
};

const row = (over: Record<string, unknown> = {}) => ({
  graph_event_id: 'evt-1@t',
  tenant_id: 1,
  tenant_user_id: 10,
  tenant_contact_id: null,
  normalised_email: 'amy@example.com',
  first_name: 'Amy',
  last_name: 'Lee',
  result_status: 'registered',
  inclusion: 'group',
  processed_at: '2019-12-20T04:00:00.000Z',
  created_at: '2019-12-20T04:00:00.000Z',
  ...over,
});

function setup() {
  const client = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  render(
    <QueryClientProvider client={client}>
      <EventAttendancePanel event={event} />
    </QueryClientProvider>,
  );
}

describe('EventAttendancePanel', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mocks.loadEventParticipants.mockResolvedValue({
      items: [
        row(),
        row({ tenant_user_id: 11, normalised_email: 'ben@example.com', first_name: 'Ben' }),
        row({ tenant_user_id: 12, normalised_email: 'cat@example.com', first_name: 'Cat', result_status: 'cancelled' }),
      ],
      attendance: [],
      tenantNames: new Map([[1, 'Acme Training']]),
    });
    mocks.setAttendance.mockResolvedValue({ attendance: { member_key: 'user:10', attended: true, walk_in: false } });
  });

  it('shows counts, the client name and greys out cancelled people', async () => {
    setup();
    expect(await screen.findByText('Amy Lee')).toBeInTheDocument();
    // "Cancelled"/"No-show" also appear as row badges, so pick the stat caption.
    const stat = (label: string) =>
      screen.getAllByText(label).find((el) => el.tagName === 'P' && el.className.includes('uppercase'))!
        .parentElement as HTMLElement;
    expect(within(stat('Registered')).getByText('2')).toBeInTheDocument();
    expect(within(stat('No-show')).getByText('2')).toBeInTheDocument(); // event already started
    expect(within(stat('Cancelled')).getByText('1')).toBeInTheDocument();
    expect(screen.getAllByText('Acme Training').length).toBeGreaterThan(0);
    expect(screen.getByRole('checkbox', { name: 'Attended: Cat Lee' })).toBeDisabled();
    expect(screen.getByRole('checkbox', { name: 'Attended: Amy Lee' })).toBeEnabled();
  });

  it('records attendance by directory key and refreshes', async () => {
    const user = userEvent.setup();
    setup();
    await screen.findByText('Amy Lee');
    await user.click(screen.getByRole('checkbox', { name: 'Attended: Amy Lee' }));
    await waitFor(() => expect(mocks.setAttendance).toHaveBeenCalledWith('evt-1@t', 'user:10', true));
    await waitFor(() => expect(mocks.toastSuccess).toHaveBeenCalledWith('Amy Lee marked as attended'));
    expect(mocks.loadEventParticipants.mock.calls.length).toBeGreaterThan(1); // refetched
  });

  it('shows the server message when saving fails', async () => {
    const user = userEvent.setup();
    mocks.setAttendance.mockRejectedValue(new TeamsEventsError('Could not save attendance.', 'attendance_write_failed', 500));
    setup();
    await screen.findByText('Amy Lee');
    await user.click(screen.getByRole('checkbox', { name: 'Attended: Amy Lee' }));
    await waitFor(() => expect(mocks.toastError).toHaveBeenCalledWith('Could not save attendance.'));
    expect(mocks.toastSuccess).not.toHaveBeenCalled();
  });

  it('filters by search and exports exactly what is shown', async () => {
    const user = userEvent.setup();
    setup();
    await screen.findByText('Amy Lee');
    await user.type(screen.getByLabelText('Find a participant'), 'ben');
    expect(screen.queryByText('Amy Lee')).not.toBeInTheDocument();
    await user.click(screen.getByRole('button', { name: /Export CSV/ }));
    expect(mocks.exportToCSV).toHaveBeenCalledTimes(1);
    const [rows, filename] = mocks.exportToCSV.mock.calls[0];
    expect(rows).toHaveLength(1);
    expect(rows[0].Name).toBe('Ben Lee');
    expect(filename).toBe('teams_event_the_compliance_lab_participants');
  });

  it('opens the walk-in lookup on demand', async () => {
    const user = userEvent.setup();
    setup();
    await screen.findByText('Amy Lee');
    expect(screen.queryByText('walk-in panel')).not.toBeInTheDocument();
    await user.click(screen.getByRole('button', { name: /Add walk-in/ }));
    expect(screen.getByText('walk-in panel')).toBeInTheDocument();
  });
});
