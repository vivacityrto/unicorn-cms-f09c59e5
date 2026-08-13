import { useState } from "react";
import { useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Alert, AlertDescription } from "@/components/ui/alert";
import { Badge } from "@/components/ui/badge";
import { Loader2, ListPlus, AlertTriangle } from "lucide-react";
import { toast } from "sonner";
import { extractEdgeError } from "@/lib/academy/aiAssist";

export type ShowcaseImportResult = {
  album_id: string;
  video_count: number;
  modules_created: Array<{ id: number; title: string; module_number: number }>;
  lessons_created: Array<{ id: number; title: string; module_number: number; lesson_number: number }>;
  videos_skipped: Array<{ vimeo_id: string; title: string; reason: string }>;
  unmatched: Array<{ title: string; vimeo_id: string | null; link: string | null }>;
};

type Props = {
  courseId: number;
};

export default function ShowcaseImportPanel({ courseId }: Props) {
  const qc = useQueryClient();
  const [showcaseUrl, setShowcaseUrl] = useState("");
  const [running, setRunning] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [result, setResult] = useState<ShowcaseImportResult | null>(null);

  const handleImport = async () => {
    const url = showcaseUrl.trim();
    if (!url) {
      setError("Paste a Vimeo Showcase URL or album id.");
      return;
    }

    setError(null);
    setRunning(true);
    try {
      const { data, error: fnError } = await supabase.functions.invoke(
        "academy-import-vimeo-showcase",
        { body: { course_id: courseId, showcase_url: url } },
      );
      if (fnError) {
        throw new Error(
          await extractEdgeError(fnError, data?.error || "Showcase import failed"),
        );
      }
      if (data?.error) {
        throw new Error(String(data.error));
      }

      const summary = data as ShowcaseImportResult;
      setResult(summary);
      qc.invalidateQueries({ queryKey: ["academy-modules-lessons"] });
      qc.invalidateQueries({ queryKey: ["academy-course-total-minutes", courseId] });

      const created = summary.lessons_created?.length ?? 0;
      const modules = summary.modules_created?.length ?? 0;
      if (created === 0 && modules === 0) {
        toast.success("Showcase already imported — no new modules or lessons were added.");
      } else {
        toast.success(
          `Added ${modules} module${modules === 1 ? "" : "s"} and ${created} lesson${created === 1 ? "" : "s"}.`,
        );
      }
    } catch (err: unknown) {
      const message = err instanceof Error ? err.message : "Showcase import failed";
      setError(message);
      toast.error(message);
    } finally {
      setRunning(false);
    }
  };

  return (
    <div className="space-y-3 p-4 rounded-xl border" style={{ borderColor: "hsl(var(--border))" }}>
      <div className="flex items-center gap-2">
        <ListPlus className="h-4 w-4" style={{ color: "#7130A0" }} />
        <h3 className="text-sm font-semibold" style={{ color: "#7130A0" }}>
          Quick Add from Showcase
        </h3>
      </div>
      <p className="text-xs text-muted-foreground">
        Paste a Vimeo Showcase URL (e.g. https://vimeo.com/showcase/12364831). Matching
        titles in the form <code>M1 - Lesson 1 Title</code> become modules and lessons.
        Existing rows are never changed.
      </p>
      <div className="flex flex-col sm:flex-row gap-2">
        <Input
          value={showcaseUrl}
          onChange={(e) => setShowcaseUrl(e.target.value)}
          placeholder="https://vimeo.com/showcase/12364831"
          disabled={running}
          onKeyDown={(e) => {
            if (e.key === "Enter") {
              e.preventDefault();
              void handleImport();
            }
          }}
        />
        <Button
          onClick={() => void handleImport()}
          disabled={running || !showcaseUrl.trim()}
          className="shrink-0 text-white hover:opacity-90"
          style={{ backgroundColor: "#7130A0" }}
        >
          {running ? (
            <><Loader2 className="h-4 w-4 mr-2 animate-spin" /> Importing…</>
          ) : (
            "Import showcase"
          )}
        </Button>
      </div>

      {error && (
        <Alert variant="destructive">
          <AlertTriangle className="h-4 w-4" />
          <AlertDescription>{error}</AlertDescription>
        </Alert>
      )}

      {result && (
        <div className="space-y-2 text-sm">
          <div className="flex flex-wrap gap-2">
            <Badge variant="outline">{result.video_count} video{result.video_count === 1 ? "" : "s"} in showcase</Badge>
            <Badge variant="outline">{result.modules_created.length} module{result.modules_created.length === 1 ? "" : "s"} created</Badge>
            <Badge variant="outline">{result.lessons_created.length} lesson{result.lessons_created.length === 1 ? "" : "s"} created</Badge>
            <Badge variant="outline">{result.videos_skipped.length} already imported</Badge>
            {result.unmatched.length > 0 && (
              <Badge variant="outline" className="border-amber-300 text-amber-800">
                {result.unmatched.length} unmatched
              </Badge>
            )}
          </div>

          {result.modules_created.length > 0 && (
            <p className="text-muted-foreground">
              Modules created: {result.modules_created.map((m) => m.title).join(", ")}
            </p>
          )}
          {result.lessons_created.length > 0 && (
            <ul className="list-disc pl-5 text-muted-foreground max-h-40 overflow-y-auto">
              {result.lessons_created.map((lesson) => (
                <li key={lesson.id}>
                  M{lesson.module_number} Lesson {lesson.lesson_number}: {lesson.title}
                </li>
              ))}
            </ul>
          )}
          {result.unmatched.length > 0 && (
            <Alert variant="warning">
              <AlertTriangle className="h-4 w-4" />
              <AlertDescription>
                <span className="block font-medium mb-1">
                  These titles didn't match "M# - Lesson # …" and were left for manual handling:
                </span>
                <ul className="list-disc pl-5 space-y-0.5">
                  {result.unmatched.map((item, idx) => (
                    <li key={`${item.vimeo_id ?? "none"}-${idx}`}>{item.title}</li>
                  ))}
                </ul>
              </AlertDescription>
            </Alert>
          )}
        </div>
      )}
    </div>
  );
}
