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

    const { legacy_id, mapped_user_uuid } = await req.json();

    if (typeof legacy_id !== "number" || typeof mapped_user_uuid !== "string") {
      return new Response(JSON.stringify({ error: "legacy_id (number) and mapped_user_uuid (string) are required" }), {
        status: 400,
        headers: { ...corsHeaders(req), "Content-Type": "application/json" },
      });
    }

    // Use RPC to write unicorn1 schema since PostgREST only exposes public schema
    const { error } = await supabase.rpc("mark_unicorn1_user_mapped", {
      p_legacy_id: legacy_id,
      p_mapped_user_uuid: mapped_user_uuid,
    });

    if (error) {
      console.error("RPC error:", error);
      return new Response(JSON.stringify({ error: error.message }), {
        status: 500,
        headers: { ...corsHeaders(req), "Content-Type": "application/json" },
      });
    }

    return new Response(JSON.stringify({ ok: true }), {
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
