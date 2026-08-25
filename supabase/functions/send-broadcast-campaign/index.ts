import { createClient } from "npm:@supabase/supabase-js@2";
import { corsHeaders } from "../_shared/cors.ts";

interface RecipientRow {
  id: string;
  tenant_id: number;
  user_id: string;
  delivery_status: string;
}

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") {
    return new Response("ok", { headers: corsHeaders(req) });
  }

  try {
    const authHeader = req.headers.get("Authorization");
    if (!authHeader?.startsWith("Bearer ")) {
      return jsonError(req, 401, "Missing authorization");
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
      return jsonError(req, 401, "Unauthorized");
    }
    const callerId = claimsData.claims.sub;

    // Service client for delivery
    const svc = createClient(supabaseUrl, serviceKey, {
      auth: { autoRefreshToken: false, persistSession: false },
    });

    // 2. Permission gate via central RPC (matches invite-user / bulk-send-invitations)
    const { data: allowed } = await svc.rpc("check_permission", {
      p_user_id: callerId,
      p_feature_key: "admin.broadcast.send",
      p_min_level: "full",
    });
    if (!allowed) {
      return jsonError(req, 403, "Insufficient permissions");
    }

    // 3. Parse + validate input
    const body = await req.json().catch(() => null);
    const campaignId: string | undefined = body?.campaign_id;
    if (!campaignId || typeof campaignId !== "string") {
      return jsonError(req, 400, "campaign_id required");
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
      return jsonError(req, 404, "Campaign not found");
    }
    if (campaign.status !== "queued") {
      return jsonError(req, 
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
      return jsonError(req, 500, `Failed to load recipients: ${rErr.message}`);
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

        // Upsert all tenant_users as client participants (full mirror of single-message flow).
        // conversation_participants.user_id FKs to auth.users, not public.users — a stale
        // public.users row with no matching auth account (seen with seeded/fixture profiles,
        // e.g. tenant 7547's demo placeholders) makes the WHOLE batch upsert fail with a
        // foreign-key violation, silently dropping every real participant for that tenant
        // along with it (2026-08-25 incident: Demo RTO's own account got no notification for
        // a broadcast it was correctly queued for). Falling back to a per-row upsert when the
        // batch fails means one bad row only costs that one participant, not the whole tenant.
        const { data: tenantUsers } = await svc
          .from("tenant_users")
          .select("user_id")
          .eq("tenant_id", tenantId);
        if (tenantUsers?.length) {
          const clientRows = tenantUsers.map((u: { user_id: string }) => ({
            conversation_id: conv.id,
            user_id: u.user_id,
            role: "client",
          }));
          const { error: clientPartErr } = await svc
            .from("conversation_participants")
            .upsert(clientRows, { onConflict: "conversation_id,user_id", ignoreDuplicates: true });
          if (clientPartErr) {
            console.error(
              `Tenant ${tenantId}: batch client-participant upsert failed (${clientPartErr.message}), retrying row-by-row`,
            );
            for (const row of clientRows) {
              const { error: rowErr } = await svc
                .from("conversation_participants")
                .upsert(row, { onConflict: "conversation_id,user_id", ignoreDuplicates: true });
              if (rowErr) {
                console.error(`Tenant ${tenantId}: skipping participant ${row.user_id} — ${rowErr.message}`);
              }
            }
          }
        }

        // Insert the broadcast message
        const { data: insertedMsg, error: msgErr } = await svc
          .from("tenant_messages")
          .insert({
            conversation_id: conv.id,
            tenant_id: tenantId,
            sender_user_uuid: callerId,
            sender_type: "staff",
            body: campaign.body,
            category_id: categoryId,
          })
          .select("id")
          .single();
        if (msgErr || !insertedMsg) throw new Error(msgErr?.message ?? "message insert failed");

        // Attachments: one metadata row per tenant message, all pointing at the same storage_path
        if (attachments.length > 0) {
          const attachmentRows = attachments.map((a) => ({
            message_id: insertedMsg.id,
            storage_path: a.storage_path,
            filename: a.filename,
            mime_type: a.mime_type,
            file_size: a.file_size,
          }));
          const { error: attErr } = await svc
            .from("tenant_message_attachments")
            .insert(attachmentRows);
          if (attErr) throw new Error(`attachment insert: ${attErr.message}`);
        }

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
        headers: { ...corsHeaders(req), "Content-Type": "application/json" },
      },
    );
  } catch (err) {
    console.error("send-broadcast-campaign error:", err);
    return jsonError(req, 500, err instanceof Error ? err.message : "Internal error");
  }
});

function jsonError(req: Request, status: number, message: string): Response {
  return new Response(JSON.stringify({ error: message }), {
    status,
    headers: { ...corsHeaders(req), "Content-Type": "application/json" },
  });
}
