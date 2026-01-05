import "https://deno.land/x/xhr@0.1.0/mod.ts";
import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2.49.4";

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
};

// ============================================================================
// TGA PRODUCTION ENDPOINTS - EXACT MATCH FROM WORKING tga-sync
// Note: Case-sensitive! Must be "WebServices" not "Webservices"
// ============================================================================

const TGA_ORG_ENDPOINT = 'https://ws.training.gov.au/Deewr.Tga.WebServices/OrganisationServiceV13.svc';

// SOAP 1.2 namespace
const SOAP12_NS = 'http://www.w3.org/2003/05/soap-envelope';

// Organisation service namespace - EXACT MATCH from working tga-sync
const ORG_NS = 'http://training.gov.au/services/Organisation';

// ============================================================================
// HELPERS
// ============================================================================

function generateCorrelationId(): string {
  return `tga-${crypto.randomUUID()}`;
}

function logStage(correlationId: string, stage: string, data: Record<string, unknown> = {}) {
  const sanitized: Record<string, unknown> = { correlation_id: correlationId, stage };
  
  for (const [k, v] of Object.entries(data)) {
    // Never log secrets
    if (k.toLowerCase().includes('password') || k.toLowerCase().includes('auth') || k.toLowerCase().includes('token')) {
      continue;
    }
    // Mask username to first 3 chars
    if (k.toLowerCase().includes('username')) {
      const val = String(v);
      sanitized[k] = val.slice(0, 3) + '***';
      continue;
    }
    if (typeof v === 'string' && v.length > 300) {
      sanitized[k] = v.slice(0, 300) + '...';
    } else {
      sanitized[k] = v;
    }
  }
  
  console.log(`[TGA] [${correlationId}] STAGE=${stage}`, JSON.stringify(sanitized));
}

function jsonResponse(body: object, status = 200): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: { ...corsHeaders, 'Content-Type': 'application/json' },
  });
}

// ============================================================================
// CONFIG VALIDATION
// ============================================================================

const TGA_WS_USERNAME = Deno.env.get('TGA_WS_USERNAME');
const TGA_WS_PASSWORD = Deno.env.get('TGA_WS_PASSWORD');
const TGA_TIMEOUT_MS = parseInt(Deno.env.get('TGA_TIMEOUT_MS') || '30000', 10);

interface ConfigValidation {
  ok: boolean;
  missing: string[];
  username_masked: string | null;
}

function validateConfig(): ConfigValidation {
  const missing: string[] = [];
  if (!TGA_WS_USERNAME) missing.push('TGA_WS_USERNAME');
  if (!TGA_WS_PASSWORD) missing.push('TGA_WS_PASSWORD');
  
  return {
    ok: missing.length === 0,
    missing,
    username_masked: TGA_WS_USERNAME ? TGA_WS_USERNAME.slice(0, 3) + '***' : null,
  };
}

function getBasicAuthHeader(): string | null {
  if (!TGA_WS_USERNAME || !TGA_WS_PASSWORD) {
    return null;
  }
  const credentials = btoa(`${TGA_WS_USERNAME}:${TGA_WS_PASSWORD}`);
  return `Basic ${credentials}`;
}

// ============================================================================
// ENDPOINT VALIDATION - Guard against namespace URLs being used as endpoints
// ============================================================================

function isValidEndpoint(url: string): boolean {
  // HARD FAIL if endpoint looks like a namespace (contains /services/ without .svc)
  if (url.includes('training.gov.au/services/') && !url.endsWith('.svc')) {
    return false;
  }
  // Must be a valid HTTPS URL ending in .svc
  if (!url.startsWith('https://') || !url.endsWith('.svc')) {
    return false;
  }
  return true;
}

function normalizeEndpoint(url: string): string {
  // Fix common casing issues - Training.gov.au uses "WebServices" not "Webservices"
  return url
    .replace(/Deewr\.Tga\.Webservices/gi, 'Deewr.Tga.WebServices')
    .replace(/webservices/gi, 'WebServices');
}

function getOrgEndpoint(): string {
  const customEndpoint = Deno.env.get('TGA_ORG_ENDPOINT');
  if (customEndpoint && isValidEndpoint(customEndpoint)) {
    // Always normalize the endpoint to fix casing issues
    return normalizeEndpoint(customEndpoint);
  }
  return TGA_ORG_ENDPOINT;
}

// ============================================================================
// SOAP 1.2 TRANSPORT - EXACT MATCH FROM WORKING tga-sync
// ============================================================================

function buildOrgSoapEnvelope(rtoCode: string): string {
  // Exact envelope structure from working tga-sync
  return `<?xml version="1.0" encoding="utf-8"?>
<soap12:Envelope xmlns:soap12="${SOAP12_NS}" xmlns:org="${ORG_NS}">
  <soap12:Body>
    <org:GetDetails>
      <org:request>
        <org:Code>${rtoCode}</org:Code>
      </org:request>
    </org:GetDetails>
  </soap12:Body>
</soap12:Envelope>`;
}

interface Soap12Result {
  ok: boolean;
  status: number;
  text: string;
  error?: string;
}

async function soap12Request(
  endpointUrl: string,
  xmlBody: string,
  correlationId: string
): Promise<Soap12Result> {
  const authHeader = getBasicAuthHeader();
  if (!authHeader) {
    return { ok: false, status: 0, text: '', error: 'Credentials not configured' };
  }

  logStage(correlationId, 'soap.build', {
    endpoint: endpointUrl,
    body_length: xmlBody.length,
  });

  try {
    const controller = new AbortController();
    const timeoutId = setTimeout(() => controller.abort(), TGA_TIMEOUT_MS);

    logStage(correlationId, 'soap.fetch', { endpoint: endpointUrl });

    const response = await fetch(endpointUrl, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/soap+xml; charset=utf-8',
        'Authorization': authHeader,
        'Accept': 'application/soap+xml, text/xml',
      },
      body: xmlBody,
      signal: controller.signal,
    });

    clearTimeout(timeoutId);

    let text = '';
    try {
      text = await response.text();
    } catch {
      text = '[Failed to read response body]';
    }

    logStage(correlationId, 'soap.response', {
      endpoint: endpointUrl,
      http_status: response.status,
      response_length: text.length,
      response_snippet: text.slice(0, 300),
    });

    return {
      ok: response.ok,
      status: response.status,
      text,
    };
  } catch (err) {
    const errorMsg = err instanceof Error ? err.message : String(err);
    const isTimeout = err instanceof Error && err.name === 'AbortError';
    
    logStage(correlationId, 'soap.error', { endpoint: endpointUrl, error: errorMsg, is_timeout: isTimeout });
    
    return {
      ok: false,
      status: 0,
      text: '',
      error: isTimeout ? `Request timeout after ${TGA_TIMEOUT_MS}ms` : errorMsg,
    };
  }
}

// ============================================================================
// ORGANISATION FETCH
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
  stage: string;
  error?: string;
  responseSnippet?: string;
}

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

async function fetchOrganisationDetails(
  rtoCode: string,
  correlationId: string
): Promise<FetchOrgResult> {
  const endpoint = getOrgEndpoint();
  
  logStage(correlationId, 'soap.org_details', { rto_code: rtoCode, endpoint });

  // Validate endpoint
  if (!isValidEndpoint(endpoint)) {
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
      httpStatus: null,
      endpointUsed: endpoint,
      stage: 'config.invalid_endpoint',
      error: `Invalid endpoint URL: ${endpoint}. Must be HTTPS and end with .svc`,
    };
  }

  const soapBody = buildOrgSoapEnvelope(rtoCode);
  const result = await soap12Request(endpoint, soapBody, correlationId);

  // Handle errors
  if (!result.ok) {
    let stage = 'soap.request.error';
    
    if (result.status === 401 || result.status === 403) {
      stage = 'soap.auth.failed';
    } else if (result.status === 404) {
      stage = 'soap.endpoint.not_found';
    } else if (result.status >= 500) {
      stage = 'soap.server_error';
    } else if (result.status === 0) {
      stage = 'soap.network_error';
    }

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
      httpStatus: result.status || null,
      endpointUsed: endpoint,
      stage,
      error: result.error || `SOAP request failed with status ${result.status}`,
      responseSnippet: result.text.slice(0, 300),
    };
  }

  const xml = result.text;
  logStage(correlationId, 'soap.parse', { response_length: xml.length });

  // Check for SOAP Fault
  if (xml.includes('<Fault') || xml.includes(':Fault>')) {
    const faultMatch = xml.match(/<(?:faultstring|Text|Reason)[^>]*>([^<]+)/i);
    const faultMessage = faultMatch ? faultMatch[1] : 'Unknown SOAP Fault';
    
    logStage(correlationId, 'soap.fault', { fault: faultMessage });
    
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
      httpStatus: result.status,
      endpointUsed: endpoint,
      stage: 'soap.fault',
      error: `SOAP Fault: ${faultMessage}`,
      responseSnippet: xml.slice(0, 300),
    };
  }

  // Check if we got a valid response with organisation data
  if (!xml.includes('LegalName') && !xml.includes('Name>')) {
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
      httpStatus: result.status,
      endpointUsed: endpoint,
      stage: 'soap.parse.error',
      error: 'Response did not contain organisation data',
      responseSnippet: xml.slice(0, 300),
    };
  }

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
    httpStatus: result.status,
    endpointUsed: endpoint,
    stage: 'soap.org_details.success',
  };
}

// ============================================================================
// PROBE HANDLER
// ============================================================================

interface ProbeResult {
  ok: boolean;
  correlation_id: string;
  config_ok: boolean;
  config_missing?: string[];
  endpoint_used: string;
  http_status: number | null;
  response_snippet?: string;
  summary_found: boolean;
  summary?: OrganisationSummary | null;
  stage: string;
  error?: string;
}

async function handleProbe(rtoCode: string, correlationId: string): Promise<ProbeResult> {
  logStage(correlationId, 'probe.start', { rto_code: rtoCode });

  // Check config
  const configResult = validateConfig();
  if (!configResult.ok) {
    return {
      ok: false,
      correlation_id: correlationId,
      config_ok: false,
      config_missing: configResult.missing,
      endpoint_used: getOrgEndpoint(),
      http_status: null,
      summary_found: false,
      stage: 'config.missing_secret',
      error: `Missing secrets: ${configResult.missing.join(', ')}`,
    };
  }

  const result = await fetchOrganisationDetails(rtoCode, correlationId);

  return {
    ok: result.ok,
    correlation_id: correlationId,
    config_ok: true,
    endpoint_used: result.endpointUsed,
    http_status: result.httpStatus,
    response_snippet: result.responseSnippet,
    summary_found: !!result.summary?.legalName,
    summary: result.summary,
    stage: result.stage,
    error: result.error,
  };
}

// ============================================================================
// MAIN HANDLER
// ============================================================================

serve(async (req) => {
  const correlationId = generateCorrelationId();
  
  // CORS preflight
  if (req.method === 'OPTIONS') {
    return new Response(null, { headers: corsHeaders });
  }

  try {
    logStage(correlationId, 'request.start', { method: req.method, url: req.url });

    // Parse URL params
    const url = new URL(req.url);
    const isProbe = url.searchParams.get('probe') === '1' || url.searchParams.get('action') === 'probe';
    const probeRto = url.searchParams.get('rto') || url.searchParams.get('code');

    // Probe mode (no auth required for simple health check)
    if (isProbe && probeRto) {
      const result = await handleProbe(probeRto, correlationId);
      return jsonResponse(result, result.ok ? 200 : 502);
    }

    // Auth check for main operations
    const authHeader = req.headers.get('Authorization');
    if (!authHeader) {
      return jsonResponse({
        ok: false,
        correlation_id: correlationId,
        stage: 'auth.missing',
        error: 'Missing authorization header',
      }, 401);
    }

    const supabaseUrl = Deno.env.get('SUPABASE_URL')!;
    const supabaseKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!;
    const supabase = createClient(supabaseUrl, supabaseKey);

    const token = authHeader.replace('Bearer ', '');
    const { data: { user }, error: authError } = await supabase.auth.getUser(token);
    
    if (authError || !user) {
      return jsonResponse({
        ok: false,
        correlation_id: correlationId,
        stage: 'auth.invalid',
        error: 'Invalid token',
      }, 401);
    }

    // Check config
    const configResult = validateConfig();
    if (!configResult.ok) {
      return jsonResponse({
        ok: false,
        correlation_id: correlationId,
        stage: 'config.missing_secret',
        missing: configResult.missing,
        error: `Missing secrets: ${configResult.missing.join(', ')}`,
      }, 400);
    }

    // Parse request body
    let body: Record<string, unknown> = {};
    if (req.method === 'POST') {
      try {
        body = await req.json();
      } catch {
        body = {};
      }
    }

    const rtoCode = String(body.rto_code || body.rtoCode || probeRto || '');
    const action = String(body.action || url.searchParams.get('action') || 'sync');
    const tenantId = body.tenant_id ? Number(body.tenant_id) : null;

    logStage(correlationId, 'request.parsed', { action, rto_code: rtoCode, tenant_id: tenantId });

    // Handle different actions
    if (action === 'triggerSync' || action === 'sync') {
      if (!rtoCode) {
        return jsonResponse({
          ok: false,
          correlation_id: correlationId,
          stage: 'request.invalid',
          error: 'rto_code is required',
        }, 400);
      }

      // Fetch organisation details
      const result = await fetchOrganisationDetails(rtoCode, correlationId);

      if (!result.ok) {
        return jsonResponse({
          ok: false,
          correlation_id: correlationId,
          stage: result.stage,
          endpoint_used: result.endpointUsed,
          http_status: result.httpStatus,
          response_snippet: result.responseSnippet,
          error: result.error,
        }, 502);
      }

      // Upsert to database if tenant_id provided
      if (tenantId && result.summary) {
        logStage(correlationId, 'db.upsert', { tenant_id: tenantId, rto_code: rtoCode });

        const { error: upsertError } = await supabase
          .from('tga_rto_data')
          .upsert({
            tenant_id: tenantId,
            rto_code: result.summary.code,
            legal_name: result.summary.legalName,
            trading_name: result.summary.tradingName,
            abn: result.summary.abn,
            status: result.summary.status,
            organisation_type: result.summary.organisationType,
            registration_start_date: result.summary.registrationStartDate,
            registration_end_date: result.summary.registrationEndDate,
            phone: result.summary.phone,
            email: result.summary.email,
            website: result.summary.website,
            contacts: result.contacts,
            addresses: result.addresses,
            scope_items: result.scopeItems,
            qualifications_count: result.qualifications.length,
            skill_sets_count: result.skillSets.length,
            units_count: result.units.length,
            fetched_at: new Date().toISOString(),
          }, { onConflict: 'tenant_id' });

        if (upsertError) {
          logStage(correlationId, 'db.error', { error: upsertError.message });
          return jsonResponse({
            ok: false,
            correlation_id: correlationId,
            stage: 'db.upsert.error',
            endpoint_used: result.endpointUsed,
            http_status: result.httpStatus,
            error: `Database error: ${upsertError.message}`,
          }, 500);
        }

        logStage(correlationId, 'db.upsert.success', { tenant_id: tenantId });
      }

      return jsonResponse({
        ok: true,
        correlation_id: correlationId,
        stage: 'sync.complete',
        endpoint_used: result.endpointUsed,
        http_status: result.httpStatus,
        summary: result.summary,
        contacts_count: result.contacts.length,
        addresses_count: result.addresses.length,
        scope_items_count: result.scopeItems.length,
        qualifications_count: result.qualifications.length,
        skill_sets_count: result.skillSets.length,
        units_count: result.units.length,
        courses_count: result.courses.length,
      });
    }

    // Default: status/info
    return jsonResponse({
      ok: true,
      correlation_id: correlationId,
      stage: 'status',
      endpoint_configured: getOrgEndpoint(),
      config_ok: configResult.ok,
      username_masked: configResult.username_masked,
    });

  } catch (err) {
    const errorMessage = err instanceof Error ? err.message : String(err);
    const errorStack = err instanceof Error ? err.stack : undefined;
    
    logStage(correlationId, 'unhandled.exception', { error: errorMessage });
    console.error(`[TGA] [${correlationId}] Unhandled exception:`, errorMessage, errorStack);
    
    return jsonResponse({
      ok: false,
      correlation_id: correlationId,
      stage: 'unhandled.exception',
      endpoint_used: getOrgEndpoint(),
      http_status: null,
      error: errorMessage,
    }, 500);
  }
});
