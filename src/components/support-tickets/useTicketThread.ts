import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { toast } from 'sonner';
import { supabase } from '@/integrations/supabase/client';
import { useAuth } from '@/hooks/useAuth';

export type MessageKind = 'reply' | 'event' | 'ai_draft';

export interface ThreadMessage {
  id: string;
  ticket_id: string;
  author_id: string | null;
  kind: MessageKind;
  staff_only: boolean;
  body: string;
  created_at: string;
  author?: { user_uuid: string; first_name: string | null; last_name: string | null } | null;
}

export interface ThreadAttachment {
  id: string;
  ticket_id: string;
  message_id: string | null;
  bucket: string;
  storage_path: string;
  file_name: string;
  mime_type: string | null;
  size_bytes: number | null;
  created_at: string;
}

export const MAX_ATTACHMENT_BYTES = 10 * 1024 * 1024;
export const ALLOWED_ATTACHMENT_TYPES = ['image/png', 'image/jpeg', 'image/gif', 'image/webp', 'application/pdf', 'text/plain'];

export function safeFileName(name: string): string {
  const cleaned = name.normalize('NFKD').replace(/[^\w.\- ]+/g, '').replace(/\s+/g, '-').replace(/^\.+/, '');
  return (cleaned || 'file').slice(-120);
}

/** Returns an error message, or null when the file can be attached. */
export function validateAttachment(file: File, maxBytes = MAX_ATTACHMENT_BYTES): string | null {
  if (!ALLOWED_ATTACHMENT_TYPES.includes(file.type)) return 'Attach an image, a PDF or a text file.';
  if (file.size > maxBytes) return `Files must be ${Math.round(maxBytes / (1024 * 1024))} MB or smaller.`;
  return null;
}

/** Upload to the private ticket-files bucket and register the attachment row. */
export async function uploadTicketFile(args: {
  ticketId: string;
  messageId: string | null;
  file: File;
  userId: string;
}): Promise<void> {
  const path = `${args.ticketId}/${crypto.randomUUID()}-${safeFileName(args.file.name)}`;
  const { error: upErr } = await supabase.storage
    .from('ticket-files')
    .upload(path, args.file, { contentType: args.file.type, upsert: false });
  if (upErr) throw upErr;
  const { error: rowErr } = await supabase.from('support_ticket_attachments').insert({
    ticket_id: args.ticketId,
    message_id: args.messageId,
    bucket: 'ticket-files',
    storage_path: path,
    file_name: args.file.name.slice(0, 200),
    mime_type: args.file.type,
    size_bytes: args.file.size,
    uploaded_by: args.userId,
  });
  if (rowErr) throw rowErr;
}

const THREAD_KEY = (id: string | undefined) => ['support-ticket-thread', id] as const;

/**
 * The ticket thread. Staff pass includeAuthors to resolve names. Clients never
 * query users: the thread shows "You" and "Vivacity team" only, and RLS has
 * already removed staff-only rows from what the database returns.
 */
export function useTicketThread(ticketId: string | undefined, opts: { includeAuthors: boolean }) {
  return useQuery({
    queryKey: [...THREAD_KEY(ticketId), opts.includeAuthors],
    enabled: !!ticketId,
    staleTime: 10_000,
    refetchInterval: 30_000,
    queryFn: async (): Promise<{ messages: ThreadMessage[]; attachments: ThreadAttachment[] }> => {
      const cols = 'id, ticket_id, author_id, kind, staff_only, body, created_at';
      const select = opts.includeAuthors
        ? `${cols}, author:users!support_ticket_messages_author_id_fkey(user_uuid, first_name, last_name)`
        : cols;
      const [m, a] = await Promise.all([
        supabase.from('support_ticket_messages').select(select).eq('ticket_id', ticketId as string)
          .order('created_at', { ascending: true }).order('id', { ascending: true }),
        supabase.from('support_ticket_attachments')
          .select('id, ticket_id, message_id, bucket, storage_path, file_name, mime_type, size_bytes, created_at')
          .eq('ticket_id', ticketId as string).order('created_at', { ascending: true }),
      ]);
      if (m.error) throw m.error;
      if (a.error) throw a.error;
      return {
        messages: (m.data ?? []) as unknown as ThreadMessage[],
        attachments: (a.data ?? []) as unknown as ThreadAttachment[],
      };
    },
  });
}

/** Post a reply or, for staff, a staff-only note, with optional files. */
export function usePostReply(ticketId: string | undefined) {
  const qc = useQueryClient();
  const { user } = useAuth();
  return useMutation({
    mutationFn: async (input: { body: string; staffOnly: boolean; files?: File[] }) => {
      if (!ticketId || !user) throw new Error('Not signed in');
      const { data, error } = await supabase
        .from('support_ticket_messages')
        .insert({ ticket_id: ticketId, author_id: user.id, kind: 'reply', staff_only: input.staffOnly, body: input.body })
        .select('id')
        .single();
      if (error) throw error;
      const failed: string[] = [];
      for (const file of input.files ?? []) {
        try {
          await uploadTicketFile({ ticketId, messageId: data.id, file, userId: user.id });
        } catch {
          failed.push(file.name);
        }
      }
      if (failed.length) toast.error(`Your message was sent, but these files could not be attached: ${failed.join(', ')}`);
      return data.id as string;
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: THREAD_KEY(ticketId) });
      qc.invalidateQueries({ queryKey: ['support-tickets'] });
      qc.invalidateQueries({ queryKey: ['support-ticket', ticketId] });
      qc.invalidateQueries({ queryKey: ['client-support-tickets'] });
    },
    onError: (err) => {
      toast.error(err instanceof Error ? err.message : 'Could not send your message');
    },
  });
}

/** Signed URL for an attachment (private buckets). */
export function useAttachmentUrl(att: Pick<ThreadAttachment, 'bucket' | 'storage_path'> | null, enabled = true) {
  return useQuery({
    queryKey: ['support-attachment-url', att?.bucket, att?.storage_path],
    enabled: enabled && !!att,
    staleTime: 50 * 60 * 1000,
    queryFn: async (): Promise<string | null> => {
      if (!att) return null;
      const { data, error } = await supabase.storage.from(att.bucket).createSignedUrl(att.storage_path, 3600);
      if (error) return null;
      return data?.signedUrl ?? null;
    },
  });
}
