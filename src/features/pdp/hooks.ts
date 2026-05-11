import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { toast } from "sonner";
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

export function useCreateCycle() {
  const qc = useQueryClient();
  return useMutation<PdpCycle, Error, CreateCycleInput>({
    mutationFn: (input) => createCycle(input),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: [PDP_KEY, "current-cycle"] });
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
