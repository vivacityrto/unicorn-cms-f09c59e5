import { corsHeaders } from '../_shared/cors.ts';

// TGA SOAP Endpoints - correct production URLs
const TGA_WS_BASE = Deno.env.get('TGA_WS_BASE') || 'https://ws.training.gov.au';
const TGA_ENDPOINT = Deno.env.get('TGA_ORG_ENDPOINT') || 
  `${TGA_WS_BASE}/Deewr.Tga.WebServices/OrganisationServiceV13.svc`;

// Production credentials
const TGA_USERNAME = Deno.env.get('TGA_WS_USERNAME') || '';
const TGA_PASSWORD = Deno.env.get('TGA_WS_PASSWORD') || '';

// Retry configuration
const MAX_RETRIES = 2;
const RETRY_DELAYS = [500, 1500];
const REQUEST_TIMEOUT_MS = 30000;

// TGA V13 namespace - CORRECT namespace per WSDL
const TGA_V13_NAMESPACE = 'http://training.gov.au/services/13/';

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
  const faultcodeMatch = xml.match(/<(?:[a-z]:)?faultcode[^>]*>([^<]+)<\/(?:[a-z]:)?faultcode>/i);
  const faultstringMatch = xml.match(/<(?:[a-z]:)?faultstring[^>]*>([^<]+)<\/(?:[a-z]:)?faultstring>/i);
  return {
    faultcode: faultcodeMatch?.[1] || null,
    faultstring: faultstringMatch?.[1] || null
  };
}

// List of SOAPAction patterns to try (ordered by likelihood)
const SOAP_ACTION_PATTERNS = [
  // Pattern 1: Interface style with I prefix (most common for WCF)
  (op: string) => `"${TGA_V13_NAMESPACE}IOrganisationService/${op}"`,
  // Pattern 2: Without quotes
  (op: string) => `${TGA_V13_NAMESPACE}IOrganisationService/${op}`,
  // Pattern 3: Service style without I prefix
  (op: string) => `"${TGA_V13_NAMESPACE}OrganisationService/${op}"`,
  // Pattern 4: Legacy namespace (fallback)
  (op: string) => `"http://www.tga.deewr.gov.au/IOrganisationServiceV13/${op}"`,
];

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

    console.log(`[TGA] [${correlationId}] Fetching org details for RTO ${sanitizedCode} from ${TGA_ENDPOINT}`);
    
    // Build SOAP envelope with WS-Security and correct V13 namespace
    const now = new Date();
    const expires = new Date(now.getTime() + 5 * 60 * 1000);
    
    const soapEnvelope = `<?xml version="1.0" encoding="utf-8"?>
<soap:Envelope xmlns:soap="http://schemas.xmlsoap.org/soap/envelope/" 
               xmlns:tns="${TGA_V13_NAMESPACE}">
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
    <tns:GetOrganisation>
      <tns:code>${escapeXml(sanitizedCode)}</tns:code>
    </tns:GetOrganisation>
  </soap:Body>
</soap:Envelope>`;

    let lastError: Error | null = null;
    let responseText = '';
    let response: Response | null = null;
    let lastFault: { faultcode: string | null; faultstring: string | null } | null = null;
    let successAction: string | null = null;
    
    // Try each SOAPAction pattern
    for (let actionIdx = 0; actionIdx < SOAP_ACTION_PATTERNS.length; actionIdx++) {
      const soapAction = SOAP_ACTION_PATTERNS[actionIdx]('GetOrganisation');
      
      console.log(`[TGA] [${correlationId}] Trying SOAP action pattern ${actionIdx + 1}: ${soapAction}`);
      
      // Retry loop for each action pattern
      for (let attempt = 0; attempt <= MAX_RETRIES; attempt++) {
        if (attempt > 0) {
          const delay = RETRY_DELAYS[attempt - 1] || 1000;
          console.log(`[TGA] [${correlationId}] Retry ${attempt}/${MAX_RETRIES} after ${delay}ms`);
          await new Promise(resolve => setTimeout(resolve, delay));
        }
        
        try {
          const controller = new AbortController();
          const timeoutId = setTimeout(() => controller.abort(), REQUEST_TIMEOUT_MS);
          
          response = await fetch(TGA_ENDPOINT, {
            method: 'POST',
            headers: {
              'Content-Type': 'text/xml; charset=utf-8',
              'Accept': 'text/xml',
              'SOAPAction': soapAction,
              'User-Agent': 'Unicorn2.0/1.0'
            },
            body: soapEnvelope,
            signal: controller.signal
          });
          
          clearTimeout(timeoutId);
          responseText = await response.text();
          
          if (response.ok) {
            successAction = soapAction;
            console.log(`[TGA] [${correlationId}] Success with action: ${soapAction}, received ${responseText.length} bytes`);
            break; // Success, exit retry loop
          }
          
          const fault = parseSoapFault(responseText);
          lastFault = fault;
          
          // Log safely (first 500 chars)
          console.error(`[TGA] [${correlationId}] SOAP Error ${response.status}:`, responseText.substring(0, 500));
          
          // If ActionNotSupported/ContractFilter, try next action pattern
          if (fault.faultcode?.includes('ActionNotSupported') || 
              fault.faultstring?.includes('ContractFilter')) {
            console.log(`[TGA] [${correlationId}] Action mismatch, trying next pattern...`);
            response = null; // Reset to try next pattern
            break; // Break retry loop, try next action pattern
          }
          
          // Auth errors - don't retry
          if (fault.faultstring?.includes('Unknown user') || 
              fault.faultstring?.includes('incorrect password') ||
              responseText.includes('InvalidSecurity')) {
            break;
          }
          
          // Server errors - retry
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
      
      // If we got a successful response, break out of action pattern loop
      if (response?.ok) {
        break;
      }
    }

    if (!response) {
      return new Response(
        JSON.stringify({ 
          error: lastError?.message || 'Request failed after all action patterns',
          organisation: null,
          correlation_id: correlationId,
          soap_fault: lastFault
        }),
        { 
          status: 500, 
          headers: { ...corsHeaders, 'Content-Type': 'application/json' }
        }
      );
    }

    if (!response.ok) {
      const fault = parseSoapFault(responseText);
      
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
            error: `SOAP action mismatch after trying all patterns. (${fault.faultcode})`,
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
        correlation_id: correlationId,
        action_used: successAction
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
    // Extract organisation details using flexible regex patterns
    const extractValue = (tagName: string): string | null => {
      const patterns = [
        new RegExp(`<a:${tagName}[^>]*>([^<]*)</a:${tagName}>`, 'i'),
        new RegExp(`<${tagName}[^>]*>([^<]*)</${tagName}>`, 'i'),
        new RegExp(`<[^:]+:${tagName}[^>]*>([^<]*)</[^:]+:${tagName}>`, 'i'),
      ];
      for (const pattern of patterns) {
        const match = xml.match(pattern);
        if (match && match[1]?.trim()) return match[1].trim();
      }
      return null;
    };
    
    const code = extractValue('Code');
    const name = extractValue('Name');
    
    if (!code && !name) {
      return null;
    }

    return {
      code: code,
      name: name,
      trading_name: extractValue('TradingName'),
      legal_name: extractValue('LegalName'),
      abn: extractValue('ABN'),
      status: extractValue('Status') || 'Unknown',
      organisation_type: extractValue('OrganisationType'),
      address: {
        street: extractValue('StreetAddress'),
        suburb: extractValue('Suburb'),
        state: extractValue('State'),
        postcode: extractValue('Postcode'),
        full_address: [
          extractValue('StreetAddress'),
          extractValue('Suburb'),
          extractValue('State'),
          extractValue('Postcode')
        ].filter(Boolean).join(', ')
      },
      contact: {
        phone: extractValue('Phone'),
        email: extractValue('Email'),
        website: extractValue('Website')
      },
      scope: extractValue('Scope'),
      registration_date: extractValue('RegistrationDate')
    };
  } catch (error) {
    console.error('Error parsing organisation XML:', error);
    return null;
  }
}
