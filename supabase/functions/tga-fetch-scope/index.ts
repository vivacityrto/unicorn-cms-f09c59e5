import { serve } from "https://deno.land/std@0.224.0/http/server.ts";

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
};

/**
 * TGA Scope Fetcher - Fetches scope items from TGA REST API
 * 
 * CRITICAL: Different component types need different API parameters
 * - qualification: delivery=true, componentType==qualification
 * - unit: delivery=true, componentType==unit|accreditedUnit
 * - skillSet: delivery=false, componentType==skillSet
 * - accreditedCourse: delivery=true, componentType==accreditedCourse
 */

serve(async (req) => {
  if (req.method === 'OPTIONS') {
    return new Response(null, { headers: corsHeaders });
  }

  try {
    const { rto_id, component_type = 'qualification' } = await req.json();
    
    if (!rto_id) {
      return new Response(
        JSON.stringify({ error: 'rto_id is required' }),
        { status: 400, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }

    // CRITICAL: Different settings per component type
    const delivery = component_type === 'skillSet' ? 'false' : 'true';
    const today = new Date().toISOString().split('T')[0];
    
    // Units use special filter to include accredited units
    const componentFilter = component_type === 'unit' 
      ? 'unit|accreditedUnit' 
      : component_type;
    const sortBy = component_type === 'unit' ? 'isImplicit' : 'code';
    
    // THE KEY API ENDPOINT FOR SCOPE DATA
    const apiUrl = `https://training.gov.au/api/organisation/${rto_id}/scope?api-version=1.0&offset=0&pageSize=1000&delivery=${delivery}&filters=componentType==${componentFilter},DateNullSearch==${today}&sorts=${sortBy}`;

    console.log(`[TGA_SCOPE] Fetching ${component_type} for RTO ${rto_id}`);
    console.log(`[TGA_SCOPE] URL: ${apiUrl}`);

    const response = await fetch(apiUrl, {
      headers: {
        'User-Agent': 'Unicorn/2.0',
        'Accept': 'application/json'
      }
    });

    if (!response.ok) {
      const errorText = await response.text();
      console.error(`[TGA_SCOPE] API Error: ${response.status} - ${errorText}`);
      throw new Error(`TGA API returned ${response.status}`);
    }

    const tgaData = await response.json();
    const count = tgaData.count ?? tgaData.value?.length ?? 0;
    
    console.log(`[TGA_SCOPE] Fetched ${count} ${component_type}(s) for RTO ${rto_id}`);

    return new Response(
      JSON.stringify({
        success: true,
        component_type,
        count,
        items: tgaData.value || [],
        raw: tgaData
      }),
      { headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
    );
  } catch (error: unknown) {
    const errorMessage = error instanceof Error ? error.message : 'Unknown error';
    console.error('[TGA_SCOPE] Error:', errorMessage);
    return new Response(
      JSON.stringify({ success: false, error: errorMessage }),
      { status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
    );
  }
});
