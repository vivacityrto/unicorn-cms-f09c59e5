import "https://deno.land/x/xhr@0.1.0/mod.ts";
import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2.49.4";

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
};

// ============================================================================
// SECRET RESOLUTION - Backward compatible across naming schemes
// ============================================================================

function getSecret(nameList: string[]): string | undefined {
  for (const name of nameList) {
    const value = Deno.env.get(name);
    if (value && value.trim()) {
      return value.trim();
    }
  }
  return undefined;
}

// Backward-compatible secret names (Unicorn + ComplyHub)
const TGA_WS_USERNAME = getSecret(['TGA_WS_USERNAME', 'TGA_USERNAME']);
const TGA_WS_PASSWORD = getSecret(['TGA_WS_PASSWORD', 'TGA_PASSWORD']);
const TGA_ORG_ENDPOINT_OVERRIDE = getSecret(['TGA_ORG_ENDPOINT']);
const TGA_COMPONENT_ENDPOINT_OVERRIDE = getSecret(['TGA_COMPONENT_ENDPOINT', 'TGA_COMP_ENDPOINT']);
const TGA_TIMEOUT_MS = parseInt(getSecret(['TGA_TIMEOUT_MS']) || '30000', 10);

// Default base URL
const DEFAULT_TGA_BASE = 'https://ws.training.gov.au/Deewr.Tga.WebServices';

// SOAP namespaces
const SOAP_NS = {
  soap: 'http://www.w3.org/2003/05/soap-envelope',
  org: 'http://training.gov.au/services/Organisation',
  tc: 'http://training.gov.au/services/TrainingComponent',
};

function generateCorrelationId(): string {
  return `tga-${crypto.randomUUID()}`;
}

// Structured logging - never log secrets
function logStage(correlationId: string, stage: string, data: Record<string, unknown> = {}) {
  const sanitized: Record<string, unknown> = { correlation_id: correlationId, stage };
  
  for (const [k, v] of Object.entries(data)) {
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

// ============================================================================
// WSDL ENDPOINT DISCOVERY
// ============================================================================

interface EndpointDiscoveryResult {
  ok: boolean;
  serviceEndpoint: string | null;
  wsdlUrl: string | null;
  candidatesTried: string[];
  httpStatus: number | null;
  stage: string;
  error?: string;
  responseSnippet?: string;
}

function normalizeOrgBase(endpoint: string | undefined): string {
  if (!endpoint) {
    return DEFAULT_TGA_BASE;
  }
  
  let base = endpoint.trim();
  
  // Strip ?wsdl if present
  if (base.endsWith('?wsdl')) {
    base = base.slice(0, -5);
  }
  
  // If it already ends with .svc, return parent directory
  if (base.endsWith('.svc')) {
    const lastSlash = base.lastIndexOf('/');
    if (lastSlash > 0) {
      return base.slice(0, lastSlash);
    }
  }
  
  // Remove trailing slash
  if (base.endsWith('/')) {
    base = base.slice(0, -1);
  }
  
  return base;
}

function buildWsdlCandidates(orgBase: string): string[] {
  const candidates: string[] = [];
  
  // V13 first (preferred), then non-versioned
  candidates.push(`${orgBase}/OrganisationServiceV13.svc?wsdl`);
  candidates.push(`${orgBase}/OrganisationService.svc?wsdl`);
  
  return candidates;
}

async function discoverEndpointFromWsdl(
  correlationId: string
): Promise<EndpointDiscoveryResult> {
  const orgBase = normalizeOrgBase(TGA_ORG_ENDPOINT_OVERRIDE);
  const candidates = buildWsdlCandidates(orgBase);
  const candidatesTried: string[] = [];
  
  logStage(correlationId, 'config.resolve', {
    org_base: orgBase,
    candidates: candidates,
    has_endpoint_override: !!TGA_ORG_ENDPOINT_OVERRIDE,
  });

  for (const wsdlUrl of candidates) {
    candidatesTried.push(wsdlUrl);
    
    try {
      logStage(correlationId, 'wsdl.fetch', { wsdl_url: wsdlUrl });
      
      const controller = new AbortController();
      const timeoutId = setTimeout(() => controller.abort(), TGA_TIMEOUT_MS);
      
      const response = await fetch(wsdlUrl, {
        method: 'GET',
        headers: { 'Accept': 'text/xml, application/xml' },
        signal: controller.signal,
      });
      
      clearTimeout(timeoutId);
      
      if (response.status !== 200) {
        logStage(correlationId, 'wsdl.fetch.fail', {
          wsdl_url: wsdlUrl,
          http_status: response.status,
        });
        continue;
      }
      
      const wsdlXml = await response.text();
      logStage(correlationId, 'wsdl.parse', {
        wsdl_url: wsdlUrl,
        wsdl_length: wsdlXml.length,
      });
      
      // Extract SOAP 1.2 address first, then SOAP 1.1
      let serviceEndpoint = extractSoapAddress(wsdlXml, 'soap12');
      if (!serviceEndpoint) {
        serviceEndpoint = extractSoapAddress(wsdlXml, 'soap');
      }
      
      if (serviceEndpoint) {
        logStage(correlationId, 'wsdl.discovered', {
          wsdl_url: wsdlUrl,
          service_endpoint: serviceEndpoint,
        });
        
        return {
          ok: true,
          serviceEndpoint,
          wsdlUrl,
          candidatesTried,
          httpStatus: 200,
          stage: 'wsdl.discovered',
        };
      } else {
        logStage(correlationId, 'wsdl.parse.no_address', { wsdl_url: wsdlUrl });
      }
    } catch (err) {
      const errorMsg = err instanceof Error ? err.message : String(err);
      logStage(correlationId, 'wsdl.fetch.error', {
        wsdl_url: wsdlUrl,
        error: errorMsg,
      });
    }
  }
  
  // All candidates failed
  return {
    ok: false,
    serviceEndpoint: null,
    wsdlUrl: null,
    candidatesTried,
    httpStatus: null,
    stage: 'config.endpoint_not_found',
    error: `No valid WSDL found. Tried: ${candidatesTried.join(', ')}`,
  };
}

function extractSoapAddress(wsdlXml: string, prefix: string): string | null {
  // Match <soap12:address location="..." /> or <soap:address location="..." />
  const patterns = [
    new RegExp(`<${prefix}:address[^>]+location=["']([^"']+)["']`, 'i'),
    new RegExp(`<wsdl:port[^>]*>[\\s\\S]*?<${prefix}:address[^>]+location=["']([^"']+)["']`, 'i'),
  ];
  
  for (const pattern of patterns) {
    const match = wsdlXml.match(pattern);
    if (match && match[1]) {
      return match[1];
    }
  }
  
  return null;
}

// ============================================================================
// SOAP LAYER - Using discovered endpoint
// ============================================================================

interface ConfigValidation {
  ok: boolean;
  missing: string[];
}

function validateConfig(): ConfigValidation {
  const missing: string[] = [];
  if (!TGA_WS_USERNAME) missing.push('TGA_WS_USERNAME or TGA_USERNAME');
  if (!TGA_WS_PASSWORD) missing.push('TGA_WS_PASSWORD or TGA_PASSWORD');
  return { ok: missing.length === 0, missing };
}

function getBasicAuthHeader(): string | null {
  if (!TGA_WS_USERNAME || !TGA_WS_PASSWORD) {
    return null;
  }
  const credentials = btoa(`${TGA_WS_USERNAME}:${TGA_WS_PASSWORD}`);
  return `Basic ${credentials}`;
}

function buildOrgSoapRequest(action: string, body: string): string {
  return `<?xml version="1.0" encoding="utf-8"?>
<soap12:Envelope xmlns:soap12="${SOAP_NS.soap}" xmlns:org="${SOAP_NS.org}">
  <soap12:Body>
    <org:${action}>
      ${body}
    </org:${action}>
  </soap12:Body>
</soap12:Envelope>`;
}

interface SoapRequestResult {
  ok: boolean;
  xml: string;
  httpStatus: number | null;
  error?: string;
  responseSnippet?: string;
}

async function makeSoapRequest(
  endpoint: string,
  soapAction: string,
  body: string,
  correlationId: string
): Promise<SoapRequestResult> {
  logStage(correlationId, 'soap.post', {
    endpoint_used: endpoint,
    soap_action: soapAction,
    body_length: body.length,
  });

  // Check auth header before making request
  const authHeader = getBasicAuthHeader();
  if (!authHeader) {
    return {
      ok: false,
      xml: '',
      httpStatus: null,
      error: 'TGA credentials not configured (username or password missing)',
    };
  }

  try {
    const controller = new AbortController();
    const timeoutId = setTimeout(() => controller.abort(), TGA_TIMEOUT_MS);

    const response = await fetch(endpoint, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/soap+xml; charset=utf-8',
        'Authorization': authHeader,
      },
      body,
      signal: controller.signal,
    });

    clearTimeout(timeoutId);
    
    let xmlResponse = '';
    try {
      xmlResponse = await response.text();
    } catch (textErr) {
      xmlResponse = `[Failed to read response body: ${textErr instanceof Error ? textErr.message : String(textErr)}]`;
    }

    logStage(correlationId, 'soap.response', {
      endpoint_used: endpoint,
      http_status: response.status,
      response_length: xmlResponse.length,
      response_snippet: xmlResponse.slice(0, 300),
    });

    if (!response.ok) {
      return {
        ok: false,
        xml: xmlResponse,
        httpStatus: response.status,
        error: `SOAP request failed: ${response.status} ${response.statusText}`,
        responseSnippet: xmlResponse.slice(0, 500),
      };
    }

    return {
      ok: true,
      xml: xmlResponse,
      httpStatus: response.status,
    };
  } catch (error) {
    const errorMsg = error instanceof Error ? error.message : String(error);
    const isTimeout = error instanceof Error && error.name === 'AbortError';
    
    logStage(correlationId, 'soap.error', { error: errorMsg, is_timeout: isTimeout });
    
    return {
      ok: false,
      xml: '',
      httpStatus: null,
      error: isTimeout ? 'Request timed out' : errorMsg,
    };
  }
}

// ============================================================================
// XML PARSING HELPERS
// ============================================================================

function extractValue(xml: string, tagName: string): string | null {
  const patterns = [
    new RegExp(`<(?:a:)?${tagName}>([^<]*)<\\/(?:a:)?${tagName}>`, 'i'),
    new RegExp(`<${tagName}[^>]*>([^<]*)<\\/${tagName}>`, 'i'),
  ];
  for (const pattern of patterns) {
    const match = xml.match(pattern);
    if (match) return match[1].trim() || null;
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

// ============================================================================
// ORGANISATION DATA FETCHING
// ============================================================================

interface OrganisationSummary {
  code: string;
  legalName: string;
  tradingName: string | null;
  organisationType: string | null;
  abn: string | null;
  status: string | null;
  registrationStartDate: string | null;
  registrationEndDate: string | null;
  phone: string | null;
  email: string | null;
  website: string | null;
}

interface OrganisationContact {
  firstName: string | null;
  lastName: string | null;
  phone: string | null;
  email: string | null;
  role: string | null;
}

interface OrganisationAddress {
  addressType: string | null;
  line1: string | null;
  line2: string | null;
  suburb: string | null;
  state: string | null;
  postcode: string | null;
  country: string | null;
}

interface ScopeItem {
  code: string;
  title: string;
  componentType: string;
  isImplicit: boolean;
  startDate: string | null;
  endDate: string | null;
  restrictions: string | null;
}

interface FetchOrgResult {
  ok: boolean;
  summary: OrganisationSummary | null;
  contacts: OrganisationContact[];
  addresses: OrganisationAddress[];
  scopeItems: ScopeItem[];
  qualifications: ScopeItem[];
  skillSets: ScopeItem[];
  units: ScopeItem[];
  courses: string[];
  httpStatus: number | null;
  endpointUsed: string;
  wsdlUrlUsed: string | null;
  stage?: string;
  error?: string;
  responseSnippet?: string;
}

async function fetchOrganisationDetails(
  rtoCode: string,
  correlationId: string
): Promise<FetchOrgResult> {
  logStage(correlationId, 'soap.org_details', { rto_code: rtoCode });

  // First, discover the endpoint via WSDL
  const discovery = await discoverEndpointFromWsdl(correlationId);
  
  if (!discovery.ok || !discovery.serviceEndpoint) {
    return {
      ok: false,
      summary: null,
      contacts: [],
      addresses: [],
      scopeItems: [],
      qualifications: [],
      skillSets: [],
      units: [],
      courses: [],
      httpStatus: discovery.httpStatus,
      endpointUsed: discovery.candidatesTried.join(', '),
      wsdlUrlUsed: null,
      error: discovery.error || 'WSDL discovery failed',
    };
  }

  const endpoint = discovery.serviceEndpoint;
  const body = buildOrgSoapRequest('GetDetails', `<org:request><org:Code>${rtoCode}</org:Code></org:request>`);
  const result = await makeSoapRequest(endpoint, 'GetDetails', body, correlationId);

  if (!result.ok) {
    logStage(correlationId, 'soap.org_details.error', {
      error: result.error,
      http_status: result.httpStatus,
      endpoint_used: endpoint,
    });

    return {
      ok: false,
      summary: null,
      contacts: [],
      addresses: [],
      scopeItems: [],
      qualifications: [],
      skillSets: [],
      units: [],
      courses: [],
      httpStatus: result.httpStatus,
      endpointUsed: endpoint,
      wsdlUrlUsed: discovery.wsdlUrl,
      error: result.error,
      responseSnippet: result.responseSnippet,
    };
  }

  const xml = result.xml;
  logStage(correlationId, 'soap.parse', { response_length: xml.length });

  // Parse summary
  const summary: OrganisationSummary = {
    code: extractValue(xml, 'Code') || extractValue(xml, 'OrganisationCode') || rtoCode,
    legalName: extractValue(xml, 'LegalName') || extractValue(xml, 'Name') || '',
    tradingName: extractValue(xml, 'TradingName'),
    organisationType: extractValue(xml, 'OrganisationType'),
    abn: extractValue(xml, 'ABN'),
    status: extractValue(xml, 'Status'),
    registrationStartDate: extractValue(xml, 'RegistrationStartDate'),
    registrationEndDate: extractValue(xml, 'RegistrationEndDate'),
    phone: extractValue(xml, 'Phone'),
    email: extractValue(xml, 'Email'),
    website: extractValue(xml, 'Website'),
  };

  // Parse contacts
  const contactBlocks = extractMultipleBlocks(xml, 'Contact');
  const contacts: OrganisationContact[] = contactBlocks.map(block => ({
    firstName: extractValue(block, 'FirstName'),
    lastName: extractValue(block, 'LastName'),
    phone: extractValue(block, 'Phone'),
    email: extractValue(block, 'Email'),
    role: extractValue(block, 'Role'),
  }));

  // Parse addresses
  const addressBlocks = extractMultipleBlocks(xml, 'Address');
  const addresses: OrganisationAddress[] = addressBlocks.map(block => ({
    addressType: extractValue(block, 'AddressType'),
    line1: extractValue(block, 'Line1') || extractValue(block, 'AddressLine1'),
    line2: extractValue(block, 'Line2') || extractValue(block, 'AddressLine2'),
    suburb: extractValue(block, 'Suburb'),
    state: extractValue(block, 'State'),
    postcode: extractValue(block, 'Postcode'),
    country: extractValue(block, 'Country'),
  }));

  // Parse scope items
  const scopeBlocks = extractMultipleBlocks(xml, 'RegistrationScopeItem') || extractMultipleBlocks(xml, 'ScopeItem');
  const scopeItems: ScopeItem[] = scopeBlocks.map(block => ({
    code: extractValue(block, 'NrtCode') || extractValue(block, 'Code') || '',
    title: extractValue(block, 'NrtTitle') || extractValue(block, 'Title') || '',
    componentType: extractValue(block, 'TrainingComponentType') || extractValue(block, 'ComponentType') || 'Unknown',
    isImplicit: extractValue(block, 'IsImplicit')?.toLowerCase() === 'true',
    startDate: extractValue(block, 'StartDate'),
    endDate: extractValue(block, 'EndDate'),
    restrictions: extractValue(block, 'Restrictions'),
  }));

  // Categorize scope items
  const qualifications = scopeItems.filter(item => 
    item.componentType.toLowerCase().includes('qualification') ||
    item.code.match(/^[A-Z]{2,4}\d{5}$/)
  );
  const skillSets = scopeItems.filter(item => 
    item.componentType.toLowerCase().includes('skill') ||
    item.code.match(/^[A-Z]{2,4}SS\d{5}$/)
  );
  const units = scopeItems.filter(item => 
    item.componentType.toLowerCase().includes('unit') ||
    item.code.match(/^[A-Z]{4,}\d{3,}$/)
  );

  // Parse accredited courses if present
  const courseBlocks = extractMultipleBlocks(xml, 'AccreditedCourse');
  const courses = courseBlocks.map(block => extractValue(block, 'Code') || '').filter(Boolean);

  logStage(correlationId, 'soap.org_details.parsed', {
    has_summary: !!summary.legalName,
    contacts_count: contacts.length,
    addresses_count: addresses.length,
    scope_items_count: scopeItems.length,
    qualifications_count: qualifications.length,
    skill_sets_count: skillSets.length,
    units_count: units.length,
    courses_count: courses.length,
  });

  return {
    ok: true,
    summary,
    contacts,
    addresses,
    scopeItems,
    qualifications,
    skillSets,
    units,
    courses,
    httpStatus: result.httpStatus,
    endpointUsed: endpoint,
    wsdlUrlUsed: discovery.wsdlUrl,
  };
}

// ============================================================================
// PROBE MODE
// ============================================================================

async function handleProbe(rtoCode: string, correlationId: string): Promise<Response> {
  logStage(correlationId, 'probe.start', { rto_code: rtoCode });

  // Test credentials configured
  const credentialsConfigured = !!(TGA_WS_USERNAME && TGA_WS_PASSWORD);
  if (!credentialsConfigured) {
    return jsonResponse({
      ok: false,
      correlation_id: correlationId,
      stage: 'config.auth_failed',
      error: 'TGA credentials not configured. Set TGA_WS_USERNAME and TGA_WS_PASSWORD.',
      credentials_configured: false,
    });
  }

  // Discover endpoint
  const discovery = await discoverEndpointFromWsdl(correlationId);
  
  if (!discovery.ok) {
    return jsonResponse({
      ok: false,
      correlation_id: correlationId,
      stage: 'config.endpoint_not_found',
      error: discovery.error,
      candidates_tried: discovery.candidatesTried,
      wsdl_ok: false,
      auth_ok: credentialsConfigured,
    });
  }

  // Fetch org details
  const orgResult = await fetchOrganisationDetails(rtoCode, correlationId);

  const hs = orgResult.httpStatus;
  const authOk = hs !== null && hs !== 401 && hs !== 403;
  const endpointOk = hs !== null && hs !== 404;
  const summaryFound = !!orgResult.summary?.legalName;

  logStage(correlationId, 'probe.complete', {
    wsdl_ok: !!discovery.wsdlUrl,
    auth_ok: authOk,
    endpoint_ok: endpointOk,
    summary_found: summaryFound,
    http_status: orgResult.httpStatus,
    endpoint_used: orgResult.endpointUsed,
    wsdl_url_used: orgResult.wsdlUrlUsed,
  });

  // Determine error stage if not ok
  let stage = 'probe.complete';
  if (!orgResult.ok) {
    if (hs === 401 || hs === 403) {
      stage = 'config.auth_failed';
    } else if (hs === 404) {
      stage = 'config.endpoint_not_found';
    } else if (hs === null) {
      stage = 'soap.request.error';
    } else {
      stage = 'soap.request.error';
    }
  }

  return jsonResponse({
    ok: orgResult.ok,
    correlation_id: correlationId,
    stage,
    endpoint_used: orgResult.endpointUsed,
    wsdl_url_used: orgResult.wsdlUrlUsed,
    http_status: orgResult.httpStatus,
    wsdl_ok: !!discovery.wsdlUrl,
    auth_ok: authOk,
    endpoint_ok: endpointOk,
    summary_found: summaryFound,
    org_name: orgResult.summary?.legalName || null,
    error: orgResult.error,
    response_snippet: orgResult.responseSnippet,
  });
}

// ============================================================================
// MAIN HANDLER
// ============================================================================

serve(async (req) => {
  // Generate correlation ID first thing - used throughout
  const correlationId = generateCorrelationId();
  
  // Handle CORS preflight BEFORE any other processing
  if (req.method === 'OPTIONS') {
    return new Response(null, { headers: corsHeaders });
  }

  // Top-level try/catch to ensure we NEVER throw uncaught
  try {
    const url = new URL(req.url);

    logStage(correlationId, 'request.start', {
      method: req.method,
      url: req.url,
    });

    // Validate config at start - return JSON error if missing secrets
    const configCheck = validateConfig();
    if (!configCheck.ok) {
      logStage(correlationId, 'config.missing_secret', { missing: configCheck.missing });
      return jsonResponse({
        ok: false,
        correlation_id: correlationId,
        stage: 'config.missing_secret',
        error: `Missing required secrets: ${configCheck.missing.join(', ')}`,
        missing_secrets: configCheck.missing,
        endpoint_used: null,
        http_status: null,
      });
    }

    // Handle probe mode via GET
    if (req.method === 'GET') {
      const isProbe = url.searchParams.has('probe');
      const rtoCode = url.searchParams.get('rto') || url.searchParams.get('rto_code') || '';

      if (isProbe) {
        if (!rtoCode) {
          return jsonResponse({
            ok: false,
            correlation_id: correlationId,
            stage: 'probe.error',
            error: 'Missing rto or rto_code query parameter',
          }, 400);
        }
        return handleProbe(rtoCode, correlationId);
      }

      // Return status/health
      return jsonResponse({
        ok: true,
        correlation_id: correlationId,
        stage: 'health',
        credentials_configured: !!(TGA_WS_USERNAME && TGA_WS_PASSWORD),
        default_base: DEFAULT_TGA_BASE,
        has_endpoint_override: !!TGA_ORG_ENDPOINT_OVERRIDE,
      });
    }

    // Handle POST - full import or probe
    if (req.method === 'POST') {
      const body = await req.json();
      const { job_id, tenant_id, rto_code, probe } = body;

      logStage(correlationId, 'input.validate', { job_id, tenant_id, rto_code, probe });

      // Probe mode via POST
      if (probe) {
        if (!rto_code) {
          return jsonResponse({
            ok: false,
            correlation_id: correlationId,
            stage: 'probe.error',
            error: 'Missing rto_code in request body',
          }, 400);
        }
        return handleProbe(rto_code, correlationId);
      }

      // Full import mode
      if (!job_id || !tenant_id || !rto_code) {
        return jsonResponse({
          ok: false,
          correlation_id: correlationId,
          stage: 'input.error',
          error: 'Missing required fields: job_id, tenant_id, rto_code',
        }, 400);
      }

      // Create Supabase client
      const supabaseUrl = Deno.env.get('SUPABASE_URL')!;
      const supabaseKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!;
      const supabase = createClient(supabaseUrl, supabaseKey);

      // Update job status to running
      await supabase
        .from('tga_rto_import_jobs')
        .update({ 
          status: 'running', 
          started_at: new Date().toISOString(),
        })
        .eq('id', job_id);

      // ========== FETCH ORGANISATION DETAILS ==========
      const orgResult = await fetchOrganisationDetails(rto_code, correlationId);

      if (!orgResult.ok) {
        // Determine error type
        let stage = 'soap.error';
        if (orgResult.httpStatus === 404) {
          stage = 'config.endpoint_not_found';
        } else if (orgResult.httpStatus === 401 || orgResult.httpStatus === 403) {
          stage = 'config.auth_failed';
        }

        await supabase
          .from('tga_rto_import_jobs')
          .update({
            status: 'failed',
            completed_at: new Date().toISOString(),
            error_message: orgResult.error,
          })
          .eq('id', job_id);

        return jsonResponse({
          ok: false,
          correlation_id: correlationId,
          stage,
          http_status: orgResult.httpStatus,
          endpoint_used: orgResult.endpointUsed,
          wsdl_url_used: orgResult.wsdlUrlUsed,
          error: orgResult.error,
          response_snippet: orgResult.responseSnippet,
        });
      }

      // ========== UPSERT TO DATABASE ==========
      const counts = {
        org: 0,
        contacts: 0,
        addresses: 0,
        qualifications: 0,
        skillsets: 0,
        units: 0,
        courses: 0,
      };

      // Upsert organisation summary
      if (orgResult.summary) {
        logStage(correlationId, 'db.upsert_summary', { rto_code });
        
        const { error: summaryError } = await supabase
          .from('tga_rto_summary')
          .upsert({
            rto_code: orgResult.summary.code,
            tenant_id: tenant_id,
            legal_name: orgResult.summary.legalName,
            trading_name: orgResult.summary.tradingName,
            organisation_type: orgResult.summary.organisationType,
            abn: orgResult.summary.abn,
            status: orgResult.summary.status,
            registration_start_date: orgResult.summary.registrationStartDate,
            registration_end_date: orgResult.summary.registrationEndDate,
            phone: orgResult.summary.phone,
            email: orgResult.summary.email,
            website: orgResult.summary.website,
            fetched_at: new Date().toISOString(),
          }, { onConflict: 'rto_code,tenant_id' });

        if (summaryError) {
          logStage(correlationId, 'db.upsert_summary.error', { error: summaryError.message });
        } else {
          counts.org = 1;
        }
      }

      // Upsert contacts
      if (orgResult.contacts.length > 0) {
        logStage(correlationId, 'db.upsert_contacts', { count: orgResult.contacts.length });
        
        // Delete existing contacts first to handle count changes
        await supabase
          .from('tga_rto_contacts')
          .delete()
          .eq('rto_code', rto_code)
          .eq('tenant_id', tenant_id);
        
        const contactRecords = orgResult.contacts.map((c, idx) => ({
          rto_code: rto_code,
          tenant_id: tenant_id,
          contact_index: idx,
          first_name: c.firstName,
          last_name: c.lastName,
          phone: c.phone,
          email: c.email,
          role: c.role,
        }));

        const { error: contactError } = await supabase
          .from('tga_rto_contacts')
          .insert(contactRecords);

        if (contactError) {
          logStage(correlationId, 'db.upsert_contacts.error', { error: contactError.message });
        } else {
          counts.contacts = orgResult.contacts.length;
        }
      }

      // Upsert addresses
      if (orgResult.addresses.length > 0) {
        logStage(correlationId, 'db.upsert_addresses', { count: orgResult.addresses.length });
        
        // Delete existing addresses first
        await supabase
          .from('tga_rto_addresses')
          .delete()
          .eq('rto_code', rto_code)
          .eq('tenant_id', tenant_id);
        
        const addressRecords = orgResult.addresses.map((a, idx) => ({
          rto_code: rto_code,
          tenant_id: tenant_id,
          address_index: idx,
          address_type: a.addressType,
          line1: a.line1,
          line2: a.line2,
          suburb: a.suburb,
          state: a.state,
          postcode: a.postcode,
          country: a.country,
        }));

        const { error: addrError } = await supabase
          .from('tga_rto_addresses')
          .insert(addressRecords);

        if (addrError) {
          logStage(correlationId, 'db.upsert_addresses.error', { error: addrError.message });
        } else {
          counts.addresses = orgResult.addresses.length;
        }
      }

      // Upsert qualifications
      if (orgResult.qualifications.length > 0) {
        logStage(correlationId, 'db.upsert_qualifications', { count: orgResult.qualifications.length });
        
        const qualRecords = orgResult.qualifications.map(q => ({
          rto_code: rto_code,
          tenant_id: tenant_id,
          qualification_code: q.code,
          title: q.title,
          is_implicit: q.isImplicit,
          start_date: q.startDate,
          end_date: q.endDate,
          restrictions: q.restrictions,
        }));

        const { error: qualError } = await supabase
          .from('tga_scope_qualifications')
          .upsert(qualRecords, { onConflict: 'rto_code,tenant_id,qualification_code' });

        if (qualError) {
          logStage(correlationId, 'db.upsert_qualifications.error', { error: qualError.message });
        } else {
          counts.qualifications = orgResult.qualifications.length;
        }
      }

      // Upsert skill sets
      if (orgResult.skillSets.length > 0) {
        logStage(correlationId, 'db.upsert_skillsets', { count: orgResult.skillSets.length });
        
        const ssRecords = orgResult.skillSets.map(s => ({
          rto_code: rto_code,
          tenant_id: tenant_id,
          skillset_code: s.code,
          title: s.title,
          is_implicit: s.isImplicit,
          start_date: s.startDate,
          end_date: s.endDate,
          restrictions: s.restrictions,
        }));

        const { error: ssError } = await supabase
          .from('tga_scope_skillsets')
          .upsert(ssRecords, { onConflict: 'rto_code,tenant_id,skillset_code' });

        if (ssError) {
          logStage(correlationId, 'db.upsert_skillsets.error', { error: ssError.message });
        } else {
          counts.skillsets = orgResult.skillSets.length;
        }
      }

      // Upsert units
      if (orgResult.units.length > 0) {
        logStage(correlationId, 'db.upsert_units', { count: orgResult.units.length });
        
        const unitRecords = orgResult.units.map(u => ({
          rto_code: rto_code,
          tenant_id: tenant_id,
          unit_code: u.code,
          title: u.title,
          is_implicit: u.isImplicit,
          start_date: u.startDate,
          end_date: u.endDate,
          restrictions: u.restrictions,
        }));

        const { error: unitError } = await supabase
          .from('tga_scope_units')
          .upsert(unitRecords, { onConflict: 'rto_code,tenant_id,unit_code' });

        if (unitError) {
          logStage(correlationId, 'db.upsert_units.error', { error: unitError.message });
        } else {
          counts.units = orgResult.units.length;
        }
      }

      // Upsert courses
      if (orgResult.courses.length > 0) {
        logStage(correlationId, 'db.upsert_courses', { count: orgResult.courses.length });
        
        const courseRecords = orgResult.courses.map(code => ({
          rto_code: rto_code,
          tenant_id: tenant_id,
          course_code: code,
        }));

        const { error: courseError } = await supabase
          .from('tga_scope_courses')
          .upsert(courseRecords, { onConflict: 'rto_code,tenant_id,course_code' });

        if (courseError) {
          logStage(correlationId, 'db.upsert_courses.error', { error: courseError.message });
        } else {
          counts.courses = orgResult.courses.length;
        }
      }

      // Update job status
      await supabase
        .from('tga_rto_import_jobs')
        .update({
          status: 'completed',
          completed_at: new Date().toISOString(),
          summary_fetched: !!orgResult.summary,
          contacts_fetched: counts.contacts > 0,
          addresses_fetched: counts.addresses > 0,
          scope_fetched: counts.qualifications > 0 || counts.skillsets > 0 || counts.units > 0,
          qualifications_count: counts.qualifications,
          skillsets_count: counts.skillsets,
          units_count: counts.units,
          courses_count: counts.courses,
        })
        .eq('id', job_id);

      logStage(correlationId, 'done', {
        message: `Import complete: org:${counts.org}, contacts:${counts.contacts}, addresses:${counts.addresses}, quals:${counts.qualifications}, skillsets:${counts.skillsets}, units:${counts.units}, courses:${counts.courses}`,
      });

      console.log(`[TGA] [${correlationId}] Import complete: { org:${counts.org}, contacts:${counts.contacts}, addresses:${counts.addresses}, quals:${counts.qualifications}, skillsets:${counts.skillsets}, units:${counts.units}, courses:${counts.courses} }`);

      return jsonResponse({
        ok: true,
        correlation_id: correlationId,
        stage: 'done',
        org_name: orgResult.summary?.legalName,
        endpoint_used: orgResult.endpointUsed,
        wsdl_url_used: orgResult.wsdlUrlUsed,
        counts,
      });
    }

    return jsonResponse({
      ok: false,
      correlation_id: correlationId,
      stage: 'error',
      error: `Method ${req.method} not allowed`,
    }, 405);

  } catch (error) {
    const errorMsg = error instanceof Error ? error.message : String(error);
    const errorStack = error instanceof Error ? error.stack : undefined;
    
    console.error(`[TGA] [${correlationId}] STAGE=unhandled.exception error="${errorMsg}"`, errorStack);
    logStage(correlationId, 'unhandled.exception', { 
      error: errorMsg,
      stack_preview: errorStack?.slice(0, 300),
    });

    // Always return 200 with JSON so UI can parse the error
    return jsonResponse({
      ok: false,
      correlation_id: correlationId,
      stage: 'unhandled.exception',
      error: errorMsg,
      endpoint_used: null,
      http_status: null,
    }, 200);
  }
});
