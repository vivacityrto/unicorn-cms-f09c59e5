import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { toast } from "sonner";

const ASSESSMENT_KEY = "academy-assessment-builder";
const QUESTIONS_KEY = "academy-assessment-questions-builder";

export interface BuilderAssessment {
  id: number;
  course_id: number;
  title: string;
  instructions: string | null;
  pass_score: number | null;
  max_attempts: number | null;
  time_limit_minutes: number | null;
  randomise_questions: boolean | null;
  is_required_for_certificate: boolean | null;
  is_published: boolean | null;
  created_by: string | null;
}

export interface QuestionOption {
  value: string;
  label: string;
  is_correct: boolean;
}

export interface BuilderQuestion {
  id: number;
  assessment_id: number;
  question_text: string;
  question_type: string | null;
  options: QuestionOption[];
  points: number | null;
  sort_order: number | null;
  explanation: string | null;
}

export function useBuilderAssessment(courseId: number | null) {
  return useQuery<BuilderAssessment | null>({
    queryKey: [ASSESSMENT_KEY, courseId],
    enabled: !!courseId,
    queryFn: async () => {
      const { data, error } = await supabase
        .from("academy_assessments")
        .select("id, course_id, title, instructions, pass_score, max_attempts, time_limit_minutes, randomise_questions, is_required_for_certificate, is_published, created_by")
        .eq("course_id", courseId!)
        .maybeSingle();
      if (error) throw error;
      return data as BuilderAssessment | null;
    },
  });
}

export function useBuilderQuestions(assessmentId: number | null) {
  return useQuery<BuilderQuestion[]>({
    queryKey: [QUESTIONS_KEY, assessmentId],
    enabled: !!assessmentId,
    queryFn: async () => {
      const { data, error } = await supabase
        .from("academy_assessment_questions")
        .select("id, assessment_id, question_text, question_type, options, points, sort_order, explanation")
        .eq("assessment_id", assessmentId!)
        .order("sort_order");
      if (error) throw error;
      return (data ?? []).map((q: any) => ({
        ...q,
        options: (q.options as QuestionOption[]) || [],
      }));
    },
  });
}

export function useCreateAssessment() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async ({ courseId, data }: { courseId: number; data: Record<string, any> }) => {
      const { data: { user } } = await supabase.auth.getUser();
      const { data: row, error } = await supabase
        .from("academy_assessments")
        .insert({ course_id: courseId, created_by: user?.id, ...data } as any)
        .select()
        .single();
      if (error) throw error;
      return row;
    },
    onSuccess: (_, vars) => {
      toast.success("Assessment created");
      qc.invalidateQueries({ queryKey: [ASSESSMENT_KEY, vars.courseId] });
    },
    onError: (e: any) => toast.error(e?.message || "Failed to create assessment"),
  });
}

export function useUpdateAssessment() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async ({ id, courseId, data }: { id: number; courseId: number; data: Record<string, any> }) => {
      const { error } = await supabase.from("academy_assessments").update(data as any).eq("id", id);
      if (error) throw error;
      return courseId;
    },
    onSuccess: (courseId) => {
      qc.invalidateQueries({ queryKey: [ASSESSMENT_KEY, courseId] });
    },
    onError: (e: any) => toast.error(e?.message || "Failed to update assessment"),
  });
}

export function useUpsertQuestion() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async ({ assessmentId, data }: { assessmentId: number; data: Record<string, any> }) => {
      if (data.id) {
        const { id, ...rest } = data;
        const { error } = await supabase.from("academy_assessment_questions").update(rest as any).eq("id", id);
        if (error) throw error;
      } else {
        const { error } = await supabase.from("academy_assessment_questions").insert({ assessment_id: assessmentId, ...data } as any);
        if (error) throw error;
      }
      return assessmentId;
    },
    onSuccess: (assessmentId) => {
      qc.invalidateQueries({ queryKey: [QUESTIONS_KEY, assessmentId] });
    },
    onError: (e: any) => toast.error(e?.message || "Failed to save question"),
  });
}

export function useDeleteQuestion() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async ({ id, assessmentId }: { id: number; assessmentId: number }) => {
      const { error } = await supabase.from("academy_assessment_questions").delete().eq("id", id);
      if (error) throw error;
      return assessmentId;
    },
    onSuccess: (assessmentId) => {
      toast.success("Question deleted");
      qc.invalidateQueries({ queryKey: [QUESTIONS_KEY, assessmentId] });
    },
    onError: (e: any) => toast.error(e?.message || "Failed to delete question"),
  });
}

export function useReorderQuestions() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async ({ assessmentId, orderedIds }: { assessmentId: number; orderedIds: number[] }) => {
      const updates = orderedIds.map((id, i) =>
        supabase.from("academy_assessment_questions").update({ sort_order: i + 1 } as any).eq("id", id)
      );
      await Promise.all(updates);
      return assessmentId;
    },
    onSuccess: (assessmentId) => {
      qc.invalidateQueries({ queryKey: [QUESTIONS_KEY, assessmentId] });
    },
    onError: (e: any) => toast.error(e?.message || "Failed to reorder questions"),
  });
}

export function useSaveAllQuestions() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async ({ assessmentId, questions }: { assessmentId: number; questions: BuilderQuestion[] }) => {
      for (const q of questions) {
        const payload: Record<string, any> = {
          question_text: q.question_text,
          question_type: q.question_type || "multiple_choice",
          options: q.options,
          points: q.points ?? 1,
          sort_order: q.sort_order,
          explanation: q.explanation,
        };
        if (q.id > 0) {
          const { error } = await supabase.from("academy_assessment_questions").update(payload as any).eq("id", q.id);
          if (error) throw error;
        } else {
          const { error } = await supabase.from("academy_assessment_questions").insert({ assessment_id: assessmentId, ...payload } as any);
          if (error) throw error;
        }
      }
      return assessmentId;
    },
    onSuccess: (assessmentId) => {
      toast.success("All questions saved");
      qc.invalidateQueries({ queryKey: [QUESTIONS_KEY, assessmentId] });
    },
    onError: (e: any) => toast.error(e?.message || "Failed to save questions"),
  });
}
