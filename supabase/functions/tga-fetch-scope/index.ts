import { serve } from "https://deno.land/std@0.224.0/http/server.ts";

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
};

const DEFAULT_PAGE_SIZE = 500;
const MAX_PAGE_SIZE = 1000;

serve(async (req) => {
  if (req.method === 'OPTIONS') {
    return new Response(null, { headers: corsHeaders });
  }

  try {
    const { 
      rto_id, 
      component_type = 'qualification', 
      offset = 0, 
      page_size = DEFAULT_PAGE_SIZE,
      fetch_all = false  // If true, paginate through all results
    } = await req.json();
    
    if (!rto_id) {
      return new Response(
        JSON.stringify({ error: 'rto_id is required' }),
        { status: 400, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }

    // Validate component type
    const validTypes = ['qualification', 'unit', 'skillSet', 'accreditedCourse'];
    if (!validTypes.includes(component_type)) {
      return new Response(
        JSON.stringify({ 
          error: `Invalid component_type. Must be one of: ${validTypes.join(', ')}` 
        }),
        { status: 400, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }

    // Clamp page size
    const effectivePageSize = Math.min(Math.max(1, page_size), MAX_PAGE_SIZE);
    
    // Build component type filter
    // For units, TGA uses "unit|accreditedUnit" to get both
    const componentFilter = component_type === 'unit' 
      ? 'unit|accreditedUnit' 
      : component_type;
    
    // Sort by code for consistent ordering
    const sortBy = 'code';
    
    // Delivery filter - skillSets don't have delivery
    const delivery = component_type === 'skillSet' ? 'false' : 'true';
    
    // Build the REST API URL - NO DateNullSearch filter (per requirements)
    const buildUrl = (currentOffset: number) => {
      return `https://training.gov.au/api/organisation/${rto_id}/scope?api-version=1.0&offset=${currentOffset}&pageSize=${effectivePageSize}&delivery=${delivery}&filters=componentType==${componentFilter}&sorts=${sortBy}`;
    };

    console.log(`[TGA_SCOPE] Fetching ${component_type} for RTO ${rto_id}`);
    
    if (fetch_all) {
      // Paginate through all results
      const allItems: any[] = [];
      let currentOffset = 0;
      let hasMore = true;
      let totalCount = 0;
      const urlsUsed: string[] = [];
      
      while (hasMore) {
        const apiUrl = buildUrl(currentOffset);
        urlsUsed.push(apiUrl);
        console.log(`[TGA_SCOPE] URL: ${apiUrl}`);
        
        const response = await fetch(apiUrl, {
          headers: {
            'User-Agent': 'Unicorn/2.0',
            'Accept': 'application/json'
          }
        });

        if (!response.ok) {
          throw new Error(`TGA API returned ${response.status} for ${component_type}`);
        }

        const tgaData = await response.json();
        const items = tgaData.value || [];
        
        console.log(`[TGA_SCOPE] Page at offset ${currentOffset}: ${items.length} items`);
        
        allItems.push(...items);
        totalCount = tgaData.count || allItems.length;
        
        // If we got fewer items than page size, we're done
        if (items.length < effectivePageSize) {
          hasMore = false;
        } else {
          currentOffset += effectivePageSize;
          // Safety check: don't paginate forever
          if (currentOffset > 50000) {
            console.warn(`[TGA_SCOPE] Safety limit reached at offset ${currentOffset}`);
            hasMore = false;
          }
        }
      }
      
      console.log(`[TGA_SCOPE] Total fetched: ${allItems.length} ${component_type}(s) across ${urlsUsed.length} pages`);
      
      return new Response(
        JSON.stringify({
          success: true,
          rto_id,
          component_type,
          value: allItems,
          count: allItems.length,
          total_count: totalCount,
          pages_fetched: urlsUsed.length,
          urls_used: urlsUsed,
        }),
        { headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    } else {
      // Single page fetch
      const apiUrl = buildUrl(offset);
      console.log(`[TGA_SCOPE] URL: ${apiUrl}`);

      const response = await fetch(apiUrl, {
        headers: {
          'User-Agent': 'Unicorn/2.0',
          'Accept': 'application/json'
        }
      });

      if (!response.ok) {
        throw new Error(`TGA API returned ${response.status}`);
      }

      const tgaData = await response.json();
      const items = tgaData.value || [];
      
      console.log(`[TGA_SCOPE] Fetched ${items.length} ${component_type}(s)`);

      return new Response(
        JSON.stringify({
          success: true,
          rto_id,
          component_type,
          value: items,
          count: items.length,
          total_count: tgaData.count || items.length,
          offset,
          pageSize: effectivePageSize,
          hasMore: items.length === effectivePageSize,
          url_used: apiUrl,
        }),
        { headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }
  } catch (error) {
    console.error('[TGA_SCOPE] Error:', error);
    return new Response(
      JSON.stringify({ 
        success: false, 
        error: error instanceof Error ? error.message : 'Unknown error' 
      }),
      { status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
    );
  }
});
