import { useState, useEffect, useCallback, useRef } from "react";
import { useParams, useNavigate, useBlocker } from "react-router-dom";
import { useQuery, useMutation } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { Button } from "@/components/ui/button";
import { RadioGroup, RadioGroupItem } from "@/components/ui/radio-group";
import { Loader2, ChevronLeft, ChevronRight, Clock, AlertTriangle, Send } from "lucide-react";
import { toast } from "sonner";

interface QuestionOption {
  value: string;
  label: string;
  is_correct?: boolean; // never exposed to user
}

interface Question {
  id: number;
  question_text: string;
  options: QuestionOption[];
  points: number | null;
  sort_order: number | null;
  explanation: string | null;
}

function shuffleArray<T>(arr: T[]): T[] {
  const a = [...arr];
  for (let i = a.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    [a[i], a[j]] = [a[j], a[i]];
  }
  return a;
}

export default function AcademyAssessmentPlayerPage() {
  const { slug, assessmentId } = useParams<{ slug: string; assessmentId: string }>();
  const navigate = useNavigate();
  const numericAssessmentId = assessmentId ? parseInt(assessmentId, 10) : null;

  const [answers, setAnswers] = useState<Record<number, string>>({});
  const [currentIndex, setCurrentIndex] = useState(0);
  const [timeLeft, setTimeLeft] = useState<number | null>(null);
  const [submitted, setSubmitted] = useState(false);
  const startedAtRef = useRef<string>(new Date().toISOString());

  // Fetch assessment
  const { data: assessment, isLoading: assessmentLoading } = useQuery({
    queryKey: ["academy-assessment-player", numericAssessmentId],
    enabled: !!numericAssessmentId,
    queryFn: async () => {
      const { data, error } = await supabase
        .from("academy_assessments")
        .select("id, title, course_id, pass_score, max_attempts, time_limit_minutes, randomise_questions, instructions")
        .eq("id", numericAssessmentId!)
        .eq("is_published", true)
        .single();
      if (error) throw error;
      return data;
    },
  });

  // Fetch course for slug verification
  const { data: course } = useQuery({
    queryKey: ["academy-course-detail", slug],
    enabled: !!slug,
    queryFn: async () => {
      const { data, error } = await supabase
        .from("academy_courses")
        .select("id, title, slug")
        .eq("slug", slug!)
        .single();
      if (error) throw error;
      return data;
    },
  });

  // Fetch enrollment
  const { data: enrollment } = useQuery({
    queryKey: ["academy-enrollment-for-assessment", course?.id],
    enabled: !!course?.id,
    queryFn: async () => {
      const { data: { user } } = await supabase.auth.getUser();
      if (!user || !course?.id) return null;
      const { data } = await supabase
        .from("academy_enrollments")
        .select("id, user_id, course_id, status")
        .eq("user_id", user.id)
        .eq("course_id", course.id)
        .eq("status", "active")
        .maybeSingle();
      return data;
    },
  });

  // Fetch questions
  const { data: questions = [], isLoading: questionsLoading } = useQuery({
    queryKey: ["academy-assessment-questions", numericAssessmentId, assessment?.randomise_questions],
    enabled: !!numericAssessmentId && !!assessment,
    queryFn: async () => {
      const { data, error } = await supabase
        .from("academy_assessment_questions")
        .select("id, question_text, options, points, sort_order, explanation")
        .eq("assessment_id", numericAssessmentId!)
        .order("sort_order");
      if (error) throw error;
      // Strip is_correct from options before showing to user
      const cleaned = (data ?? []).map((q: any) => ({
        ...q,
        options: ((q.options as QuestionOption[]) || []).map(({ value, label }) => ({ value, label })),
      })) as Question[];
      return assessment?.randomise_questions ? shuffleArray(cleaned) : cleaned;
    },
  });

  // Timer
  useEffect(() => {
    if (assessment?.time_limit_minutes && !submitted) {
      setTimeLeft(assessment.time_limit_minutes * 60);
    }
  }, [assessment?.time_limit_minutes, submitted]);

  useEffect(() => {
    if (timeLeft === null || timeLeft <= 0 || submitted) return;
    const interval = setInterval(() => {
      setTimeLeft(prev => {
        if (prev === null) return null;
        if (prev <= 1) {
          // Auto-submit
          handleSubmit();
          return 0;
        }
        return prev - 1;
      });
    }, 1000);
    return () => clearInterval(interval);
  }, [timeLeft, submitted]);

  // Navigation blocker
  const blocker = useBlocker(({ currentLocation, nextLocation }) => {
    return !submitted && Object.keys(answers).length > 0 && currentLocation.pathname !== nextLocation.pathname;
  });

  // Submit mutation
  const submitMutation = useMutation({
    mutationFn: async () => {
      const { data: { user } } = await supabase.auth.getUser();
      if (!user || !assessment || !enrollment) throw new Error("Not ready");

      const answersJson = questions.map(q => ({
        question_id: q.id,
        selected_value: answers[q.id] || "",
      }));

      const now = new Date().toISOString();
      const startedAt = startedAtRef.current;
      const timeTaken = Math.round((new Date(now).getTime() - new Date(startedAt).getTime()) / 1000);

      const { data: attempt, error } = await supabase
        .from("academy_assessment_attempts")
        .insert({
          assessment_id: assessment.id,
          enrollment_id: enrollment.id,
          user_id: user.id,
          course_id: assessment.course_id,
          answers_json: answersJson,
          started_at: startedAt,
          submitted_at: now,
          time_taken_seconds: timeTaken,
        } as any)
        .select("id")
        .single();

      if (error) throw error;

      // Poll for trigger result
      let result = null;
      for (let i = 0; i < 10; i++) {
        await new Promise(r => setTimeout(r, 500));
        const { data: row } = await supabase
          .from("academy_assessment_attempts")
          .select("id, score, passed, attempt_number")
          .eq("id", attempt.id)
          .single();
        if (row && row.score !== null && row.passed !== null) {
          result = row;
          break;
        }
      }

      return { attemptId: attempt.id, result };
    },
    onSuccess: ({ attemptId, result }) => {
      setSubmitted(true);
      navigate(`/academy/course/${slug}/assessment/${assessmentId}/result/${attemptId}`, { replace: true });
    },
    onError: (e: any) => toast.error(e?.message || "Failed to submit assessment"),
  });

  const handleSubmit = useCallback(() => {
    if (!submitMutation.isPending && !submitted) {
      submitMutation.mutate();
    }
  }, [submitMutation, submitted]);

  const allAnswered = questions.length > 0 && questions.every(q => answers[q.id]);
  const currentQuestion = questions[currentIndex];

  const formatTime = (s: number) => {
    const m = Math.floor(s / 60);
    const sec = s % 60;
    return `${m}:${sec.toString().padStart(2, "0")}`;
  };

  const isLoading = assessmentLoading || questionsLoading;

  if (isLoading) {
    return (
      <div className="flex items-center justify-center min-h-[60vh]">
        <Loader2 className="h-8 w-8 animate-spin text-primary" />
      </div>
    );
  }

  if (!assessment || questions.length === 0) {
    return (
      <div className="text-center py-16">
        <AlertTriangle className="h-12 w-12 mx-auto mb-4 text-muted-foreground" />
        <p className="font-medium text-foreground">Assessment not available</p>
        <Button variant="outline" className="mt-4" onClick={() => navigate(`/academy/course/${slug}`)}>
          Back to Course
        </Button>
      </div>
    );
  }

  return (
    <div className="max-w-3xl mx-auto space-y-6">
      {/* Blocker dialog */}
      {blocker.state === "blocked" && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50">
          <div className="bg-card rounded-xl p-6 max-w-md mx-4 space-y-4 shadow-xl">
            <h3 className="text-lg font-semibold text-foreground">Leave Assessment?</h3>
            <p className="text-sm text-muted-foreground">Your progress will be lost if you leave now. Are you sure?</p>
            <div className="flex gap-3 justify-end">
              <Button variant="outline" size="sm" onClick={() => blocker.reset()}>Stay</Button>
              <Button size="sm" className="bg-destructive text-destructive-foreground hover:bg-destructive/90" onClick={() => blocker.proceed()}>Leave</Button>
            </div>
          </div>
        </div>
      )}

      {/* Header */}
      <div className="rounded-xl p-6" style={{ background: "linear-gradient(135deg, #7130A0, #ed1878)" }}>
        <h1 className="text-xl font-bold text-white">{assessment.title}</h1>
        <div className="flex items-center gap-4 mt-2 text-white/80 text-sm">
          <span>Question {currentIndex + 1} of {questions.length}</span>
          {timeLeft !== null && (
            <span className={`flex items-center gap-1 font-mono ${timeLeft < 60 ? "text-yellow-300 animate-pulse" : ""}`}>
              <Clock className="h-4 w-4" /> {formatTime(timeLeft)}
            </span>
          )}
        </div>
        {/* Progress bar */}
        <div className="mt-3 h-1.5 rounded-full bg-white/20">
          <div
            className="h-full rounded-full bg-white/80 transition-all duration-300"
            style={{ width: `${((currentIndex + 1) / questions.length) * 100}%` }}
          />
        </div>
      </div>

      {/* Question */}
      {currentQuestion && (
        <div className="rounded-xl border p-6 space-y-5" style={{ borderLeft: "4px solid #7130A0", borderColor: "hsl(var(--border))", borderLeftColor: "#7130A0" }}>
          <p className="text-base font-medium text-foreground leading-relaxed">{currentQuestion.question_text}</p>

          <RadioGroup
            value={answers[currentQuestion.id] || ""}
            onValueChange={(val) => setAnswers(prev => ({ ...prev, [currentQuestion.id]: val }))}
            className="space-y-2"
          >
            {currentQuestion.options.map((opt) => (
              <label
                key={opt.value}
                className={`flex items-center gap-3 p-4 rounded-lg border cursor-pointer transition-all hover:border-primary/50 ${
                  answers[currentQuestion.id] === opt.value
                    ? "border-primary bg-primary/5"
                    : "border-border"
                }`}
              >
                <RadioGroupItem value={opt.value} />
                <span className="text-sm text-foreground">{opt.label}</span>
              </label>
            ))}
          </RadioGroup>
        </div>
      )}

      {/* Navigation */}
      <div className="flex items-center justify-between">
        <Button
          variant="outline"
          size="sm"
          disabled={currentIndex === 0}
          onClick={() => setCurrentIndex(i => i - 1)}
        >
          <ChevronLeft className="h-4 w-4 mr-1" /> Previous
        </Button>

        <div className="flex items-center gap-1.5">
          {questions.map((_, i) => (
            <button
              key={i}
              onClick={() => setCurrentIndex(i)}
              className={`h-2.5 w-2.5 rounded-full transition-all ${
                i === currentIndex
                  ? "bg-primary scale-125"
                  : answers[questions[i].id]
                  ? "bg-primary/40"
                  : "bg-muted-foreground/20"
              }`}
            />
          ))}
        </div>

        {currentIndex < questions.length - 1 ? (
          <Button
            size="sm"
            onClick={() => setCurrentIndex(i => i + 1)}
            className="text-white hover:opacity-90"
            style={{ backgroundColor: "#23c0dd" }}
          >
            Next <ChevronRight className="h-4 w-4 ml-1" />
          </Button>
        ) : (
          <Button
            size="sm"
            onClick={handleSubmit}
            disabled={!allAnswered || submitMutation.isPending}
            className="text-white hover:opacity-90"
            style={{ backgroundColor: allAnswered ? "#23c0dd" : undefined }}
          >
            {submitMutation.isPending ? (
              <><Loader2 className="h-4 w-4 mr-1 animate-spin" /> Submitting…</>
            ) : (
              <><Send className="h-4 w-4 mr-1" /> Submit Assessment</>
            )}
          </Button>
        )}
      </div>

      {/* Unanswered warning */}
      {currentIndex === questions.length - 1 && !allAnswered && (
        <p className="text-xs text-center text-muted-foreground">
          Please answer all questions before submitting. {questions.filter(q => !answers[q.id]).length} unanswered.
        </p>
      )}
    </div>
  );
}
