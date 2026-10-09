import { render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { beforeEach, describe, expect, it, vi } from 'vitest';

const mocks = vi.hoisted(() => ({
  removePersonFromGroup: vi.fn(),
  findUpcomingRegistrations: vi.fn(),
  cancelRegistrations: vi.fn(),
}));

vi.mock('@/services/contactGroupsService', async () => {
  const actual = await vi.importActual<typeof import('@/services/contactGroupsService')>('@/services/contactGroupsService');
  return { ...actual, removePersonFromGroup: mocks.removePersonFromGroup };
});
vi.mock('@/services/teamsEventsService', async () => {
  const actual = await vi.importActual<typeof import('@/services/teamsEventsService')>('@/services/teamsEventsService');
  return {
    ...actual,
    findUpcomingRegistrations: mocks.findUpcomingRegistrations,
    teamsEventsService: { ...actual.teamsEventsService, cancelRegistrations: mocks.cancelRegistrations },
  };
});
vi.mock('sonner', () => ({ toast: { success: vi.fn(), error: vi.fn() } }));

import { RemoveMemberConfirm } from '../RemoveMemberConfirm';

const request = { groupId: 7, groupName: 'Leadership Team', memberKey: 'user:1', memberName: 'Amanda Hardy' };
const registrations = [
  { eventId: 'evt-1@t', eventName: 'The Compliance Lab', startUtc: '2026-10-15T02:00:00.000Z' },
  { eventId: 'evt-2@t', eventName: 'AI in Your RTO', startUtc: '2026-10-12T04:00:00.000Z' },
];

function setup(canCancel = true) {
  const onClose = vi.fn();
  const onRemoved = vi.fn();
  render(<RemoveMemberConfirm request={request} onClose={onClose} onRemoved={onRemoved} canCancelRegistrations={canCancel} />);
  return { onClose, onRemoved };
}

describe('RemoveMemberConfirm with registrations', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mocks.removePersonFromGroup.mockResolvedValue({ ok: true });
    mocks.findUpcomingRegistrations.mockResolvedValue(registrations);
  });

  it('lists their upcoming registrations, all unticked, and cancels nothing unless asked', async () => {
    const user = userEvent.setup();
    const { onClose, onRemoved } = setup();
    expect(await screen.findByText('Their upcoming Teams registrations')).toBeInTheDocument();
    const boxes = screen.getAllByRole('checkbox');
    expect(boxes).toHaveLength(2);
    boxes.forEach((b) => expect(b).not.toBeChecked());

    await user.click(screen.getByRole('button', { name: 'Remove' }));
    await waitFor(() => expect(mocks.removePersonFromGroup).toHaveBeenCalledWith(7, 'user', 1));
    expect(mocks.cancelRegistrations).not.toHaveBeenCalled();
    await waitFor(() => expect(onRemoved).toHaveBeenCalled());
    expect(onClose).toHaveBeenCalled();
  });

  it('removes them, then cancels only the ticked events and reports each result', async () => {
    const user = userEvent.setup();
    mocks.cancelRegistrations.mockResolvedValue({
      event: { id: 'evt-1@t' },
      outcomes: [{ member_key: 'user:1', status: 'cancelled' }],
      counts: { cancelled: 1, not_registered: 0, failed: 0 },
    });
    const { onClose } = setup();
    await screen.findByText('Their upcoming Teams registrations');
    await user.click(screen.getAllByRole('checkbox')[0]);
    await user.click(screen.getByRole('button', { name: 'Remove and cancel 1' }));

    await waitFor(() => expect(mocks.cancelRegistrations).toHaveBeenCalledTimes(1));
    expect(mocks.removePersonFromGroup).toHaveBeenCalledBefore(mocks.cancelRegistrations);
    expect(mocks.cancelRegistrations).toHaveBeenCalledWith('evt-1@t', ['user:1']);
    expect(await screen.findByText('Amanda Hardy: registration cancelled')).toBeInTheDocument();
    expect(onClose).not.toHaveBeenCalled(); // stays open to show the result
    await user.click(screen.getByRole('button', { name: 'Done' }));
    expect(onClose).toHaveBeenCalled();
  });

  it('tells the operator to remove them in Teams when Microsoft refuses', async () => {
    const user = userEvent.setup();
    mocks.cancelRegistrations.mockResolvedValue({
      event: { id: 'evt-1@t' },
      outcomes: [{ member_key: 'user:1', status: 'failed', error_code: 'auth_or_consent', message: 'raw' }],
      counts: { cancelled: 0, not_registered: 0, failed: 1 },
    });
    setup();
    await screen.findByText('Their upcoming Teams registrations');
    await user.click(screen.getAllByRole('checkbox')[0]);
    await user.click(screen.getByRole('button', { name: 'Remove and cancel 1' }));

    expect(await screen.findByText('Remove this person in Teams yourself')).toBeInTheDocument();
    expect(screen.getByText(/Amanda Hardy is still registered for "The Compliance Lab"/)).toBeInTheDocument();
    expect(screen.getByText(/choose Registration, then Attendee status/)).toBeInTheDocument();
    expect(screen.getByText('Microsoft would not let Unicorn cancel registrations.')).toBeInTheDocument();
  });

  it('still reports the person as registered when the cancel request itself fails', async () => {
    const user = userEvent.setup();
    mocks.cancelRegistrations.mockRejectedValue(new Error('network'));
    setup();
    await screen.findByText('Their upcoming Teams registrations');
    await user.click(screen.getAllByRole('checkbox')[1]);
    await user.click(screen.getByRole('button', { name: 'Remove and cancel 1' }));
    expect(await screen.findByText(/They are still registered\. Remove them in Teams yourself\./)).toBeInTheDocument();
  });

  it('does not try to cancel anything when the group removal fails', async () => {
    const user = userEvent.setup();
    mocks.removePersonFromGroup.mockResolvedValue({ ok: false, message: 'Could not remove from the group.' });
    const { onRemoved, onClose } = setup();
    await screen.findByText('Their upcoming Teams registrations');
    await user.click(screen.getAllByRole('checkbox')[0]);
    await user.click(screen.getByRole('button', { name: 'Remove and cancel 1' }));
    await waitFor(() => expect(mocks.removePersonFromGroup).toHaveBeenCalled());
    expect(mocks.cancelRegistrations).not.toHaveBeenCalled();
    expect(onRemoved).not.toHaveBeenCalled();
    expect(onClose).not.toHaveBeenCalled();
  });

  it('without the Teams permission it never looks up or offers registrations', async () => {
    setup(false);
    expect(screen.getByText(/Teams registrations they already hold are not changed/)).toBeInTheDocument();
    expect(mocks.findUpcomingRegistrations).not.toHaveBeenCalled();
    expect(screen.queryByRole('checkbox')).not.toBeInTheDocument();
  });

  it('says so when they have no upcoming registration', async () => {
    mocks.findUpcomingRegistrations.mockResolvedValue([]);
    setup();
    expect(await screen.findByText(/Unicorn has no upcoming registration for them/)).toBeInTheDocument();
  });
});
