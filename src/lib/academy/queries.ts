import { supabase } from "@/integrations/supabase/client";

/**
 * Returns the de-duplicated, sorted list of all tags currently used on
 * any academy course (drives the Sub-categories chip-input autocomplete).
 */
export async function fetchDistinctAcademyTags(): Promise<string[]> {
  const { data, error } = await supabase
    .from("academy_courses")
    .select("tags")
    .not("tags", "is", null);
  if (error) throw error;
  const all = (data ?? []).flatMap((r: { tags: string[] | null }) => r.tags ?? []);
  return Array.from(new Set(all)).sort();
}
