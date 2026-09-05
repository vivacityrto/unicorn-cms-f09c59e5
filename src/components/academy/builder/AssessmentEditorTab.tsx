import { useState, useEffect } from "react";
import {
  useBuilderAssessment, useBuilderQuestions, useCreateAssessment,
  useUpdateAssessment, useDeleteQuestion, useSaveAllQuestions,
  type BuilderAssessment, type BuilderQuestion, type QuestionOption,
} from "@/hooks/academy/useAcademyAssessmentBuilder";
import { supabase } from "@/integrations/supabase/client";
import type { Json } from "@/integrations/supabase/types";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Switch } from "@/components/ui/switch";
import { Skeleton } from "@/components/ui/skeleton";
import { RadioGroup, RadioGroupItem } from "@/components/ui/radio-group";
import { AlertDialog, AlertDialogAction, AlertDialogCancel, AlertDialogContent, AlertDialogDescription, AlertDialogFooter, AlertDialogHeader, AlertDialogTitle } from "@/components/ui/alert-dialog";
import { AppModal, AppModalContent, AppModalHeader, AppModalTitle, AppModalBody, AppModalFooter } from "@/components/ui/modals";
import { Plus, Trash2, Save, ClipboardCheck, GripVertical, X, Sparkles, Loader2 } from "lucide-react";
import { toast } from "sonner";
import { useQueryClient } from "@tanstack/react-query";

const VALUE_LETTERS = ["A", "B", "C", "D", "E", "F"];
const QUESTION_COUNT_MIN = 3;
const QUESTION_COUNT_MAX = 20;
const QUESTION_COUNT_SUGGEST_MIN = 8;

/** Helpful default: 8 for a single-lesson (or unknown) course, scaling toward 20 for longer courses. */
function suggestQuestionCount(lessonCount: number): number {
  const n = Math.max(1, Math.floor(lessonCount) || 1);
  const suggested = Math.round(QUESTION_COUNT_SUGGEST_MIN + (n - 1) * 1.5);
  return Math.min(QUESTION_COUNT_MAX, Math.max(QUESTION_COUNT_SUGGEST_MIN, suggested));
}

function clampQuestionCount(value: number): number {
  if (!Number.isFinite(value)) return QUESTION_COUNT_SUGGEST_MIN;
  return Math.min(QUESTION_COUNT_MAX, Math.max(QUESTION_COUNT_MIN, Math.round(value)));
}

interface GeneratedQuestion {
  question_text: string;
  options: QuestionOption[];
  explanation?: string | null;
}

interface AssessmentEditorTabProps {
  courseId: number;
  courseTitle?: string;
  courseDescription?: string | null;
  courseTargetAudience?: string[] | null;
  /** Session transcript from Structure-tab AI Assist; enables Generate quiz with AI. */
  aiTranscript?: string;
  /** Lesson count used to suggest a starting question_count (staff can override). */
  lessonCount?: number;
}

export default function AssessmentEditorTab({
  courseId,
  courseTitle,
  courseDescription,
  courseTargetAudience,
  aiTranscript = "",
  lessonCount = 0,
}: AssessmentEditorTabProps) {
  const { data: assessment, isLoading: assLoading } = useBuilderAssessment(courseId);
  const { data: dbQuestions = [], isLoading: qLoading } = useBuilderQuestions(assessment?.id ?? null);
  const createAssessment = useCreateAssessment();
  const updateAssessment = useUpdateAssessment();
  const deleteQuestionMut = useDeleteQuestion();
  const saveAllQuestionsMut = useSaveAllQuestions();
  const queryClient = useQueryClient();

  const [localQuestions, setLocalQuestions] = useState<BuilderQuestion[]>([]);
  const [deleteTarget, setDeleteTarget] = useState<{ id: number; text: string } | null>(null);
  const [nextTempId, setNextTempId] = useState(-1);

  // AI generation state
  const [aiModalOpen, setAiModalOpen] = useState(false);
  const [aiContext, setAiContext] = useState("");
  const [aiGenerating, setAiGenerating] = useState(false);
  const [quizAiGenerating, setQuizAiGenerating] = useState(false);
  const [questionCount, setQuestionCount] = useState(() => suggestQuestionCount(lessonCount));

  const hasAiTranscript = !!aiTranscript.trim();

  useEffect(() => {
    if (dbQuestions.length > 0) {
      setLocalQuestions(dbQuestions);
    }
  }, [dbQuestions]);

  useEffect(() => {
    setQuestionCount(suggestQuestionCount(lessonCount));
  }, [lessonCount]);

  const handleCreateAssessment = async () => {
    const { data: { user } } = await supabase.auth.getUser();
    createAssessment.mutate({
      courseId,
      data: {
        title: "Course Assessment",
        pass_score: 80,
        max_attempts: 3,
        randomise_questions: true,
        is_required_for_certificate: true,
        is_published: false,
      },
    });
  };

  const autoSaveField = <K extends keyof Omit<BuilderAssessment, "id" | "course_id">>(
    field: K,
    value: BuilderAssessment[K],
  ) => {
    if (!assessment) return;
    updateAssessment.mutate({
      id: assessment.id,
      courseId,
      data: { [field]: value } as Partial<Omit<BuilderAssessment, "id" | "course_id">>,
    });
  };

  const addQuestion = () => {
    const newQ: BuilderQuestion = {
      id: nextTempId,
      assessment_id: assessment!.id,
      question_text: "",
      question_type: "multiple_choice",
      options: [
        { value: "A", label: "", is_correct: true },
        { value: "B", label: "", is_correct: false },
      ],
      points: 1,
      sort_order: localQuestions.length + 1,
      explanation: "",
    };
    setLocalQuestions(prev => [...prev, newQ]);
    setNextTempId(prev => prev - 1);
  };

  const updateLocalQuestion = <K extends keyof BuilderQuestion>(idx: number, field: K, value: BuilderQuestion[K]) => {
    setLocalQuestions(prev => prev.map((q, i) => i === idx ? { ...q, [field]: value } : q));
  };

  const updateOption = <K extends keyof QuestionOption>(qIdx: number, optIdx: number, field: K, value: QuestionOption[K]) => {
    setLocalQuestions(prev => prev.map((q, i) => {
      if (i !== qIdx) return q;
      const opts = [...q.options];
      if (field === "is_correct" && value === true) {
        opts.forEach((o, j) => { opts[j] = { ...o, is_correct: j === optIdx }; });
      } else {
        opts[optIdx] = { ...opts[optIdx], [field]: value };
      }
      return { ...q, options: opts };
    }));
  };

  const addOption = (qIdx: number) => {
    setLocalQuestions(prev => prev.map((q, i) => {
      if (i !== qIdx || q.options.length >= 6) return q;
      const nextVal = VALUE_LETTERS[q.options.length] || String(q.options.length + 1);
      return { ...q, options: [...q.options, { value: nextVal, label: "", is_correct: false }] };
    }));
  };

  const removeOption = (qIdx: number, optIdx: number) => {
    setLocalQuestions(prev => prev.map((q, i) => {
      if (i !== qIdx || q.options.length <= 2) return q;
      const opts = q.options.filter((_, j) => j !== optIdx);
      const revalued = opts.map((o, j) => ({ ...o, value: VALUE_LETTERS[j] || String(j + 1) }));
      if (!revalued.some(o => o.is_correct)) revalued[0].is_correct = true;
      return { ...q, options: revalued };
    }));
  };

  const moveQuestion = (idx: number, direction: -1 | 1) => {
    const newIdx = idx + direction;
    if (newIdx < 0 || newIdx >= localQuestions.length) return;
    const arr = [...localQuestions];
    [arr[idx], arr[newIdx]] = [arr[newIdx], arr[idx]];
    setLocalQuestions(arr.map((q, i) => ({ ...q, sort_order: i + 1 })));
  };

  const handleSaveAll = () => {
    if (!assessment) return;
    for (const q of localQuestions) {
      if (!q.question_text.trim()) {
        toast.error("All questions must have text");
        return;
      }
      if (!q.options.some(o => o.is_correct)) {
        toast.error("Each question must have a correct answer");
        return;
      }
      if (q.options.some(o => !o.label.trim())) {
        toast.error("All option labels must be filled");
        return;
      }
    }
    const toSave = localQuestions.map(q => q.id < 0 ? { ...q, id: 0 } : q);
    saveAllQuestionsMut.mutate({ assessmentId: assessment.id, questions: toSave });
  };

  const handleConfirmDelete = () => {
    if (!deleteTarget || !assessment) return;
    if (deleteTarget.id > 0) {
      deleteQuestionMut.mutate({ id: deleteTarget.id, assessmentId: assessment.id });
    }
    setLocalQuestions(prev => prev.filter(q => q.id !== deleteTarget.id));
    setDeleteTarget(null);
  };

  const handleOpenAiModal = () => {
    setAiContext(courseDescription || "");
    setAiModalOpen(true);
  };

  const insertGeneratedQuestions = async (questions: GeneratedQuestion[]) => {
    if (!assessment) return;
    const maxSort = localQuestions.length > 0
      ? Math.max(...localQuestions.map(q => q.sort_order ?? 0))
      : 0;

    for (let i = 0; i < questions.length; i++) {
      const q = questions[i];
      const { error } = await supabase.from("academy_assessment_questions").insert({
        assessment_id: assessment.id,
        question_text: q.question_text,
        question_type: "multiple_choice",
        options: q.options as unknown as Json,
        points: 1,
        sort_order: maxSort + i + 1,
        explanation: q.explanation || null,
      });
      if (error) throw error;
    }

    queryClient.invalidateQueries({ queryKey: ["academy-assessment-questions-builder", assessment.id] });
    toast.success(`${questions.length} questions generated — review and edit before publishing`);
  };

  const handleQuestionCountChange = (raw: string) => {
    const parsed = parseInt(raw, 10);
    if (Number.isNaN(parsed)) {
      setQuestionCount(QUESTION_COUNT_MIN);
      return;
    }
    // Allow intermediate typing; clamp on blur / submit.
    setQuestionCount(parsed);
  };

  const handleQuestionCountBlur = () => {
    setQuestionCount((prev) => clampQuestionCount(prev));
  };

  const handleAiGenerate = async () => {
    if (!assessment || !aiContext.trim()) return;
    const count = clampQuestionCount(questionCount);
    setQuestionCount(count);
    setAiGenerating(true);
    try {
      const { data, error: fnError } = await supabase.functions.invoke("academy-ai-generate", {
        body: {
          action: "generate_questions",
          title: courseTitle || "Untitled Course",
          target_audience: (courseTargetAudience && courseTargetAudience.length > 0) ? courseTargetAudience.join(", ") : "training professionals",
          context_text: aiContext,
          question_count: count,
        },
      });

      if (fnError) throw new Error(fnError.message);
      if (data?.error) throw new Error(data.error);

      const questions = data?.questions;
      if (!Array.isArray(questions) || questions.length === 0) {
        throw new Error("No questions returned");
      }

      await insertGeneratedQuestions(questions);
      setAiModalOpen(false);
    } catch (e) {
      console.error("AI question generation error:", e);
      toast.error("Generation failed, please try again");
    } finally {
      setAiGenerating(false);
    }
  };

  /** Quick Add–parity quiz generation from Structure-tab AI Assist transcript. */
  const handleGenerateQuizWithAi = async () => {
    if (!assessment || !hasAiTranscript) return;
    const count = clampQuestionCount(questionCount);
    setQuestionCount(count);
    setQuizAiGenerating(true);
    try {
      const audience = Array.isArray(courseTargetAudience) ? courseTargetAudience : [];
      const { data, error: fnError } = await supabase.functions.invoke("academy-ai-generate", {
        body: {
          action: "generate_questions",
          title: courseTitle || "Untitled Course",
          target_audience: audience,
          context_text: aiTranscript,
          question_count: count,
        },
      });

      if (fnError) throw new Error(fnError.message);
      if (data?.error) throw new Error(data.error);

      const questions = data?.questions;
      if (!Array.isArray(questions) || questions.length === 0) {
        throw new Error("No questions returned");
      }

      await insertGeneratedQuestions(questions);
    } catch (e) {
      console.error("AI quiz generation error:", e);
      toast.error("Generation failed, please try again");
    } finally {
      setQuizAiGenerating(false);
    }
  };

  if (assLoading) {
    return <Skeleton className="h-96 w-full rounded-xl" />;
  }

  if (!assessment) {
    return (
      <div className="text-center py-16 rounded-xl border" style={{ borderColor: "hsl(var(--border))" }}>
        <ClipboardCheck className="h-12 w-12 mx-auto mb-4" style={{ color: "#ed1878", opacity: 0.5 }} />
        <p className="font-medium text-foreground">No assessment for this course</p>
        <p className="text-sm text-muted-foreground mt-1">Create an assessment to test learner knowledge</p>
        <Button
          className="mt-4 text-white hover:opacity-90"
          style={{ backgroundColor: "#ed1878" }}
          onClick={handleCreateAssessment}
          disabled={createAssessment.isPending}
        >
          <Plus className="h-4 w-4 mr-2" /> Create Assessment
        </Button>
      </div>
    );
  }

  return (
    <div className="space-y-6 max-w-4xl">
      {/* Assessment Settings */}
      <div className="rounded-xl border p-5 space-y-4" style={{ borderLeft: "4px solid #ed1878", borderColor: "hsl(var(--border))", borderLeftColor: "#ed1878" }}>
        <h2 className="text-sm font-semibold" style={{ color: "#ed1878" }}>Assessment Settings</h2>

        <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
          <div className="space-y-1">
            <label className="text-xs font-medium text-muted-foreground">Title</label>
            <Input defaultValue={assessment.title} onBlur={(e) => autoSaveField("title", e.target.value)} />
          </div>
          <div className="space-y-1">
            <label className="text-xs font-medium text-muted-foreground">Pass Score (%)</label>
            <Input type="number" min={0} max={100} defaultValue={assessment.pass_score ?? 80} onBlur={(e) => autoSaveField("pass_score", parseInt(e.target.value) || 80)} />
          </div>
          <div className="space-y-1">
            <label className="text-xs font-medium text-muted-foreground">Max Attempts</label>
            <Input type="number" min={1} defaultValue={assessment.max_attempts ?? 3} onBlur={(e) => autoSaveField("max_attempts", parseInt(e.target.value) || 3)} />
          </div>
          <div className="space-y-1">
            <label className="text-xs font-medium text-muted-foreground">Time Limit (minutes, blank = no limit)</label>
            <Input type="number" defaultValue={assessment.time_limit_minutes ?? ""} onBlur={(e) => autoSaveField("time_limit_minutes", e.target.value ? parseInt(e.target.value) : null)} />
          </div>
        </div>

        <div className="space-y-1">
          <label className="text-xs font-medium text-muted-foreground">Instructions</label>
          <Textarea defaultValue={assessment.instructions ?? ""} onBlur={(e) => autoSaveField("instructions", e.target.value || null)} rows={3} />
        </div>

        <div className="flex flex-wrap gap-6">
          <label className="flex items-center gap-2 text-sm">
            <Switch checked={assessment.randomise_questions ?? true} onCheckedChange={(v) => autoSaveField("randomise_questions", v)} />
            Randomise Questions
          </label>
          <label className="flex items-center gap-2 text-sm">
            <Switch checked={assessment.is_required_for_certificate ?? true} onCheckedChange={(v) => autoSaveField("is_required_for_certificate", v)} />
            Required for Certificate
          </label>
          <label className="flex items-center gap-2 text-sm">
            <Switch checked={assessment.is_published ?? false} onCheckedChange={(v) => autoSaveField("is_published", v)} />
            Published
          </label>
        </div>
      </div>

      {/* Questions */}
      <div className="space-y-4">
        <div className="flex items-center justify-between">
          <h2 className="text-sm font-semibold text-foreground">Questions ({localQuestions.length})</h2>
          <Button size="sm" onClick={handleSaveAll} disabled={saveAllQuestionsMut.isPending} className="text-white hover:opacity-90" style={{ backgroundColor: "#23c0dd" }}>
            <Save className="h-3.5 w-3.5 mr-1" /> {saveAllQuestionsMut.isPending ? "Saving…" : "Save All Questions"}
          </Button>
        </div>

        {/* AI generate actions — only when unpublished */}
        {!assessment.is_published && (
          <div className="space-y-2">
            <div className="space-y-1">
              <label className="text-[10px] font-medium text-muted-foreground" htmlFor="assessment-question-count">
                Number of questions
              </label>
              <Input
                id="assessment-question-count"
                type="number"
                min={QUESTION_COUNT_MIN}
                max={QUESTION_COUNT_MAX}
                value={questionCount}
                onChange={(e) => handleQuestionCountChange(e.target.value)}
                onBlur={handleQuestionCountBlur}
                className="h-8 w-28 text-sm"
              />
            </div>
            <Button
              variant="outline"
              size="sm"
              className="w-full text-xs gap-1.5"
              style={{ borderColor: "#7130A0", color: "#7130A0" }}
              onClick={handleGenerateQuizWithAi}
              disabled={!hasAiTranscript || quizAiGenerating}
              title={
                hasAiTranscript
                  ? "Generate quiz questions from the AI Assist transcript"
                  : "Use AI Assist on the Structure tab with a Vimeo video that has a transcript first"
              }
            >
              {quizAiGenerating ? (
                <><Loader2 className="h-3.5 w-3.5 animate-spin" /> Generating quiz…</>
              ) : (
                <><Sparkles className="h-3.5 w-3.5" /> Generate quiz with AI</>
              )}
            </Button>
            {!hasAiTranscript && (
              <p className="text-[11px] text-muted-foreground">
                Available after AI Assist fetches a transcript on the Structure tab.
              </p>
            )}
            <Button
              variant="outline"
              size="sm"
              className="w-full text-xs gap-1.5"
              style={{ borderColor: "#ed1878", color: "#ed1878" }}
              onClick={handleOpenAiModal}
            >
              <Sparkles className="h-3.5 w-3.5" /> Generate Starter Questions
            </Button>
          </div>
        )}

        {qLoading ? (
          <div className="space-y-3">
            {Array.from({ length: 3 }).map((_, i) => <Skeleton key={i} className="h-32 rounded-lg" />)}
          </div>
        ) : (
          <div className="space-y-4">
            {localQuestions.map((q, qIdx) => (
              <div key={q.id} className="rounded-lg border p-4 space-y-3" style={{ borderColor: "hsl(var(--border))" }}>
                <div className="flex items-start gap-2">
                  <div className="flex flex-col gap-0.5 pt-1">
                    <button onClick={() => moveQuestion(qIdx, -1)} disabled={qIdx === 0} className="text-muted-foreground hover:text-foreground disabled:opacity-20 text-xs">▲</button>
                    <button onClick={() => moveQuestion(qIdx, 1)} disabled={qIdx === localQuestions.length - 1} className="text-muted-foreground hover:text-foreground disabled:opacity-20 text-xs">▼</button>
                  </div>

                  <span className="text-xs font-bold text-muted-foreground mt-2 shrink-0">Q{qIdx + 1}</span>

                  <div className="flex-1 space-y-3">
                    <Textarea
                      value={q.question_text}
                      onChange={(e) => updateLocalQuestion(qIdx, "question_text", e.target.value)}
                      placeholder="Enter question text..."
                      rows={2}
                      className="text-sm"
                    />

                    {/* Options */}
                    <div className="space-y-2">
                      {q.options.map((opt, optIdx) => (
                        <div key={optIdx} className="flex items-center gap-2">
                          <button
                            onClick={() => updateOption(qIdx, optIdx, "is_correct", true)}
                            className={`h-5 w-5 rounded-full border-2 flex items-center justify-center shrink-0 transition-colors ${
                              opt.is_correct ? "border-green-500 bg-green-500" : "border-muted-foreground/30"
                            }`}
                          >
                            {opt.is_correct && <span className="text-white text-[10px]">✓</span>}
                          </button>
                          <span className="text-xs font-mono text-muted-foreground w-4 shrink-0">{opt.value}</span>
                          <Input
                            value={opt.label}
                            onChange={(e) => updateOption(qIdx, optIdx, "label", e.target.value)}
                            placeholder="Answer text..."
                            className="flex-1 h-8 text-sm"
                          />
                          {q.options.length > 2 && (
                            <button onClick={() => removeOption(qIdx, optIdx)} className="p-1 hover:bg-destructive/10 rounded">
                              <X className="h-3.5 w-3.5 text-destructive" />
                            </button>
                          )}
                        </div>
                      ))}
                      {q.options.length < 6 && (
                        <Button variant="ghost" size="sm" onClick={() => addOption(qIdx)} className="text-xs text-muted-foreground">
                          <Plus className="h-3 w-3 mr-1" /> Add Option
                        </Button>
                      )}
                    </div>

                    {/* Points + Explanation */}
                    <div className="grid grid-cols-[100px_1fr] gap-3">
                      <div className="space-y-1">
                        <label className="text-[10px] font-medium text-muted-foreground">Points</label>
                        <Input
                          type="number"
                          min={1}
                          value={q.points ?? 1}
                          onChange={(e) => updateLocalQuestion(qIdx, "points", parseInt(e.target.value) || 1)}
                          className="h-8 text-sm"
                        />
                      </div>
                      <div className="space-y-1">
                        <label className="text-[10px] font-medium text-muted-foreground">Explanation (shown on failure)</label>
                        <Input
                          value={q.explanation ?? ""}
                          onChange={(e) => updateLocalQuestion(qIdx, "explanation", e.target.value)}
                          placeholder="Explain why the correct answer is right..."
                          className="h-8 text-sm"
                        />
                      </div>
                    </div>
                  </div>

                  <button
                    onClick={() => setDeleteTarget({ id: q.id, text: q.question_text || `Question ${qIdx + 1}` })}
                    className="p-1 hover:bg-destructive/10 rounded mt-1"
                  >
                    <Trash2 className="h-4 w-4 text-destructive" />
                  </button>
                </div>
              </div>
            ))}
          </div>
        )}

        <Button variant="outline" onClick={addQuestion} className="w-full">
          <Plus className="h-4 w-4 mr-2" /> Add Question
        </Button>
      </div>

      {/* Delete Question Dialog */}
      <AlertDialog open={!!deleteTarget} onOpenChange={() => setDeleteTarget(null)}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Delete Question?</AlertDialogTitle>
            <AlertDialogDescription>
              Are you sure you want to delete this question? This cannot be undone.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Cancel</AlertDialogCancel>
            <AlertDialogAction onClick={handleConfirmDelete} className="bg-destructive text-destructive-foreground hover:bg-destructive/90">Delete</AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>

      {/* AI Question Generation Modal */}
      <AppModal open={aiModalOpen} onOpenChange={setAiModalOpen}>
        <AppModalContent size="md">
          <AppModalHeader>
            <AppModalTitle>✨ Generate Starter Questions</AppModalTitle>
          </AppModalHeader>
          <AppModalBody className="space-y-4">
            <p className="text-sm text-muted-foreground">
              Describe what this course covers — paste your key learning outcomes, topics, or lesson titles. The AI will generate multiple-choice questions for review.
            </p>
            <div className="space-y-1">
              <label className="text-[10px] font-medium text-muted-foreground" htmlFor="starter-question-count">
                Number of questions
              </label>
              <Input
                id="starter-question-count"
                type="number"
                min={QUESTION_COUNT_MIN}
                max={QUESTION_COUNT_MAX}
                value={questionCount}
                onChange={(e) => handleQuestionCountChange(e.target.value)}
                onBlur={handleQuestionCountBlur}
                className="h-8 w-28 text-sm"
              />
            </div>
            <Textarea
              value={aiContext}
              onChange={(e) => setAiContext(e.target.value)}
              placeholder="e.g. This course covers RTO registration requirements, ASQA compliance obligations, training and assessment strategies..."
              rows={8}
              className="text-sm"
            />
          </AppModalBody>
          <AppModalFooter>
            <Button variant="outline" onClick={() => setAiModalOpen(false)} disabled={aiGenerating}>
              Cancel
            </Button>
            <Button
              onClick={handleAiGenerate}
              disabled={!aiContext.trim() || aiGenerating}
              className="text-white hover:opacity-90"
              style={{ backgroundColor: "#ed1878" }}
            >
              {aiGenerating ? (
                <><Loader2 className="h-4 w-4 animate-spin mr-1" /> Generating…</>
              ) : (
                <><Sparkles className="h-4 w-4 mr-1" /> Generate</>
              )}
            </Button>
          </AppModalFooter>
        </AppModalContent>
      </AppModal>
    </div>
  );
}
