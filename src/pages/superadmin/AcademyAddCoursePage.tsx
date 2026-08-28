import { useMemo, useState, type ReactNode } from "react";
import { useNavigate } from "react-router-dom";
import { useQuery } from "@tanstack/react-query";
import {
  DndContext,
  closestCenter,
  KeyboardSensor,
  PointerSensor,
  useSensor,
  useSensors,
  type DragEndEvent,
} from "@dnd-kit/core";
import {
  arrayMove,
  SortableContext,
  sortableKeyboardCoordinates,
  verticalListSortingStrategy,
  rectSortingStrategy,
  useSortable,
} from "@dnd-kit/sortable";
import { CSS } from "@dnd-kit/utilities";
import { supabase } from "@/integrations/supabase/client";
import { DashboardLayout } from "@/components/DashboardLayout";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Label } from "@/components/ui/label";
import { Badge } from "@/components/ui/badge";
import { Checkbox } from "@/components/ui/checkbox";
import { Switch } from "@/components/ui/switch";
import { Separator } from "@/components/ui/separator";
import { Alert, AlertDescription } from "@/components/ui/alert";
import {
  Select, SelectContent, SelectItem, SelectTrigger, SelectValue,
} from "@/components/ui/select";
import { Sparkles, Loader2, Trash2, Video, Wand2, Save, AlertTriangle, Plus, ListPlus, ArrowLeft, GripVertical } from "lucide-react";
import { toast } from "sonner";
import TagChipInput from "@/components/academy/TagChipInput";
import WorkshopSegmentSplit, {
  formatTimecode, validateSegments, type WorkshopSegment,
} from "@/components/academy/WorkshopSegmentSplit";
import { fetchDistinctAcademyTags } from "@/lib/academy/queries";

function todayLocalISODate(): string {
  const d = new Date();
  const y = d.getFullYear();
  const m = String(d.getMonth() + 1).padStart(2, "0");
  const day = String(d.getDate()).padStart(2, "0");
  return `${y}-${m}-${day}`;
}

// ── Series configuration ───────────────────────────────────────────────
type AccessDefault = "all" | "superhero";

const SERIES = [
  { value: "AI in Your RTO", session_type: "webinar", access: "all" as AccessDefault },
  { value: "Inside VET", session_type: "webinar", access: "all" as AccessDefault },
  { value: "Trainers Edge", session_type: "webinar", access: "all" as AccessDefault },
  { value: "8 Critical Drivers to RTO Success", session_type: "webinar", access: "all" as AccessDefault },
  { value: "Superhero Tools Unleashed", session_type: "webinar", access: "superhero" as AccessDefault },
  { value: "The Compliance Lab", session_type: "workshop", access: "all" as AccessDefault },
  { value: "CRICOS", session_type: "webinar", access: "all" as AccessDefault },
  { value: "Courses", session_type: "webinar", access: "all" as AccessDefault },
];

const PACKAGE_OPTIONS = [
  { id: 1060, label: "Superhero" },
  { id: 1061, label: "Sidekick" },
];

const AUDIENCE_OPTIONS = [
  { value: "trainer", label: "Trainer" },
  { value: "compliance_manager", label: "Compliance Manager" },
  { value: "governance_person", label: "Governance Person" },
  { value: "student_support_officer", label: "Student Support Officer" },
  { value: "administration_assistant", label: "Administration Assistant" },
];

type SourceType = "video" | "showcase";

/** Slice a timestamped transcript ("[mm:ss] text" or WebVTT-ish lines) to a segment window. */
function sliceTimestampedTranscript(timed: string, start: number, end: number): string {
  if (!timed.trim()) return "";
  const lines = timed.split(/\r?\n/);
  const kept: string[] = [];
  let currentSeconds: number | null = null;
  for (const line of lines) {
    const m = line.match(/(\d{1,2}):(\d{2})(?::(\d{2}))?/);
    if (m) {
      const a = Number(m[1]);
      const b = Number(m[2]);
      const c = m[3] != null ? Number(m[3]) : null;
      currentSeconds = c != null ? a * 3600 + b * 60 + c : a * 60 + b;
    }
    if (currentSeconds != null && currentSeconds >= start && currentSeconds <= end) {
      kept.push(line);
    }
  }
  return kept.join("\n").trim();
}

const DIFFICULTY_OPTIONS = ["beginner", "intermediate", "advanced"];

interface QuizOption { value: string; label: string; is_correct: boolean }
interface QuizQuestion {
  key: string;
  question_text: string;
  explanation: string;
  options: QuizOption[];
}

interface SegmentDraft {
  key: string;
  segment: WorkshopSegment;
  transcript: string;
  title: string;
  shortDescription: string;
  description: string;
  targetAudience: string[];
  difficulty: string;
  tags: string[];
  questions: QuizQuestion[];
}

/** One lesson drafted from a showcase video — mirrors SegmentDraft's editable
 * fields so the shared review UI (step 3) can treat either the same way. */
interface ShowcaseItemDraft {
  key: string;
  moduleNumber: number;
  lessonNumber: number;
  vimeoId: string;
  vimeoLink: string;
  transcript: string;
  title: string;
  shortDescription: string;
  description: string;
  targetAudience: string[];
  difficulty: string;
  tags: string[];
  questions: QuizQuestion[];
  durationSeconds: number | null;
  thumbnailUrl: string | null;
  alreadyImported: boolean;
  existingCourses: Array<{ id: number; title: string; status: string | null }>;
}

type ShowcaseParsedItem = {
  module_number: number;
  lesson_number: number;
  title: string;
  vimeo_id: string;
  link: string;
  duration_seconds: number | null;
  thumbnail_url: string | null;
  already_imported: boolean;
  existing_courses: Array<{ id: number; title: string; status: string | null }>;
};

type ShowcaseUnmatchedItem = { title: string; vimeo_id: string | null; link: string | null };

type ShowcasePreview = {
  albumId: string;
  videoCount: number;
  parsed: ShowcaseParsedItem[];
  unmatched: ShowcaseUnmatchedItem[];
};

function generateSlug(title: string): string {
  return title
    .toLowerCase()
    .replace(/[^a-z0-9\s-]/g, "")
    .replace(/\s+/g, "-")
    .replace(/-+/g, "-")
    .slice(0, 80);
}

function formatDuration(seconds: number | null): string {
  if (!seconds) return "—";
  const m = Math.round(seconds / 60);
  if (m < 60) return `${m} min`;
  const h = Math.floor(m / 60);
  return `${h}h ${m % 60}m`;
}

function normaliseOptions(raw: any): QuizOption[] {
  if (!Array.isArray(raw)) return [];
  return raw.map((o: any, i: number) => ({
    value: String(o?.value ?? String.fromCharCode(97 + i)),
    label: String(o?.label ?? o ?? ""),
    is_correct: !!o?.is_correct,
  }));
}

/** Returns an error message when the pasted Vimeo URL cannot be resolved, else null. */
function validateVimeoUrl(raw: string): string | null {
  let url: URL;
  try {
    url = new URL(raw);
  } catch {
    return "That doesn't look like a valid URL. Paste the full Vimeo link, e.g. https://vimeo.com/1215370924";
  }
  if (!/(^|\.)vimeo\.com$/.test(url.hostname)) {
    return "Only Vimeo links are supported.";
  }
  // Share links (vimeo.com/share/xxxx) and Manage links (vimeo.com/manage/videos/123)
  // are resolved server-side, so only reject links with neither shape.
  if (/^\/share\//.test(url.pathname)) {
    return null;
  }
  if (!/\d{6,}/.test(url.pathname)) {
    return "Couldn't find a video ID in that link. Use the video's Vimeo page URL, e.g. https://vimeo.com/1215370924";
  }

  return null;
}

/** Returns an error message when the pasted Showcase URL cannot be resolved, else null. */
function validateShowcaseUrl(raw: string): string | null {
  if (/^\d+$/.test(raw.trim())) return null;
  let url: URL;
  try {
    url = new URL(raw);
  } catch {
    return "That doesn't look like a valid URL. Paste the full Showcase link, e.g. https://vimeo.com/showcase/12364831";
  }
  if (!/(^|\.)vimeo\.com$/.test(url.hostname)) {
    return "Only Vimeo links are supported.";
  }
  if (!/\/showcase\/\d+/.test(url.pathname)) {
    return "Couldn't find a showcase id in that link. Use the showcase's own URL, e.g. https://vimeo.com/showcase/12364831";
  }
  return null;
}

/** Pull the real message out of a Supabase Functions error instead of "non-2xx status code". */
async function extractEdgeError(err: any, fallback: string): Promise<string> {
  const res = err?.context;
  if (res && typeof res.clone === "function") {
    try {
      const body = await res.clone().json();
      const msg = body?.error || body?.message || body?.reason;
      if (msg) return String(msg);
    } catch {
      try {
        const text = await res.clone().text();
        if (text?.trim()) return text.trim().slice(0, 500);
      } catch { /* ignore */ }
    }
  }
  return err?.message || fallback;
}

/**
 * Vimeo replies 404 for any video the connected API token can't see — wrong
 * account, deleted video, or a video whose privacy settings weren't passed in
 * the link. Turn that into something actionable.
 */
function humaniseVimeoError(msg: string): string {
  if (/404/.test(msg) && /vimeo/i.test(msg)) {
    return "Vimeo returned 404 for that video. Check the video is on the connected Vimeo account, hasn't been deleted, or paste the full privacy-hash link if it's restricted.";
  }
  if (/401|403/.test(msg) && /vimeo/i.test(msg)) {
    return "Vimeo rejected our credentials for that video. Check the video lives on the connected Vimeo account.";
  }
  return msg;
}

/** One draggable row in the showcase review list — reordering here decides lesson order. */
function SortableShowcaseRow({ item }: { item: ShowcaseParsedItem }) {
  const { attributes, listeners, setNodeRef, transform, transition, isDragging } = useSortable({
    id: item.vimeo_id,
  });
  const style = {
    transform: CSS.Transform.toString(transform),
    transition,
    opacity: isDragging ? 0.4 : 1,
  };

  return (
    <li
      ref={setNodeRef}
      style={style}
      className="flex items-center gap-2 border-b py-1 last:border-b-0 bg-background"
    >
      <button
        type="button"
        className="p-0.5 text-muted-foreground hover:text-foreground cursor-grab active:cursor-grabbing touch-none shrink-0"
        aria-label={`Reorder ${item.title}`}
        {...attributes}
        {...listeners}
      >
        <GripVertical className="h-3.5 w-3.5" />
      </button>
      <span className="text-xs text-muted-foreground shrink-0 w-5 text-right">{item.lesson_number}.</span>
      <span className="flex-1 truncate">{item.title}</span>
      <span className="flex items-center gap-2 shrink-0">
        <span className="text-xs text-muted-foreground">{formatDuration(item.duration_seconds)}</span>
        {item.already_imported && (
          <Badge variant="outline" className="text-[10px] border-amber-300 text-amber-800">
            already used by {item.existing_courses.map((c) => c.title).join(", ")}
          </Badge>
        )}
      </span>
    </li>
  );
}

/** One draggable lesson chip in the drafted-lessons strip — reordering here doesn't re-run AI. */
function SortableShowcaseChip({
  id,
  selected,
  onSelect,
  children,
}: {
  id: string;
  selected: boolean;
  onSelect: () => void;
  children: ReactNode;
}) {
  const { attributes, listeners, setNodeRef, transform, transition, isDragging } = useSortable({ id });
  const style = {
    transform: CSS.Transform.toString(transform),
    transition,
    opacity: isDragging ? 0.4 : 1,
  };

  return (
    <div ref={setNodeRef} style={style} className="touch-none" {...attributes} {...listeners}>
      <Button
        type="button"
        variant={selected ? "default" : "outline"}
        size="sm"
        onClick={onSelect}
        className={selected ? "text-white cursor-grab active:cursor-grabbing" : "cursor-grab active:cursor-grabbing"}
        style={selected ? { backgroundColor: "#7130A0" } : undefined}
      >
        {children}
      </Button>
    </div>
  );
}

export default function AcademyAddCoursePage() {
  const navigate = useNavigate();

  // Step 1
  const [sourceType, setSourceType] = useState<SourceType>("video");
  const [vimeoUrl, setVimeoUrl] = useState("");
  const [showcaseUrl, setShowcaseUrl] = useState("");
  const [generateError, setGenerateError] = useState<string | null>(null);
  const [series, setSeries] = useState<string>("");
  const [episodeTitle, setEpisodeTitle] = useState("");
  const [facilitatorId, setFacilitatorId] = useState("");
  const [splitIntoLessons, setSplitIntoLessons] = useState(true);
  const [deliveryDate, setDeliveryDate] = useState(todayLocalISODate);

  const { data: facilitators = [] } = useQuery({
    queryKey: ["academy-quick-add-facilitators"],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("users")
        .select("user_uuid, full_name, archived, disabled")
        .eq("is_vivacity_internal", true)
        .eq("is_system_account", false)
        .order("full_name");
      if (error) throw error;
      // Inactive internal users can still be the historical facilitator of a
      // draft recording, so keep them selectable and label them in the UI.
      return data ?? [];
    },
    staleTime: 60_000,
  });

  // Same distinct-tag source Tag Management and the course builder use, so
  // Add Course's tag chip input suggests real existing tags instead of
  // operating in a vacuum and drifting from the curated list.
  const { data: distinctTags = [] } = useQuery({
    queryKey: ["academy-distinct-tags"],
    queryFn: fetchDistinctAcademyTags,
    staleTime: 5 * 60 * 1000,
  });

  // Duplicate-video guard: Add Course previously had no way to know a Vimeo
  // recording had already been imported, which is exactly how the 2026-08-13
  // "Diversity Inclusion Cultural Safety" duplicate happened (same video run
  // through Quick Add twice, 2 minutes apart). Matched on the numeric Vimeo
  // ID the fetch edge function resolves (not the raw pasted URL, which can
  // vary in format — share link, privacy hash, embed URL — for the same
  // video), against every non-archived course already pointing at it.
  const [duplicateVideo, setDuplicateVideo] = useState<{
    videoId: string;
    courses: { id: number; title: string; status: string | null }[];
  } | null>(null);

  // Step 2 results (single-video mode)
  const [generating, setGenerating] = useState(false);
  const [hasTranscript, setHasTranscript] = useState<boolean | null>(null);
  const [transcript, setTranscript] = useState("");
  const [durationSeconds, setDurationSeconds] = useState<number | null>(null);
  const [thumbnailUrl, setThumbnailUrl] = useState<string | null>(null);
  const [generated, setGenerated] = useState(false);
  const [transcriptTimestamped, setTranscriptTimestamped] = useState("");

  // Workshop split (Compliance Lab only, single-video mode)
  const [segments, setSegments] = useState<WorkshopSegment[]>([]);
  const [segmentsFallback, setSegmentsFallback] = useState(false);
  const [splitConfirming, setSplitConfirming] = useState(false);
  const [splitProgress, setSplitProgress] = useState<string | null>(null);
  const [splitConfirmed, setSplitConfirmed] = useState(false);
  const [drafts, setDrafts] = useState<SegmentDraft[]>([]);
  const [selectedDraft, setSelectedDraft] = useState(0);

  // Showcase mode
  const [showcasePreview, setShowcasePreview] = useState<ShowcasePreview | null>(null);
  const [showcaseConfirming, setShowcaseConfirming] = useState(false);
  const [showcaseProgress, setShowcaseProgress] = useState<string | null>(null);
  const [showcaseItems, setShowcaseItems] = useState<ShowcaseItemDraft[]>([]);
  const [selectedShowcaseItem, setSelectedShowcaseItem] = useState(0);

  const showcaseSensors = useSensors(
    useSensor(PointerSensor, { activationConstraint: { distance: 5 } }),
    useSensor(KeyboardSensor, { coordinateGetter: sortableKeyboardCoordinates }),
  );

  // Reordering the review list decides lesson order — resequence lesson_number
  // to match, and keep any already-drafted items (showcaseItems) in step with
  // it so a reorder after drafting doesn't require a full AI redraft.
  const handleShowcaseReorder = (event: DragEndEvent) => {
    const { active, over } = event;
    if (!over || active.id === over.id) return;
    setShowcasePreview((prev) => {
      if (!prev) return prev;
      const oldIndex = prev.parsed.findIndex((p) => p.vimeo_id === active.id);
      const newIndex = prev.parsed.findIndex((p) => p.vimeo_id === over.id);
      if (oldIndex === -1 || newIndex === -1) return prev;
      const reordered = arrayMove(prev.parsed, oldIndex, newIndex).map((item, i) => ({
        ...item,
        lesson_number: i + 1,
      }));
      return { ...prev, parsed: reordered };
    });
    setShowcaseItems((prev) => {
      const oldIndex = prev.findIndex((d) => d.vimeoId === active.id);
      const newIndex = prev.findIndex((d) => d.vimeoId === over.id);
      if (oldIndex === -1 || newIndex === -1) return prev;
      return arrayMove(prev, oldIndex, newIndex).map((d, i) => ({ ...d, lessonNumber: i + 1 }));
    });
  };

  // Reordering the drafted-lessons strip (after AI drafting) — keeps the
  // preview list's numbering in sync too, but never re-invokes the AI, since
  // the content is already drafted and re-running it would just burn tokens
  // to produce the same text.
  const handleShowcaseItemsReorder = (event: DragEndEvent) => {
    const { active, over } = event;
    if (!over || active.id === over.id) return;
    const oldIndex = showcaseItems.findIndex((d) => d.key === active.id);
    const newIndex = showcaseItems.findIndex((d) => d.key === over.id);
    if (oldIndex === -1 || newIndex === -1) return;
    const reordered = arrayMove(showcaseItems, oldIndex, newIndex).map((d, i) => ({ ...d, lessonNumber: i + 1 }));
    setShowcaseItems(reordered);
    if (selectedShowcaseItem === oldIndex) setSelectedShowcaseItem(newIndex);
    setShowcasePreview((prev) => {
      if (!prev) return prev;
      const byVimeoId = new Map(reordered.map((d, i) => [d.vimeoId, i + 1]));
      return {
        ...prev,
        parsed: prev.parsed
          .map((p) => ({ ...p, lesson_number: byVimeoId.get(p.vimeo_id) ?? p.lesson_number }))
          .sort((a, b) => a.lesson_number - b.lesson_number),
      };
    });
  };

  // Step 3 editable fields (single-video mode)
  const [title, setTitle] = useState("");
  const [shortDescription, setShortDescription] = useState("");
  const [description, setDescription] = useState("");
  const [targetAudience, setTargetAudience] = useState<string[]>([]);
  const [difficulty, setDifficulty] = useState("beginner");
  const [tags, setTags] = useState<string[]>([]);

  // Step 4
  const [availableToAll, setAvailableToAll] = useState(true);
  const [packageIds, setPackageIds] = useState<number[]>([]);

  // Step 5
  const [questions, setQuestions] = useState<QuizQuestion[]>([]);
  const [generatingQuiz, setGeneratingQuiz] = useState(false);

  const [saving, setSaving] = useState(false);

  const seriesCfg = useMemo(() => SERIES.find((s) => s.value === series), [series]);
  const sessionType = seriesCfg?.session_type ?? "webinar";
  const workshopActive = sourceType === "video" && splitIntoLessons && drafts.length > 0;
  const showcaseActive = sourceType === "showcase" && showcaseItems.length > 0;
  const multiActive = workshopActive || showcaseActive;
  const activeItems: Array<SegmentDraft | ShowcaseItemDraft> = workshopActive
    ? drafts
    : showcaseActive
      ? showcaseItems
      : [];
  const activeIndex = workshopActive
    ? Math.min(selectedDraft, Math.max(0, drafts.length - 1))
    : Math.min(selectedShowcaseItem, Math.max(0, showcaseItems.length - 1));
  const setActiveIndex = workshopActive ? setSelectedDraft : setSelectedShowcaseItem;
  const cur = multiActive ? (activeItems[activeIndex] as SegmentDraft & ShowcaseItemDraft) : null;

  const patchDraft = (patch: Partial<SegmentDraft & ShowcaseItemDraft>) => {
    if (workshopActive) {
      setDrafts((prev) => prev.map((d, i) => (i === activeIndex ? { ...d, ...patch } : d)));
    } else if (showcaseActive) {
      setShowcaseItems((prev) => prev.map((d, i) => (i === activeIndex ? { ...d, ...patch } : d)));
    }
  };

  // Step 3/5 fields resolve to the selected workshop segment or showcase
  // lesson when in a multi-item mode, otherwise to the single-course state.
  const vTitle = cur ? cur.title : title;
  const setVTitle = (v: string) => (cur ? patchDraft({ title: v }) : setTitle(v));
  const vShortDescription = cur ? cur.shortDescription : shortDescription;
  const setVShortDescription = (v: string) =>
    cur ? patchDraft({ shortDescription: v }) : setShortDescription(v);
  const vDescription = cur ? cur.description : description;
  const setVDescription = (v: string) => (cur ? patchDraft({ description: v }) : setDescription(v));
  const vTargetAudience = cur ? cur.targetAudience : targetAudience;
  const setVTargetAudience = (next: string[]) =>
    cur ? patchDraft({ targetAudience: next }) : setTargetAudience(next);
  const vDifficulty = cur ? cur.difficulty : difficulty;
  const setVDifficulty = (v: string) => (cur ? patchDraft({ difficulty: v }) : setDifficulty(v));
  const vTags = cur ? cur.tags : tags;
  const setVTags = (next: string[]) => (cur ? patchDraft({ tags: next }) : setTags(next));
  const vQuestions = cur ? cur.questions : questions;
  const setVQuestions = (updater: (prev: QuizQuestion[]) => QuizQuestion[]) => {
    if (cur) patchDraft({ questions: updater(cur.questions) });
    else setQuestions(updater);
  };
  const vTranscript = cur ? cur.transcript : transcript;

  const handleSeriesChange = (value: string) => {
    setSeries(value);
    const cfg = SERIES.find((s) => s.value === value);
    if (cfg?.access === "superhero") {
      setAvailableToAll(false);
      setPackageIds([1060]);
    } else {
      setAvailableToAll(true);
      setPackageIds([]);
    }
  };

  const handleSourceTypeChange = (next: SourceType) => {
    if (next === sourceType) return;
    setSourceType(next);
    setGenerateError(null);
    setGenerated(false);
    setDuplicateVideo(null);
  };

  // ── Step 2: Generate with AI (single-video mode) ──
  const handleGenerate = async (skipDuplicateCheck = false) => {
    setGenerateError(null);
    if (!vimeoUrl.trim()) { setGenerateError("Vimeo URL is required"); return; }
    if (!series) { setGenerateError("Select a series before generating."); return; }
    const urlProblem = validateVimeoUrl(vimeoUrl.trim());
    if (urlProblem) { setGenerateError(urlProblem); return; }
    setGenerating(true);
    try {
      const { data: vimeo, error: vErr } = await supabase.functions.invoke(
        "academy-fetch-vimeo-transcript",
        { body: { vimeo_url: vimeoUrl.trim() } },
      );
      if (vErr)
        throw new Error(
          humaniseVimeoError(await extractEdgeError(vErr, "Couldn't read that Vimeo video")),
        );
      if (vimeo?.accessible === false) {
        throw new Error(
          String(vimeo?.error || "Vimeo's privacy settings block Academy from reading this video."),
        );
      }

      const videoId: string | null = vimeo?.video_id ?? null;
      if (videoId && !skipDuplicateCheck) {
        const { data: matchingVideos } = await supabase
          .from("training_videos")
          .select("id")
          .ilike("vimeo_url", `%${videoId}%`);
        const matchIds = (matchingVideos ?? []).map((v: any) => v.id);
        if (matchIds.length > 0) {
          const { data: existingCourses } = await supabase
            .from("academy_courses")
            .select("id, title, status")
            .in("source_video_id", matchIds)
            .neq("status", "archived");
          if (existingCourses && existingCourses.length > 0) {
            setDuplicateVideo({ videoId, courses: existingCourses as any });
            setGenerating(false);
            return;
          }
        }
      }
      setDuplicateVideo(null);

      const resolvedTitle = (episodeTitle.trim() || vimeo?.title || "").trim();
      const tx: string = vimeo?.transcript || "";
      setTranscript(tx);
      setHasTranscript(!!vimeo?.has_transcript);
      setDurationSeconds(vimeo?.duration_seconds ?? null);
      setThumbnailUrl(vimeo?.thumbnail_url ?? null);
      setTitle(resolvedTitle);
      if (!episodeTitle.trim() && vimeo?.title) setEpisodeTitle(vimeo.title);
      const timestamped: string = vimeo?.transcript_timestamped || "";
      setTranscriptTimestamped(timestamped);

      // Workshops split into topic segments; each becomes a lesson in one course.
      if (splitIntoLessons) {
        setDrafts([]);
        setSplitConfirmed(false);
        const { data: seg, error: sErr } = await supabase.functions.invoke("academy-ai-generate", {
          body: {
            action: "generate_workshop_segments",
            title: resolvedTitle,
            transcript_timestamped: timestamped,
            duration_seconds: vimeo?.duration_seconds ?? null,
          },
        });
        if (sErr) throw new Error(await extractEdgeError(sErr, "AI segment detection failed"));
        const rawSegments: any[] = Array.isArray(seg?.segments) ? seg.segments : [];
        if (rawSegments.length === 0) throw new Error("AI returned no workshop segments");
        const total = Number(vimeo?.duration_seconds) > 0 ? Math.floor(Number(vimeo.duration_seconds)) : null;
        setSegments(
          rawSegments.map((r, i) => ({
            key: `seg-${Date.now()}-${i}`,
            suggested_title: String(r?.suggested_title ?? `Segment ${i + 1}`),
            start_seconds: Math.max(0, Math.min(total ?? Number.MAX_SAFE_INTEGER, Math.floor(Number(r?.start_seconds ?? 0)))),
            end_seconds: Math.max(1, Math.min(total ?? Number.MAX_SAFE_INTEGER, Math.floor(Number(r?.end_seconds ?? 0)))),
            summary: String(r?.summary ?? ""),
          })),
        );
        setSegmentsFallback(!!seg?.used_fallback);
        setGenerated(true);
        toast.success(`${rawSegments.length} segments detected — review the split below`);
        return;
      }

      const { data: cls, error: cErr } = await supabase.functions.invoke("academy-ai-generate", {
        body: {
          action: "generate_classification",
          title: resolvedTitle,
          transcript: tx,
          webinar_series: series,
          existing_tags: distinctTags,
        },
      });
      if (cErr) throw new Error(await extractEdgeError(cErr, "AI classification failed"));
      const audience: string[] = Array.isArray(cls?.target_audience) ? cls.target_audience : [];
      const level: string = cls?.difficulty_level || "beginner";
      const aiTags: string[] = Array.isArray(cls?.tags) ? cls.tags : [];
      setTargetAudience(audience);
      setDifficulty(level);
      setTags(aiTags);

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
      setShortDescription(desc?.short_description || "");
      setDescription(desc?.description || "");

      setGenerated(true);
      toast.success("Draft content generated");
    } catch (e: any) {
      setGenerateError(String(e?.message || "Failed to generate content"));
    } finally {
      setGenerating(false);
    }
  };

  // ── Step 2b: Confirm workshop split and draft each segment ──
  const handleConfirmSplit = async () => {
    const problem = validateSegments(segments);
    if (problem) { toast.error(problem); return; }
    setSplitConfirming(true);
    setSplitProgress(null);
    try {
      const built: SegmentDraft[] = [];
      // Seeded from the platform-wide catalog, then grown with each
      // segment's own chosen tags — so segment 2 onward sees what segment 1
      // already picked and reuses it instead of coining a same-topic variant
      // ("quality assurance" vs "quality_assurance" vs "quality"). Without
      // this, each segment's classification call is blind to the other 7 in
      // the same recording, and a single workshop course ends up unioning
      // 30+ near-duplicate tags across its segments.
      const sessionTags = new Set(distinctTags);
      for (let i = 0; i < segments.length; i++) {
        const seg = segments[i];
        setSplitProgress(`Drafting segment ${i + 1} of ${segments.length}…`);

        const segTranscript =
          sliceTimestampedTranscript(transcriptTimestamped, seg.start_seconds, seg.end_seconds) ||
          transcript;

        const { data: cls, error: cErr } = await supabase.functions.invoke("academy-ai-generate", {
          body: {
            action: "generate_classification",
            title: seg.suggested_title,
            transcript: segTranscript,
            webinar_series: series || null,
            existing_tags: Array.from(sessionTags),
          },
        });
        if (cErr) throw new Error(await extractEdgeError(cErr, `AI classification failed for segment ${i + 1}`));
        const audience: string[] = Array.isArray(cls?.target_audience) ? cls.target_audience : [];
        const level: string = cls?.difficulty_level || "beginner";
        const aiTags: string[] = Array.isArray(cls?.tags) ? cls.tags : [];
        aiTags.forEach((t) => sessionTags.add(t));

        const { data: desc, error: dErr } = await supabase.functions.invoke("academy-ai-generate", {
          body: {
            action: "generate_descriptions",
            title: seg.suggested_title,
            target_audience: audience,
            difficulty_level: level,
            tags: aiTags,
            transcript: segTranscript,
          },
        });
        if (dErr) throw new Error(await extractEdgeError(dErr, `AI descriptions failed for segment ${i + 1}`));

        const { data: qz, error: qErr } = await supabase.functions.invoke("academy-ai-generate", {
          body: {
            action: "generate_questions",
            title: seg.suggested_title,
            target_audience: audience,
            context_text: segTranscript,
          },
        });
        if (qErr) throw new Error(await extractEdgeError(qErr, `AI quiz failed for segment ${i + 1}`));
        const rawQs = Array.isArray(qz?.questions) ? qz.questions : Array.isArray(qz) ? qz : [];

        built.push({
          key: seg.key,
          segment: seg,
          transcript: segTranscript,
          title: seg.suggested_title,
          shortDescription: desc?.short_description || "",
          description: desc?.description || "",
          targetAudience: audience,
          difficulty: level,
          tags: aiTags,
          questions: rawQs.map((q: any, qi: number) => ({
            key: `q-${seg.key}-${qi}`,
            question_text: String(q?.question_text ?? ""),
            explanation: String(q?.explanation ?? ""),
            options: normaliseOptions(q?.options),
          })),
        });
      }
      setDrafts(built);
      setSelectedDraft(0);
      setSplitConfirmed(true);
      toast.success(`${built.length} segment drafts ready to review`);
    } catch (e: any) {
      toast.error(e?.message || "Failed to draft workshop segments");
    } finally {
      setSplitConfirming(false);
      setSplitProgress(null);
    }
  };

  // ── Step 2 (showcase mode): fetch the album and parse its titles ──
  const handlePreviewShowcase = async () => {
    setGenerateError(null);
    if (!showcaseUrl.trim()) { setGenerateError("Vimeo Showcase URL is required"); return; }
    if (!series) { setGenerateError("Select a series before generating."); return; }
    const urlProblem = validateShowcaseUrl(showcaseUrl.trim());
    if (urlProblem) { setGenerateError(urlProblem); return; }
    setGenerating(true);
    try {
      const { data, error: fnError } = await supabase.functions.invoke(
        "academy-import-vimeo-showcase",
        { body: { showcase_url: showcaseUrl.trim() } },
      );
      if (fnError) {
        throw new Error(await extractEdgeError(fnError, "Couldn't read that Vimeo showcase"));
      }
      if (data?.error) throw new Error(String(data.error));

      const parsed: ShowcaseParsedItem[] = Array.isArray(data?.parsed) ? data.parsed : [];
      const unmatched: ShowcaseUnmatchedItem[] = Array.isArray(data?.unmatched) ? data.unmatched : [];
      if (parsed.length === 0 && unmatched.length === 0) {
        throw new Error("That showcase has no videos.");
      }
      setShowcasePreview({
        albumId: String(data.album_id),
        videoCount: Number(data.video_count) || parsed.length + unmatched.length,
        parsed,
        unmatched,
      });
      setShowcaseItems([]);
      setGenerated(false);
      toast.success(`${parsed.length} video${parsed.length === 1 ? "" : "s"} found — reorder below if needed, then draft with AI`);
    } catch (e: any) {
      setGenerateError(String(e?.message || "Failed to read that showcase"));
    } finally {
      setGenerating(false);
    }
  };

  // ── Step 2b (showcase mode): fetch transcript + draft AI content per video ──
  const handleConfirmShowcase = async () => {
    if (!showcasePreview || showcasePreview.parsed.length === 0) return;
    setShowcaseConfirming(true);
    setShowcaseProgress(null);
    const built: ShowcaseItemDraft[] = [];
    const failed: Array<{ title: string; error: string }> = [];
    try {
      const items = showcasePreview.parsed;
      // Same growing-tag-set trick as the workshop segment loop — lesson 2
      // onward reuses tags lesson 1 already picked instead of coining a
      // same-topic variant.
      const sessionTags = new Set(distinctTags);
      for (let i = 0; i < items.length; i++) {
        const item = items[i];
        const label = item.title;
        try {
          setShowcaseProgress(`Reading video ${i + 1} of ${items.length} — ${label}…`);

          const { data: vimeo, error: vErr } = await supabase.functions.invoke(
            "academy-fetch-vimeo-transcript",
            { body: { vimeo_url: item.link } },
          );
          if (vErr) {
            throw new Error(humaniseVimeoError(await extractEdgeError(vErr, `Couldn't read ${label}`)));
          }
          if (vimeo?.accessible === false) {
            throw new Error(
              `${vimeo?.error || "Vimeo's privacy settings block Academy from reading this video."}`,
            );
          }
          const tx: string = vimeo?.transcript || "";

          setShowcaseProgress(`Drafting ${i + 1} of ${items.length} — ${label}…`);

          const { data: cls, error: cErr } = await supabase.functions.invoke("academy-ai-generate", {
            body: {
              action: "generate_classification",
              title: item.title,
              transcript: tx,
              webinar_series: series || null,
              existing_tags: Array.from(sessionTags),
            },
          });
          if (cErr) throw new Error(await extractEdgeError(cErr, "AI classification failed"));
          const audience: string[] = Array.isArray(cls?.target_audience) ? cls.target_audience : [];
          const level: string = cls?.difficulty_level || "beginner";
          const aiTags: string[] = Array.isArray(cls?.tags) ? cls.tags : [];
          aiTags.forEach((t) => sessionTags.add(t));

          const { data: desc, error: dErr } = await supabase.functions.invoke("academy-ai-generate", {
            body: {
              action: "generate_descriptions",
              title: item.title,
              target_audience: audience,
              difficulty_level: level,
              tags: aiTags,
              transcript: tx,
            },
          });
          if (dErr) throw new Error(await extractEdgeError(dErr, "AI descriptions failed"));

          const { data: qz, error: qErr } = await supabase.functions.invoke("academy-ai-generate", {
            body: {
              action: "generate_questions",
              title: item.title,
              target_audience: audience,
              context_text: tx,
            },
          });
          if (qErr) throw new Error(await extractEdgeError(qErr, "AI quiz failed"));
          const rawQs = Array.isArray(qz?.questions) ? qz.questions : Array.isArray(qz) ? qz : [];

          built.push({
            key: `sc-${item.vimeo_id}`,
            moduleNumber: item.module_number,
            lessonNumber: item.lesson_number,
            vimeoId: item.vimeo_id,
            vimeoLink: item.link,
            transcript: tx,
            title: item.title,
            shortDescription: desc?.short_description || "",
            description: desc?.description || "",
            targetAudience: audience,
            difficulty: level,
            tags: aiTags,
            questions: rawQs.map((q: any, qi: number) => ({
              key: `q-${item.vimeo_id}-${qi}`,
              question_text: String(q?.question_text ?? ""),
              explanation: String(q?.explanation ?? ""),
              options: normaliseOptions(q?.options),
            })),
            durationSeconds: vimeo?.duration_seconds ?? item.duration_seconds ?? null,
            thumbnailUrl: vimeo?.thumbnail_url ?? item.thumbnail_url ?? null,
            alreadyImported: !!item.already_imported,
            existingCourses: Array.isArray(item.existing_courses) ? item.existing_courses : [],
          });
        } catch (itemErr: any) {
          // One video's transient failure (e.g. a flaky AI response) shouldn't
          // discard everything already drafted in this batch — record it and
          // keep going, so the user only has to retry the ones that failed.
          failed.push({ title: label, error: itemErr?.message || "Unknown error" });
        }
      }
      setShowcaseItems(built);
      setSelectedShowcaseItem(0);
      setGenerated(built.length > 0);
      if (failed.length === 0) {
        toast.success(`${built.length} lesson${built.length === 1 ? "" : "s"} drafted — review below`);
      } else if (built.length === 0) {
        toast.error(`All ${failed.length} videos failed to draft. First error: ${failed[0].error}`);
      } else {
        toast.warning(
          `${built.length} lesson${built.length === 1 ? "" : "s"} drafted, ${failed.length} failed: ${failed.map((f) => f.title).join(", ")}. Click "Redraft all with AI" to retry.`,
        );
      }
    } finally {
      setShowcaseConfirming(false);
      setShowcaseProgress(null);
    }
  };

  // ── Step 5: Generate quiz ──
  const handleGenerateQuiz = async () => {
    if (!vTitle.trim()) { toast.error("A title is required first"); return; }
    setGeneratingQuiz(true);
    try {
      const { data, error } = await supabase.functions.invoke("academy-ai-generate", {
        body: {
          action: "generate_questions",
          title: vTitle.trim(),
          target_audience: vTargetAudience,
          context_text: vTranscript,
        },
      });
      if (error) throw new Error(await extractEdgeError(error, "Failed to generate questions"));
      const raw = Array.isArray(data?.questions) ? data.questions : Array.isArray(data) ? data : [];
      setVQuestions(() =>
        raw.map((q: any, i: number) => ({
          key: `q-${Date.now()}-${i}`,
          question_text: String(q?.question_text ?? ""),
          explanation: String(q?.explanation ?? ""),
          options: normaliseOptions(q?.options),
        })),
      );
      toast.success(`${raw.length} questions drafted`);
    } catch (e: any) {
      toast.error(e?.message || "Failed to generate questions");
    } finally {
      setGeneratingQuiz(false);
    }
  };

  const updateQuestion = (key: string, patch: Partial<QuizQuestion>) =>
    setVQuestions((prev) => prev.map((q) => (q.key === key ? { ...q, ...patch } : q)));

  const updateOption = (key: string, idx: number, patch: Partial<QuizOption>) =>
    setVQuestions((prev) =>
      prev.map((q) =>
        q.key === key
          ? { ...q, options: q.options.map((o, i) => (i === idx ? { ...o, ...patch } : o)) }
          : q,
      ),
    );

  const setCorrect = (key: string, idx: number) =>
    setVQuestions((prev) =>
      prev.map((q) =>
        q.key === key
          ? { ...q, options: q.options.map((o, i) => ({ ...o, is_correct: i === idx })) }
          : q,
      ),
    );

  const deleteQuestion = (key: string) => {
    if (vQuestions.length <= 3) {
      toast.error("A quiz needs at least 3 questions");
      return;
    }
    setVQuestions((prev) => prev.filter((q) => q.key !== key));
  };

  // ── Step 6: Save as draft ──
  interface CourseSpec {
    title: string;
    shortDescription: string;
    description: string;
    targetAudience: string[];
    difficulty: string;
    tags: string[];
    questions: QuizQuestion[];
    segmentStart: number | null;
    segmentEnd: number | null;
  }

  const uniqueSlug = async (rawTitle: string): Promise<string> => {
    let slug = generateSlug(rawTitle);
    const { data: slugRows } = await supabase
      .from("academy_courses")
      .select("slug")
      .ilike("slug", `${slug}%`);
    if (slugRows && slugRows.length > 0) {
      const taken = new Set(slugRows.map((r: any) => r.slug));
      const base = slug;
      let i = 2;
      while (taken.has(slug)) { slug = `${base}-${i}`; i++; }
    }
    return slug;
  };

  const insertPackageRules = async (courseId: number, userId: string | null) => {
    if (availableToAll || packageIds.length === 0) return;
    const { error: prErr } = await supabase
      .from("academy_package_course_rules")
      .insert(
        packageIds.map((pid) => ({
          package_id: pid,
          course_id: courseId,
          is_active: true,
          created_by: userId,
        })) as any,
      );
    if (prErr) throw prErr;
  };

  const insertCompletionQuiz = async (
    courseId: number,
    quizTitle: string,
    questionsIn: QuizQuestion[],
    userId: string | null,
  ) => {
    const survivors = questionsIn.filter((q) => q.question_text.trim());
    if (survivors.length === 0) return;
    const { data: assessment, error: aErr } = await supabase
      .from("academy_assessments")
      .insert({
        course_id: courseId,
        title: `${quizTitle} — Completion Quiz`,
        pass_score: 80,
        is_required_for_certificate: true,
        created_by: userId,
      } as any)
      .select("id")
      .single();
    if (aErr) throw aErr;

    const { error: qErr } = await supabase
      .from("academy_assessment_questions")
      .insert(
        survivors.map((q, i) => ({
          assessment_id: assessment.id,
          question_text: q.question_text,
          question_type: "multiple_choice",
          options: q.options,
          explanation: q.explanation || null,
          points: 1,
          sort_order: i + 1,
        })) as any,
      );
    if (qErr) throw qErr;
  };

  const createCourse = async (
    spec: CourseSpec,
    videoId: string,
    userId: string | null,
  ): Promise<number> => {
    const slug = await uniqueSlug(spec.title);

    const { data: course, error: cErr } = await supabase
      .from("academy_courses")
      .insert({
        title: spec.title.trim(),
        slug,
        description: spec.description || null,
        short_description: spec.shortDescription || null,
        thumbnail_url: thumbnailUrl,
        target_audience: spec.targetAudience.length ? spec.targetAudience : null,
        difficulty_level: spec.difficulty,
        tags: spec.tags.length ? spec.tags : null,
        status: "draft",
        session_type: sessionType,
        webinar_series: series || null,
        source_video_id: videoId,
        segment_start_seconds: spec.segmentStart,
        segment_end_seconds: spec.segmentEnd,
        available_to_all_clients: availableToAll,
        ai_generated: true,
        created_by: userId,
        facilitator_id: facilitatorId,
        delivery_date: deliveryDate,
      } as any)
      .select("id")
      .single();
    if (cErr) throw cErr;
    const courseId = course.id as number;

    await insertPackageRules(courseId, userId);

    const { data: mod, error: mErr } = await supabase
      .from("academy_modules")
      .insert({
        course_id: courseId,
        title: "Module 1",
        sort_order: 1,
        is_published: true,
      } as any)
      .select("id")
      .single();
    if (mErr) throw mErr;

    const { error: lErr } = await supabase
      .from("academy_lessons")
      .insert({
        course_id: courseId,
        module_id: mod.id,
        title: spec.title.trim(),
        description: spec.shortDescription || null,
        lesson_type: "video",
        video_id: videoId,
        sort_order: 1,
        is_published: true,
        segment_start_seconds: spec.segmentStart,
        segment_end_seconds: spec.segmentEnd,
      } as any);
    if (lErr) throw lErr;

    await insertCompletionQuiz(courseId, spec.title.trim(), spec.questions, userId);
    return courseId;
  };

  const createWorkshopCourse = async (
    videoId: string,
    userId: string | null,
  ): Promise<number> => {
    const courseTitle = (episodeTitle.trim() || title.trim()).trim();
    const slug = await uniqueSlug(courseTitle);
    const audience = [...new Set(drafts.flatMap((d) => d.targetAudience))];
    const tagsUnion = [...new Set(drafts.flatMap((d) => d.tags))];
    const first = drafts[0];

    const { data: course, error: cErr } = await supabase
      .from("academy_courses")
      .insert({
        title: courseTitle,
        slug,
        description: first?.description || null,
        short_description: first?.shortDescription || null,
        thumbnail_url: thumbnailUrl,
        target_audience: audience.length ? audience : null,
        difficulty_level: first?.difficulty || "beginner",
        tags: tagsUnion.length ? tagsUnion : null,
        status: "draft",
        session_type: sessionType,
        webinar_series: series || null,
        source_video_id: videoId,
        segment_start_seconds: null,
        segment_end_seconds: null,
        available_to_all_clients: availableToAll,
        ai_generated: true,
        created_by: userId,
        facilitator_id: facilitatorId,
        delivery_date: deliveryDate,
      } as any)
      .select("id")
      .single();
    if (cErr) throw cErr;
    const courseId = course.id as number;

    await insertPackageRules(courseId, userId);

    const { data: mod, error: mErr } = await supabase
      .from("academy_modules")
      .insert({
        course_id: courseId,
        title: "Workshop",
        sort_order: 1,
        is_published: true,
      } as any)
      .select("id")
      .single();
    if (mErr) throw mErr;

    const { error: lErr } = await supabase
      .from("academy_lessons")
      .insert(
        drafts.map((d, i) => ({
          course_id: courseId,
          module_id: mod.id,
          title: d.title.trim(),
          description: d.shortDescription || null,
          lesson_type: "video",
          video_id: videoId,
          sort_order: i + 1,
          is_published: true,
          segment_start_seconds: d.segment.start_seconds,
          segment_end_seconds: d.segment.end_seconds,
        })) as any,
      );
    if (lErr) throw lErr;

    await insertCompletionQuiz(
      courseId,
      courseTitle,
      drafts.flatMap((d) => d.questions),
      userId,
    );
    return courseId;
  };

  const SHOWCASE_VIDEO_FOLDER_NAME = "Course Lesson Videos";

  /**
   * Creates one new draft course from a Showcase import: one module per
   * distinct module number, one lesson per drafted video (reusing an
   * existing training_videos row for a Vimeo id already imported elsewhere,
   * same as the structural Showcase Import panel on an existing course —
   * never creating a second row for the same video), and one completion
   * quiz unioning every lesson's drafted questions.
   */
  const createShowcaseCourse = async (userId: string | null): Promise<number> => {
    const courseTitle = episodeTitle.trim();
    const slug = await uniqueSlug(courseTitle);
    const sorted = [...showcaseItems].sort(
      (a, b) => a.moduleNumber - b.moduleNumber || a.lessonNumber - b.lessonNumber,
    );
    const audience = [...new Set(sorted.flatMap((d) => d.targetAudience))];
    const tagsUnion = [...new Set(sorted.flatMap((d) => d.tags))];
    const first = sorted[0];

    const { data: course, error: cErr } = await supabase
      .from("academy_courses")
      .insert({
        title: courseTitle,
        slug,
        description: first?.description || null,
        short_description: first?.shortDescription || null,
        thumbnail_url: first?.thumbnailUrl ?? null,
        target_audience: audience.length ? audience : null,
        difficulty_level: first?.difficulty || "beginner",
        tags: tagsUnion.length ? tagsUnion : null,
        status: "draft",
        session_type: sessionType,
        webinar_series: series || null,
        source_video_id: null,
        segment_start_seconds: null,
        segment_end_seconds: null,
        available_to_all_clients: availableToAll,
        ai_generated: true,
        created_by: userId,
        facilitator_id: facilitatorId,
        delivery_date: deliveryDate,
      } as any)
      .select("id")
      .single();
    if (cErr) throw cErr;
    const courseId = course.id as number;

    await insertPackageRules(courseId, userId);

    const moduleNumbers = [...new Set(sorted.map((d) => d.moduleNumber))].sort((a, b) => a - b);
    const moduleIdByNumber = new Map<number, number>();
    for (const moduleNumber of moduleNumbers) {
      const { data: mod, error: mErr } = await supabase
        .from("academy_modules")
        .insert({
          course_id: courseId,
          title: `Module ${moduleNumber}`,
          sort_order: moduleNumber,
          is_published: true,
        } as any)
        .select("id")
        .single();
      if (mErr) throw mErr;
      moduleIdByNumber.set(moduleNumber, mod.id as number);
    }

    let folderId: string | null = null;
    const ensureFolder = async (): Promise<string> => {
      if (folderId) return folderId;
      const { data: existingFolder, error: fLookupErr } = await supabase
        .from("training_folders")
        .select("id")
        .eq("folder_name", SHOWCASE_VIDEO_FOLDER_NAME)
        .maybeSingle();
      if (fLookupErr) throw fLookupErr;
      if (existingFolder?.id) {
        folderId = existingFolder.id as string;
        return folderId;
      }
      const { data: newFolder, error: fInsErr } = await supabase
        .from("training_folders")
        .insert({ folder_name: SHOWCASE_VIDEO_FOLDER_NAME } as any)
        .select("id")
        .single();
      if (fInsErr) throw fInsErr;
      folderId = newFolder.id as string;
      return folderId;
    };

    for (const item of sorted) {
      const cleanUrl = `https://vimeo.com/${item.vimeoId}`;
      const { data: existingVideo, error: vLookupErr } = await supabase
        .from("training_videos")
        .select("id")
        .eq("vimeo_url", cleanUrl)
        .maybeSingle();
      if (vLookupErr) throw vLookupErr;

      let videoId = existingVideo?.id as string | undefined;
      if (!videoId) {
        const fId = await ensureFolder();
        const { data: newVideo, error: vInsErr } = await supabase
          .from("training_videos")
          .insert({
            folder_id: fId,
            folder_name: SHOWCASE_VIDEO_FOLDER_NAME,
            video_name: item.title,
            vimeo_url: cleanUrl,
            duration_seconds: item.durationSeconds,
            thumbnail: item.thumbnailUrl,
            added_by: userId,
          } as any)
          .select("id")
          .single();
        if (vInsErr) throw vInsErr;
        videoId = newVideo.id as string;
      }

      const moduleId = moduleIdByNumber.get(item.moduleNumber);
      if (!moduleId) continue;

      const { error: lErr } = await supabase
        .from("academy_lessons")
        .insert({
          course_id: courseId,
          module_id: moduleId,
          title: item.title.trim(),
          description: item.shortDescription || null,
          lesson_type: "video",
          video_id: videoId,
          sort_order: item.lessonNumber,
          is_published: true,
        } as any);
      if (lErr) throw lErr;
    }

    await insertCompletionQuiz(
      courseId,
      courseTitle,
      sorted.flatMap((d) => d.questions),
      userId,
    );
    return courseId;
  };

  const handleSave = async () => {
    if (!facilitatorId) { toast.error("Select a facilitator"); return; }
    if (!deliveryDate) { toast.error("Date of delivery is required"); return; }
    if (!availableToAll && packageIds.length === 0) {
      toast.error("Select at least one package, or choose All clients");
      return;
    }

    if (sourceType === "showcase") {
      if (!showcaseUrl.trim()) { toast.error("Vimeo Showcase URL is required"); return; }
      if (!episodeTitle.trim()) { toast.error("The course needs a title"); return; }
      if (showcaseItems.length === 0) { toast.error("Draft the showcase's lessons with AI first"); return; }
      if (showcaseItems.some((d) => !d.title.trim())) { toast.error("Every lesson needs a title"); return; }
    } else {
      if (!vimeoUrl.trim()) { toast.error("Vimeo URL is required"); return; }
      if (workshopActive) {
        if (!(episodeTitle.trim() || title.trim())) {
          toast.error("The course needs a title");
          return;
        }
        if (drafts.some((d) => !d.title.trim())) {
          toast.error("Every lesson needs a title");
          return;
        }
      } else if (!title.trim()) {
        toast.error("Every course needs a title");
        return;
      }
    }

    setSaving(true);
    try {
      const { data: { user } } = await supabase.auth.getUser();
      const userId = user?.id ?? null;

      let courseId: number;
      if (sourceType === "showcase") {
        courseId = await createShowcaseCourse(userId);
      } else {
        const cleanUrl = vimeoUrl.trim();
        const videoName = (episodeTitle.trim() || title.trim()).trim();

        // training_videos — imported once per recording, reused by every lesson
        const { data: existingVideo, error: vLookupErr } = await supabase
          .from("training_videos")
          .select("id")
          .eq("vimeo_url", cleanUrl)
          .maybeSingle();
        if (vLookupErr) throw vLookupErr;

        let videoId = existingVideo?.id as string | undefined;
        if (!videoId) {
          const folderName = (series || "").trim() || "Quick Add Recordings";
          const { data: existingFolder, error: fLookupErr } = await supabase
            .from("training_folders")
            .select("id")
            .eq("folder_name", folderName)
            .maybeSingle();
          if (fLookupErr) throw fLookupErr;

          let folderId = existingFolder?.id as string | undefined;
          if (!folderId) {
            const { data: newFolder, error: fInsErr } = await supabase
              .from("training_folders")
              .insert({ folder_name: folderName } as any)
              .select("id")
              .single();
            if (fInsErr) throw fInsErr;
            folderId = newFolder.id as string;
          }

          const { data: newVideo, error: vInsErr } = await supabase
            .from("training_videos")
            .insert({
              folder_id: folderId,
              video_name: videoName,
              vimeo_url: cleanUrl,
              duration_seconds: durationSeconds,
              thumbnail: thumbnailUrl,
              folder_name: folderName,
              added_by: userId,
            } as any)
            .select("id")
            .single();
          if (vInsErr) throw vInsErr;
          videoId = newVideo.id as string;
        }

        courseId = workshopActive
          ? await createWorkshopCourse(videoId!, userId)
          : await createCourse({
              title,
              shortDescription,
              description,
              targetAudience,
              difficulty,
              tags,
              questions,
              segmentStart: null,
              segmentEnd: null,
            }, videoId!, userId);
      }

      toast.success("Draft course created — review and publish when ready");
      navigate(`/superadmin/academy/builder/${courseId}`);
    } catch (e: any) {
      toast.error(e?.message || "Failed to save draft course");
    } finally {
      setSaving(false);
    }
  };

  const saveDisabled =
    saving ||
    !facilitatorId ||
    !deliveryDate ||
    (sourceType === "showcase"
      ? !showcaseUrl.trim() || !episodeTitle.trim() || showcaseItems.length === 0 || showcaseItems.some((d) => !d.title.trim())
      : !vimeoUrl.trim() || (splitIntoLessons ? !workshopActive || !(episodeTitle.trim() || title.trim()) : !title.trim()));

  const reviewPending = sourceType === "showcase" ? !showcaseActive : (splitIntoLessons && !workshopActive);

  return (
    <DashboardLayout>
      <div className="p-6 space-y-6 max-w-[1800px] mx-auto">
        <div className="flex items-center gap-3">
          <Button variant="ghost" size="sm" onClick={() => navigate("/superadmin/academy/builder")}>
            <ArrowLeft className="h-4 w-4 mr-1" /> Library
          </Button>
          <div>
            <h1 className="text-2xl font-bold text-foreground flex items-center gap-2">
              <Wand2 className="h-6 w-6" style={{ color: "#7130A0" }} />
              Add Course
            </h1>
            <p className="text-sm text-muted-foreground mt-1">
              Paste a single Vimeo recording or a whole Vimeo Showcase, let AI draft the course, review, and save as a draft for publishing.
            </p>
          </div>
        </div>

        {/* Step 1 */}
        <Card>
          <CardHeader>
            <CardTitle className="text-base">1. Paste and classify</CardTitle>
          </CardHeader>
          <CardContent className="space-y-4">
            <div className="space-y-2">
              <Label>Source</Label>
              <div className="flex flex-wrap gap-2">
                <Button
                  type="button"
                  variant={sourceType === "video" ? "default" : "outline"}
                  size="sm"
                  onClick={() => handleSourceTypeChange("video")}
                  className={sourceType === "video" ? "text-white" : ""}
                  style={sourceType === "video" ? { backgroundColor: "#7130A0" } : undefined}
                >
                  <Video className="h-4 w-4 mr-2" /> Vimeo video
                </Button>
                <Button
                  type="button"
                  variant={sourceType === "showcase" ? "default" : "outline"}
                  size="sm"
                  onClick={() => handleSourceTypeChange("showcase")}
                  className={sourceType === "showcase" ? "text-white" : ""}
                  style={sourceType === "showcase" ? { backgroundColor: "#7130A0" } : undefined}
                >
                  <ListPlus className="h-4 w-4 mr-2" /> Vimeo showcase
                </Button>
              </div>
            </div>

            {sourceType === "video" ? (
              <div className="space-y-2">
                <Label>Vimeo URL *</Label>
                <Input
                  value={vimeoUrl}
                  onChange={(e) => {
                    setVimeoUrl(e.target.value);
                    setDuplicateVideo(null);
                  }}
                  placeholder="https://vimeo.com/1234567890"
                  aria-invalid={!!generateError}
                  aria-describedby="vimeo-url-help"
                />
                <p id="vimeo-url-help" className="text-xs text-muted-foreground">
                  With the Vimeo API connection active, the plain video URL from the video's own page
                  works directly — e.g.{" "}
                  <code className="rounded bg-muted px-1 py-0.5">vimeo.com/1200358426</code>. Copy it
                  from the Vimeo address bar while viewing the video (not the Share panel or Manage
                  dashboard link).
                </p>
                <p className="text-xs text-muted-foreground">
                  If the video is on a different Vimeo account or has strict privacy settings, you may
                  still need the full link including the privacy hash, e.g.{" "}
                  <code className="rounded bg-muted px-1 py-0.5">vimeo.com/1194261152/ab12cd34ef</code>{" "}
                  or the player URL from the embed code.
                </p>
              </div>
            ) : (
              <div className="space-y-2">
                <Label>Vimeo Showcase URL *</Label>
                <Input
                  value={showcaseUrl}
                  onChange={(e) => setShowcaseUrl(e.target.value)}
                  placeholder="https://vimeo.com/showcase/12364831"
                  aria-invalid={!!generateError}
                  aria-describedby="showcase-url-help"
                />
                <p id="showcase-url-help" className="text-xs text-muted-foreground">
                  Paste the showcase's own URL, e.g.{" "}
                  <code className="rounded bg-muted px-1 py-0.5">vimeo.com/showcase/12364831</code>.
                  Every video becomes a lesson, in the showcase's own order — reorder them below
                  before drafting. Each is fetched, transcribed, and drafted with AI just like a
                  single recording.
                </p>
              </div>
            )}

            {generateError && (
              <Alert variant="destructive">
                <AlertTriangle className="h-4 w-4" />
                <AlertDescription className="space-y-2">
                  <span className="block">{generateError}</span>
                  <Button
                    type="button"
                    size="sm"
                    variant="outline"
                    onClick={() => (sourceType === "showcase" ? handlePreviewShowcase() : handleGenerate())}
                    disabled={generating}
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
            <div className="grid gap-4 md:grid-cols-2">
              <div className="space-y-2">
                <Label>Series *</Label>
                <Select value={series} onValueChange={handleSeriesChange}>
                  <SelectTrigger><SelectValue placeholder="Select a series" /></SelectTrigger>
                  <SelectContent>
                    {SERIES.map((s) => (
                      <SelectItem key={s.value} value={s.value}>{s.value}</SelectItem>
                    ))}
                  </SelectContent>
                </Select>
                {series && (
                  <div className="text-xs text-muted-foreground">
                    Session type: <Badge variant="secondary" className="ml-1">{sessionType}</Badge>
                  </div>
                )}
              </div>
              <div className="space-y-2">
                <Label>{sourceType === "showcase" ? "Course title *" : "Episode title"}</Label>
                <Input
                  value={episodeTitle}
                  onChange={(e) => setEpisodeTitle(e.target.value)}
                  placeholder="Inclusive Practice & Reasonable Adjustment Plans"
                />
              </div>
              {sourceType === "video" && (
                <div className="flex items-center gap-3 md:col-span-2 rounded-lg border p-3">
                  <Checkbox checked={splitIntoLessons} onCheckedChange={(checked) => setSplitIntoLessons(checked === true)} />
                  <div>
                    <Label className="cursor-pointer">Split into topic lessons</Label>
                    <p className="text-xs text-muted-foreground">AI will detect topic boundaries for any series. Turn this off for one continuous lesson.</p>
                  </div>
                </div>
              )}
              <div className="space-y-2">
                <Label>Facilitator *</Label>
                <Select value={facilitatorId} onValueChange={setFacilitatorId}>
                  <SelectTrigger><SelectValue placeholder="Select a facilitator" /></SelectTrigger>
                  <SelectContent>
                    {facilitators.map((u) => (
                      <SelectItem key={u.user_uuid} value={u.user_uuid}>
                        {(u.full_name?.trim() || u.user_uuid) + (u.archived || u.disabled ? " (inactive)" : "")}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
              <div className="space-y-2">
                <Label>Date of delivery *</Label>
                <Input
                  type="date"
                  value={deliveryDate}
                  onChange={(e) => setDeliveryDate(e.target.value)}
                />
              </div>
            </div>
          </CardContent>
        </Card>

        {/* Step 2 */}
        <Card>
          <CardHeader>
            <CardTitle className="text-base">2. Generate with AI</CardTitle>
          </CardHeader>
          <CardContent className="space-y-4">
            <div className="flex items-center gap-3 flex-wrap">
              <Button
                onClick={() => (sourceType === "showcase" ? handlePreviewShowcase() : handleGenerate())}
                disabled={
                  generating ||
                  !series ||
                  (sourceType === "showcase" ? !showcaseUrl.trim() : !vimeoUrl.trim())
                }
                className="text-white hover:opacity-90"
                style={{ backgroundColor: "#7130A0" }}
              >
                {generating ? <Loader2 className="h-4 w-4 mr-2 animate-spin" /> : <Sparkles className="h-4 w-4 mr-2" />}
                {sourceType === "showcase" ? "Find showcase videos" : "Generate with AI"}
              </Button>
              {sourceType === "video" && durationSeconds != null && (
                <span className="text-sm text-muted-foreground flex items-center gap-1">
                  <Video className="h-4 w-4" /> Estimated length: {formatDuration(durationSeconds)}
                </span>
              )}
            </div>
            {sourceType === "video" && duplicateVideo && (
              <Alert variant="destructive">
                <AlertTriangle className="h-4 w-4" />
                <AlertDescription className="space-y-2">
                  <span className="block">
                    This Vimeo video (id {duplicateVideo.videoId}) is already used by{" "}
                    {duplicateVideo.courses.length === 1 ? "a course" : `${duplicateVideo.courses.length} courses`}:
                  </span>
                  <ul className="list-disc pl-5 space-y-0.5">
                    {duplicateVideo.courses.map((c) => (
                      <li key={c.id}>
                        <a
                          href={`/superadmin/academy/builder/${c.id}`}
                          target="_blank"
                          rel="noreferrer"
                          className="underline"
                        >
                          {c.title}
                        </a>{" "}
                        <Badge variant="outline" className="ml-1 text-[10px]">{c.status}</Badge>
                      </li>
                    ))}
                  </ul>
                  <div className="flex gap-2">
                    <Button
                      type="button"
                      size="sm"
                      variant="outline"
                      onClick={() => handleGenerate(true)}
                      disabled={generating}
                    >
                      Create another course from this video anyway
                    </Button>
                    <Button
                      type="button"
                      size="sm"
                      variant="ghost"
                      onClick={() => setDuplicateVideo(null)}
                    >
                      Dismiss
                    </Button>
                  </div>
                </AlertDescription>
              </Alert>
            )}
            {sourceType === "video" && hasTranscript === false && (
              <Alert>
                <AlertTriangle className="h-4 w-4" />
                <AlertDescription>
                  No transcript available — descriptions are based on the title only; check these carefully.
                </AlertDescription>
              </Alert>
            )}
          </CardContent>
        </Card>

        {/* Step 2b — Workshop split (video mode) */}
        {sourceType === "video" && splitIntoLessons && segments.length > 0 && (
          <WorkshopSegmentSplit
            segments={segments}
            onChange={setSegments}
            usedFallback={segmentsFallback}
            durationSeconds={durationSeconds}
            vimeoUrl={vimeoUrl}
            onConfirm={handleConfirmSplit}
            confirming={splitConfirming}
            confirmProgress={splitProgress}
            confirmed={splitConfirmed}
          />
        )}

        {/* Step 2b — Showcase preview (showcase mode) */}
        {sourceType === "showcase" && showcasePreview && (
          <Card>
            <CardHeader>
              <CardTitle className="text-base">2b. Review showcase videos</CardTitle>
            </CardHeader>
            <CardContent className="space-y-3">
              <div className="flex flex-wrap gap-2">
                <Badge variant="outline">{showcasePreview.videoCount} video{showcasePreview.videoCount === 1 ? "" : "s"} in showcase</Badge>
                {showcasePreview.parsed.some((p) => p.already_imported) && (
                  <Badge variant="outline" className="border-amber-300 text-amber-800">
                    {showcasePreview.parsed.filter((p) => p.already_imported).length} already imported elsewhere
                  </Badge>
                )}
                {showcasePreview.unmatched.length > 0 && (
                  <Badge variant="outline" className="border-amber-300 text-amber-800">
                    {showcasePreview.unmatched.length} skipped
                  </Badge>
                )}
              </div>

              {showcasePreview.parsed.length > 0 && (
                <>
                  <p className="text-xs text-muted-foreground">
                    Drag <GripVertical className="inline h-3 w-3 align-text-top" /> to reorder — this sets the lesson order.
                  </p>
                  <DndContext
                    sensors={showcaseSensors}
                    collisionDetection={closestCenter}
                    onDragEnd={handleShowcaseReorder}
                  >
                    <SortableContext
                      items={showcasePreview.parsed.map((item) => item.vimeo_id)}
                      strategy={verticalListSortingStrategy}
                    >
                      <ul className="text-sm space-y-1 max-h-[420px] overflow-y-auto">
                        {showcasePreview.parsed.map((item) => (
                          <SortableShowcaseRow key={item.vimeo_id} item={item} />
                        ))}
                      </ul>
                    </SortableContext>
                  </DndContext>
                </>
              )}

              {showcasePreview.unmatched.length > 0 && (
                <Alert variant="warning">
                  <AlertTriangle className="h-4 w-4" />
                  <AlertDescription>
                    <span className="block font-medium mb-1">
                      These videos couldn't be read and will be skipped:
                    </span>
                    <ul className="list-disc pl-5 space-y-0.5">
                      {showcasePreview.unmatched.map((item, idx) => (
                        <li key={`${item.vimeo_id ?? "none"}-${idx}`}>{item.title}</li>
                      ))}
                    </ul>
                  </AlertDescription>
                </Alert>
              )}

              {showcaseProgress && (
                <p className="text-xs text-muted-foreground flex items-center gap-2">
                  <Loader2 className="h-3.5 w-3.5 animate-spin" /> {showcaseProgress}
                </p>
              )}

              <Button
                onClick={() => void handleConfirmShowcase()}
                disabled={showcaseConfirming || showcasePreview.parsed.length === 0}
                className="text-white hover:opacity-90"
                style={{ backgroundColor: "#7130A0" }}
              >
                {showcaseConfirming ? (
                  <><Loader2 className="h-4 w-4 mr-2 animate-spin" /> Drafting…</>
                ) : showcaseActive ? (
                  "Redraft all with AI"
                ) : (
                  "Draft all with AI"
                )}
              </Button>
            </CardContent>
          </Card>
        )}

        {/* Step 3 */}
        {reviewPending ? (
          <Card>
            <CardHeader>
              <CardTitle className="text-base">3. Review and adjust</CardTitle>
            </CardHeader>
            <CardContent>
              <p className="text-sm text-muted-foreground">
                {sourceType === "showcase"
                  ? "Find and draft the showcase's videos above to review each lesson."
                  : "Confirm the workshop split above to draft each segment for review."}
              </p>
            </CardContent>
          </Card>
        ) : (
        <Card>
          <CardHeader>
            <CardTitle className="text-base">
              3. Review and adjust
            </CardTitle>
          </CardHeader>
          <CardContent className="space-y-4">
            {multiActive && (
              <div className="space-y-2">
                <Label>{showcaseActive ? "Lesson" : "Segment"}</Label>
                {showcaseActive ? (
                  <DndContext
                    sensors={showcaseSensors}
                    collisionDetection={closestCenter}
                    onDragEnd={handleShowcaseItemsReorder}
                  >
                    <SortableContext items={showcaseItems.map((d) => d.key)} strategy={rectSortingStrategy}>
                      <div className="flex flex-wrap gap-2">
                        {showcaseItems.map((d, i) => (
                          <SortableShowcaseChip
                            key={d.key}
                            id={d.key}
                            selected={i === activeIndex}
                            onSelect={() => setActiveIndex(i)}
                          >
                            {i + 1}. {d.title || "Untitled"}
                          </SortableShowcaseChip>
                        ))}
                      </div>
                    </SortableContext>
                  </DndContext>
                ) : (
                  <div className="flex flex-wrap gap-2">
                    {activeItems.map((d, i) => (
                      <Button
                        key={d.key}
                        variant={i === activeIndex ? "default" : "outline"}
                        size="sm"
                        onClick={() => setActiveIndex(i)}
                        className={i === activeIndex ? "text-white" : ""}
                        style={i === activeIndex ? { backgroundColor: "#7130A0" } : undefined}
                      >
                        {i + 1}. {d.title || "Untitled"}
                        {workshopActive && (
                          <span className="ml-1 opacity-70">
                            {`(${formatTimecode((d as SegmentDraft).segment.start_seconds)}–${formatTimecode((d as SegmentDraft).segment.end_seconds)})`}
                          </span>
                        )}
                      </Button>
                    ))}
                  </div>
                )}
                <p className="text-xs text-muted-foreground">
                  Reviewing {showcaseActive ? "lesson" : "segment"} {activeIndex + 1} of {activeItems.length}. Each becomes a lesson in this course.
                  {showcaseActive && " Drag a chip to reorder without redrafting with AI."}
                </p>
              </div>
            )}
            {multiActive && (
              <div className="space-y-2">
                <Label>Course title</Label>
                <Input
                  value={episodeTitle}
                  onChange={(e) => setEpisodeTitle(e.target.value)}
                  placeholder="Inclusive Practice & Reasonable Adjustment Plans"
                />
                <p className="text-xs text-muted-foreground">
                  {showcaseActive
                    ? "The name of the whole course — one course, with the showcase's modules and lessons below."
                    : "The name of the whole recording — one course, with a lesson per segment below."}
                </p>
              </div>
            )}
            <div className="space-y-2">
              <Label>{multiActive ? "Lesson title" : "Course title"}</Label>
              <Input value={vTitle} onChange={(e) => setVTitle(e.target.value)} />
            </div>
            <div className="space-y-2">
              <Label>Short description</Label>
              <Textarea rows={2} value={vShortDescription} onChange={(e) => setVShortDescription(e.target.value)} />
            </div>
            <div className="space-y-2">
              <Label>Description</Label>
              <Textarea rows={6} value={vDescription} onChange={(e) => setVDescription(e.target.value)} />
            </div>
            <div className="grid gap-4 md:grid-cols-2">
              <div className="space-y-2">
                <Label>Target audience</Label>
                <div className="space-y-2">
                  {AUDIENCE_OPTIONS.map((a) => (
                    <label key={a.value} className="flex items-center gap-2 text-sm">
                      <Checkbox
                        checked={vTargetAudience.includes(a.value)}
                        onCheckedChange={(c) =>
                          setVTargetAudience(
                            c
                              ? [...vTargetAudience, a.value]
                              : vTargetAudience.filter((v) => v !== a.value),
                          )
                        }
                      />
                      {a.label}
                    </label>
                  ))}
                </div>
              </div>
              <div className="space-y-2">
                <Label>Difficulty level</Label>
                <Select value={vDifficulty} onValueChange={setVDifficulty}>
                  <SelectTrigger><SelectValue /></SelectTrigger>
                  <SelectContent>
                    {DIFFICULTY_OPTIONS.map((d) => (
                      <SelectItem key={d} value={d}>{d}</SelectItem>
                    ))}
                  </SelectContent>
                </Select>
                <div className="pt-2 space-y-2">
                  <Label>Tags</Label>
                  <TagChipInput value={vTags} onChange={setVTags} suggestions={distinctTags} />
                </div>
              </div>
            </div>
          </CardContent>
        </Card>
        )}

        {/* Step 4 */}
        <Card>
          <CardHeader>
            <CardTitle className="text-base">4. Who gets access?</CardTitle>
          </CardHeader>
          <CardContent className="space-y-4">
            <div className="flex items-center justify-between rounded-lg border p-3">
              <div>
                <p className="text-sm font-medium">All clients</p>
                <p className="text-xs text-muted-foreground">
                  Available to every active client — no package configuration needed.
                </p>
              </div>
              <Switch
                checked={availableToAll}
                onCheckedChange={(v) => {
                  setAvailableToAll(v);
                  if (v) setPackageIds([]);
                }}
              />
            </div>
            {!availableToAll && (
              <div className="space-y-2">
                <Label>Packages</Label>
                {PACKAGE_OPTIONS.map((p) => (
                  <label key={p.id} className="flex items-center gap-2 text-sm">
                    <Checkbox
                      checked={packageIds.includes(p.id)}
                      onCheckedChange={(c) =>
                        setPackageIds((prev) => (c ? [...prev, p.id] : prev.filter((v) => v !== p.id)))
                      }
                    />
                    {p.label}
                  </label>
                ))}
              </div>
            )}
          </CardContent>
        </Card>

        {/* Step 5 */}
        <Card>
          <CardHeader className="flex flex-row items-center justify-between">
            <CardTitle className="text-base">5. Completion quiz</CardTitle>
            <Button variant="outline" size="sm" onClick={handleGenerateQuiz} disabled={generatingQuiz || !vTitle.trim()}>
              {generatingQuiz ? <Loader2 className="h-4 w-4 mr-2 animate-spin" /> : <Sparkles className="h-4 w-4 mr-2" />}
              {vQuestions.length ? "Regenerate questions" : "Generate questions"}
            </Button>
          </CardHeader>
          <CardContent className="space-y-4">
            {vQuestions.length === 0 ? (
              <p className="text-sm text-muted-foreground">
                No questions yet — generate 8 questions from the recording, then edit or delete down to a minimum of 3.
              </p>
            ) : (
              vQuestions.map((q, qi) => (
                <div key={q.key} className="rounded-lg border p-3 space-y-3">
                  <div className="flex items-start gap-2">
                    <Badge variant="secondary" className="mt-2">{qi + 1}</Badge>
                    <Textarea
                      rows={2}
                      value={q.question_text}
                      onChange={(e) => updateQuestion(q.key, { question_text: e.target.value })}
                      placeholder="Question text"
                    />
                    <Button
                      variant="ghost"
                      size="icon"
                      onClick={() => deleteQuestion(q.key)}
                      disabled={vQuestions.length <= 3}
                      aria-label="Delete question"
                    >
                      <Trash2 className="h-4 w-4 text-destructive" />
                    </Button>
                  </div>
                  <div className="space-y-2 pl-8">
                    {q.options.map((o, oi) => (
                      <div key={oi} className="flex items-center gap-2">
                        <input
                          type="radio"
                          name={`correct-${q.key}`}
                          checked={o.is_correct}
                          onChange={() => setCorrect(q.key, oi)}
                          aria-label={`Mark option ${oi + 1} correct`}
                        />
                        <Input
                          value={o.label}
                          onChange={(e) => updateOption(q.key, oi, { label: e.target.value })}
                          placeholder={`Option ${oi + 1}`}
                        />
                      </div>
                    ))}
                    <Button
                      variant="ghost"
                      size="sm"
                      onClick={() =>
                        updateQuestion(q.key, {
                          options: [
                            ...q.options,
                            {
                              value: String.fromCharCode(97 + q.options.length),
                              label: "",
                              is_correct: false,
                            },
                          ],
                        })
                      }
                    >
                      <Plus className="h-3.5 w-3.5 mr-1" /> Add option
                    </Button>
                    <div className="space-y-1">
                      <Label className="text-xs">Explanation</Label>
                      <Textarea
                        rows={2}
                        value={q.explanation}
                        onChange={(e) => updateQuestion(q.key, { explanation: e.target.value })}
                      />
                    </div>
                  </div>
                </div>
              ))
            )}
          </CardContent>
        </Card>

        <Separator />

        {/* Step 6 */}
        <div className="flex items-center justify-between pb-6">
          <p className="text-sm text-muted-foreground">
            {multiActive
              ? "Saves one draft course with a lesson per segment — publish it from the course builder after review."
              : "Saves as a draft course — publish it from the course builder after review."}
          </p>
          <Button
            onClick={handleSave}
            disabled={saveDisabled}
            className="text-white hover:opacity-90"
            style={{ backgroundColor: "#23c0dd" }}
          >
            {saving ? <Loader2 className="h-4 w-4 mr-2 animate-spin" /> : <Save className="h-4 w-4 mr-2" />}
            {multiActive ? "Save draft course" : "Save as draft"}
          </Button>
        </div>
        {!generated && (
          <p className="sr-only">Generate content before saving for best results.</p>
        )}
      </div>
    </DashboardLayout>
  );
}
