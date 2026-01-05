import "https://deno.land/x/xhr@0.1.0/mod.ts";
import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2.49.4";

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
};

// LOCKED TGA Production Endpoint (OrganisationServiceV13)
// IMPORTANT: must match production URL verbatim (no env override, no normalization, no casing changes)
const ORG_ENDPOINT = "https://ws.training.gov.au/Deewr.Tga.Webservices/OrganisationServiceV13.svc";

// Keep other endpoints configurable if/when needed elsewhere
const TC_ENDPOINT = Deno.env.get("TGA_TC_ENDPOINT") ?? "https://ws.training.gov.au/Deewr.Tga.Webservices/TrainingComponentServiceV13.svc";

// Credentials from env
const TGA_USERNAME = Deno.env.get('TGA_WS_USERNAME') || '';
const TGA_PASSWORD = Deno.env.get('TGA_WS_PASSWORD') || '';

// TGA V13 namespace
const TGA_NS = 'http://training.gov.au/services/13/';

// Request timeout
const REQUEST_TIMEOUT_MS = 30000;

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

// Structured logging - never log secrets
interface StageLogData {
  [key: string]: unknown;
}

function logStage(correlationId: string, stage: string, data: StageLogData = {}) {
  const sanitized: Record<string, unknown> = { correlation_id: correlationId, stage };
  
  for (const [k, v] of Object.entries(data)) {
    // Skip any auth-related fields
    if (k.toLowerCase().includes('password') || k.toLowerCase().includes('auth') || k.toLowerCase().includes('token')) {
      continue;
    }
    if (typeof v === 'string' && v.length > 500) {
      sanitized[k] = v.slice(0, 500) + '...';
    } else {
      sanitized[k] = v;
    }
  }
  
  console.log(`[TGA] [${correlationId}] STAGE=${stage}`, JSON.stringify(sanitized));
}

// JSON response helper
function jsonResponse(body: Record<string, unknown>, status = 200): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: { ...corsHeaders, 'Content-Type': 'application/json' },
  });
}

// Validate config
interface ConfigResult {
  ok: boolean;
  missing: string[];
  endpoint: string;
}

function validateConfig(): ConfigResult {
  const missing: string[] = [];
  if (!TGA_USERNAME) missing.push('TGA_WS_USERNAME');
  if (!TGA_PASSWORD) missing.push('TGA_WS_PASSWORD');

  return { ok: missing.length === 0, missing, endpoint: ORG_ENDPOINT };
}

function validateOrgEndpoint(): { ok: boolean; reason?: string } {
  if (!ORG_ENDPOINT.endsWith('.svc')) return { ok: false, reason: 'Endpoint must end with .svc' };
  return { ok: true };
}

// Build SOAP 1.2 envelope with Basic Auth approach
// TGA uses HTTP Basic Auth + SOAP 1.2 action in Content-Type
function buildSoap12Envelope(operation: string, bodyContent: string): string {
  return `<?xml version="1.0" encoding="utf-8"?>
<soap:Envelope xmlns:soap="http://www.w3.org/2003/05/soap-envelope" 
               xmlns:tns="${TGA_NS}">
  <soap:Body>
    <tns:${operation}>
      ${bodyContent}
    </tns:${operation}>
  </soap:Body>
</soap:Envelope>`;
}

// Parse SOAP fault
function parseSoapFault(xml: string): { faultcode: string | null; faultstring: string | null } {
  const faultcodeMatch = xml.match(/<(?:[a-z0-9]:)?(?:faultcode|Code|Value)[^>]*>([^<]+)<\/(?:[a-z0-9]:)?(?:faultcode|Code|Value)>/i);
  const faultstringMatch = xml.match(/<(?:[a-z0-9]:)?(?:faultstring|Reason|Text)[^>]*>([^<]+)<\/(?:[a-z0-9]:)?(?:faultstring|Reason|Text)>/i);
  
  return {
    faultcode: faultcodeMatch?.[1] || null,
    faultstring: faultstringMatch?.[1] || null
  };
}

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
  httpStatus?: number;
  authOk: boolean;
  endpointOk: boolean;
  endpointUsed: string;
}

// Make SOAP 1.2 request with HTTP Basic Auth
async function makeSoapRequest(
  endpoint: string,
  operation: string,
  soapAction: string,
  bodyContent: string,
  correlationId: string
): Promise<SoapResult> {
  const config = validateConfig();
  if (!config.ok) {
    logStage(correlationId, 'config.missing_secret', { missing: config.missing });
    return {
      xml: '',
      error: `Configuration error. Missing: ${config.missing.join(', ')}`,
      fault: null,
      authOk: false,
      endpointOk: false,
      endpointUsed: endpoint,
    };
  }

  const soapEnvelope = buildSoap12Envelope(operation, bodyContent);
  
  // Basic Auth header
  const basicAuth = btoa(`${TGA_USERNAME}:${TGA_PASSWORD}`);
  
  // SOAP 1.2 uses action in Content-Type header
  const contentType = `application/soap+xml; charset=utf-8; action="${soapAction}"`;
  
  const endpointUrl = new URL(endpoint);
  
  logStage(correlationId, 'soap.request.build', {
    endpoint_host: endpointUrl.host,
    endpoint_path: endpointUrl.pathname,
    operation,
    soap_action: soapAction,
    content_type_sent: contentType,
  });

  try {
    const controller = new AbortController();
    const timeoutId = setTimeout(() => controller.abort(), REQUEST_TIMEOUT_MS);

    const response = await fetch(endpoint, {
      method: 'POST',
      headers: {
        'Content-Type': contentType,
        'Accept': 'application/soap+xml, text/xml',
        'Authorization': `Basic ${basicAuth}`,
        'User-Agent': 'Unicorn2.0/1.0',
      },
      body: soapEnvelope,
      signal: controller.signal,
    });

    clearTimeout(timeoutId);
    const responseText = await response.text();

    logStage(correlationId, 'soap.fetch', {
      endpoint_used: `${endpointUrl.host}${endpointUrl.pathname}`,
      http_status: response.status,
      content_type_sent: contentType,
      response_snippet: responseText.slice(0, 500),
    });

    // 404 - endpoint not found
    if (response.status === 404) {
      return {
        xml: '',
        error: `Endpoint not found: ${endpoint}`,
        fault: null,
        httpStatus: 404,
        authOk: true, // 404 means we reached the server
        endpointOk: false,
        endpointUsed: endpoint,
      };
    }

    // 401/403 - auth failure
    if (response.status === 401 || response.status === 403) {
      const fault = parseSoapFault(responseText);
      return {
        xml: '',
        error: `Authentication failed: ${fault.faultstring || response.statusText}`,
        fault,
        httpStatus: response.status,
        authOk: false,
        endpointOk: true,
        endpointUsed: endpoint,
      };
    }

    // Check for SOAP fault in response
    if (containsSoapFault(responseText)) {
      const fault = parseSoapFault(responseText);
      logStage(correlationId, 'soap.fault', { fault, http_status: response.status });
      
      // Auth errors in SOAP fault
      if (fault.faultstring?.includes('Unknown user') || 
          fault.faultstring?.includes('incorrect password') ||
          responseText.includes('InvalidSecurity') ||
          responseText.includes('FailedAuthentication')) {
        return {
          xml: '',
          error: `TGA authentication failed: ${fault.faultstring || 'Invalid credentials'}`,
          fault,
          httpStatus: response.status,
          authOk: false,
          endpointOk: true,
          endpointUsed: endpoint,
        };
      }
      
      // ActionNotSupported - wrong operation
      if (fault.faultcode?.includes('ActionNotSupported') || 
          fault.faultstring?.includes('ContractFilter') ||
          fault.faultstring?.includes('does not match')) {
        return {
          xml: '',
          error: `SOAP action not supported: ${soapAction}`,
          fault,
          httpStatus: response.status,
          authOk: true,
          endpointOk: true,
          endpointUsed: endpoint,
        };
      }
      
      return {
        xml: '',
        error: fault.faultstring || `SOAP Fault: ${fault.faultcode}`,
        fault,
        httpStatus: response.status,
        authOk: true,
        endpointOk: true,
        endpointUsed: endpoint,
      };
    }

    // Success
    if (response.ok) {
      logStage(correlationId, 'soap.response.parse', { 
        http_status: response.status, 
        response_length: responseText.length 
      });
      return {
        xml: responseText,
        error: null,
        fault: null,
        httpStatus: response.status,
        authOk: true,
        endpointOk: true,
        endpointUsed: endpoint,
      };
    }

    // Other error
    return {
      xml: '',
      error: `HTTP ${response.status}: ${response.statusText}`,
      fault: parseSoapFault(responseText),
      httpStatus: response.status,
      authOk: true,
      endpointOk: true,
      endpointUsed: endpoint,
    };

  } catch (error) {
    const errorMsg = error instanceof Error ? error.message : String(error);
    logStage(correlationId, 'soap.error', { error: errorMsg });
    
    if (error instanceof Error && error.name === 'AbortError') {
      return {
        xml: '',
        error: 'Request timed out',
        fault: null,
        authOk: true,
        endpointOk: true,
        endpointUsed: endpoint,
      };
    }
    
    return {
      xml: '',
      error: errorMsg,
      fault: null,
      authOk: true,
      endpointOk: false,
      endpointUsed: endpoint,
    };
  }
}

// Fetch organisation details
async function fetchOrganisationDetails(rtoCode: string, correlationId: string): Promise<{
  summary: Record<string, unknown> | null;
  contacts: Record<string, unknown>[];
  addresses: Record<string, unknown>[];
  deliveryLocations: Record<string, unknown>[];
  error: string | null;
  fault?: { faultcode: string | null; faultstring: string | null } | null;
  httpStatus?: number;
  authOk: boolean;
  endpointOk: boolean;
  endpointUsed: string;
}> {
  logStage(correlationId, 'soap.org_details', { rto_code: rtoCode });

  const bodyContent = `<tns:code>${escapeXml(rtoCode)}</tns:code>`;
  
  // SOAP Action for GetOrganisation - from WSDL
  const soapAction = `${TGA_NS}IOrganisationService/GetOrganisation`;

  const result = await makeSoapRequest(
    ORG_ENDPOINT,
    'GetOrganisation',
    soapAction,
    bodyContent,
    correlationId
  );
  
  if (result.error) {
    return { 
      summary: null, 
      contacts: [], 
      addresses: [], 
      deliveryLocations: [], 
      error: result.error,
      fault: result.fault,
      httpStatus: result.httpStatus,
      authOk: result.authOk,
      endpointOk: result.endpointOk,
      endpointUsed: result.endpointUsed,
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
    httpStatus: result.httpStatus,
    authOk: result.authOk,
    endpointOk: result.endpointOk,
    endpointUsed: result.endpointUsed,
  };
}

// Fetch scope
async function fetchOrganisationScope(rtoCode: string, correlationId: string): Promise<{
  qualifications: Record<string, unknown>[];
  skillsets: Record<string, unknown>[];
  units: Record<string, unknown>[];
  courses: Record<string, unknown>[];
  error: string | null;
}> {
  logStage(correlationId, 'soap.scope', { rto_code: rtoCode });
  
  const bodyContent = `<tns:code>${escapeXml(rtoCode)}</tns:code>`;
  const soapAction = `${TGA_NS}IOrganisationService/GetRtoScope`;
  
  const result = await makeSoapRequest(
    ORG_ENDPOINT,
    'GetRtoScope',
    soapAction,
    bodyContent,
    correlationId
  );
  
  if (result.error) {
    return { qualifications: [], skillsets: [], units: [], courses: [], error: result.error };
  }

  // Parse qualifications
  const qualBlocks = extractMultipleBlocks(result.xml, 'Qualification');
  const qualifications = qualBlocks.map(block => ({
    qualification_code: extractValue(block, 'Code') || extractValue(block, 'NationalCode'),
    qualification_title: extractValue(block, 'Title') || extractValue(block, 'Name'),
    training_package_code: extractValue(block, 'TrainingPackageCode'),
    status: extractValue(block, 'Status') || extractValue(block, 'ScopeStatus'),
    is_current: extractValue(block, 'IsCurrent')?.toLowerCase() === 'true',
  })).filter(q => q.qualification_code);

  // Parse skill sets
  const skillBlocks = extractMultipleBlocks(result.xml, 'SkillSet');
  const skillsets = skillBlocks.map(block => ({
    skillset_code: extractValue(block, 'Code') || extractValue(block, 'NationalCode'),
    skillset_title: extractValue(block, 'Title') || extractValue(block, 'Name'),
    training_package_code: extractValue(block, 'TrainingPackageCode'),
    status: extractValue(block, 'Status') || extractValue(block, 'ScopeStatus'),
    is_current: extractValue(block, 'IsCurrent')?.toLowerCase() === 'true',
  })).filter(s => s.skillset_code);

  // Parse units
  const unitBlocks = extractMultipleBlocks(result.xml, 'Unit');
  const units = unitBlocks.map(block => ({
    unit_code: extractValue(block, 'Code') || extractValue(block, 'NationalCode'),
    unit_title: extractValue(block, 'Title') || extractValue(block, 'Name'),
    training_package_code: extractValue(block, 'TrainingPackageCode'),
    status: extractValue(block, 'Status') || extractValue(block, 'ScopeStatus'),
    is_current: extractValue(block, 'IsCurrent')?.toLowerCase() === 'true',
  })).filter(u => u.unit_code);

  // Parse courses
  const courseBlocks = extractMultipleBlocks(result.xml, 'Course');
  const courses = courseBlocks.map(block => ({
    course_code: extractValue(block, 'Code') || extractValue(block, 'NationalCode'),
    course_title: extractValue(block, 'Title') || extractValue(block, 'Name'),
    status: extractValue(block, 'Status') || extractValue(block, 'ScopeStatus'),
    is_current: extractValue(block, 'IsCurrent')?.toLowerCase() === 'true',
  })).filter(c => c.course_code);

  return { qualifications, skillsets, units, courses, error: null };
}

// WSDL probe to verify endpoint connectivity (no SOAP call, no DB writes)
async function probeWsdl(correlationId: string): Promise<{
  ok: boolean;
  http_status?: number;
  response_snippet?: string;
  error?: string;
}> {
  const wsdlUrl = `${ORG_ENDPOINT}?wsdl`;
  logStage(correlationId, 'wsdl.fetch', { url: wsdlUrl });

  try {
    const controller = new AbortController();
    const timeoutId = setTimeout(() => controller.abort(), 10000);

    const response = await fetch(wsdlUrl, {
      method: 'GET',
      headers: { Accept: 'text/xml, application/xml' },
      signal: controller.signal,
    });

    clearTimeout(timeoutId);
    const text = await response.text();
    const snippet = text.slice(0, 300);
    const isWsdl =
      text.includes('definitions') ||
      text.includes('wsdl:definitions') ||
      text.includes('<wsdl');

    logStage(correlationId, 'wsdl.fetch.result', {
      endpoint_used: `${new URL(ORG_ENDPOINT).host}${new URL(ORG_ENDPOINT).pathname}`,
      http_status: response.status,
      is_wsdl: isWsdl,
      response_snippet: snippet,
    });

    return {
      ok: response.status === 200 && isWsdl,
      http_status: response.status,
      response_snippet: snippet,
    };
  } catch (error) {
    const errorMsg = error instanceof Error ? error.message : String(error);
    logStage(correlationId, 'wsdl.fetch.error', { error: errorMsg });
    return { ok: false, error: errorMsg };
  }
}

serve(async (req) => {
  const correlationId = generateCorrelationId();

  // Always log request start
  logStage(correlationId, 'request.start', {
    method: req.method,
    url: req.url,
  });

  try {
    // CORS preflight
    if (req.method === 'OPTIONS') {
      return new Response(null, { headers: corsHeaders });
    }

    const url = new URL(req.url);

    // GET ?probe=1 - WSDL connectivity check
    if (req.method === 'GET' && url.searchParams.get('probe') === '1') {
      const endpointCheck = validateOrgEndpoint();
      if (!endpointCheck.ok) {
        return jsonResponse(
          {
            ok: false,
            correlation_id: correlationId,
            stage: 'config.invalid_endpoint',
            http_status: 400,
            endpoint_used: ORG_ENDPOINT,
            error: endpointCheck.reason,
          },
          400,
        );
      }

      const wsdlResult = await probeWsdl(correlationId);

      if (!wsdlResult.ok) {
        return jsonResponse(
          {
            ok: false,
            correlation_id: correlationId,
            stage: 'wsdl.fetch_failed',
            http_status: wsdlResult.http_status,
            endpoint_used: ORG_ENDPOINT,
            response_snippet: wsdlResult.response_snippet,
            error: wsdlResult.error || 'WSDL not accessible',
          },
          200,
        );
      }

      return jsonResponse(
        {
          ok: true,
          correlation_id: correlationId,
          stage: 'wsdl.ok',
          http_status: 200,
          endpoint_used: ORG_ENDPOINT,
          response_snippet: wsdlResult.response_snippet,
        },
        200,
      );
    }

    // POST - full import
    if (req.method !== 'POST') {
      return jsonResponse(
        {
          ok: false,
          correlation_id: correlationId,
          stage: 'input.validate',
          error: 'Method not allowed. Use POST for import, GET ?probe=1 for WSDL diagnostics.',
          endpoint_used: ORG_ENDPOINT,
          http_status: 405,
        },
        405,
      );
    }

    const endpointCheck = validateOrgEndpoint();
    if (!endpointCheck.ok) {
      return jsonResponse(
        {
          ok: false,
          correlation_id: correlationId,
          stage: 'config.invalid_endpoint',
          error: endpointCheck.reason,
          endpoint_used: ORG_ENDPOINT,
          http_status: 400,
        },
        400,
      );
    }

    // Validate config first
    const config = validateConfig();
    if (!config.ok) {
      return jsonResponse(
        {
          ok: false,
          correlation_id: correlationId,
          stage: 'config.missing_secret',
          error: `Missing configuration: ${config.missing.join(', ')}`,
          missing: config.missing,
          endpoint_used: ORG_ENDPOINT,
          http_status: 400,
        },
        400,
      );
    }
    const body = await req.json().catch(() => ({}));
    const { job_id, tenant_id, rto_code } = body;

    logStage(correlationId, 'input.validate', { job_id, tenant_id, rto_code });
    
    if (!job_id || !tenant_id || !rto_code) {
      return jsonResponse({
        ok: false,
        correlation_id: correlationId,
        stage: 'input.validate',
        error: 'Missing required params: job_id, tenant_id, rto_code',
        endpoint_used: ORG_ENDPOINT,
        http_status: 400,
      }, 400);
    }

    // Get auth token
    const authHeader = req.headers.get('Authorization');
    if (!authHeader) {
      return jsonResponse({
        ok: false,
        correlation_id: correlationId,
        stage: 'auth',
        error: 'Missing authorization header',
        endpoint_used: ORG_ENDPOINT,
        http_status: 401,
      }, 401);
    }

    // Supabase client
    const supabaseUrl = Deno.env.get('SUPABASE_URL');
    const supabaseServiceKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY');
    
    if (!supabaseUrl || !supabaseServiceKey) {
      const missing = ['SUPABASE_URL', 'SUPABASE_SERVICE_ROLE_KEY'].filter(k => !Deno.env.get(k));
      logStage(correlationId, 'config.missing_secret', { missing });
      return jsonResponse({
        ok: false,
        correlation_id: correlationId,
        stage: 'config.missing_secret',
        error: 'Supabase configuration missing',
        missing,
        endpoint_used: ORG_ENDPOINT,
        http_status: 500,
      }, 500);
    }
    
    const supabase = createClient(supabaseUrl, supabaseServiceKey);

    // Update job status
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

    // Stage 1: Fetch org details
    const orgResult = await fetchOrganisationDetails(rto_code, correlationId);
    
    if (orgResult.error) {
      logStage(correlationId, 'soap.org_details.error', { 
        error: orgResult.error, 
        fault: orgResult.fault,
        auth_ok: orgResult.authOk,
        endpoint_ok: orgResult.endpointOk,
        endpoint_used: orgResult.endpointUsed,
      });
      
      await supabase.from('tga_rto_import_jobs').update({
        status: 'failed',
        error_message: orgResult.error,
        completed_at: new Date().toISOString(),
      }).eq('id', job_id);
      
      const statusCode = orgResult.authOk === false ? 401 :
                        orgResult.endpointOk === false ? 404 : 500;

      const stage = orgResult.endpointOk === false ? 'soap.endpoint_not_found' : 'soap.org_details';

      return jsonResponse({
        ok: false,
        correlation_id: correlationId,
        stage,
        error: orgResult.error,
        fault: orgResult.fault,
        http_status: orgResult.httpStatus,
        auth_ok: orgResult.authOk,
        endpoint_ok: orgResult.endpointOk,
        endpoint_used: ORG_ENDPOINT,
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

    // Update job status
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

    logStage(correlationId, 'done', { imported });

    return jsonResponse({
      ok: true,
      correlation_id: correlationId,
      stage: 'done',
      rto_code,
      imported,
      endpoint_used: ORG_ENDPOINT,
    });

  } catch (error) {
    const errorMsg = error instanceof Error ? error.message : String(error);
    logStage(correlationId, 'request.error', { error: errorMsg });
    
    return jsonResponse({
      ok: false,
      correlation_id: correlationId,
      stage: 'request.error',
      error: errorMsg,
      endpoint_used: ORG_ENDPOINT,
      http_status: 500,
    }, 500);
  }
});
