import { useEffect, useMemo, useState } from "react";
import { format, parseISO } from "date-fns";
import { MessageSquare } from "lucide-react";
import { Card, CardContent } from "@/components/ui/card";
import { Skeleton } from "@/components/ui/skeleton";
import { useEvidence, useReflections } from "@/features/pdp/hooks";
import { supabase } from "@/integrations/supabase/client";

interface Props {
  cycleId: number;
}

export function ReflectionsTab({ cycleId }: Props) {
  const { data: reflections, isLoading } = useReflections(cycleId);
  const { data: evidence } = useEvidence(cycleId);
  const [lessonTitles, setLessonTitles] = useState<Map<number, string>>(new Map());

  const evidenceMap = useMemo(() => {
    const m = new Map<number, string>();
    for (const e of evidence ?? []) m.set(e.id, e.title);
    return m;
  }, [evidence]);

  useEffect(() => {
    const ids = (reflections ?? [])
      .map((r) => r.lesson_progress_id)
      .filter((x): x is number => !!x);
    if (ids.length === 0) return;
    let cancelled = false;
    (async () => {
      const { data: progress } = await supabase
        .from("academy_lesson_progress")
        .select("id, lesson_id")
        .in("id", ids);
      const lessonIds = (progress ?? []).map((p) => p.lesson_id).filter(Boolean);
      if (lessonIds.length === 0) return;
      const { data: lessons } = await supabase
        .from("academy_lessons")
        .select("id, title")
        .in("id", lessonIds);
      const lessonTitleById = new Map<number, string>();
      for (const l of lessons ?? []) lessonTitleById.set(l.id, l.title);
      const out = new Map<number, string>();
      for (const p of progress ?? []) {
        const t = lessonTitleById.get(p.lesson_id);
        if (t) out.set(p.id, t);
      }
      if (!cancelled) setLessonTitles(out);
    })();
    return () => { cancelled = true; };
  }, [reflections]);

  if (isLoading) return <Skeleton className="h-32 w-full" />;
  if (!reflections?.length) {
    return <p className="text-sm text-muted-foreground">No reflections yet.</p>;
  }

  return (
    <div className="space-y-3">
      {reflections.map((r) => {
        const source = r.lesson_progress_id
          ? lessonTitles.get(r.lesson_progress_id) ?? "Lesson reflection"
          : r.evidence_item_id
            ? evidenceMap.get(r.evidence_item_id) ?? "Evidence reflection"
            : "Reflection";
        return (
          <Card key={r.id}>
            <CardContent className="p-4">
              <div className="flex items-center justify-between mb-2">
                <span className="inline-flex items-center gap-2 text-sm font-medium">
                  <MessageSquare className="h-4 w-4 text-[var(--viv-purple)]" />
                  {source}
                </span>
                <span className="text-xs text-muted-foreground">
                  {r.created_at ? format(parseISO(r.created_at), "dd/MM/yyyy") : ""}
                </span>
              </div>
              {r.prompt && (
                <p className="text-xs italic text-muted-foreground mb-2">{r.prompt}</p>
              )}
              <p className="text-sm whitespace-pre-wrap">{r.response}</p>
            </CardContent>
          </Card>
        );
      })}
    </div>
  );
}
