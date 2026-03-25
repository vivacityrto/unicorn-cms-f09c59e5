/**
 * Note Notification Utilities
 * 
 * Sends in-app (user_notifications) and Teams (emit_notification) 
 * notifications when notes are created or shared.
 */

import { supabase } from '@/integrations/supabase/client';

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
 * Get the canonical CSC (assigned_consultant_user_id) for a tenant
 */
async function getTenantCsc(tenantId: number): Promise<string | null> {
  const { data } = await supabase
    .from('tenants')
    .select('assigned_consultant_user_id')
    .eq('id', tenantId)
    .single();
  return data?.assigned_consultant_user_id || null;
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
 * 2. In-app + Teams to the CSC if the creator is not the CSC
 */
export async function sendNoteNotifications({
  noteId,
  tenantId,
  noteTitle,
  noteContent,
  notifyUserIds,
}: NoteNotificationParams): Promise<void> {
  try {
    const author = await getCurrentAuthor();
    if (!author) return;

    const { currentUserId, authorName } = author;
    const displayTitle = truncateText(noteTitle || noteContent);
    const deepLink = `/tenant/${tenantId}`;

    // Fetch tenant name + CSC in parallel
    const [clientName, cscUserId] = await Promise.all([
      getTenantName(tenantId),
      getTenantCsc(tenantId),
    ]);

    // ── 1. Notify selected team members ("Notify" section) ──
    const filteredNotifyIds = notifyUserIds.filter(uid => uid !== currentUserId);
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
      }));
      await supabase.from('user_notifications').insert(notifRows);

      // Teams notifications
      for (const uid of filteredNotifyIds) {
        try {
          await supabase.rpc('emit_notification', {
            p_event_type: 'note_shared' as any,
            p_recipient_user_uuid: uid,
            p_record_type: 'note',
            p_record_id: noteId,
            p_payload: JSON.parse(JSON.stringify({
              title: `Note shared with you`,
              client_name: clientName,
              description: `${authorName} shared a note: "${displayTitle}"`,
              deep_link: deepLink,
              base_url: window.location.origin,
            })),
            p_tenant_id: tenantId,
          });
        } catch (e) {
          console.error('Teams notify failed for user:', uid, e);
        }
      }
    }

    // ── 2. Auto-notify CSC if creator is not the CSC ──
    if (cscUserId && cscUserId !== currentUserId) {
      // Only if CSC isn't already in the notify list
      const alreadyNotified = filteredNotifyIds.includes(cscUserId);

      if (!alreadyNotified) {
        // In-app notification
        await supabase.from('user_notifications').insert({
          user_id: cscUserId,
          tenant_id: tenantId,
          title: 'New note added to your client',
          message: `${authorName} added a note: "${displayTitle}"`,
          type: 'note_added',
          link: deepLink,
          created_by: currentUserId,
        });
      }

      // Teams notification for CSC (always, even if in-app was skipped because they were in notify list)
      try {
        await supabase.rpc('emit_notification', {
          p_event_type: alreadyNotified ? 'note_shared' as any : 'note_added' as any,
          p_recipient_user_uuid: cscUserId,
          p_record_type: 'note',
          p_record_id: noteId,
          p_payload: JSON.parse(JSON.stringify({
            title: alreadyNotified ? 'Note shared with you' : 'New note added to your client',
            client_name: clientName,
            description: `${authorName} ${alreadyNotified ? 'shared' : 'added'} a note: "${displayTitle}"`,
            deep_link: deepLink,
            base_url: window.location.origin,
          })),
          p_tenant_id: tenantId,
        });
      } catch (e) {
        console.error('Teams CSC notify failed:', e);
      }
    }
  } catch (err) {
    console.error('Note notification error:', err);
  }
}
