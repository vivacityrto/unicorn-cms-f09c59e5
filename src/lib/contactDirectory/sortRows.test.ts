import { describe, expect, it } from 'vitest';
import { nextSort, sortDirectoryRows } from './sortRows';

const row = (over: Partial<Parameters<typeof sortDirectoryRows>[0][number]> = {}) => ({
  first_name: 'Amy',
  last_name: 'Lee',
  email: 'amy@example.com',
  tenant_name: 'Acme',
  position_type: null as string | null,
  source: 'user',
  status: 'active',
  ...over,
});

describe('nextSort', () => {
  it('cycles ascending, descending, off, and restarts on a new column', () => {
    const asc = nextSort(null, 'name');
    expect(asc).toEqual({ key: 'name', direction: 'asc' });
    const desc = nextSort(asc, 'name');
    expect(desc).toEqual({ key: 'name', direction: 'desc' });
    expect(nextSort(desc, 'name')).toBeNull();
    expect(nextSort(desc, 'email')).toEqual({ key: 'email', direction: 'asc' });
  });
});

describe('sortDirectoryRows', () => {
  const rows = [
    row({ first_name: 'ben', last_name: 'Zhou', email: 'b@x.com', tenant_name: 'Bright RTO' }),
    row({ first_name: 'Amy', last_name: 'Lee', email: 'a@x.com', tenant_name: 'acme' }),
    row({ first_name: 'Cat', last_name: null, email: 'c@x.com', tenant_name: 'Coastal' }),
  ];

  it('returns the original order untouched when there is no sort', () => {
    expect(sortDirectoryRows(rows, null)).toBe(rows);
  });

  it('sorts by name ignoring case, both directions, without mutating the input', () => {
    const before = rows.map((r) => r.first_name);
    expect(sortDirectoryRows(rows, { key: 'name', direction: 'asc' }).map((r) => r.first_name)).toEqual(['Amy', 'ben', 'Cat']);
    expect(sortDirectoryRows(rows, { key: 'name', direction: 'desc' }).map((r) => r.first_name)).toEqual(['Cat', 'ben', 'Amy']);
    expect(rows.map((r) => r.first_name)).toEqual(before);
  });

  it('sorts by client case-insensitively', () => {
    expect(sortDirectoryRows(rows, { key: 'client', direction: 'asc' }).map((r) => r.tenant_name)).toEqual(['acme', 'Bright RTO', 'Coastal']);
  });

  it('sorts position by its label and always puts blanks last', () => {
    const people = [
      row({ first_name: 'A', position_type: null }),
      row({ first_name: 'B', position_type: 'ceo' }),
      row({ first_name: 'C', position_type: 'admin' }),
    ];
    const labels: Record<string, string> = { ceo: 'Chief Executive', admin: 'Administrator' };
    const label = (v: string | null) => (v ? (labels[v] ?? v) : '');
    expect(sortDirectoryRows(people, { key: 'position', direction: 'asc' }, label).map((r) => r.first_name)).toEqual(['C', 'B', 'A']);
    expect(sortDirectoryRows(people, { key: 'position', direction: 'desc' }, label).map((r) => r.first_name)).toEqual(['B', 'C', 'A']);
  });

  it('breaks ties by name so the order is stable', () => {
    const tied = [row({ first_name: 'Zed', status: 'active' }), row({ first_name: 'Amy', status: 'active' }), row({ first_name: 'Bob', status: 'inactive' })];
    expect(sortDirectoryRows(tied, { key: 'status', direction: 'asc' }).map((r) => r.first_name)).toEqual(['Amy', 'Zed', 'Bob']);
  });
});
