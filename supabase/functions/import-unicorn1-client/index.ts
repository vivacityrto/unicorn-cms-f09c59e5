import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";
import { Connection, Request as TdsRequest, TYPES } from "npm:tedious@18.6.1";
import { requireCaller, FeatureKeys } from "../_shared/requireCaller.ts";
import { corsHeaders } from "../_shared/cors.ts";

type SvcClient = ReturnType<typeof createClient>;


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
 * Order respects FK constraints (children first), and nulls out
 * references on tables we don't want to delete from.
 */
async function clearTenantInstanceData(svcClient: SvcClient, tenantId: number): Promise<Record<string, number>> {
  const counts: Record<string, number> = {};

  const { data: pkgRows } = await svcClient
    .from("package_instances")
    .select("id")
    .eq("tenant_id", tenantId);
  const piIds = (pkgRows ?? []).map((r: any) => Number(r.id));

  if (piIds.length === 0) return counts;

  const { data: siRows } = await svcClient
    .from("stage_instances")
    .select("id")
    .in("packageinstance_id", piIds);
  const siIds = (siRows ?? []).map((r: any) => Number(r.id));

  // ---- Stage-child rows ----
  if (siIds.length > 0) {
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

      // Null linked_stage_instance_id on client_audits to release SET NULL FK
      await (svcClient.from("client_audits") as any)
        .update({ linked_stage_instance_id: null })
        .in("linked_stage_instance_id", batch);
    }

    for (let i = 0; i < siIds.length; i += 100) {
      const batch = siIds.slice(i, i + 100);
      const { count: c5 } = await svcClient
        .from("stage_instances").delete({ count: "exact" }).in("id", batch);
      counts.stage_instances = (counts.stage_instances ?? 0) + (c5 ?? 0);
    }
  }

  // ---- Package-level child rows ----
  // Null parent_instance_id on any child packages (e.g. add-on linked packages)
  await (svcClient.from("package_instances") as any)
    .update({ parent_instance_id: null })
    .in("parent_instance_id", piIds);

  // Null ops_work_items.package_instance_id (don't delete operational work items)
  await (svcClient.from("ops_work_items") as any)
    .update({ package_instance_id: null })
    .in("package_instance_id", piIds);

  for (let i = 0; i < piIds.length; i += 100) {
    const batch = piIds.slice(i, i + 100);

    const { count: te } = await svcClient
      .from("time_entries").delete({ count: "exact" }).in("package_instance_id", batch);
    counts.time_entries = (counts.time_entries ?? 0) + (te ?? 0);

    const { count: ph } = await svcClient
      .from("phase_instances").delete({ count: "exact" }).in("package_instance_id", batch);
    counts.phase_instances = (counts.phase_instances ?? 0) + (ph ?? 0);

    const { count: sl } = await (svcClient.from("package_instance_state_log") as any)
      .delete({ count: "exact" }).in("package_instance_id", batch);
    counts.package_instance_state_log = (counts.package_instance_state_log ?? 0) + (sl ?? 0);

    const { count: cs } = await (svcClient.from("compliance_score_snapshots") as any)
      .delete({ count: "exact" }).in("package_instance_id", batch);
    counts.compliance_score_snapshots = (counts.compliance_score_snapshots ?? 0) + (cs ?? 0);

    // package_notes: cascade-on-delete in schema, but be explicit so cleanup is observable
    const { count: pn } = await (svcClient.from("package_notes") as any)
      .delete({ count: "exact" }).in("package_instance_id", batch);
    if (pn !== null && pn !== undefined) counts.package_notes = (counts.package_notes ?? 0) + (pn ?? 0);
  }

  // ---- Package instances ----
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
    const { data: linkRows } = await svcClient
      .from("document_stage_links").select("document_id").eq("stage_id", stageId);
    const additionalIds = (linkRows ?? []).map((r: any) => r.document_id);

    let docsQuery = svcClient.from("documents").select("id");
    docsQuery = additionalIds.length > 0
      ? docsQuery.or(`stage.eq.${stageId},id.in.(${additionalIds.join(',')})`)
      : docsQuery.eq("stage", stageId);
    const { data: templates } = await docsQuery;
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
    return new Response(null, { headers: corsHeaders(req) });
  }

  try {
    const svcClient = createClient(
      Deno.env.get("SUPABASE_URL")!,
      Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!
    );
    const caller = await requireCaller(req, svcClient, {
      featureKey: FeatureKeys.adminUnicorn1,
      headers: corsHeaders(req),
      unauthorizedMessage: "Unauthorized",
      forbiddenMessage: "Forbidden – SuperAdmin only",
    });
    if (!caller.ok) return caller.response;

    const { client_id, import_options } = await req.json();
    if (!client_id || typeof client_id !== "number") {
      return new Response(
        JSON.stringify({ error: "client_id (number) is required" }),
        { status: 400, headers: { ...corsHeaders(req), "Content-Type": "application/json" } }
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

    // Mapping of Unicorn 1 PackageInstance.Id -> actual Unicorn 2 package_instances.id
    const piIdMap = new Map<number, number>();

    try {
      // ---- 0. Cleanup ----
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
            { status: 404, headers: { ...corsHeaders(req), "Content-Type": "application/json" } }
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
            unicorn1_id: client_id,
            tenant_type: "compliance_system",
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
          `SELECT [Id], [Package_Id], [StartDate], [EndDate], [IsComplete], [CLO_Id] FROM [dbo].[PackageInstances] WHERE [Client_Id] = @cid`,
          [{ name: "cid", type: TYPES.Int, value: client_id }]
        );
        let created = 0, skipped = 0, remapped = 0;
        for (const p of pkgs) {
          const u1Pid = Number(p.Id ?? p.id);
          const startDate = p.StartDate ?? p.startdate ?? new Date().toISOString().split('T')[0];
          const endDate = p.EndDate ?? p.enddate ?? null;
          const cloId = p.CLO_Id ?? p.Clo_Id ?? p.clo_id ?? null;
          const isComplete = p.IsComplete ?? p.iscomplete ?? false;
          const row = {
            tenant_id: client_id,
            package_id: p.Package_Id ?? p.package_id,
            is_complete: Boolean(isComplete),
            start_date: startDate,
            end_date: endDate,
            clo_id: cloId ? Number(cloId) : null,
            u1_packageid: u1Pid,
          };

          // Try with U1 ID first
          const { data: ins1, error: err1 } = await svcClient
            .from("package_instances")
            .insert({ id: u1Pid, ...row })
            .select("id")
            .single();

          if (!err1 && ins1) {
            piIdMap.set(u1Pid, Number(ins1.id));
            created++;
            continue;
          }

          // Retry with auto-ID
          console.warn(`PI ${u1Pid} ID conflict, retrying with auto-ID:`, err1?.message);
          const { data: ins2, error: err2 } = await svcClient
            .from("package_instances")
            .insert(row)
            .select("id")
            .single();

          if (err2 || !ins2) {
            console.error(`PI ${u1Pid}:`, err2?.message);
            skipped++;
          } else {
            piIdMap.set(u1Pid, Number(ins2.id));
            remapped++;
            created++;
          }
        }
        results.imported.package_instances = { created, skipped, remapped, total: pkgs.length };
      } else {
        // Even if not (re)importing, build the map from existing rows so stage import still works.
        const { data: existingPis } = await svcClient
          .from("package_instances")
          .select("id, u1_packageid")
          .eq("tenant_id", client_id);
        for (const r of existingPis ?? []) {
          if ((r as any).u1_packageid) piIdMap.set(Number((r as any).u1_packageid), Number((r as any).id));
        }
      }

      // ---- 3. Stage Instances ----
      let stageBackfill = { created: 0, skipped: 0 };
      if (opts.stage_instances) {
        let created = 0, skipped = 0, total = 0;
        const u1PiIds = Array.from(piIdMap.keys());

        if (u1PiIds.length > 0) {
          const idList = u1PiIds.join(",");
          const stages = await execQuery(
            conn,
            `SELECT si.[Id], si.[Stage_Id], si.[PackageInstance_Id], pi.[Package_Id] AS [PackageId]
             FROM [dbo].[StageInstances] si
             INNER JOIN [dbo].[PackageInstances] pi ON pi.[Id] = si.[PackageInstance_Id]
             WHERE si.[PackageInstance_Id] IN (${idList})`,
            []
          );
          total = stages.length;

          // Sort order lookup
          const uniquePkgIds = [...new Set(stages.map((s) => Number(s.PackageId)).filter(Number.isFinite))];
          const { data: pkgStages } = await svcClient
            .from("package_stages")
            .select("package_id, stage_id, sort_order")
            .in("package_id", uniquePkgIds);
          const sortOrderMap = new Map<string, number>();
          for (const ps of pkgStages ?? []) {
            sortOrderMap.set(`${ps.package_id}-${ps.stage_id}`, ps.sort_order ?? 0);
          }

          // Valid stages in U2
          const { data: allStages } = await svcClient.from("stages").select("id");
          const validStageIds = new Set((allStages ?? []).map((s: any) => Number(s.id)));

          for (const s of stages) {
            const u1Sid = Number(s.Id ?? s.id);
            const stageId = Number(s.Stage_Id ?? s.stage_id);
            const u1Pi = Number(s.PackageInstance_Id ?? s.packageinstance_id);
            const packageId = Number(s.PackageId);

            const targetPi = piIdMap.get(u1Pi);
            if (!targetPi) {
              console.error(`SI ${u1Sid}: no mapped package instance for U1 PI ${u1Pi}`);
              skipped++;
              continue;
            }

            if (!validStageIds.has(stageId)) {
              console.warn(`SI ${u1Sid}: stage_id ${stageId} not in U2 stages — skipped, will backfill from template`);
              skipped++;
              continue;
            }

            const sortOrder = sortOrderMap.get(`${packageId}-${stageId}`) ?? null;

            // Try with U1 stage instance ID first; if collision, auto-generate
            const insertRow = {
              stage_id: stageId,
              packageinstance_id: targetPi,
              stage_sortorder: sortOrder,
            };
            const { error: e1 } = await svcClient
              .from("stage_instances")
              .insert({ id: u1Sid, ...insertRow });
            if (e1) {
              const { error: e2 } = await svcClient
                .from("stage_instances")
                .insert(insertRow);
              if (e2) {
                console.error(`SI ${u1Sid}:`, e2.message);
                skipped++;
                continue;
              }
            }
            created++;
          }
        }
        results.imported.stage_instances = { created, skipped, total };

        // ---- 3b. Backfill from U2 package_stages templates for any imported package
        // missing one of its template stages. This handles the U1<->U2 out-of-sync case.
        const targetPis = Array.from(piIdMap.values());
        if (targetPis.length > 0) {
          // Get tenant package instances + their package_id
          const { data: pis } = await svcClient
            .from("package_instances")
            .select("id, package_id")
            .in("id", targetPis);

          const pkgIdSet = new Set<number>((pis ?? []).map((r: any) => Number(r.package_id)));
          const { data: tpls } = await svcClient
            .from("package_stages")
            .select("package_id, stage_id, sort_order")
            .in("package_id", Array.from(pkgIdSet));

          const tplsByPkg = new Map<number, { stage_id: number; sort_order: number | null }[]>();
          for (const t of tpls ?? []) {
            const k = Number((t as any).package_id);
            if (!tplsByPkg.has(k)) tplsByPkg.set(k, []);
            tplsByPkg.get(k)!.push({ stage_id: Number((t as any).stage_id), sort_order: (t as any).sort_order ?? null });
          }

          // Existing stage instances per pi
          const { data: existingSis } = await svcClient
            .from("stage_instances")
            .select("packageinstance_id, stage_id")
            .in("packageinstance_id", targetPis);
          const existingByPi = new Map<number, Set<number>>();
          for (const si of existingSis ?? []) {
            const pi = Number((si as any).packageinstance_id);
            if (!existingByPi.has(pi)) existingByPi.set(pi, new Set());
            existingByPi.get(pi)!.add(Number((si as any).stage_id));
          }

          for (const pi of pis ?? []) {
            const piId = Number((pi as any).id);
            const pkgId = Number((pi as any).package_id);
            const tplStages = tplsByPkg.get(pkgId) ?? [];
            const have = existingByPi.get(piId) ?? new Set<number>();
            for (const t of tplStages) {
              if (have.has(t.stage_id)) continue;
              const { error: bErr } = await svcClient.from("stage_instances").insert({
                stage_id: t.stage_id,
                packageinstance_id: piId,
                stage_sortorder: t.sort_order,
              });
              if (bErr) {
                console.error(`Backfill SI (pi ${piId}, stage ${t.stage_id}):`, bErr.message);
                stageBackfill.skipped++;
              } else {
                stageBackfill.created++;
              }
            }
          }
        }
        results.imported.stage_instances_backfill = stageBackfill;
      }

      // ---- 4-7. Seed child instances from Unicorn 2 templates ----
      const needsSeed = opts.staff_task_instances || opts.client_task_instances || opts.email_instances || opts.document_instances;
      if (needsSeed) {
        const { data: piRows } = await svcClient
          .from("package_instances").select("id").eq("tenant_id", client_id);
        const localPiIds = (piRows ?? []).map((r: any) => Number(r.id));

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

        if (opts.staff_task_instances) results.imported.staff_task_instances = { seeded: totals.staff };
        if (opts.client_task_instances) results.imported.client_task_instances = { seeded: totals.client };
        if (opts.email_instances) results.imported.email_instances = { seeded: totals.emails };
        if (opts.document_instances) results.imported.document_instances = { seeded: totals.documents };
      }

      return new Response(JSON.stringify(results), {
        headers: { ...corsHeaders(req), "Content-Type": "application/json" },
      });
    } finally {
      conn.close();
    }
  } catch (err: any) {
    console.error("import-unicorn1-client error:", err);
    return new Response(
      JSON.stringify({ error: err.message || "Internal error" }),
      { status: 500, headers: { ...corsHeaders(req), "Content-Type": "application/json" } }
    );
  }
});
