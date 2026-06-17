
# Phase 2 — `handle-email-intake` (Code for Review)

Three artifacts: (1) seed migration, (2) `supabase/config.toml` addition, (3) edge function. Nothing is written until you approve.

---

## 1. Migration — seed `email_ticket.untriaged` event

`supabase/migrations/<timestamp>_seed_email_ticket_untriaged_event.sql`

```sql
-- Phase 2 step 0: register notification event used by handle-email-intake
INSERT INTO public.dd_notification_event (value, label, is_active)
VALUES ('email_ticket.untriaged', 'Email Ticket Untriaged', true)
ON CONFLICT (value) DO NOTHING;
```

---

## 2. `supabase/config.toml` — append

```toml
[functions.handle-email-intake]
verify_jwt = false
```

---

## 3. `supabase/functions/handle-email-intake/index.ts` (new)

```ts
// Phase 2: Email Triage intake endpoint.
// Called server-to-server by Power Automate when a new email arrives in the
// shared Outlook mailbox. No JWT (verify_jwt=false in config.toml); auth is
// performed via constant-time compare of the x-intake-secret header against
// the EMAIL_INTAKE_SECRET env var. See Phase 1 schema for email_tickets.

import { createClient } from "npm:@supabase/supabase-js@2";
import { z } from "npm:zod@3";

const MAX_BODY_BYTES = 256 * 1024; // 256 KB
const NOTIFY_ROLES = ["Super Admin", "Team Member", "CSC"] as const;

const IntakeSchema = z.object({
  sender_name:       z.string().min(1).max(200),
  sender_email:      z.string().email().max(320),
  subject:           z.string().min(1).max(500),
  body_preview:      z.string().max(200_000).optional(),
  original_email_id: z.string().min(1).max(500),
  received_at:       z.string().datetime().optional(),
});

function json(status: number, body: unknown): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: { "Content-Type": "application/json" },
  });
}

function constantTimeEqual(a: string, b: string): boolean {
  const enc = new TextEncoder();
  const ab = enc.encode(a);
  const bb = enc.encode(b);
  // Always run the compare against equal-length buffers to keep timing bounded.
  // Mismatched length is a guaranteed reject but we still do the work.
  const len = Math.max(ab.length, bb.length, 1);
  const pa = new Uint8Array(len);
  const pb = new Uint8Array(len);
  pa.set(ab);
  pb.set(bb);
  let diff = ab.length ^ bb.length;
  for (let i = 0; i < len; i++) diff |= pa[i] ^ pb[i];
  return diff === 0;
}

function sanitiseBodyPreview(raw: string | undefined): string | null {
  if (!raw) return null;
  let s = raw.replace(/<[^>]*>/g, " ");
  s = s
    .replace(/&nbsp;/gi, " ")
    .replace(/&amp;/gi, "&")
    .replace(/&lt;/gi, "<")
    .replace(/&gt;/gi, ">")
    .replace(/&quot;/gi, '"')
    .replace(/&#39;/gi, "'");
  s = s.replace(/\s+/g, " ").trim();
  if (s.length > 2000) s = s.slice(0, 2000);
  return s.length > 0 ? s : null;
}

Deno.serve(async (req) => {
  const reqId = crypto.randomUUID();

  try {
    // 1. Method gate
    if (req.method !== "POST") {
      return json(405, { error: "method_not_allowed" });
    }

    // 2. Secret check (constant-time, never logged)
    const expected = Deno.env.get("EMAIL_INTAKE_SECRET");
    const provided = req.headers.get("x-intake-secret") ?? "";
    if (!expected) {
      console.error(`[${reqId}] EMAIL_INTAKE_SECRET not configured`);
      return json(500, { error: "internal_error" });
    }
    if (!constantTimeEqual(provided, expected)) {
      console.warn(`[${reqId}] intake auth rejected`);
      return json(401, { error: "unauthorized" });
    }

    // 3. Size gate
    const cl = req.headers.get("content-length");
    const clNum = cl ? Number(cl) : NaN;
    if (!Number.isFinite(clNum) || clNum <= 0 || clNum > MAX_BODY_BYTES) {
      return json(413, { error: "payload_too_large" });
    }

    // 4. Parse + validate
    let rawBody: unknown;
    try {
      rawBody = await req.json();
    } catch {
      return json(400, { error: "invalid_json" });
    }
    const parsed = IntakeSchema.safeParse(rawBody);
    if (!parsed.success) {
      return json(400, {
        error: "invalid_body",
        issues: parsed.error.flatten().fieldErrors,
      });
    }
    const input = parsed.data;

    // 5. Sanitise body_preview
    const bodyPreview = sanitiseBodyPreview(input.body_preview);

    // Service-role client (DB writes + RPC)
    const supabase = createClient(
      Deno.env.get("SUPABASE_URL")!,
      Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!,
      { auth: { persistSession: false, autoRefreshToken: false } },
    );

    // 6. Resolve tenant by sender domain
    let tenantId: number | null = null;
    {
      const { data, error } = await supabase.rpc(
        "resolve_tenant_by_email_domain",
        { _email: input.sender_email },
      );
      if (error) {
        console.error(`[${reqId}] resolve_tenant_by_email_domain failed: ${error.message}`);
        return json(500, { error: "internal_error" });
      }
      tenantId = (data as number | null) ?? null;
    }

    // 7. Insert ticket (idempotent on original_email_id)
    const { data: inserted, error: insertError } = await supabase
      .from("email_tickets")
      .upsert(
        {
          original_email_id: input.original_email_id,
          sender_name:       input.sender_name,
          sender_email:      input.sender_email,
          subject:           input.subject,
          body_preview:      bodyPreview,
          tenant_id:         tenantId,
          received_at:       input.received_at ?? new Date().toISOString(),
        },
        { onConflict: "original_email_id", ignoreDuplicates: true },
      )
      .select("id, ticket_number")
      .maybeSingle();

    if (insertError) {
      console.error(`[${reqId}] email_tickets insert failed: ${insertError.message}`);
      return json(500, { error: "internal_error" });
    }

    if (!inserted) {
      // Duplicate original_email_id — no notifications, no audit churn
      return json(200, { status: "duplicate" });
    }

    // 8. Fan out notifications to triage staff (Super Admin / Team Member / CSC)
    //    Active = NOT disabled AND NOT archived. Integrator and BGT excluded
    //    per Phase 2 scope (they retain RLS read access only).
    const { data: recipients, error: recipientsError } = await supabase
      .from("users")
      .select("user_uuid")
      .in("unicorn_role", NOTIFY_ROLES as unknown as string[])
      .eq("disabled", false)
      .eq("archived", false);

    if (recipientsError) {
      console.error(`[${reqId}] recipients query failed: ${recipientsError.message}`);
      // Ticket already exists — don't fail the whole request
    } else if (recipients && recipients.length > 0) {
      const payload = {
        ticket_number: inserted.ticket_number,
        sender_name:   input.sender_name,
        subject:       input.subject,
      };
      const results = await Promise.allSettled(
        recipients
          .filter((r) => r.user_uuid)
          .map((r) =>
            supabase.rpc("emit_notification", {
              p_event_type:          "email_ticket.untriaged",
              p_recipient_user_uuid: r.user_uuid,
              p_record_type:         "email_ticket",
              p_record_id:           inserted.id,
              p_payload:             payload,
              p_tenant_id:           tenantId,
              p_client_id:           null,
            }),
          ),
      );
      const failed = results.filter((x) => x.status === "rejected").length;
      if (failed > 0) {
        console.error(`[${reqId}] emit_notification failures: ${failed}/${results.length}`);
      }
    }

    // 9. Created
    return json(201, {
      status:        "created",
      ticket_number: inserted.ticket_number,
      id:            inserted.id,
    });
  } catch (err) {
    console.error(`[${reqId}] unhandled: ${(err as Error)?.message ?? "unknown"}`);
    return json(500, { error: "internal_error" });
  }
});
```

---

## Pre-flight checks I'll run on approval

Already verified against the live DB while planning:
- `public.resolve_tenant_by_email_domain(_email text) RETURNS bigint` — parameter name is `_email`, used above.
- `public.users` has `user_uuid`, `unicorn_role`, `disabled`, `archived` (no `is_active` column — use `disabled=false AND archived=false`).
- `public.dd_notification_event` accepts `email_ticket.untriaged` only after the step 0 migration runs.
- `public.emit_notification` signature: `(p_event_type text, p_recipient_user_uuid uuid, p_record_type text, p_record_id uuid, p_payload jsonb, p_tenant_id integer DEFAULT NULL, p_client_id integer DEFAULT NULL)` — matches the call above.

On approval, in build mode, I will additionally:
1. `fetch_secrets` to confirm `EMAIL_INTAKE_SECRET` exists; if absent, request it via `add_secret` before deploy.
2. Apply the seed migration first, then write the function file and config.toml line, then deploy.

## Risks
- **Recipient list size.** Sequential per-user RPCs scale linearly; with ~10–30 active staff this is fine. If the org grows past ~100 active staff in the 3 roles, consider a server-side fan-out helper.
- **`EMAIL_INTAKE_SECRET` rotation.** Rotation requires updating Power Automate at the same time; no in-app warning is wired up.
- **`received_at` trust.** Power Automate supplies it; if absent we fall back to `now()`. No skew validation — acceptable for v1.

Reply "approve" to proceed.
