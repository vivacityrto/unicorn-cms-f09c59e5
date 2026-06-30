import { createClient } from "npm:@supabase/supabase-js@2";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers":
    "authorization, x-client-info, apikey, content-type",
};

const VIVACITY_ROLES = ["Super Admin", "Team Leader", "Team Member"];

interface RecipientRow {
  id: string;
  tenant_id: number;
  user_id: string;
  delivery_status: string;
}

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") {
    return new Response("ok", { headers: corsHeaders });
  }

  try {
    const authHeader = req.headers.get("Authorization");
    if (!authHeader?.startsWith("Bearer ")) {
      return jsonError(401, "Missing authorization");
    }

    const supabaseUrl = Deno.env.get("SUPABASE_URL")!;
    const serviceKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
    const anonKey = Deno.env.get("SUPABASE_ANON_KEY")!;

    // 1. Verify caller JWT
    const userClient = createClient(supabaseUrl, anonKey, {
      global: { headers: { Authorization: authHeader } },
    });
    const token = authHeader.replace("Bearer ", "");
    const { data: claimsData, error: claimsErr } =
      await userClient.auth.getClaims(token);
    if (claimsErr || !claimsData?.claims?.sub) {
      return jsonError(401, "Unauthorized");
    }
    const callerId = claimsData.claims.sub;

    // Service client for delivery
    const svc = createClient(supabaseUrl, serviceKey, {
      auth: { autoRefreshToken: false, persistSession: false },
    });

    // 2. Confirm staff: is_team OR unicorn_role in VIVACITY_ROLES
    const { data: staffRow, error: staffErr } = await svc
      .from("users")
      .select("user_uuid, is_team, unicorn_role")
      .eq("user_uuid", callerId)
      .maybeSingle();
    if (staffErr || !staffRow) {
      return jsonError(403, "Staff profile not found");
    }
    const isStaff =
      staffRow.is_team === true ||
      VIVACITY_ROLES.includes(staffRow.unicorn_role ?? "");
    if (!isStaff) {
      return jsonError(403, "Vivacity staff only");
    }

    // 3. Parse + validate input
    const body = await req.json().catch(() => null);
    const campaignId: string | undefined = body?.campaign_id;
    if (!campaignId || typeof campaignId !== "string") {
      return jsonError(400, "campaign_id required");
    }
    const categoryId: string | null =
      typeof body?.category_id === "string" && body.category_id.length > 0
        ? body.category_id
        : null;
    const attachments: Array<{
      storage_path: string;
      filename: string;
      mime_type: string;
      file_size: number;
    }> = Array.isArray(body?.attachments) ? body.attachments : [];

    // 4. Load campaign — must be queued
    const { data: campaign, error: cErr } = await svc
      .from("broadcast_campaigns")
      .select("id, title, body, status")
      .eq("id", campaignId)
      .maybeSingle();
    if (cErr || !campaign) {
      return jsonError(404, "Campaign not found");
    }
    if (campaign.status !== "queued") {
      return jsonError(
        409,
        `Campaign status is '${campaign.status}', expected 'queued'`,
      );
    }

    // 5. Load queued recipients
    const { data: recipients, error: rErr } = await svc
      .from("broadcast_recipients")
      .select("id, tenant_id, user_id, delivery_status")
      .eq("campaign_id", campaignId)
      .eq("delivery_status", "queued");
    if (rErr) {
      return jsonError(500, `Failed to load recipients: ${rErr.message}`);
    }

    // 6. Group by tenant_id
    const byTenant = new Map<number, RecipientRow[]>();
    for (const r of (recipients ?? []) as RecipientRow[]) {
      const arr = byTenant.get(r.tenant_id) ?? [];
      arr.push(r);
      byTenant.set(r.tenant_id, arr);
    }

    let totalSent = 0;
    let totalFailed = 0;
    let conversationsCreated = 0;

    // 7. Deliver one conversation per tenant
    for (const [tenantId, rows] of byTenant) {
      const recipientIds = rows.map((r) => r.id);
      try {
        // Create conversation
        const { data: conv, error: convErr } = await svc
          .from("tenant_conversations")
          .insert({
            tenant_id: tenantId,
            topic: "general",
            type: "broadcast",
            subject: campaign.title,
            created_by_user_uuid: callerId,
            status: "open",
          })
          .select("id")
          .single();
        if (convErr || !conv) throw new Error(convErr?.message ?? "conv insert failed");

        // Upsert staff participant
        const { error: staffPartErr } = await svc
          .from("conversation_participants")
          .upsert(
            {
              conversation_id: conv.id,
              user_id: callerId,
              role: "staff",
              last_read_at: new Date().toISOString(),
            },
            { onConflict: "conversation_id,user_id" },
          );
        if (staffPartErr) throw new Error(staffPartErr.message);

        // Upsert all tenant_users as client participants (full mirror of single-message flow)
        const { data: tenantUsers } = await svc
          .from("tenant_users")
          .select("user_id")
          .eq("tenant_id", tenantId);
        if (tenantUsers?.length) {
          await svc
            .from("conversation_participants")
            .upsert(
              tenantUsers.map((u: { user_id: string }) => ({
                conversation_id: conv.id,
                user_id: u.user_id,
                role: "client",
              })),
              { onConflict: "conversation_id,user_id", ignoreDuplicates: true },
            );
        }

        // Insert the broadcast message
        const { error: msgErr } = await svc.from("tenant_messages").insert({
          conversation_id: conv.id,
          tenant_id: tenantId,
          sender_user_uuid: callerId,
          sender_type: "staff",
          body: campaign.body,
        });
        if (msgErr) throw new Error(msgErr.message);

        // Mark all this tenant's recipient rows as sent
        await svc
          .from("broadcast_recipients")
          .update({
            delivery_status: "sent",
            sent_at: new Date().toISOString(),
            conversation_id: conv.id,
          })
          .in("id", recipientIds);

        totalSent += rows.length;
        conversationsCreated += 1;
      } catch (err) {
        const msg = err instanceof Error ? err.message : String(err);
        console.error(`Tenant ${tenantId} delivery failed:`, msg);
        await svc
          .from("broadcast_recipients")
          .update({
            delivery_status: "failed",
            failure_reason: msg.slice(0, 500),
          })
          .in("id", recipientIds);
        totalFailed += rows.length;
      }
    }

    // 8. Update campaign totals
    await svc
      .from("broadcast_campaigns")
      .update({
        status: "sent",
        total_sent: totalSent,
        total_failed: totalFailed,
        sent_at: new Date().toISOString(),
      })
      .eq("id", campaignId);

    // 9. Audit log
    await svc.from("client_audit_log").insert({
      tenant_id: null,
      actor_user_id: callerId,
      action: "broadcast:send",
      entity_type: "broadcast_campaigns",
      entity_id: campaignId,
      details: {
        total_recipients: recipients?.length ?? 0,
        total_sent: totalSent,
        total_failed: totalFailed,
        conversations_created: conversationsCreated,
      },
    });

    return new Response(
      JSON.stringify({
        total_sent: totalSent,
        total_failed: totalFailed,
        conversations_created: conversationsCreated,
      }),
      {
        status: 200,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      },
    );
  } catch (err) {
    console.error("send-broadcast-campaign error:", err);
    return jsonError(500, err instanceof Error ? err.message : "Internal error");
  }
});

function jsonError(status: number, message: string): Response {
  return new Response(JSON.stringify({ error: message }), {
    status,
    headers: { ...corsHeaders, "Content-Type": "application/json" },
  });
}
