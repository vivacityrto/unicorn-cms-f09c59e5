import { serve } from "https://deno.land/std@0.224.0/http/server.ts";

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
};

serve(async (req) => {
  if (req.method === 'OPTIONS') {
    return new Response('ok', { headers: corsHeaders });
  }

  try {
    const { rtoId } = await req.json();
    
    if (!rtoId || !/^\d{4,6}$/.test(rtoId)) {
      throw new Error('Invalid RTO ID format. Must be 4-6 digits.');
    }

    console.log(`[TGA_PREVIEW] Fetching preview for RTO ${rtoId}`);

    // Fetch from TGA REST API
    const apiUrl = `https://training.gov.au/api/organisation/${rtoId}?api-version=1.0&include=all`;
    const response = await fetch(apiUrl, {
      headers: {
        'User-Agent': 'Unicorn/2.0',
        'Accept': 'application/json'
      }
    });

    if (!response.ok) {
      if (response.status === 404) {
        throw new Error(`RTO ${rtoId} not found on training.gov.au`);
      }
      throw new Error(`TGA API error: ${response.status}`);
    }

    const rawData = await response.json();
    
    // Extract current values (no endDate means current)
    const currentLegalName = rawData.legalNames?.find((ln: any) => !ln.endDate);
    const currentTradingNames = rawData.tradingNames?.filter((tn: any) => !tn.endDate) || [];
    
    console.log(`[TGA_PREVIEW] Found RTO: ${currentLegalName?.name || 'Unknown'}`);

    return new Response(
      JSON.stringify({
        success: true,
        data: {
          code: rawData.code || rtoId,
          legal_name: currentLegalName?.name || null,
          business_names: currentTradingNames.map((tn: any) => tn.name),
          abn: currentLegalName?.abns?.[0] || null,
          status: rawData.rtoStatusLabel || null,
          registration_expiry: rawData.registrationExpiryDate || null,
          raw_snapshot: rawData
        }
      }),
      { headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
    );
  } catch (error: unknown) {
    const errorMessage = error instanceof Error ? error.message : 'Unknown error';
    console.error('[TGA_PREVIEW] Error:', errorMessage);
    return new Response(
      JSON.stringify({ success: false, error: errorMessage }),
      { status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
    );
  }
});
