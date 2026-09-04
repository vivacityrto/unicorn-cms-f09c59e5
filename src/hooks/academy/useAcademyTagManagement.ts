import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { toast } from "sonner";

const TAG_STATS_KEY = "academy-tag-stats";
const ADMIN_COURSES_KEY = "academy-courses-admin";
const DISTINCT_TAGS_KEY = "academy-distinct-tags";

export interface TagCourseRef {
  id: number;
  title: string;
  status: string | null;
}

export interface TagStat {
  tag: string;
  count: number;
  courses: TagCourseRef[];
}

/** All distinct tags in use on non-archived courses, with usage counts and the courses carrying each. */
export function useAcademyTagStats() {
  return useQuery<TagStat[]>({
    queryKey: [TAG_STATS_KEY],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("academy_courses")
        .select("id, title, status, tags")
        .not("tags", "is", null)
        .neq("status", "archived");
      if (error) throw error;

      const byTag = new Map<string, TagStat>();
      for (const course of (data ?? []) as { id: number; title: string; status: string | null; tags: string[] | null }[]) {
        for (const raw of course.tags ?? []) {
          const tag = raw?.trim();
          if (!tag) continue;
          if (!byTag.has(tag)) byTag.set(tag, { tag, count: 0, courses: [] });
          const entry = byTag.get(tag)!;
          entry.count += 1;
          entry.courses.push({ id: course.id, title: course.title, status: course.status });
        }
      }
      return Array.from(byTag.values()).sort(
        (a, b) => b.count - a.count || a.tag.localeCompare(b.tag),
      );
    },
    staleTime: 30_000,
  });
}

/**
 * Tags are stored lowercase with spaces (the convention 162 real tags
 * already use — see docs/audit-log/entries/2026-08-13-academy-tag-cleanup.md).
 * Only normalizes casing/whitespace, not hyphenation — TagChipInput's own
 * kebab-casing of newly-typed tags is a separate, pre-existing inconsistency
 * this doesn't attempt to resolve.
 */
export function normalizeTagValue(raw: string): string {
  return raw.trim().toLowerCase().replace(/\s+/g, " ");
}

/**
 * Renames a tag across every course that carries it. Passing a name that
 * already exists as a different tag on a course is how "merge" works — the
 * two collapse into one entry on that course, no separate merge code path.
 * Pass newTag: null to remove the tag from every course instead.
 */
export function useRenameAcademyTag() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async ({ oldTag, newTag: rawNewTag }: { oldTag: string; newTag: string | null }) => {
      const newTag = rawNewTag ? normalizeTagValue(rawNewTag) : null;

      // Scoped to non-archived courses, matching useAcademyTagStats — so the
      // count shown before running an action is exactly what gets touched.
      const { data: courses, error } = await supabase
        .from("academy_courses")
        .select("id, tags")
        .contains("tags", [oldTag])
        .neq("status", "archived");
      if (error) throw error;
      if (!courses?.length) return { affected: 0 };

      // Re-read each row's own current tags immediately before writing it
      // (rather than reusing the snapshot above) so this survives another
      // rename/delete touching the same course while this one is in flight.
      for (const course of courses as { id: number; tags: string[] | null }[]) {
        const { data: fresh, error: freshErr } = await supabase
          .from("academy_courses")
          .select("tags")
          .eq("id", course.id)
          .single();
        if (freshErr) throw freshErr;
        const current = (fresh?.tags as string[] | null) ?? [];
        const next = Array.from(
          new Set(
            current
              .map((t) => (t === oldTag ? newTag : t))
              .filter((t): t is string => !!t && t.trim().length > 0),
          ),
        );
        const { error: updErr } = await supabase
          .from("academy_courses")
          .update({ tags: next.length ? next : null })
          .eq("id", course.id);
        if (updErr) throw updErr;
      }
      return { affected: courses.length };
    },
    onSuccess: (result, variables) => {
      const verb = variables.newTag ? "updated" : "removed";
      toast.success(
        `Tag ${verb} across ${result.affected} course${result.affected === 1 ? "" : "s"}`,
      );
      qc.invalidateQueries({ queryKey: [TAG_STATS_KEY] });
      qc.invalidateQueries({ queryKey: [ADMIN_COURSES_KEY] });
      qc.invalidateQueries({ queryKey: [DISTINCT_TAGS_KEY] });
    },
    onError: (e: Error) => toast.error(e?.message || "Failed to update tag"),
  });
}
