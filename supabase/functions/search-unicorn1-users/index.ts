import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";
import { corsHeaders } from "../_shared/cors.ts";

serve(async (req) => {
  if (req.method === "OPTIONS") {
    return new Response("ok", { headers: corsHeaders });
  }

  const SUPABASE_URL = Deno.env.get("SUPABASE_URL")!;
  const SERVICE_ROLE_KEY = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
  const supabase = createClient(SUPABASE_URL, SERVICE_ROLE_KEY, {
    auth: { persistSession: false },
  });

  try {
    // Validate caller is SuperAdmin
    const token = req.headers.get("Authorization")?.replace(/^Bearer\s+/i, "");
    if (!token) {
      return new Response(JSON.stringify({ error: "Unauthorized" }), {
        status: 401,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    const { data: callerUser } = await supabase.auth.getUser(token);
    if (!callerUser?.user) {
      return new Response(JSON.stringify({ error: "Unauthorized" }), {
        status: 401,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    const { data: profile } = await supabase
      .from("users")
      .select("unicorn_role, global_role")
      .eq("user_uuid", callerUser.user.id)
      .maybeSingle();

    const isSuperAdmin = profile?.global_role === "SuperAdmin" ||
      profile?.unicorn_role === "Super Admin";
    if (!isSuperAdmin) {
      return new Response(JSON.stringify({ error: "Forbidden" }), {
        status: 403,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    const { search, unmapped_only } = await req.json();

    // Query unicorn1.users using raw SQL since it's a different schema
    let query = `
      SELECT "ID", "FirstName", "LastName", email, "JobTitle", "Phone", "PhoneNumber",
             "Discriminator", "Archived", "Disabled", mapped_user_uuid
      FROM unicorn1.users
      WHERE is_deleted = false
    `;
    const params: string[] = [];

    if (unmapped_only !== false) {
      query += ` AND mapped_user_uuid IS NULL`;
    }

    if (search && search.trim().length >= 2) {
      params.push(`%${search.trim().toLowerCase()}%`);
      query += ` AND (
        LOWER("FirstName") LIKE $${params.length}
        OR LOWER("LastName") LIKE $${params.length}
        OR LOWER(email) LIKE $${params.length}
      )`;
    }

    query += ` ORDER BY "FirstName", "LastName" LIMIT 50`;

    const { data, error } = await supabase.rpc("exec_sql", {
      query,
      params,
    });

    // Fallback: direct table query if RPC doesn't exist
    if (error) {
      // Use a simpler approach - query the table directly with service role
      let q = supabase
        .schema("unicorn1" as any)
        .from("users")
        .select("ID, FirstName, LastName, email, JobTitle, Phone, PhoneNumber, Discriminator, Archived, Disabled, mapped_user_uuid")
        .eq("is_deleted", false)
        .order("FirstName", { ascending: true })
        .limit(50);

      if (unmapped_only !== false) {
        q = q.is("mapped_user_uuid", null);
      }

      if (search && search.trim().length >= 2) {
        q = q.or(`FirstName.ilike.%${search.trim()}%,LastName.ilike.%${search.trim()}%,email.ilike.%${search.trim()}%`);
      }

      const { data: fallbackData, error: fallbackError } = await q;
      
      if (fallbackError) {
        console.error("Query error:", fallbackError);
        return new Response(JSON.stringify({ error: fallbackError.message }), {
          status: 500,
          headers: { ...corsHeaders, "Content-Type": "application/json" },
        });
      }

      return new Response(JSON.stringify({ users: fallbackData || [] }), {
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    return new Response(JSON.stringify({ users: data || [] }), {
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  } catch (e: any) {
    console.error("Error:", e);
    return new Response(JSON.stringify({ error: e.message }), {
      status: 500,
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }
});
