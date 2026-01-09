import { serve } from "https://deno.land/std@0.224.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2.75.0";

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
};

const supabaseUrl = Deno.env.get("SUPABASE_URL")!;
const supabaseServiceKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
const supabaseAdmin = createClient(supabaseUrl, supabaseServiceKey);

/**
 * Fetch scope items from TGA REST API for a specific component type
 */
async function fetchScope(rtoId: string, componentType: string): Promise<any[]> {
  // Different settings per component type
  const delivery = componentType === 'skillSet' ? 'false' : 'true';
  const today = new Date().toISOString().split('T')[0];
  const filter = componentType === 'unit' ? 'unit|accreditedUnit' : componentType;
  
  const url = `https://training.gov.au/api/organisation/${rtoId}/scope?api-version=1.0&offset=0&pageSize=1000&delivery=${delivery}&filters=componentType==${filter},DateNullSearch==${today}&sorts=code`;
  
  console.log(`[TGA_SYNC] Fetching ${componentType} from: ${url}`);
  
  const resp = await fetch(url, {
    headers: { 'User-Agent': 'Unicorn/2.0', 'Accept': 'application/json' }
  });
  
  if (!resp.ok) {
    console.warn(`[TGA_SYNC] Failed to fetch ${componentType}: ${resp.status}`);
    return [];
  }
  
  const data = await resp.json();
  return data.value || [];
}

/**
 * Fetch organization details from TGA REST API
 */
async function fetchOrgDetails(rtoId: string): Promise<any> {
  const url = `https://training.gov.au/api/organisation/${rtoId}?api-version=1.0&include=all`;
  
  console.log(`[TGA_SYNC] Fetching org details from: ${url}`);
  
  const resp = await fetch(url, {
    headers: { 'User-Agent': 'Unicorn/2.0', 'Accept': 'application/json' }
  });
  
  if (!resp.ok) {
    throw new Error(`Failed to fetch org details: ${resp.status}`);
  }
  
  return resp.json();
}

serve(async (req) => {
  if (req.method === 'OPTIONS') {
    return new Response(null, { headers: corsHeaders });
  }

  try {
    const { tenantId, rtoId } = await req.json();
    
    if (!tenantId || !rtoId) {
      throw new Error('Missing tenantId or rtoId');
    }

    console.log(`🔄 [TGA_SYNC] Starting sync for RTO ${rtoId}, tenant ${tenantId}`);

    // Create sync job record
    const { data: job, error: jobError } = await supabaseAdmin
      .from('tga_rest_sync_jobs')
      .insert({
        tenant_id: tenantId,
        rto_id: rtoId,
        status: 'processing'
      })
      .select()
      .single();
    
    if (jobError) {
      console.warn('[TGA_SYNC] Failed to create job:', jobError);
    }

    // 1. Fetch organization details
    const orgData = await fetchOrgDetails(rtoId);
    
    // Extract current legal name
    const currentLegalName = orgData.legalNames?.find((ln: any) => !ln.endDate);
    
    console.log(`[TGA_SYNC] Got org data: ${currentLegalName?.name || 'Unknown'}`);

    // 2. Store snapshot
    const { error: snapError } = await supabaseAdmin
      .from('tga_rto_snapshots')
      .insert({
        tenant_id: tenantId,
        rto_id: rtoId,
        source_url: `https://training.gov.au/api/organisation/${rtoId}`,
        payload: orgData
      });
    
    if (snapError) console.warn('[TGA_SYNC] Snapshot error:', snapError);

    // 3. CRITICAL: Fetch ALL scope types separately using the /scope endpoint
    const scopeTypes = [
      { apiType: 'qualification', dbType: 'qualification' },
      { apiType: 'unit', dbType: 'unit' },
      { apiType: 'skillSet', dbType: 'skillset' },
      { apiType: 'accreditedCourse', dbType: 'accreditedCourse' }
    ];

    const scopeCounts: Record<string, number> = {};

    for (const { apiType, dbType } of scopeTypes) {
      console.log(`📦 [TGA_SYNC] Fetching ${apiType}...`);
      const items = await fetchScope(rtoId, apiType);
      scopeCounts[dbType] = items.length;
      
      if (items.length > 0) {
        const { data: persistResult, error } = await supabaseAdmin.rpc('persist_tga_scope_items', {
          p_tenant_id: tenantId,
          p_scope_type: dbType,
          p_scope_items: items
        });
        
        if (error) {
          console.warn(`[TGA_SYNC] Failed to persist ${apiType}:`, error);
        } else {
          console.log(`✅ [TGA_SYNC] Persisted ${items.length} ${apiType}(s)`);
        }
      } else {
        console.log(`⚠️ [TGA_SYNC] No ${apiType} items returned by TGA`);
      }
    }

    // 4. Update tenant TGA status
    const { error: tenantError } = await supabaseAdmin
      .from('tenants')
      .update({
        rto_id: rtoId,
        tga_connected_at: new Date().toISOString(),
        tga_last_synced_at: new Date().toISOString(),
        tga_status: 'connected',
        tga_legal_name: currentLegalName?.name || null,
        tga_snapshot: orgData
      })
      .eq('id', tenantId);

    if (tenantError) {
      console.warn('[TGA_SYNC] Failed to update tenant:', tenantError);
    }

    // 5. Update sync job status
    if (job) {
      await supabaseAdmin
        .from('tga_rest_sync_jobs')
        .update({
          status: 'done',
          scope_counts: scopeCounts,
          updated_at: new Date().toISOString()
        })
        .eq('id', job.id);
    }

    console.log(`✅ [TGA_SYNC] Sync complete for RTO ${rtoId}`);

    return new Response(
      JSON.stringify({
        success: true,
        rto_id: rtoId,
        legal_name: currentLegalName?.name || null,
        scope_counts: scopeCounts,
        total_scope_items: Object.values(scopeCounts).reduce((a, b) => a + b, 0)
      }),
      { headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
    );
  } catch (error: unknown) {
    const errorMessage = error instanceof Error ? error.message : 'Unknown error';
    console.error('[TGA_SYNC] Error:', errorMessage);
    return new Response(
      JSON.stringify({ success: false, error: errorMessage }),
      { status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
    );
  }
});
