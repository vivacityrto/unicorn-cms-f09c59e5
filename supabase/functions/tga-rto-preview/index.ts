import { serve } from "https://deno.land/std@0.224.0/http/server.ts";

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
};

// Compute SHA256 hash of a string using Web Crypto API
async function computeSha256(text: string): Promise<string> {
  const encoder = new TextEncoder();
  const data = encoder.encode(text);
  const hashBuffer = await crypto.subtle.digest('SHA-256', data);
  const hashArray = Array.from(new Uint8Array(hashBuffer));
  return hashArray.map(b => b.toString(16).padStart(2, '0')).join('');
}

serve(async (req) => {
  if (req.method === 'OPTIONS') {
    return new Response('ok', { headers: corsHeaders });
  }

  try {
    const { rtoId } = await req.json();
    
    if (!rtoId || !/^\d{4,6}$/.test(rtoId)) {
      return new Response(
        JSON.stringify({ 
          success: false, 
          error: 'Invalid RTO ID format. Must be 4-6 digits.' 
        }),
        { status: 400, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
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
        return new Response(
          JSON.stringify({ 
            success: false, 
            error: `RTO ${rtoId} not found on training.gov.au`,
            source_url: apiUrl,
            http_status: 404
          }),
          { status: 404, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
        );
      }
      throw new Error(`TGA API error: ${response.status}`);
    }

    const rawText = await response.text();
    const rawData = JSON.parse(rawText);
    
    // Compute SHA256 of raw response for change detection
    const rawSha256 = await computeSha256(rawText);
    
    // Extract current values (no endDate means current)
    const currentLegalName = rawData.legalNames?.find((ln: any) => !ln.endDate);
    const currentTradingNames = rawData.tradingNames?.filter((tn: any) => !tn.endDate) || [];
    
    // Extract all trading name history
    const tradingNamesHistory = rawData.tradingNames?.map((tn: any) => ({
      name: tn.name,
      startDate: tn.startDate || null,
      endDate: tn.endDate || null,
    })) || [];

    // Extract ABN from the legal name record
    const abn = currentLegalName?.abns?.[0]?.abn || currentLegalName?.abn || null;
    const acn = currentLegalName?.acn || rawData.acn || null;
    
    console.log(`[TGA_PREVIEW] Found RTO: ${currentLegalName?.name || 'Unknown'}`);
    console.log(`[TGA_PREVIEW] SHA256: ${rawSha256.substring(0, 16)}...`);

    return new Response(
      JSON.stringify({
        success: true,
        source_url: apiUrl,
        raw_sha256: rawSha256,
        data: {
          code: rawData.code || rtoId,
          legal_name: currentLegalName?.name || null,
          trading_name: currentTradingNames[0]?.name || null,
          business_names: currentTradingNames.map((tn: any) => tn.name),
          trading_names_history: tradingNamesHistory,
          abn: abn,
          acn: acn,
          status: rawData.rtoStatusLabel || rawData.status || null,
          organisation_type: rawData.organisationType?.label || rawData.organisationType || null,
          web_address: rawData.webAddress || null,
          initial_registration_date: rawData.registrationDate || null,
          registration_start_date: rawData.registrationPeriod?.startDate || null,
          registration_end_date: rawData.registrationPeriod?.endDate || rawData.registrationExpiryDate || null,
          contacts_count: rawData.contacts?.length || 0,
          addresses_count: rawData.addresses?.length || 0,
        },
        raw_snapshot: rawData
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
