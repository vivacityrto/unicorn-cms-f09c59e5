/**
 * send-automated-email
 *
 * Internal/system only (cron + other functions). Gated by
 * requireInternalEmailSecret. From address is Deno.env only — auditor display
 * names are no longer used as the Mailgun From. Meeting / action links
 * are constructed from APP_BASE_URL + validated ids. Merge fields are
 * HTML-escaped before interpolation.
 */
import { serve } from "https://deno.land/std@0.190.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";
import { corsHeadersFor, INTERNAL_EMAIL_EXTRA_HEADERS, requireInternalEmailSecret } from "../_shared/requireCaller.ts";
import { EMAIL_LOGO_ALT, EMAIL_LOGO_URL } from "../_shared/app-base-url.ts";
import { escapeHtml } from "../_shared/escape-html.ts";
import { envFromAddress } from "../_shared/email-merge.ts";
import { normalizeAppBaseUrl, resolveEmailUrl, validatedId } from "../_shared/email-urls.ts";
type SupabaseClient = ReturnType<typeof createClient>;
const MAILGUN_API_KEY = Deno.env.get("MAILGUN_API_KEY");
const MAILGUN_DOMAIN = Deno.env.get("MAILGUN_DOMAIN") || "mg.unicorn-cms.au";
const MAILGUN_REGION = Deno.env.get("MAILGUN_REGION") || "EU";
const MAILGUN_API_BASE = MAILGUN_REGION.toUpperCase() === "EU"
  ? "https://api.eu.mailgun.net"
  : "https://api.mailgun.net";

async function sendViaMailgun(
  to: string,
  cc: string | undefined,
  subject: string,
  html: string,
): Promise<string> {
  if (!MAILGUN_API_KEY) throw new Error("Mailgun API key not configured");
  const fd = new FormData();
  fd.append("from", envFromAddress());
  fd.append("to", to);
  if (cc) fd.append("cc", cc);
  fd.append("subject", subject);
  fd.append("html", html);
  const res = await fetch(`${MAILGUN_API_BASE}/v3/${MAILGUN_DOMAIN}/messages`, {
    method: "POST",
    headers: { Authorization: `Basic ${btoa(`api:${MAILGUN_API_KEY}`)}` },
    body: fd,
  });
  if (!res.ok) throw new Error(`Mailgun error: ${await res.text()}`);
  const json = await res.json();
  return json.id;
}

function wrapHtml(title: string, body: string, footer = "Vivacity Coaching & Consulting"): string {
  return `<!DOCTYPE html><html><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><style>body{margin:0;padding:0;background:#f6f8fb;font-family:Arial,Helvetica,sans-serif;color:#111}.wrap{max-width:580px;margin:0 auto;background:#fff}.hdr{background:#6b21a8;padding:24px;text-align:center;color:#fff}.hdr img{height:40px;margin-bottom:12px}.hdr h1{margin:0;font-size:20px;font-weight:600}.body{padding:28px 24px}.box{background:#f8f5ff;border:1px solid #e9d5ff;border-radius:8px;padding:16px;margin:16px 0}.item{display:flex;gap:8px;padding:6px 0;border-bottom:1px solid #f0e8ff}.item:last-child{border-bottom:none}.lbl{color:#6b7280;font-size:13px;min-width:140px}.val{font-size:13px;font-weight:500}.badge{display:inline-block;background:#7c3aed;color:#fff;padding:3px 10px;border-radius:20px;font-size:12px;font-weight:600}.warn{background:#fef9c3;border:1px solid #fde047;border-radius:8px;padding:12px 16px;margin:16px 0;font-size:13px}.list{margin:8px 0;padding-left:20px}.list li{padding:3px 0;font-size:13px}.ftr{padding:16px;text-align:center;color:#9ca3af;font-size:11px;border-top:1px solid #f3f4f6}</style></head><body><div class="wrap"><div class="hdr"><img src="${EMAIL_LOGO_URL}" alt="${EMAIL_LOGO_ALT}"><h1>${escapeHtml(title)}</h1></div><div class="body">${body}</div><div class="ftr">${escapeHtml(footer)} &bull; Unicorn 2.0 &bull; Compliance made simple</div></div></body></html>`;
}

function appBase(): string {
  return normalizeAppBaseUrl(Deno.env.get("APP_BASE_URL"));
}

async function handle24hrConfirmation(p: Record<string, unknown>, sb: SupabaseClient): Promise<Response> {
  const rtoName = escapeHtml(p.rto_name);
  const ceoName = escapeHtml(p.ceo_name || "Team");
  const clientEmail = typeof p.client_email === "string" ? p.client_email : "";
  const tenantId = validatedId(p.tenant_id);
  const meetingTime = escapeHtml(p.meeting_time);
  const location = escapeHtml(p.location || "As advised");
  const isOnline = Boolean(p.is_online);
  const instructions = p.instructions ? escapeHtml(p.instructions) : "";
  const auditorName = escapeHtml(p.auditor_name);
  const auditorEmail = typeof p.auditor_email === "string" ? p.auditor_email : undefined;
  const auditId = validatedId(p.audit_id);

  const meetingHref = resolveEmailUrl("meeting_url", appBase(), {
    audit_id: auditId,
    tenant_id: tenantId,
    meeting_id: validatedId(p.meeting_id),
  });

  if (!tenantId) throw new Error("tenant_id is required");

  const { data: members } = await sb.from("tenant_members").select("users!inner(email)").eq("tenant_id", Number(tenantId)).limit(5);
  const to: string[] = (members ?? []).map((m: { users?: { email?: string } }) => m.users?.email).filter((e: string | undefined): e is string => Boolean(e));
  if (clientEmail && to.length === 0) to.push(clientEmail);
  if (to.length === 0) throw new Error("No recipient for tenant " + tenantId);

  const mtg = isOnline
    ? `<div class="item"><span class="lbl">Meeting details</span><span class="val"><a href="${escapeHtml(meetingHref)}">Open in Unicorn</a></span></div>`
    : `<div class="item"><span class="lbl">Location</span><span class="val">${location}</span></div>`;

  const body = `<p>Dear ${ceoName},</p><p>This is a reminder that your <strong>Compliance Health Check opening meeting</strong> is scheduled for <strong>tomorrow at ${meetingTime}</strong>.</p><div class="box"><div class="item"><span class="lbl">Meeting time</span><span class="val"><strong>Tomorrow at ${meetingTime}</strong></span></div>${mtg}<div class="item"><span class="lbl">Your consultant</span><span class="val">${auditorName}</span></div></div><p><strong>Before the meeting, please confirm:</strong></p><ul class="list"><li>All required documents have been uploaded to your evidence portal</li><li>Your CEO / Principal is available for the full meeting duration</li><li>Your compliance team lead is available if needed</li>${isOnline ? "<li>Review the meeting details in Unicorn</li>" : ""}</ul>${instructions ? `<div class="box">${instructions}</div>` : ""}<p>We look forward to working with you tomorrow.</p><p>Warm regards,<br><strong>${auditorName}</strong><br>Vivacity Coaching &amp; Consulting</p>`;

  const id = await sendViaMailgun(
    to.join(","),
    auditorEmail,
    `Reminder: Compliance Health Check tomorrow — ${String(p.rto_name ?? "")}`,
    wrapHtml("Opening Meeting Tomorrow", body),
  );
  await sb.from("notification_schedule").insert({
    tenant_id: Number(tenantId),
    notification_type: "audit_24hr_confirmation",
    payload: { audit_id: auditId, mailgun_id: id, sent_to: to },
    scheduled_for: new Date().toISOString(),
    status: "sent",
  });
  return new Response(JSON.stringify({ success: true, message_id: id }), {
    status: 200,
    headers: { "Content-Type": "application/json" },
  });
}

async function handleEvidenceReminder(p: Record<string, unknown>, sb: SupabaseClient): Promise<Response> {
  const rtoName = String(p.rto_name ?? "");
  const ceoName = escapeHtml(p.ceo_name || "Team");
  const clientEmail = typeof p.client_email === "string" ? p.client_email : "";
  const tenantId = validatedId(p.tenant_id);
  const daysLeft = Number(p.days_left);
  const outstandingCount = Number(p.outstanding_count);
  const auditorName = escapeHtml(p.auditor_name);
  const auditorEmail = typeof p.auditor_email === "string" ? p.auditor_email : undefined;
  const auditId = validatedId(p.audit_id);
  const requestId = validatedId(p.request_id);

  if (!tenantId) throw new Error("tenant_id is required");

  const { data: members } = await sb.from("tenant_members").select("users!inner(email)").eq("tenant_id", Number(tenantId)).limit(5);
  const to: string[] = (members ?? []).map((m: { users?: { email?: string } }) => m.users?.email).filter((e: string | undefined): e is string => Boolean(e));
  if (clientEmail && to.length === 0) to.push(clientEmail);
  if (to.length === 0) throw new Error("No recipient for tenant " + tenantId);

  const urgency = daysLeft === 1 ? "tomorrow" : `in ${escapeHtml(daysLeft)} days`;
  const items = typeof p.outstanding_items === "string"
    ? p.outstanding_items.split("\n").map((i: string) => `<li>${escapeHtml(i.replace(/^•\s*/, ""))}</li>`).join("")
    : "";

  const portalUrl = resolveEmailUrl("action_link", appBase(), { tenant_id: tenantId, audit_id: auditId }); // APP_BASE_URL

  const body = `<p>Dear ${ceoName},</p><p>Your compliance health check evidence is due <strong>${urgency}</strong> and we are still waiting on <strong>${escapeHtml(outstandingCount)} document${outstandingCount > 1 ? "s" : ""}</strong>.</p><div class="warn">⏰ <strong>Action required:</strong> Please upload outstanding documents to your evidence portal before the deadline.</div><div class="box"><p style="margin:0 0 8px;font-weight:600;font-size:13px">Still needed:</p><ul class="list">${items}</ul></div><p>Log in to your <a href="${escapeHtml(portalUrl)}">Vivacity portal</a> to upload. Your consultant cannot begin document review until all evidence is received.</p><p>Warm regards,<br><strong>${auditorName}</strong><br>Vivacity Coaching &amp; Consulting</p>`;

  const id = await sendViaMailgun(
    to.join(","),
    auditorEmail,
    `Action required: ${outstandingCount} document${outstandingCount > 1 ? "s" : ""} outstanding — due ${daysLeft === 1 ? "tomorrow" : `in ${daysLeft} days`} — ${rtoName}`,
    wrapHtml("Evidence Deadline Reminder", body),
  );
  await sb.from("notification_schedule").insert({
    tenant_id: Number(tenantId),
    notification_type: "audit_evidence_reminder",
    payload: { audit_id: auditId, request_id: requestId, days_left: daysLeft, outstanding_count: outstandingCount, mailgun_id: id },
    scheduled_for: new Date().toISOString(),
    status: "sent",
  });
  return new Response(JSON.stringify({ success: true, message_id: id }), {
    status: 200,
    headers: { "Content-Type": "application/json" },
  });
}

async function handleDocsReady(p: Record<string, unknown>, sb: SupabaseClient): Promise<Response> {
  const auditId = validatedId(p.audit_id);
  const requestId = validatedId(p.request_id);
  const rtoName = escapeHtml(p.rto_name);
  const itemsReceived = escapeHtml(p.items_received);
  const itemsTotal = escapeHtml(p.items_total);
  const auditorEmail = typeof p.auditor_email === "string" ? p.auditor_email : "";
  const auditorName = String(p.auditor_name || "Team");
  const firstName = escapeHtml(auditorName.split(" ")[0]);
  const mtgText = p.opening_meeting
    ? escapeHtml(new Date(String(p.opening_meeting)).toLocaleString("en-AU", { timeZone: "Australia/Sydney", dateStyle: "full", timeStyle: "short" }))
    : "Not yet scheduled";

  const workspaceUrl = resolveEmailUrl("action_link", appBase(), { audit_id: auditId }); // APP_BASE_URL

  const body = `<p>Hi ${firstName},</p><p>All evidence has been received for <strong>${rtoName}</strong>. You can now begin the document review.</p><div class="box"><div class="item"><span class="lbl">Documents received</span><span class="val"><span class="badge">${itemsReceived}/${itemsTotal} complete</span></span></div><div class="item"><span class="lbl">Opening meeting</span><span class="val">${mtgText}</span></div></div><p>Open the <a href="${escapeHtml(workspaceUrl)}">audit workspace</a> to begin your independent document review. AI pre-analysis is running — check the Documents tab for insights when ready.</p>`;

  const id = await sendViaMailgun(
    auditorEmail,
    undefined,
    `All evidence received — ${String(p.rto_name ?? "")} — ready for document review`,
    wrapHtml("Evidence Ready for Review", body),
  );
  await sb.from("notification_schedule").insert({
    tenant_id: null,
    notification_type: "audit_docs_ready",
    payload: { audit_id: auditId, request_id: requestId, rto_name: String(p.rto_name ?? ""), auditor_email: auditorEmail, mailgun_id: id },
    scheduled_for: new Date().toISOString(),
    status: "sent",
  });
  return new Response(JSON.stringify({ success: true, message_id: id }), {
    status: 200,
    headers: { "Content-Type": "application/json" },
  });
}

const handler = async (req: Request): Promise<Response> => {
  const corsHeaders = corsHeadersFor(req, INTERNAL_EMAIL_EXTRA_HEADERS);
  if (req.method === "OPTIONS") return new Response("ok", { headers: corsHeaders });

  const caller = requireInternalEmailSecret(req);
  if (caller instanceof Response) return caller;
  const supabase = createClient(
    Deno.env.get("SUPABASE_URL") ?? "",
    Deno.env.get("SUPABASE_SERVICE_ROLE_KEY") ?? "",
    { auth: { persistSession: false, autoRefreshToken: false } },
  );

  const withCors = (res: Response) => {
    const headers = new Headers(res.headers);
    for (const [k, v] of Object.entries(corsHeaders)) headers.set(k, v);
    return new Response(res.body, { status: res.status, headers });
  };

  try {
    const body = await req.json();
    if (!MAILGUN_API_KEY) throw new Error("Mailgun API key not configured");

    if (body.automation === "audit_24hr_confirmation") return withCors(await handle24hrConfirmation(body, supabase));
    if (body.automation === "audit_evidence_reminder") return withCors(await handleEvidenceReminder(body, supabase));
    if (body.automation === "audit_docs_ready") return withCors(await handleDocsReady(body, supabase));

    const { task_id, document_id, email_id, trigger_type } = body;
    let tenant_id: number | undefined;
    let packageStage: Record<string, unknown> | null = null;
    let packageData: Record<string, unknown> | null = null;
    let tenantData: Record<string, unknown> | null = null;
    let client: Record<string, unknown> | null = null;
    let assignedUser: { email?: string; first_name?: string; last_name?: string } | null = null;
    let variables: Record<string, string> = {};

    if (task_id) {
      const { data: task, error: taskError } = await supabase.from("tasks_tenants")
        .select(`id,task_name,task_description,due_date,assigned_to,stage_id,tenant_id,
          package_stages!tasks_tenants_stage_id_fkey(id,stage_name,package_id,
            packages!package_stages_package_id_fkey(id,name,slug)),
          tenants!tasks_tenants_tenant_id_fkey(id,name)`)
        .eq("id", task_id).single();
      if (taskError || !task) throw new Error(`Task not found: ${taskError?.message}`);
      tenant_id = task.tenant_id;
      packageStage = Array.isArray(task.package_stages) ? task.package_stages[0] : task.package_stages;
      packageData = packageStage?.packages
        ? (Array.isArray(packageStage.packages) ? packageStage.packages[0] : packageStage.packages) as Record<string, unknown>
        : null;
      tenantData = Array.isArray(task.tenants) ? task.tenants[0] : task.tenants;
      const { data: cd } = await supabase.from("clients_legacy").select("*").eq("tenant_id", task.tenant_id).single();
      client = cd;
      const { data: ud, error: ue } = await supabase.from("users").select("email,first_name,last_name").eq("user_uuid", task.assigned_to).single();
      if (ue || !ud) throw new Error(`User not found: ${ue?.message}`);
      assignedUser = ud;
      variables = {
        client_name: escapeHtml(client?.contactname || client?.companyname || "Client"),
        company_name: escapeHtml(client?.companyname || ""),
        client_email: escapeHtml(client?.email || ""),
        client_phone: escapeHtml(client?.phone || ""),
        rto_id: escapeHtml(client?.rtoid || ""),
        rto_name: escapeHtml(client?.rto_name || ""),
        cricos_id: escapeHtml(client?.cricos_id || ""),
        task_name: escapeHtml(task.task_name || ""),
        task_description: escapeHtml(task.task_description || ""),
        due_date: task.due_date
          ? escapeHtml(new Date(task.due_date).toLocaleDateString("en-AU", { day: "numeric", month: "long", year: "numeric" }))
          : "",
        package_name: escapeHtml(packageData?.name || ""),
        stage_name: escapeHtml(packageStage?.stage_name || ""),
        assigned_to_name: escapeHtml(`${assignedUser.first_name || ""} ${assignedUser.last_name || ""}`.trim()),
        assigned_to_email: escapeHtml(assignedUser.email || ""),
        tenant_name: escapeHtml(tenantData?.name || ""),
        task_url: escapeHtml(resolveEmailUrl("task_url", appBase(), { task_id, tenant_id })),
      };
    } else if (document_id) {
      const { data: doc, error: de } = await supabase.from("package_documents")
        .select(`id,document_name,description,version_number,category,month,year,package_id,stage_id,
          packages!package_documents_package_id_fkey(id,name),
          package_stages!package_documents_stage_id_fkey(id,stage_name,package_id)`)
        .eq("id", document_id).single();
      if (de || !doc) throw new Error(`Document not found: ${de?.message}`);
      packageData = Array.isArray(doc.packages) ? doc.packages[0] : doc.packages;
      packageStage = Array.isArray(doc.package_stages) ? doc.package_stages[0] : doc.package_stages;
      const { data: pd } = await supabase.from("packages").select("tenant_id,tenants!packages_tenant_id_fkey(id,name)").eq("id", doc.package_id).single();
      if (pd) {
        tenant_id = pd.tenant_id;
        tenantData = Array.isArray(pd.tenants) ? pd.tenants[0] : pd.tenants;
      }
      variables = {
        document_name: escapeHtml(doc.document_name || ""),
        document_description: escapeHtml(doc.description || ""),
        document_version: doc.version_number ? escapeHtml(`v${doc.version_number}`) : "",
        document_category: escapeHtml(doc.category || ""),
        document_month: escapeHtml(doc.month || ""),
        document_year: escapeHtml(doc.year || ""),
        action_type: trigger_type === "document_added" ? "added" : "updated",
        package_name: escapeHtml(packageData?.name || ""),
        stage_name: escapeHtml(packageStage?.stage_name || ""),
        tenant_name: escapeHtml(tenantData?.name || ""),
      };
    } else {
      throw new Error("Either task_id, document_id, or an automation type must be provided");
    }

    if (!tenant_id) throw new Error("Could not determine tenant_id");

    const { data: email, error: ee } = await supabase.from("emails").select("*").eq("id", email_id).single();
    if (ee || !email) throw new Error(`Email template not found: ${ee?.message}`);

    const { data: attachments } = await supabase.from("email_attachments")
      .select("id,document_id,package_documents(document_name,file_path)")
      .eq("email_id", email_id).order("order_number");

    let subject = email.subject || "Task Assignment";
    let content = email.content || "";
    Object.entries(variables).forEach(([k, v]) => {
      const rx = new RegExp(`{{\\s*${k}\\s*}}`, "gi");
      subject = subject.replace(rx, v);
      content = content.replace(rx, v);
    });

    const recipientEmail = email.to || assignedUser?.email || client?.email;
    if (!recipientEmail) throw new Error("No recipient email found");

    const htmlContent = `<!DOCTYPE html><html><head><meta charset="utf-8"><style>body{margin:0;padding:0;background:#f6f8fb;font-family:Arial,Helvetica,sans-serif;color:#111}.container{max-width:560px;margin:0 auto;background:#fff}.header{background:#6b21a8;padding:24px;color:#fff;text-align:center}.content{padding:24px}.footer{padding:16px;text-align:center;color:#666;font-size:12px}a{color:#0ea5e9}</style></head><body><div class="container"><div class="header"><img src="${EMAIL_LOGO_URL}" alt="${EMAIL_LOGO_ALT}" style="height:40px;margin-bottom:12px"><h1 style="margin:0">Task Assignment</h1></div><div class="content">${content}${attachments && attachments.length > 0 ? `<div style="margin-top:24px;padding-top:16px;border-top:1px solid #e2e8f0"><p style="margin:0 0 8px;font-weight:600">Attachments:</p><ul>${attachments.map((a: { package_documents?: { document_name?: string } | Array<{ document_name?: string }> }) => {
      const d = Array.isArray(a.package_documents) ? a.package_documents[0] : a.package_documents;
      return `<li>${escapeHtml(d?.document_name || "Document")}</li>`;
    }).join("")}</ul></div>` : ""}</div><div class="footer">${variables.tenant_name || ""} &bull; Unicorn 2.0</div></div></body></html>`;

    const mgId = await sendViaMailgun(String(recipientEmail), undefined, subject, htmlContent);

    await supabase.from("email_automation_log").insert({
      tenant_id,
      trigger_type,
      trigger_entity_type: task_id ? "task" : "document",
      trigger_entity_id: task_id || document_id?.toString() || "",
      email_id,
      email_name: email.name || "Untitled",
      subject,
      recipient_email: recipientEmail,
      html_content: htmlContent,
      variables_used: variables,
      attachment_ids: attachments?.map((a: { id: string }) => a.id) || [],
      status: "sent",
      sent_at: new Date().toISOString(),
      mailgun_message_id: mgId,
    });

    return new Response(JSON.stringify({ success: true, message_id: mgId }), {
      status: 200,
      headers: { "Content-Type": "application/json", ...corsHeaders },
    });
  } catch (error: unknown) {
    console.error("Error in send-automated-email:", error);
    const message = error instanceof Error ? error.message : "Failed to send email";
    return new Response(JSON.stringify({ error: message }), {
      status: 500,
      headers: { "Content-Type": "application/json", ...corsHeaders },
    });
  }
};

serve(handler);
