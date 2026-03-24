import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";
import { Connection, Request as TdsRequest, TYPES } from "npm:tedious@18.6.1";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers":
    "authorization, x-client-info, apikey, content-type, x-supabase-client-platform, x-supabase-client-platform-version, x-supabase-client-runtime, x-supabase-client-runtime-version",
};

/** Connect to MSSQL via tedious, returning a promise-based wrapper. */
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

/** Execute a parameterised query and return rows as objects. */
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
    { alias: "email", candidates: ["email", "email_address"] },
    { alias: "phone", candidates: ["phone", "phone_number", "telephone", "mobile"] },
    { alias: "website", candidates: ["website", "web_site", "url"] },
    { alias: "address", candidates: ["address", "street_address", "address1"] },
    { alias: "suburb", candidates: ["suburb", "city", "town"] },
    { alias: "state_code", candidates: ["state_code", "state", "province"] },
    { alias: "postcode", candidates: ["postcode", "post_code", "zip", "zipcode"] },
    { alias: "lms", candidates: ["lms", "lms_name"] },
    { alias: "accounting_system", candidates: ["accounting_system", "accountingsystem"] },
  ];

  const selectParts = mappings.map(({ alias, candidates }) => {
    const matched = firstMatchingColumn(columns, candidates);
    return matched ? `[${matched}] AS [${alias}]` : `NULL AS [${alias}]`;
  });

  return { 
    selectClause: selectParts.join(",\n                 "),
    searchIdColumn: firstMatchingColumn(columns, ["id", "user_id", "tenant_id", "client_id"]),
    searchNameColumns: [
      firstMatchingColumn(columns, ["companyname", "company_name", "business_name", "name"]),
      firstMatchingColumn(columns, ["rto_name", "rtoname", "trading_name", "rto"]),
      firstMatchingColumn(columns, ["legal_name", "legalname", "entity_name"]),
      firstMatchingColumn(columns, ["rto_id", "rtoid", "rtocode", "rto_code"]),
    ].filter(Boolean) as string[],
    searchRtoColumn: firstMatchingColumn(columns, ["rto_id", "rtoid", "rtocode", "rto_code"]),
  };
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
    // Verify SuperAdmin
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
    const { search } = await req.json();
    if (!search || typeof search !== "string" || search.trim().length < 2) {
      return new Response(
        JSON.stringify({ error: "Provide a search term (min 2 chars)" }),
        { status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    // --- Query MSSQL ---
    const conn = await connectMssql();
    try {
      const isNumeric = /^\d+$/.test(search.trim());
      let sql: string;
      let params: { name: string; type: any; value: any }[];

      if (isNumeric) {
        sql = `SELECT TOP 20 id, companyname, rto_id, rto_name, legal_name,
                 abn, acn, cricos_id, email, phone, website,
                 address, suburb, state_code, postcode, lms, accounting_system
               FROM Users
               WHERE id = @searchId OR rto_id = @searchStr
               ORDER BY companyname`;
        params = [
          { name: "searchId", type: TYPES.Int, value: parseInt(search.trim()) },
          { name: "searchStr", type: TYPES.NVarChar, value: search.trim() },
        ];
      } else {
        sql = `SELECT TOP 20 id, companyname, rto_id, rto_name, legal_name,
                 abn, acn, cricos_id, email, phone, website,
                 address, suburb, state_code, postcode, lms, accounting_system
               FROM Users
               WHERE companyname LIKE @searchPattern
                  OR rto_name LIKE @searchPattern
                  OR legal_name LIKE @searchPattern
                  OR rto_id LIKE @searchPattern
               ORDER BY companyname`;
        params = [
          { name: "searchPattern", type: TYPES.NVarChar, value: `%${search.trim()}%` },
        ];
      }

      const rows = await execQuery(conn, sql, params);
      return new Response(JSON.stringify({ clients: rows }), {
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    } finally {
      conn.close();
    }
  } catch (err: any) {
    console.error("lookup-unicorn1-client error:", err);
    return new Response(
      JSON.stringify({ error: err.message || "Internal error" }),
      { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } }
    );
  }
});
