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
const TGA_TIMEOUT_MS = parseInt(getSecret(['TGA_TIMEOUT_MS']) || '30000', 10);

// Direct endpoints - matching working tga-sync implementation (uppercase WebServices)
// Fallback list in order of preference
const ORG_ENDPOINTS = [
  'https://ws.training.gov.au/Deewr.Tga.Webservices/OrganisationServiceV13.svc',
  'https://ws.training.gov.au/Deewr.Tga.Webservices/OrganisationService.svc',
];

// SOAP namespaces - two variants to try in order
const SOAP_NS_VARIANTS = [
  { org: 'http://training.gov.au/services/Organisation' },
  { org: 'http://training.gov.au/services/13/OrganisationService' },
];

const SOAP12_NS = 'http://www.w3.org/2003/05/soap-envelope';

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
// CONFIG VALIDATION
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

// ============================================================================
// SOAP LAYER - Direct endpoints, no WSDL discovery
// ============================================================================

function buildOrgSoapEnvelope(orgNs: string, rtoCode: string): string {
  return `<?xml version="1.0" encoding="utf-8"?>
<soap12:Envelope xmlns:soap12="${SOAP12_NS}" xmlns:org="${orgNs}">
  <soap12:Body>
    <org:GetDetails>
      <org:request>
        <org:Code>${rtoCode}</org:Code>
      </org:request>
    </org:GetDetails>
  </soap12:Body>
</soap12:Envelope>`;
}

interface SoapCallResult {
  ok: boolean;
  xml: string;
  httpStatus: number | null;
  endpointUsed: string | null;
  namespaceUsed: string | null;
  error?: string;
  responseSnippet?: string;
}

async function callOrgService(rtoCode: string, correlationId: string): Promise<SoapCallResult> {
  const authHeader = getBasicAuthHeader();
  if (!authHeader) {
    return {
      ok: false,
      xml: '',
      httpStatus: null,
      endpointUsed: null,
      namespaceUsed: null,
      error: 'TGA credentials not configured (username or password missing)',
    };
  }

  const attemptedEndpoints: string[] = [];
  
  // Try each endpoint with each namespace variant
  for (const endpoint of ORG_ENDPOINTS) {
    for (const nsVariant of SOAP_NS_VARIANTS) {
      attemptedEndpoints.push(`${endpoint} (ns: ${nsVariant.org})`);
      
      const soapBody = buildOrgSoapEnvelope(nsVariant.org, rtoCode);
      
      logStage(correlationId, 'soap.build', {
        endpoint,
        namespace: nsVariant.org,
        body_length: soapBody.length,
      });

      try {
        const controller = new AbortController();
        const timeoutId = setTimeout(() => controller.abort(), TGA_TIMEOUT_MS);

        logStage(correlationId, 'soap.fetch', { endpoint });

        const response = await fetch(endpoint, {
          method: 'POST',
          headers: {
            'Content-Type': 'application/soap+xml; charset=utf-8',
            'Authorization': authHeader,
          },
          body: soapBody,
          signal: controller.signal,
        });

        clearTimeout(timeoutId);

        let xmlResponse = '';
        try {
          xmlResponse = await response.text();
        } catch {
          xmlResponse = '[Failed to read response body]';
        }

        logStage(correlationId, 'soap.response', {
          endpoint,
          http_status: response.status,
          response_length: xmlResponse.length,
          response_snippet: xmlResponse.slice(0, 300),
        });

        // 401/403 = auth failed, stop trying
        if (response.status === 401 || response.status === 403) {
          return {
            ok: false,
            xml: xmlResponse,
            httpStatus: response.status,
            endpointUsed: endpoint,
            namespaceUsed: nsVariant.org,
            error: `Authentication failed: ${response.status} ${response.statusText}`,
            responseSnippet: xmlResponse.slice(0, 500),
          };
        }

        // 404 = endpoint not found, try next
        if (response.status === 404) {
          logStage(correlationId, 'soap.404', { endpoint, trying_next: true });
          continue;
        }

        // 500+ = server error, try next endpoint
        if (response.status >= 500) {
          logStage(correlationId, 'soap.server_error', { endpoint, http_status: response.status });
          continue;
        }

        // Check for SOAP Fault
        if (xmlResponse.includes('<Fault') || xmlResponse.includes(':Fault>')) {
          // Extract fault message
          const faultMatch = xmlResponse.match(/<(?:faultstring|Text|Reason)[^>]*>([^<]+)/i);
          const faultMessage = faultMatch ? faultMatch[1] : 'Unknown SOAP Fault';
          
          logStage(correlationId, 'soap.fault', { endpoint, fault: faultMessage });
          
          // Try next namespace variant (same endpoint)
          continue;
        }

        // Success!
        if (response.ok) {
          logStage(correlationId, 'soap.parse', {
            endpoint,
            namespace: nsVariant.org,
            response_length: xmlResponse.length,
          });
          
          return {
            ok: true,
            xml: xmlResponse,
            httpStatus: response.status,
            endpointUsed: endpoint,
            namespaceUsed: nsVariant.org,
          };
        }

        // Other non-2xx status
        return {
          ok: false,
          xml: xmlResponse,
          httpStatus: response.status,
          endpointUsed: endpoint,
          namespaceUsed: nsVariant.org,
          error: `SOAP request failed: ${response.status} ${response.statusText}`,
          responseSnippet: xmlResponse.slice(0, 500),
        };

      } catch (err) {
        const errorMsg = err instanceof Error ? err.message : String(err);
        const isTimeout = err instanceof Error && err.name === 'AbortError';
        
        logStage(correlationId, 'soap.error', { endpoint, error: errorMsg, is_timeout: isTimeout });
        
        // Continue to next endpoint/namespace on network errors
        continue;
      }
    }
  }

  // All endpoints failed
  return {
    ok: false,
    xml: '',
    httpStatus: 404,
    endpointUsed: attemptedEndpoints.join('; '),
    namespaceUsed: null,
    error: `All TGA endpoints failed. Tried: ${attemptedEndpoints.join(', ')}`,
  };
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
  endpointUsed: string | null;
  stage: string;
  error?: string;
  responseSnippet?: string;
}

async function fetchOrganisationDetails(
  rtoCode: string,
  correlationId: string
): Promise<FetchOrgResult> {
  logStage(correlationId, 'soap.org_details', { rto_code: rtoCode });

  // Call the org service directly (no WSDL discovery)
  const result = await callOrgService(rtoCode, correlationId);

  if (!result.ok) {
    // Determine stage based on error type
    let stage = 'soap.request.error';
    if (result.httpStatus === 401 || result.httpStatus === 403) {
      stage = 'config.auth_failed';
    } else if (result.httpStatus === 404) {
      stage = 'soap.endpoint.not_found';
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
      httpStatus: result.httpStatus,
      endpointUsed: result.endpointUsed,
      stage,
      error: result.error,
      responseSnippet: result.responseSnippet,
    };
  }

  const xml = result.xml;
  logStage(correlationId, 'soap.parse', { response_length: xml.length });

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
      httpStatus: result.httpStatus,
      endpointUsed: result.endpointUsed,
      stage: 'soap.parse.error',
      error: 'Response did not contain organisation data',
      responseSnippet: xml.slice(0, 500),
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
    httpStatus: result.httpStatus,
    endpointUsed: result.endpointUsed,
    stage: 'done',
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
      http_status: null,
      endpoint_used: null,
    });
  }

  // Fetch org details directly
  const orgResult = await fetchOrganisationDetails(rtoCode, correlationId);

  const hs = orgResult.httpStatus;
  const authOk = hs !== null && hs !== 401 && hs !== 403;
  const endpointOk = hs !== null && hs !== 404;
  const summaryFound = !!orgResult.summary?.legalName;

  logStage(correlationId, 'probe.complete', {
    auth_ok: authOk,
    endpoint_ok: endpointOk,
    summary_found: summaryFound,
    http_status: orgResult.httpStatus,
    endpoint_used: orgResult.endpointUsed,
    stage: orgResult.stage,
  });

  return jsonResponse({
    ok: orgResult.ok,
    correlation_id: correlationId,
    stage: orgResult.stage,
    endpoint_used: orgResult.endpointUsed,
    http_status: orgResult.httpStatus,
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
      }, 400);
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
            endpoint_used: null,
            http_status: null,
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
        endpoints: ORG_ENDPOINTS,
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
            endpoint_used: null,
            http_status: null,
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
          endpoint_used: null,
          http_status: null,
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
          stage: orgResult.stage,
          http_status: orgResult.httpStatus,
          endpoint_used: orgResult.endpointUsed,
          error: orgResult.error,
          response_snippet: orgResult.responseSnippet,
        }, 502);
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

      // Update job status to completed
      await supabase
        .from('tga_rto_import_jobs')
        .update({
          status: 'completed',
          completed_at: new Date().toISOString(),
          records_fetched: 1,
          records_inserted: counts.org + counts.contacts + counts.addresses + 
                           counts.qualifications + counts.skillsets + counts.units + counts.courses,
        })
        .eq('id', job_id);

      logStage(correlationId, 'done', { counts });

      return jsonResponse({
        ok: true,
        correlation_id: correlationId,
        stage: 'done',
        endpoint_used: orgResult.endpointUsed,
        http_status: orgResult.httpStatus,
        counts,
        org_name: orgResult.summary?.legalName,
      });
    }

    // Unsupported method
    return jsonResponse({
      ok: false,
      correlation_id: correlationId,
      stage: 'error',
      error: `Unsupported method: ${req.method}`,
      endpoint_used: null,
      http_status: null,
    }, 405);

  } catch (err) {
    // Unhandled exception - return JSON, never crash
    const errorMsg = err instanceof Error ? err.message : String(err);
    const errorStack = err instanceof Error ? err.stack : undefined;
    
    console.error(`[TGA] [${correlationId}] UNHANDLED EXCEPTION:`, errorMsg, errorStack);
    
    logStage(correlationId, 'unhandled.exception', { error: errorMsg });
    
    return jsonResponse({
      ok: false,
      correlation_id: correlationId,
      stage: 'unhandled.exception',
      error: errorMsg,
      endpoint_used: null,
      http_status: null,
    }, 500);
  }
});
