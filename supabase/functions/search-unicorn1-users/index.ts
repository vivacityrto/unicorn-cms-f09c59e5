import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";
import { corsHeaders } from "../_shared/cors.ts";
import { requireCaller, FeatureKeys } from "../_shared/requireCaller.ts";

serve(async (req) => {
  if (req.method === "OPTIONS") {
    return new Response("ok", { headers: corsHeaders(req) });
  }

  const SUPABASE_URL = Deno.env.get("SUPABASE_URL")!;
  const SERVICE_ROLE_KEY = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
  const supabase = createClient(SUPABASE_URL, SERVICE_ROLE_KEY, {
    auth: { persistSession: false },
  });

  try {
    const caller = await requireCaller(req, supabase, {
      featureKey: FeatureKeys.adminUnicorn1,
      headers: corsHeaders(req),
      unauthorizedMessage: "Unauthorized",
      forbiddenMessage: "Forbidden",
    });
    if (!caller.ok) return caller.response;

    const { search, unmapped_only } = await req.json();

    // Use RPC to query unicorn1 schema since PostgREST only exposes public schema
    const searchTerm = search?.trim() || "";
    const { data, error } = await supabase.rpc("search_unicorn1_users", {
      p_search: searchTerm,
      p_unmapped_only: unmapped_only !== false,
    });

    if (error) {
      console.error("RPC error:", error);
      return new Response(JSON.stringify({ error: error.message }), {
        status: 500,
        headers: { ...corsHeaders(req), "Content-Type": "application/json" },
      });
    }

    return new Response(JSON.stringify({ users: data || [] }), {
      headers: { ...corsHeaders(req), "Content-Type": "application/json" },
    });
  } catch (e: unknown) {
    console.error("Error:", e);
    return new Response(JSON.stringify({ error: e instanceof Error ? e.message : "Unknown error" }), {
      status: 500,
      headers: { ...corsHeaders(req), "Content-Type": "application/json" },
    });
  }
});
