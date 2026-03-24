import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";
import { Connection, Request as TdsRequest, TYPES } from "npm:tedious@18.6.1";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers":
    "authorization, x-client-info, apikey, content-type, x-supabase-client-platform, x-supabase-client-platform-version, x-supabase-client-runtime, x-supabase-client-runtime-version",
};

function connectMssql(): Promise<Connection> {
  return new Promise((resolve, reject) => {
    const cfg = {
      server: Deno.env.get("MSSQL_HOST")!,
      authentication: {
        type: "default" as const,
        options: {
          userName: Deno.env.get("MSSQL_USER")!,
          password: Deno.env.get("MSSQL_PASSWORD")!,
        },
      },
      options: {
        database: Deno.env.get("MSSQL_DATABASE")!,
        port: parseInt(Deno.env.get("MSSQL_PORT") || "1433"),
        encrypt: false,
        trustServerCertificate: true,
        connectTimeout: 15000,
        requestTimeout: 60000,
      },
    };
    const conn = new Connection(cfg);
    conn.on("connect", (err: Error | undefined) => {
      if (err) reject(err);
      else resolve(conn);
    });
    conn.connect();
  });
}

function execQuery(
  conn: Connection,
  sql: string,
  params: { name: string; type: any; value: any }[]
): Promise<Record<string, any>[]> {
  return new Promise((resolve, reject) => {
    const rows: Record<string, any>[] = [];
    const req = new TdsRequest(sql, (err: Error | undefined) => {
      if (err) reject(err);
      else resolve(rows);
    });
    for (const p of params) {
      req.addParameter(p.name, p.type, p.value);
    }
    req.on("row", (columns: any[]) => {
      const row: Record<string, any> = {};
      for (const col of columns) {
        row[col.metadata.colName] = col.value;
      }
      rows.push(row);
    });
    conn.execSql(req);
  });
}

function toDateStr(val: any): string | null {
  if (!val) return null;
  if (val instanceof Date) return val.toISOString().split("T")[0];
  return String(val).split("T")[0];
}

function toTimestamp(val: any): string | null {
  if (!val) return null;
  if (val instanceof Date) return val.toISOString();
  return String(val);
}

serve(async (req) => {
  if (req.method === "OPTIONS") {
    return new Response(null, { headers: corsHeaders });
  }

  try {
    // --- Auth: SuperAdmin only ---
    const authHeader = req.headers.get("Authorization");
    if (!authHeader?.startsWith("Bearer ")) {
      return new Response(JSON.stringify({ error: "Unauthorized" }), {
        status: 401,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }
    const supabase = createClient(
      Deno.env.get("SUPABASE_URL")!,
      Deno.env.get("SUPABASE_ANON_KEY")!,
      { global: { headers: { Authorization: authHeader } } }
    );
    const { data: claimsData, error: claimsErr } = await supabase.auth.getClaims(
      authHeader.replace("Bearer ", "")
    );
    if (claimsErr || !claimsData?.claims) {
      return new Response(JSON.stringify({ error: "Unauthorized" }), {
        status: 401,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }
    const currentUserId = claimsData.claims.sub;
    const svcClient = createClient(
      Deno.env.get("SUPABASE_URL")!,
      Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!
    );
    const { data: profile } = await svcClient
      .from("users")
      .select("global_role, unicorn_role")
      .eq("user_uuid", currentUserId)
      .maybeSingle();
    const isSA =
      profile?.global_role === "SuperAdmin" ||
      profile?.unicorn_role === "Super Admin";
    if (!isSA) {
      return new Response(JSON.stringify({ error: "Forbidden – SuperAdmin only" }), {
        status: 403,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    // --- Parse body ---
    const { client_id, import_options } = await req.json();
    if (!client_id || typeof client_id !== "number") {
      return new Response(
        JSON.stringify({ error: "client_id (number) is required" }),
        { status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }
    const opts = {
      tenant: import_options?.tenant !== false,
      package_instances: !!import_options?.package_instances,
      stage_instances: !!import_options?.stage_instances,
      document_instances: !!import_options?.document_instances,
      client_task_instances: !!import_options?.client_task_instances,
      staff_task_instances: !!import_options?.staff_task_instances,
      email_instances: !!import_options?.email_instances,
    };

    const results: Record<string, any> = { imported: {} };
    const conn = await connectMssql();

    try {
      // ---- 1. Tenant ----
      if (opts.tenant) {
        // Get company_name from Users
        const clients = await execQuery(
          conn,
          `SELECT [id], [company_name] FROM [dbo].[Users] WHERE [discriminator] = 'client' AND [id] = @cid`,
          [{ name: "cid", type: TYPES.Int, value: client_id }]
        );
        if (clients.length === 0) {
          return new Response(
            JSON.stringify({ error: `Client ${client_id} not found in Unicorn 1` }),
            { status: 404, headers: { ...corsHeaders, "Content-Type": "application/json" } }
          );
        }
        const c = clients[0];

        // Get RTO ID from clientfields (field_id = 14)
        let rtoId: string | null = null;
        try {
          const fields = await execQuery(
            conn,
            `SELECT [value] FROM [dbo].[clientfields] WHERE [user_id] = @uid AND [field_id] = 14`,
            [{ name: "uid", type: TYPES.Int, value: client_id }]
          );
          if (fields.length > 0 && fields[0].value) {
            rtoId = String(fields[0].value);
          }
        } catch (_) { /* clientfields may not exist */ }

        // Check if tenant already exists
        const { data: existing } = await svcClient
          .from("tenants")
          .select("id")
          .eq("id", client_id)
          .maybeSingle();

        if (existing) {
          results.imported.tenant = { status: "skipped", reason: "already exists" };
        } else {
          const companyName = c.company_name || `Client ${client_id}`;
          const slug = companyName
            .toLowerCase()
            .replace(/[^a-z0-9]+/g, "-")
            .replace(/(^-|-$)/g, "");

          const { error: tenantErr } = await svcClient.from("tenants").insert({
            id: client_id,
            name: companyName,
            slug,
            status: "active",
            lifecycle_status: "active",
            access_status: "enabled",
            rto_id: rtoId,
            import_id: client_id,
            tenant_type: "client",
            billing_status: "active",
            is_system_tenant: false,
          });
          if (tenantErr) throw new Error(`Tenant insert failed: ${tenantErr.message}`);
          results.imported.tenant = { status: "created", id: client_id };
        }
      }

      // Helper: get package instance IDs for this client
      async function getPackageInstanceIds(): Promise<number[]> {
        const pkgs = await execQuery(
          conn,
          `SELECT [id] FROM [dbo].[package_instances] WHERE [client_id] = @cid`,
          [{ name: "cid", type: TYPES.Int, value: client_id }]
        );
        return pkgs.map((r) => r.id);
      }

      // Helper: get stage instance IDs from package instance IDs
      async function getStageInstanceIds(piIds: number[]): Promise<number[]> {
        if (piIds.length === 0) return [];
        const idList = piIds.join(",");
        const rows = await execQuery(
          conn,
          `SELECT [id] FROM [dbo].[stage_instances] WHERE [packageinstance_id] IN (${idList})`,
          []
        );
        return rows.map((r) => r.id);
      }

      // ---- 2. Package Instances ----
      if (opts.package_instances) {
        const pkgs = await execQuery(
          conn,
          `SELECT [id], [package_id], [start_date], [end_date], [is_complete], [clo_id]
           FROM [dbo].[package_instances] WHERE [client_id] = @cid`,
          [{ name: "cid", type: TYPES.Int, value: client_id }]
        );

        let created = 0, skipped = 0;
        for (const p of pkgs) {
          const { data: ex } = await svcClient.from("package_instances").select("id").eq("id", p.id).maybeSingle();
          if (ex) { skipped++; continue; }
          const { error } = await svcClient.from("package_instances").insert({
            id: p.id,
            tenant_id: client_id,
            package_id: p.package_id,
            start_date: toDateStr(p.start_date) || new Date().toISOString().split("T")[0],
            end_date: toDateStr(p.end_date),
            is_complete: p.is_complete || false,
            clo_id: p.clo_id || 0,
            is_active: !(p.is_complete || false),
          });
          if (error) { console.error(`PI ${p.id}:`, error.message); skipped++; } else { created++; }
        }
        results.imported.package_instances = { created, skipped, total: pkgs.length };
      }

      // ---- 3. Stage Instances ----
      if (opts.stage_instances) {
        const piIds = await getPackageInstanceIds();
        let created = 0, skipped = 0, total = 0;

        if (piIds.length > 0) {
          const idList = piIds.join(",");
          const stages = await execQuery(
            conn,
            `SELECT [id], [stage_id], [packageinstance_id], [completion_date], [status_id], [status], [stage_sortorder]
             FROM [dbo].[stage_instances] WHERE [packageinstance_id] IN (${idList})`,
            []
          );
          total = stages.length;

          for (const s of stages) {
            const { data: ex } = await svcClient.from("stage_instances").select("id").eq("id", s.id).maybeSingle();
            if (ex) { skipped++; continue; }
            const { error } = await svcClient.from("stage_instances").insert({
              id: s.id,
              stage_id: s.stage_id,
              packageinstance_id: s.packageinstance_id,
              completion_date: toTimestamp(s.completion_date),
              status_id: s.status_id ?? 0,
              status: s.status || "Not Started",
              stage_sortorder: s.stage_sortorder || null,
            });
            if (error) { console.error(`SI ${s.id}:`, error.message); skipped++; } else { created++; }
          }
        }
        results.imported.stage_instances = { created, skipped, total };
      }

      // ---- 4. Document Instances ----
      if (opts.document_instances) {
        const piIds = await getPackageInstanceIds();
        const siIds = await getStageInstanceIds(piIds);
        let created = 0, skipped = 0, total = 0;

        if (siIds.length > 0) {
          const siList = siIds.join(",");
          const docs = await execQuery(
            conn,
            `SELECT [id], [document_id], [stageinstance_id], [tenant_id], [isgenerated], [generationdate]
             FROM [dbo].[document_instances] WHERE [stageinstance_id] IN (${siList})`,
            []
          );
          total = docs.length;

          for (const d of docs) {
            const { data: ex } = await svcClient.from("document_instances").select("id").eq("id", d.id).maybeSingle();
            if (ex) { skipped++; continue; }
            const { error } = await svcClient.from("document_instances").insert({
              id: d.id,
              document_id: d.document_id,
              stageinstance_id: d.stageinstance_id,
              tenant_id: d.tenant_id || client_id,
              isgenerated: d.isgenerated || false,
              generationdate: d.generationdate || null,
            });
            if (error) { console.error(`DI ${d.id}:`, error.message); skipped++; } else { created++; }
          }
        }
        results.imported.document_instances = { created, skipped, total };
      }

      // ---- 5. Staff Task Instances ----
      if (opts.staff_task_instances) {
        const piIds = await getPackageInstanceIds();
        const siIds = await getStageInstanceIds(piIds);
        let created = 0, skipped = 0, total = 0;

        if (siIds.length > 0) {
          const siList = siIds.join(",");
          const tasks = await execQuery(
            conn,
            `SELECT [id], [stafftask_id], [stageinstance_id], [status_id], [status],
                    [completion_date], [due_date], [assigned_date], [notes], [assignee_id], [is_core]
             FROM [dbo].[staff_task_instances] WHERE [stageinstance_id] IN (${siList})`,
            []
          );
          total = tasks.length;

          for (const t of tasks) {
            const { data: ex } = await svcClient.from("staff_task_instances").select("id").eq("id", t.id).maybeSingle();
            if (ex) { skipped++; continue; }
            const { error } = await svcClient.from("staff_task_instances").insert({
              id: t.id,
              stafftask_id: t.stafftask_id,
              stageinstance_id: t.stageinstance_id,
              status_id: t.status_id ?? 0,
              status: t.status || "Not Started",
              completion_date: toTimestamp(t.completion_date),
              due_date: toTimestamp(t.due_date),
              assigned_date: toTimestamp(t.assigned_date),
              notes: t.notes || null,
              u1_assignee_id: t.assignee_id || null,
              is_core: t.is_core || false,
            });
            if (error) { console.error(`STI ${t.id}:`, error.message); skipped++; } else { created++; }
          }
        }
        results.imported.staff_task_instances = { created, skipped, total };
      }

      // ---- 6. Client Task Instances ----
      if (opts.client_task_instances) {
        const piIds = await getPackageInstanceIds();
        const siIds = await getStageInstanceIds(piIds);
        let created = 0, skipped = 0, total = 0;

        if (siIds.length > 0) {
          const siList = siIds.join(",");
          const tasks = await execQuery(
            conn,
            `SELECT [id], [clienttask_id], [stageinstance_id], [status], [due_date], [completion_date]
             FROM [dbo].[client_task_instances] WHERE [stageinstance_id] IN (${siList})`,
            []
          );
          total = tasks.length;

          for (const t of tasks) {
            const { data: ex } = await svcClient.from("client_task_instances").select("id").eq("id", t.id).maybeSingle();
            if (ex) { skipped++; continue; }
            const { error } = await svcClient.from("client_task_instances").insert({
              id: t.id,
              clienttask_id: t.clienttask_id,
              stageinstance_id: t.stageinstance_id,
              status: t.status ?? 0,
              due_date: toTimestamp(t.due_date),
              completion_date: toTimestamp(t.completion_date),
            });
            if (error) { console.error(`CTI ${t.id}:`, error.message); skipped++; } else { created++; }
          }
        }
        results.imported.client_task_instances = { created, skipped, total };
      }

      // ---- 7. Email Instances ----
      if (opts.email_instances) {
        const piIds = await getPackageInstanceIds();
        const siIds = await getStageInstanceIds(piIds);
        let created = 0, skipped = 0, total = 0;

        if (siIds.length > 0) {
          const siList = siIds.join(",");
          const emails = await execQuery(
            conn,
            `SELECT [id], [email_id], [stageinstance_id], [content], [is_sent], [sent_date],
                    [to], [cc], [bcc], [subject], [sender_id], [sender], [is_core], [user_attachments]
             FROM [dbo].[email_instances] WHERE [stageinstance_id] IN (${siList})`,
            []
          );
          total = emails.length;

          for (const e of emails) {
            const { data: ex } = await svcClient.from("email_instances").select("id").eq("id", e.id).maybeSingle();
            if (ex) { skipped++; continue; }
            const { error } = await svcClient.from("email_instances").insert({
              id: e.id,
              email_id: e.email_id || null,
              stageinstance_id: e.stageinstance_id,
              content: e.content || null,
              is_sent: e.is_sent || false,
              sent_date: toTimestamp(e.sent_date),
              to: e.to || null,
              cc: e.cc || null,
              bcc: e.bcc || null,
              subject: e.subject || null,
              sender_id: e.sender_id || null,
              sender: e.sender || null,
              is_core: e.is_core || false,
              user_attachments: e.user_attachments || "",
            });
            if (error) { console.error(`EI ${e.id}:`, error.message); skipped++; } else { created++; }
          }
        }
        results.imported.email_instances = { created, skipped, total };
      }

      return new Response(JSON.stringify(results), {
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    } finally {
      conn.close();
    }
  } catch (err: any) {
    console.error("import-unicorn1-client error:", err);
    return new Response(
      JSON.stringify({ error: err.message || "Internal error" }),
      { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } }
    );
  }
});
