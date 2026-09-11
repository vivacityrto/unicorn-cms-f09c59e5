import { supabase } from "@/integrations/supabase/client";

interface SaveTenantClickUpAISummaryNoteInput {
  tenantId: number;
  question: string;
  response: string;
  userId: string;
}

/**
 * Saves a ClickUp AI response as a tenant note. The caller owns session and
 * UI state; this adapter preserves the existing note payload and error
 * contract.
 */
export async function saveTenantClickUpAISummaryNote({
  tenantId,
  question,
  response,
  userId,
}: SaveTenantClickUpAISummaryNoteInput): Promise<void> {
  const noteContent = `[ClickUp AI Summary]\n\n**Question:** ${question}\n\n${response}`;

  const { error } = await supabase.from("notes").insert({
    tenant_id: tenantId,
    title: `ClickUp AI: ${question.slice(0, 80)}`,
    note_details: noteContent,
    note_type: "ai_summary",
    created_by: userId,
    parent_type: "tenant",
    parent_id: tenantId,
  });

  if (error) throw error;
}
