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
        const clients = await execQuery(
          conn,
          `SELECT [Id], [CompanyName] FROM [dbo].[Users] WHERE [Discriminator] = 'Client' AND [Id] = @cid`,
          [{ name: "cid", type: TYPES.Int, value: client_id }]
        );
        if (clients.length === 0) {
          return new Response(
            JSON.stringify({ error: `Client ${client_id} not found in Unicorn 1` }),
            { status: 404, headers: { ...corsHeaders, "Content-Type": "application/json" } }
          );
        }
        const c = clients[0];
        const companyName = c.CompanyName ?? c.company_name ?? c.companyname ?? `Client ${client_id}`;

        let rtoId: string | null = null;
        try {
          const fields = await execQuery(
            conn,
            `SELECT [Value] FROM [dbo].[ClientFields] WHERE [UserId] = @uid AND [FieldId] = 14`,
            [{ name: "uid", type: TYPES.Int, value: client_id }]
          );
          if (fields.length > 0 && (fields[0].Value ?? fields[0].value)) {
            rtoId = String(fields[0].Value ?? fields[0].value);
          }
        } catch (_) { /* clientfields may not exist */ }

        const { data: existing } = await svcClient
          .from("tenants")
          .select("id")
          .eq("id", client_id)
          .maybeSingle();

        if (existing) {
          results.imported.tenant = { status: "skipped", reason: "already exists" };
        } else {
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
            tenant_type: "compliance_system",
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
          `SELECT [Id] FROM [dbo].[PackageInstances] WHERE [Client_Id] = @cid`,
          [{ name: "cid", type: TYPES.Int, value: client_id }]
        );
        return pkgs.map((r) => r.Id ?? r.id);
      }

      // Helper: get stage instance IDs from package instance IDs
      async function getStageInstanceIds(piIds: number[]): Promise<number[]> {
        if (piIds.length === 0) return [];
        const idList = piIds.join(",");
        const rows = await execQuery(
          conn,
          `SELECT [Id] FROM [dbo].[StageInstances] WHERE [PackageInstance_Id] IN (${idList})`,
          []
        );
        return rows.map((r) => r.Id ?? r.id);
      }

      // ---- 2. Package Instances (IDs only) ----
      if (opts.package_instances) {
        const pkgs = await execQuery(
          conn,
          `SELECT [Id], [Package_Id], [StartDate], [EndDate], [IsComplete], [CLO_Id] FROM [dbo].[PackageInstances] WHERE [Client_Id] = @cid`,
          [{ name: "cid", type: TYPES.Int, value: client_id }]
        );
        let created = 0, skipped = 0;
        for (const p of pkgs) {
          const pid = p.Id ?? p.id;
          const { data: ex } = await svcClient.from("package_instances").select("id").eq("id", pid).maybeSingle();
          if (ex) { skipped++; continue; }
          const startDate = p.StartDate ?? p.startdate ?? new Date().toISOString().split('T')[0];
          const endDate = p.EndDate ?? p.enddate ?? null;
          const cloId = p.CLO_Id ?? p.Clo_Id ?? p.clo_id ?? null;
          const isComplete = p.IsComplete ?? p.iscomplete ?? false;
          const { error } = await svcClient.from("package_instances").insert({
            id: pid,
            tenant_id: client_id,
            package_id: p.Package_Id ?? p.package_id,
            is_complete: Boolean(isComplete),
            start_date: startDate,
            end_date: endDate,
            clo_id: cloId ? Number(cloId) : null,
            u1_packageid: p.Package_Id ?? p.package_id,
          });
          if (error) { console.error(`PI ${pid}:`, error.message); skipped++; } else { created++; }
        }
        results.imported.package_instances = { created, skipped, total: pkgs.length };
      }

      // ---- 3. Stage Instances (IDs only) ----
      if (opts.stage_instances) {
        const piIds = await getPackageInstanceIds();
        let created = 0, skipped = 0, total = 0;
        if (piIds.length > 0) {
          const idList = piIds.join(",");
          const stages = await execQuery(
            conn,
            `SELECT [Id], [Stage_Id], [PackageInstance_Id] FROM [dbo].[StageInstances] WHERE [PackageInstance_Id] IN (${idList})`,
            []
          );
          total = stages.length;
          for (const s of stages) {
            const sid = s.Id ?? s.id;
            const { data: ex } = await svcClient.from("stage_instances").select("id").eq("id", sid).maybeSingle();
            if (ex) { skipped++; continue; }
            const { error } = await svcClient.from("stage_instances").insert({
              id: sid,
              stage_id: s.Stage_Id ?? s.stage_id,
              packageinstance_id: s.PackageInstance_Id ?? s.packageinstance_id,
              stage_sortorder: null,
            });
            if (error) { console.error(`SI ${sid}:`, error.message); skipped++; } else { created++; }
          }
        }
        results.imported.stage_instances = { created, skipped, total };
      }

      // ---- 4. Document Instances (IDs only) ----
      if (opts.document_instances) {
        const piIds = await getPackageInstanceIds();
        const siIds = await getStageInstanceIds(piIds);
        let created = 0, skipped = 0, total = 0;
        if (siIds.length > 0) {
          const siList = siIds.join(",");
          const docs = await execQuery(
            conn,
            `SELECT [Id], [Document_Id], [StageInstance_Id] FROM [dbo].[DocumentInstances] WHERE [StageInstance_Id] IN (${siList})`,
            []
          );
          total = docs.length;
          for (const d of docs) {
            const did = d.Id ?? d.id;
            const { data: ex } = await svcClient.from("document_instances").select("id").eq("id", did).maybeSingle();
            if (ex) { skipped++; continue; }
            const { error } = await svcClient.from("document_instances").insert({
              id: did,
              document_id: d.Document_Id ?? d.document_id,
              stageinstance_id: d.StageInstance_Id ?? d.stageinstance_id,
              tenant_id: client_id,
            });
            if (error) { console.error(`DI ${did}:`, error.message); skipped++; } else { created++; }
          }
        }
        results.imported.document_instances = { created, skipped, total };
      }

      // ---- 5. Staff Task Instances (IDs only) ----
      if (opts.staff_task_instances) {
        const piIds = await getPackageInstanceIds();
        const siIds = await getStageInstanceIds(piIds);
        let created = 0, skipped = 0, total = 0;
        if (siIds.length > 0) {
          const siList = siIds.join(",");
          const tasks = await execQuery(
            conn,
            `SELECT [Id], [StaffTask_Id], [StageInstance_Id] FROM [dbo].[StaffTaskInstances] WHERE [StageInstance_Id] IN (${siList})`,
            []
          );
          total = tasks.length;
          for (const t of tasks) {
            const tid = t.Id ?? t.id;
            const { data: ex } = await svcClient.from("staff_task_instances").select("id").eq("id", tid).maybeSingle();
            if (ex) { skipped++; continue; }
            const { error } = await svcClient.from("staff_task_instances").insert({
              id: tid,
              stafftask_id: t.StaffTask_Id ?? t.stafftask_id,
              stageinstance_id: t.StageInstance_Id ?? t.stageinstance_id,
            });
            if (error) { console.error(`STI ${tid}:`, error.message); skipped++; } else { created++; }
          }
        }
        results.imported.staff_task_instances = { created, skipped, total };
      }

      // ---- 6. Client Task Instances (IDs only) ----
      if (opts.client_task_instances) {
        const piIds = await getPackageInstanceIds();
        const siIds = await getStageInstanceIds(piIds);
        let created = 0, skipped = 0, total = 0;
        if (siIds.length > 0) {
          const siList = siIds.join(",");
          const tasks = await execQuery(
            conn,
            `SELECT [Id], [ClientTask_Id], [StageInstance_Id] FROM [dbo].[ClientTaskInstances] WHERE [StageInstance_Id] IN (${siList})`,
            []
          );
          total = tasks.length;
          for (const t of tasks) {
            const tid = t.Id ?? t.id;
            const { data: ex } = await svcClient.from("client_task_instances").select("id").eq("id", tid).maybeSingle();
            if (ex) { skipped++; continue; }
            const { error } = await svcClient.from("client_task_instances").insert({
              id: tid,
              clienttask_id: t.ClientTask_Id ?? t.clienttask_id,
              stageinstance_id: t.StageInstance_Id ?? t.stageinstance_id,
            });
            if (error) { console.error(`CTI ${tid}:`, error.message); skipped++; } else { created++; }
          }
        }
        results.imported.client_task_instances = { created, skipped, total };
      }

      // ---- 7. Email Instances (IDs only) ----
      if (opts.email_instances) {
        const piIds = await getPackageInstanceIds();
        const siIds = await getStageInstanceIds(piIds);
        let created = 0, skipped = 0, total = 0;
        if (siIds.length > 0) {
          const siList = siIds.join(",");
          const emails = await execQuery(
            conn,
            `SELECT [Id], [Email_Id], [StageInstance_Id] FROM [dbo].[EmailInstances] WHERE [StageInstance_Id] IN (${siList})`,
            []
          );
          total = emails.length;
          for (const e of emails) {
            const eid = e.Id ?? e.id;
            const { data: ex } = await svcClient.from("email_instances").select("id").eq("id", eid).maybeSingle();
            if (ex) { skipped++; continue; }
            const { error } = await svcClient.from("email_instances").insert({
              id: eid,
              email_id: e.Email_Id ?? e.email_id ?? null,
              stageinstance_id: e.StageInstance_Id ?? e.stageinstance_id,
            });
            if (error) { console.error(`EI ${eid}:`, error.message); skipped++; } else { created++; }
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
