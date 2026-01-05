import "https://deno.land/x/xhr@0.1.0/mod.ts";
import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2.49.4";

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
};

// ============================================================================
// TGA Production SOAP Endpoints - EXACT URLs from working tga-sync function
// CRITICAL: "WebServices" casing must be uppercase S - this is proven working
// ============================================================================
const TGA_ENDPOINTS = {
  organisation: 'https://ws.training.gov.au/Deewr.Tga.WebServices/OrganisationServiceV13.svc',
  training: 'https://ws.training.gov.au/Deewr.Tga.WebServices/TrainingComponentServiceV13.svc',
};

// Credentials from env (same as tga-sync)
const TGA_WS_USERNAME = Deno.env.get('TGA_WS_USERNAME');
const TGA_WS_PASSWORD = Deno.env.get('TGA_WS_PASSWORD');

// SOAP namespaces - EXACT match with tga-sync
const SOAP_NS = {
  soap: 'http://www.w3.org/2003/05/soap-envelope',
  org: 'http://training.gov.au/services/Organisation',
  tc: 'http://training.gov.au/services/TrainingComponent',
};

// Request timeout
const REQUEST_TIMEOUT_MS = 30000;

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
// SOAP LAYER - DIRECTLY FROM WORKING tga-sync IMPLEMENTATION
// ============================================================================

// Build Basic Auth header - EXACT copy from tga-sync
function getBasicAuthHeader(): string {
  if (!TGA_WS_USERNAME || !TGA_WS_PASSWORD) {
    throw new Error('TGA SOAP credentials not configured');
  }
  const credentials = btoa(`${TGA_WS_USERNAME}:${TGA_WS_PASSWORD}`);
  return `Basic ${credentials}`;
}

// Build SOAP envelope for Organisation service - EXACT copy from tga-sync
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

// Build SOAP envelope for Training Component service - EXACT copy from tga-sync
function buildTCSoapRequest(action: string, body: string): string {
  return `<?xml version="1.0" encoding="utf-8"?>
<soap12:Envelope xmlns:soap12="${SOAP_NS.soap}" xmlns:tc="${SOAP_NS.tc}">
  <soap12:Body>
    <tc:${action}>
      ${body}
    </tc:${action}>
  </soap12:Body>
</soap12:Envelope>`;
}

interface SoapRequestResult {
  ok: boolean;
  xml: string;
  httpStatus: number;
  error?: string;
  responseSnippet?: string;
}

// Make SOAP request - BASED ON tga-sync with added diagnostics for tga-rto-import
async function makeSoapRequest(
  endpoint: string,
  soapAction: string,
  body: string,
  correlationId: string
): Promise<SoapRequestResult> {
  logStage(correlationId, 'soap.request.build', {
    endpoint_used: endpoint,
    soap_action: soapAction,
    body_length: body.length,
  });

  try {
    const controller = new AbortController();
    const timeoutId = setTimeout(() => controller.abort(), REQUEST_TIMEOUT_MS);

    const response = await fetch(endpoint, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/soap+xml; charset=utf-8',
        'Authorization': getBasicAuthHeader(),
      },
      body,
      signal: controller.signal,
    });

    clearTimeout(timeoutId);
    const xmlResponse = await response.text();

    logStage(correlationId, 'soap.fetch', {
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
        responseSnippet: xmlResponse.slice(0, 300),
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
      httpStatus: 0,
      error: isTimeout ? 'Request timed out' : errorMsg,
    };
  }
}

// ============================================================================
// XML PARSING HELPERS - EXACT copy from tga-sync
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

function extractMultiple(xml: string, containerTag: string, itemTag: string): string[] {
  const containerMatch = xml.match(new RegExp(`<(?:a:)?${containerTag}[^>]*>([\\s\\S]*?)<\\/(?:a:)?${containerTag}>`, 'i'));
  if (!containerMatch) return [];
  
  const items: string[] = [];
  const itemPattern = new RegExp(`<(?:a:)?${itemTag}[^>]*>([\\s\\S]*?)<\\/(?:a:)?${itemTag}>`, 'gi');
  let match;
  while ((match = itemPattern.exec(containerMatch[1])) !== null) {
    items.push(match[1]);
  }
  return items;
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
// ORGANISATION DATA FETCHING - USING tga-sync LOGIC
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
  httpStatus: number;
  error?: string;
  responseSnippet?: string;
}

async function fetchOrganisationDetails(rtoCode: string, correlationId: string): Promise<FetchOrgResult> {
  logStage(correlationId, 'soap.org_details', { rto_code: rtoCode });

  // Use EXACT format from tga-sync
  const body = buildOrgSoapRequest('GetDetails', `<org:request><org:Code>${rtoCode}</org:Code></org:request>`);
  const result = await makeSoapRequest(TGA_ENDPOINTS.organisation, 'GetDetails', body, correlationId);

  if (!result.ok) {
    logStage(correlationId, 'soap.org_details.error', {
      error: result.error,
      http_status: result.httpStatus,
      endpoint_used: TGA_ENDPOINTS.organisation,
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
      error: result.error,
      responseSnippet: result.responseSnippet,
    };
  }

  const xml = result.xml;
  logStage(correlationId, 'soap.response.parse', { response_length: xml.length });

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
  };
}

// ============================================================================
// PROBE MODE - Simple diagnostic endpoint
// ============================================================================

async function handleProbe(rtoCode: string, correlationId: string): Promise<Response> {
  logStage(correlationId, 'probe.start', { rto_code: rtoCode });

  // Test WSDL fetch
  let wsdlOk = false;
  try {
    const wsdlUrl = `${TGA_ENDPOINTS.organisation}?wsdl`;
    const wsdlRes = await fetch(wsdlUrl, {
      method: 'GET',
      headers: { Accept: 'text/xml, application/xml' },
    });
    wsdlOk = wsdlRes.status === 200;
    logStage(correlationId, 'probe.wsdl', { wsdl_ok: wsdlOk, http_status: wsdlRes.status });
  } catch (e) {
    logStage(correlationId, 'probe.wsdl.error', { error: String(e) });
  }

  // Test auth by making org details call
  const orgResult = await fetchOrganisationDetails(rtoCode, correlationId);

  const authOk = orgResult.httpStatus !== 401 && orgResult.httpStatus !== 403;
  const endpointOk = orgResult.httpStatus !== 404 && orgResult.httpStatus !== 0;
  const summaryFound = !!orgResult.summary?.legalName;

  logStage(correlationId, 'probe.complete', {
    wsdl_ok: wsdlOk,
    auth_ok: authOk,
    endpoint_ok: endpointOk,
    summary_found: summaryFound,
    http_status: orgResult.httpStatus,
  });

  return jsonResponse({
    ok: orgResult.ok,
    correlation_id: correlationId,
    stage: 'probe.complete',
    endpoint_used: TGA_ENDPOINTS.organisation,
    http_status: orgResult.httpStatus,
    wsdl_ok: wsdlOk,
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
  const correlationId = generateCorrelationId();
  const url = new URL(req.url);

  logStage(correlationId, 'request.start', {
    method: req.method,
    url: req.url,
  });

  // Handle CORS preflight
  if (req.method === 'OPTIONS') {
    return new Response(null, { headers: corsHeaders });
  }

  try {
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
        endpoint: TGA_ENDPOINTS.organisation,
        credentials_configured: !!(TGA_WS_USERNAME && TGA_WS_PASSWORD),
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
        .from('tga_import_jobs')
        .update({ 
          status: 'running', 
          started_at: new Date().toISOString(),
          correlation_id: correlationId,
        })
        .eq('id', job_id);

      // ========== FETCH ORGANISATION DETAILS ==========
      const orgResult = await fetchOrganisationDetails(rto_code, correlationId);

      if (!orgResult.ok) {
        // Determine error type
        let stage = 'soap.error';
        if (orgResult.httpStatus === 404) {
          stage = 'soap.endpoint.error';
        } else if (orgResult.httpStatus === 401 || orgResult.httpStatus === 403) {
          stage = 'soap.auth.error';
        }

        await supabase
          .from('tga_import_jobs')
          .update({
            status: 'failed',
            completed_at: new Date().toISOString(),
            error_message: orgResult.error,
            result_data: {
              correlation_id: correlationId,
              stage,
              http_status: orgResult.httpStatus,
              endpoint_used: TGA_ENDPOINTS.organisation,
              response_snippet: orgResult.responseSnippet,
            },
          })
          .eq('id', job_id);

        return jsonResponse({
          ok: false,
          correlation_id: correlationId,
          stage,
          http_status: orgResult.httpStatus,
          endpoint_used: TGA_ENDPOINTS.organisation,
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
        logStage(correlationId, 'db.upsert_org', { rto_code });
        
        const { error: orgError } = await supabase
          .from('tga_organisations')
          .upsert({
            code: orgResult.summary.code,
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
            tenant_id: tenant_id,
            fetched_at: new Date().toISOString(),
            source_payload: orgResult.summary,
          }, { onConflict: 'code,tenant_id' });

        if (orgError) {
          logStage(correlationId, 'db.upsert_org.error', { error: orgError.message });
        } else {
          counts.org = 1;
        }
      }

      // Upsert contacts
      if (orgResult.contacts.length > 0) {
        logStage(correlationId, 'db.upsert_contacts', { count: orgResult.contacts.length });
        
        const contactRecords = orgResult.contacts.map((c, idx) => ({
          organisation_code: rto_code,
          tenant_id: tenant_id,
          contact_index: idx,
          first_name: c.firstName,
          last_name: c.lastName,
          phone: c.phone,
          email: c.email,
          role: c.role,
        }));

        const { error: contactError } = await supabase
          .from('tga_organisation_contacts')
          .upsert(contactRecords, { onConflict: 'organisation_code,tenant_id,contact_index' });

        if (contactError) {
          logStage(correlationId, 'db.upsert_contacts.error', { error: contactError.message });
        } else {
          counts.contacts = orgResult.contacts.length;
        }
      }

      // Upsert addresses
      if (orgResult.addresses.length > 0) {
        logStage(correlationId, 'db.upsert_addresses', { count: orgResult.addresses.length });
        
        const addressRecords = orgResult.addresses.map((a, idx) => ({
          organisation_code: rto_code,
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
          .from('tga_organisation_addresses')
          .upsert(addressRecords, { onConflict: 'organisation_code,tenant_id,address_index' });

        if (addrError) {
          logStage(correlationId, 'db.upsert_addresses.error', { error: addrError.message });
        } else {
          counts.addresses = orgResult.addresses.length;
        }
      }

      // Upsert scope items (qualifications, skill sets, units)
      if (orgResult.qualifications.length > 0) {
        logStage(correlationId, 'db.upsert_qualifications', { count: orgResult.qualifications.length });
        
        const qualRecords = orgResult.qualifications.map(q => ({
          organisation_code: rto_code,
          tenant_id: tenant_id,
          code: q.code,
          title: q.title,
          component_type: q.componentType,
          is_implicit: q.isImplicit,
          start_date: q.startDate,
          end_date: q.endDate,
          restrictions: q.restrictions,
        }));

        const { error: qualError } = await supabase
          .from('tga_scope_qualifications')
          .upsert(qualRecords, { onConflict: 'organisation_code,tenant_id,code' });

        if (qualError) {
          logStage(correlationId, 'db.upsert_qualifications.error', { error: qualError.message });
        } else {
          counts.qualifications = orgResult.qualifications.length;
        }
      }

      if (orgResult.skillSets.length > 0) {
        logStage(correlationId, 'db.upsert_skillsets', { count: orgResult.skillSets.length });
        
        const ssRecords = orgResult.skillSets.map(s => ({
          organisation_code: rto_code,
          tenant_id: tenant_id,
          code: s.code,
          title: s.title,
          component_type: s.componentType,
          is_implicit: s.isImplicit,
          start_date: s.startDate,
          end_date: s.endDate,
          restrictions: s.restrictions,
        }));

        const { error: ssError } = await supabase
          .from('tga_scope_skillsets')
          .upsert(ssRecords, { onConflict: 'organisation_code,tenant_id,code' });

        if (ssError) {
          logStage(correlationId, 'db.upsert_skillsets.error', { error: ssError.message });
        } else {
          counts.skillsets = orgResult.skillSets.length;
        }
      }

      if (orgResult.units.length > 0) {
        logStage(correlationId, 'db.upsert_units', { count: orgResult.units.length });
        
        const unitRecords = orgResult.units.map(u => ({
          organisation_code: rto_code,
          tenant_id: tenant_id,
          code: u.code,
          title: u.title,
          component_type: u.componentType,
          is_implicit: u.isImplicit,
          start_date: u.startDate,
          end_date: u.endDate,
          restrictions: u.restrictions,
        }));

        const { error: unitError } = await supabase
          .from('tga_scope_units')
          .upsert(unitRecords, { onConflict: 'organisation_code,tenant_id,code' });

        if (unitError) {
          logStage(correlationId, 'db.upsert_units.error', { error: unitError.message });
        } else {
          counts.units = orgResult.units.length;
        }
      }

      // Upsert courses if present
      if (orgResult.courses.length > 0) {
        logStage(correlationId, 'db.upsert_courses', { count: orgResult.courses.length });
        
        const courseRecords = orgResult.courses.map(code => ({
          organisation_code: rto_code,
          tenant_id: tenant_id,
          code,
        }));

        const { error: courseError } = await supabase
          .from('tga_scope_courses')
          .upsert(courseRecords, { onConflict: 'organisation_code,tenant_id,code' });

        if (courseError) {
          logStage(correlationId, 'db.upsert_courses.error', { error: courseError.message });
        } else {
          counts.courses = orgResult.courses.length;
        }
      }

      // Update job as completed
      await supabase
        .from('tga_import_jobs')
        .update({
          status: 'completed',
          completed_at: new Date().toISOString(),
          result_data: {
            correlation_id: correlationId,
            counts,
            org_name: orgResult.summary?.legalName,
          },
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
    logStage(correlationId, 'error.unhandled', { error: errorMsg });

    return jsonResponse({
      ok: false,
      correlation_id: correlationId,
      stage: 'error.unhandled',
      error: errorMsg,
    }, 500);
  }
});
