import { useCallback, useMemo, useRef, useState } from 'react';
import { useQueryClient } from '@tanstack/react-query';
import { toast } from 'sonner';
import { supabase } from '@/integrations/supabase/client';
import { MessageAttachments } from '@/components/messaging/MessageAttachments';
import type { MessengerMessage } from '@/components/messenger';
import { pendingMessage, toMessengerMessage } from '@/components/messenger/adapters/tenantConversations';
import { MAX_FILES_PER_MESSAGE, uploadMessageAttachment } from '@/lib/messageAttachments';
import { useAuth } from '@/hooks/useAuth';
import { useConversationMessagesQuery } from '@/hooks/useClientCommunications';
import { useConversationParticipants } from '@/hooks/useConversationParticipants';
import { ATTACHMENT_ACCEPT, validateClientFile, type ClientConversationPane } from '@/hooks/useClientConversationPane';

interface Options {
  /** The organisation this conversation belongs to. */
  tenantId: number | null;
  /**
   * Whether this conversation is mine by the routing. Only then does opening it record that I have read it (which also
   * shows the client "Seen"). Browsing someone else's client through "All clients" leaves no trace.
   */
  mine: boolean;
}

function errorMessage(error: unknown): string {
  return error instanceof Error ? error.message : 'Invalid file';
}

/**
 * What the messenger needs to show and work one conversation as Vivacity staff. Replies go out as staff and add me as a
 * participant of the conversation (so my reply and my read position are recorded, as the Communications page does). Reading
 * a conversation that is mine marks it read and clears its message notification.
 */
export function useStaffConversationPane(openId: string | null, { tenantId, mine }: Options): ClientConversationPane {
  const { profile } = useAuth();
  const me = profile?.user_uuid ?? null;
  const qc = useQueryClient();
  const [pending, setPending] = useState<MessengerMessage[]>([]);
  const counter = useRef(0);

  const { data: rawMessages = [], isLoading } = useConversationMessagesQuery(openId, true);
  const { data: people } = useConversationParticipants(openId);

  const messages = useMemo(() => {
    const saved = rawMessages.map((m) => toMessengerMessage(m, me));
    const inFlight = pending.filter((p) => p.id.startsWith(`pending-${openId}-`));
    return [...saved, ...inFlight];
  }, [rawMessages, pending, me, openId]);

  const attachmentsById = useMemo(() => new Map(rawMessages.map((m) => [m.id, m.attachments ?? []])), [rawMessages]);

  const refresh = useCallback(() => {
    void qc.invalidateQueries({ queryKey: ['staff-messenger', 'threads'] });
    void qc.invalidateQueries({ queryKey: ['conversation-participants', openId] });
  }, [qc, openId]);

  const onSend = useCallback(
    async ({ body, files }: { body: string; files: File[] }) => {
      if (!openId || !me || tenantId == null) return;
      const pendingId = `pending-${openId}-${(counter.current += 1)}`;
      setPending((prev) => [...prev, pendingMessage(pendingId, body, me, files)]);
      try {
        // The sender must be a participant before the message is saved (row-level security). Update first so an existing
        // role (such as "csc") is kept; add me as staff only if I am not in the conversation yet.
        const nowIso = new Date().toISOString();
        const { data: updated } = await supabase.from('conversation_participants').update({ last_read_at: nowIso }).eq('conversation_id', openId).eq('user_id', me).select('user_id');
        if (!updated || updated.length === 0) {
          const { error: joinError } = await supabase.from('conversation_participants').insert({ conversation_id: openId, user_id: me, role: 'staff', last_read_at: nowIso });
          if (joinError) throw joinError;
        }
        const { data: msg, error } = await supabase
          .from('tenant_messages')
          .insert({ conversation_id: openId, tenant_id: tenantId, sender_user_uuid: me, sender_type: 'staff', body })
          .select('id')
          .single();
        if (error) throw error;
        for (const f of files) {
          try {
            await uploadMessageAttachment(supabase, f, tenantId, openId, msg.id);
          } catch (err: unknown) {
            toast.warning(`Attachment "${f.name}" failed to upload: ${errorMessage(err)}`);
          }
        }
        await qc.refetchQueries({ queryKey: ['conversation-messages', openId] });
        refresh();
      } finally {
        setPending((prev) => prev.filter((p) => p.id !== pendingId));
      }
    },
    [openId, me, tenantId, qc, refresh],
  );

  const onMarkRead = useCallback(() => {
    if (!openId || !me || !mine) return;
    void (async () => {
      const nowIso = new Date().toISOString();
      const { data: updated } = await supabase.from('conversation_participants').update({ last_read_at: nowIso }).eq('conversation_id', openId).eq('user_id', me).select('user_id');
      if (!updated || updated.length === 0) {
        await supabase.from('conversation_participants').insert({ conversation_id: openId, user_id: me, role: 'staff', last_read_at: nowIso });
      }
      try {
        await supabase.from('user_notifications').update({ is_read: true }).eq('user_id', me).eq('source_id', openId).eq('type', 'message').eq('is_read', false);
      } catch {
        /* best effort: the read position above is already saved */
      }
      refresh();
    })();
  }, [openId, me, mine, refresh]);

  const renderAttachments = useCallback(
    (m: MessengerMessage) => {
      const list = attachmentsById.get(m.id);
      return list && list.length > 0 ? <MessageAttachments attachments={list} /> : null;
    },
    [attachmentsById],
  );

  return {
    messages,
    people,
    isLoading,
    draftScope: 'staff-messenger',
    capabilities: { canSend: true },
    onSend,
    onMarkRead,
    validateFile: validateClientFile,
    accept: ATTACHMENT_ACCEPT,
    maxFiles: MAX_FILES_PER_MESSAGE,
    renderAttachments,
    composerPlaceholder: 'Reply to the client',
    empty: <p className="py-10 text-center text-sm text-muted-foreground">No messages in this conversation yet.</p>,
  };
}
