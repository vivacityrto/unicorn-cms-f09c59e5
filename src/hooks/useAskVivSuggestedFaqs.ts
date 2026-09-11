import { useQuery } from "@tanstack/react-query";
import { fetchAskVivSuggestedFaqs, type AskVivSuggestedFaq } from "./askVivSuggestedFaqs";

export type { AskVivSuggestedFaq } from "./askVivSuggestedFaqs";

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
    queryFn: fetchAskVivSuggestedFaqs,
    staleTime: 60 * 60 * 1000,
  });

  return { faqs: data ?? [], isLoading };
}
