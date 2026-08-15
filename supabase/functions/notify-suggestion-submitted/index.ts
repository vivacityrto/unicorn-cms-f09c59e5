import { createClient } from "https://esm.sh/@supabase/supabase-js@2.45.0";
import { z } from "https://esm.sh/zod@3.23.8";
import { corsHeaders } from "../_shared/cors.ts";

const STAFF_ROLES = ["Super Admin", "Team Leader", "Team Member"] as const;

const BodySchema = z.object({
  suggest_item_id: z.string().uuid(),
});

function json(req: Request, status: number, body: unknown) {
  return new Response(JSON.stringify(body), {
    status,
    headers: { ...corsHeaders(req), "Content-Type": "application/json" },
  });
}

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") {
    return new Response(null, { headers: corsHeaders(req) });
  }
  if (req.method !== "POST") {
    return json(req, 405, { error: "Method not allowed" });
  }

  try {
    // 1. Validate body
    let raw: unknown;
    try {
      raw = await req.json();
    } catch {
      return json(req, 400, { error: "Invalid JSON body" });
    }
    const parsed = BodySchema.safeParse(raw);
    if (!parsed.success) {
      return json(req, 400, { error: parsed.error.flatten().fieldErrors });
    }
    const { suggest_item_id } = parsed.data;

    // 2. Authn — validate Authorization header shape, then let Supabase verify the JWT
    const authHeader = req.headers.get("Authorization");
    if (!authHeader?.startsWith("Bearer ")) {
      return json(req, 401, { error: "Unauthorized" });
    }

    const SUPABASE_URL = Deno.env.get("SUPABASE_URL")!;
    const SUPABASE_ANON_KEY = Deno.env.get("SUPABASE_ANON_KEY")!;
    const SERVICE_ROLE_KEY = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;

    const userClient = createClient(SUPABASE_URL, SUPABASE_ANON_KEY, {
      global: { headers: { Authorization: authHeader } },
      auth: { persistSession: false, autoRefreshToken: false },
    });
    const adminClient = createClient(SUPABASE_URL, SERVICE_ROLE_KEY, {
      auth: { persistSession: false, autoRefreshToken: false },
    });

    const { data: userData, error: userErr } = await userClient.auth.getUser();
    if (userErr || !userData?.user?.id) {
      return json(req, 401, { error: "Unauthorized" });
    }
    const callerId = userData.user.id;

    // 3. Staff check (service-role lookup so RLS can't hide the role)
    const { data: callerRow } = await adminClient
      .from("users")
      .select("unicorn_role")
      .eq("user_uuid", callerId)
      .maybeSingle();
    const isStaff =
      !!callerRow?.unicorn_role &&
      (STAFF_ROLES as readonly string[]).includes(callerRow.unicorn_role);

    // 3a. Academy-only pre-check (fast path): non-staff callers whose ENTIRE
    // tenant_users footprint is academy_only cannot submit suggestions.
    // Callers with zero tenant_users rows are also rejected.
    if (!isStaff) {
      const { data: scopes, error: scopesErr } = await adminClient
        .from("tenant_users")
        .select("access_scope")
        .eq("user_id", callerId);
      if (scopesErr) {
        console.error("tenant_users scope fetch error", scopesErr);
        return json(req, 500, { error: scopesErr.message });
      }
      const rows = scopes ?? [];
      const allAcademyOnly =
        rows.length === 0 ||
        rows.every((r: { access_scope: string | null }) => r.access_scope === "academy_only");
      if (allAcademyOnly) {
        return json(req, 403, { error: "Suggestions are not available on your plan." });
      }
    }

    // 4. Fetch suggest_item via auth-scoped client (RLS-gated)
    const { data: item, error: itemErr } = await userClient
      .from("suggest_items")
      .select("id, title, tenant_id, reported_by, is_deleted")
      .eq("id", suggest_item_id)
      .maybeSingle();

    if (itemErr) {
      console.error("suggest_items fetch error", itemErr);
      return json(req, 500, { error: itemErr.message });
    }
    if (!item || item.is_deleted) {
      return json(req, 404, { error: "Suggestion not found" });
    }

    // 4a. Per-tenant academy-only check: defense against multi-tenant callers
    // where one tenant is academy_only and the submitted item belongs to it.
    if (!isStaff) {
      const { data: tenantScope, error: tenantScopeErr } = await adminClient
        .from("tenant_users")
        .select("access_scope")
        .eq("user_id", callerId)
        .eq("tenant_id", item.tenant_id)
        .maybeSingle();
      if (tenantScopeErr) {
        console.error("tenant_users per-tenant scope fetch error", tenantScopeErr);
        return json(req, 500, { error: tenantScopeErr.message });
      }
      if (tenantScope?.access_scope === "academy_only") {
        return json(req, 403, { error: "Suggestions are not available on your plan." });
      }
    }

    if (!isStaff && item.reported_by !== callerId) {
      return json(req, 403, { error: "Forbidden" });
    }

    // 5. Service-role lookups (bypass RLS for tenant name + staff list)
    const [tenantRes, reporterRes, staffRes] = await Promise.all([
      adminClient
        .from("tenants")
        .select("name")
        .eq("id", item.tenant_id)
        .maybeSingle(),
      adminClient
        .from("users")
        .select("first_name, last_name")
        .eq("user_uuid", item.reported_by)
        .maybeSingle(),
      adminClient
        .from("users")
        .select("user_uuid")
        .in("unicorn_role", STAFF_ROLES as unknown as string[]),
    ]);

    const tenantName = tenantRes.data?.name ?? "Unknown organisation";
    const reporterName =
      [reporterRes.data?.first_name, reporterRes.data?.last_name]
        .filter(Boolean)
        .join(" ")
        .trim() || "A client user";
    const staffIds = (staffRes.data ?? [])
      .map((r: { user_uuid: string | null }) => r.user_uuid)
      .filter((id: string | null): id is string => !!id);

    // 6. Build notification rows
    type Row = {
      user_id: string;
      tenant_id: number;
      type: string;
      title: string;
      message: string;
      link: string;
      dedupe_key: string;
      created_by: string;
      source_id: string;
    };

    const dedupe = (uid: string) =>
      `suggestion_submitted:${item.id}:${uid}`;

    const rows: Row[] = [];

    // Staff recipients (skip the submitter to avoid double-notify when staff submits)
    for (const sid of staffIds) {
      if (sid === item.reported_by) continue;
      rows.push({
        user_id: sid,
        tenant_id: item.tenant_id,
        type: "suggestion_submitted",
        title: `New suggestion from ${tenantName}`,
        message: `${reporterName} submitted: "${item.title}"`,
        link: `/suggestions/${item.id}`,
        dedupe_key: dedupe(sid),
        created_by: callerId,
        source_id: item.id,
      });
    }

    // Submitter receipt
    rows.push({
      user_id: item.reported_by,
      tenant_id: item.tenant_id,
      type: "suggestion_submitted",
      title: "Suggestion received",
      message:
        "Your suggestion has been submitted to the Vivacity team. We'll be in touch.",
      link: `/client/suggestions/${item.id}`,
      dedupe_key: dedupe(item.reported_by),
      created_by: callerId,
      source_id: item.id,
    });

    // 7. Idempotent upsert (unique index on dedupe_key already exists)
    const { error: upsertErr } = await adminClient
      .from("user_notifications")
      .upsert(rows, { onConflict: "dedupe_key", ignoreDuplicates: true });

    if (upsertErr) {
      console.error("user_notifications upsert error", upsertErr);
      return json(req, 500, { error: upsertErr.message });
    }

    return json(req, 200, { notified: rows.length });
  } catch (e) {
    console.error("notify-suggestion-submitted unexpected", e);
    const message = e instanceof Error ? e.message : "Unexpected error";
    return json(req, 500, { error: message });
  }
});
