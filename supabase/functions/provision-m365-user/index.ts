/**
 * provision-m365-user
 * --------------------
 * Auto-provisions a new Vivacity team member into Microsoft 365 using
 * the existing app-only Graph token (MICROSOFT_CLIENT_ID/SECRET/TENANT_ID).
 *
 * Workflow:
 *   1. Verify caller is an authenticated Vivacity staff member.
 *   2. Look up the resolved staff_provisioning_rules row (role × location).
 *   3. Create a staff_provisioning_runs row in 'provisioning' state.
 *   4. POST /users → create the M365 user.
 *   5. POST /users/{id}/assignLicense for each license SKU.
 *   6. POST /groups/{id}/members/$ref for each group (resolved by displayName).
 *   7. Save graph_transcript and final state on the run row.
 *   8. Invoke generate-staff-checklist for the run.
 *
 * Body:
 *   first_name, last_name, role_code, location_code, upn, mail_nickname,
 *   display_name, temp_password (required)
 *   preferred_name, personal_email, phone, job_title, start_date,
 *   team_leader_id (optional)
 */
import { serve } from "https://deno.land/std@0.190.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";
import { graphPost, graphGet } from "../_shared/graph-app-client.ts";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};

const SUPABASE_URL = Deno.env.get("SUPABASE_URL")!;
const SUPABASE_SERVICE_ROLE_KEY = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;

interface Body {
  first_name: string;
  last_name: string;
  preferred_name?: string | null;
  personal_email?: string | null;
  phone?: string | null;
  role_code: string;
  location_code: string;
  job_title?: string | null;
  start_date?: string | null;
  team_leader_id?: string | null;
  upn: string;
  mail_nickname: string;
  display_name: string;
  temp_password: string;
}

interface TranscriptStep {
  step: string;
  ok: boolean;
  detail?: string;
  data?: unknown;
}

function json(status: number, body: unknown) {
  return new Response(JSON.stringify(body), {
    status,
    headers: { "Content-Type": "application/json", ...corsHeaders },
  });
}

serve(async (req) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: corsHeaders });

  const auth = req.headers.get("Authorization")?.replace(/^Bearer\s+/i, "");
  if (!auth) return json(401, { ok: false, error: "Missing Authorization" });

  const admin = createClient(SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY);

  // Verify caller is Vivacity staff
  const { data: { user }, error: authErr } = await admin.auth.getUser(auth);
  if (authErr || !user) return json(401, { ok: false, error: "Unauthorized" });

  const { data: profile } = await admin
    .from("users")
    .select("user_uuid, unicorn_role, global_role, user_type, superadmin_level")
    .eq("user_uuid", user.id)
    .maybeSingle();

  // Restricted to SuperAdmin only — provisioning M365 users is a privileged op
  const isSuperAdmin =
    profile?.global_role === "SuperAdmin" ||
    profile?.unicorn_role === "Super Admin";

  if (!isSuperAdmin) {
    return json(403, { ok: false, error: "Super Admin only" });
  }

  let body: Body;
  try {
    body = await req.json();
  } catch {
    return json(400, { ok: false, error: "Invalid JSON body" });
  }

  const required: (keyof Body)[] = [
    "first_name", "last_name", "role_code", "location_code",
    "upn", "mail_nickname", "display_name", "temp_password",
  ];
  for (const f of required) {
    if (!body[f]) return json(400, { ok: false, error: `Missing field: ${String(f)}` });
  }

  // Load resolved rule
  const { data: rule, error: ruleErr } = await admin
    .from("staff_provisioning_rules")
    .select("*")
    .eq("role_code", body.role_code)
    .eq("location_code", body.location_code)
    .eq("is_active", true)
    .maybeSingle();

  if (ruleErr) return json(500, { ok: false, error: ruleErr.message });
  if (!rule) return json(404, { ok: false, error: `No active rule for ${body.role_code}/${body.location_code}` });

  // Create the run row
  const { data: run, error: runErr } = await admin
    .from("staff_provisioning_runs")
    .insert({
      first_name: body.first_name,
      last_name: body.last_name,
      preferred_name: body.preferred_name,
      personal_email: body.personal_email,
      phone: body.phone,
      role_code: body.role_code,
      location_code: body.location_code,
      job_title: body.job_title,
      start_date: body.start_date,
      team_leader_id: body.team_leader_id,
      requested_by: profile!.user_uuid,
      upn: body.upn,
      mail_nickname: body.mail_nickname,
      display_name: body.display_name,
      status: "provisioning",
    })
    .select()
    .single();

  if (runErr || !run) return json(500, { ok: false, error: runErr?.message ?? "Failed to create run" });

  const transcript: TranscriptStep[] = [];
  let msUserId: string | null = null;
  let unicornUserUuid: string | null = null;

  // ============================================================
  // Step 0 (CRITICAL): Save the user in Unicorn FIRST.
  // This must succeed regardless of Microsoft Graph outcome — the
  // person needs to exist in our system even if M365 provisioning
  // fails (e.g. missing Entra permissions). Graph errors are then
  // recorded in the transcript and can be retried later.
  // ============================================================
  const VIVACITY_TENANT_ID = 6372;
  try {
    const emailLower = body.upn.toLowerCase();

    // Check for existing public.users row by email (UPN)
    const { data: existing } = await admin
      .from("users")
      .select("user_uuid")
      .eq("email", emailLower)
      .maybeSingle();

    if (existing?.user_uuid) {
      unicornUserUuid = existing.user_uuid;
      transcript.push({
        step: "unicorn_user",
        ok: true,
        detail: `Reusing existing Unicorn user ${unicornUserUuid}`,
      });
    } else {
      unicornUserUuid = crypto.randomUUID();
      const { error: insErr } = await admin.from("users").insert({
        user_uuid: unicornUserUuid,
        email: emailLower,
        first_name: body.first_name.trim(),
        last_name: (body.last_name || "-").trim(),
        unicorn_role: "Team Member",
        user_type: "Vivacity",
        is_team: true,
        disabled: false,
        job_title: body.job_title || null,
        phone: body.phone || null,
      });
      if (insErr) {
        transcript.push({ step: "unicorn_user", ok: false, detail: insErr.message });
        unicornUserUuid = null;
      } else {
        transcript.push({
          step: "unicorn_user",
          ok: true,
          detail: `Created Unicorn user ${unicornUserUuid} (${emailLower})`,
        });
      }
    }

    // Ensure tenant_users membership in Vivacity tenant
    if (unicornUserUuid) {
      const { data: existingTu } = await admin
        .from("tenant_users")
        .select("id")
        .eq("user_id", unicornUserUuid)
        .eq("tenant_id", VIVACITY_TENANT_ID)
        .maybeSingle();

      if (!existingTu) {
        const { error: tuErr } = await admin.from("tenant_users").insert({
          user_id: unicornUserUuid,
          tenant_id: VIVACITY_TENANT_ID,
          role: "child",
          primary_contact: false,
        });
        if (tuErr) {
          transcript.push({ step: "tenant_membership", ok: false, detail: tuErr.message });
        } else {
          transcript.push({
            step: "tenant_membership",
            ok: true,
            detail: `Added to Vivacity tenant (${VIVACITY_TENANT_ID})`,
          });
        }
      } else {
        transcript.push({
          step: "tenant_membership",
          ok: true,
          detail: "Already a Vivacity tenant member",
        });
      }
    }

    // Stamp the run with the new Unicorn user_uuid immediately
    if (unicornUserUuid) {
      await admin
        .from("staff_provisioning_runs")
        .update({ target_user_id: unicornUserUuid })
        .eq("id", run.id);
    }
  } catch (e) {
    transcript.push({
      step: "unicorn_user",
      ok: false,
      detail: e instanceof Error ? e.message : String(e),
    });
  }

  // Step 1: Create user in Microsoft 365
  try {
    const createResp = await graphPost<any>("/users", {
      accountEnabled: true,
      displayName: body.display_name,
      givenName: body.first_name,
      surname: body.last_name,
      userPrincipalName: body.upn,
      mailNickname: body.mail_nickname,
      usageLocation: body.location_code,
      passwordProfile: {
        forceChangePasswordNextSignIn: true,
        password: body.temp_password,
      },
    });
    if (createResp.ok && createResp.data?.id) {
      msUserId = createResp.data.id as string;
      transcript.push({ step: "create_user", ok: true, detail: `Created ${body.upn} (id ${msUserId})` });
    } else if (createResp.status === 400 && JSON.stringify(createResp.data).includes("already exists")) {
      // Look up existing
      const lookup = await graphGet<any>(`/users/${encodeURIComponent(body.upn)}`);
      if (lookup.ok) {
        msUserId = lookup.data.id;
        transcript.push({ step: "create_user", ok: true, detail: `User already exists; reusing id ${msUserId}` });
      } else {
        transcript.push({ step: "create_user", ok: false, detail: `Already exists but lookup failed: ${lookup.status}` });
      }
    } else {
      transcript.push({ step: "create_user", ok: false, detail: `${createResp.status} ${JSON.stringify(createResp.data).slice(0, 300)}` });
    }
  } catch (e) {
    transcript.push({ step: "create_user", ok: false, detail: e instanceof Error ? e.message : String(e) });
  }

  // Step 2: Assign licenses (need SKU IDs)
  if (msUserId && rule.licenses && rule.licenses.length > 0) {
    try {
      const skuResp = await graphGet<any>("/subscribedSkus?$select=skuId,skuPartNumber,prepaidUnits,consumedUnits");
      const skuMap = new Map<string, string>();
      if (skuResp.ok) {
        for (const s of skuResp.data?.value ?? []) {
          skuMap.set((s.skuPartNumber as string).toUpperCase(), s.skuId);
        }
      }
      for (const sku of rule.licenses) {
        const id = skuMap.get(sku.toUpperCase());
        if (!id) {
          transcript.push({ step: `license:${sku}`, ok: false, detail: "SKU not found in tenant" });
          continue;
        }
        const r = await graphPost(`/users/${msUserId}/assignLicense`, {
          addLicenses: [{ skuId: id, disabledPlans: [] }],
          removeLicenses: [],
        });
        transcript.push({
          step: `license:${sku}`,
          ok: r.ok,
          detail: r.ok ? "Assigned" : `${r.status} ${JSON.stringify(r.data).slice(0, 200)}`,
        });
      }
    } catch (e) {
      transcript.push({ step: "license:resolve_skus", ok: false, detail: e instanceof Error ? e.message : String(e) });
    }
  }

  // Step 3: Add to groups (resolve by displayName)
  if (msUserId && rule.m365_groups && rule.m365_groups.length > 0) {
    for (const groupName of rule.m365_groups) {
      try {
        const grpResp = await graphGet<any>(
          `/groups?$filter=${encodeURIComponent(`displayName eq '${groupName.replace(/'/g, "''")}'`)}&$top=1`,
        );
        const grp = grpResp.data?.value?.[0];
        if (!grp) {
          transcript.push({ step: `group:${groupName}`, ok: false, detail: "Group not found" });
          continue;
        }
        const addResp = await graphPost(`/groups/${grp.id}/members/$ref`, {
          "@odata.id": `https://graph.microsoft.com/v1.0/directoryObjects/${msUserId}`,
        });
        const already = addResp.status === 400 && JSON.stringify(addResp.data).toLowerCase().includes("already exist");
        transcript.push({
          step: `group:${groupName}`,
          ok: addResp.ok || already,
          detail: addResp.ok ? "Added" : already ? "Already a member" : `${addResp.status}`,
        });
      } catch (e) {
        transcript.push({ step: `group:${groupName}`, ok: false, detail: e instanceof Error ? e.message : String(e) });
      }
    }
  }

  // Persist transcript + final status.
  // 'provisioned'         → everything (Unicorn + Graph) succeeded
  // 'partial'             → Unicorn user saved, but one or more Graph steps failed
  // 'failed'              → Unicorn user could not be saved (rare, blocking)
  const unicornOk = !!unicornUserUuid;
  const allOk = transcript.every((s) => s.ok);
  const status = !unicornOk ? "failed" : allOk ? "provisioned" : "partial";

  await admin
    .from("staff_provisioning_runs")
    .update({
      ms_user_id: msUserId,
      graph_transcript: transcript,
      status,
    })
    .eq("id", run.id);

  // Generate checklist instances (only meaningful if Unicorn user exists)
  if (unicornOk) {
    try {
      await admin.functions.invoke("generate-staff-checklist", {
        body: {
          run_id: run.id,
          role_code: body.role_code,
          location_code: body.location_code,
          requested_by: profile!.user_uuid,
        },
      });
    } catch (e) {
      console.error("[provision-m365-user] checklist seed failed", e);
    }
  }

  return json(200, {
    ok: true,
    run_id: run.id,
    ms_user_id: msUserId,
    unicorn_user_uuid: unicornUserUuid,
    status,
    transcript,
  });
});
