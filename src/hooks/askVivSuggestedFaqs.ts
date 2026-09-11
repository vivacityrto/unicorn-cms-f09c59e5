import { supabase } from "@/integrations/supabase/client";

export interface AskVivSuggestedFaq {
  id: string;
  prompt: string;
  category: string | null;
}

/**
 * Reads the daily staff-derived Ask Viv suggested prompts. The caller owns
 * React Query; this adapter preserves the existing query, error propagation,
 * and database-to-view-model mapping as a focused boundary.
 */
export async function fetchAskVivSuggestedFaqs(): Promise<AskVivSuggestedFaq[]> {
  const { data, error } = await supabase
    .from("ask_viv_suggested_faqs")
    .select("id, prompt_text, category")
    .order("rank", { ascending: true });

  if (error) throw error;
  return (data || []).map((row) => ({ id: row.id, prompt: row.prompt_text, category: row.category }));
}
