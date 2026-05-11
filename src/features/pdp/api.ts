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
type EvidenceUpdate = Database["public"]["Tables"]["pdp_evidence_items"]["Update"];
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
  let payload: EvidenceInsert = rest as EvidenceInsert;
  if (!payload.created_by) {
    const { data: userData } = await supabase.auth.getUser();
    if (userData.user?.id) payload = { ...payload, created_by: userData.user.id };
  }
  const { data, error } = await supabase
    .from("pdp_evidence_items")
    .insert(payload)
    .select("*")
    .single();
  if (error) throw error;
  return data;
}

export type UpdateEvidenceInput = Partial<PdpEvidenceItem> & { id: number };

export async function updateEvidence(input: UpdateEvidenceInput): Promise<PdpEvidenceItem> {
  const { id, ...rest } = input;
  const { data, error } = await supabase
    .from("pdp_evidence_items")
    .update(rest as EvidenceUpdate)
    .eq("id", id)
    .select("*")
    .single();
  if (error) throw error;
  return data;
}

export async function signEvidenceDocument(path: string): Promise<string> {
  const { data, error } = await supabase.storage
    .from("academy-evidence")
    .createSignedUrl(path, 60);
  if (error) throw error;
  return data.signedUrl;
}

export type UserAcademyEnrollment = {
  id: number;
  course_id: number;
  completed_at: string | null;
  course: { id: number; title: string; estimated_minutes: number | null } | null;
  certificate: { id: number; certificate_number: string | null } | null;
};

export async function listUserAcademyEnrollments(
  userId: string,
): Promise<UserAcademyEnrollment[]> {
  const { data, error } = await supabase
    .from("academy_enrollments")
    .select(
      `id, course_id, completed_at,
       course:academy_courses!course_id ( id, title, estimated_minutes ),
       certificate:academy_certificates!enrollment_id ( id, certificate_number )`,
    )
    .eq("user_id", userId)
    .eq("status", "completed")
    .order("completed_at", { ascending: false });
  if (error) throw error;
  return (data ?? []).map((row) => {
    const certRaw = (row as { certificate: unknown }).certificate;
    const cert = Array.isArray(certRaw) ? certRaw[0] ?? null : certRaw ?? null;
    const courseRaw = (row as { course: unknown }).course;
    const course = Array.isArray(courseRaw) ? courseRaw[0] ?? null : courseRaw ?? null;
    return {
      id: row.id as number,
      course_id: row.course_id as number,
      completed_at: row.completed_at as string | null,
      course: course as UserAcademyEnrollment["course"],
      certificate: cert as UserAcademyEnrollment["certificate"],
    };
  });
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


export async function getCycleById(cycleId: number): Promise<PdpCycle | null> {
  const { data, error } = await supabase
    .from("pdp_cycles")
    .select("*")
    .eq("id", cycleId)
    .maybeSingle();
  if (error) throw error;
  return data ?? null;
}

export type UpdateCycleInput = {
  cycleId: number;
  target_pd_hours?: number;
  cycle_end_date?: string;
  notes?: string | null;
};

export async function updateCycle(input: UpdateCycleInput): Promise<PdpCycle> {
  const { cycleId, ...rest } = input;
  const { data, error } = await supabase
    .from("pdp_cycles")
    .update(rest)
    .eq("id", cycleId)
    .select("*")
    .single();
  if (error) throw error;
  return data;
}

export async function closeCycle(cycleId: number, outcomeNotes: string): Promise<PdpCycle> {
  const { data: userData, error: userErr } = await supabase.auth.getUser();
  if (userErr) throw userErr;
  const userId = userData.user?.id;
  if (!userId) throw new Error("Not authenticated");

  const { data: existing } = await supabase
    .from("pdp_cycles")
    .select("notes")
    .eq("id", cycleId)
    .maybeSingle();
  const prior = existing?.notes ? `${existing.notes}\n\n` : "";
  const stamped = `[Closed ${new Date().toISOString().slice(0, 10)}] ${outcomeNotes}`;

  const { data, error } = await supabase
    .from("pdp_cycles")
    .update({
      status: "completed",
      completed_at: new Date().toISOString(),
      completed_by: userId,
      notes: `${prior}${stamped}`,
    })
    .eq("id", cycleId)
    .select("*")
    .single();
  if (error) throw error;
  return data;
}

export async function deleteGoal(goalId: number): Promise<void> {
  const { error } = await supabase.from("pdp_goals").delete().eq("id", goalId);
  if (error) throw error;
}

export type StandardRef = {
  id: string;
  framework: string;
  code: string;
  title: string;
};

export async function listStandardsReference(ids: string[]): Promise<StandardRef[]> {
  if (!ids.length) return [];
  const { data, error } = await supabase
    .from("standards_reference")
    .select("id, framework, code, title")
    .in("id", ids);
  if (error) throw error;
  return (data ?? []) as StandardRef[];
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

// ===== Manager review hub =====

export type ManagerCycleReviewee = {
  user_uuid: string;
  first_name: string | null;
  last_name: string | null;
  email: string | null;
} | null;

export type ManagerCycle = PdpCycle & { user: ManagerCycleReviewee };

export async function listManagerCycles(managerId: string): Promise<ManagerCycle[]> {
  const { data: cycles, error } = await supabase
    .from("pdp_cycles")
    .select("*")
    .eq("manager_id", managerId)
    .order("cycle_end_date", { ascending: true });
  if (error) throw error;
  const rows = cycles ?? [];
  if (rows.length === 0) return [];

  const userIds = Array.from(new Set(rows.map((r) => r.user_id)));
  const { data: users } = await supabase
    .from("users")
    .select("user_uuid, first_name, last_name, email")
    .in("user_uuid", userIds);
  const byId = new Map<string, ManagerCycleReviewee>();
  (users ?? []).forEach((u) => {
    byId.set(u.user_uuid as string, {
      user_uuid: u.user_uuid as string,
      first_name: (u.first_name as string | null) ?? null,
      last_name: (u.last_name as string | null) ?? null,
      email: (u.email as string | null) ?? null,
    });
  });
  return rows.map((c) => ({ ...(c as PdpCycle), user: byId.get(c.user_id) ?? null }));
}

export async function listEndCycleReviewIds(cycleIds: number[]): Promise<number[]> {
  if (!cycleIds.length) return [];
  const { data, error } = await supabase
    .from("pdp_reviews")
    .select("cycle_id")
    .in("cycle_id", cycleIds)
    .eq("review_type", "end_cycle");
  if (error) throw error;
  return Array.from(new Set((data ?? []).map((r) => r.cycle_id as number)));
}

export type CreateReviewInput = {
  cycle_id: number;
  review_type: "mid_cycle" | "end_cycle" | "ad_hoc";
  notes?: string | null;
  outcome?: "on_track" | "needs_action" | "completed" | "not_completed" | null;
  review_date?: string;
};

export async function createReview(input: CreateReviewInput): Promise<PdpReview> {
  const { data: userData, error: userErr } = await supabase.auth.getUser();
  if (userErr) throw userErr;
  const reviewerId = userData.user?.id;
  if (!reviewerId) throw new Error("Not authenticated");

  const reviewDate = input.review_date ?? new Date().toISOString().slice(0, 10);
  const payload = {
    cycle_id: input.cycle_id,
    review_type: input.review_type,
    reviewer_id: reviewerId,
    review_date: reviewDate,
    notes: input.notes ?? null,
    outcome: input.outcome ?? null,
  };
  const { data, error } = await supabase
    .from("pdp_reviews")
    .insert(payload)
    .select("*")
    .single();
  if (error) throw error;
  return data;
}
