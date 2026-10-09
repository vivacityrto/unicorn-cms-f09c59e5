import { render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import type { DirectoryPerson } from '@/lib/contactGroups/resolveGroupMembers';

const service = vi.hoisted(() => ({
  addPeopleToGroup: vi.fn(),
  removePersonFromGroup: vi.fn(),
  createTenantContact: vi.fn(),
}));

vi.mock('@/services/contactGroupsService', async () => {
  const actual = await vi.importActual<typeof import('@/services/contactGroupsService')>('@/services/contactGroupsService');
  return { ...actual, ...service };
});
vi.mock('sonner', () => ({ toast: { success: vi.fn(), error: vi.fn() } }));
// Radix Select needs pointer APIs jsdom lacks; a native <select> exercises the same props.
vi.mock('@/components/ui/select', () => ({
  Select: ({ value, onValueChange, children }: { value: string; onValueChange: (v: string) => void; children: React.ReactNode }) => (
    <select aria-label="Position type" value={value} onChange={(e) => onValueChange(e.target.value)}>
      {children}
    </select>
  ),
  SelectTrigger: () => null,
  SelectValue: () => null,
  SelectContent: ({ children }: { children: React.ReactNode }) => <>{children}</>,
  SelectItem: ({ value, children }: { value: string; children: React.ReactNode }) => <option value={value}>{children}</option>,
}));

import { AddPeopleToGroupPanel } from '../AddPeopleToGroupPanel';
import { GroupMembersPanel } from '../GroupMembersPanel';
import { RemoveMemberConfirm } from '../RemoveMemberConfirm';

const person = (over: Partial<DirectoryPerson>): DirectoryPerson => ({
  row_key: 'user:1',
  source: 'user',
  tenant_id: 10,
  tenant_name: 'Acme RTO',
  first_name: 'Amanda',
  last_name: 'Hardy',
  email: 'amanda@example.com',
  position_type: null,
  status: 'active',
  ...over,
});

const directory = [
  person({ row_key: 'user:1' }),
  person({ row_key: 'contact:2', source: 'contact', first_name: 'Ben', last_name: 'Carter', email: 'ben@beta.com', tenant_id: 11, tenant_name: 'Beta College' }),
];
const clients = [
  { id: 10, name: 'Acme RTO' },
  { id: 11, name: 'Beta College' },
];

function renderAdd(onChanged = vi.fn(), memberKeys = new Set<string>()) {
  render(
    <AddPeopleToGroupPanel
      group={{ id: 7, name: 'Leadership Team' }}
      directory={directory}
      memberKeys={memberKeys}
      clients={clients}
      positionTypeOptions={[]}
      onChanged={onChanged}
    />,
  );
  return onChanged;
}

describe('AddPeopleToGroupPanel', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    service.addPeopleToGroup.mockResolvedValue({ ok: true });
    service.createTenantContact.mockResolvedValue({ ok: true, id: 99 });
  });

  it('searches the directory and adds the chosen person to the group', async () => {
    const user = userEvent.setup();
    const onChanged = renderAdd();
    await user.type(screen.getByLabelText('Search the directory to add people'), 'ben');
    await user.click(await screen.findByRole('button', { name: /Add Ben Carter to Leadership Team/ }));
    expect(service.addPeopleToGroup).toHaveBeenCalledWith(7, [{ source: 'contact', id: 2, tenantId: 11 }]);
    await waitFor(() => expect(onChanged).toHaveBeenCalled());
  });

  it('does not offer people who are already in the group', async () => {
    const user = userEvent.setup();
    renderAdd(vi.fn(), new Set(['contact:2']));
    await user.type(screen.getByLabelText('Search the directory to add people'), 'ben');
    expect(await screen.findByText(/Nobody active matches/)).toBeInTheDocument();
  });

  it('will not create a contact without a client, both names and a valid email', async () => {
    const user = userEvent.setup();
    renderAdd();
    await user.click(screen.getByRole('button', { name: /New contact/ }));
    await user.click(screen.getByRole('button', { name: /Create and add to Leadership Team/ }));
    expect(await screen.findByText('Choose the client this contact belongs to')).toBeInTheDocument();
    expect(screen.getByText('First name is required')).toBeInTheDocument();
    expect(screen.getByText(/Last name is required for Teams registration/)).toBeInTheDocument();
    expect(screen.getByText('Enter a valid email address')).toBeInTheDocument();
    expect(service.createTenantContact).not.toHaveBeenCalled();
  });

  it('creates a contact attached to the chosen client, then adds them to the group', async () => {
    const user = userEvent.setup();
    const onChanged = renderAdd();
    await user.click(screen.getByRole('button', { name: /New contact/ }));
    await user.type(screen.getByLabelText('Client'), 'beta');
    await user.click(await screen.findByRole('button', { name: 'Beta College' }));
    await user.type(screen.getByLabelText('First name'), 'Cara');
    await user.type(screen.getByLabelText('Last name'), 'Doyle');
    await user.type(screen.getByLabelText('Email'), 'Cara@Beta.com');
    await user.click(screen.getByRole('button', { name: /Create and add to Leadership Team/ }));

    await waitFor(() =>
      expect(service.createTenantContact).toHaveBeenCalledWith({
        tenantId: 11,
        firstName: 'Cara',
        lastName: 'Doyle',
        email: 'Cara@Beta.com',
        positionType: null,
      }),
    );
    expect(service.addPeopleToGroup).toHaveBeenCalledWith(7, [{ source: 'contact', id: 99, tenantId: 11 }]);
    await waitFor(() => expect(onChanged).toHaveBeenCalled());
  });

  it('blocks a duplicate email within the same client and warns about one elsewhere', async () => {
    const user = userEvent.setup();
    renderAdd();
    await user.click(screen.getByRole('button', { name: /New contact/ }));
    await user.type(screen.getByLabelText('Client'), 'beta');
    await user.click(await screen.findByRole('button', { name: 'Beta College' }));
    await user.type(screen.getByLabelText('Email'), 'ben@beta.com');
    expect(await screen.findByText(/already has this email/)).toBeInTheDocument();
    expect(screen.getByRole('button', { name: /Create and add to Leadership Team/ })).toBeDisabled();

    await user.clear(screen.getByLabelText('Email'));
    await user.type(screen.getByLabelText('Email'), 'amanda@example.com');
    expect(await screen.findByText(/already exists in the directory/)).toBeInTheDocument();
    expect(screen.getByRole('button', { name: /Create and add to Leadership Team/ })).toBeEnabled();
  });
});

describe('removing a person from a group', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    service.removePersonFromGroup.mockResolvedValue({ ok: true });
  });

  it('offers a remove button per member only when a handler is given', () => {
    const members = [{ group_id: 7, member_type: 'user', member_id: '1' }];
    const { rerender } = render(
      <GroupMembersPanel groupName="Leadership Team" members={members} directory={directory} positionTypeOptions={[]} />,
    );
    expect(screen.queryByRole('button', { name: /Remove Amanda Hardy/ })).not.toBeInTheDocument();
    rerender(
      <GroupMembersPanel
        groupName="Leadership Team"
        members={members}
        directory={directory}
        positionTypeOptions={[]}
        onRemove={vi.fn()}
      />,
    );
    expect(screen.getByRole('button', { name: 'Remove Amanda Hardy from Leadership Team' })).toBeInTheDocument();
  });

  it('confirms first, then removes exactly that person and tells the caller', async () => {
    const user = userEvent.setup();
    const onRemoved = vi.fn();
    const onClose = vi.fn();
    render(
      <RemoveMemberConfirm
        request={{ groupId: 7, groupName: 'Leadership Team', memberKey: 'contact:2', memberName: 'Ben Carter' }}
        onClose={onClose}
        onRemoved={onRemoved}
      />,
    );
    expect(screen.getByText(/Teams\s+registrations they already hold are not changed/)).toBeInTheDocument();
    expect(service.removePersonFromGroup).not.toHaveBeenCalled();
    await user.click(screen.getByRole('button', { name: 'Remove' }));
    await waitFor(() => expect(service.removePersonFromGroup).toHaveBeenCalledWith(7, 'contact', 2));
    await waitFor(() => expect(onRemoved).toHaveBeenCalled());
    expect(onClose).toHaveBeenCalled();
  });

  it('keeps the dialog open and does not refresh when the removal fails', async () => {
    const user = userEvent.setup();
    service.removePersonFromGroup.mockResolvedValue({ ok: false, message: 'Could not remove from the group.' });
    const onRemoved = vi.fn();
    const onClose = vi.fn();
    render(
      <RemoveMemberConfirm
        request={{ groupId: 7, groupName: 'G', memberKey: 'user:1', memberName: 'Amanda Hardy' }}
        onClose={onClose}
        onRemoved={onRemoved}
      />,
    );
    await user.click(screen.getByRole('button', { name: 'Remove' }));
    await waitFor(() => expect(service.removePersonFromGroup).toHaveBeenCalled());
    expect(onRemoved).not.toHaveBeenCalled();
    expect(onClose).not.toHaveBeenCalled();
  });
});
