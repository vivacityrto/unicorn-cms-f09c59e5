/**
 * Turns a Contact Directory Group's raw membership rows (type + id) into
 * displayable people by looking each one up in the loaded directory.
 *
 * Display only. The Teams event registration never uses this: it re-resolves
 * the group's membership on the server from the source tables.
 */

export interface GroupMemberRef {
  group_id: number;
  member_type: string;
  member_id: string;
}

export interface DirectoryPerson {
  row_key: string;
  source: 'user' | 'contact';
  tenant_id: number;
  tenant_name: string;
  first_name: string;
  last_name: string | null;
  email: string;
  position_type: string | null;
  status: string;
}

export interface ResolvedGroupMember {
  key: string;
  source: 'user' | 'contact';
  name: string;
  email: string;
  tenantName: string;
  positionType: string | null;
  status: string;
  /** The underlying user/contact is no longer in the directory. */
  missing: boolean;
}

function displayName(person: Pick<DirectoryPerson, 'first_name' | 'last_name'>): string {
  return [person.first_name, person.last_name].filter(Boolean).join(' ').trim();
}

export function resolveGroupMembers(
  members: GroupMemberRef[],
  directory: DirectoryPerson[],
): ResolvedGroupMember[] {
  const byKey = new Map(directory.map((p) => [p.row_key, p]));

  const resolved = members.map((m): ResolvedGroupMember => {
    const source: 'user' | 'contact' = m.member_type === 'user' ? 'user' : 'contact';
    const key = `${source}:${m.member_id}`;
    const person = byKey.get(key);
    if (!person) {
      return { key, source, name: '(no longer in the directory)', email: '', tenantName: '', positionType: null, status: 'missing', missing: true };
    }
    return {
      key,
      source,
      name: displayName(person) || '(no name)',
      email: person.email,
      tenantName: person.tenant_name,
      positionType: person.position_type,
      status: person.status,
      missing: false,
    };
  });

  // Present people first (A-Z), records that have gone missing last.
  return resolved.sort(
    (a, b) => Number(a.missing) - Number(b.missing) || a.name.localeCompare(b.name, 'en-AU', { sensitivity: 'base' }),
  );
}

export function filterGroupMembers(members: ResolvedGroupMember[], query: string): ResolvedGroupMember[] {
  const q = query.trim().toLowerCase();
  if (!q) return members;
  return members.filter(
    (m) => m.name.toLowerCase().includes(q) || m.email.toLowerCase().includes(q) || m.tenantName.toLowerCase().includes(q),
  );
}
