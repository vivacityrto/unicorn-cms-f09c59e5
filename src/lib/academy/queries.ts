import { supabase } from "@/integrations/supabase/client";

/**
 * Returns the de-duplicated list of all tags currently used on any
 * non-archived academy course, most-used first (drives the Sub-categories
 * chip-input autocomplete — without this ordering, the suggestion list is
 * alphabetical and buries common tags like "rto compliance" behind
 * numeric/single-use ones like "2024").
 */
export async function fetchDistinctAcademyTags(): Promise<string[]> {
  const { data, error } = await supabase
    .from("academy_courses")
    .select("tags")
    .not("tags", "is", null)
    .neq("status", "archived");
  if (error) throw error;

  const counts = new Map<string, number>();
  for (const row of (data ?? []) as { tags: string[] | null }[]) {
    for (const raw of row.tags ?? []) {
      const tag = raw?.trim();
      if (!tag) continue;
      counts.set(tag, (counts.get(tag) ?? 0) + 1);
    }
  }
  return Array.from(counts.entries())
    .sort((a, b) => b[1] - a[1] || a[0].localeCompare(b[0]))
    .map(([tag]) => tag);
}
