import { serve } from "https://deno.land/std@0.190.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2.39.3";
import { corsHeaders } from "../_shared/cors.ts";
import { EMAIL_LOGO_ALT, EMAIL_LOGO_URL } from "../_shared/app-base-url.ts";

const MAILGUN_API_KEY = Deno.env.get("MAILGUN_API_KEY");
const MAILGUN_DOMAIN = Deno.env.get("MAILGUN_DOMAIN") || "mg.unicorn-cms.au";
const MAILGUN_FROM_EMAIL = Deno.env.get("MAILGUN_FROM_EMAIL") || "no-reply@mg.unicorn-cms.au";
const MAILGUN_FROM_NAME = Deno.env.get("MAILGUN_FROM_NAME") || "Unicorn CMS";
const MAILGUN_REGION = Deno.env.get("MAILGUN_REGION") || "EU";
const MAILGUN_API_BASE = MAILGUN_REGION === "EU" ? "https://api.eu.mailgun.net" : "https://api.mailgun.net";

async function sendViaMailgun(to: string, cc: string | undefined, subject: string, html: string, fromName?: string): Promise<string> {
  if (!MAILGUN_API_KEY) throw new Error("Mailgun API key not configured");
  const fd = new FormData();
  fd.append("from", `${fromName || MAILGUN_FROM_NAME} <${MAILGUN_FROM_EMAIL}>`);
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
  return `<!DOCTYPE html><html><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><style>body{margin:0;padding:0;background:#f6f8fb;font-family:Arial,Helvetica,sans-serif;color:#111}.wrap{max-width:580px;margin:0 auto;background:#fff}.hdr{background:#6b21a8;padding:24px;text-align:center;color:#fff}.hdr img{height:40px;margin-bottom:12px}.hdr h1{margin:0;font-size:20px;font-weight:600}.body{padding:28px 24px}.box{background:#f8f5ff;border:1px solid #e9d5ff;border-radius:8px;padding:16px;margin:16px 0}.item{display:flex;gap:8px;padding:6px 0;border-bottom:1px solid #f0e8ff}.item:last-child{border-bottom:none}.lbl{color:#6b7280;font-size:13px;min-width:140px}.val{font-size:13px;font-weight:500}.badge{display:inline-block;background:#7c3aed;color:#fff;padding:3px 10px;border-radius:20px;font-size:12px;font-weight:600}.warn{background:#fef9c3;border:1px solid #fde047;border-radius:8px;padding:12px 16px;margin:16px 0;font-size:13px}.list{margin:8px 0;padding-left:20px}.list li{padding:3px 0;font-size:13px}.ftr{padding:16px;text-align:center;color:#9ca3af;font-size:11px;border-top:1px solid #f3f4f6}</style></head><body><div class="wrap"><div class="hdr"><img src="${EMAIL_LOGO_URL}" alt="${EMAIL_LOGO_ALT}"><h1>${title}</h1></div><div class="body">${body}</div><div class="ftr">${footer} &bull; Unicorn 2.0 &bull; Compliance made simple</div></div></body></html>`;
}

async function handle24hrConfirmation(p: any, sb: any): Promise<Response> {
  const { rto_name, ceo_name, client_email, tenant_id, meeting_time, meeting_url, location, is_online, instructions, auditor_name, auditor_email, audit_id } = p;
  const { data: members } = await sb.from("tenant_members").select("users!inner(email)").eq("tenant_id", tenant_id).limit(5);
  const to: string[] = (members ?? []).map((m: any) => m.users?.email).filter(Boolean);
  if (client_email && to.length === 0) to.push(client_email);
  if (to.length === 0) throw new Error("No recipient for tenant " + tenant_id);
  const mtg = is_online
    ? (meeting_url ? `<div class="item"><span class="lbl">Meeting link</span><span class="val"><a href="${meeting_url}">${meeting_url}</a></span></div>` : `<div class="item"><span class="lbl">Format</span><span class="val">Online — link to follow</span></div>`)
    : `<div class="item"><span class="lbl">Location</span><span class="val">${location || "As advised"}</span></div>`;
  const body = `<p>Dear ${ceo_name || "Team"},</p><p>This is a reminder that your <strong>Compliance Health Check opening meeting</strong> is scheduled for <strong>tomorrow at ${meeting_time}</strong>.</p><div class="box"><div class="item"><span class="lbl">Meeting time</span><span class="val"><strong>Tomorrow at ${meeting_time}</strong></span></div>${mtg}<div class="item"><span class="lbl">Your consultant</span><span class="val">${auditor_name}</span></div></div><p><strong>Before the meeting, please confirm:</strong></p><ul class="list"><li>All required documents have been uploaded to your evidence portal</li><li>Your CEO / Principal is available for the full meeting duration</li><li>Your compliance team lead is available if needed</li>${is_online && meeting_url ? "<li>Test your meeting link now</li>" : ""}</ul>${instructions ? `<div class="box">${instructions}</div>` : ""}<p>We look forward to working with you tomorrow.</p><p>Warm regards,<br><strong>${auditor_name}</strong><br>Vivacity Coaching &amp; Consulting</p>`;
  const id = await sendViaMailgun(to.join(","), auditor_email, `Reminder: Compliance Health Check tomorrow — ${rto_name}`, wrapHtml("Opening Meeting Tomorrow", body), `${auditor_name} — Vivacity`);
  await sb.from("notification_schedule").insert({ tenant_id, notification_type: "audit_24hr_confirmation", payload: { audit_id, mailgun_id: id, sent_to: to }, scheduled_for: new Date().toISOString(), status: "sent" });
  return new Response(JSON.stringify({ success: true, message_id: id }), { status: 200, headers: { "Content-Type": "application/json", ...corsHeaders } });
}

async function handleEvidenceReminder(p: any, sb: any): Promise<Response> {
  const { rto_name, ceo_name, client_email, tenant_id, days_left, outstanding_count, outstanding_items, auditor_name, auditor_email, audit_id, request_id } = p;
  const { data: members } = await sb.from("tenant_members").select("users!inner(email)").eq("tenant_id", tenant_id).limit(5);
  const to: string[] = (members ?? []).map((m: any) => m.users?.email).filter(Boolean);
  if (client_email && to.length === 0) to.push(client_email);
  if (to.length === 0) throw new Error("No recipient for tenant " + tenant_id);
  const urgency = days_left === 1 ? "tomorrow" : `in ${days_left} days`;
  const items = outstanding_items ? outstanding_items.split("\n").map((i: string) => `<li>${i.replace(/^•\s*/, "")}</li>`).join("") : "";
  const body = `<p>Dear ${ceo_name || "Team"},</p><p>Your compliance health check evidence is due <strong>${urgency}</strong> and we are still waiting on <strong>${outstanding_count} document${outstanding_count > 1 ? "s" : ""}</strong>.</p><div class="warn">⏰ <strong>Action required:</strong> Please upload outstanding documents to your evidence portal before the deadline.</div><div class="box"><p style="margin:0 0 8px;font-weight:600;font-size:13px">Still needed:</p><ul class="list">${items}</ul></div><p>Log in to your Vivacity portal to upload. Your consultant cannot begin document review until all evidence is received.</p><p>Warm regards,<br><strong>${auditor_name}</strong><br>Vivacity Coaching &amp; Consulting</p>`;
  const id = await sendViaMailgun(to.join(","), auditor_email, `Action required: ${outstanding_count} document${outstanding_count > 1 ? "s" : ""} outstanding — due ${urgency} — ${rto_name}`, wrapHtml("Evidence Deadline Reminder", body), `${auditor_name} — Vivacity`);
  await sb.from("notification_schedule").insert({ tenant_id, notification_type: "audit_evidence_reminder", payload: { audit_id, request_id, days_left, outstanding_count, mailgun_id: id }, scheduled_for: new Date().toISOString(), status: "sent" });
  return new Response(JSON.stringify({ success: true, message_id: id }), { status: 200, headers: { "Content-Type": "application/json", ...corsHeaders } });
}

async function handleDocsReady(p: any, sb: any): Promise<Response> {
  const { audit_id, request_id, rto_name, items_received, items_total, auditor_email, auditor_name, opening_meeting } = p;
  const mtgText = opening_meeting ? new Date(opening_meeting).toLocaleString("en-AU", { timeZone: "Australia/Sydney", dateStyle: "full", timeStyle: "short" }) : "Not yet scheduled";
  const firstName = (auditor_name || "Team").split(" ")[0];
  const body = `<p>Hi ${firstName},</p><p>All evidence has been received for <strong>${rto_name}</strong>. You can now begin the document review.</p><div class="box"><div class="item"><span class="lbl">Documents received</span><span class="val"><span class="badge">${items_received}/${items_total} complete</span></span></div><div class="item"><span class="lbl">Opening meeting</span><span class="val">${mtgText}</span></div></div><p>Open the audit workspace to begin your independent document review. AI pre-analysis is running — check the Documents tab for insights when ready.</p>`;
  const id = await sendViaMailgun(auditor_email, undefined, `✅ All evidence received — ${rto_name} — ready for document review`, wrapHtml("Evidence Ready for Review", body), "Unicorn 2.0 — Audit Workspace");
  await sb.from("notification_schedule").insert({ tenant_id: null, notification_type: "audit_docs_ready", payload: { audit_id, request_id, rto_name, auditor_email, mailgun_id: id }, scheduled_for: new Date().toISOString(), status: "sent" });
  return new Response(JSON.stringify({ success: true, message_id: id }), { status: 200, headers: { "Content-Type": "application/json", ...corsHeaders } });
}

const handler = async (req: Request): Promise<Response> => {
  if (req.method === "OPTIONS") return new Response(null, { headers: corsHeaders });
  try {
    const body = await req.json();
    if (!MAILGUN_API_KEY) throw new Error("Mailgun API key not configured");
    const supabase = createClient(Deno.env.get("SUPABASE_URL") ?? "", Deno.env.get("SUPABASE_SERVICE_ROLE_KEY") ?? "");

    if (body.automation === "audit_24hr_confirmation") return await handle24hrConfirmation(body, supabase);
    if (body.automation === "audit_evidence_reminder") return await handleEvidenceReminder(body, supabase);
    if (body.automation === "audit_docs_ready") return await handleDocsReady(body, supabase);

    const { task_id, document_id, email_id, trigger_type } = body;
    let tenant_id: number | undefined;
    let packageStage: any, packageData: any, tenantData: any, client: any;
    let assignedUser: any;
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
      packageData = packageStage?.packages ? (Array.isArray(packageStage.packages) ? packageStage.packages[0] : packageStage.packages) : null;
      tenantData = Array.isArray(task.tenants) ? task.tenants[0] : task.tenants;
      const { data: cd } = await supabase.from("clients_legacy").select("*").eq("tenant_id", task.tenant_id).single();
      client = cd;
      const { data: ud, error: ue } = await supabase.from("users").select("email,first_name,last_name").eq("user_uuid", task.assigned_to).single();
      if (ue || !ud) throw new Error(`User not found: ${ue?.message}`);
      assignedUser = ud;
      variables = {
        client_name: client?.contactname || client?.companyname || "Client",
        company_name: client?.companyname || "",
        client_email: client?.email || "",
        client_phone: client?.phone || "",
        rto_id: client?.rtoid || "",
        rto_name: client?.rto_name || "",
        cricos_id: client?.cricos_id || "",
        task_name: task.task_name || "",
        task_description: task.task_description || "",
        due_date: task.due_date ? new Date(task.due_date).toLocaleDateString("en-AU", { day: "numeric", month: "long", year: "numeric" }) : "",
        package_name: packageData?.name || "",
        stage_name: packageStage?.stage_name || "",
        assigned_to_name: `${assignedUser.first_name || ""} ${assignedUser.last_name || ""}`.trim(),
        assigned_to_email: assignedUser.email || "",
        tenant_name: tenantData?.name || "",
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
        document_name: doc.document_name || "",
        document_description: doc.description || "",
        document_version: doc.version_number ? `v${doc.version_number}` : "",
        document_category: doc.category || "",
        document_month: doc.month || "",
        document_year: doc.year || "",
        action_type: trigger_type === "document_added" ? "added" : "updated",
        package_name: packageData?.name || "",
        stage_name: packageStage?.stage_name || "",
        tenant_name: tenantData?.name || "",
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

    const htmlContent = `<!DOCTYPE html><html><head><meta charset="utf-8"><style>body{margin:0;padding:0;background:#f6f8fb;font-family:Arial,Helvetica,sans-serif;color:#111}.container{max-width:560px;margin:0 auto;background:#fff}.header{background:#6b21a8;padding:24px;color:#fff;text-align:center}.content{padding:24px}.footer{padding:16px;text-align:center;color:#666;font-size:12px}a{color:#0ea5e9}</style></head><body><div class="container"><div class="header"><img src="${EMAIL_LOGO_URL}" alt="${EMAIL_LOGO_ALT}" style="height:40px;margin-bottom:12px"><h1 style="margin:0">Task Assignment</h1></div><div class="content">${content}${attachments && attachments.length > 0 ? `<div style="margin-top:24px;padding-top:16px;border-top:1px solid #e2e8f0"><p style="margin:0 0 8px;font-weight:600">Attachments:</p><ul>${attachments.map((a: any) => { const d = Array.isArray(a.package_documents) ? a.package_documents[0] : a.package_documents; return `<li>${d?.document_name || "Document"}</li>`; }).join("")}</ul></div>` : ""}</div><div class="footer">${variables.tenant_name || ""} &bull; Unicorn 2.0</div></div></body></html>`;

    const mgId = await sendViaMailgun(recipientEmail, undefined, subject, htmlContent);

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
      attachment_ids: attachments?.map((a: any) => a.id) || [],
      status: "sent",
      sent_at: new Date().toISOString(),
      mailgun_message_id: mgId,
    });

    return new Response(JSON.stringify({ success: true, message_id: mgId }), {
      status: 200,
      headers: { "Content-Type": "application/json", ...corsHeaders },
    });
  } catch (error: any) {
    console.error("Error in send-automated-email:", error);
    return new Response(JSON.stringify({ error: error.message }), {
      status: 500,
      headers: { "Content-Type": "application/json", ...corsHeaders },
    });
  }
};

serve(handler);
