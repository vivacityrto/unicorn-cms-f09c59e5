import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { describe, expect, it } from 'vitest';
import type { DirectoryPerson } from '@/lib/contactGroups/resolveGroupMembers';
import { GroupMembersPanel } from '../GroupMembersPanel';

const person = (n: number, over: Partial<DirectoryPerson> = {}): DirectoryPerson => ({
  row_key: `user:${n}`,
  source: 'user',
  tenant_id: 1,
  tenant_name: 'Acme RTO',
  first_name: `Person${String(n).padStart(2, '0')}`,
  last_name: 'Test',
  email: `person${n}@example.com`,
  position_type: null,
  status: 'active',
  ...over,
});

const refs = (ids: number[], type = 'user') =>
  ids.map((id) => ({ group_id: 1, member_type: type, member_id: String(id) }));

describe('GroupMembersPanel', () => {
  it('lists each member with email, client, type and status', () => {
    render(
      <GroupMembersPanel
        groupName="Leadership Team"
        members={[...refs([1]), ...refs([2], 'contact')]}
        directory={[
          person(1),
          person(2, { row_key: 'contact:2', source: 'contact', status: 'archived', tenant_name: 'Beta RTO' }),
        ]}
        positionTypeOptions={[]}
      />,
    );
    expect(screen.getByText('Person01 Test')).toBeInTheDocument();
    expect(screen.getByText('person1@example.com')).toBeInTheDocument();
    expect(screen.getByText('Beta RTO')).toBeInTheDocument();
    expect(screen.getByText('Contact')).toBeInTheDocument();
    expect(screen.getByText('archived')).toBeInTheDocument();
    expect(screen.getByText('2 members')).toBeInTheDocument();
    expect(screen.queryByLabelText(/Search members/)).not.toBeInTheDocument();
  });

  it('says so when the group is empty', () => {
    render(<GroupMembersPanel groupName="Empty" members={[]} directory={[]} positionTypeOptions={[]} />);
    expect(screen.getByText('This group has no members yet.')).toBeInTheDocument();
  });

  it('flags members whose record is gone', () => {
    render(<GroupMembersPanel groupName="G" members={refs([99])} directory={[]} positionTypeOptions={[]} />);
    expect(screen.getByText('(no longer in the directory)')).toBeInTheDocument();
    expect(screen.getByText('missing')).toBeInTheDocument();
  });

  it('adds a search box for long lists and filters by name', async () => {
    const user = userEvent.setup();
    const ids = Array.from({ length: 12 }, (_, i) => i + 1);
    render(
      <GroupMembersPanel
        groupName="Everyone"
        members={refs(ids)}
        directory={ids.map((n) => person(n))}
        positionTypeOptions={[]}
      />,
    );
    await user.type(screen.getByLabelText('Search members of Everyone'), 'Person07');
    expect(screen.getByText('Person07 Test')).toBeInTheDocument();
    expect(screen.queryByText('Person08 Test')).not.toBeInTheDocument();
    expect(screen.getByText('1 of 12 members')).toBeInTheDocument();

    await user.clear(screen.getByLabelText('Search members of Everyone'));
    await user.type(screen.getByLabelText('Search members of Everyone'), 'zzz');
    expect(screen.getByText(/No members match/)).toBeInTheDocument();
  });
});
