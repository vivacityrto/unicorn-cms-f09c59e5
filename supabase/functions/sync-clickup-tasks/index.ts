import { createServiceClient } from "../_shared/supabase-client.ts";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers":
    "authorization, x-client-info, apikey, content-type, x-supabase-client-platform, x-supabase-client-platform-version, x-supabase-client-runtime, x-supabase-client-runtime-version",
};

const CLICKUP_API_BASE = "https://api.clickup.com/api/v2";
const RATE_LIMIT_MS = 650;

/** ClickUp custom field name → DB column name */
const CUSTOM_FIELD_MAP: Record<string, string> = {
  "unicorn url": "unicorn_url",
  "sharepoint url": "sharepoint_url",
  "mb level": "mb_level",
  "risk": "risk",
  "rto id": "rto_id",
  "phone": "phone",
  "email address": "email_address",
  "audit date": "audit_date",
  "mock audit": "mock_audit",
  "cricos rereg date": "cricos_rereg_date",
  "registration date": "registration_date",
  "re reg due date": "re_reg_due_date",
  "submission date": "submission_date",
  "working hours": "working_hours",
  "notes": "notes",
  "infusionsoft url": "infusionsoft_url",
  "date of last contact": "date_of_last_contact",
  "date of last systemscheck": "date_of_last_systemscheck",
  "client meeting attendance": "client_meeting_attendance",
  "time with vivacity": "time_with_vivacity",
  "registered spr": "registered_spr",
  "on hold start date": "on_hold_start_date",
  "on hold end date": "on_hold_end_date",
};

function delay(ms: number): Promise<void> {
  return new Promise((r) => setTimeout(r, ms));
}

async function clickupGet(path: string, apiKey: string): Promise<any> {
  const resp = await fetch(`${CLICKUP_API_BASE}${path}`, {
    headers: { Authorization: apiKey },
  });
  if (!resp.ok) {
    const text = await resp.text();
    throw new Error(`ClickUp API ${path} → ${resp.status}: ${text}`);
  }
  return resp.json();
}

/** Discover the list ID for "Membership" inside "Client Success Team" space */
async function discoverListId(apiKey: string): Promise<string> {
  // Step 1: Get teams (workspaces)
  const teamsData = await clickupGet("/team", apiKey);
  const teams = teamsData.teams ?? [];
  if (teams.length === 0) throw new Error("No ClickUp workspaces found");
  const teamId = teams[0].id;

  // Step 2: Find "Client Success Team" space
  const spacesData = await clickupGet(`/team/${teamId}/space?archived=false`, apiKey);
  const space = (spacesData.spaces ?? []).find(
    (s: any) => s.name === "Client Success Team"
  );
  if (!space) throw new Error('Space "Client Success Team" not found');
  await delay(RATE_LIMIT_MS);

  // Step 3: Find folders in that space
  const foldersData = await clickupGet(`/space/${space.id}/folder?archived=false`, apiKey);
  const folders = foldersData.folders ?? [];

  // Step 4: Find "Membership" list in any folder
  for (const folder of folders) {
    const listsData = await clickupGet(`/folder/${folder.id}/list?archived=false`, apiKey);
    const list = (listsData.lists ?? []).find((l: any) => l.name === "Membership");
    if (list) return list.id;
    await delay(RATE_LIMIT_MS);
  }

  // Also check folderless lists
  const folderlessData = await clickupGet(`/space/${space.id}/list?archived=false`, apiKey);
  const folderlessList = (folderlessData.lists ?? []).find(
    (l: any) => l.name === "Membership"
  );
  if (folderlessList) return folderlessList.id;

  throw new Error('"Membership" list not found in "Client Success Team" space');
}

/** Fetch all tasks from a list (paginated, 100 per page) */
async function fetchAllTasks(listId: string, apiKey: string): Promise<any[]> {
  const allTasks: any[] = [];
  let page = 0;
  while (true) {
    const data = await clickupGet(
      `/list/${listId}/task?page=${page}&include_closed=true&subtasks=true`,
      apiKey
    );
    const tasks = data.tasks ?? [];
    allTasks.push(...tasks);
    if (tasks.length < 100) break;
    page++;
    await delay(RATE_LIMIT_MS);
  }
  return allTasks;
}

/** Extract a custom field value — handles different ClickUp field types */
function extractFieldValue(field: any): string | null {
  if (field.value === null || field.value === undefined) return null;
  
  // URL type: value is the URL string directly
  if (field.type === "url") return String(field.value);
  
  // Drop-down type: value is an order index, options are in type_config
  if (field.type === "drop_down" && field.type_config?.options) {
    const opt = field.type_config.options.find(
      (o: any) => o.orderindex === field.value
    );
    return opt?.name ?? String(field.value);
  }

  // Labels type: value is array of label IDs
  if (field.type === "labels" && Array.isArray(field.value) && field.type_config?.options) {
    const names = field.value.map((id: string) => {
      const opt = field.type_config.options.find((o: any) => o.id === id);
      return opt?.label ?? id;
    });
    return names.join(", ");
  }

  // Date type: value is unix ms
  if (field.type === "date") return String(field.value);
  
  // Number, short_text, email, phone, text, etc.
  if (typeof field.value === "object") return JSON.stringify(field.value);
  return String(field.value);
}

/** Map a ClickUp API task to a DB row */
function mapTaskToRow(task: any): Record<string, unknown> {
  const row: Record<string, unknown> = {
    task_id: task.id,
    custom_id: task.custom_id ?? null,
    name: task.name ?? null,
    description: task.description ?? null,
    text_content: task.text_content ?? null,
    status: task.status?.status ?? null,
    priority: task.priority?.priority ?? null,
    parent_task_id: task.parent ?? null,
    date_created: task.date_created ? parseInt(task.date_created) : null,
    date_updated: task.date_updated ? parseInt(task.date_updated) : null,
    date_closed: task.date_closed ? parseInt(task.date_closed) : null,
    date_done: task.date_done ? parseInt(task.date_done) : null,
    due_date: task.due_date ? parseInt(task.due_date) : null,
    start_date: task.start_date ? parseInt(task.start_date) : null,
    time_estimate: task.time_estimate ?? null,
    time_spent: task.time_spent?.time ?? null,
    assignees: task.assignees ?? null,
    watchers: task.watchers ?? null,
    tags: task.tags ?? null,
    checklists: task.checklists ?? null,
    list_id: task.list?.id ?? null,
    list_name: task.list?.name ?? null,
    folder_id: task.folder?.id ?? null,
    folder_name: task.folder?.name ?? null,
    space_id: task.space?.id ?? null,
    space_name: task.space?.name ?? null,
    url: task.url ?? null,
    creator_id: task.creator?.id ?? null,
    creator_username: task.creator?.username ?? null,
    custom_fields: task.custom_fields ?? null,
    raw_json: task,
    fetched_at: new Date().toISOString(),
  };

  // Flatten custom fields
  if (Array.isArray(task.custom_fields)) {
    for (const field of task.custom_fields) {
      const fieldName = (field.name ?? "").toLowerCase().trim();
      const dbCol = CUSTOM_FIELD_MAP[fieldName];
      if (dbCol) {
        row[dbCol] = extractFieldValue(field);
      }
    }
  }

  return row;
}

/** Resolve tenant_id from unicorn_url using the same patterns as the CSV importer */
function resolveTenantIdFromUrl(url: string | null): number | null {
  if (!url) return null;
  // Pattern: /clients/N
  let match = url.match(/\/clients\/(\d+)/);
  if (match) return parseInt(match[1]);
  // Pattern: /stage/N
  match = url.match(/\/stage\/(\d+)/);
  if (match) return parseInt(match[1]);
  // Pattern: /email/N
  match = url.match(/\/email\/(\d+)/);
  if (match) return parseInt(match[1]);
  // Pattern: trailing /N (last numeric segment)
  match = url.match(/\/(\d+)\/?$/);
  if (match) return parseInt(match[1]);
  return null;
}

/** Resolve tenant_id using DB lookups for stage/package patterns */
async function resolveTenantId(
  sb: any,
  unicornUrl: string | null
): Promise<number | null> {
  if (!unicornUrl) return null;

  // Direct client ID
  let match = unicornUrl.match(/\/clients\/(\d+)/);
  if (match) return parseInt(match[1]);

  // Stage pattern — look up via v_tenant_stage_instances
  match = unicornUrl.match(/\/stage\/(\d+)/);
  if (match) {
    const stageId = parseInt(match[1]);
    const { data } = await sb
      .from("v_tenant_stage_instances")
      .select("tenant_id")
      .eq("id", stageId)
      .limit(1)
      .maybeSingle();
    if (data?.tenant_id) return data.tenant_id;
  }

  // Email or bare number — look up via package_instances
  match = unicornUrl.match(/\/email\/(\d+)/) ?? unicornUrl.match(/\/(\d+)\/?$/);
  if (match) {
    const pkgId = parseInt(match[1]);
    const { data } = await sb
      .from("package_instances")
      .select("tenant_id")
      .eq("id", pkgId)
      .limit(1)
      .maybeSingle();
    if (data?.tenant_id) return data.tenant_id;
    // Fallback: treat as direct tenant ID
    return pkgId;
  }

  return null;
}

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") {
    return new Response(null, { headers: corsHeaders });
  }

  try {
    const CLICKUP_API_KEY = Deno.env.get("CLICKUP_API_KEY");
    if (!CLICKUP_API_KEY) {
      throw new Error("CLICKUP_API_KEY secret is not configured");
    }

    const body = await req.json();
    const { mode, task_id: singleTaskId, tenant_id: filterTenantId } = body;

    const sb = createServiceClient();
    const log = (msg: string) => console.log(`[sync-clickup-tasks] ${msg}`);

    // ─── Mode: sync_all ───
    if (mode === "sync_all") {
      log("Starting full sync — discovering list ID...");
      const listId = await discoverListId(CLICKUP_API_KEY);
      log(`List ID: ${listId} — fetching tasks...`);

      const tasks = await fetchAllTasks(listId, CLICKUP_API_KEY);
      log(`Fetched ${tasks.length} tasks from ClickUp`);

      let upserted = 0;
      let tenantResolved = 0;
      const errors: string[] = [];

      // Batch upsert in chunks of 50
      const rows = tasks.map(mapTaskToRow);
      for (let i = 0; i < rows.length; i += 50) {
        const batch = rows.slice(i, i + 50);
        const { error } = await sb
          .from("clickup_tasks_api")
          .upsert(batch, { onConflict: "task_id", ignoreDuplicates: false });
        if (error) {
          errors.push(`Batch ${i}: ${error.message}`);
        } else {
          upserted += batch.length;
        }
      }

      // Resolve tenant_ids
      log("Resolving tenant_ids from unicorn_url...");
      const { data: unmapped } = await sb
        .from("clickup_tasks_api")
        .select("id, unicorn_url")
        .is("tenant_id", null)
        .not("unicorn_url", "is", null);

      if (unmapped && unmapped.length > 0) {
        for (const row of unmapped) {
          const tid = await resolveTenantId(sb, row.unicorn_url);
          if (tid) {
            const { error } = await sb
              .from("clickup_tasks_api")
              .update({ tenant_id: tid })
              .eq("id", row.id);
            if (!error) tenantResolved++;
          }
        }
      }

      log(`Done: ${upserted} upserted, ${tenantResolved} tenants resolved, ${errors.length} errors`);
      return new Response(
        JSON.stringify({
          tasks_fetched: tasks.length,
          tasks_upserted: upserted,
          tenants_resolved: tenantResolved,
          errors,
        }),
        { status: 200, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    // ─── Mode: sync_task ───
    if (mode === "sync_task") {
      if (!singleTaskId) {
        return new Response(
          JSON.stringify({ error: "task_id required for sync_task mode" }),
          { status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" } }
        );
      }

      const task = await clickupGet(`/task/${singleTaskId}`, CLICKUP_API_KEY);
      const row = mapTaskToRow(task);
      row.tenant_id = await resolveTenantId(sb, row.unicorn_url as string | null);

      const { error } = await sb
        .from("clickup_tasks_api")
        .upsert([row], { onConflict: "task_id", ignoreDuplicates: false });

      if (error) throw error;

      return new Response(
        JSON.stringify({ success: true, task_id: singleTaskId, tenant_id: row.tenant_id }),
        { status: 200, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    // ─── Mode: sync_by_tenant ───
    if (mode === "sync_by_tenant") {
      if (!filterTenantId) {
        return new Response(
          JSON.stringify({ error: "tenant_id required for sync_by_tenant mode" }),
          { status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" } }
        );
      }

      // Get task_ids for this tenant
      const { data: existing } = await sb
        .from("clickup_tasks_api")
        .select("task_id")
        .eq("tenant_id", filterTenantId);

      if (!existing || existing.length === 0) {
        return new Response(
          JSON.stringify({ message: "No tasks found for tenant", tasks_synced: 0 }),
          { status: 200, headers: { ...corsHeaders, "Content-Type": "application/json" } }
        );
      }

      let synced = 0;
      const errors: string[] = [];

      for (const { task_id } of existing) {
        try {
          const task = await clickupGet(`/task/${task_id}`, CLICKUP_API_KEY);
          const row = mapTaskToRow(task);
          row.tenant_id = filterTenantId;

          const { error } = await sb
            .from("clickup_tasks_api")
            .upsert([row], { onConflict: "task_id", ignoreDuplicates: false });

          if (error) errors.push(`${task_id}: ${error.message}`);
          else synced++;

          await delay(RATE_LIMIT_MS);
        } catch (e) {
          errors.push(`${task_id}: ${(e as Error).message}`);
        }
      }

      return new Response(
        JSON.stringify({ tasks_synced: synced, errors }),
        { status: 200, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    return new Response(
      JSON.stringify({ error: "Invalid mode. Use sync_all, sync_task, or sync_by_tenant" }),
      { status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" } }
    );
  } catch (err) {
    console.error("sync-clickup-tasks error:", err);
    return new Response(
      JSON.stringify({ error: (err as Error).message }),
      { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } }
    );
  }
});
