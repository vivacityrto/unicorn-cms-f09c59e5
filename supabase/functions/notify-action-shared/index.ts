import { createClient } from "https://esm.sh/@supabase/supabase-js@2.45.0";
import { z } from "https://esm.sh/zod@3.23.8";
import { corsHeaders } from "../_shared/cors.ts";

const STAFF_ROLES = ["Super Admin", "Team Leader", "Team Member"] as const;

const BodySchema = z.object({
  tenant_id: z.number().int().positive(),
  action_title: z.string().min(1).max(500),
  notify_user_ids: z.array(z.string().uuid()).min(1),
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
    const { tenant_id, action_title, notify_user_ids } = parsed.data;

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
      .select("user_id")
      .eq("user_id", callerId)
      .eq("tenant_id", tenant_id)
      .maybeSingle();
    if (memErr) {
      console.error("caller tenant_users lookup error", memErr);
      return json(req, 500, { error: memErr.message });
    }
    if (!membership) {
      return json(req, 403, { error: "Forbidden" });
    }

    // Validate recipients: must be tenant members OR vivacity staff.
    const uniqueRecipients = Array.from(
      new Set(notify_user_ids.filter((uid) => uid !== callerId)),
    );

    const [tenantMembersRes, staffRes, authorRes] = await Promise.all([
      adminClient
        .from("tenant_users")
        .select("user_id")
        .eq("tenant_id", tenant_id)
        .in("user_id", uniqueRecipients),
      adminClient
        .from("users")
        .select("user_uuid")
        .in("user_uuid", uniqueRecipients)
        .in("unicorn_role", STAFF_ROLES as unknown as string[]),
      adminClient
        .from("users")
        .select("first_name, last_name")
        .eq("user_uuid", callerId)
        .maybeSingle(),
    ]);
    if (tenantMembersRes.error) {
      console.error("recipient tenant_users error", tenantMembersRes.error);
      return json(req, 500, { error: tenantMembersRes.error.message });
    }
    if (staffRes.error) {
      console.error("recipient staff lookup error", staffRes.error);
      return json(req, 500, { error: staffRes.error.message });
    }

    const allowed = new Set<string>([
      ...(tenantMembersRes.data ?? []).map((r: { user_id: string }) => r.user_id),
      ...(staffRes.data ?? []).map((r: { user_uuid: string }) => r.user_uuid),
    ]);
    const validRecipients = uniqueRecipients.filter((uid) => allowed.has(uid));
    const dropped = uniqueRecipients.length - validRecipients.length;

    if (validRecipients.length === 0) {
      return json(req, 200, { notified: 0, dropped });
    }

    const author = authorRes.data;
    const authorName = author
      ? `${author.first_name || ""} ${author.last_name || ""}`.trim() ||
        "A team member"
      : "A team member";

    const trimmed = action_title.substring(0, 60).trim();
    const messageBody = `${authorName} created an action: "${trimmed}${
      action_title.length > 60 ? "..." : ""
    }"`;

    const rows = validRecipients.map((uid) => ({
      user_id: uid,
      tenant_id,
      title: "Action item shared with you",
      message: messageBody,
      type: "action_shared",
      link: `/tenant/${tenant_id}`,
      created_by: callerId,
      // Unique per call — original had no dedupe; preserve "always insert".
      dedupe_key: `action_shared:${tenant_id}:${uid}:${crypto.randomUUID()}`,
    }));

    const { error: upsertErr } = await adminClient
      .from("user_notifications")
      .upsert(rows, { onConflict: "dedupe_key", ignoreDuplicates: true });
    if (upsertErr) {
      console.error("user_notifications upsert error", upsertErr);
      return json(req, 500, { error: upsertErr.message });
    }

    return json(req, 200, { notified: rows.length, dropped });
  } catch (e) {
    console.error("notify-action-shared unexpected", e);
    const message = e instanceof Error ? e.message : "Unexpected error";
    return json(req, 500, { error: message });
  }
});
