import { describe, expect, it } from 'vitest';
import type { DirectoryPerson } from './resolveGroupMembers';
import {
  emptyNewContactForm,
  findPeopleByEmail,
  searchDirectory,
  searchTenants,
  validateNewContact,
} from './addPeople';

const person = (over: Partial<DirectoryPerson>): DirectoryPerson => ({
  row_key: 'user:1',
  source: 'user',
  tenant_id: 1,
  tenant_name: 'Acme RTO',
  first_name: 'Amanda',
  last_name: 'Hardy',
  email: 'amanda@example.com',
  position_type: null,
  status: 'active',
  ...over,
});

describe('searchDirectory', () => {
  const rows = [
    person({ row_key: 'user:1' }),
    person({ row_key: 'contact:2', source: 'contact', first_name: 'Ben', last_name: null, email: 'ben@beta.com', tenant_name: 'Beta College' }),
    person({ row_key: 'user:3', first_name: 'Zoe', last_name: 'Adams', email: 'zoe@acme.com', status: 'disabled' }),
    person({ row_key: 'user:4', first_name: 'Amy', last_name: 'Adler', email: 'amy@acme.com' }),
  ];

  it('needs at least two characters', () => {
    expect(searchDirectory(rows, 'a', new Set())).toEqual([]);
    expect(searchDirectory(rows, '  ', new Set())).toEqual([]);
  });

  it('matches name, email and client, A-Z, active people only', () => {
    expect(searchDirectory(rows, 'am', new Set()).map((p) => p.row_key)).toEqual(['user:1', 'user:4']);
    expect(searchDirectory(rows, 'beta', new Set()).map((p) => p.row_key)).toEqual(['contact:2']);
    expect(searchDirectory(rows, 'zoe', new Set())).toEqual([]); // disabled
  });

  it('leaves out people already excluded (already in the group) and honours the limit', () => {
    expect(searchDirectory(rows, 'am', new Set(['user:1'])).map((p) => p.row_key)).toEqual(['user:4']);
    expect(searchDirectory(rows, 'acme', new Set(), 1)).toHaveLength(1);
  });
});

describe('validateNewContact', () => {
  const valid = { ...emptyNewContactForm, tenantId: 5, firstName: 'Ann', lastName: 'Lee', email: 'ann@lee.com' };

  it('accepts a complete contact', () => {
    expect(validateNewContact(valid)).toEqual({});
  });

  it('requires a client, both names and a valid email', () => {
    const errors = validateNewContact(emptyNewContactForm);
    expect(Object.keys(errors).sort()).toEqual(['email', 'firstName', 'lastName', 'tenant']);
    expect(validateNewContact({ ...valid, email: 'not-an-email' }).email).toBeDefined();
    expect(validateNewContact({ ...valid, lastName: '  ' }).lastName).toContain('Teams');
  });
});

describe('findPeopleByEmail / searchTenants', () => {
  it('finds people by email regardless of case or spacing', () => {
    const rows = [person({ email: 'Amanda@Example.com ' }), person({ row_key: 'user:2', email: 'other@x.com' })];
    expect(findPeopleByEmail(rows, ' amanda@example.COM').map((p) => p.row_key)).toEqual(['user:1']);
    expect(findPeopleByEmail(rows, '')).toEqual([]);
  });

  it('searches clients by name, A-Z', () => {
    const tenants = [
      { id: 1, name: 'Zenith Training' },
      { id: 2, name: 'Acme Training' },
      { id: 3, name: 'Other' },
    ];
    expect(searchTenants(tenants, 'train').map((t) => t.id)).toEqual([2, 1]);
    expect(searchTenants(tenants, 't')).toEqual([]);
  });
});
