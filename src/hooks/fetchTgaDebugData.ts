import { supabase } from "@/integrations/supabase/client";

/**
 * Loads the two latest-row sources used by the SuperAdmin TGA debug panel.
 * The caller owns authorization guards, payload projection, and state updates;
 * this adapter preserves the existing query contracts and ignored errors.
 */
export async function fetchTgaDebugData(tenantId: number, rtoNumber: string) {
  const [runRes, payloadRes] = await Promise.all([
    supabase
      .from("tga_rest_sync_jobs")
      .select("id, status, created_at, rto_id, scope_counts, last_error, payload")
      .eq("tenant_id", tenantId)
      .order("created_at", { ascending: false })
      .limit(1)
      .maybeSingle(),
    supabase
      .from("tga_debug_payloads")
      .select("record_count, fetched_at, endpoint, http_status, payload")
      .eq("tenant_id", tenantId)
      .eq("rto_code", rtoNumber)
      .order("fetched_at", { ascending: false })
      .limit(1)
      .maybeSingle(),
  ]);

  return {
    runData: runRes.data,
    payloadData: payloadRes.data,
  };
}
