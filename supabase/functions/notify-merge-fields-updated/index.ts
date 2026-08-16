import { createClient } from "https://esm.sh/@supabase/supabase-js@2.45.0";
import { z } from "https://esm.sh/zod@3.23.8";
import { corsHeaders } from "../_shared/cors.ts";

const BodySchema = z.object({
  tenant_id: z.number().int().positive(),
  field_names: z.array(z.string()).min(1),
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
    const { tenant_id, field_names } = parsed.data;

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

    // Authz: caller must belong to tenant_id
    const { data: membership, error: memErr } = await adminClient
      .from("tenant_users")
      .select("access_scope")
      .eq("user_id", callerId)
      .eq("tenant_id", tenant_id)
      .maybeSingle();
    if (memErr) {
      console.error("tenant_users lookup error", memErr);
      return json(req, 500, { error: memErr.message });
    }
    if (!membership) {
      return json(req, 403, { error: "Forbidden" });
    }

    // Resolve CSC recipient via tenant_csc_assignments (authoritative source)
    const { data: cscRows, error: cscErr } = await adminClient
      .from("tenant_csc_assignments")
      .select("user_id, is_primary")
      .eq("tenant_id", tenant_id);
    if (cscErr) {
      console.error("tenant_csc_assignments lookup error", cscErr);
      return json(req, 500, { error: cscErr.message });
    }
    const primary = (cscRows ?? []).find(
      (r: { user_id: string; is_primary: boolean | null }) => r.is_primary,
    );
    const cscUserId: string | null =
      primary?.user_id ?? (cscRows ?? [])[0]?.user_id ?? null;

    if (!cscUserId) {
      return json(req, 200, { notified: 0 });
    }

    // Resolve tenant name for title (mirrors original)
    const { data: tenantData } = await adminClient
      .from("tenants")
      .select("name")
      .eq("id", tenant_id)
      .maybeSingle();
    const tenantName = tenantData?.name || "Client";

    const row = {
      user_id: cscUserId,
      tenant_id,
      type: "merge_data_updated",
      title: `${tenantName} updated merge field information`,
      message: `Fields updated: ${field_names.join(", ")}`,
      link: `/tenant/${tenant_id}`,
      is_read: false,
      created_by: callerId,
      // Unique per call — original code had no dedupe; preserve "always insert".
      dedupe_key: `merge_data_updated:${tenant_id}:${cscUserId}:${crypto.randomUUID()}`,
    };

    const { error: upsertErr } = await adminClient
      .from("user_notifications")
      .upsert([row], { onConflict: "dedupe_key", ignoreDuplicates: true });
    if (upsertErr) {
      console.error("user_notifications upsert error", upsertErr);
      return json(req, 500, { error: upsertErr.message });
    }

    return json(req, 200, { notified: 1 });
  } catch (e) {
    console.error("notify-merge-fields-updated unexpected", e);
    const message = e instanceof Error ? e.message : "Unexpected error";
    return json(req, 500, { error: message });
  }
});
