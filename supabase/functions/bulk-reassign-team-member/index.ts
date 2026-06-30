import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";
import { corsHeaders } from "../_shared/cors.ts";

interface Body {
  from_user_id?: string;
  to_user_id?: string;
  tenant_ids?: number[];
  role_scope?: string;
}

const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

serve(async (req) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: corsHeaders });
  if (req.method !== "POST") {
    return new Response(JSON.stringify({ error: "Method not allowed" }), {
      status: 405,
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }

  const SUPABASE_URL = Deno.env.get("SUPABASE_URL")!;
  const ANON_KEY = Deno.env.get("SUPABASE_ANON_KEY")!;
  const authHeader = req.headers.get("Authorization") ?? "";

  if (!authHeader) {
    return new Response(JSON.stringify({ error: "Unauthorized" }), {
      status: 401,
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }

  let body: Body;
  try {
    body = await req.json();
  } catch {
    return new Response(JSON.stringify({ error: "Invalid JSON body" }), {
      status: 400,
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }

  const { from_user_id, to_user_id, tenant_ids, role_scope } = body;

  if (!from_user_id || !to_user_id || !UUID_RE.test(from_user_id) || !UUID_RE.test(to_user_id)) {
    return new Response(JSON.stringify({ error: "from_user_id and to_user_id must be valid UUIDs" }), {
      status: 400,
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }
  if (from_user_id === to_user_id) {
    return new Response(JSON.stringify({ error: "from_user_id and to_user_id must differ" }), {
      status: 400,
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }
  if (!Array.isArray(tenant_ids) || tenant_ids.length === 0 || !tenant_ids.every((t) => Number.isInteger(t) && t > 0)) {
    return new Response(JSON.stringify({ error: "tenant_ids must be a non-empty array of positive integers" }), {
      status: 400,
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }
  if (role_scope && role_scope !== "primary_csc") {
    return new Response(JSON.stringify({ error: "Only role_scope='primary_csc' is supported" }), {
      status: 400,
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }

  // Call the SECURITY DEFINER RPC with the caller's JWT so it can check unicorn_role
  const supabase = createClient(SUPABASE_URL, ANON_KEY, {
    global: { headers: { Authorization: authHeader } },
    auth: { persistSession: false },
  });

  const { data, error } = await supabase.rpc("bulk_reassign_primary_csc", {
    p_from_user_id: from_user_id,
    p_to_user_id: to_user_id,
    p_tenant_ids: tenant_ids,
  });

  if (error) {
    const isForbidden = /forbidden|not authenticated/i.test(error.message);
    return new Response(JSON.stringify({ error: error.message }), {
      status: isForbidden ? 403 : 400,
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }

  return new Response(JSON.stringify(data ?? { reassigned: [], skipped: [] }), {
    status: 200,
    headers: { ...corsHeaders, "Content-Type": "application/json" },
  });
});
