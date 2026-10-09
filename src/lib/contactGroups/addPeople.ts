/**
 * Pure helpers for adding people to a Contact Directory Group: searching the
 * directory, and validating a brand-new contact before it is created.
 */
import { isValidEmail } from '@/lib/roles/relationshipRole';
import type { DirectoryPerson } from './resolveGroupMembers';

const MIN_QUERY = 2;

/** Active people matching the query that are not already excluded (e.g. already in the group). */
export function searchDirectory(
  rows: DirectoryPerson[],
  query: string,
  excludeKeys: Set<string>,
  limit = 8,
): DirectoryPerson[] {
  const q = query.trim().toLowerCase();
  if (q.length < MIN_QUERY) return [];
  const full = (p: DirectoryPerson) => `${p.first_name} ${p.last_name ?? ''}`.trim().toLowerCase();
  return rows
    .filter(
      (p) =>
        p.status === 'active' &&
        !excludeKeys.has(p.row_key) &&
        (full(p).includes(q) || p.email.toLowerCase().includes(q) || p.tenant_name.toLowerCase().includes(q)),
    )
    .sort((a, b) => full(a).localeCompare(full(b), 'en-AU', { sensitivity: 'base' }))
    .slice(0, limit);
}

export interface NewContactForm {
  tenantId: number | null;
  firstName: string;
  lastName: string;
  email: string;
  positionType: string;
}

export const emptyNewContactForm: NewContactForm = {
  tenantId: null,
  firstName: '',
  lastName: '',
  email: '',
  positionType: '',
};

export type NewContactErrors = Partial<Record<'tenant' | 'firstName' | 'lastName' | 'email', string>>;

/** Teams registration needs both names, so unlike the client's own contact list the last name is required here. */
export function validateNewContact(form: NewContactForm): NewContactErrors {
  const errors: NewContactErrors = {};
  if (!form.tenantId) errors.tenant = 'Choose the client this contact belongs to';
  if (!form.firstName.trim()) errors.firstName = 'First name is required';
  if (!form.lastName.trim()) errors.lastName = 'Last name is required for Teams registration';
  if (!isValidEmail(form.email)) errors.email = 'Enter a valid email address';
  return errors;
}

/** Everyone in the directory with this email (any client), case-insensitive. */
export function findPeopleByEmail(rows: DirectoryPerson[], email: string): DirectoryPerson[] {
  const normalised = email.trim().toLowerCase();
  if (!normalised) return [];
  return rows.filter((p) => p.email.trim().toLowerCase() === normalised);
}

/** Clients matching a typed query, for the client picker. */
export function searchTenants<T extends { id: number; name: string }>(tenants: T[], query: string, limit = 8): T[] {
  const q = query.trim().toLowerCase();
  if (q.length < MIN_QUERY) return [];
  return tenants
    .filter((t) => t.name.toLowerCase().includes(q))
    .sort((a, b) => a.name.localeCompare(b.name, 'en-AU', { sensitivity: 'base' }))
    .slice(0, limit);
}
