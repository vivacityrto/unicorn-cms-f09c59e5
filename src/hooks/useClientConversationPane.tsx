import { useCallback, useMemo, useRef, useState } from 'react';
import { useQueryClient } from '@tanstack/react-query';
import { toast } from 'sonner';
import { supabase } from '@/integrations/supabase/client';
import { MessageAttachments } from '@/components/messaging/MessageAttachments';
import type { ConversationPaneProps } from '@/components/messenger';
import type { MessengerMessage } from '@/components/messenger';
import { pendingMessage, toMessengerMessage } from '@/components/messenger/adapters/tenantConversations';
import { MAX_FILES_PER_MESSAGE, uploadMessageAttachment, validateAttachment } from '@/lib/messageAttachments';
import { useClientTenant } from '@/contexts/ClientTenantContext';
import { useClientCommunications } from '@/hooks/useClientCommunications';
import { useConversationParticipants } from '@/hooks/useConversationParticipants';

export const ATTACHMENT_ACCEPT = '.jpg,.jpeg,.png,.gif,.webp,.pdf,.doc,.docx,.xls,.xlsx';

function errorMessage(error: unknown): string {
  return error instanceof Error ? error.message : 'Invalid file';
}

export function validateClientFile(file: File): string | null {
  try {
    validateAttachment(file);
    return null;
  } catch (err: unknown) {
    return errorMessage(err);
  }
}

export type ClientConversationPane = Omit<ConversationPaneProps, 'thread' | 'onBack'>;

interface Options {
  /**
   * Replaces the normal send. Used by a thread that does not exist yet (the first message to your consultant creates it).
   * It receives the same message and may throw to keep the text in the box.
   */
  sendOverride?: (message: { body: string; files: File[] }) => Promise<void>;
}

/**
 * Everything the messenger needs to show and work one of this organisation's conversations: messages, who has read it,
 * a "Sending…" bubble while a message goes, upload of attachments, and marking it read. Shared by the Inbox page and the
 * messenger bubble so the two behave identically.
 */
export function useClientConversationPane(openId: string | null, options: Options = {}): ClientConversationPane {
  const { useConversationMessages, sendMessage, markRead, currentUserId } = useClientCommunications();
  const { isReadOnly, activeTenantId } = useClientTenant();
  const qc = useQueryClient();
  const [pending, setPending] = useState<MessengerMessage[]>([]);
  const counter = useRef(0);
  const { sendOverride } = options;

  const { data: rawMessages = [], isLoading } = useConversationMessages(openId);
  const { data: people } = useConversationParticipants(openId);

  const messages = useMemo(() => {
    const saved = rawMessages.map((m) => toMessengerMessage(m, currentUserId));
    const mine = pending.filter((p) => p.id.startsWith(`pending-${openId ?? 'new'}-`));
    return [...saved, ...mine];
  }, [rawMessages, pending, currentUserId, openId]);

  const attachmentsById = useMemo(() => new Map(rawMessages.map((m) => [m.id, m.attachments ?? []])), [rawMessages]);

  const onSend = useCallback(
    async ({ body, files }: { body: string; files: File[] }) => {
      if (!currentUserId) return;
      const pendingId = `pending-${openId ?? 'new'}-${(counter.current += 1)}`;
      setPending((prev) => [...prev, pendingMessage(pendingId, body, currentUserId, files)]);
      try {
        if (sendOverride) {
          await sendOverride({ body, files });
          return;
        }
        if (!openId) return;
        const result = await sendMessage.mutateAsync({ conversationId: openId, body });
        if (result?.messageId && activeTenantId != null && files.length > 0) {
          for (const f of files) {
            try {
              await uploadMessageAttachment(supabase, f, activeTenantId, openId, result.messageId);
            } catch (err: unknown) {
              toast.warning(`Attachment "${f.name}" failed to upload: ${errorMessage(err)}`);
            }
          }
        }
        // Show the saved message (and its attachments) before the "Sending…" copy goes, so nothing flickers.
        await qc.refetchQueries({ queryKey: ['conversation-messages', openId] });
      } finally {
        setPending((prev) => prev.filter((p) => p.id !== pendingId));
      }
    },
    [openId, currentUserId, sendMessage, activeTenantId, qc, sendOverride],
  );

  const onMarkRead = useCallback(() => {
    if (openId) markRead.mutate(openId);
  }, [openId, markRead]);

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
    draftScope: 'client-inbox',
    capabilities: { canSend: !isReadOnly },
    onSend,
    onMarkRead,
    validateFile: validateClientFile,
    accept: ATTACHMENT_ACCEPT,
    maxFiles: MAX_FILES_PER_MESSAGE,
    renderAttachments,
    empty: <p className="py-10 text-center text-sm text-muted-foreground">No messages in this conversation yet.</p>,
  };
}
