import "https://deno.land/x/xhr@0.1.0/mod.ts";
import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2.49.4";

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
};

// TGA SOAP Endpoints - production URLs
// CRITICAL: Use correct casing for path: WebServices (capital S), not Webservices
const TGA_WS_BASE = 'https://ws.training.gov.au';
const TGA_ORG_ENDPOINT = `${TGA_WS_BASE}/Deewr.Tga.WebServices/OrganisationServiceV13.svc`;

// Production credentials
const TGA_USERNAME = Deno.env.get('TGA_WS_USERNAME') || '';
const TGA_PASSWORD = Deno.env.get('TGA_WS_PASSWORD') || '';

// Retry configuration
const MAX_RETRIES = 2;
const RETRY_DELAYS = [500, 1500];
const REQUEST_TIMEOUT_MS = 30000;

// TGA V13 namespace
const TGA_V13_NAMESPACE = 'http://training.gov.au/services/13/';

// SOAP action patterns to try (ordered by likelihood)
const SOAP_ACTION_PATTERNS = [
  (op: string) => `"${TGA_V13_NAMESPACE}IOrganisationService/${op}"`,
  (op: string) => `${TGA_V13_NAMESPACE}IOrganisationService/${op}`,
  (op: string) => `"${TGA_V13_NAMESPACE}OrganisationService/${op}"`,
  (op: string) => `"http://www.tga.deewr.gov.au/IOrganisationServiceV13/${op}"`,
];

function generateCorrelationId(): string {
  return `tga-${crypto.randomUUID()}`;
}

function escapeXml(unsafe: string): string {
  return unsafe
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&apos;');
}

// Structured logging helper
interface StageLogData {
  [key: string]: unknown;
}

function logStage(correlationId: string, stage: string, data: StageLogData = {}) {
  const sanitized: Record<string, unknown> = { correlation_id: correlationId, stage };
  
  // Copy safe data, truncate long strings
  for (const [k, v] of Object.entries(data)) {
    if (typeof v === 'string' && v.length > 500) {
      sanitized[k] = v.slice(0, 500) + '...';
    } else {
      sanitized[k] = v;
    }
  }
  
  console.log(`[TGA] [${correlationId}] STAGE=${stage}`, JSON.stringify(sanitized));
}

// Config validation
interface ConfigValidation {
  ok: boolean;
  missing: string[];
  endpoint: string;
}

function validateConfig(): ConfigValidation {
  const missing: string[] = [];
  if (!TGA_USERNAME) missing.push('TGA_WS_USERNAME');
  if (!TGA_PASSWORD) missing.push('TGA_WS_PASSWORD');
  return { ok: missing.length === 0, missing, endpoint: TGA_ORG_ENDPOINT };
}

// Build SOAP 1.1 envelope with WS-Security
function buildSoap11Envelope(operation: string, bodyContent: string): string {
  const now = new Date();
  const expires = new Date(now.getTime() + 5 * 60 * 1000);
  
  return `<?xml version="1.0" encoding="utf-8"?>
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
    <tns:${operation}>
      ${bodyContent}
    </tns:${operation}>
  </soap:Body>
</soap:Envelope>`;
}

// Parse SOAP fault from response
function parseSoapFault(xml: string): { faultcode: string | null; faultstring: string | null } {
  const faultcodeMatch = xml.match(/<(?:[a-z0-9]:)?(?:faultcode|Code)[^>]*>([^<]+)<\/(?:[a-z0-9]:)?(?:faultcode|Code)>/i);
  const faultstringMatch = xml.match(/<(?:[a-z0-9]:)?(?:faultstring|Reason|Text)[^>]*>([^<]+)<\/(?:[a-z0-9]:)?(?:faultstring|Reason|Text)>/i);
  
  return {
    faultcode: faultcodeMatch?.[1] || null,
    faultstring: faultstringMatch?.[1] || null
  };
}

// Check if response contains SOAP fault
function containsSoapFault(xml: string): boolean {
  return /<(?:[a-z0-9]:)?Fault/i.test(xml);
}

// XML parsing helpers
function extractValue(xml: string, tagName: string): string | null {
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
}

function extractMultipleBlocks(xml: string, tagName: string): string[] {
  const pattern = new RegExp(`<a:${tagName}[^>]*>[\\s\\S]*?</a:${tagName}>`, 'gi');
  const matches = xml.match(pattern) || [];
  if (matches.length === 0) {
    const pattern2 = new RegExp(`<${tagName}[^>]*>[\\s\\S]*?</${tagName}>`, 'gi');
    return xml.match(pattern2) || [];
  }
  return matches;
}

interface SoapResult {
  xml: string;
  error: string | null;
  fault: { faultcode: string | null; faultstring: string | null } | null;
  correlationId: string;
  actionUsed?: string;
  httpStatus?: number;
  authOk?: boolean;
  endpointOk?: boolean;
}

// Make SOAP 1.1 request with WS-Security
async function makeSoapRequest(
  operation: string,
  bodyContent: string,
  correlationId: string
): Promise<SoapResult> {
  const config = validateConfig();
  if (!config.ok) {
    logStage(correlationId, 'config.missing_secret', { missing: config.missing });
    return {
      xml: '',
      error: `TGA credentials not configured. Missing: ${config.missing.join(', ')}`,
      fault: null,
      correlationId,
      authOk: false,
      endpointOk: false,
    };
  }

  const soapEnvelope = buildSoap11Envelope(operation, bodyContent);
  const endpointUrl = new URL(TGA_ORG_ENDPOINT);

  logStage(correlationId, 'soap.fetch', {
    endpoint_host: endpointUrl.host,
    endpoint_path: endpointUrl.pathname,
  });

  let lastError: Error | null = null;
  let lastFault: { faultcode: string | null; faultstring: string | null } | null = null;
  let lastHttpStatus: number | undefined;
  let authOk = true;
  let endpointOk = true;

  // Try each SOAPAction pattern
  for (let actionIdx = 0; actionIdx < SOAP_ACTION_PATTERNS.length; actionIdx++) {
    const soapAction = SOAP_ACTION_PATTERNS[actionIdx](operation);
    
    console.log(`[TGA] [${correlationId}] Trying SOAP action pattern ${actionIdx + 1}: ${soapAction}`);

    for (let attempt = 0; attempt <= MAX_RETRIES; attempt++) {
      if (attempt > 0) {
        const delay = RETRY_DELAYS[attempt - 1] || 1000;
        console.log(`[TGA] [${correlationId}] Retry ${attempt}/${MAX_RETRIES} after ${delay}ms`);
        await new Promise((resolve) => setTimeout(resolve, delay));
      }

      try {
        const controller = new AbortController();
        const timeoutId = setTimeout(() => controller.abort(), REQUEST_TIMEOUT_MS);

        const response = await fetch(TGA_ORG_ENDPOINT, {
          method: 'POST',
          headers: {
            'Content-Type': 'text/xml; charset=utf-8',
            'Accept': 'text/xml',
            'SOAPAction': soapAction,
            'User-Agent': 'Unicorn2.0/1.0',
          },
          body: soapEnvelope,
          signal: controller.signal,
        });

        clearTimeout(timeoutId);
        const responseText = await response.text();
        lastHttpStatus = response.status;

        logStage(correlationId, 'soap.response.parse', {
          http_status: response.status,
          response_snippet: responseText.slice(0, 500),
          soap_action: soapAction,
        });

        if (response.ok) {
          if (containsSoapFault(responseText)) {
            const fault = parseSoapFault(responseText);
            logStage(correlationId, 'soap.fault', { fault, http_status: response.status });
            
            // ActionNotSupported - try next pattern
            if (fault.faultcode?.includes('ActionNotSupported') || 
                fault.faultstring?.includes('ContractFilter')) {
              console.log(`[TGA] [${correlationId}] Action mismatch, trying next pattern...`);
              lastFault = fault;
              break; // Try next action pattern
            }
            
            // Auth errors - don't retry
            if (fault.faultstring?.includes('Unknown user') || 
                fault.faultstring?.includes('incorrect password') ||
                responseText.includes('InvalidSecurity')) {
              authOk = false;
              return {
                xml: '',
                error: `TGA authentication failed: ${fault.faultstring || 'Invalid credentials'}`,
                fault,
                correlationId,
                httpStatus: response.status,
                authOk: false,
                endpointOk: true,
              };
            }
            
            return {
              xml: '',
              error: fault.faultstring || `SOAP Fault: ${fault.faultcode}`,
              fault,
              correlationId,
              httpStatus: response.status,
              authOk: true,
              endpointOk: true,
            };
          }
          
          console.log(`[TGA] [${correlationId}] Success with action: ${soapAction}, received ${responseText.length} bytes`);
          return { 
            xml: responseText, 
            error: null, 
            fault: null, 
            correlationId, 
            actionUsed: soapAction,
            httpStatus: response.status,
            authOk: true,
            endpointOk: true,
          };
        }

        // Non-OK response
        console.error(`[TGA] [${correlationId}] HTTP ${response.status}:`, responseText.substring(0, 500));
        
        const fault = parseSoapFault(responseText);
        lastFault = fault;

        // Check for auth errors in non-OK response
        if (fault.faultstring?.includes('Unknown user') || 
            fault.faultstring?.includes('incorrect password') ||
            responseText.includes('InvalidSecurity')) {
          authOk = false;
          return {
            xml: '',
            error: `TGA authentication failed: ${fault.faultstring || 'Invalid credentials'}`,
            fault,
            correlationId,
            httpStatus: response.status,
            authOk: false,
            endpointOk: true,
          };
        }

        // ActionNotSupported on non-OK response - try next pattern
        if (fault.faultcode?.includes('ActionNotSupported') || 
            fault.faultstring?.includes('ContractFilter') ||
            response.status === 500) {
          console.log(`[TGA] [${correlationId}] Action mismatch on ${response.status}, trying next pattern...`);
          break; // Try next action pattern
        }

        // 404 - endpoint/action not found - try next pattern
        if (response.status === 404) {
          endpointOk = false;
          console.log(`[TGA] [${correlationId}] 404 received, trying next action pattern...`);
          break; // Try next action pattern
        }

        // Server errors - retry
        if (response.status >= 500 && attempt < MAX_RETRIES) {
          lastError = new Error(`HTTP ${response.status}`);
          continue;
        }

        // Non-retryable error
        return {
          xml: '',
          error: `HTTP ${response.status} - ${fault.faultstring || 'endpoint or action not found'}`,
          fault,
          correlationId,
          httpStatus: response.status,
          authOk,
          endpointOk: response.status !== 404,
        };

      } catch (error) {
        console.error(`[TGA] [${correlationId}] Request error:`, error);

        if (error instanceof Error && error.name === 'AbortError') {
          lastError = new Error('Request timed out');
        } else {
          lastError = error instanceof Error ? error : new Error(String(error));
        }

        if (attempt < MAX_RETRIES) continue;
      }
    }
  }

  // All action patterns exhausted
  return {
    xml: '',
    error: lastError?.message || lastFault?.faultstring || 'SOAP request failed after all action patterns',
    fault: lastFault,
    correlationId,
    httpStatus: lastHttpStatus,
    authOk,
    endpointOk,
  };
}

// Fetch organisation details using GetOrganisation
async function fetchOrganisationDetails(rtoCode: string, correlationId: string): Promise<{
  summary: Record<string, unknown> | null;
  contacts: Record<string, unknown>[];
  addresses: Record<string, unknown>[];
  deliveryLocations: Record<string, unknown>[];
  error: string | null;
  correlationId: string;
  fault?: { faultcode: string | null; faultstring: string | null } | null;
  httpStatus?: number;
  authOk?: boolean;
  endpointOk?: boolean;
}> {
  console.log(`[TGA] [${correlationId}] Fetching org details for RTO ${rtoCode}`);

  const bodyContent = `<tns:code>${escapeXml(rtoCode)}</tns:code>`;

  const result = await makeSoapRequest('GetOrganisation', bodyContent, correlationId);
  
  if (result.error) {
    return { 
      summary: null, 
      contacts: [], 
      addresses: [], 
      deliveryLocations: [], 
      error: result.error,
      correlationId,
      fault: result.fault,
      httpStatus: result.httpStatus,
      authOk: result.authOk,
      endpointOk: result.endpointOk,
    };
  }

  // Parse summary
  const summary = {
    legal_name: extractValue(result.xml, 'LegalName') || extractValue(result.xml, 'Name'),
    trading_name: extractValue(result.xml, 'TradingName'),
    organisation_type: extractValue(result.xml, 'OrganisationType'),
    abn: extractValue(result.xml, 'ABN'),
    status: extractValue(result.xml, 'Status'),
    registration_start_date: extractValue(result.xml, 'RegistrationStartDate') || extractValue(result.xml, 'RegistrationDate'),
    registration_end_date: extractValue(result.xml, 'RegistrationEndDate'),
  };

  // Parse contacts
  const contactBlocks = extractMultipleBlocks(result.xml, 'Contact');
  const contacts = contactBlocks.map(block => ({
    contact_type: extractValue(block, 'ContactType') || extractValue(block, 'Type'),
    name: extractValue(block, 'Name') || `${extractValue(block, 'FirstName') || ''} ${extractValue(block, 'LastName') || ''}`.trim(),
    position: extractValue(block, 'Position'),
    phone: extractValue(block, 'Phone') || extractValue(block, 'PhoneNumber'),
    email: extractValue(block, 'Email'),
  })).filter(c => c.name || c.email);

  // Parse addresses
  const addressBlocks = extractMultipleBlocks(result.xml, 'Address');
  const addresses = addressBlocks.map(block => ({
    address_type: extractValue(block, 'AddressType') || extractValue(block, 'Type') || 'head_office',
    address_line_1: extractValue(block, 'StreetAddress') || extractValue(block, 'AddressLine1') || extractValue(block, 'Line1'),
    address_line_2: extractValue(block, 'AddressLine2') || extractValue(block, 'Line2'),
    suburb: extractValue(block, 'Suburb'),
    state: extractValue(block, 'State'),
    postcode: extractValue(block, 'Postcode'),
    country: extractValue(block, 'Country'),
    phone: extractValue(block, 'Phone'),
    fax: extractValue(block, 'Fax'),
    email: extractValue(block, 'Email'),
    website: extractValue(block, 'Website'),
  })).filter(a => a.suburb || a.state);

  // Parse delivery locations
  const locationBlocks = extractMultipleBlocks(result.xml, 'DeliveryLocation');
  const deliveryLocations = locationBlocks.map(block => ({
    location_name: extractValue(block, 'Name') || extractValue(block, 'LocationName'),
    address_line_1: extractValue(block, 'StreetAddress') || extractValue(block, 'AddressLine1'),
    address_line_2: extractValue(block, 'AddressLine2'),
    suburb: extractValue(block, 'Suburb'),
    state: extractValue(block, 'State'),
    postcode: extractValue(block, 'Postcode'),
    country: extractValue(block, 'Country'),
  })).filter(l => l.suburb || l.location_name);

  return { 
    summary: summary.legal_name ? summary : null, 
    contacts, 
    addresses, 
    deliveryLocations,
    error: null,
    correlationId,
    httpStatus: result.httpStatus,
    authOk: result.authOk,
    endpointOk: result.endpointOk,
  };
}

// Fetch scope using GetRtoScope
async function fetchOrganisationScope(rtoCode: string, correlationId: string): Promise<{
  qualifications: Record<string, unknown>[];
  skillsets: Record<string, unknown>[];
  units: Record<string, unknown>[];
  courses: Record<string, unknown>[];
  error: string | null;
}> {
  console.log(`[TGA] [${correlationId}] Fetching scope for RTO ${rtoCode}`);
  
  const bodyContent = `<tns:code>${escapeXml(rtoCode)}</tns:code>`;
  
  const result = await makeSoapRequest('GetRtoScope', bodyContent, correlationId);
  
  if (result.error) {
    console.error(`[TGA] [${correlationId}] Scope fetch error:`, result.error);
    return { qualifications: [], skillsets: [], units: [], courses: [], error: result.error };
  }

  // Parse qualifications
  const qualBlocks = extractMultipleBlocks(result.xml, 'Qualification');
  const qualifications = qualBlocks.map(block => ({
    qualification_code: extractValue(block, 'Code'),
    qualification_title: extractValue(block, 'Title'),
    training_package_code: extractValue(block, 'TrainingPackageCode'),
    training_package_title: extractValue(block, 'TrainingPackageTitle'),
    scope_start_date: extractValue(block, 'ScopeStartDate') || extractValue(block, 'StartDate'),
    scope_end_date: extractValue(block, 'ScopeEndDate') || extractValue(block, 'EndDate'),
    status: extractValue(block, 'Status'),
    is_current: extractValue(block, 'IsCurrent')?.toLowerCase() === 'true',
  })).filter(q => q.qualification_code);

  // Parse skill sets
  const skillBlocks = extractMultipleBlocks(result.xml, 'SkillSet');
  const skillsets = skillBlocks.map(block => ({
    skillset_code: extractValue(block, 'Code'),
    skillset_title: extractValue(block, 'Title'),
    training_package_code: extractValue(block, 'TrainingPackageCode'),
    training_package_title: extractValue(block, 'TrainingPackageTitle'),
    scope_start_date: extractValue(block, 'ScopeStartDate') || extractValue(block, 'StartDate'),
    scope_end_date: extractValue(block, 'ScopeEndDate') || extractValue(block, 'EndDate'),
    status: extractValue(block, 'Status'),
    is_current: extractValue(block, 'IsCurrent')?.toLowerCase() === 'true',
  })).filter(s => s.skillset_code);

  // Parse units
  const unitBlocks = extractMultipleBlocks(result.xml, 'Unit');
  const units = unitBlocks.map(block => ({
    unit_code: extractValue(block, 'Code'),
    unit_title: extractValue(block, 'Title'),
    training_package_code: extractValue(block, 'TrainingPackageCode'),
    training_package_title: extractValue(block, 'TrainingPackageTitle'),
    scope_start_date: extractValue(block, 'ScopeStartDate') || extractValue(block, 'StartDate'),
    scope_end_date: extractValue(block, 'ScopeEndDate') || extractValue(block, 'EndDate'),
    status: extractValue(block, 'Status'),
    is_current: extractValue(block, 'IsCurrent')?.toLowerCase() === 'true',
    is_explicit: true,
  })).filter(u => u.unit_code);

  // Parse accredited courses
  const courseBlocks = extractMultipleBlocks(result.xml, 'AccreditedCourse');
  const courses = courseBlocks.map(block => ({
    course_code: extractValue(block, 'Code'),
    course_title: extractValue(block, 'Title'),
    scope_start_date: extractValue(block, 'ScopeStartDate') || extractValue(block, 'StartDate'),
    scope_end_date: extractValue(block, 'ScopeEndDate') || extractValue(block, 'EndDate'),
    status: extractValue(block, 'Status'),
    is_current: extractValue(block, 'IsCurrent')?.toLowerCase() === 'true',
  })).filter(c => c.course_code);

  return { qualifications, skillsets, units, courses, error: null };
}

// JSON response helper
function jsonResponse(data: Record<string, unknown>, status = 200): Response {
  return new Response(JSON.stringify(data), {
    status,
    headers: { ...corsHeaders, 'Content-Type': 'application/json' },
  });
}

serve(async (req) => {
  const correlationId = generateCorrelationId();
  
  // Handle CORS preflight
  if (req.method === 'OPTIONS') {
    return new Response(null, { headers: corsHeaders });
  }

  try {
    // Validate config upfront
    const config = validateConfig();
    if (!config.ok) {
      logStage(correlationId, 'config.missing_secret', { missing: config.missing });
      return jsonResponse({
        ok: false,
        correlation_id: correlationId,
        stage: 'config.missing_secret',
        error: `TGA credentials not configured`,
        missing: config.missing,
      }, 400);
    }

    // Handle GET probe request
    const url = new URL(req.url);
    if (req.method === 'GET' && url.searchParams.get('probe') === '1') {
      const rto = url.searchParams.get('rto') || '91020';
      
      logStage(correlationId, 'input.validate', { rto_code: rto, mode: 'probe_get' });
      
      // Check auth header
      const authHeader = req.headers.get('Authorization');
      if (!authHeader) {
        logStage(correlationId, 'auth.resolve', { error: 'Missing authorization' });
        return jsonResponse({
          ok: false,
          correlation_id: correlationId,
          stage: 'auth',
          error: 'Missing authorization header',
        }, 401);
      }
      
      // Fetch org details as probe (no DB writes)
      logStage(correlationId, 'soap.org_details', { rto_code: rto });
      const orgResult = await fetchOrganisationDetails(rto, correlationId);
      
      if (orgResult.error) {
        logStage(correlationId, 'soap.org_details.error', { 
          error: orgResult.error, 
          fault: orgResult.fault,
          auth_ok: orgResult.authOk,
          endpoint_ok: orgResult.endpointOk,
        });
        
        // Return diagnostic info, NOT 502
        const statusCode = orgResult.authOk === false ? 401 : 
                          orgResult.endpointOk === false ? 404 : 500;
        
        return jsonResponse({
          ok: false,
          correlation_id: correlationId,
          stage: 'soap.org_details',
          mode: 'probe',
          rto_code: rto,
          error: orgResult.error,
          fault: orgResult.fault,
          http_status: orgResult.httpStatus,
          auth_ok: orgResult.authOk,
          endpoint_ok: orgResult.endpointOk,
          endpoint_used: TGA_ORG_ENDPOINT,
        }, statusCode);
      }
      
      logStage(correlationId, 'soap.org_details.success', { 
        has_summary: !!orgResult.summary,
        contacts_count: orgResult.contacts.length,
        addresses_count: orgResult.addresses.length,
        delivery_locations_count: orgResult.deliveryLocations.length,
      });
      
      return jsonResponse({
        ok: true,
        correlation_id: correlationId,
        mode: 'probe',
        rto_code: rto,
        auth_ok: true,
        endpoint_ok: true,
        http_status: orgResult.httpStatus,
        summary: orgResult.summary,
        counts: {
          contacts: orgResult.contacts.length,
          addresses: orgResult.addresses.length,
          delivery_locations: orgResult.deliveryLocations.length,
        },
        endpoint_used: TGA_ORG_ENDPOINT,
      });
    }

    // POST request - full import or probe
    if (req.method !== 'POST') {
      return jsonResponse({
        ok: false,
        correlation_id: correlationId,
        stage: 'input.validate',
        error: 'Method not allowed. Use POST for import or GET with ?probe=1&rto=XXXXX for diagnostics.',
      }, 405);
    }

    let body: Record<string, unknown>;
    try {
      body = await req.json();
    } catch {
      return jsonResponse({
        ok: false,
        correlation_id: correlationId,
        stage: 'input.validate',
        error: 'Invalid JSON body',
      }, 400);
    }

    const { job_id, tenant_id, rto_code, probe } = body as {
      job_id?: string;
      tenant_id?: number;
      rto_code?: string;
      probe?: boolean;
    };
    
    // Handle probe via POST
    if (probe === true) {
      const rto = rto_code || '91020';
      logStage(correlationId, 'input.validate', { rto_code: rto, mode: 'probe_post' });
      
      const orgResult = await fetchOrganisationDetails(rto, correlationId);
      
      if (orgResult.error) {
        logStage(correlationId, 'soap.org_details.error', { 
          error: orgResult.error, 
          fault: orgResult.fault,
          auth_ok: orgResult.authOk,
          endpoint_ok: orgResult.endpointOk,
        });
        
        const statusCode = orgResult.authOk === false ? 401 : 
                          orgResult.endpointOk === false ? 404 : 500;
        
        return jsonResponse({
          ok: false,
          correlation_id: correlationId,
          stage: 'soap.org_details',
          mode: 'probe',
          rto_code: rto,
          error: orgResult.error,
          fault: orgResult.fault,
          http_status: orgResult.httpStatus,
          auth_ok: orgResult.authOk,
          endpoint_ok: orgResult.endpointOk,
          endpoint_used: TGA_ORG_ENDPOINT,
        }, statusCode);
      }
      
      return jsonResponse({
        ok: true,
        correlation_id: correlationId,
        mode: 'probe',
        rto_code: rto,
        auth_ok: true,
        endpoint_ok: true,
        summary: orgResult.summary,
        counts: {
          contacts: orgResult.contacts.length,
          addresses: orgResult.addresses.length,
          delivery_locations: orgResult.deliveryLocations.length,
        },
      });
    }

    // Full import - validate required params
    logStage(correlationId, 'input.validate', { job_id, tenant_id, rto_code });
    
    if (!job_id || !tenant_id || !rto_code) {
      return jsonResponse({
        ok: false,
        correlation_id: correlationId,
        stage: 'input.validate',
        error: 'Missing required params: job_id, tenant_id, rto_code',
      }, 400);
    }

    // Get auth token for Supabase
    const authHeader = req.headers.get('Authorization');
    if (!authHeader) {
      return jsonResponse({
        ok: false,
        correlation_id: correlationId,
        stage: 'auth',
        error: 'Missing authorization header',
      }, 401);
    }

    // Initialize Supabase client
    const supabaseUrl = Deno.env.get('SUPABASE_URL');
    const supabaseServiceKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY');
    
    if (!supabaseUrl || !supabaseServiceKey) {
      logStage(correlationId, 'config.missing_secret', { missing: ['SUPABASE_URL', 'SUPABASE_SERVICE_ROLE_KEY'].filter(k => !Deno.env.get(k)) });
      return jsonResponse({
        ok: false,
        correlation_id: correlationId,
        stage: 'config.missing_secret',
        error: 'Supabase configuration missing',
      }, 500);
    }
    
    const supabase = createClient(supabaseUrl, supabaseServiceKey);

    // Update job status to running
    await supabase.from('tga_rto_import_jobs').update({
      status: 'running',
      started_at: new Date().toISOString(),
      correlation_id: correlationId,
    }).eq('id', job_id);

    const imported = {
      summary: 0,
      contacts: 0,
      addresses: 0,
      delivery_locations: 0,
      qualifications: 0,
      skill_sets: 0,
      units_explicit: 0,
      courses: 0,
    };

    // Stage 1: Fetch organisation details
    logStage(correlationId, 'soap.org_details', { rto_code });
    const orgResult = await fetchOrganisationDetails(rto_code, correlationId);
    
    if (orgResult.error) {
      logStage(correlationId, 'soap.org_details.error', { 
        error: orgResult.error, 
        fault: orgResult.fault,
        auth_ok: orgResult.authOk,
        endpoint_ok: orgResult.endpointOk,
      });
      
      await supabase.from('tga_rto_import_jobs').update({
        status: 'failed',
        error_message: orgResult.error,
        completed_at: new Date().toISOString(),
      }).eq('id', job_id);
      
      const statusCode = orgResult.authOk === false ? 401 : 
                        orgResult.endpointOk === false ? 404 : 500;
      
      return jsonResponse({
        ok: false,
        correlation_id: correlationId,
        stage: 'soap.org_details',
        error: orgResult.error,
        fault: orgResult.fault,
        http_status: orgResult.httpStatus,
        auth_ok: orgResult.authOk,
        endpoint_ok: orgResult.endpointOk,
      }, statusCode);
    }

    // Store summary
    if (orgResult.summary) {
      const { error: summaryError } = await supabase.from('tga_rto_summary').upsert({
        tenant_id,
        rto_code,
        ...orgResult.summary,
        fetched_at: new Date().toISOString(),
        updated_at: new Date().toISOString(),
      }, { onConflict: 'tenant_id,rto_code' });
      
      if (!summaryError) imported.summary = 1;
      logStage(correlationId, 'db.upsert.summary', { count: imported.summary, error: summaryError?.message });
    }

    // Store contacts
    if (orgResult.contacts.length > 0) {
      await supabase.from('tga_rto_contacts').delete().eq('tenant_id', tenant_id).eq('rto_code', rto_code);
      
      const contactRows = orgResult.contacts.map(c => ({
        tenant_id,
        rto_code,
        ...c,
        updated_at: new Date().toISOString(),
      }));
      
      const { error: contactsError } = await supabase.from('tga_rto_contacts').insert(contactRows);
      if (!contactsError) imported.contacts = orgResult.contacts.length;
      logStage(correlationId, 'db.insert.contacts', { count: imported.contacts, error: contactsError?.message });
    }

    // Store addresses
    if (orgResult.addresses.length > 0) {
      await supabase.from('tga_rto_addresses').delete().eq('tenant_id', tenant_id).eq('rto_code', rto_code);
      
      const addressRows = orgResult.addresses.map(a => ({
        tenant_id,
        rto_code,
        ...a,
        updated_at: new Date().toISOString(),
      }));
      
      const { error: addressError } = await supabase.from('tga_rto_addresses').insert(addressRows);
      if (!addressError) imported.addresses = orgResult.addresses.length;
      logStage(correlationId, 'db.insert.addresses', { count: imported.addresses, error: addressError?.message });
    }

    // Store delivery locations
    if (orgResult.deliveryLocations.length > 0) {
      await supabase.from('tga_rto_delivery_locations').delete().eq('tenant_id', tenant_id).eq('rto_code', rto_code);
      
      const locationRows = orgResult.deliveryLocations.map(l => ({
        tenant_id,
        rto_code,
        ...l,
        updated_at: new Date().toISOString(),
      }));
      
      const { error: locError } = await supabase.from('tga_rto_delivery_locations').insert(locationRows);
      if (!locError) imported.delivery_locations = orgResult.deliveryLocations.length;
      logStage(correlationId, 'db.insert.delivery_locations', { count: imported.delivery_locations, error: locError?.message });
    }

    // Stage 2: Fetch scope
    logStage(correlationId, 'soap.scope', { rto_code });
    const scopeResult = await fetchOrganisationScope(rto_code, correlationId);
    
    if (!scopeResult.error) {
      // Store qualifications
      if (scopeResult.qualifications.length > 0) {
        await supabase.from('tga_scope_qualifications').delete().eq('tenant_id', tenant_id).eq('rto_code', rto_code);
        
        const qualRows = scopeResult.qualifications.map(q => ({
          tenant_id,
          rto_code,
          ...q,
          updated_at: new Date().toISOString(),
        }));
        
        const { error: qualError } = await supabase.from('tga_scope_qualifications').insert(qualRows);
        if (!qualError) imported.qualifications = scopeResult.qualifications.length;
        logStage(correlationId, 'db.insert.qualifications', { count: imported.qualifications, error: qualError?.message });
      }

      // Store skill sets
      if (scopeResult.skillsets.length > 0) {
        await supabase.from('tga_scope_skillsets').delete().eq('tenant_id', tenant_id).eq('rto_code', rto_code);
        
        const skillRows = scopeResult.skillsets.map(s => ({
          tenant_id,
          rto_code,
          ...s,
          updated_at: new Date().toISOString(),
        }));
        
        const { error: skillError } = await supabase.from('tga_scope_skillsets').insert(skillRows);
        if (!skillError) imported.skill_sets = scopeResult.skillsets.length;
        logStage(correlationId, 'db.insert.skill_sets', { count: imported.skill_sets, error: skillError?.message });
      }

      // Store units
      if (scopeResult.units.length > 0) {
        await supabase.from('tga_scope_units').delete().eq('tenant_id', tenant_id).eq('rto_code', rto_code);
        
        const unitRows = scopeResult.units.map(u => ({
          tenant_id,
          rto_code,
          ...u,
          updated_at: new Date().toISOString(),
        }));
        
        const { error: unitError } = await supabase.from('tga_scope_units').insert(unitRows);
        if (!unitError) imported.units_explicit = scopeResult.units.length;
        logStage(correlationId, 'db.insert.units', { count: imported.units_explicit, error: unitError?.message });
      }

      // Store courses
      if (scopeResult.courses.length > 0) {
        await supabase.from('tga_scope_courses').delete().eq('tenant_id', tenant_id).eq('rto_code', rto_code);
        
        const courseRows = scopeResult.courses.map(c => ({
          tenant_id,
          rto_code,
          ...c,
          updated_at: new Date().toISOString(),
        }));
        
        const { error: courseError } = await supabase.from('tga_scope_courses').insert(courseRows);
        if (!courseError) imported.courses = scopeResult.courses.length;
        logStage(correlationId, 'db.insert.courses', { count: imported.courses, error: courseError?.message });
      }
    } else {
      logStage(correlationId, 'soap.scope.error', { error: scopeResult.error });
    }

    // Update job status to completed
    await supabase.from('tga_rto_import_jobs').update({
      status: 'completed',
      completed_at: new Date().toISOString(),
      imported_counts: imported,
    }).eq('id', job_id);

    // Log audit event
    await supabase.from('audit_events').insert({
      entity: 'tga_import',
      entity_id: job_id,
      action: 'import_completed',
      details: { correlation_id: correlationId, rto_code, imported },
    });

    logStage(correlationId, 'import.complete', { imported });

    return jsonResponse({
      ok: true,
      correlation_id: correlationId,
      stage: 'done',
      rto_code,
      imported,
    });

  } catch (error) {
    const errorMsg = error instanceof Error ? error.message : String(error);
    logStage(correlationId, 'request.error', { error: errorMsg });
    
    return jsonResponse({
      ok: false,
      correlation_id: correlationId,
      stage: 'request',
      error: errorMsg,
    }, 500);
  }
});
