import { useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Alert, AlertDescription } from "@/components/ui/alert";
import {
  Select, SelectContent, SelectItem, SelectTrigger, SelectValue,
} from "@/components/ui/select";
import { Sparkles, Loader2, AlertTriangle, ChevronDown, ChevronRight } from "lucide-react";
import { toast } from "sonner";
import {
  ACADEMY_WEBINAR_SERIES,
  validateVimeoUrl,
  extractEdgeError,
  humaniseVimeoError,
} from "@/lib/academy/aiAssist";

export type AiAssistResult = {
  title: string;
  short_description: string;
  description: string;
  target_audience: string[];
  difficulty_level: string;
  tags: string[];
  thumbnail_url: string | null;
  webinar_series: string;
  transcript: string;
  has_transcript: boolean;
};

type Props = {
  currentTitle: string;
  webinarSeries: string | null;
  onSeriesChange: (series: string) => void;
  onGenerated: (result: AiAssistResult) => void;
  disabled?: boolean;
};

export default function AiAssistPanel({
  currentTitle,
  webinarSeries,
  onSeriesChange,
  onGenerated,
  disabled,
}: Props) {
  const [open, setOpen] = useState(false);
  const [vimeoUrl, setVimeoUrl] = useState("");
  const [generating, setGenerating] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const handleGenerate = async () => {
    setError(null);
    if (!vimeoUrl.trim()) {
      setError("Vimeo URL is required");
      return;
    }
    if (!webinarSeries) {
      setError("Select a series before generating.");
      return;
    }
    const urlProblem = validateVimeoUrl(vimeoUrl.trim());
    if (urlProblem) {
      setError(urlProblem);
      return;
    }

    setGenerating(true);
    try {
      const { data: vimeo, error: vErr } = await supabase.functions.invoke(
        "academy-fetch-vimeo-transcript",
        { body: { vimeo_url: vimeoUrl.trim() } },
      );
      if (vErr) {
        throw new Error(
          humaniseVimeoError(await extractEdgeError(vErr, "Couldn't read that Vimeo video")),
        );
      }
      if (vimeo?.accessible === false) {
        throw new Error(
          String(vimeo?.error || "Vimeo's privacy settings block Academy from reading this video."),
        );
      }

      const resolvedTitle = (currentTitle.trim() || vimeo?.title || "").trim();
      const tx: string = vimeo?.transcript || "";
      const thumbnail: string | null = vimeo?.thumbnail_url ?? null;

      const { data: cls, error: cErr } = await supabase.functions.invoke("academy-ai-generate", {
        body: {
          action: "generate_classification",
          title: resolvedTitle,
          transcript: tx,
          webinar_series: webinarSeries,
        },
      });
      if (cErr) throw new Error(await extractEdgeError(cErr, "AI classification failed"));

      const audience: string[] = Array.isArray(cls?.target_audience) ? cls.target_audience : [];
      const level: string = cls?.difficulty_level || "beginner";
      const aiTags: string[] = Array.isArray(cls?.tags) ? cls.tags : [];

      const { data: desc, error: dErr } = await supabase.functions.invoke("academy-ai-generate", {
        body: {
          action: "generate_descriptions",
          title: resolvedTitle,
          target_audience: audience,
          difficulty_level: level,
          tags: aiTags,
          transcript: tx,
        },
      });
      if (dErr) throw new Error(await extractEdgeError(dErr, "AI description generation failed"));

      onGenerated({
        title: resolvedTitle,
        short_description: desc?.short_description || "",
        description: desc?.description || "",
        target_audience: audience,
        difficulty_level: level,
        tags: aiTags,
        thumbnail_url: thumbnail,
        webinar_series: webinarSeries,
        transcript: tx,
        has_transcript: !!vimeo?.has_transcript,
      });

      if (!vimeo?.has_transcript) {
        toast.success("Draft content generated — no transcript available; review carefully");
      } else {
        toast.success("Draft content generated — review and click Save Changes");
      }
    } catch (e: unknown) {
      setError(String((e as Error)?.message || "Failed to generate content"));
    } finally {
      setGenerating(false);
    }
  };

  return (
    <div className="rounded-xl border" style={{ borderColor: "hsl(var(--border))" }}>
      <button
        type="button"
        className="w-full flex items-center gap-2 p-4 text-left hover:bg-muted/30 transition-colors"
        onClick={() => setOpen((v) => !v)}
      >
        {open ? (
          <ChevronDown className="h-4 w-4 text-muted-foreground shrink-0" />
        ) : (
          <ChevronRight className="h-4 w-4 text-muted-foreground shrink-0" />
        )}
        <Sparkles className="h-4 w-4 shrink-0" style={{ color: "#7130A0" }} />
        <div className="flex-1 min-w-0">
          <p className="text-sm font-semibold" style={{ color: "#7130A0" }}>AI Assist</p>
          <p className="text-xs text-muted-foreground">
            Optional — paste a Vimeo recording to draft title, descriptions, audience, and tags
          </p>
        </div>
      </button>

      {open && (
        <div className="border-t px-4 pb-4 pt-3 space-y-3" style={{ borderColor: "hsl(var(--border))" }}>
          <div className="grid gap-3 md:grid-cols-[1fr_220px_auto] items-end">
            <div className="space-y-1">
              <label className="text-xs font-medium text-muted-foreground">Vimeo URL</label>
              <Input
                value={vimeoUrl}
                onChange={(e) => setVimeoUrl(e.target.value)}
                placeholder="https://vimeo.com/1234567890"
                disabled={disabled || generating}
              />
            </div>
            <div className="space-y-1">
              <label className="text-xs font-medium text-muted-foreground">Series</label>
              <Select
                value={webinarSeries || undefined}
                onValueChange={onSeriesChange}
                disabled={disabled || generating}
              >
                <SelectTrigger>
                  <SelectValue placeholder="Select a series" />
                </SelectTrigger>
                <SelectContent>
                  {ACADEMY_WEBINAR_SERIES.map((s) => (
                    <SelectItem key={s.value} value={s.value}>{s.value}</SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
            <Button
              onClick={handleGenerate}
              disabled={disabled || generating || !vimeoUrl.trim() || !webinarSeries}
              className="text-white hover:opacity-90"
              style={{ backgroundColor: "#7130A0" }}
            >
              {generating ? (
                <><Loader2 className="h-4 w-4 mr-2 animate-spin" /> Generating…</>
              ) : (
                <><Sparkles className="h-4 w-4 mr-2" /> Fetch & Generate with AI</>
              )}
            </Button>
          </div>

          {error && (
            <Alert variant="destructive">
              <AlertTriangle className="h-4 w-4" />
              <AlertDescription className="space-y-2">
                <span className="block">{error}</span>
                <Button
                  type="button"
                  size="sm"
                  variant="outline"
                  onClick={handleGenerate}
                  disabled={generating || disabled}
                >
                  {generating ? (
                    <Loader2 className="h-4 w-4 mr-2 animate-spin" />
                  ) : (
                    <Sparkles className="h-4 w-4 mr-2" />
                  )}
                  Try again
                </Button>
              </AlertDescription>
            </Alert>
          )}
        </div>
      )}
    </div>
  );
}
