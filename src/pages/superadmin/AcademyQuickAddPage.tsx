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

const DIFFICULTY_OPTIONS = ["beginner", "intermediate", "advanced"];

interface QuizOption { value: string; label: string; is_correct: boolean }
interface QuizQuestion {
  key: string;
  question_text: string;
  explanation: string;
  options: QuizOption[];
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
    setGenerating(true);
    try {
      const { data: vimeo, error: vErr } = await supabase.functions.invoke(
        "academy-fetch-vimeo-transcript",
        { body: { vimeo_url: vimeoUrl.trim() } },
      );
      if (vErr) throw vErr;

      const resolvedTitle = (episodeTitle.trim() || vimeo?.title || "").trim();
      const tx: string = vimeo?.transcript || "";
      setTranscript(tx);
      setHasTranscript(!!vimeo?.has_transcript);
      setDurationSeconds(vimeo?.duration_seconds ?? null);
      setThumbnailUrl(vimeo?.thumbnail_url ?? null);
      setTitle(resolvedTitle);
      if (!episodeTitle.trim() && vimeo?.title) setEpisodeTitle(vimeo.title);

      const { data: cls, error: cErr } = await supabase.functions.invoke("academy-ai-generate", {
        body: {
          action: "generate_classification",
          title: resolvedTitle,
          transcript: tx,
          webinar_series: series,
        },
      });
      if (cErr) throw cErr;
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
      if (dErr) throw dErr;
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

  // ── Step 5: Generate quiz ──
  const handleGenerateQuiz = async () => {
    if (!title.trim()) { toast.error("A title is required first"); return; }
    setGeneratingQuiz(true);
    try {
      const { data, error } = await supabase.functions.invoke("academy-ai-generate", {
        body: {
          action: "generate_questions",
          title: title.trim(),
          target_audience: targetAudience,
          context_text: transcript,
        },
      });
      if (error) throw error;
      const raw = Array.isArray(data?.questions) ? data.questions : Array.isArray(data) ? data : [];
      setQuestions(
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
    setQuestions((prev) => prev.map((q) => (q.key === key ? { ...q, ...patch } : q)));

  const updateOption = (key: string, idx: number, patch: Partial<QuizOption>) =>
    setQuestions((prev) =>
      prev.map((q) =>
        q.key === key
          ? { ...q, options: q.options.map((o, i) => (i === idx ? { ...o, ...patch } : o)) }
          : q,
      ),
    );

  const setCorrect = (key: string, idx: number) =>
    setQuestions((prev) =>
      prev.map((q) =>
        q.key === key
          ? { ...q, options: q.options.map((o, i) => ({ ...o, is_correct: i === idx })) }
          : q,
      ),
    );

  const deleteQuestion = (key: string) => {
    if (questions.length <= 3) {
      toast.error("A quiz needs at least 3 questions");
      return;
    }
    setQuestions((prev) => prev.filter((q) => q.key !== key));
  };

  // ── Step 6: Save as draft ──
  const handleSave = async () => {
    if (!title.trim()) { toast.error("Title is required"); return; }
    if (!vimeoUrl.trim()) { toast.error("Vimeo URL is required"); return; }
    if (!availableToAll && packageIds.length === 0) {
      toast.error("Select at least one package, or choose All clients");
      return;
    }
    setSaving(true);
    try {
      const { data: { user } } = await supabase.auth.getUser();
      const cleanUrl = vimeoUrl.trim();

      // 1. training_videos (reuse if already imported)
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
            video_name: title.trim(),
            vimeo_url: cleanUrl,
            duration_seconds: durationSeconds,
            thumbnail: thumbnailUrl,
            folder_name: series || null,
            added_by: user?.id ?? null,
          } as any)
          .select("id")
          .single();
        if (vInsErr) throw vInsErr;
        videoId = newVideo.id as string;
      }

      // 2. unique slug
      let slug = generateSlug(title);
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

      // 3. course
      const { data: course, error: cErr } = await supabase
        .from("academy_courses")
        .insert({
          title: title.trim(),
          slug,
          description: description || null,
          short_description: shortDescription || null,
          thumbnail_url: thumbnailUrl,
          target_audience: targetAudience.length ? targetAudience : null,
          difficulty_level: difficulty,
          tags: tags.length ? tags : null,
          status: "draft",
          session_type: sessionType,
          webinar_series: series || null,
          source_video_id: videoId,
          available_to_all_clients: availableToAll,
          ai_generated: true,
          created_by: user?.id ?? null,
        } as any)
        .select("id")
        .single();
      if (cErr) throw cErr;
      const courseId = course.id as number;

      // 4. package rules
      if (!availableToAll && packageIds.length > 0) {
        const { error: prErr } = await supabase
          .from("academy_package_course_rules")
          .insert(
            packageIds.map((pid) => ({
              package_id: pid,
              course_id: courseId,
              is_active: true,
              created_by: user?.id ?? null,
            })) as any,
          );
        if (prErr) throw prErr;
      }

      // 5. module
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

      // 6. lesson
      const { error: lErr } = await supabase
        .from("academy_lessons")
        .insert({
          course_id: courseId,
          module_id: mod.id,
          title: title.trim(),
          description: shortDescription || null,
          lesson_type: "video",
          video_id: videoId,
          sort_order: 1,
          is_published: true,
        } as any);
      if (lErr) throw lErr;

      // 7. assessment + questions
      const survivors = questions.filter((q) => q.question_text.trim());
      if (survivors.length > 0) {
        const { data: assessment, error: aErr } = await supabase
          .from("academy_assessments")
          .insert({
            course_id: courseId,
            title: `${title.trim()} — Completion Quiz`,
            pass_score: 80,
            is_required_for_certificate: true,
            created_by: user?.id ?? null,
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

      toast.success("Draft course created — review and publish when ready");
      navigate(`/superadmin/academy/builder/${courseId}`);
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

        {/* Step 3 */}
        <Card>
          <CardHeader>
            <CardTitle className="text-base">3. Review and adjust</CardTitle>
          </CardHeader>
          <CardContent className="space-y-4">
            <div className="space-y-2">
              <Label>Course title</Label>
              <Input value={title} onChange={(e) => setTitle(e.target.value)} />
            </div>
            <div className="space-y-2">
              <Label>Short description</Label>
              <Textarea rows={2} value={shortDescription} onChange={(e) => setShortDescription(e.target.value)} />
            </div>
            <div className="space-y-2">
              <Label>Description</Label>
              <Textarea rows={6} value={description} onChange={(e) => setDescription(e.target.value)} />
            </div>
            <div className="grid gap-4 md:grid-cols-2">
              <div className="space-y-2">
                <Label>Target audience</Label>
                <div className="space-y-2">
                  {AUDIENCE_OPTIONS.map((a) => (
                    <label key={a.value} className="flex items-center gap-2 text-sm">
                      <Checkbox
                        checked={targetAudience.includes(a.value)}
                        onCheckedChange={(c) =>
                          setTargetAudience((prev) =>
                            c ? [...prev, a.value] : prev.filter((v) => v !== a.value),
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
                <Select value={difficulty} onValueChange={setDifficulty}>
                  <SelectTrigger><SelectValue /></SelectTrigger>
                  <SelectContent>
                    {DIFFICULTY_OPTIONS.map((d) => (
                      <SelectItem key={d} value={d}>{d}</SelectItem>
                    ))}
                  </SelectContent>
                </Select>
                <div className="pt-2 space-y-2">
                  <Label>Tags</Label>
                  <TagChipInput value={tags} onChange={setTags} />
                </div>
              </div>
            </div>
          </CardContent>
        </Card>

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
            <Button variant="outline" size="sm" onClick={handleGenerateQuiz} disabled={generatingQuiz || !title.trim()}>
              {generatingQuiz ? <Loader2 className="h-4 w-4 mr-2 animate-spin" /> : <Sparkles className="h-4 w-4 mr-2" />}
              {questions.length ? "Regenerate questions" : "Generate questions"}
            </Button>
          </CardHeader>
          <CardContent className="space-y-4">
            {questions.length === 0 ? (
              <p className="text-sm text-muted-foreground">
                No questions yet — generate 8 questions from the recording, then edit or delete down to a minimum of 3.
              </p>
            ) : (
              questions.map((q, qi) => (
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
                      disabled={questions.length <= 3}
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
            Saves as a <strong>draft</strong> course — publish it from the course builder after review.
          </p>
          <Button
            onClick={handleSave}
            disabled={saving || !title.trim() || !vimeoUrl.trim()}
            className="text-white hover:opacity-90"
            style={{ backgroundColor: "#23c0dd" }}
          >
            {saving ? <Loader2 className="h-4 w-4 mr-2 animate-spin" /> : <Save className="h-4 w-4 mr-2" />}
            Save as draft
          </Button>
        </div>
        {!generated && (
          <p className="sr-only">Generate content before saving for best results.</p>
        )}
      </div>
    </DashboardLayout>
  );
}
