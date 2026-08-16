/**
 * generate-notifications edge function
 *
 * Scans tasks_tenants, meetings + meeting_participants, and calendar_entries
 * to create deduplicated rows in user_notifications.
 *
 * Called by pg_cron via pg_net:
 *   - Hourly  with { "scope": "meetings" }
 *   - Daily   with { "scope": "tasks_obligations" }
 */

import { corsHeaders } from "../_shared/cors.ts";
import { createServiceClient, createUserClient } from "../_shared/supabase-client.ts";
import {
  cronUnauthorizedResponse,
  getUserIdFromJwt,
  isCronAuthorized,
} from "../_shared/cron-auth.ts";

interface NotificationRow {
  tenant_id: number;
  user_id: string;
  type: string;
  title: string;
  message: string;
  link: string;
  is_read: boolean;
  dedupe_key: string;
}

interface CategoryPrefs {
  tasks: boolean;
  meetings: boolean;
  obligations: boolean;
  events: boolean;
}

// ── helpers ────────────────────────────────────────────────────────

function taskWindow(dueDate: string, today: string): { window: string; label: string } | null {
  const due = new Date(dueDate + "T00:00:00Z");
  const now = new Date(today + "T00:00:00Z");
  const diffDays = Math.round((due.getTime() - now.getTime()) / 86_400_000);

  if (diffDays === 7) return { window: "7d", label: "due in 7 days" };
  if (diffDays === 1) return { window: "1d", label: "due tomorrow" };
  if (diffDays === 0) return { window: "today", label: "due today" };
  if (diffDays >= -3 && diffDays < 0) {
    const offset = Math.abs(diffDays);
    return { window: `overdue_${offset}`, label: `overdue by ${offset} day${offset > 1 ? "s" : ""}` };
  }
  return null;
}

function obligationWindow(entryDate: string, today: string): { window: string; label: string } | null {
  const entry = new Date(entryDate + "T00:00:00Z");
  const now = new Date(today + "T00:00:00Z");
  const diffDays = Math.round((entry.getTime() - now.getTime()) / 86_400_000);

  if (diffDays === 30) return { window: "30d", label: "due in 30 days" };
  if (diffDays === 7) return { window: "7d", label: "due in 7 days" };
  if (diffDays === 1) return { window: "1d", label: "due tomorrow" };
  if (diffDays === 0) return { window: "today", label: "due today" };
  if (diffDays >= -3 && diffDays < 0) {
    const offset = Math.abs(diffDays);
    return { window: `overdue_${offset}`, label: `overdue by ${offset} day${offset > 1 ? "s" : ""}` };
  }
  return null;
}

function meetingWindow(startsAt: string): { window: string; label: string } | null {
  const start = new Date(startsAt).getTime();
  const now = Date.now();
  const diffMin = (start - now) / 60_000;

  if (diffMin >= 1425 && diffMin <= 1455) return { window: "24h", label: "in 24 hours" };
  if (diffMin >= 50 && diffMin <= 70) return { window: "1h", label: "in 1 hour" };
  return null;
}

function todayUTC(): string {
  return new Date().toISOString().slice(0, 10);
}

// ── prefs helper ──────────────────────────────────────────────────

function parseUserCategoryPrefs(eventSettings: unknown): CategoryPrefs {
  const defaults: CategoryPrefs = { tasks: true, meetings: true, obligations: true, events: true };
  if (typeof eventSettings === "object" && eventSettings !== null) {
    const es = eventSettings as Record<string, unknown>;
    if (typeof es.categories === "object" && es.categories !== null) {
      const cats = es.categories as Record<string, unknown>;
      return {
        tasks: cats.tasks !== false,
        meetings: cats.meetings !== false,
        obligations: cats.obligations !== false,
        events: cats.events !== false,
      };
    }
  }
  return defaults;
}

/**
 * Batch-fetch notification prefs for a set of user IDs.
 * Returns a map from user_id → CategoryPrefs.
 * Users without prefs get all-true defaults.
 */
async function fetchUserPrefs(
  supabase: ReturnType<typeof createServiceClient>,
  userIds: string[]
): Promise<Map<string, CategoryPrefs>> {
  const prefsMap = new Map<string, CategoryPrefs>();
  const defaults: CategoryPrefs = { tasks: true, meetings: true, obligations: true, events: true };

  if (!userIds.length) return prefsMap;

  const uniqueIds = [...new Set(userIds)];
  const { data, error } = await supabase
    .from("user_notification_prefs")
    .select("user_id, event_settings")
    .in("user_id", uniqueIds);

  if (error) {
    console.error("Prefs fetch error:", error.message);
    // Default to all-enabled on error
    for (const uid of uniqueIds) prefsMap.set(uid, { ...defaults });
    return prefsMap;
  }

  const fetched = new Set<string>();
  for (const row of data || []) {
    prefsMap.set(row.user_id, parseUserCategoryPrefs(row.event_settings));
    fetched.add(row.user_id);
  }
  // Users without prefs row get defaults
  for (const uid of uniqueIds) {
    if (!fetched.has(uid)) prefsMap.set(uid, { ...defaults });
  }

  return prefsMap;
}

// ── scope handlers ─────────────────────────────────────────────────

async function generateTaskNotifications(supabase: ReturnType<typeof createServiceClient>): Promise<number> {
  const today = todayUTC();
  const todayDate = new Date(today + "T00:00:00Z");

  const minDate = new Date(todayDate.getTime() - 3 * 86_400_000).toISOString().slice(0, 10);
  const maxDate = new Date(todayDate.getTime() + 7 * 86_400_000).toISOString().slice(0, 10);

  const { data: tasks, error } = await supabase
    .from("tasks_tenants")
    .select("id, tenant_id, task_name, due_date, status, completed, created_by, followers")
    .not("due_date", "is", null)
    .or("completed.is.null,completed.eq.false")
    .gte("due_date", minDate)
    .lte("due_date", maxDate);

  if (error) {
    console.error("Task query error:", error.message);
    return 0;
  }
  if (!tasks?.length) return 0;

  // Collect recipient IDs (creator + followers) and fetch their prefs
  const recipientIds: string[] = [];
  for (const t of tasks) {
    if (t.created_by) recipientIds.push(t.created_by);
    if (Array.isArray(t.followers)) {
      for (const f of t.followers) if (f) recipientIds.push(f);
    }
  }
  const prefsMap = await fetchUserPrefs(supabase, recipientIds);

  const rows: NotificationRow[] = [];
  for (const t of tasks) {
    if (!t.due_date) continue;

    const w = taskWindow(t.due_date, today);
    if (!w) continue;

    const recipientSet = new Set<string>(
      [t.created_by, ...(Array.isArray(t.followers) ? t.followers : [])].filter(Boolean) as string[]
    );

    for (const uid of recipientSet) {
      const userPrefs = prefsMap.get(uid);
      if (userPrefs && !userPrefs.tasks) continue;

      rows.push({
        tenant_id: t.tenant_id,
        user_id: uid,
        type: "task_due",
        title: `Task ${w.label}: ${t.task_name || "Untitled task"}`,
        message: `Status: ${t.status || "open"} · Due: ${t.due_date}`,
        link: `/client/tasks?task_id=${t.id}`,
        is_read: false,
        dedupe_key: `task_due:${t.id}:${w.window}:${uid}`,
      });
    }
  }

  if (!rows.length) return 0;

  const { data: result, error: upsertErr } = await supabase
    .from("user_notifications")
    .upsert(rows as any, { onConflict: "dedupe_key", ignoreDuplicates: true })
    .select("id");

  if (upsertErr) {
    console.error("Task upsert error:", upsertErr.message);
    return 0;
  }
  return result?.length ?? 0;
}

async function generateMeetingNotifications(supabase: ReturnType<typeof createServiceClient>): Promise<number> {
  const now = new Date();
  const min1h = new Date(now.getTime() + 50 * 60_000).toISOString();
  const max24h = new Date(now.getTime() + 24.25 * 3_600_000).toISOString();

  const { data: meetings, error } = await supabase
    .from("meetings")
    .select("id, tenant_id, title, starts_at, owner_user_uuid")
    .not("starts_at", "is", null)
    .gte("starts_at", min1h)
    .lte("starts_at", max24h);

  if (error) {
    console.error("Meeting query error:", error.message);
    return 0;
  }
  if (!meetings?.length) return 0;

  const meetingIds = meetings.map((m) => m.id);
  const { data: participants } = await supabase
    .from("meeting_participants")
    .select("meeting_id, participant_email")
    .in("meeting_id", meetingIds);

  const emails = [...new Set((participants || []).map((p) => p.participant_email?.toLowerCase()).filter(Boolean))];
  let emailToUser: Record<string, string> = {};
  if (emails.length) {
    const { data: users } = await supabase
      .from("users")
      .select("user_uuid, email")
      .in("email", emails);
    if (users) {
      for (const u of users) {
        if (u.email) emailToUser[u.email.toLowerCase()] = u.user_uuid;
      }
    }
  }

  // Collect all potential recipient IDs and fetch prefs
  const allRecipientIds = new Set<string>();
  for (const m of meetings) {
    if (m.owner_user_uuid) allRecipientIds.add(m.owner_user_uuid);
  }
  for (const p of participants || []) {
    const uid = emailToUser[p.participant_email?.toLowerCase()];
    if (uid) allRecipientIds.add(uid);
  }
  const prefsMap = await fetchUserPrefs(supabase, [...allRecipientIds]);

  const rows: NotificationRow[] = [];

  for (const m of meetings) {
    const w = meetingWindow(m.starts_at);
    if (!w) continue;

    const recipientSet = new Set<string>();
    if (m.owner_user_uuid) recipientSet.add(m.owner_user_uuid);

    const meetingParticipants = (participants || []).filter((p) => p.meeting_id === m.id);
    for (const p of meetingParticipants) {
      const uid = emailToUser[p.participant_email?.toLowerCase()];
      if (uid) recipientSet.add(uid);
    }

    for (const userId of recipientSet) {
      // Check user prefs
      const userPrefs = prefsMap.get(userId);
      if (userPrefs && !userPrefs.meetings) continue;

      rows.push({
        tenant_id: m.tenant_id,
        user_id: userId,
        type: "meeting_upcoming",
        title: `Meeting ${w.label}: ${m.title || "Untitled meeting"}`,
        message: `Starts at ${new Date(m.starts_at).toLocaleString()}`,
        link: `/client/calendar?tab=reminders&meeting_id=${m.id}`,
        is_read: false,
        dedupe_key: `meeting_upcoming:${m.id}:${w.window}:${userId}`,
      });
    }
  }

  if (!rows.length) return 0;

  const { data: result, error: upsertErr } = await supabase
    .from("user_notifications")
    .upsert(rows as any, { onConflict: "dedupe_key", ignoreDuplicates: true })
    .select("id");

  if (upsertErr) {
    console.error("Meeting upsert error:", upsertErr.message);
    return 0;
  }
  return result?.length ?? 0;
}

async function generateObligationNotifications(supabase: ReturnType<typeof createServiceClient>): Promise<number> {
  const today = todayUTC();
  const todayDate = new Date(today + "T00:00:00Z");

  const minDate = new Date(todayDate.getTime() - 3 * 86_400_000).toISOString().slice(0, 10);
  const maxDate = new Date(todayDate.getTime() + 30 * 86_400_000).toISOString().slice(0, 10);

  const { data: entries, error } = await supabase
    .from("calendar_entries")
    .select("id, tenant_id, title, description, entry_date, created_by")
    .not("entry_date", "is", null)
    .gte("entry_date", minDate)
    .lte("entry_date", maxDate)
    .or("title.ilike.[OBLIGATION]%,description.ilike.%type=obligation%");

  if (error) {
    console.error("Obligation query error:", error.message);
    return 0;
  }
  if (!entries?.length) return 0;

  // Collect recipient IDs and fetch prefs
  const recipientIds = entries.map((e) => e.created_by).filter(Boolean) as string[];
  const prefsMap = await fetchUserPrefs(supabase, recipientIds);

  const rows: NotificationRow[] = [];
  for (const e of entries) {
    if (!e.created_by || !e.entry_date) continue;

    // Check user prefs
    const userPrefs = prefsMap.get(e.created_by);
    if (userPrefs && !userPrefs.obligations) continue;

    const w = obligationWindow(e.entry_date, today);
    if (!w) continue;

    rows.push({
      tenant_id: e.tenant_id,
      user_id: e.created_by,
      type: "obligation_due",
      title: `Obligation ${w.label}: ${e.title || "Untitled obligation"}`,
      message: `Due: ${e.entry_date}`,
      link: `/client/calendar?tab=reminders&reminder_id=${e.id}`,
      is_read: false,
      dedupe_key: `obligation_due:${e.id}:${w.window}`,
    });
  }

  if (!rows.length) return 0;

  const { data: result, error: upsertErr } = await supabase
    .from("user_notifications")
    .upsert(rows as any, { onConflict: "dedupe_key", ignoreDuplicates: true })
    .select("id");

  if (upsertErr) {
    console.error("Obligation upsert error:", upsertErr.message);
    return 0;
  }
  return result?.length ?? 0;
}

// ── reporting_obligations scope ────────────────────────────────────

type ReportingMode = "scheduled" | "preview" | "broadcast";

interface ReportingReminderRow {
  tenant_id: number;
  obligation_id: number;
  code: string | null;
  title: string | null;
  description: string | null;
  audience: string | null;
  recurrence: string | null;
  next_date: string | null;
  window_opens_at: string | null;
  cta_label: string | null;
  cta_url: string | null;
  sort_order: number | null;
  days_until: number | null;
  status: string | null;
}

interface ReportingObligationMeta {
  id: number;
  title: string | null;
  description: string | null;
  notification_message: string | null;
  cta_url: string | null;
  lead_times: number[] | null;
}

function getTodayAest(): string {
  // Compute today's date in Australia/Sydney without a DB round trip.
  const fmt = new Intl.DateTimeFormat("en-CA", {
    timeZone: "Australia/Sydney",
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  });
  return fmt.format(new Date()); // YYYY-MM-DD
}

function recomputeDaysUntilAest(nextDate: string | null, todayAest: string): number | null {
  if (!nextDate) return null;
  const a = new Date(nextDate + "T00:00:00Z").getTime();
  const b = new Date(todayAest + "T00:00:00Z").getTime();
  return Math.round((a - b) / 86_400_000);
}

async function fetchTestTenantIdSet(
  supabase: ReturnType<typeof createServiceClient>,
  tenantIds: number[]
): Promise<Set<number>> {
  const exclude = new Set<number>();
  if (!tenantIds.length) return exclude;
  const unique = [...new Set(tenantIds)];
  const { data, error } = await supabase
    .from("tenants")
    .select("id, name")
    .in("id", unique)
    .ilike("name", "test%");
  if (error) {
    console.error("test-tenant fetch error:", error.message);
    return exclude;
  }
  for (const t of data || []) exclude.add(Number(t.id));
  return exclude;
}

async function fetchReportingObligationsMeta(
  supabase: ReturnType<typeof createServiceClient>,
  obligationIds: number[]
): Promise<Map<number, ReportingObligationMeta>> {
  const map = new Map<number, ReportingObligationMeta>();
  if (!obligationIds.length) return map;
  const unique = [...new Set(obligationIds)];
  const { data, error } = await supabase
    .from("compliance_obligations")
    .select("id, title, description, notification_message, cta_url, lead_times")
    .in("id", unique);
  if (error) {
    console.error("obligation meta fetch error:", error.message);
    return map;
  }
  for (const row of data || []) {
    map.set(Number(row.id), {
      id: Number(row.id),
      title: row.title,
      description: row.description,
      notification_message: row.notification_message,
      cta_url: row.cta_url,
      lead_times: row.lead_times as number[] | null,
    });
  }
  return map;
}

async function fetchRecipientsByTenant(
  supabase: ReturnType<typeof createServiceClient>,
  tenantIds: number[]
): Promise<Map<number, string[]>> {
  const byTenant = new Map<number, string[]>();
  if (!tenantIds.length) return byTenant;
  const unique = [...new Set(tenantIds)];

  const { data, error } = await supabase
    .from("tenant_users")
    .select("tenant_id, user_id, relationship_role, access_scope")
    .in("tenant_id", unique)
    .in("relationship_role", ["primary_contact", "secondary_contact", "user"]);

  if (error) {
    console.error("tenant_users fetch error:", error.message);
    return byTenant;
  }
  for (const row of data || []) {
    if (!row.user_id) continue;
    if (row.access_scope && row.access_scope === "academy_only") continue;
    const tid = Number(row.tenant_id);
    const arr = byTenant.get(tid) || [];
    if (!arr.includes(row.user_id)) arr.push(row.user_id);
    byTenant.set(tid, arr);
  }
  return byTenant;
}

function buildReportingMessage(meta: ReportingObligationMeta): string {
  const nm = (meta.notification_message || "").trim();
  if (nm.length > 0) return nm;
  const desc = (meta.description || "").trim();
  return desc.length > 1000 ? desc.slice(0, 1000) : desc;
}

function leadWindowToken(daysUntil: number, leadTimes: number[]): string | null {
  if (daysUntil === -1) return "overdue";
  if (daysUntil === 0) return "due_today";
  if (leadTimes.includes(daysUntil)) return `${daysUntil}`;
  return null;
}

async function upsertNotificationsChunked(
  supabase: ReturnType<typeof createServiceClient>,
  rows: NotificationRow[]
): Promise<number> {
  if (!rows.length) return 0;
  let inserted = 0;
  const chunkSize = 500;
  for (let i = 0; i < rows.length; i += chunkSize) {
    const chunk = rows.slice(i, i + chunkSize);
    const { data, error } = await supabase
      .from("user_notifications")
      .upsert(chunk as any, { onConflict: "dedupe_key", ignoreDuplicates: true })
      .select("id");
    if (error) {
      console.error("reporting upsert error:", error.message);
      continue;
    }
    inserted += data?.length ?? 0;
  }
  return inserted;
}

async function runReportingObligations(
  supabase: ReturnType<typeof createServiceClient>,
  opts: { mode: ReportingMode; obligationId?: number; actorUserId?: string }
): Promise<Record<string, unknown>> {
  const { mode, obligationId } = opts;
  const todayAest = getTodayAest();

  // 1. Fetch view rows
  let query = supabase.from("v_client_reporting_reminders").select("*");
  if (mode !== "scheduled" && obligationId != null) {
    query = query.eq("obligation_id", obligationId);
  }
  const { data: viewRows, error: viewErr } = await query;
  if (viewErr) {
    console.error("view fetch error:", viewErr.message);
    return mode === "preview"
      ? { tenant_count: 0, user_count: 0, sample_tenants: [] }
      : { inserted: 0 };
  }
  let rows = (viewRows || []) as ReportingReminderRow[];

  // 2. Exclude test tenants
  const allTenantIds = rows.map((r) => Number(r.tenant_id));
  const excludeTenants = await fetchTestTenantIdSet(supabase, allTenantIds);
  if (excludeTenants.size) {
    rows = rows.filter((r) => !excludeTenants.has(Number(r.tenant_id)));
  }

  // 3. Obligation meta (for lead_times + message + link)
  const obligationIds = [...new Set(rows.map((r) => Number(r.obligation_id)))];
  const metaMap = await fetchReportingObligationsMeta(supabase, obligationIds);

  // 4. Lead-time filter (scheduled only)
  if (mode === "scheduled") {
    rows = rows.filter((r) => {
      if (r.recurrence === "always_open" || r.recurrence === "rolling_per_tenant") return false;
      const meta = metaMap.get(Number(r.obligation_id));
      if (!meta) return false;
      const dUntil = recomputeDaysUntilAest(r.next_date, todayAest);
      if (dUntil == null) return false;
      const lt = meta.lead_times || [];
      return dUntil === 0 || dUntil === -1 || lt.includes(dUntil);
    });
  }

  // 5. Recipients per tenant
  const tenantIds = [...new Set(rows.map((r) => Number(r.tenant_id)))];
  const recipientsByTenant = await fetchRecipientsByTenant(supabase, tenantIds);

  // honour user prefs (obligations category)
  const allUserIds = new Set<string>();
  for (const list of recipientsByTenant.values()) for (const u of list) allUserIds.add(u);
  const prefsMap = await fetchUserPrefs(supabase, [...allUserIds]);

  // PREVIEW MODE
  if (mode === "preview") {
    const tenantSet = new Set<number>();
    const userSet = new Set<string>();
    for (const r of rows) {
      const tid = Number(r.tenant_id);
      const recips = recipientsByTenant.get(tid) || [];
      const allowed = recips.filter((uid) => {
        const p = prefsMap.get(uid);
        return !p || p.obligations !== false;
      });
      if (allowed.length === 0) continue;
      tenantSet.add(tid);
      for (const u of allowed) userSet.add(u);
    }
    // sample tenant names
    const sampleIds = [...tenantSet].slice(0, 10);
    let sampleTenants: string[] = [];
    if (sampleIds.length) {
      const { data: tdata } = await supabase
        .from("tenants")
        .select("id, name")
        .in("id", sampleIds);
      sampleTenants = (tdata || []).map((t: any) => t.name).filter(Boolean);
    }
    return {
      tenant_count: tenantSet.size,
      user_count: userSet.size,
      sample_tenants: sampleTenants,
    };
  }

  // 6. Build notification rows
  const broadcastMinute = new Date().toISOString().slice(0, 16);
  const notifRows: NotificationRow[] = [];
  const tenantSet = new Set<number>();
  const userSet = new Set<string>();

  for (const r of rows) {
    const meta = metaMap.get(Number(r.obligation_id));
    if (!meta) continue;
    const tid = Number(r.tenant_id);
    const recips = recipientsByTenant.get(tid) || [];
    if (!recips.length) continue;

    const title = meta.title || r.title || "Reporting obligation";
    const message = buildReportingMessage(meta);
    const link = meta.cta_url || r.cta_url || "";

    let leadToken: string | null = null;
    let cycleYear = "none";
    if (mode === "scheduled") {
      const dUntil = recomputeDaysUntilAest(r.next_date, todayAest);
      if (dUntil == null) continue;
      leadToken = leadWindowToken(dUntil, meta.lead_times || []);
      if (!leadToken) continue;
      cycleYear = r.next_date ? String(new Date(r.next_date + "T00:00:00Z").getUTCFullYear()) : "none";
    }

    for (const uid of recips) {
      const p = prefsMap.get(uid);
      if (p && p.obligations === false) continue;

      const dedupeKey =
        mode === "scheduled"
          ? `reporting_obligation:${meta.id}:${tid}:${uid}:${cycleYear}:lt${leadToken}`
          : `reporting_obligation:${meta.id}:${tid}:${uid}:broadcast:${broadcastMinute}`;

      notifRows.push({
        tenant_id: tid,
        user_id: uid,
        type: "reporting_obligation_due",
        title,
        message,
        link,
        is_read: false,
        dedupe_key: dedupeKey,
      });
      tenantSet.add(tid);
      userSet.add(uid);
    }
  }

  // 7. Upsert
  const inserted = await upsertNotificationsChunked(supabase, notifRows);

  // 8. Broadcast audit row
  if (mode === "broadcast" && obligationId != null) {
    const { error: auditErr } = await supabase.from("audit_events").insert({
      entity: "reporting_obligation",
      action: "broadcast",
      user_id: opts.actorUserId ?? null,
      details: {
        obligation_id: obligationId,
        tenant_count: tenantSet.size,
        user_count: userSet.size,
        notifications_inserted: inserted,
      },
    } as any);
    if (auditErr) console.error("audit_events insert error:", auditErr.message);
  }

  return { inserted };
}

// ── main handler ───────────────────────────────────────────────────

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") {
    return new Response("ok", { headers: corsHeaders(req) });
  }

  try {
    const supabase = createServiceClient();

    let scope = "all";
    let body: Record<string, unknown> = {};
    try {
      body = (await req.json()) ?? {};
      if (body?.scope && typeof body.scope === "string") scope = body.scope;
    } catch {
      // no body or invalid JSON – run all scopes
    }

    // ── reporting_obligations scope ───────────────────────────────
    if (scope === "reporting_obligations") {
      const isPreview = body.preview === true;
      const isBroadcast = body.broadcast === true;
      const obligationIdRaw = body.obligation_id;
      const obligationId =
        typeof obligationIdRaw === "number"
          ? obligationIdRaw
          : typeof obligationIdRaw === "string" && obligationIdRaw.trim() !== ""
          ? Number(obligationIdRaw)
          : undefined;

      // Scheduled: cron path, no JWT check (matches existing scopes).
      // Preview/Broadcast: must be a super-admin.
      let actorUserId: string | undefined;
      if (isPreview || isBroadcast) {
        const authHeader = req.headers.get("Authorization");
        if (!authHeader?.startsWith("Bearer ")) {
          return new Response(JSON.stringify({ error: "Unauthorized" }), {
            status: 401,
            headers: { ...corsHeaders(req), "Content-Type": "application/json" },
          });
        }
        const token = authHeader.replace("Bearer ", "");
        const userClient = createUserClient(authHeader);
        const { data: claimsData, error: claimsErr } = await userClient.auth.getClaims(token);
        if (claimsErr || !claimsData?.claims?.sub) {
          return new Response(JSON.stringify({ error: "Unauthorized" }), {
            status: 401,
            headers: { ...corsHeaders(req), "Content-Type": "application/json" },
          });
        }
        actorUserId = claimsData.claims.sub as string;
        const { data: isSa, error: saErr } = await supabase.rpc("is_super_admin_safe", {
          p_user_id: actorUserId,
        });
        if (saErr || isSa !== true) {
          return new Response(JSON.stringify({ error: "Forbidden" }), {
            status: 403,
            headers: { ...corsHeaders(req), "Content-Type": "application/json" },
          });
        }
        if (obligationId == null || Number.isNaN(obligationId)) {
          return new Response(JSON.stringify({ error: "obligation_id required" }), {
            status: 400,
            headers: { ...corsHeaders(req), "Content-Type": "application/json" },
          });
        }
      } else if (!await isCronAuthorized(req)) {
        const token = req.headers.get("Authorization")?.replace(/^Bearer\s+/i, "").trim();
        if (!token) return cronUnauthorizedResponse(req, corsHeaders);
        const userId = await getUserIdFromJwt(supabase, token);
        if (!userId) return cronUnauthorizedResponse(req, corsHeaders);
        const { data: isSa, error: saErr } = await supabase.rpc("is_super_admin_safe", {
          p_user_id: userId,
        });
        if (saErr || isSa !== true) {
          return new Response(JSON.stringify({ error: "Forbidden" }), {
            status: 403,
            headers: { ...corsHeaders(req), "Content-Type": "application/json" },
          });
        }
      }

      const mode: ReportingMode = isPreview ? "preview" : isBroadcast ? "broadcast" : "scheduled";
      const result = await runReportingObligations(supabase, { mode, obligationId, actorUserId });

      const payload = { scope, mode, ...result, ran_at: new Date().toISOString() };
      console.log("generate-notifications summary:", JSON.stringify(payload));
      return new Response(JSON.stringify(payload), {
        headers: { ...corsHeaders(req), "Content-Type": "application/json" },
      });
    }

    let tasksCreated = 0;
    let meetingsCreated = 0;
    let obligationsCreated = 0;

    if (!await isCronAuthorized(req)) {
      const token = req.headers.get("Authorization")?.replace(/^Bearer\s+/i, "").trim();
      if (!token) return cronUnauthorizedResponse(req, corsHeaders);
      const userId = await getUserIdFromJwt(supabase, token);
      if (!userId) return cronUnauthorizedResponse(req, corsHeaders);
      const { data: isSa, error: saErr } = await supabase.rpc("is_super_admin_safe", {
        p_user_id: userId,
      });
      if (saErr || isSa !== true) {
        return new Response(JSON.stringify({ error: "Forbidden" }), {
          status: 403,
          headers: { ...corsHeaders(req), "Content-Type": "application/json" },
        });
      }
    }

    if (scope === "meetings" || scope === "all") {
      meetingsCreated = await generateMeetingNotifications(supabase);
    }
    if (scope === "tasks_obligations" || scope === "all") {
      tasksCreated = await generateTaskNotifications(supabase);
      obligationsCreated = await generateObligationNotifications(supabase);
    }

    const summary = {
      scope,
      tasks_created: tasksCreated,
      meetings_created: meetingsCreated,
      obligations_created: obligationsCreated,
      ran_at: new Date().toISOString(),
    };

    console.log("generate-notifications summary:", JSON.stringify(summary));

    return new Response(JSON.stringify(summary), {
      headers: { ...corsHeaders(req), "Content-Type": "application/json" },
    });
  } catch (err) {
    console.error("generate-notifications error:", err);
    return new Response(JSON.stringify({ error: String(err) }), {
      status: 500,
      headers: { ...corsHeaders(req), "Content-Type": "application/json" },
    });
  }
});
