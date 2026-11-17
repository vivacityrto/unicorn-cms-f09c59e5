/**
 * Note Notification Utilities
 * 
 * Sends in-app (user_notifications) and Teams (emit_notification) 
 * notifications when notes are created or shared.
 */

import { supabase } from '@/integrations/supabase/client';
import type { Tables, TablesInsert } from '@/integrations/supabase/types';

type UserNameRow = Pick<Tables<'users'>, 'user_uuid' | 'first_name'>;
type NotificationInsert = TablesInsert<'user_notifications'>;

interface NoteNotificationParams {
  noteId: string;
  tenantId: number;
  noteTitle: string;
  noteContent: string;
  notifyUserIds: string[];
}

/**
 * Get current user info (id + display name)
 */
async function getCurrentAuthor() {
  const { data: userData } = await supabase.auth.getUser();
  const currentUserId = userData.user?.id;
  if (!currentUserId) return null;

  const { data: authorUser } = await supabase
    .from('users')
    .select('first_name, last_name')
    .eq('user_uuid', currentUserId)
    .single();

  const authorName = authorUser
    ? `${authorUser.first_name || ''} ${authorUser.last_name || ''}`.trim()
    : 'A team member';

  return { currentUserId, authorName };
}

/**
 * Get tenant name for notification payloads
 */
async function getTenantName(tenantId: number): Promise<string> {
  const { data } = await supabase
    .from('tenants')
    .select('name')
    .eq('id', tenantId)
    .single();
  return data?.name || 'Unknown Client';
}

/**
 * Truncate text for display in notifications
 */
function truncateText(text: string, maxLen = 60): string {
  const clean = text.trim();
  if (clean.length <= maxLen) return clean;
  return clean.substring(0, maxLen) + '...';
}

/**
 * Send all note notifications:
 * 1. In-app + Teams to selected "Notify" users
 * 2. In-app + Teams to the people who own the client (primary CSC, their assistants,
 *    anyone watching), as chosen by the notification routing rules and each person's
 *    own preferences. The author is never notified.
 */
export async function sendNoteNotifications({
  noteId,
  tenantId,
  noteTitle,
  noteContent,
  notifyUserIds,
}: NoteNotificationParams): Promise<string[]> {
  const notifiedNames: string[] = [];
  try {
    const author = await getCurrentAuthor();
    if (!author) return notifiedNames;

    const { currentUserId, authorName } = author;
    const displayTitle = truncateText(noteTitle || noteContent);
    const deepLink = `/tenant/${tenantId}`;

    // Fetch tenant name + CSC + all notified user names in parallel
    const allUserIds = [...new Set(notifyUserIds)];
    const [clientName, userNamesResult] = await Promise.all([
      getTenantName(tenantId),
      allUserIds.length > 0
        ? supabase.from('users').select('user_uuid, first_name').in('user_uuid', allUserIds)
        : Promise.resolve({ data: [] as UserNameRow[] }),
    ]);

    const nameMap = new Map<string, string>();
    (userNamesResult.data || []).forEach((u: UserNameRow) => {
      nameMap.set(u.user_uuid, u.first_name || 'User');
    });

    // ── 1. Notify selected team members ("Notify" section) ──
    const filteredNotifyIds = [...notifyUserIds];
    if (filteredNotifyIds.length > 0) {
      // In-app notifications
      const notifRows = filteredNotifyIds.map(uid => ({
        user_id: uid,
        tenant_id: tenantId,
        title: 'Note shared with you',
        message: `${authorName} shared a note: "${displayTitle}"`,
        type: 'note_shared',
        link: deepLink,
        created_by: currentUserId,
        source_id: noteId,
      }));
      await supabase.from('user_notifications').insert(notifRows satisfies NotificationInsert[]);
      filteredNotifyIds.forEach(uid => {
        const name = nameMap.get(uid);
        if (name) notifiedNames.push(name);
      });

      // Teams notifications
      for (const uid of filteredNotifyIds) {
        try {
          await supabase.rpc('emit_notification', {
            p_event_type: 'note_shared',
            p_recipient_user_uuid: uid,
            p_record_type: 'note',
            p_record_id: noteId,
            p_payload: JSON.parse(JSON.stringify({
              title: `Note shared with you`,
              client_name: clientName,
              description: `${authorName} shared a note: "${displayTitle}"`,
              deep_link: deepLink,
            })),
            p_tenant_id: tenantId,
          });
        } catch (e) {
          console.error('Teams notify failed for user:', uid, e);
        }
      }
    }

    // ── 2. Auto-notify the owners of this client ──
    // The database decides who: the primary CSC, assistants, and anyone watching or opted in,
    // minus the author and anyone who has switched this category off.
    const { data: owners, error: ownersError } = await supabase.rpc('get_client_notification_recipients', {
      p_category: 'client_note',
      p_tenant_id: tenantId,
    });
    if (ownersError) {
      console.error('Could not resolve note recipients:', ownersError);
    }

    const ownerRows = (owners ?? []).filter(o => !filteredNotifyIds.includes(o.user_id));
    if (ownerRows.length > 0) {
      const ownerIds = ownerRows.map(o => o.user_id);
      const missing = ownerIds.filter(id => !nameMap.has(id));
      if (missing.length > 0) {
        const { data: more } = await supabase.from('users').select('user_uuid, first_name').in('user_uuid', missing);
        (more || []).forEach((u: UserNameRow) => nameMap.set(u.user_uuid, u.first_name || 'User'));
      }

      const inAppRows = ownerRows
        .filter(o => o.in_app)
        .map(o => ({
          user_id: o.user_id,
          tenant_id: tenantId,
          title: 'New note added to your client',
          message: `${authorName} added a note: "${displayTitle}"`,
          type: 'note_added',
          link: deepLink,
          created_by: currentUserId,
          source_id: noteId,
        }));
      if (inAppRows.length > 0) {
        await supabase.from('user_notifications').insert(inAppRows satisfies NotificationInsert[]);
      }

      for (const o of ownerRows) {
        const name = nameMap.get(o.user_id) || 'User';
        const label = o.reason === 'primary_csc' ? ' (CSC)' : o.reason === 'delegate' ? ' (assistant)' : '';
        if (o.in_app) notifiedNames.push(`${name}${label}`);

        if (!o.teams) continue;
        try {
          await supabase.rpc('emit_notification', {
            p_event_type: 'note_added',
            p_recipient_user_uuid: o.user_id,
            p_record_type: 'note',
            p_record_id: noteId,
            p_payload: JSON.parse(JSON.stringify({
              title: 'New note added to your client',
              client_name: clientName,
              description: `${authorName} added a note: "${displayTitle}"`,
              deep_link: deepLink,
            })),
            p_tenant_id: tenantId,
          });
        } catch (e) {
          console.error('Teams owner notify failed:', e);
        }
      }
    }
  } catch (err) {
    console.error('Note notification error:', err);
  }
  return notifiedNames;
}
