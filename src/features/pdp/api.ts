import { supabase } from "@/integrations/supabase/client";
import type { Database } from "@/integrations/supabase/types";
import type {
  PdpAudience,
  PdpCycle,
  PdpCycleSummary,
  PdpEvidenceItem,
  PdpEvidenceType,
  PdpGoal,
  PdpReflection,
  PdpReview,
} from "./types";

type GoalInsert = Database["public"]["Tables"]["pdp_goals"]["Insert"];
type GoalUpdate = Database["public"]["Tables"]["pdp_goals"]["Update"];
type EvidenceInsert = Database["public"]["Tables"]["pdp_evidence_items"]["Insert"];
type ReflectionInsert = Database["public"]["Tables"]["pdp_reflections"]["Insert"];

export async function listAudiences(): Promise<PdpAudience[]> {
  const { data, error } = await supabase
    .from("pdp_audiences")
    .select("*")
    .order("sort_order", { ascending: true });
  if (error) throw error;
  return data ?? [];
}

export async function getCurrentCycle(
  userId: string,
  tenantId: number | null,
): Promise<PdpCycle | null> {
  let q = supabase.from("pdp_cycles").select("*").eq("user_id", userId);
  q = tenantId === null ? q.is("tenant_id", null) : q.eq("tenant_id", tenantId);
  const { data, error } = await q
    .order("cycle_start_date", { ascending: false })
    .limit(1)
    .maybeSingle();
  if (error) throw error;
  return data ?? null;
}

export async function getCycleSummary(cycleId: number): Promise<PdpCycleSummary | null> {
  const { data, error } = await supabase
    .from("v_pdp_cycle_summary")
    .select("*")
    .eq("cycle_id", cycleId)
    .maybeSingle();
  if (error) throw error;
  return data ?? null;
}

export async function listGoals(cycleId: number): Promise<PdpGoal[]> {
  const { data, error } = await supabase
    .from("pdp_goals")
    .select("*")
    .eq("cycle_id", cycleId)
    .order("created_at", { ascending: true });
  if (error) throw error;
  return data ?? [];
}

export async function listEvidence(cycleId: number): Promise<PdpEvidenceItem[]> {
  const { data, error } = await supabase
    .from("pdp_evidence_items")
    .select("*")
    .eq("cycle_id", cycleId)
    .order("occurred_on", { ascending: false });
  if (error) throw error;
  return data ?? [];
}

export async function listReflections(cycleId: number): Promise<PdpReflection[]> {
  const { data, error } = await supabase
    .from("pdp_reflections")
    .select("*")
    .eq("cycle_id", cycleId)
    .order("created_at", { ascending: false });
  if (error) throw error;
  return data ?? [];
}

export async function listReviews(cycleId: number): Promise<PdpReview[]> {
  const { data, error } = await supabase
    .from("pdp_reviews")
    .select("*")
    .eq("cycle_id", cycleId)
    .order("created_at", { ascending: true });
  if (error) throw error;
  return data ?? [];
}

export type CreateCycleInput = Pick<
  PdpCycle,
  | "user_id"
  | "tenant_id"
  | "audience_code"
  | "cycle_year"
  | "cycle_start_date"
  | "cycle_end_date"
  | "target_pd_hours"
>;

export async function createCycle(input: CreateCycleInput): Promise<PdpCycle> {
  const { data, error } = await supabase
    .from("pdp_cycles")
    .insert(input)
    .select("*")
    .single();
  if (error) throw error;
  return data;
}

export type UpsertGoalInput = Partial<PdpGoal> & { cycle_id: number; title: string };

export async function upsertGoal(input: UpsertGoalInput): Promise<PdpGoal> {
  if (typeof input.id === "number") {
    const { id, ...rest } = input;
    const { data, error } = await supabase
      .from("pdp_goals")
      .update(rest as GoalUpdate)
      .eq("id", id)
      .select("*")
      .single();
    if (error) throw error;
    return data;
  }
  const { id: _omit, ...insertRest } = input;
  const { data, error } = await supabase
    .from("pdp_goals")
    .insert(insertRest as GoalInsert)
    .select("*")
    .single();
  if (error) throw error;
  return data;
}

export type LogEvidenceInput = Partial<PdpEvidenceItem> & {
  cycle_id: number;
  evidence_type: PdpEvidenceType;
  title: string;
  occurred_on: string;
};

export async function logEvidence(input: LogEvidenceInput): Promise<PdpEvidenceItem> {
  const { id: _omit, ...rest } = input;
  const { data, error } = await supabase
    .from("pdp_evidence_items")
    .insert(rest as EvidenceInsert)
    .select("*")
    .single();
  if (error) throw error;
  return data;
}

export type AddReflectionInput = {
  cycle_id?: number;
  lesson_progress_id?: number;
  evidence_item_id?: number;
  prompt?: string;
  response: string;
};

export async function addReflection(input: AddReflectionInput): Promise<PdpReflection> {
  const { data: userData, error: userErr } = await supabase.auth.getUser();
  if (userErr) throw userErr;
  const userId = userData.user?.id;
  if (!userId) throw new Error("Not authenticated");

  const payload: ReflectionInsert = { ...input, user_id: userId };
  const { data, error } = await supabase
    .from("pdp_reflections")
    .insert(payload)
    .select("*")
    .single();
  if (error) throw error;
  return data;
}


export async function signOffReview(reviewId: number): Promise<PdpReview> {
  const { data: userData, error: userErr } = await supabase.auth.getUser();
  if (userErr) throw userErr;
  const userId = userData.user?.id;
  if (!userId) throw new Error("Not authenticated");

  const { data, error } = await supabase
    .from("pdp_reviews")
    .update({ signed_off_at: new Date().toISOString(), signed_off_by: userId })
    .eq("id", reviewId)
    .select("*")
    .single();
  if (error) throw error;
  return data;
}
