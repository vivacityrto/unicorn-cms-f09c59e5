import { createClient } from "https://esm.sh/@supabase/supabase-js@2";
import { emitTimelineEvent } from "../_shared/emit-timeline-event.ts";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers":
    "authorization, x-client-info, apikey, content-type, x-supabase-client-platform, x-supabase-client-platform-version, x-supabase-client-runtime, x-supabase-client-runtime-version",
};

interface ActionInput {
  action_id: string;
  action: string;
  owner: string;
  due_date: string;
  status: string;
  package_id?: number | null;
  assigned_to_user_uuid?: string | null;
  assigned_to_role?: string | null;
  confidence?: string;
}

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") {
    return new Response(null, { headers: corsHeaders });
  }

  try {
    const authHeader = req.headers.get("Authorization");
    if (!authHeader) {
      return new Response(JSON.stringify({ error: "Unauthorized" }), {
        status: 401,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    const supabaseUrl = Deno.env.get("SUPABASE_URL")!;
    const serviceKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
    const anonKey = Deno.env.get("SUPABASE_ANON_KEY")!;

    const supabase = createClient(supabaseUrl, serviceKey);

    // Verify caller
    const userClient = createClient(supabaseUrl, anonKey, {
      global: { headers: { Authorization: authHeader } },
    });
    const { data: { user }, error: authError } = await userClient.auth.getUser();
    if (authError || !user) {
      return new Response(JSON.stringify({ error: "Unauthorized" }), {
        status: 401,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    // Verify SuperAdmin
    const { data: userData } = await supabase
      .from("users")
      .select("role")
      .eq("user_uuid", user.id)
      .single();

    if (!userData || userData.role !== "SuperAdmin") {
      return new Response(JSON.stringify({ error: "Forbidden: Vivacity Team only" }), {
        status: 403,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    const { minutes_id, actions } = await req.json() as {
      minutes_id: string;
      actions: ActionInput[];
    };

    if (!minutes_id || !actions || !Array.isArray(actions) || actions.length === 0) {
      return new Response(JSON.stringify({ error: "minutes_id and actions[] are required" }), {
        status: 400,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    // Get minutes to find meeting_id and tenant_id
    const { data: minutes, error: minErr } = await supabase
      .from("meeting_minutes")
      .select("id, meeting_id, tenant_id, title, content")
      .eq("id", minutes_id)
      .single();

    if (minErr || !minutes) {
      return new Response(JSON.stringify({ error: "Minutes not found" }), {
        status: 404,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    // Get meeting title for task description
    const { data: meeting } = await supabase
      .from("eos_meetings")
      .select("title, start_time")
      .eq("id", minutes.meeting_id)
      .single();

    const meetingTitle = meeting?.title || "Meeting";
    const meetingDate = meeting?.start_time
      ? new Date(meeting.start_time).toLocaleDateString("en-AU")
      : "";

    const createdTasks: Array<{ task_id: string; action_id: string }> = [];
    const skippedActions: string[] = [];
    const errors: Array<{ action_id: string; error: string }> = [];

    for (const action of actions) {
      if (!action.action_id || !action.action) {
        errors.push({ action_id: action.action_id || "unknown", error: "Missing action_id or action text" });
        continue;
      }

      // Check for existing task (idempotency via unique index)
      const { data: existing } = await supabase
        .from("meeting_action_tasks")
        .select("id")
        .eq("minutes_id", minutes_id)
        .eq("action_id", action.action_id)
        .maybeSingle();

      if (existing) {
        skippedActions.push(action.action_id);
        createdTasks.push({ task_id: existing.id, action_id: action.action_id });
        continue;
      }

      // Parse due_date
      let dueDate: string | null = null;
      if (action.due_date) {
        try {
          const d = new Date(action.due_date);
          if (!isNaN(d.getTime())) {
            dueDate = d.toISOString().split("T")[0];
          }
        } catch { /* ignore invalid dates */ }
      }

      const description = `Action from meeting "${meetingTitle}" on ${meetingDate}.\n\nMinutes: ${minutes.title}`;

      const { data: newTask, error: insertErr } = await supabase
        .from("meeting_action_tasks")
        .insert({
          tenant_id: minutes.tenant_id,
          meeting_id: minutes.meeting_id,
          minutes_id: minutes.id,
          action_id: action.action_id,
          title: action.action.length > 200 ? action.action.substring(0, 197) + "..." : action.action,
          description,
          due_date: dueDate,
          assigned_to_user_uuid: action.assigned_to_user_uuid || null,
          assigned_to_role: action.assigned_to_role || action.owner || null,
          package_id: action.package_id || null,
          status: action.status || "Open",
          confidence: action.confidence || "medium",
          created_by: user.id,
        })
        .select("id")
        .single();

      if (insertErr) {
        console.error(`Failed to create task for action ${action.action_id}:`, insertErr);
        errors.push({ action_id: action.action_id, error: insertErr.message });
        continue;
      }

      createdTasks.push({ task_id: newTask!.id, action_id: action.action_id });

      // Audit log
      await supabase.from("audit_events").insert({
        entity: "meeting_action_tasks",
        entity_id: newTask!.id,
        action: "minutes_action_task_created",
        user_id: user.id,
        details: {
          meeting_id: minutes.meeting_id,
          minutes_id: minutes.id,
          action_id: action.action_id,
          package_id: action.package_id || null,
          owner: action.owner,
          due_date: dueDate,
        },
      });
    }

    // Update minutes content with task_ids
    const content = typeof minutes.content === "string"
      ? JSON.parse(minutes.content)
      : minutes.content || {};

    if (Array.isArray(content.actions)) {
      for (const ct of createdTasks) {
        const actionItem = content.actions.find((a: any) => a.action_id === ct.action_id);
        if (actionItem) {
          actionItem.task_id = ct.task_id;
        }
      }

      await supabase
        .from("meeting_minutes")
        .update({ content, updated_at: new Date().toISOString() })
        .eq("id", minutes_id);
    }

    // Emit timeline event for tasks created
    const tasksCreatedCount = createdTasks.length - skippedActions.length;
    if (tasksCreatedCount > 0) {
      await emitTimelineEvent(supabase, {
        tenant_id: minutes.tenant_id,
        client_id: String(minutes.tenant_id),
        event_type: "tasks_created_from_minutes",
        title: `${tasksCreatedCount} task${tasksCreatedCount > 1 ? "s" : ""} created from "${meetingTitle}" minutes`,
        body: `Actions converted to tasks from meeting on ${meetingDate}`,
        source: "microsoft",
        visibility: "internal",
        entity_type: "meeting_minutes",
        entity_id: minutes.id,
        metadata: {
          meeting_id: minutes.meeting_id,
          minutes_id: minutes.id,
          tasks_created: tasksCreatedCount,
          tasks_skipped: skippedActions.length,
        },
        created_by: user.id,
        dedupe_key: `tasks_from_min:${minutes.id}:${crypto.randomUUID().substring(0, 8)}`,
      });
    }

    return new Response(
      JSON.stringify({
        success: true,
        created: tasksCreatedCount,
        skipped: skippedActions.length,
        total: createdTasks.length,
        tasks: createdTasks,
        errors,
      }),
      { headers: { ...corsHeaders, "Content-Type": "application/json" } }
    );
  } catch (err) {
    console.error("create-tasks-from-minutes error:", err);
    return new Response(
      JSON.stringify({ error: err instanceof Error ? err.message : "Internal error" }),
      { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } }
    );
  }
});
