import { corsHeaders } from '../_shared/cors.ts';

const SANDBOX_URL = 'https://ws.sandbox.training.gov.au/Deewr.Tga.Webservices/OrganisationServiceV13.svc/Organisation';

const SANDBOX_USERNAME = Deno.env.get('TGA_SANDBOX_USERNAME') || '';
const SANDBOX_PASSWORD = Deno.env.get('TGA_SANDBOX_PASSWORD') || '';

// RTO code validation regex (typically numeric, 4-5 digits)
const RTO_CODE_PATTERN = /^\d{4,5}$/;

Deno.serve(async (req) => {
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
          organisation: null
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
          organisation: null
        }),
        { 
          status: 400, 
          headers: { ...corsHeaders, 'Content-Type': 'application/json' }
        }
      );
    }

    // Build SOAP envelope with WS-Security
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
    <tga:GetOrganisation>
      <tga:code>${escapeXml(sanitizedCode)}</tga:code>
    </tga:GetOrganisation>
  </soap:Body>
</soap:Envelope>`;

    console.log(`Fetching organisation details for RTO code: ${sanitizedCode}`);
    
    // Call SOAP service
    const response = await fetch(SANDBOX_URL, {
      method: 'POST',
      headers: {
        'Content-Type': 'text/xml; charset=utf-8',
        'SOAPAction': 'http://www.tga.deewr.gov.au/IOrganisationService/GetOrganisation'
      },
      body: soapEnvelope
    });

    if (!response.ok) {
      const errorText = await response.text();
      console.error('SOAP Error:', errorText);
      
      // Check for authentication errors
      if (errorText.includes('InvalidSecurity')) {
        return new Response(
          JSON.stringify({ 
            error: 'Authentication required. Please configure TGA_SANDBOX_USERNAME and TGA_SANDBOX_PASSWORD.',
            organisation: null,
            hint: 'Register at training.gov.au for sandbox credentials'
          }),
          { 
            status: 401, 
            headers: { ...corsHeaders, 'Content-Type': 'application/json' }
          }
        );
      }

      // Check for not found
      if (response.status === 404 || errorText.includes('not found')) {
        return new Response(
          JSON.stringify({ 
            error: `Organisation with RTO code ${sanitizedCode} not found`,
            organisation: null
          }),
          { 
            status: 404, 
            headers: { ...corsHeaders, 'Content-Type': 'application/json' }
          }
        );
      }
      
      throw new Error(`SOAP service error: ${response.status}`);
    }

    const xmlText = await response.text();
    console.log('Organisation details received');

    // Parse XML response
    const organisation = parseOrganisationFromXml(xmlText);

    if (!organisation) {
      return new Response(
        JSON.stringify({ 
          error: `Organisation with RTO code ${sanitizedCode} not found`,
          organisation: null
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
        organisation
      }),
      { 
        headers: { ...corsHeaders, 'Content-Type': 'application/json' }
      }
    );

  } catch (error) {
    console.error('Error in get-organisation-details:', error);
    const errorMessage = error instanceof Error ? error.message : 'Failed to fetch organisation details';
    return new Response(
      JSON.stringify({ 
        error: errorMessage,
        organisation: null
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

function parseOrganisationFromXml(xml: string): any | null {
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
