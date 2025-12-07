import { corsHeaders } from '../_shared/cors.ts';

const SANDBOX_URL = 'https://ws.sandbox.training.gov.au/Deewr.Tga.Webservices/OrganisationServiceV13.svc/Organisation';

// Note: Sandbox credentials are typically provided by training.gov.au
// For public sandbox, these may not be required or use default test credentials
const SANDBOX_USERNAME = Deno.env.get('TGA_SANDBOX_USERNAME') || '';
const SANDBOX_PASSWORD = Deno.env.get('TGA_SANDBOX_PASSWORD') || '';

Deno.serve(async (req) => {
  // Handle CORS preflight
  if (req.method === 'OPTIONS') {
    return new Response(null, { headers: corsHeaders });
  }

  try {
    const { query } = await req.json();

    if (!query || query.trim().length < 2) {
      return new Response(
        JSON.stringify({ 
          error: 'Search query must be at least 2 characters',
          organisations: []
        }),
        { 
          status: 400, 
          headers: { ...corsHeaders, 'Content-Type': 'application/json' }
        }
      );
    }

    // Build SOAP envelope with WS-Security if credentials are available
    const securityHeader = SANDBOX_USERNAME && SANDBOX_PASSWORD ? `
  <soap:Header>
    <wsse:Security xmlns:wsse="http://docs.oasis-open.org/wss/2004/01/oasis-200401-wss-wssecurity-secext-1.0.xsd">
      <wsse:UsernameToken>
        <wsse:Username>${escapeXml(SANDBOX_USERNAME)}</wsse:Username>
        <wsse:Password Type="http://docs.oasis-open.org/wss/2004/01/oasis-200401-wss-username-token-profile-1.0#PasswordText">${escapeXml(SANDBOX_PASSWORD)}</wsse:Password>
      </wsse:UsernameToken>
    </wsse:Security>
  </soap:Header>` : '';

    const soapEnvelope = `<?xml version="1.0" encoding="utf-8"?>
<soap:Envelope xmlns:soap="http://schemas.xmlsoap.org/soap/envelope/" 
               xmlns:tga="http://www.tga.deewr.gov.au/"
               xmlns:wsse="http://docs.oasis-open.org/wss/2004/01/oasis-200401-wss-wssecurity-secext-1.0.xsd">${securityHeader}
  <soap:Body>
    <tga:SearchOrganisation>
      <tga:searchText>${escapeXml(query)}</tga:searchText>
      <tga:includeInactive>false</tga:includeInactive>
    </tga:SearchOrganisation>
  </soap:Body>
</soap:Envelope>`;

    console.log('Calling Training.gov.au SOAP service...');
    
    // Call SOAP service
    const response = await fetch(`${SANDBOX_URL}`, {
      method: 'POST',
      headers: {
        'Content-Type': 'text/xml; charset=utf-8',
        'SOAPAction': 'http://www.tga.deewr.gov.au/IOrganisationService/SearchOrganisation'
      },
      body: soapEnvelope
    });

    if (!response.ok) {
      const errorText = await response.text();
      console.error('SOAP Error:', errorText);
      
      // Check if it's a security error
      if (errorText.includes('InvalidSecurity')) {
        return new Response(
          JSON.stringify({ 
            error: 'Authentication required. Please configure TGA_SANDBOX_USERNAME and TGA_SANDBOX_PASSWORD.',
            organisations: [],
            hint: 'Register at training.gov.au for sandbox credentials'
          }),
          { 
            status: 401, 
            headers: { ...corsHeaders, 'Content-Type': 'application/json' }
          }
        );
      }
      
      throw new Error(`SOAP service error: ${response.status}`);
    }

    const xmlText = await response.text();
    console.log('SOAP Response received');

    // Parse XML response to extract organisations
    const organisations = parseOrganisationsFromXml(xmlText);

    return new Response(
      JSON.stringify({ 
        success: true,
        organisations,
        count: organisations.length
      }),
      { 
        headers: { ...corsHeaders, 'Content-Type': 'application/json' }
      }
    );

  } catch (error) {
    console.error('Error in search-organisations:', error);
    const errorMessage = error instanceof Error ? error.message : 'Failed to search organisations';
    return new Response(
      JSON.stringify({ 
        error: errorMessage,
        organisations: []
      }),
      { 
        status: 500, 
        headers: { ...corsHeaders, 'Content-Type': 'application/json' }
      }
    );
  }
});

function escapeXml(unsafe: string): string {
  return unsafe
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&apos;');
}

function parseOrganisationsFromXml(xml: string): any[] {
  const organisations: any[] = [];
  
  try {
    // Extract organisation elements using regex (simple parsing for MVP)
    // In production, consider using a proper XML parser
    
    // Match organisation code
    const codeMatches = xml.matchAll(/<a:Code[^>]*>([^<]+)<\/a:Code>/g);
    const nameMatches = xml.matchAll(/<a:Name[^>]*>([^<]+)<\/a:Name>/g);
    const tradingMatches = xml.matchAll(/<a:TradingName[^>]*>([^<]+)<\/a:TradingName>/g);
    const abnMatches = xml.matchAll(/<a:ABN[^>]*>([^<]+)<\/a:ABN>/g);
    
    const codes = Array.from(codeMatches).map(m => m[1]);
    const names = Array.from(nameMatches).map(m => m[1]);
    const tradingNames = Array.from(tradingMatches).map(m => m[1]);
    const abns = Array.from(abnMatches).map(m => m[1]);

    // Combine the data
    const maxLength = Math.max(codes.length, names.length);
    
    for (let i = 0; i < maxLength; i++) {
      if (codes[i] && names[i]) {
        organisations.push({
          code: codes[i],
          name: names[i],
          trading_name: tradingNames[i] || null,
          abn: abns[i] || null,
          address: extractAddress(xml, i),
          scope: extractScope(xml, i)
        });
      }
    }
  } catch (error) {
    console.error('Error parsing XML:', error);
  }

  return organisations.slice(0, 10); // Limit to 10 results
}

function extractAddress(xml: string, index: number): any {
  // Simple address extraction - can be enhanced
  const streetMatch = xml.match(/<a:StreetAddress[^>]*>([^<]+)<\/a:StreetAddress>/);
  const suburbMatch = xml.match(/<a:Suburb[^>]*>([^<]+)<\/a:Suburb>/);
  const stateMatch = xml.match(/<a:State[^>]*>([^<]+)<\/a:State>/);
  const postcodeMatch = xml.match(/<a:Postcode[^>]*>([^<]+)<\/a:Postcode>/);

  if (streetMatch || suburbMatch || stateMatch || postcodeMatch) {
    return {
      street: streetMatch?.[1] || null,
      suburb: suburbMatch?.[1] || null,
      state: stateMatch?.[1] || null,
      postcode: postcodeMatch?.[1] || null
    };
  }

  return null;
}

function extractScope(xml: string, index: number): string | null {
  // Simple scope extraction - can be enhanced
  const scopeMatch = xml.match(/<a:Scope[^>]*>([^<]+)<\/a:Scope>/);
  return scopeMatch?.[1] || null;
}
