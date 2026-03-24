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

async function getTableColumns(conn: Connection, tableName: string, schema = "dbo") {
  const rows = await execQuery(
    conn,
    `SELECT COLUMN_NAME
     FROM INFORMATION_SCHEMA.COLUMNS
     WHERE TABLE_SCHEMA = @schema AND TABLE_NAME = @tableName`,
    [
      { name: "schema", type: TYPES.NVarChar, value: schema },
      { name: "tableName", type: TYPES.NVarChar, value: tableName },
    ]
  );

  return new Set(rows.map((row) => String(row.COLUMN_NAME || row.column_name || "").toLowerCase()));
}

function firstMatchingColumn(columns: Set<string>, candidates: string[]) {
  return candidates.find((candidate) => columns.has(candidate.toLowerCase())) ?? null;
}

function buildTenantSelect(columns: Set<string>) {
  const mappings = [
    { alias: "id", candidates: ["id", "user_id", "tenant_id", "client_id"] },
    { alias: "companyname", candidates: ["companyname", "company_name", "business_name", "name"] },
    { alias: "rto_id", candidates: ["rto_id", "rtoid", "rtocode", "rto_code"] },
    { alias: "rto_name", candidates: ["rto_name", "rtoname", "trading_name", "rto"] },
    { alias: "legal_name", candidates: ["legal_name", "legalname", "entity_name"] },
    { alias: "abn", candidates: ["abn"] },
    { alias: "acn", candidates: ["acn"] },
    { alias: "cricos_id", candidates: ["cricos_id", "cricosid", "cricos_code"] },
    { alias: "website", candidates: ["website", "web_site", "url"] },
    { alias: "lms", candidates: ["lms", "lms_name"] },
    { alias: "accounting_system", candidates: ["accounting_system", "accountingsystem"] },
  ];

  return mappings
    .map(({ alias, candidates }) => {
      const matched = firstMatchingColumn(columns, candidates);
      return matched ? `[${matched}] AS [${alias}]` : `NULL AS [${alias}]`;
    })
    .join(",\n                   ");
}

function toDateStr(val: any): string | null {
  if (!val) return null;
  if (val instanceof Date) return val.toISOString().split("T")[0];
  return String(val).split("T")[0];
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
    const userId = claimsData.claims.sub;
    const svcClient = createClient(
      Deno.env.get("SUPABASE_URL")!,
      Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!
    );
    const { data: profile } = await svcClient
      .from("users")
      .select("global_role, unicorn_role")
      .eq("user_uuid", userId)
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
    };

    const results: Record<string, any> = { imported: {} };
    const conn = await connectMssql();

    try {
      // ---- 1. Tenant ----
      if (opts.tenant) {
        const tenantColumns = await getTableColumns(conn, "Users", "dbo");
        const tenantIdColumn = firstMatchingColumn(tenantColumns, ["id", "user_id", "tenant_id", "client_id"]);
        if (!tenantIdColumn) {
          throw new Error("Could not find an ID column on dbo.Users");
        }

        const clients = await execQuery(
          conn,
          `SELECT ${buildTenantSelect(tenantColumns)}
           FROM [dbo].[Users] WHERE [${tenantIdColumn}] = @cid`,
          [{ name: "cid", type: TYPES.Int, value: client_id }]
        );
        if (clients.length === 0) {
          return new Response(
            JSON.stringify({ error: `Client ${client_id} not found in Unicorn 1` }),
            { status: 404, headers: { ...corsHeaders, "Content-Type": "application/json" } }
          );
        }
        const c = clients[0];

        // Check if tenant already exists
        const { data: existing } = await svcClient
          .from("tenants")
          .select("id")
          .eq("id", client_id)
          .maybeSingle();

        if (existing) {
          results.imported.tenant = { status: "skipped", reason: "already exists" };
        } else {
          const slug = (c.companyname || `client-${client_id}`)
            .toLowerCase()
            .replace(/[^a-z0-9]+/g, "-")
            .replace(/(^-|-$)/g, "");

          const { error: tenantErr } = await svcClient.from("tenants").insert({
            id: client_id,
            name: c.companyname || c.rto_name || `Client ${client_id}`,
            slug,
            status: "active",
            lifecycle_status: "active",
            access_status: "enabled",
            rto_id: c.rto_id || null,
            rto_name: c.rto_name || null,
            legal_name: c.legal_name || null,
            abn: c.abn || null,
            acn: c.acn || null,
            cricos_id: c.cricos_id || null,
            website: c.website || null,
            lms: c.lms || null,
            accounting_system: c.accounting_system || null,
            import_id: client_id,
            tenant_type: "client",
            billing_status: "active",
            is_system_tenant: false,
          });
          if (tenantErr) throw new Error(`Tenant insert failed: ${tenantErr.message}`);
          results.imported.tenant = { status: "created", id: client_id };
        }
      }

      // ---- 2. Package Instances ----
      if (opts.package_instances) {
        const pkgs = await execQuery(
          conn,
          `SELECT id, package_id, start_date, end_date, is_complete, clo_id
           FROM package_instances WHERE client_id = @cid`,
          [{ name: "cid", type: TYPES.Int, value: client_id }]
        );

        let created = 0;
        let skipped = 0;
        for (const p of pkgs) {
          const { data: ex } = await svcClient
            .from("package_instances")
            .select("id")
            .eq("id", p.id)
            .maybeSingle();
          if (ex) {
            skipped++;
            continue;
          }
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
          if (error) {
            console.error(`PI ${p.id} insert error:`, error.message);
            skipped++;
          } else {
            created++;
          }
        }
        results.imported.package_instances = { created, skipped, total: pkgs.length };
      }

      // ---- 3. Stage Instances ----
      if (opts.stage_instances) {
        // Get package instance IDs for this client from MSSQL
        const pkgIds = await execQuery(
          conn,
          `SELECT id FROM package_instances WHERE client_id = @cid`,
          [{ name: "cid", type: TYPES.Int, value: client_id }]
        );
        const piIds = pkgIds.map((r) => r.id);

        let created = 0;
        let skipped = 0;
        let total = 0;

        if (piIds.length > 0) {
          // Query stage_instances in batches
          const idList = piIds.join(",");
          const stages = await execQuery(
            conn,
            `SELECT id, stage_id, packageinstance_id, completion_date, status_id, status, stage_sortorder
             FROM stage_instances WHERE packageinstance_id IN (${idList})`,
            []
          );
          total = stages.length;

          for (const s of stages) {
            const { data: ex } = await svcClient
              .from("stage_instances")
              .select("id")
              .eq("id", s.id)
              .maybeSingle();
            if (ex) {
              skipped++;
              continue;
            }
            const { error } = await svcClient.from("stage_instances").insert({
              id: s.id,
              stage_id: s.stage_id,
              packageinstance_id: s.packageinstance_id,
              completion_date: toDateStr(s.completion_date),
              status_id: s.status_id || null,
              status: s.status || null,
              stage_sortorder: s.stage_sortorder || null,
            });
            if (error) {
              console.error(`SI ${s.id} insert error:`, error.message);
              skipped++;
            } else {
              created++;
            }
          }
        }
        results.imported.stage_instances = { created, skipped, total };
      }

      // ---- 4. Document Instances ----
      if (opts.document_instances) {
        // Get stage instance IDs from MSSQL (via package_instances for this client)
        const pkgIds = await execQuery(
          conn,
          `SELECT id FROM package_instances WHERE client_id = @cid`,
          [{ name: "cid", type: TYPES.Int, value: client_id }]
        );
        const piIds = pkgIds.map((r) => r.id);

        let created = 0;
        let skipped = 0;
        let total = 0;

        if (piIds.length > 0) {
          const piList = piIds.join(",");
          const siRows = await execQuery(
            conn,
            `SELECT id FROM stage_instances WHERE packageinstance_id IN (${piList})`,
            []
          );
          const siIds = siRows.map((r) => r.id);

          if (siIds.length > 0) {
            const siList = siIds.join(",");
            const docs = await execQuery(
              conn,
              `SELECT id, document_id, stageinstance_id, tenant_id, isgenerated, generationdate
               FROM document_instances WHERE stageinstance_id IN (${siList})`,
              []
            );
            total = docs.length;

            for (const d of docs) {
              const { data: ex } = await svcClient
                .from("document_instances")
                .select("id")
                .eq("id", d.id)
                .maybeSingle();
              if (ex) {
                skipped++;
                continue;
              }
              const { error } = await svcClient.from("document_instances").insert({
                id: d.id,
                document_id: d.document_id,
                stageinstance_id: d.stageinstance_id,
                tenant_id: d.tenant_id || client_id,
                isgenerated: d.isgenerated || false,
                generationdate: d.generationdate || null,
              });
              if (error) {
                console.error(`DI ${d.id} insert error:`, error.message);
                skipped++;
              } else {
                created++;
              }
            }
          }
        }
        results.imported.document_instances = { created, skipped, total };
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
