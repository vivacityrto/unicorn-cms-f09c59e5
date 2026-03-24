import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";
import { Connection, Request as TdsRequest, TYPES } from "npm:tedious@18.6.1";

type SvcClient = ReturnType<typeof createClient>;

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

/**
 * Clear ALL instance data for a tenant so we can re-import cleanly.
 * Deletion order respects FK constraints (children first).
 */
async function clearTenantInstanceData(svcClient: SvcClient, tenantId: number): Promise<Record<string, number>> {
  const counts: Record<string, number> = {};

  // Get package instance IDs for this tenant
  const { data: pkgRows } = await svcClient
    .from("package_instances")
    .select("id")
    .eq("tenant_id", tenantId);
  const piIds = (pkgRows ?? []).map((r: any) => Number(r.id));

  if (piIds.length === 0) return counts;

  // Get stage instance IDs
  const { data: siRows } = await svcClient
    .from("stage_instances")
    .select("id")
    .in("packageinstance_id", piIds);
  const siIds = (siRows ?? []).map((r: any) => Number(r.id));

  if (siIds.length > 0) {
    // Delete children of stage instances in batches (Supabase .in() limit)
    for (let i = 0; i < siIds.length; i += 100) {
      const batch = siIds.slice(i, i + 100);

      const { count: c1 } = await svcClient
        .from("staff_task_instances").delete({ count: "exact" }).in("stageinstance_id", batch);
      counts.staff_task_instances = (counts.staff_task_instances ?? 0) + (c1 ?? 0);

      const { count: c2 } = await svcClient
        .from("client_task_instances").delete({ count: "exact" }).in("stageinstance_id", batch);
      counts.client_task_instances = (counts.client_task_instances ?? 0) + (c2 ?? 0);

      const { count: c3 } = await svcClient
        .from("email_instances").delete({ count: "exact" }).in("stageinstance_id", batch);
      counts.email_instances = (counts.email_instances ?? 0) + (c3 ?? 0);

      const { count: c4 } = await svcClient
        .from("document_instances").delete({ count: "exact" }).in("stageinstance_id", batch);
      counts.document_instances = (counts.document_instances ?? 0) + (c4 ?? 0);
    }

    // Delete stage instances
    for (let i = 0; i < siIds.length; i += 100) {
      const batch = siIds.slice(i, i + 100);
      const { count: c5 } = await svcClient
        .from("stage_instances").delete({ count: "exact" }).in("id", batch);
      counts.stage_instances = (counts.stage_instances ?? 0) + (c5 ?? 0);
    }
  }

  // Delete package instances
  const { count: piCount } = await svcClient
    .from("package_instances").delete({ count: "exact" }).eq("tenant_id", tenantId);
  counts.package_instances = piCount ?? 0;

  console.log(`Cleared tenant ${tenantId} instance data:`, counts);
  return counts;
}

/**
 * Seed child instances from Unicorn 2 templates for a given stage instance.
 */
async function seedChildInstances(
  svcClient: SvcClient,
  stageInstanceId: number,
  stageId: number,
  tenantId: number,
  opts: { staff: boolean; client: boolean; emails: boolean; documents: boolean }
): Promise<{ staff: number; client: number; emails: number; documents: number }> {
  const seeded = { staff: 0, client: 0, emails: 0, documents: 0 };

  if (opts.staff) {
    const { data: templates } = await svcClient
      .from("staff_tasks").select("id").eq("stage_id", stageId);
    for (const t of templates ?? []) {
      const { error } = await svcClient.from("staff_task_instances").insert({
        stafftask_id: t.id,
        stageinstance_id: stageInstanceId,
      });
      if (!error) seeded.staff++;
      else console.error(`STI seed err (task ${t.id}, si ${stageInstanceId}):`, error.message);
    }
  }

  if (opts.client) {
    const { data: templates } = await svcClient
      .from("client_tasks").select("id").eq("stage_id", stageId);
    for (const t of templates ?? []) {
      const { error } = await svcClient.from("client_task_instances").insert({
        clienttask_id: t.id,
        stageinstance_id: stageInstanceId,
      });
      if (!error) seeded.client++;
      else console.error(`CTI seed err (task ${t.id}, si ${stageInstanceId}):`, error.message);
    }
  }

  if (opts.emails) {
    const { data: templates } = await svcClient
      .from("emails").select("id, subject, content").eq("stage_id", stageId);
    for (const e of templates ?? []) {
      const { error } = await svcClient.from("email_instances").insert({
        email_id: e.id,
        stageinstance_id: stageInstanceId,
        subject: e.subject ?? null,
        content: e.content ?? null,
        is_sent: false,
      });
      if (!error) seeded.emails++;
      else console.error(`EI seed err (email ${e.id}, si ${stageInstanceId}):`, error.message);
    }
  }

  if (opts.documents) {
    const { data: templates } = await svcClient
      .from("documents").select("id").eq("stage", stageId);
    for (const d of templates ?? []) {
      const { error } = await svcClient.from("document_instances").insert({
        document_id: d.id,
        stageinstance_id: stageInstanceId,
        tenant_id: tenantId,
      });
      if (!error) seeded.documents++;
      else console.error(`DI seed err (doc ${d.id}, si ${stageInstanceId}):`, error.message);
    }
  }

  return seeded;
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
      // ---- 0. Clear existing instance data for clean re-import ----
      const cleared = await clearTenantInstanceData(svcClient, client_id);
      results.cleared = cleared;

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

      // Helper: get package instance IDs for this client from MSSQL
      async function getPackageInstanceIds(): Promise<number[]> {
        const pkgs = await execQuery(
          conn,
          `SELECT [Id] FROM [dbo].[PackageInstances] WHERE [Client_Id] = @cid`,
          [{ name: "cid", type: TYPES.Int, value: client_id }]
        );
        return pkgs.map((r) => r.Id ?? r.id);
      }

      // ---- 2. Package Instances ----
      if (opts.package_instances) {
        const pkgs = await execQuery(
          conn,
          `SELECT [Id], [Package_Id], [StartDate], [EndDate], [IsComplete], [CLO_Id] FROM [dbo].[PackageInstances] WHERE [Client_Id] = @cid`,
          [{ name: "cid", type: TYPES.Int, value: client_id }]
        );
        let created = 0, skipped = 0;
        for (const p of pkgs) {
          const pid = p.Id ?? p.id;
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
          if (error) {
            console.error(`PI ${pid}:`, error.message);
            skipped++;
          } else {
            created++;
          }
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
            `SELECT si.[Id], si.[Stage_Id], si.[PackageInstance_Id], pi.[Package_Id] AS [PackageId]
             FROM [dbo].[StageInstances] si
             INNER JOIN [dbo].[PackageInstances] pi ON pi.[Id] = si.[PackageInstance_Id]
             WHERE si.[PackageInstance_Id] IN (${idList})`,
            []
          );
          total = stages.length;

          // Build sort order lookup from package_stages
          const uniquePkgIds = [...new Set(stages.map((s) => Number(s.PackageId)).filter(Number.isFinite))];
          const { data: pkgStages } = await svcClient
            .from("package_stages")
            .select("package_id, stage_id, sort_order")
            .in("package_id", uniquePkgIds);
          const sortOrderMap = new Map<string, number>();
          for (const ps of pkgStages ?? []) {
            sortOrderMap.set(`${ps.package_id}-${ps.stage_id}`, ps.sort_order ?? 0);
          }

          // Verify which stage IDs exist in U2
          const { data: allStages } = await svcClient.from("stages").select("id");
          const validStageIds = new Set((allStages ?? []).map((s: any) => Number(s.id)));

          for (const s of stages) {
            const sid = s.Id ?? s.id;
            const stageId = Number(s.Stage_Id ?? s.stage_id);
            const packageId = Number(s.PackageId);

            if (!validStageIds.has(stageId)) {
              console.error(`SI ${sid}: stage_id ${stageId} not found in U2 stages table`);
              skipped++;
              continue;
            }

            const sortOrder = sortOrderMap.get(`${packageId}-${stageId}`) ?? null;

            const { error } = await svcClient.from("stage_instances").insert({
              id: sid,
              stage_id: stageId,
              packageinstance_id: s.PackageInstance_Id ?? s.packageinstance_id,
              stage_sortorder: sortOrder,
            });
            if (error) {
              console.error(`SI ${sid}:`, error.message);
              skipped++;
            } else {
              created++;
            }
          }
        }
        results.imported.stage_instances = { created, skipped, total };
      }

      // ---- 4-7. Seed child instances from Unicorn 2 templates ----
      const needsSeed = opts.staff_task_instances || opts.client_task_instances || opts.email_instances || opts.document_instances;
      if (needsSeed) {
        // Get all stage instances for this tenant
        const { data: piRows } = await svcClient
          .from("package_instances").select("id").eq("tenant_id", client_id);
        const localPiIds = (piRows ?? []).map((r: any) => r.id);

        let newSiRows: any[] = [];
        if (localPiIds.length > 0) {
          const { data } = await svcClient
            .from("stage_instances")
            .select("id, stage_id, packageinstance_id")
            .in("packageinstance_id", localPiIds);
          newSiRows = data ?? [];
        }

        const totals = { staff: 0, client: 0, emails: 0, documents: 0 };

        for (const si of newSiRows) {
          const seeded = await seedChildInstances(
            svcClient,
            Number(si.id),
            Number(si.stage_id),
            client_id,
            {
              staff: opts.staff_task_instances,
              client: opts.client_task_instances,
              emails: opts.email_instances,
              documents: opts.document_instances,
            }
          );
          totals.staff += seeded.staff;
          totals.client += seeded.client;
          totals.emails += seeded.emails;
          totals.documents += seeded.documents;
        }

        console.log(`Seeded child instances for tenant ${client_id}:`, totals);

        if (opts.staff_task_instances) {
          results.imported.staff_task_instances = { seeded: totals.staff };
        }
        if (opts.client_task_instances) {
          results.imported.client_task_instances = { seeded: totals.client };
        }
        if (opts.email_instances) {
          results.imported.email_instances = { seeded: totals.emails };
        }
        if (opts.document_instances) {
          results.imported.document_instances = { seeded: totals.documents };
        }
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
