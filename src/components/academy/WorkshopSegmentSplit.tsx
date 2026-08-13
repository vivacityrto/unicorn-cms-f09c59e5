import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Alert, AlertDescription } from "@/components/ui/alert";
import { Badge } from "@/components/ui/badge";
import {
  AlertTriangle, ArrowDownUp, Loader2, Plus, Scissors, Trash2, Wand2,
} from "lucide-react";

export interface WorkshopSegment {
  key: string;
  suggested_title: string;
  start_seconds: number;
  end_seconds: number;
  summary: string;
}

/** Format seconds as mm:ss, or hh:mm:ss past an hour. */
export function formatTimecode(total: number): string {
  const s = Math.max(0, Math.floor(total || 0));
  const h = Math.floor(s / 3600);
  const m = Math.floor((s % 3600) / 60);
  const sec = s % 60;
  const pad = (n: number) => String(n).padStart(2, "0");
  return h > 0 ? `${h}:${pad(m)}:${pad(sec)}` : `${pad(m)}:${pad(sec)}`;
}

/** Parse mm:ss / hh:mm:ss / plain seconds into seconds. Returns null when unparseable. */
export function parseTimecode(raw: string): number | null {
  const t = raw.trim();
  if (!t) return null;
  if (!/^\d{1,3}(:\d{1,2}){0,2}$/.test(t)) return null;
  const parts = t.split(":").map((p) => parseInt(p, 10));
  if (parts.some((p) => Number.isNaN(p))) return null;
  if (parts.length === 1) return parts[0];
  if (parts.length === 2) return parts[0] * 60 + parts[1];
  return parts[0] * 3600 + parts[1] * 60 + parts[2];
}

/** Returns a validation message, or null when the segment list is valid. */
export function validateSegments(segments: WorkshopSegment[]): string | null {
  if (segments.length === 0) return "Add at least one segment.";
  for (let i = 0; i < segments.length; i++) {
    const s = segments[i];
    if (!s.suggested_title.trim()) return `Segment ${i + 1} needs a title.`;
    if (!(s.start_seconds < s.end_seconds)) {
      return `Segment ${i + 1}: start time must be before its end time.`;
    }
    if (i > 0 && s.start_seconds < segments[i - 1].end_seconds) {
      return `Segment ${i + 1} starts before segment ${i} ends — segments must stay in order.`;
    }
  }
  return null;
}

interface Props {
  segments: WorkshopSegment[];
  onChange: (next: WorkshopSegment[]) => void;
  usedFallback: boolean;
  durationSeconds: number | null;
  onConfirm: () => void;
  confirming: boolean;
  confirmProgress?: string | null;
  confirmed: boolean;
}

export default function WorkshopSegmentSplit({
  segments,
  onChange,
  usedFallback,
  durationSeconds,
  onConfirm,
  confirming,
  confirmProgress,
  confirmed,
}: Props) {
  const disabled = confirming || confirmed;
  const error = validateSegments(segments);

  const patch = (key: string, p: Partial<WorkshopSegment>) =>
    onChange(segments.map((s) => (s.key === key ? { ...s, ...p } : s)));

  const remove = (key: string) => onChange(segments.filter((s) => s.key !== key));

  const mergeWithNext = (index: number) => {
    const a = segments[index];
    const b = segments[index + 1];
    if (!b) return;
    const merged: WorkshopSegment = {
      key: a.key,
      suggested_title: a.suggested_title,
      start_seconds: a.start_seconds,
      end_seconds: b.end_seconds,
      summary: [a.summary, b.summary].filter(Boolean).join(" "),
    };
    onChange([...segments.slice(0, index), merged, ...segments.slice(index + 2)]);
  };

  const splitRow = (index: number) => {
    const s = segments[index];
    const mid = Math.floor((s.start_seconds + s.end_seconds) / 2);
    if (mid <= s.start_seconds || mid >= s.end_seconds) return;
    const first: WorkshopSegment = { ...s, end_seconds: mid };
    const second: WorkshopSegment = {
      key: `seg-${Date.now()}-${index}`,
      suggested_title: `${s.suggested_title} (part 2)`,
      start_seconds: mid,
      end_seconds: s.end_seconds,
      summary: s.summary,
    };
    onChange([...segments.slice(0, index), first, second, ...segments.slice(index + 1)]);
  };

  const addRow = () => {
    const last = segments[segments.length - 1];
    const start = last ? last.end_seconds : 0;
    const end = Math.max(start + 60, durationSeconds ?? start + 600);
    onChange([
      ...segments,
      {
        key: `seg-${Date.now()}-new`,
        suggested_title: "",
        start_seconds: start,
        end_seconds: end,
        summary: "",
      },
    ]);
  };

  return (
    <Card>
      <CardHeader>
        <CardTitle className="text-base flex items-center gap-2">
          <Scissors className="h-4 w-4" style={{ color: "#7130A0" }} />
          2b. Split the workshop into segments
        </CardTitle>
      </CardHeader>
      <CardContent className="space-y-4">
        <p className="text-sm text-muted-foreground">
          Each segment becomes a lesson in this course, sharing the same Vimeo recording.
          Playback starts and stops at the timestamps you set below.
        </p>

        {usedFallback && (
          <Alert>
            <AlertTriangle className="h-4 w-4" />
            <AlertDescription>
              AI couldn't confidently find topic breaks in this recording — these are an even split.
              Please check and adjust the timestamps and titles below before continuing.
            </AlertDescription>
          </Alert>
        )}

        <div className="space-y-3">
          {segments.map((s, i) => (
            <div key={s.key} className="rounded-lg border p-3 space-y-3">
              <div className="flex items-start gap-2">
                <Badge variant="secondary" className="mt-2">{i + 1}</Badge>
                <div className="flex-1 space-y-2">
                  <Input
                    value={s.suggested_title}
                    disabled={disabled}
                    onChange={(e) => patch(s.key, { suggested_title: e.target.value })}
                    placeholder="Segment title"
                    aria-label={`Segment ${i + 1} title`}
                  />
                  <div className="grid gap-2 sm:grid-cols-2">
                    <div className="space-y-1">
                      <Label className="text-xs">Start (mm:ss)</Label>
                      <Input
                        defaultValue={formatTimecode(s.start_seconds)}
                        key={`start-${s.key}-${s.start_seconds}`}
                        disabled={disabled}
                        onBlur={(e) => {
                          const v = parseTimecode(e.target.value);
                          if (v == null) {
                            e.target.value = formatTimecode(s.start_seconds);
                            return;
                          }
                          patch(s.key, { start_seconds: v });
                        }}
                        aria-label={`Segment ${i + 1} start time`}
                      />
                    </div>
                    <div className="space-y-1">
                      <Label className="text-xs">End (mm:ss)</Label>
                      <Input
                        defaultValue={formatTimecode(s.end_seconds)}
                        key={`end-${s.key}-${s.end_seconds}`}
                        disabled={disabled}
                        onBlur={(e) => {
                          const v = parseTimecode(e.target.value);
                          if (v == null) {
                            e.target.value = formatTimecode(s.end_seconds);
                            return;
                          }
                          patch(s.key, { end_seconds: v });
                        }}
                        aria-label={`Segment ${i + 1} end time`}
                      />
                    </div>
                  </div>
                  {s.summary && (
                    <p className="text-xs text-muted-foreground italic">{s.summary}</p>
                  )}
                </div>
                <Button
                  variant="ghost"
                  size="icon"
                  disabled={disabled || segments.length <= 1}
                  onClick={() => remove(s.key)}
                  aria-label={`Delete segment ${i + 1}`}
                >
                  <Trash2 className="h-4 w-4 text-destructive" />
                </Button>
              </div>
              <div className="flex items-center gap-2 pl-8">
                <Button
                  variant="outline"
                  size="sm"
                  disabled={disabled}
                  onClick={() => splitRow(i)}
                >
                  <Scissors className="h-3.5 w-3.5 mr-1" /> Split
                </Button>
                <Button
                  variant="outline"
                  size="sm"
                  disabled={disabled || i === segments.length - 1}
                  onClick={() => mergeWithNext(i)}
                >
                  <ArrowDownUp className="h-3.5 w-3.5 mr-1" /> Merge with next
                </Button>
                <span className="text-xs text-muted-foreground">
                  {formatTimecode(Math.max(0, s.end_seconds - s.start_seconds))} long
                </span>
              </div>
            </div>
          ))}
        </div>

        <Button variant="outline" size="sm" onClick={addRow} disabled={disabled}>
          <Plus className="h-3.5 w-3.5 mr-1" /> Add segment
        </Button>

        {error && !confirmed && (
          <p className="text-sm text-destructive">{error}</p>
        )}

        <div className="flex items-center gap-3 flex-wrap pt-2">
          <Button
            onClick={onConfirm}
            disabled={disabled || !!error}
            className="text-white hover:opacity-90"
            style={{ backgroundColor: "#7130A0" }}
          >
            {confirming ? <Loader2 className="h-4 w-4 mr-2 animate-spin" /> : <Wand2 className="h-4 w-4 mr-2" />}
            {confirmed ? "Split confirmed" : `Confirm split & draft ${segments.length} lesson${segments.length === 1 ? "" : "s"}`}
          </Button>
          {confirming && confirmProgress && (
            <span className="text-sm text-muted-foreground">{confirmProgress}</span>
          )}
        </div>
      </CardContent>
    </Card>
  );
}
