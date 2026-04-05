import { useState, useEffect } from "react";
import { useParams, useNavigate } from "react-router-dom";
import { useQuery } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { Button } from "@/components/ui/button";
import { CheckCircle2, XCircle, HelpCircle, RotateCcw, Mail, Loader2, Award } from "lucide-react";
import AcademyCertificateCard from "@/components/academy/AcademyCertificateCard";

interface QuestionOption {
  value: string;
  label: string;
  is_correct?: boolean;
}

export default function AcademyAssessmentResultPage() {
  const { slug, assessmentId, attemptId } = useParams<{ slug: string; assessmentId: string; attemptId: string }>();
  const navigate = useNavigate();
  const numericAttemptId = attemptId ? parseInt(attemptId, 10) : null;
  const numericAssessmentId = assessmentId ? parseInt(assessmentId, 10) : null;

  // Fetch attempt result (poll until score is set)
  const { data: attempt, isLoading: attemptLoading } = useQuery({
    queryKey: ["academy-attempt-result", numericAttemptId],
    enabled: !!numericAttemptId,
    refetchInterval: (query) => {
      const d = query.state.data;
      if (d && d.score !== null && d.passed !== null) return false;
      return 500;
    },
    queryFn: async () => {
      const { data, error } = await supabase
        .from("academy_assessment_attempts")
        .select("id, assessment_id, score, passed, attempt_number, answers_json, course_id, user_id")
        .eq("id", numericAttemptId!)
        .single();
      if (error) throw error;
      return data;
    },
  });

  // Fetch assessment for pass_score + max_attempts
  const { data: assessment } = useQuery({
    queryKey: ["academy-assessment-meta", numericAssessmentId],
    enabled: !!numericAssessmentId,
    queryFn: async () => {
      const { data, error } = await supabase
        .from("academy_assessments")
        .select("id, title, pass_score, max_attempts, course_id")
        .eq("id", numericAssessmentId!)
        .single();
      if (error) throw error;
      return data;
    },
  });

  // Fetch questions (with explanations and correct answers for review)
  const { data: questions = [] } = useQuery({
    queryKey: ["academy-assessment-questions-review", numericAssessmentId],
    enabled: !!numericAssessmentId && attempt?.passed === false,
    queryFn: async () => {
      const { data, error } = await supabase
        .from("academy_assessment_questions")
        .select("id, question_text, options, explanation, sort_order")
        .eq("assessment_id", numericAssessmentId!)
        .order("sort_order");
      if (error) throw error;
      return data ?? [];
    },
  });

  // Count total attempts for this user
  const { data: totalAttempts = 0 } = useQuery({
    queryKey: ["academy-attempt-count-result", numericAssessmentId],
    enabled: !!numericAssessmentId && !!attempt?.user_id,
    queryFn: async () => {
      const { count, error } = await supabase
        .from("academy_assessment_attempts")
        .select("id", { count: "exact", head: true })
        .eq("assessment_id", numericAssessmentId!)
        .eq("user_id", attempt!.user_id);
      if (error) throw error;
      return count ?? 0;
    },
  });

  // Fetch certificate (poll if passed)
  const { data: certificate } = useQuery({
    queryKey: ["academy-certificate-after-pass", attempt?.course_id, attempt?.user_id],
    enabled: !!attempt?.passed && !!attempt?.course_id,
    refetchInterval: (query) => {
      if (query.state.data) return false;
      return 500;
    },
    queryFn: async () => {
      const { data, error } = await supabase
        .from("academy_certificates")
        .select("id, certificate_number, issued_at, expires_at, course_id, user_id")
        .eq("course_id", attempt!.course_id)
        .eq("user_id", attempt!.user_id)
        .maybeSingle();
      if (error) throw error;
      return data;
    },
  });

  // Fetch course title
  const { data: course } = useQuery({
    queryKey: ["academy-course-for-result", attempt?.course_id],
    enabled: !!attempt?.course_id,
    queryFn: async () => {
      const { data, error } = await supabase
        .from("academy_courses")
        .select("id, title, slug")
        .eq("id", attempt!.course_id)
        .single();
      if (error) throw error;
      return data;
    },
  });

  // Fetch user profile
  const { data: userProfile } = useQuery({
    queryKey: ["academy-user-profile-cert", attempt?.user_id],
    enabled: !!attempt?.user_id,
    queryFn: async () => {
      const { data, error } = await supabase
        .from("users")
        .select("first_name, last_name")
        .eq("user_uuid", attempt!.user_id)
        .single();
      if (error) throw error;
      return data;
    },
  });

  const scoreReady = attempt && attempt.score !== null && attempt.passed !== null;
  const passed = attempt?.passed === true;
  const score = attempt?.score ?? 0;
  const passScore = assessment?.pass_score ?? 80;
  const attemptsRemaining = assessment?.max_attempts ? assessment.max_attempts - totalAttempts : null;

  // Parse user answers for review
  const userAnswers: Record<number, string> = {};
  if (attempt?.answers_json && Array.isArray(attempt.answers_json)) {
    (attempt.answers_json as any[]).forEach((a: any) => {
      userAnswers[a.question_id] = a.selected_value;
    });
  }

  if (attemptLoading || !scoreReady) {
    return (
      <div className="flex flex-col items-center justify-center min-h-[60vh] gap-4">
        <Loader2 className="h-10 w-10 animate-spin text-primary" />
        <p className="text-sm text-muted-foreground">Calculating your result…</p>
      </div>
    );
  }

  return (
    <div className="max-w-3xl mx-auto space-y-6">
      {/* Result Banner */}
      {passed ? (
        <div className="rounded-xl p-8 text-center" style={{ background: "linear-gradient(135deg, #7130A0, #ed1878)" }}>
          <div className="inline-flex items-center justify-center h-20 w-20 rounded-full bg-white/20 mb-4">
            <CheckCircle2 className="h-10 w-10 text-white" />
          </div>
          <h1 className="text-2xl font-bold text-white mb-2">You passed! 🎉</h1>
          <p className="text-3xl font-bold text-white mb-1">Score: {score}%</p>
          <p className="text-sm text-white/80">Pass mark: {passScore}%</p>
        </div>
      ) : (
        <div className="rounded-xl p-8 text-center" style={{ background: "#DFD8E8" }}>
          <div className="inline-flex items-center justify-center h-20 w-20 rounded-full mb-4" style={{ background: "#44235F20" }}>
            <XCircle className="h-10 w-10" style={{ color: "#44235F" }} />
          </div>
          <h1 className="text-2xl font-bold mb-2" style={{ color: "#44235F" }}>Not quite there</h1>
          <p className="text-3xl font-bold mb-1" style={{ color: "#44235F" }}>Score: {score}%</p>
          <p className="text-sm" style={{ color: "#44235F99" }}>You need {passScore}% to pass</p>
        </div>
      )}

      {/* Certificate section (if passed) */}
      {passed && (
        <div className="space-y-4">
          {certificate ? (
            <AcademyCertificateCard
              courseTitle={course?.title ?? ""}
              userName={[userProfile?.first_name, userProfile?.last_name].filter(Boolean).join(" ") || "Student"}
              certificateNumber={certificate.certificate_number}
              issuedAt={certificate.issued_at}
              expiresAt={certificate.expires_at}
            />
          ) : (
            <div className="flex items-center justify-center gap-3 py-6 rounded-xl border border-border">
              <Loader2 className="h-5 w-5 animate-spin text-primary" />
              <span className="text-sm text-muted-foreground">Your certificate is being prepared…</span>
            </div>
          )}
        </div>
      )}

      {/* Failed: Question Review */}
      {!passed && questions.length > 0 && (
        <div className="space-y-4">
          <h2 className="text-lg font-semibold text-foreground">Review Your Answers</h2>
          {questions.map((q: any) => {
            const userAnswer = userAnswers[q.id];
            const options = (q.options as QuestionOption[]) || [];
            const correctOpt = options.find(o => o.is_correct);
            const isCorrect = userAnswer === correctOpt?.value;
            if (isCorrect) return null; // Only show wrong answers

            return (
              <div key={q.id} className="rounded-lg border p-4 space-y-3" style={{ borderLeft: "4px solid #DFD8E8" }}>
                <p className="text-sm font-medium text-foreground">{q.question_text}</p>
                <div className="text-sm space-y-1">
                  <p className="text-muted-foreground">
                    Your answer: <span className="font-medium">{options.find(o => o.value === userAnswer)?.label || "No answer"}</span>
                  </p>
                  {correctOpt && (
                    <p style={{ color: "#22c55e" }}>
                      Correct answer: <span className="font-medium">{correctOpt.label}</span>
                    </p>
                  )}
                </div>
                {q.explanation && (
                  <div className="flex gap-2 p-3 rounded-md" style={{ background: "#DFD8E830" }}>
                    <HelpCircle className="h-4 w-4 flex-shrink-0 mt-0.5" style={{ color: "#7130A0" }} />
                    <p className="text-xs text-muted-foreground">{q.explanation}</p>
                  </div>
                )}
              </div>
            );
          })}
        </div>
      )}

      {/* Actions */}
      <div className="flex items-center justify-center gap-3 pt-4">
        {!passed && attemptsRemaining !== null && attemptsRemaining > 0 && (
          <Button
            onClick={() => navigate(`/academy/course/${slug}/assessment/${assessmentId}`)}
            className="text-white hover:opacity-90"
            style={{ backgroundColor: "#23c0dd" }}
          >
            <RotateCcw className="h-4 w-4 mr-2" /> Try Again ({attemptsRemaining} remaining)
          </Button>
        )}
        {!passed && attemptsRemaining !== null && attemptsRemaining <= 0 && (
          <Button variant="outline" onClick={() => window.open("mailto:support@vivacity.com.au", "_blank")}>
            <Mail className="h-4 w-4 mr-2" /> Contact Support
          </Button>
        )}
        <Button variant="outline" onClick={() => navigate(`/academy/course/${slug}`)}>
          Back to Course
        </Button>
      </div>
    </div>
  );
}
