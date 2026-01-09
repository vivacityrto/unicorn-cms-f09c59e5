import { serve } from "https://deno.land/std@0.224.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2.49.4";

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
};

const supabaseUrl = Deno.env.get("SUPABASE_URL")!;
const supabaseServiceKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
const supabaseAdmin = createClient(supabaseUrl, supabaseServiceKey);

const CACHE_TTL_DAYS = 7;

serve(async (req) => {
  if (req.method === 'OPTIONS') {
    return new Response(null, { headers: corsHeaders });
  }

  try {
    const { tenantId, productCode } = await req.json();
    
    if (!tenantId || !productCode) {
      return new Response(
        JSON.stringify({ success: false, error: 'Missing tenantId or productCode' }),
        { status: 400, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }

    const tenantIdNum = typeof tenantId === 'string' ? parseInt(tenantId, 10) : tenantId;
    
    // Check cache first
    const { data: cached } = await supabaseAdmin
      .from('tga_cache')
      .select('*')
      .eq('tenant_id', tenantIdNum)
      .eq('product_code', productCode)
      .single();
    
    if (cached) {
      const fetchedAt = new Date(cached.fetched_at);
      const ageMs = Date.now() - fetchedAt.getTime();
      const ageDays = ageMs / (1000 * 60 * 60 * 24);
      
      if (ageDays < CACHE_TTL_DAYS) {
        return new Response(
          JSON.stringify({ success: true, cached: true, data: cached }),
          { headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
        );
      }
    }

    // Fetch from TGA
    const url = `https://training.gov.au/api/trainingcomponent/${productCode}?api-version=1.0`;
    const response = await fetch(url, {
      headers: { 'User-Agent': 'Unicorn/2.0', 'Accept': 'application/json' }
    });

    if (!response.ok) {
      return new Response(
        JSON.stringify({ success: false, error: `TGA returned ${response.status}` }),
        { status: response.status === 404 ? 404 : 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }

    const data = await response.json();
    const now = new Date().toISOString();
    
    const record = {
      tenant_id: tenantIdNum,
      product_code: productCode,
      product_title: data.title || null,
      product_type: data.componentType || null,
      release_status: data.releaseStatus || null,
      release_date: data.releaseDate || null,
      superseded_date: data.supersededDate || null,
      superseded_by: data.supersededBy?.code || null,
      fetched_at: now,
      tga_metadata: data,
    };

    await supabaseAdmin.from('tga_cache').upsert(record, { onConflict: 'tenant_id,product_code' });

    return new Response(
      JSON.stringify({ success: true, cached: false, data: record }),
      { headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
    );
  } catch (error) {
    return new Response(
      JSON.stringify({ success: false, error: error instanceof Error ? error.message : 'Unknown error' }),
      { status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
    );
  }
});
