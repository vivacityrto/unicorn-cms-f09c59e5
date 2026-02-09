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
import { createServiceClient } from "../_shared/supabase-client.ts";

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

  // 24h window: 23h45m – 24h15m  → 1425–1455 min
  if (diffMin >= 1425 && diffMin <= 1455) return { window: "24h", label: "in 24 hours" };
  // 1h window: 50m – 70m
  if (diffMin >= 50 && diffMin <= 70) return { window: "1h", label: "in 1 hour" };
  return null;
}

function todayUTC(): string {
  return new Date().toISOString().slice(0, 10);
}

// ── scope handlers ─────────────────────────────────────────────────

async function generateTaskNotifications(supabase: ReturnType<typeof createServiceClient>): Promise<number> {
  const today = todayUTC();
  const todayDate = new Date(today + "T00:00:00Z");

  // Fetch tasks due within relevant windows
  const minDate = new Date(todayDate.getTime() - 3 * 86_400_000).toISOString().slice(0, 10);
  const maxDate = new Date(todayDate.getTime() + 7 * 86_400_000).toISOString().slice(0, 10);

  const { data: tasks, error } = await supabase
    .from("tasks_tenants")
    .select("id, tenant_id, task_name, due_date, status, completed, created_by")
    .not("due_date", "is", null)
    .or("completed.is.null,completed.eq.false")
    .gte("due_date", minDate)
    .lte("due_date", maxDate);

  if (error) {
    console.error("Task query error:", error.message);
    return 0;
  }
  if (!tasks?.length) return 0;

  const rows: NotificationRow[] = [];
  for (const t of tasks) {
    if (!t.created_by || !t.due_date) continue;
    const w = taskWindow(t.due_date, today);
    if (!w) continue;

    rows.push({
      tenant_id: t.tenant_id,
      user_id: t.created_by,
      type: "task_due",
      title: `Task ${w.label}: ${t.task_name || "Untitled task"}`,
      message: `Status: ${t.status || "open"} · Due: ${t.due_date}`,
      link: `/client/tasks?task_id=${t.id}`,
      is_read: false,
      dedupe_key: `task_due:${t.id}:${w.window}`,
    });
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
  // Fetch meetings starting within the 24h and 1h windows
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

  // Get participants for these meetings
  const meetingIds = meetings.map((m) => m.id);
  const { data: participants } = await supabase
    .from("meeting_participants")
    .select("meeting_id, participant_email")
    .in("meeting_id", meetingIds);

  // Map participant emails to user_uuids
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

  const rows: NotificationRow[] = [];

  for (const m of meetings) {
    const w = meetingWindow(m.starts_at);
    if (!w) continue;

    // Collect unique recipients
    const recipientSet = new Set<string>();
    if (m.owner_user_uuid) recipientSet.add(m.owner_user_uuid);

    const meetingParticipants = (participants || []).filter((p) => p.meeting_id === m.id);
    for (const p of meetingParticipants) {
      const uid = emailToUser[p.participant_email?.toLowerCase()];
      if (uid) recipientSet.add(uid);
    }

    for (const userId of recipientSet) {
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

  // Fetch obligation calendar entries
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

  const rows: NotificationRow[] = [];
  for (const e of entries) {
    if (!e.created_by || !e.entry_date) continue;
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

// ── main handler ───────────────────────────────────────────────────

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") {
    return new Response("ok", { headers: corsHeaders });
  }

  try {
    const supabase = createServiceClient();

    let scope = "all";
    try {
      const body = await req.json();
      if (body?.scope) scope = body.scope;
    } catch {
      // no body or invalid JSON – run all scopes
    }

    let tasksCreated = 0;
    let meetingsCreated = 0;
    let obligationsCreated = 0;

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
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  } catch (err) {
    console.error("generate-notifications error:", err);
    return new Response(JSON.stringify({ error: String(err) }), {
      status: 500,
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }
});
