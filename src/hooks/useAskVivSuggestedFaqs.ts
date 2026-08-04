import { useQuery } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";

export interface AskVivSuggestedFaq {
  id: string;
  prompt: string;
  category: string | null;
}

/**
 * FAQ-style suggested prompts mined from real staff usage of Ask Viv
 * Assistant across the whole team (see generate-ask-viv-faqs, cron-refreshed
 * daily) — not personalized to the current user. Long staleTime since the
 * backing table only changes once a day; no point refetching more often
 * than that within a session.
 */
export function useAskVivSuggestedFaqs() {
  const { data, isLoading } = useQuery({
    queryKey: ["ask-viv-suggested-faqs"],
    queryFn: async (): Promise<AskVivSuggestedFaq[]> => {
      const { data, error } = await supabase
        .from("ask_viv_suggested_faqs")
        .select("id, prompt_text, category")
        .order("rank", { ascending: true });

      if (error) throw error;
      return (data || []).map((row) => ({ id: row.id, prompt: row.prompt_text, category: row.category }));
    },
    staleTime: 60 * 60 * 1000,
  });

  return { faqs: data ?? [], isLoading };
}
