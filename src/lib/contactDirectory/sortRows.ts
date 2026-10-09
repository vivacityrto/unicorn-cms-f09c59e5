/**
 * Sorting for the Contact Directory table. Pure and display-only: sorting
 * never changes who is in the directory or in a group.
 */

export type DirectorySortKey = 'name' | 'email' | 'client' | 'position' | 'source' | 'status';
export type SortDirection = 'asc' | 'desc';
export interface DirectorySort {
  key: DirectorySortKey;
  direction: SortDirection;
}

interface SortableRow {
  first_name: string;
  last_name: string | null;
  email: string;
  tenant_name: string;
  position_type: string | null;
  source: string;
  status: string;
}

/**
 * Click cycle for a header: ascending, then descending, then back to the
 * directory's natural order. Clicking a different header starts at ascending.
 */
export function nextSort(current: DirectorySort | null, key: DirectorySortKey): DirectorySort | null {
  if (!current || current.key !== key) return { key, direction: 'asc' };
  if (current.direction === 'asc') return { key, direction: 'desc' };
  return null;
}

function valueFor(row: SortableRow, key: DirectorySortKey, positionLabel: (value: string | null) => string): string {
  switch (key) {
    case 'name':
      return `${row.first_name} ${row.last_name ?? ''}`.trim();
    case 'email':
      return row.email;
    case 'client':
      return row.tenant_name;
    case 'position':
      return row.position_type ? positionLabel(row.position_type) : '';
    case 'source':
      return row.source;
    case 'status':
      return row.status;
  }
}

const collator = new Intl.Collator('en-AU', { sensitivity: 'base', numeric: true });

/**
 * Returns a sorted copy. Blank values always sort last, whichever direction
 * is chosen, and ties fall back to name so the order is stable and predictable.
 */
function sortWith<T>(rows: T[], sort: DirectorySort | null, valueOf: (row: T, key: DirectorySortKey) => string): T[] {
  if (!sort) return rows;
  const factor = sort.direction === 'asc' ? 1 : -1;
  return [...rows].sort((a, b) => {
    const av = valueOf(a, sort.key);
    const bv = valueOf(b, sort.key);
    if (!av && bv) return 1;
    if (av && !bv) return -1;
    const primary = collator.compare(av, bv) * factor;
    if (primary !== 0) return primary;
    return collator.compare(valueOf(a, 'name'), valueOf(b, 'name'));
  });
}

export function sortDirectoryRows<T extends SortableRow>(
  rows: T[],
  sort: DirectorySort | null,
  positionLabel: (value: string | null) => string = (v) => v ?? '',
): T[] {
  return sortWith(rows, sort, (row, key) => valueFor(row, key, positionLabel));
}

interface SortableGroupMember {
  name: string;
  email: string;
  tenantName: string;
  source: string;
  positionType: string | null;
  status: string;
}

/** Same ordering rules for the people listed inside one Group (display only). */
export function sortGroupMembers<T extends SortableGroupMember>(
  members: T[],
  sort: DirectorySort | null,
  positionLabel: (value: string | null) => string = (v) => v ?? '',
): T[] {
  return sortWith(members, sort, (m, key) => {
    switch (key) {
      case 'name':
        return m.name;
      case 'email':
        return m.email;
      case 'client':
        return m.tenantName;
      case 'position':
        return m.positionType ? positionLabel(m.positionType) : '';
      case 'source':
        return m.source;
      case 'status':
        return m.status;
    }
  });
}
