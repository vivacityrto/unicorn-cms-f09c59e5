import { supabase } from '@/integrations/supabase/client';
import { uploadMessageAttachment, validateAttachment } from '@/lib/messageAttachments';

/** The kit's file check: a message to refuse the file, or null to accept it. */
export function attachmentProblem(file: File): string | null {
  try {
    validateAttachment(file);
    return null;
  } catch (err) {
    return err instanceof Error ? err.message : `"${file.name}" was rejected.`;
  }
}

/**
 * Attach files to the first message of a conversation that has just been created. Best effort, file by file: the message is
 * already sent, so a file that fails is reported (by name) and never hides that. Returns the names that failed.
 */
export async function attachToFirstMessage(conversationId: string, tenantId: number, files: readonly File[]): Promise<string[]> {
  if (files.length === 0) return [];
  const failed: string[] = [];
  const { data: first } = await supabase
    .from('tenant_messages')
    .select('id')
    .eq('conversation_id', conversationId)
    .order('created_at', { ascending: true })
    .limit(1)
    .maybeSingle();
  if (!first?.id) return files.map((f) => f.name);
  for (const f of files) {
    try {
      await uploadMessageAttachment(supabase, f, tenantId, conversationId, first.id);
    } catch {
      failed.push(f.name);
    }
  }
  return failed;
}
