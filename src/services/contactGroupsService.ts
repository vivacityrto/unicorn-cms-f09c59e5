/**
 * Browser-side writes for Contact Directory Groups and the contacts that go in
 * them. These use the signed-in user's session, so the existing row-level
 * security still decides who may do what (groups and members: Vivacity staff;
 * contacts: the tenant's parent, Vivacity staff or a Super Admin).
 */
import { supabase } from '@/integrations/supabase/client';

export type GroupMemberSource = 'user' | 'contact';

export interface GroupPersonRef {
  source: GroupMemberSource;
  /** tenant_users.id (user) or tenant_contacts.id (contact). */
  id: number;
  tenantId: number;
}

export type ServiceResult<T extends object = object> = ({ ok: true } & T) | { ok: false; message: string };

export function parseRowKey(rowKey: string): { source: GroupMemberSource; id: number } | null {
  const [source, idText] = rowKey.split(':');
  const id = Number(idText);
  if ((source !== 'user' && source !== 'contact') || !Number.isInteger(id) || id <= 0) return null;
  return { source, id };
}

export async function addPeopleToGroup(groupId: number, people: GroupPersonRef[]): Promise<ServiceResult> {
  if (people.length === 0) return { ok: true };
  const rows = people.map((p) => ({
    group_id: groupId,
    member_type: p.source,
    member_id: String(p.id),
    tenant_id: p.tenantId,
  }));
  const { error } = await supabase
    .from('tenant_contact_group_members')
    .upsert(rows, { onConflict: 'group_id,member_type,member_id' });
  if (error) {
    console.error('add to group error:', error);
    return { ok: false, message: 'Could not add to the group.' };
  }
  return { ok: true };
}

export async function removePersonFromGroup(
  groupId: number,
  source: GroupMemberSource,
  id: number,
): Promise<ServiceResult> {
  const { error } = await supabase
    .from('tenant_contact_group_members')
    .delete()
    .eq('group_id', groupId)
    .eq('member_type', source)
    .eq('member_id', String(id));
  if (error) {
    console.error('remove from group error:', error);
    return { ok: false, message: 'Could not remove from the group.' };
  }
  return { ok: true };
}

export interface NewContactInput {
  tenantId: number;
  firstName: string;
  lastName: string;
  email: string;
  positionType: string | null;
}

/** Creates a tenant contact exactly as the client's own contact list does. */
export async function createTenantContact(input: NewContactInput): Promise<ServiceResult<{ id: number }>> {
  const { data, error } = await supabase
    .from('tenant_contacts')
    .insert({
      tenant_id: input.tenantId,
      first_name: input.firstName.trim(),
      last_name: input.lastName.trim() || null,
      email: input.email.toLowerCase().trim(),
      position_type: input.positionType || null,
    })
    .select('id')
    .single();
  if (error || !data) {
    console.error('tenant_contacts create error:', error);
    return { ok: false, message: 'Could not create the contact.' };
  }
  return { ok: true, id: data.id };
}
