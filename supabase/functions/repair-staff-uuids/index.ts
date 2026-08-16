// supabase/functions/repair-staff-uuids/index.ts
//
// SuperAdmin-only sweep: realigns public.users.user_uuid with auth.users.id
// for every staff/user whose authentication account was re-provisioned.
//
// Relies on ON UPDATE CASCADE on all 108 FKs referencing users(user_uuid).
//
// Query params:
//   ?dry_run=true   read-only; returns the same plan without any UPDATEs.

import { createClient } from "https://esm.sh/@supabase/supabase-js@2.45.0";
import { corsHeaders } from "../_shared/cors.ts";

const SUPABASE_URL = Deno.env.get("SUPABASE_URL")!;
const SERVICE_ROLE_KEY = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;

interface SweepDetail {
  email: string;
  old_uuid: string;
  new_uuid: string | null;
  outcome:
    | "relinked"
    | "already_aligned"
    | "orphan_no_auth"
    | "collision"
    | "error";
  message?: string;
}

function json(req: Request, status: number, body: unknown) {
  return new Response(JSON.stringify(body), {
    status,
    headers: { ...corsHeaders(req), "Content-Type": "application/json" },
  });
}

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") {
    return new Response("ok", { headers: corsHeaders(req) });
  }

  try {
    // ---- Authentication / authorization ----
    const authHeader = req.headers.get("Authorization") ?? "";
    const token = authHeader.toLowerCase().startsWith("bearer ")
      ? authHeader.slice(7)
      : null;

    if (!token) {
      return json(req, 401, { ok: false, code: "UNAUTHORIZED", detail: "Missing bearer token" });
    }

    const admin = createClient(SUPABASE_URL, SERVICE_ROLE_KEY, {
      auth: { persistSession: false, autoRefreshToken: false },
    });

    const { data: userResult, error: userErr } = await admin.auth.getUser(token);
    if (userErr || !userResult?.user) {
      return json(req, 401, { ok: false, code: "UNAUTHORIZED", detail: userErr?.message ?? "Invalid token" });
    }
    const callerId = userResult.user.id;

    const { data: callerProfile, error: profileErr } = await admin
      .from("users")
      .select("user_uuid, unicorn_role, email")
      .eq("user_uuid", callerId)
      .maybeSingle();

    if (profileErr || !callerProfile) {
      return json(req, 403, { ok: false, code: "FORBIDDEN", detail: "Caller profile not found" });
    }
    if (callerProfile.unicorn_role !== "Super Admin") {
      return json(req, 403, { ok: false, code: "FORBIDDEN", detail: "Super Admin access required" });
    }

    // ---- Mode ----
    const url = new URL(req.url);
    const dryRun = url.searchParams.get("dry_run") === "true";

    // ---- Step 1: load all auth users into an email map ----
    const authByEmail = new Map<string, string>();
    let page = 1;
    const perPage = 1000;
    while (true) {
      const { data, error } = await admin.auth.admin.listUsers({ page, perPage });
      if (error) {
        return json(req, 500, { ok: false, code: "AUTH_LIST_FAILED", detail: error.message });
      }
      const users = data?.users ?? [];
      for (const u of users) {
        if (u.email) authByEmail.set(u.email.toLowerCase(), u.id);
      }
      if (users.length < perPage) break;
      page++;
      if (page > 50) break; // safety guard
    }

    // ---- Step 2: load all public.users rows ----
    const { data: profiles, error: profilesErr } = await admin
      .from("users")
      .select("user_uuid, email, unicorn_role, disabled, archived");

    if (profilesErr) {
      return json(req, 500, { ok: false, code: "PROFILES_LOAD_FAILED", detail: profilesErr.message });
    }

    // ---- Step 3: classify ----
    const summary = {
      scanned: 0,
      relinked: 0,
      already_aligned: 0,
      orphan_no_auth: 0,
      collisions: 0,
      errors: 0,
    };
    const details: SweepDetail[] = [];

    // pre-build map: which user_uuids exist in public.users (for collision check)
    const profileUuids = new Set<string>();
    for (const p of profiles ?? []) {
      if (p.user_uuid) profileUuids.add(p.user_uuid);
    }

    for (const row of profiles ?? []) {
      summary.scanned++;
      if (!row.email || !row.user_uuid) continue;

      const targetAuthId = authByEmail.get(row.email.toLowerCase());

      if (!targetAuthId) {
        summary.orphan_no_auth++;
        details.push({
          email: row.email,
          old_uuid: row.user_uuid,
          new_uuid: null,
          outcome: "orphan_no_auth",
          message: "No auth.users row matches this email yet",
        });
        continue;
      }

      if (targetAuthId === row.user_uuid) {
        summary.already_aligned++;
        // do not push detail to keep response size manageable
        continue;
      }

      // Collision: another public.users row already at targetAuthId
      if (profileUuids.has(targetAuthId)) {
        summary.collisions++;
        details.push({
          email: row.email,
          old_uuid: row.user_uuid,
          new_uuid: targetAuthId,
          outcome: "collision",
          message: "Another users row already exists at the target auth uuid",
        });
        continue;
      }

      // ---- Relink candidate ----
      if (dryRun) {
        summary.relinked++; // would be relinked
        details.push({
          email: row.email,
          old_uuid: row.user_uuid,
          new_uuid: targetAuthId,
          outcome: "relinked",
          message: "DRY RUN — no change written",
        });
        continue;
      }

      // 1. Insert history row first
      const { error: histErr } = await admin
        .from("user_uuid_history")
        .insert({
          old_uuid: row.user_uuid,
          new_uuid: targetAuthId,
          email: row.email,
          reason: "manual_backfill",
          changed_by: callerId,
        });

      if (histErr) {
        summary.errors++;
        details.push({
          email: row.email,
          old_uuid: row.user_uuid,
          new_uuid: targetAuthId,
          outcome: "error",
          message: `history insert failed: ${histErr.message}`,
        });
        continue;
      }

      // 2. Update the user_uuid (CASCADE propagates to all child FKs).
      // Allowlisted write: user_uuid only. Never spread request body.
      const { error: updErr } = await admin
        .from("users")
        .update({ user_uuid: targetAuthId })
        .eq("user_uuid", row.user_uuid);

      if (updErr) {
        summary.errors++;
        details.push({
          email: row.email,
          old_uuid: row.user_uuid,
          new_uuid: targetAuthId,
          outcome: "error",
          message: `update failed: ${updErr.message}`,
        });
        continue;
      }

      // Reflect the change in our local set so subsequent collision checks are accurate
      profileUuids.delete(row.user_uuid);
      profileUuids.add(targetAuthId);

      summary.relinked++;
      details.push({
        email: row.email,
        old_uuid: row.user_uuid,
        new_uuid: targetAuthId,
        outcome: "relinked",
      });
    }

    return json(req, 200, {
      ok: true,
      dry_run: dryRun,
      ran_by: callerProfile.email,
      ran_at: new Date().toISOString(),
      summary,
      details,
    });
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    console.error("[repair-staff-uuids] fatal:", message);
    return json(req, 500, { ok: false, code: "INTERNAL_ERROR", detail: message });
  }
});
