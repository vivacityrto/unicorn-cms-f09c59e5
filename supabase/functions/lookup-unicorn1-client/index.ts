import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";
import { Connection, Request as TdsRequest, TYPES } from "npm:tedious@18.6.1";
import { requireCaller, FeatureKeys } from "../_shared/requireCaller.ts";
import { corsHeaders } from "../_shared/cors.ts";

type SqlType = Parameters<TdsRequest["addParameter"]>[1];
type SqlValue = Parameters<TdsRequest["addParameter"]>[2];
type SqlParam = { name: string; type: SqlType; value: SqlValue };
type SqlRow = Record<string, unknown>;
type SqlColumn = { metadata: { colName: string }; value: unknown };

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
        requestTimeout: 30000,
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
  params: SqlParam[]
): Promise<SqlRow[]> {
  return new Promise((resolve, reject) => {
    const rows: SqlRow[] = [];
    const req = new TdsRequest(sql, (err: Error | undefined) => {
      if (err) reject(err);
      else resolve(rows);
    });
    for (const p of params) {
      req.addParameter(p.name, p.type, p.value);
    }
    req.on("row", (columns: SqlColumn[]) => {
      const row: SqlRow = {};
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

    const { search } = await req.json();
    if (!search || typeof search !== "string" || search.trim().length < 2) {
      return new Response(
        JSON.stringify({ error: "Provide a search term (min 2 chars)" }),
        { status: 400, headers: { ...corsHeaders(req), "Content-Type": "application/json" } }
      );
    }

    const conn = await connectMssql();
    try {
      const trimmedSearch = search.trim();
      const isNumeric = /^\d+$/.test(trimmedSearch);

      // Search dbo.Users where discriminator = 'client'
      let sql: string;
      let params: SqlParam[];

      if (isNumeric) {
        sql = `SELECT TOP 20 u.[Id], u.[CompanyName]
               FROM [dbo].[Users] u
               WHERE u.[Discriminator] = 'Client'
                 AND u.[Id] = @searchId`;
        params = [{ name: "searchId", type: TYPES.Int, value: parseInt(trimmedSearch) }];
      } else {
        sql = `SELECT TOP 20 u.[Id], u.[CompanyName]
               FROM [dbo].[Users] u
               WHERE u.[Discriminator] = 'Client'
                 AND u.[CompanyName] LIKE @searchPattern`;
        params = [{ name: "searchPattern", type: TYPES.NVarChar, value: `%${trimmedSearch}%` }];
      }

      const users = await execQuery(conn, sql, params);

      // For each result, fetch RTO ID from clientfields (field_id = 14)
      const clients = [];
      for (const u of users) {
        let rtoId: string | null = null;
        try {
          const fields = await execQuery(
            conn,
            `SELECT [Value] FROM [dbo].[ClientFields] WHERE [UserId] = @uid AND [FieldId] = 14`,
            [{ name: "uid", type: TYPES.Int, value: u.Id ?? u.id }]
          );
          if (fields.length > 0 && (fields[0].Value ?? fields[0].value)) {
            rtoId = String(fields[0].Value ?? fields[0].value);
          }
        } catch (e) {
          console.error(`Failed to fetch clientfields for user ${u.id}:`, e);
        }

        clients.push({
          id: u.Id ?? u.id,
          company_name: u.CompanyName ?? u.company_name ?? u.companyname,
          rto_id: rtoId,
        });
      }

      return new Response(JSON.stringify({ clients }), {
        headers: { ...corsHeaders(req), "Content-Type": "application/json" },
      });
    } finally {
      conn.close();
    }
  } catch (err: unknown) {
    console.error("lookup-unicorn1-client error:", err);
    const message = err instanceof Error ? err.message : "Internal error";
    return new Response(
      JSON.stringify({ error: message }),
      { status: 500, headers: { ...corsHeaders(req), "Content-Type": "application/json" } }
    );
  }
});
