import { describe, expect, it } from 'vitest';
import { filterGroupMembers, resolveGroupMembers, type DirectoryPerson } from './resolveGroupMembers';

const person = (over: Partial<DirectoryPerson>): DirectoryPerson => ({
  row_key: 'user:1',
  source: 'user',
  tenant_id: 10,
  tenant_name: 'Acme RTO',
  first_name: 'Amanda',
  last_name: 'Hardy',
  email: 'amanda@example.com',
  position_type: 'ceo',
  status: 'active',
  ...over,
});

describe('resolveGroupMembers', () => {
  const directory = [
    person({ row_key: 'user:1' }),
    person({ row_key: 'contact:5', source: 'contact', first_name: 'Ben', last_name: null, email: 'ben@example.com', tenant_name: 'Beta RTO', status: 'archived' }),
    person({ row_key: 'user:2', first_name: 'Zoe', last_name: 'Adams', email: 'zoe@example.com' }),
  ];

  it('looks members up by type and id, and sorts A-Z', () => {
    const result = resolveGroupMembers(
      [
        { group_id: 1, member_type: 'user', member_id: '2' },
        { group_id: 1, member_type: 'contact', member_id: '5' },
        { group_id: 1, member_type: 'user', member_id: '1' },
      ],
      directory,
    );
    expect(result.map((m) => m.name)).toEqual(['Amanda Hardy', 'Ben', 'Zoe Adams']);
    expect(result[1]).toMatchObject({ source: 'contact', tenantName: 'Beta RTO', status: 'archived', missing: false });
  });

  it('keeps a user and a contact with the same numeric id distinct', () => {
    const dir = [
      person({ row_key: 'user:7', first_name: 'Una' }),
      person({ row_key: 'contact:7', source: 'contact', first_name: 'Carl' }),
    ];
    const result = resolveGroupMembers(
      [
        { group_id: 1, member_type: 'user', member_id: '7' },
        { group_id: 1, member_type: 'contact', member_id: '7' },
      ],
      dir,
    );
    expect(result.map((m) => m.name).sort()).toEqual(['Carl Hardy', 'Una Hardy']);
  });

  it('flags members that are no longer in the directory and lists them last', () => {
    const result = resolveGroupMembers(
      [
        { group_id: 1, member_type: 'user', member_id: '999' },
        { group_id: 1, member_type: 'user', member_id: '1' },
      ],
      directory,
    );
    expect(result[0].name).toBe('Amanda Hardy');
    expect(result[1]).toMatchObject({ missing: true, status: 'missing', name: '(no longer in the directory)' });
  });

  it('handles an empty group', () => {
    expect(resolveGroupMembers([], directory)).toEqual([]);
  });
});

describe('filterGroupMembers', () => {
  const members = resolveGroupMembers(
    [
      { group_id: 1, member_type: 'user', member_id: '1' },
      { group_id: 1, member_type: 'contact', member_id: '5' },
    ],
    [
      person({ row_key: 'user:1' }),
      person({ row_key: 'contact:5', source: 'contact', first_name: 'Ben', last_name: null, email: 'ben@example.com', tenant_name: 'Beta RTO' }),
    ],
  );

  it('matches name, email and client, case-insensitively', () => {
    expect(filterGroupMembers(members, 'AMANDA').map((m) => m.name)).toEqual(['Amanda Hardy']);
    expect(filterGroupMembers(members, 'ben@').map((m) => m.name)).toEqual(['Ben']);
    expect(filterGroupMembers(members, 'beta').map((m) => m.name)).toEqual(['Ben']);
  });

  it('returns everyone for a blank query and nobody for no match', () => {
    expect(filterGroupMembers(members, '  ')).toHaveLength(2);
    expect(filterGroupMembers(members, 'nobody')).toHaveLength(0);
  });
});
