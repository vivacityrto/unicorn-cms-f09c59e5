/**
 * pdp-auto-evidence
 *
 * Triggered by an AFTER UPDATE trigger on academy_enrollments via pg_net when
 * status flips to 'completed'. Idempotently creates a verified PDP evidence
 * row (and an additional row for the issued certificate if present), opening
 * a current-year cycle for the learner if necessary.
 *
 * Body:  { enrollment_id: number }
 * Auth:  service-role JWT from the trigger (system mode) OR a user JWT.
 */

import { corsHeaders } from "../_shared/cors.ts";
import { createServiceClient, createUserClient } from "../_shared/supabase-client.ts";
import { z } from "npm:zod";

const BodySchema = z.object({
  enrollment_id: z.number().int().positive(),
});

interface EnrollmentRow {
  id: number;
  user_id: string;
  tenant_id: number | null;
  course_id: number;
  status: string | null;
  completed_at: string | null;
}

interface CourseRow {
  id: number;
  title: string;
  estimated_minutes: number | null;
}

interface CertificateRow {
  id: number;
  enrollment_id: number;
  issued_at: string | null;
}

interface CycleRow {
  id: number;
  user_id: string;
  tenant_id: number | null;
  cycle_year: number;
  audience_code: string;
  status: string | null;
}

// Mapping from staff classification (users.unicorn_role / users.role) to a
// pdp_audiences.code. Anything unmatched falls back to 'trainer' and the
// rationale is stamped in the cycle notes for a manager to correct later.
const AUDIENCE_MAP: Record<string, string> = {
  trainer: "trainer",
  "training manager": "trainer",
  "compliance manager": "compliance_manager",
  compliance: "compliance_manager",
  "governing person": "governance_person",
  governance: "governance_person",
  "student support officer": "student_support_officer",
  "student support": "student_support_officer",
  administration: "administration_assistant",
  "administration assistant": "administration_assistant",
  admin: "administration_assistant",
};

function jsonResponse(req: Request, status: number, body: Record<string, unknown>): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: { ...corsHeaders(req), "Content-Type": "application/json" },
  });
}

function deriveAudience(role: string | null | undefined): { code: string; matched: boolean } {
  const key = (role ?? "").trim().toLowerCase();
  const match = AUDIENCE_MAP[key];
  if (match) return { code: match, matched: true };
  return { code: "trainer", matched: false };
}

function todayInSydney(): { year: number; isoDate: string; endIsoDate: string } {
  const now = new Date();
  const fmt = new Intl.DateTimeFormat("en-CA", {
    timeZone: "Australia/Sydney",
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  });
  const parts = fmt.formatToParts(now);
  const y = Number(parts.find((p) => p.type === "year")?.value ?? "0");
  const m = Number(parts.find((p) => p.type === "month")?.value ?? "1");
  const d = Number(parts.find((p) => p.type === "day")?.value ?? "1");
  const isoDate = `${y.toString().padStart(4, "0")}-${m.toString().padStart(2, "0")}-${d.toString().padStart(2, "0")}`;
  // +12 months
  const endY = m === 12 ? y + 1 : y;
  const endM = m === 12 ? 1 : m + 1;
  // Use a simple +12 months by reusing same month next year for stability.
  const stableEndY = y + 1;
  const stableEndM = m;
  const stableEndD = Math.min(d, 28); // avoid Feb 29 edge case
  const endIsoDate = `${stableEndY.toString().padStart(4, "0")}-${stableEndM
    .toString()
    .padStart(2, "0")}-${stableEndD.toString().padStart(2, "0")}`;
  // (endY/endM are intentionally unused; kept stable scheme above.)
  void endY;
  void endM;
  return { year: y, isoDate, endIsoDate };
}

Deno.serve(async (req: Request): Promise<Response> => {
  if (req.method === "OPTIONS") {
    return new Response("ok", { headers: corsHeaders(req) });
  }
  if (req.method !== "POST") {
    return jsonResponse(req, 405, { error: "method_not_allowed" });
  }

  // ---- Validate body ----
  let raw: unknown;
  try {
    raw = await req.json();
  } catch {
    return jsonResponse(req, 400, { error: "invalid_json" });
  }
  const parsed = BodySchema.safeParse(raw);
  if (!parsed.success) {
    return jsonResponse(req, 400, { error: "invalid_body", details: parsed.error.flatten() });
  }
  const { enrollment_id } = parsed.data;

  const authHeader = req.headers.get("Authorization");
  const service = createServiceClient();

  // ---- Identity resolution ----
  // Postgres trigger calls with service-role JWT (no `sub`). For real users
  // we resolve auth.uid() via the user client and authorise.
  let actorUserId: string | null = null;
  let mode: "system" | "user" = "system";
  let callerIsVivacityStaff = false;

  if (authHeader) {
    try {
      const userClient = createUserClient(authHeader);
      const { data: userData } = await userClient.auth.getUser();
      const uid = userData.user?.id ?? null;
      if (uid) {
        actorUserId = uid;
        mode = "user";
        const { data: profile } = await service
          .from("users")
          .select("unicorn_role")
          .eq("user_uuid", uid)
          .maybeSingle();
        const role = profile?.unicorn_role ?? null;
        callerIsVivacityStaff =
          role === "Super Admin" || role === "Team Leader" || role === "Team Member";
      }
    } catch (err) {
      console.error("[pdp-auto-evidence] auth resolution failed:", err);
    }
  }

  // ---- Load enrollment (admin read; needed for system mode and cross-user staff) ----
  const { data: enrollment, error: enrErr } = await service
    .from("academy_enrollments")
    .select("id, user_id, tenant_id, course_id, status, completed_at")
    .eq("id", enrollment_id)
    .maybeSingle<EnrollmentRow>();

  if (enrErr) {
    console.error("[pdp-auto-evidence] enrollment fetch error:", enrErr);
    return jsonResponse(req, 500, { error: "enrollment_fetch_failed" });
  }
  if (!enrollment) {
    return jsonResponse(req, 404, { error: "enrollment_not_found" });
  }
  if (enrollment.status !== "completed") {
    return jsonResponse(req, 200, { skipped: "not_completed" });
  }

  // ---- Authorisation for direct user calls ----
  if (mode === "user" && actorUserId !== enrollment.user_id && !callerIsVivacityStaff) {
    return jsonResponse(req, 403, { error: "forbidden" });
  }

  // System-mode actor = the learner (mirrors complete_academy_enrollment).
  const actor = actorUserId ?? enrollment.user_id;

  // ---- Idempotency pre-check ----
  const { data: existing, error: existingErr } = await service
    .from("pdp_evidence_items")
    .select("id")
    .eq("source_enrollment_id", enrollment.id)
    .eq("evidence_type", "academy_completion")
    .maybeSingle<{ id: number }>();

  if (existingErr) {
    console.error("[pdp-auto-evidence] idempotency lookup error:", existingErr);
    return jsonResponse(req, 500, { error: "idempotency_lookup_failed" });
  }
  if (existing) {
    return jsonResponse(req, 200, {
      evidence_item_id: existing.id,
      skipped: "duplicate",
      mode,
    });
  }

  // ---- Resolve cycle ----
  const { year: currentYear, isoDate: today, endIsoDate: endDate } = todayInSydney();

  let cycleQuery = service
    .from("pdp_cycles")
    .select("id, user_id, tenant_id, cycle_year, audience_code, status")
    .eq("user_id", enrollment.user_id)
    .eq("cycle_year", currentYear);
  cycleQuery =
    enrollment.tenant_id === null
      ? cycleQuery.is("tenant_id", null)
      : cycleQuery.eq("tenant_id", enrollment.tenant_id);

  const { data: cycleHit, error: cycleErr } = await cycleQuery
    .order("id", { ascending: false })
    .limit(1)
    .maybeSingle<CycleRow>();

  if (cycleErr) {
    console.error("[pdp-auto-evidence] cycle lookup error:", cycleErr);
    return jsonResponse(req, 500, { error: "cycle_lookup_failed" });
  }

  let cycleId: number;
  let cycleAudienceCode: string;

  if (cycleHit) {
    cycleId = cycleHit.id;
    cycleAudienceCode = cycleHit.audience_code;
  } else {
    // Derive audience from the user's role
    const { data: userProfile } = await service
      .from("users")
      .select("unicorn_role, role")
      .eq("user_uuid", enrollment.user_id)
      .maybeSingle<{ unicorn_role: string | null; role: string | null }>();

    const roleSource = userProfile?.unicorn_role ?? userProfile?.role ?? null;
    const { code: audienceCode, matched } = deriveAudience(roleSource);
    cycleAudienceCode = audienceCode;

    const { data: audienceRow, error: audErr } = await service
      .from("pdp_audiences")
      .select("code, target_pd_hours_default")
      .eq("code", audienceCode)
      .maybeSingle<{ code: string; target_pd_hours_default: number | null }>();
    if (audErr) {
      console.error("[pdp-auto-evidence] audience lookup error:", audErr);
      return jsonResponse(req, 500, { error: "audience_lookup_failed" });
    }
    const targetHours = audienceRow?.target_pd_hours_default ?? 20;

    const cycleNotes = matched
      ? null
      : `Audience auto-defaulted to '${audienceCode}' by pdp-auto-evidence (no mapping for role '${roleSource ?? "unknown"}'). Review and adjust if needed.`;

    const { data: newCycle, error: insCycleErr } = await service
      .from("pdp_cycles")
      .insert({
        user_id: enrollment.user_id,
        tenant_id: enrollment.tenant_id,
        audience_code: audienceCode,
        cycle_year: currentYear,
        cycle_start_date: today,
        cycle_end_date: endDate,
        target_pd_hours: targetHours,
        status: "active",
        opened_at: new Date().toISOString(),
        opened_by: actor,
        notes: cycleNotes,
      })
      .select("id")
      .single<{ id: number }>();
    if (insCycleErr || !newCycle) {
      console.error("[pdp-auto-evidence] cycle insert error:", insCycleErr);
      return jsonResponse(req, 500, { error: "cycle_insert_failed" });
    }
    cycleId = newCycle.id;
  }
  void cycleAudienceCode;

  // ---- Resolve course + duration ----
  const { data: course, error: courseErr } = await service
    .from("academy_courses")
    .select("id, title, estimated_minutes")
    .eq("id", enrollment.course_id)
    .maybeSingle<CourseRow>();
  if (courseErr || !course) {
    console.error("[pdp-auto-evidence] course fetch error:", courseErr);
    return jsonResponse(req, 500, { error: "course_fetch_failed" });
  }

  // Primary: sum of estimated_minutes across published lessons for this course.
  // Fallback: academy_courses.estimated_minutes only when the lesson sum is 0/null.
  // Final: NULL when both sources are 0/null.
  let durationMinutes: number | null = null;
  const { data: lessons, error: lessErr } = await service
    .from("academy_lessons")
    .select("estimated_minutes")
    .eq("course_id", enrollment.course_id)
    .eq("is_published", true);
  if (lessErr) {
    console.error("[pdp-auto-evidence] lessons fetch error:", lessErr);
  }
  const lessonSum = (lessons ?? []).reduce(
    (acc: number, l: { estimated_minutes: number | null }) =>
      acc + (l.estimated_minutes ?? 0),
    0,
  );
  if (lessonSum > 0) {
    durationMinutes = lessonSum;
  } else if (course.estimated_minutes && course.estimated_minutes > 0) {
    durationMinutes = course.estimated_minutes;
  }

  const occurredOn = enrollment.completed_at
    ? enrollment.completed_at.slice(0, 10)
    : today;

  // ---- Insert primary completion evidence ----
  let evidenceItemId: number;
  {
    const { data: inserted, error: insErr } = await service
      .from("pdp_evidence_items")
      .insert({
        cycle_id: cycleId,
        evidence_type: "academy_completion",
        title: course.title,
        occurred_on: occurredOn,
        duration_minutes: durationMinutes,
        source_enrollment_id: enrollment.id,
        status: "verified",
        verified_by: actor,
        verified_at: new Date().toISOString(),
        created_by: actor,
        is_formal: true,
        is_industry_currency: false,
      })
      .select("id")
      .single<{ id: number }>();

    if (insErr) {
      // Race: another invocation won. Re-fetch and treat as duplicate.
      if (insErr.code === "23505") {
        const { data: dup } = await service
          .from("pdp_evidence_items")
          .select("id")
          .eq("source_enrollment_id", enrollment.id)
          .eq("evidence_type", "academy_completion")
          .maybeSingle<{ id: number }>();
        if (dup) {
          return jsonResponse(req, 200, {
            evidence_item_id: dup.id,
            skipped: "duplicate_race",
            mode,
          });
        }
      }
      console.error("[pdp-auto-evidence] evidence insert error:", insErr);
      return jsonResponse(req, 500, { error: "evidence_insert_failed" });
    }
    evidenceItemId = inserted!.id;
  }

  // ---- Optional certificate evidence ----
  let certificateEvidenceId: number | null = null;
  const { data: certificate, error: certErr } = await service
    .from("academy_certificates")
    .select("id, enrollment_id, issued_at")
    .eq("enrollment_id", enrollment.id)
    .maybeSingle<CertificateRow>();
  if (certErr) {
    console.error("[pdp-auto-evidence] certificate lookup error:", certErr);
  } else if (certificate) {
    const { data: certDup } = await service
      .from("pdp_evidence_items")
      .select("id")
      .eq("source_certificate_id", certificate.id)
      .eq("evidence_type", "academy_certificate")
      .maybeSingle<{ id: number }>();

    if (certDup) {
      certificateEvidenceId = certDup.id;
    } else {
      const certOccurred = certificate.issued_at
        ? certificate.issued_at.slice(0, 10)
        : occurredOn;
      const { data: certIns, error: certInsErr } = await service
        .from("pdp_evidence_items")
        .insert({
          cycle_id: cycleId,
          evidence_type: "academy_certificate",
          title: `${course.title} — Certificate`,
          occurred_on: certOccurred,
          duration_minutes: null,
          source_certificate_id: certificate.id,
          status: "verified",
          verified_by: actor,
          verified_at: new Date().toISOString(),
          created_by: actor,
          is_formal: true,
          is_industry_currency: false,
        })
        .select("id")
        .single<{ id: number }>();
      if (certInsErr) {
        if (certInsErr.code !== "23505") {
          console.error("[pdp-auto-evidence] certificate evidence insert error:", certInsErr);
        }
      } else if (certIns) {
        certificateEvidenceId = certIns.id;
      }
    }
  }

  // ---- Audit row (audit_events.entity_id is strict uuid; store bigint in details) ----
  try {
    await service.from("audit_events").insert({
      entity: "pdp_evidence_items",
      entity_id: crypto.randomUUID(),
      action: "auto_created_from_academy_completion",
      user_id: actor,
      details: {
        source: "pdp-auto-evidence",
        mode,
        evidence_item_id: evidenceItemId,
        certificate_evidence_id: certificateEvidenceId,
        enrollment_id: enrollment.id,
        course_id: enrollment.course_id,
        cycle_id: cycleId,
      },
    });
  } catch (err) {
    console.error("[pdp-auto-evidence] audit insert error:", err);
  }

  return jsonResponse(req, 200, {
    evidence_item_id: evidenceItemId,
    certificate_evidence_id: certificateEvidenceId,
    cycle_id: cycleId,
    mode,
  });
});
