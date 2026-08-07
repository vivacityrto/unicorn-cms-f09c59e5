import { useMemo, useState } from "react";
import { useNavigate } from "react-router-dom";
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
import { Sparkles, Loader2, Trash2, Video, Wand2, Save, AlertTriangle, Plus } from "lucide-react";
import { toast } from "sonner";
import TagChipInput from "@/components/academy/TagChipInput";
import WorkshopSegmentSplit, {
  formatTimecode, validateSegments, type WorkshopSegment,
} from "@/components/academy/WorkshopSegmentSplit";

// ── Series configuration ───────────────────────────────────────────────
type AccessDefault = "all" | "superhero";

const SERIES = [
  { value: "AI in Your RTO", session_type: "webinar", access: "all" as AccessDefault },
  { value: "Inside VET", session_type: "webinar", access: "all" as AccessDefault },
  { value: "Trainers Edge", session_type: "webinar", access: "all" as AccessDefault },
  { value: "8 Critical Drivers to RTO Success", session_type: "webinar", access: "all" as AccessDefault },
  { value: "Superhero Tools Unleashed", session_type: "webinar", access: "superhero" as AccessDefault },
  { value: "The Compliance Lab", session_type: "workshop", access: "all" as AccessDefault },
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

const WORKSHOP_SERIES = "The Compliance Lab";

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
 * Vimeo replies 404 for any video the Vivacity API token can't see — wrong
 * account, deleted video, or an unlisted video whose privacy hash wasn't part
 * of the pasted link. Turn that into something actionable.
 */
function humaniseVimeoError(msg: string): string {
  if (/404/.test(msg) && /vimeo/i.test(msg)) {
    return "Vimeo returned 404 for that video. It's either not on the Vivacity Vimeo account, has been deleted, or it's unlisted — for unlisted videos copy the full link including the privacy hash (e.g. https://vimeo.com/1215370924/ab12cd34ef) from Vimeo's address bar.";
  }
  if (/401|403/.test(msg) && /vimeo/i.test(msg)) {
    return "Vimeo rejected our credentials for that video. Check the video lives on the Vivacity Vimeo account.";
  }
  return msg;
}


export default function AcademyQuickAddPage() {
  const navigate = useNavigate();

  // Step 1
  const [vimeoUrl, setVimeoUrl] = useState("");
  const [series, setSeries] = useState<string>("");
  const [episodeTitle, setEpisodeTitle] = useState("");

  // Step 2 results
  const [generating, setGenerating] = useState(false);
  const [hasTranscript, setHasTranscript] = useState<boolean | null>(null);
  const [transcript, setTranscript] = useState("");
  const [durationSeconds, setDurationSeconds] = useState<number | null>(null);
  const [thumbnailUrl, setThumbnailUrl] = useState<string | null>(null);
  const [generated, setGenerated] = useState(false);
  const [transcriptTimestamped, setTranscriptTimestamped] = useState("");

  // Workshop split (Compliance Lab only)
  const [segments, setSegments] = useState<WorkshopSegment[]>([]);
  const [segmentsFallback, setSegmentsFallback] = useState(false);
  const [splitConfirming, setSplitConfirming] = useState(false);
  const [splitProgress, setSplitProgress] = useState<string | null>(null);
  const [splitConfirmed, setSplitConfirmed] = useState(false);
  const [drafts, setDrafts] = useState<SegmentDraft[]>([]);
  const [selectedDraft, setSelectedDraft] = useState(0);

  // Step 3 editable fields
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
  const isWorkshop = sessionType === "workshop";
  const workshopActive = isWorkshop && drafts.length > 0;
  const draftIndex = Math.min(selectedDraft, Math.max(0, drafts.length - 1));
  const cur = workshopActive ? drafts[draftIndex] : null;

  const patchDraft = (patch: Partial<SegmentDraft>) =>
    setDrafts((prev) => prev.map((d, i) => (i === draftIndex ? { ...d, ...patch } : d)));

  // Step 3/5 fields resolve to the selected workshop segment when splitting,
  // otherwise to the single-course state.
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

  // ── Step 2: Generate with AI ──
  const handleGenerate = async () => {
    if (!vimeoUrl.trim()) { toast.error("Vimeo URL is required"); return; }
    if (!series) { toast.error("Select a series"); return; }
    const urlProblem = validateVimeoUrl(vimeoUrl.trim());
    if (urlProblem) { toast.error(urlProblem); return; }
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

      // Workshops split into one course per topic segment before review.
      if (isWorkshop) {
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
        setSegments(
          rawSegments.map((r, i) => ({
            key: `seg-${Date.now()}-${i}`,
            suggested_title: String(r?.suggested_title ?? `Segment ${i + 1}`),
            start_seconds: Math.max(0, Math.floor(Number(r?.start_seconds ?? 0))),
            end_seconds: Math.max(1, Math.floor(Number(r?.end_seconds ?? 0))),
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
      toast.error(e?.message || "Failed to generate content");
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
            webinar_series: WORKSHOP_SERIES,
          },
        });
        if (cErr) throw new Error(await extractEdgeError(cErr, `AI classification failed for segment ${i + 1}`));
        const audience: string[] = Array.isArray(cls?.target_audience) ? cls.target_audience : [];
        const level: string = cls?.difficulty_level || "beginner";
        const aiTags: string[] = Array.isArray(cls?.tags) ? cls.tags : [];

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

  const createCourse = async (
    spec: CourseSpec,
    videoId: string,
    userId: string | null,
  ): Promise<number> => {
    // unique slug
    let slug = generateSlug(spec.title);
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
        webinar_series: isWorkshop ? WORKSHOP_SERIES : (series || null),
        source_video_id: videoId,
        segment_start_seconds: spec.segmentStart,
        segment_end_seconds: spec.segmentEnd,
        available_to_all_clients: availableToAll,
        ai_generated: true,
        created_by: userId,
      } as any)
      .select("id")
      .single();
    if (cErr) throw cErr;
    const courseId = course.id as number;

    if (!availableToAll && packageIds.length > 0) {
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
    }

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
      } as any);
    if (lErr) throw lErr;

    const survivors = spec.questions.filter((q) => q.question_text.trim());
    if (survivors.length > 0) {
      const { data: assessment, error: aErr } = await supabase
        .from("academy_assessments")
        .insert({
          course_id: courseId,
          title: `${spec.title.trim()} — Completion Quiz`,
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
    }

    return courseId;
  };

  const handleSave = async () => {
    if (!vimeoUrl.trim()) { toast.error("Vimeo URL is required"); return; }
    if (!availableToAll && packageIds.length === 0) {
      toast.error("Select at least one package, or choose All clients");
      return;
    }

    const specs: CourseSpec[] = workshopActive
      ? drafts.map((d) => ({
          title: d.title,
          shortDescription: d.shortDescription,
          description: d.description,
          targetAudience: d.targetAudience,
          difficulty: d.difficulty,
          tags: d.tags,
          questions: d.questions,
          segmentStart: d.segment.start_seconds,
          segmentEnd: d.segment.end_seconds,
        }))
      : [{
          title,
          shortDescription,
          description,
          targetAudience,
          difficulty,
          tags,
          questions,
          segmentStart: null,
          segmentEnd: null,
        }];

    if (specs.some((sp) => !sp.title.trim())) {
      toast.error("Every course needs a title");
      return;
    }

    setSaving(true);
    try {
      const { data: { user } } = await supabase.auth.getUser();
      const userId = user?.id ?? null;
      const cleanUrl = vimeoUrl.trim();

      // 1. training_videos — imported once per recording, reused by every segment
      const { data: existingVideo, error: vLookupErr } = await supabase
        .from("training_videos")
        .select("id")
        .eq("vimeo_url", cleanUrl)
        .maybeSingle();
      if (vLookupErr) throw vLookupErr;

      let videoId = existingVideo?.id as string | undefined;
      if (!videoId) {
        const { data: newVideo, error: vInsErr } = await supabase
          .from("training_videos")
          .insert({
            video_name: (episodeTitle.trim() || specs[0].title).trim(),
            vimeo_url: cleanUrl,
            duration_seconds: durationSeconds,
            thumbnail: thumbnailUrl,
            folder_name: series || null,
            added_by: userId,
          } as any)
          .select("id")
          .single();
        if (vInsErr) throw vInsErr;
        videoId = newVideo.id as string;
      }

      const createdIds: number[] = [];
      for (const spec of specs) {
        createdIds.push(await createCourse(spec, videoId!, userId));
      }

      if (createdIds.length > 1) {
        toast.success(`${createdIds.length} draft courses created — review and publish each one`);
        navigate("/superadmin/academy/builder");
      } else {
        toast.success("Draft course created — review and publish when ready");
        navigate(`/superadmin/academy/builder/${createdIds[0]}`);
      }
    } catch (e: any) {
      toast.error(e?.message || "Failed to save draft course");
    } finally {
      setSaving(false);
    }
  };

  return (
    <DashboardLayout>
      <div className="p-6 space-y-6 max-w-4xl mx-auto">
        <div>
          <h1 className="text-2xl font-bold text-foreground flex items-center gap-2">
            <Wand2 className="h-6 w-6" style={{ color: "#7130A0" }} />
            Quick Add Recording
          </h1>
          <p className="text-sm text-muted-foreground mt-1">
            Paste a webinar recording, let AI draft the course, review, and save as a draft for publishing.
          </p>
        </div>

        {/* Step 1 */}
        <Card>
          <CardHeader>
            <CardTitle className="text-base">1. Paste and classify</CardTitle>
          </CardHeader>
          <CardContent className="space-y-4">
            <div className="space-y-2">
              <Label>Vimeo URL *</Label>
              <Input
                value={vimeoUrl}
                onChange={(e) => setVimeoUrl(e.target.value)}
                placeholder="https://vimeo.com/1234567890"
              />
            </div>
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
                  <p className="text-xs text-muted-foreground">
                    Session type: <Badge variant="secondary" className="ml-1">{sessionType}</Badge>
                  </p>
                )}
              </div>
              <div className="space-y-2">
                <Label>Episode title</Label>
                <Input
                  value={episodeTitle}
                  onChange={(e) => setEpisodeTitle(e.target.value)}
                  placeholder="Inclusive Practice & Reasonable Adjustment Plans"
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
                onClick={handleGenerate}
                disabled={generating || !vimeoUrl.trim() || !series}
                className="text-white hover:opacity-90"
                style={{ backgroundColor: "#7130A0" }}
              >
                {generating ? <Loader2 className="h-4 w-4 mr-2 animate-spin" /> : <Sparkles className="h-4 w-4 mr-2" />}
                Generate with AI
              </Button>
              {durationSeconds != null && (
                <span className="text-sm text-muted-foreground flex items-center gap-1">
                  <Video className="h-4 w-4" /> Estimated length: {formatDuration(durationSeconds)}
                </span>
              )}
            </div>
            {hasTranscript === false && (
              <Alert>
                <AlertTriangle className="h-4 w-4" />
                <AlertDescription>
                  No transcript available — descriptions are based on the title only; check these carefully.
                </AlertDescription>
              </Alert>
            )}
          </CardContent>
        </Card>

        {/* Step 2b — Workshop split */}
        {isWorkshop && segments.length > 0 && (
          <WorkshopSegmentSplit
            segments={segments}
            onChange={setSegments}
            usedFallback={segmentsFallback}
            durationSeconds={durationSeconds}
            onConfirm={handleConfirmSplit}
            confirming={splitConfirming}
            confirmProgress={splitProgress}
            confirmed={splitConfirmed}
          />
        )}

        {/* Step 3 */}
        {isWorkshop && !workshopActive ? (
          <Card>
            <CardHeader>
              <CardTitle className="text-base">3. Review and adjust</CardTitle>
            </CardHeader>
            <CardContent>
              <p className="text-sm text-muted-foreground">
                Confirm the workshop split above to draft each segment for review.
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
            {workshopActive && (
              <div className="space-y-2">
                <Label>Segment</Label>
                <div className="flex flex-wrap gap-2">
                  {drafts.map((d, i) => (
                    <Button
                      key={d.key}
                      variant={i === draftIndex ? "default" : "outline"}
                      size="sm"
                      onClick={() => setSelectedDraft(i)}
                      className={i === draftIndex ? "text-white" : ""}
                      style={i === draftIndex ? { backgroundColor: "#7130A0" } : undefined}
                    >
                      {i + 1}. {d.title || "Untitled"}{" "}
                      <span className="ml-1 opacity-70">
                        ({formatTimecode(d.segment.start_seconds)}–{formatTimecode(d.segment.end_seconds)})
                      </span>
                    </Button>
                  ))}
                </div>
                <p className="text-xs text-muted-foreground">
                  Reviewing segment {draftIndex + 1} of {drafts.length}. Each becomes its own draft course.
                </p>
              </div>
            )}
            <div className="space-y-2">
              <Label>Course title</Label>
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
                  <TagChipInput value={vTags} onChange={setVTags} />
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
            {workshopActive
              ? `Saves ${drafts.length} draft courses — one per segment — publish each from the course builder after review.`
              : "Saves as a draft course — publish it from the course builder after review."}
          </p>
          <Button
            onClick={handleSave}
            disabled={
              saving ||
              !vimeoUrl.trim() ||
              (isWorkshop ? !workshopActive : !title.trim())
            }
            className="text-white hover:opacity-90"
            style={{ backgroundColor: "#23c0dd" }}
          >
            {saving ? <Loader2 className="h-4 w-4 mr-2 animate-spin" /> : <Save className="h-4 w-4 mr-2" />}
            {workshopActive ? `Save ${drafts.length} drafts` : "Save as draft"}
          </Button>
        </div>
        {!generated && (
          <p className="sr-only">Generate content before saving for best results.</p>
        )}
      </div>
    </DashboardLayout>
  );
}
