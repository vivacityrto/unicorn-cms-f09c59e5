import { corsHeaders } from '../_shared/cors.ts';

// TGA SOAP Endpoints - correct format without /Organisation suffix
const TGA_WS_BASE = Deno.env.get('TGA_WS_BASE') || 'https://ws.training.gov.au';
const TGA_ENDPOINT = Deno.env.get('TGA_ORG_ENDPOINT') || 
  `${TGA_WS_BASE}/Deewr.Tga.Webservices/OrganisationServiceV13.svc`;

// Production credentials
const TGA_USERNAME = Deno.env.get('TGA_WS_USERNAME') || '';
const TGA_PASSWORD = Deno.env.get('TGA_WS_PASSWORD') || '';

// Retry configuration
const MAX_RETRIES = 2;
const RETRY_DELAYS = [500, 1500];
const REQUEST_TIMEOUT_MS = 20000;

// RTO code validation regex (typically numeric, 4-5 digits)
const RTO_CODE_PATTERN = /^\d{4,5}$/;

function generateCorrelationId(): string {
  return `tga-${Date.now()}-${Math.random().toString(36).substring(2, 8)}`;
}

function escapeXml(unsafe: string): string {
  return unsafe
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&apos;');
}

// Parse SOAP fault from response
function parseSoapFault(xml: string): { faultcode: string | null; faultstring: string | null } {
  const faultcodeMatch = xml.match(/<faultcode[^>]*>([^<]+)<\/faultcode>/i);
  const faultstringMatch = xml.match(/<faultstring[^>]*>([^<]+)<\/faultstring>/i);
  return {
    faultcode: faultcodeMatch?.[1] || null,
    faultstring: faultstringMatch?.[1] || null
  };
}

Deno.serve(async (req) => {
  const correlationId = generateCorrelationId();
  
  // Handle CORS preflight
  if (req.method === 'OPTIONS') {
    return new Response(null, { headers: corsHeaders });
  }

  try {
    const { code } = await req.json();

    // Input validation
    if (!code || typeof code !== 'string') {
      return new Response(
        JSON.stringify({ 
          error: 'Organisation code is required',
          organisation: null,
          correlation_id: correlationId
        }),
        { 
          status: 400, 
          headers: { ...corsHeaders, 'Content-Type': 'application/json' }
        }
      );
    }

    const sanitizedCode = code.trim();

    // Validate RTO code format
    if (!RTO_CODE_PATTERN.test(sanitizedCode)) {
      return new Response(
        JSON.stringify({ 
          error: 'Invalid RTO code format. Must be 4-5 digits.',
          organisation: null,
          correlation_id: correlationId
        }),
        { 
          status: 400, 
          headers: { ...corsHeaders, 'Content-Type': 'application/json' }
        }
      );
    }

    // Check credentials
    if (!TGA_USERNAME || !TGA_PASSWORD) {
      return new Response(
        JSON.stringify({ 
          error: 'TGA credentials not configured. Set TGA_WS_USERNAME and TGA_WS_PASSWORD.',
          organisation: null,
          correlation_id: correlationId
        }),
        { 
          status: 500, 
          headers: { ...corsHeaders, 'Content-Type': 'application/json' }
        }
      );
    }

    // Build SOAP envelope with WS-Security
    const now = new Date();
    const expires = new Date(now.getTime() + 5 * 60 * 1000);
    
    const soapEnvelope = `<?xml version="1.0" encoding="utf-8"?>
<soap:Envelope xmlns:soap="http://schemas.xmlsoap.org/soap/envelope/" 
               xmlns:tga="http://www.tga.deewr.gov.au/">
  <soap:Header>
    <wsse:Security xmlns:wsse="http://docs.oasis-open.org/wss/2004/01/oasis-200401-wss-wssecurity-secext-1.0.xsd"
                   xmlns:wsu="http://docs.oasis-open.org/wss/2004/01/oasis-200401-wss-wssecurity-utility-1.0.xsd">
      <wsu:Timestamp wsu:Id="Timestamp-${Date.now()}">
        <wsu:Created>${now.toISOString()}</wsu:Created>
        <wsu:Expires>${expires.toISOString()}</wsu:Expires>
      </wsu:Timestamp>
      <wsse:UsernameToken wsu:Id="UsernameToken-${Date.now()}">
        <wsse:Username>${escapeXml(TGA_USERNAME)}</wsse:Username>
        <wsse:Password Type="http://docs.oasis-open.org/wss/2004/01/oasis-200401-wss-username-token-profile-1.0#PasswordText">${escapeXml(TGA_PASSWORD)}</wsse:Password>
      </wsse:UsernameToken>
    </wsse:Security>
  </soap:Header>
  <soap:Body>
    <tga:GetOrganisation>
      <tga:code>${escapeXml(sanitizedCode)}</tga:code>
    </tga:GetOrganisation>
  </soap:Body>
</soap:Envelope>`;

    console.log(`[TGA] [${correlationId}] Fetching org details for RTO ${sanitizedCode} from ${TGA_ENDPOINT}`);
    
    let lastError: Error | null = null;
    let responseText = '';
    let response: Response | null = null;
    
    // Retry loop
    for (let attempt = 0; attempt <= MAX_RETRIES; attempt++) {
      if (attempt > 0) {
        const delay = RETRY_DELAYS[attempt - 1] || 1000;
        console.log(`[TGA] [${correlationId}] Retry ${attempt}/${MAX_RETRIES} after ${delay}ms`);
        await new Promise(resolve => setTimeout(resolve, delay));
      }
      
      try {
        const controller = new AbortController();
        const timeoutId = setTimeout(() => controller.abort(), REQUEST_TIMEOUT_MS);
        
        // SOAPAction format for OrganisationServiceV13
        response = await fetch(TGA_ENDPOINT, {
          method: 'POST',
          headers: {
            'Content-Type': 'text/xml; charset=utf-8',
            'Accept': 'text/xml',
            'SOAPAction': 'http://www.tga.deewr.gov.au/IOrganisationServiceV13/GetOrganisation',
            'User-Agent': 'Unicorn2.0/1.0'
          },
          body: soapEnvelope,
          signal: controller.signal
        });
        
        clearTimeout(timeoutId);
        responseText = await response.text();
        
        if (response.ok) {
          break; // Success, exit retry loop
        }
        
        // Check if retryable
        if (response.status >= 500 && attempt < MAX_RETRIES) {
          lastError = new Error(`HTTP ${response.status}`);
          continue;
        }
        
        break; // Non-retryable error, exit loop
        
      } catch (error) {
        console.error(`[TGA] [${correlationId}] Request error:`, error);
        
        if (error instanceof Error && error.name === 'AbortError') {
          lastError = new Error('Request timed out');
        } else {
          lastError = error instanceof Error ? error : new Error(String(error));
        }
        
        if (attempt < MAX_RETRIES) {
          continue;
        }
      }
    }

    if (!response) {
      return new Response(
        JSON.stringify({ 
          error: lastError?.message || 'Request failed after retries',
          organisation: null,
          correlation_id: correlationId
        }),
        { 
          status: 500, 
          headers: { ...corsHeaders, 'Content-Type': 'application/json' }
        }
      );
    }

    if (!response.ok) {
      const fault = parseSoapFault(responseText);
      console.error(`[TGA] [${correlationId}] SOAP Error ${response.status}:`, responseText.substring(0, 500));
      
      // Check for authentication errors
      if (fault.faultstring?.includes('Unknown user') || 
          fault.faultstring?.includes('incorrect password') ||
          responseText.includes('InvalidSecurity')) {
        return new Response(
          JSON.stringify({ 
            error: 'TGA authentication failed. Check TGA_WS_USERNAME and TGA_WS_PASSWORD.',
            organisation: null,
            correlation_id: correlationId,
            soap_fault: fault
          }),
          { 
            status: 401, 
            headers: { ...corsHeaders, 'Content-Type': 'application/json' }
          }
        );
      }
      
      // Check for contract mismatch
      if (fault.faultcode?.includes('ActionNotSupported') || 
          fault.faultstring?.includes('ContractFilter')) {
        return new Response(
          JSON.stringify({ 
            error: `SOAP action mismatch. The endpoint may require a different action. (${fault.faultcode})`,
            organisation: null,
            correlation_id: correlationId,
            soap_fault: fault
          }),
          { 
            status: 500, 
            headers: { ...corsHeaders, 'Content-Type': 'application/json' }
          }
        );
      }

      // Check for not found
      if (response.status === 404 || responseText.includes('not found')) {
        return new Response(
          JSON.stringify({ 
            error: `Organisation with RTO code ${sanitizedCode} not found`,
            organisation: null,
            correlation_id: correlationId
          }),
          { 
            status: 404, 
            headers: { ...corsHeaders, 'Content-Type': 'application/json' }
          }
        );
      }
      
      return new Response(
        JSON.stringify({ 
          error: fault.faultstring || `SOAP service error: ${response.status}`,
          organisation: null,
          correlation_id: correlationId,
          soap_fault: fault
        }),
        { 
          status: 500, 
          headers: { ...corsHeaders, 'Content-Type': 'application/json' }
        }
      );
    }

    console.log(`[TGA] [${correlationId}] Organisation details received (${responseText.length} bytes)`);

    // Parse XML response
    const organisation = parseOrganisationFromXml(responseText);

    if (!organisation) {
      return new Response(
        JSON.stringify({ 
          error: `Organisation with RTO code ${sanitizedCode} not found or could not be parsed`,
          organisation: null,
          correlation_id: correlationId
        }),
        { 
          status: 404, 
          headers: { ...corsHeaders, 'Content-Type': 'application/json' }
        }
      );
    }

    return new Response(
      JSON.stringify({ 
        success: true,
        organisation,
        correlation_id: correlationId
      }),
      { 
        headers: { ...corsHeaders, 'Content-Type': 'application/json' }
      }
    );

  } catch (error) {
    console.error(`[TGA] [${correlationId}] Error in get-organisation-details:`, error);
    const errorMessage = error instanceof Error ? error.message : 'Failed to fetch organisation details';
    return new Response(
      JSON.stringify({ 
        error: errorMessage,
        organisation: null,
        correlation_id: correlationId
      }),
      { 
        status: 500, 
        headers: { ...corsHeaders, 'Content-Type': 'application/json' }
      }
    );
  }
});

function parseOrganisationFromXml(xml: string): Record<string, unknown> | null {
  try {
    // Extract organisation details using regex
    const codeMatch = xml.match(/<a:Code[^>]*>([^<]+)<\/a:Code>/);
    const nameMatch = xml.match(/<a:Name[^>]*>([^<]+)<\/a:Name>/);
    const tradingMatch = xml.match(/<a:TradingName[^>]*>([^<]+)<\/a:TradingName>/);
    const legalMatch = xml.match(/<a:LegalName[^>]*>([^<]+)<\/a:LegalName>/);
    const abnMatch = xml.match(/<a:ABN[^>]*>([^<]+)<\/a:ABN>/);
    const statusMatch = xml.match(/<a:Status[^>]*>([^<]+)<\/a:Status>/);
    const typeMatch = xml.match(/<a:OrganisationType[^>]*>([^<]+)<\/a:OrganisationType>/);
    
    // Extract address details
    const streetMatch = xml.match(/<a:StreetAddress[^>]*>([^<]+)<\/a:StreetAddress>/);
    const suburbMatch = xml.match(/<a:Suburb[^>]*>([^<]+)<\/a:Suburb>/);
    const stateMatch = xml.match(/<a:State[^>]*>([^<]+)<\/a:State>/);
    const postcodeMatch = xml.match(/<a:Postcode[^>]*>([^<]+)<\/a:Postcode>/);
    
    // Extract contact details
    const phoneMatch = xml.match(/<a:Phone[^>]*>([^<]+)<\/a:Phone>/);
    const emailMatch = xml.match(/<a:Email[^>]*>([^<]+)<\/a:Email>/);
    const websiteMatch = xml.match(/<a:Website[^>]*>([^<]+)<\/a:Website>/);
    
    // Extract scope information
    const scopeMatch = xml.match(/<a:Scope[^>]*>([^<]+)<\/a:Scope>/);
    const registrationDateMatch = xml.match(/<a:RegistrationDate[^>]*>([^<]+)<\/a:RegistrationDate>/);

    if (!codeMatch || !nameMatch) {
      return null;
    }

    return {
      code: codeMatch[1],
      name: nameMatch[1],
      trading_name: tradingMatch?.[1] || null,
      legal_name: legalMatch?.[1] || null,
      abn: abnMatch?.[1] || null,
      status: statusMatch?.[1] || 'Unknown',
      organisation_type: typeMatch?.[1] || null,
      address: {
        street: streetMatch?.[1] || null,
        suburb: suburbMatch?.[1] || null,
        state: stateMatch?.[1] || null,
        postcode: postcodeMatch?.[1] || null,
        full_address: [
          streetMatch?.[1],
          suburbMatch?.[1],
          stateMatch?.[1],
          postcodeMatch?.[1]
        ].filter(Boolean).join(', ')
      },
      contact: {
        phone: phoneMatch?.[1] || null,
        email: emailMatch?.[1] || null,
        website: websiteMatch?.[1] || null
      },
      scope: scopeMatch?.[1] || null,
      registration_date: registrationDateMatch?.[1] || null
    };
  } catch (error) {
    console.error('Error parsing organisation XML:', error);
    return null;
  }
}
