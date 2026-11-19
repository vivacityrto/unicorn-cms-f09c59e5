import { supabase } from '@/integrations/supabase/client';

export interface NewStaffConversation {
  tenantId: number;
  /** One person at the client, or null for everyone at the client. */
  recipientId: string | null;
  subject: string;
  category: string;
  body: string;
  staffId: string;
}

export interface CreatedStaffConversation {
  id: string;
  messageId: string;
  /** Client users who could not be added (no matching sign-in account), so the sender can be told. */
  skippedParticipants: number;
}

/**
 * Start a conversation with a client, from a member of staff. To everyone at the client (every user of that organisation can
 * read and reply) or to one person (only that person and the sender can). The sender joins first, because the first message
 * is refused by the database unless its sender is already a participant.
 */
export async function createStaffConversation(input: NewStaffConversation): Promise<CreatedStaffConversation> {
  const { tenantId, recipientId, subject, category, body, staffId } = input;

  const { data: conv, error } = await supabase
    .from('tenant_conversations')
    .insert({
      tenant_id: tenantId,
      topic: 'general',
      type: category,
      subject: subject.trim() || null,
      created_by_user_uuid: staffId,
      status: 'open',
    })
    .select('id')
    .single();
  if (error) throw error;

  const { error: staffPartError } = await supabase
    .from('conversation_participants')
    .upsert({ conversation_id: conv.id, user_id: staffId, role: 'staff', last_read_at: new Date().toISOString() }, { onConflict: 'conversation_id,user_id' });
  if (staffPartError) throw staffPartError;

  let recipientIds: string[];
  if (recipientId) {
    recipientIds = [recipientId];
  } else {
    const { data: tenantUsers, error: tenantUsersError } = await supabase.from('tenant_users').select('user_id').eq('tenant_id', tenantId);
    if (tenantUsersError) throw tenantUsersError;
    recipientIds = (tenantUsers ?? []).map((u) => u.user_id);
  }

  // conversation_participants.user_id points at auth.users, so one stale profile with no sign-in account fails a whole batch.
  // Retry row by row so one bad row costs only that person, and count (never hide) the ones skipped.
  let skippedParticipants = 0;
  if (recipientIds.length > 0) {
    const rows = recipientIds.map((user_id) => ({ conversation_id: conv.id, user_id, role: 'client' }));
    const { error: batchError } = await supabase.from('conversation_participants').upsert(rows, { onConflict: 'conversation_id,user_id', ignoreDuplicates: true });
    if (batchError) {
      console.error(`Batch client-participant upsert failed (${batchError.message}), retrying row-by-row`);
      for (const row of rows) {
        const { error: rowError } = await supabase.from('conversation_participants').upsert(row, { onConflict: 'conversation_id,user_id', ignoreDuplicates: true });
        if (rowError) {
          console.error(`Skipping participant ${row.user_id}: ${rowError.message}`);
          skippedParticipants += 1;
        }
      }
    }
  }

  // Writing to one person who could not be added would send the message to nobody: stop rather than pretend.
  if (recipientId && skippedParticipants > 0) {
    throw new Error('That person has no sign-in account yet, so they cannot be messaged here.');
  }

  const { data: msg, error: msgError } = await supabase
    .from('tenant_messages')
    .insert({ conversation_id: conv.id, sender_user_uuid: staffId, sender_type: 'staff', body, tenant_id: tenantId })
    .select('id')
    .single();
  if (msgError) throw msgError;

  return { id: conv.id, messageId: msg.id, skippedParticipants };
}
