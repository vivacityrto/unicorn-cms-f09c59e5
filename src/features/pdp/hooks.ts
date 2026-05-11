import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { toast } from "sonner";
import { supabase } from "@/integrations/supabase/client";
import {
  addReflection,
  createCycle,
  getCurrentCycle,
  getCycleSummary,
  listAudiences,
  listEvidence,
  listGoals,
  listReflections,
  listReviews,
  logEvidence,
  signOffReview,
  upsertGoal,
  type AddReflectionInput,
  type CreateCycleInput,
  type LogEvidenceInput,
  type UpsertGoalInput,
} from "./api";
import type {
  PdpAudience,
  PdpCycle,
  PdpCycleSummary,
  PdpEvidenceItem,
  PdpGoal,
  PdpReflection,
  PdpReview,
  PdpUserCurrency,
} from "./types";

const PDP_KEY = "pdp" as const;

export function useAudiences() {
  return useQuery<PdpAudience[]>({
    queryKey: [PDP_KEY, "audiences"],
    queryFn: () => listAudiences(),
  });
}

export function useCurrentCycle(userId: string | null | undefined, tenantId: number | null) {
  return useQuery<PdpCycle | null>({
    queryKey: [PDP_KEY, "current-cycle", userId ?? null, tenantId],
    queryFn: () => getCurrentCycle(userId as string, tenantId),
    enabled: !!userId,
  });
}

export function useCycleSummary(cycleId: number | null | undefined) {
  return useQuery<PdpCycleSummary | null>({
    queryKey: [PDP_KEY, "cycle-summary", cycleId ?? null],
    queryFn: () => getCycleSummary(cycleId as number),
    enabled: !!cycleId,
  });
}

export function useGoals(cycleId: number | null | undefined) {
  return useQuery<PdpGoal[]>({
    queryKey: [PDP_KEY, "goals", cycleId ?? null],
    queryFn: () => listGoals(cycleId as number),
    enabled: !!cycleId,
  });
}

export function useEvidence(cycleId: number | null | undefined) {
  return useQuery<PdpEvidenceItem[]>({
    queryKey: [PDP_KEY, "evidence", cycleId ?? null],
    queryFn: () => listEvidence(cycleId as number),
    enabled: !!cycleId,
  });
}

export function useReflections(cycleId: number | null | undefined) {
  return useQuery<PdpReflection[]>({
    queryKey: [PDP_KEY, "reflections", cycleId ?? null],
    queryFn: () => listReflections(cycleId as number),
    enabled: !!cycleId,
  });
}

export function useReviews(cycleId: number | null | undefined) {
  return useQuery<PdpReview[]>({
    queryKey: [PDP_KEY, "reviews", cycleId ?? null],
    queryFn: () => listReviews(cycleId as number),
    enabled: !!cycleId,
  });
}

export function useUserCurrency(userId: string | null | undefined) {
  return useQuery<PdpUserCurrency | null>({
    queryKey: [PDP_KEY, "currency", userId ?? null],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("v_pdp_user_currency")
        .select("*")
        .eq("user_id", userId as string)
        .order("cycle_year", { ascending: false })
        .limit(1)
        .maybeSingle();
      if (error) throw error;
      return data ?? null;
    },
    enabled: !!userId,
  });
}

export interface RecommendedCourse {
  id: number;
  slug: string;
  title: string;
  short_description: string | null;
  estimated_minutes: number | null;
  target_audience: string[] | null;
}

export function useRecommendedAcademyCourses(
  audienceCode: string | null | undefined,
  userId: string | null | undefined,
) {
  return useQuery<RecommendedCourse[]>({
    queryKey: [PDP_KEY, "recommended-courses", audienceCode ?? null, userId ?? null],
    queryFn: async () => {
      if (!audienceCode || !userId) return [];

      const [coursesRes, enrolRes] = await Promise.all([
        supabase
          .from("academy_courses")
          .select("id, slug, title, short_description, estimated_minutes, target_audience")
          .eq("status", "published")
          .contains("target_audience", [audienceCode])
          .order("sort_order", { ascending: true })
          .limit(24),
        supabase.from("academy_enrollments").select("course_id").eq("user_id", userId),
      ]);

      if (coursesRes.error) throw coursesRes.error;
      if (enrolRes.error) throw enrolRes.error;

      const enrolled = new Set((enrolRes.data ?? []).map((r) => r.course_id));
      return (coursesRes.data ?? [])
        .filter((c) => !enrolled.has(c.id))
        .slice(0, 6) as RecommendedCourse[];
    },
    enabled: !!audienceCode && !!userId,
  });
}

export function useStartAcademyCourseFromPdp(userId: string | null | undefined) {
  const qc = useQueryClient();
  return useMutation<void, Error, number>({
    mutationFn: async (courseId) => {
      if (!userId) throw new Error("Not authenticated");
      const { error } = await supabase.from("academy_enrollments").insert({
        course_id: courseId,
        user_id: userId,
        source: "pdp_recommendation",
        status: "active",
      });
      if (error) throw error;
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: [PDP_KEY, "recommended-courses"] });
      toast.success("Enrolled — go to My Courses to start");
    },
    onError: (err) => toast.error(err.message ?? "Failed to start course"),
  });
}

export function useCreateCycle() {
  const qc = useQueryClient();
  return useMutation<PdpCycle, Error, CreateCycleInput>({
    mutationFn: (input) => createCycle(input),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: [PDP_KEY, "current-cycle"] });
      qc.invalidateQueries({ queryKey: [PDP_KEY, "currency"] });
    },
    onError: (err) => toast.error(err.message ?? "Failed to create PDP cycle"),
  });
}

export function useUpsertGoal(cycleId: number | null | undefined) {
  const qc = useQueryClient();
  return useMutation<PdpGoal, Error, UpsertGoalInput>({
    mutationFn: (input) => upsertGoal(input),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: [PDP_KEY, "goals", cycleId ?? null] });
      qc.invalidateQueries({ queryKey: [PDP_KEY, "cycle-summary", cycleId ?? null] });
    },
    onError: (err) => toast.error(err.message ?? "Failed to save goal"),
  });
}

export function useLogEvidence(cycleId: number | null | undefined) {
  const qc = useQueryClient();
  return useMutation<PdpEvidenceItem, Error, LogEvidenceInput>({
    mutationFn: (input) => logEvidence(input),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: [PDP_KEY, "evidence", cycleId ?? null] });
      qc.invalidateQueries({ queryKey: [PDP_KEY, "cycle-summary", cycleId ?? null] });
    },
    onError: (err) => toast.error(err.message ?? "Failed to log evidence"),
  });
}

export function useAddReflection(cycleId: number | null | undefined) {
  const qc = useQueryClient();
  return useMutation<PdpReflection, Error, AddReflectionInput>({
    mutationFn: (input) => addReflection(input),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: [PDP_KEY, "reflections", cycleId ?? null] });
    },
    onError: (err) => toast.error(err.message ?? "Failed to add reflection"),
  });
}

export function useSignOffReview(cycleId: number | null | undefined) {
  const qc = useQueryClient();
  return useMutation<PdpReview, Error, number>({
    mutationFn: (reviewId) => signOffReview(reviewId),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: [PDP_KEY, "reviews", cycleId ?? null] });
      qc.invalidateQueries({ queryKey: [PDP_KEY, "cycle-summary", cycleId ?? null] });
    },
    onError: (err) => toast.error(err.message ?? "Failed to sign off review"),
  });
}
