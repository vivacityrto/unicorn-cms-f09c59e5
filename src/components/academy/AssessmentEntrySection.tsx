import { useQuery } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { useNavigate } from "react-router-dom";
import { Button } from "@/components/ui/button";
import { ClipboardCheck, Clock, Target, RotateCcw } from "lucide-react";

interface Props {
  courseId: number;
  slug: string;
  enrollmentStatus: string | null;
}

export default function AssessmentEntrySection({ courseId, slug, enrollmentStatus }: Props) {
  const navigate = useNavigate();

  const { data: assessment, isLoading: assessmentLoading } = useQuery({
    queryKey: ["academy-assessment", courseId],
    enabled: !!courseId && enrollmentStatus === "active",
    queryFn: async () => {
      const { data, error } = await supabase
        .from("academy_assessments")
        .select("id, title, instructions, pass_score, max_attempts, time_limit_minutes")
        .eq("course_id", courseId)
        .eq("is_published", true)
        .maybeSingle();
      if (error) throw error;
      return data;
    },
  });

  const { data: attemptCount = 0 } = useQuery({
    queryKey: ["academy-attempt-count", assessment?.id],
    enabled: !!assessment?.id,
    queryFn: async () => {
      const { data: { user } } = await supabase.auth.getUser();
      if (!user) return 0;
      const { count, error } = await supabase
        .from("academy_assessment_attempts")
        .select("id", { count: "exact", head: true })
        .eq("assessment_id", assessment!.id)
        .eq("user_id", user.id);
      if (error) throw error;
      return count ?? 0;
    },
  });

  if (enrollmentStatus !== "active" || assessmentLoading || !assessment) return null;

  const attemptsRemaining = assessment.max_attempts ? assessment.max_attempts - attemptCount : null;
  const exhausted = attemptsRemaining !== null && attemptsRemaining <= 0;

  return (
    <div className="rounded-xl overflow-hidden" style={{ borderLeft: "4px solid #7130A0", background: "hsl(var(--card))" }}>
      <div className="p-6 space-y-4">
        <div className="flex items-center gap-3">
          <div className="h-10 w-10 rounded-lg flex items-center justify-center" style={{ background: "linear-gradient(135deg, #7130A0, #ed1878)" }}>
            <ClipboardCheck className="h-5 w-5 text-white" />
          </div>
          <div>
            <h3 className="text-lg font-semibold text-foreground">Assessment</h3>
            <p className="text-sm text-muted-foreground">{assessment.title}</p>
          </div>
        </div>

        {assessment.instructions && (
          <p className="text-sm text-muted-foreground leading-relaxed">{assessment.instructions}</p>
        )}

        <div className="flex items-center gap-4 text-sm flex-wrap">
          <span className="flex items-center gap-1.5 text-muted-foreground">
            <Target className="h-4 w-4" /> Pass mark: {assessment.pass_score ?? 80}%
          </span>
          {assessment.time_limit_minutes && (
            <span className="flex items-center gap-1.5 text-muted-foreground">
              <Clock className="h-4 w-4" /> {assessment.time_limit_minutes} minutes
            </span>
          )}
          {attemptsRemaining !== null && (
            <span className="flex items-center gap-1.5 text-muted-foreground">
              <RotateCcw className="h-4 w-4" /> {attemptsRemaining} attempt{attemptsRemaining !== 1 ? "s" : ""} remaining
            </span>
          )}
        </div>

        <Button
          onClick={() => navigate(`/academy/course/${slug}/assessment/${assessment.id}`)}
          disabled={exhausted}
          className="text-white hover:opacity-90"
          style={{ backgroundColor: "#23c0dd" }}
        >
          <ClipboardCheck className="h-4 w-4 mr-2" />
          {exhausted ? "No Attempts Remaining" : "Start Assessment"}
        </Button>
      </div>
    </div>
  );
}
