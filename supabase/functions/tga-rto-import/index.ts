import "https://deno.land/x/xhr@0.1.0/mod.ts";
import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2.49.4";

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
};

// TGA SOAP Endpoints - correct production URLs
const TGA_WS_BASE = Deno.env.get('TGA_WS_BASE') || 'https://ws.training.gov.au';

// NOTE: Some deployments had an env var with wrong casing (Webservices). Normalize to avoid 404.
const RAW_TGA_ORG_ENDPOINT = Deno.env.get('TGA_ORG_ENDPOINT');
const TGA_ORG_ENDPOINT = (RAW_TGA_ORG_ENDPOINT || `${TGA_WS_BASE}/Deewr.Tga.WebServices/OrganisationServiceV13.svc`)
  .replace('Deewr.Tga.Webservices', 'Deewr.Tga.WebServices');

// Production credentials
const TGA_USERNAME = Deno.env.get('TGA_WS_USERNAME') || '';
const TGA_PASSWORD = Deno.env.get('TGA_WS_PASSWORD') || '';

// Retry configuration
const MAX_RETRIES = 2;
const RETRY_DELAYS = [500, 1500];
const REQUEST_TIMEOUT_MS = 30000;

// TGA V13 namespace - CORRECT namespace per WSDL
const TGA_V13_NAMESPACE = 'http://training.gov.au/services/13/';

function generateCorrelationId(): string {
  // human-friendly prefix, stable UUID for correlation
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

// Build SOAP 1.1 envelope with WS-Security using correct V13 namespace
function buildSoapEnvelope(operationBody: string): string {
  const now = new Date();
  const expires = new Date(now.getTime() + 5 * 60 * 1000); // 5 min expiry
  
  const securityHeader = TGA_USERNAME && TGA_PASSWORD ? `
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
  </soap:Header>` : '';

  return `<?xml version="1.0" encoding="utf-8"?>
<soap:Envelope xmlns:soap="http://schemas.xmlsoap.org/soap/envelope/" 
               xmlns:tns="${TGA_V13_NAMESPACE}">${securityHeader}
  <soap:Body>
    ${operationBody}
  </soap:Body>
</soap:Envelope>`;
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

async function makeSoapRequest(
  endpoint: string,
  operation: string,
  body: string,
  correlationId: string
): Promise<SoapResult> {
  if (!TGA_USERNAME || !TGA_PASSWORD) {
    console.error(`[TGA] [${correlationId}] Missing credentials`);
    return { 
      xml: '', 
      error: 'TGA credentials not configured. Set TGA_WS_USERNAME and TGA_WS_PASSWORD.', 
      fault: null,
      correlationId 
    };
  }

  const soapEnvelope = buildSoapEnvelope(body);
  
  let lastError: Error | null = null;
  let lastFault: { faultcode: string | null; faultstring: string | null } | null = null;
  
  // Try each SOAPAction pattern
  for (let actionIdx = 0; actionIdx < SOAP_ACTION_PATTERNS.length; actionIdx++) {
    const soapAction = SOAP_ACTION_PATTERNS[actionIdx](operation);
    
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
        
        const response = await fetch(endpoint, {
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
        const responseText = await response.text();
        
        if (response.ok) {
          console.log(`[TGA] [${correlationId}] Success with action: ${soapAction}, received ${responseText.length} bytes`);
          return { xml: responseText, error: null, fault: null, correlationId, actionUsed: soapAction };
        }
        
        const fault = parseSoapFault(responseText);
        lastFault = fault;
        
        // Log safely (first 500 chars, no credentials)
        console.error(`[TGA] [${correlationId}] SOAP error ${response.status}:`, 
          responseText.substring(0, 500));
        
        // If ActionNotSupported/ContractFilter, try next action pattern
        if (fault.faultcode?.includes('ActionNotSupported') || 
            fault.faultstring?.includes('ContractFilter')) {
          console.log(`[TGA] [${correlationId}] Action mismatch, trying next pattern...`);
          break; // Break retry loop, try next action pattern
        }
        
        // Auth errors - don't retry
        if (fault.faultstring?.includes('Unknown user') || 
            fault.faultstring?.includes('incorrect password') ||
            responseText.includes('InvalidSecurity')) {
          return { 
            xml: '', 
            error: 'TGA authentication failed. Check TGA_WS_USERNAME and TGA_WS_PASSWORD credentials.', 
            fault,
            correlationId 
          };
        }
        
        // Server errors - retry
        if (response.status >= 500 && attempt < MAX_RETRIES) {
          lastError = new Error(`HTTP ${response.status}`);
          continue;
        }
        
        // Non-retryable error
        return { 
          xml: '', 
          error: fault.faultstring || `SOAP request failed: ${response.status} ${response.statusText}`, 
          fault,
          correlationId 
        };
        
      } catch (error) {
        console.error(`[TGA] [${correlationId}] Request error:`, error);
        
        if (error instanceof Error && error.name === 'AbortError') {
          lastError = new Error('Request timed out');
        } else {
          lastError = error instanceof Error ? error : new Error(String(error));
        }
        
        // Network errors - retry
        if (attempt < MAX_RETRIES) {
          continue;
        }
      }
    }
  }
  
  // All action patterns failed
  const errorMsg = lastFault?.faultstring || lastError?.message || 'Request failed after all action patterns';
  console.error(`[TGA] [${correlationId}] All SOAP action patterns failed: ${errorMsg}`);
  
  return { 
    xml: '', 
    error: errorMsg, 
    fault: lastFault,
    correlationId 
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
}> {
  // Use correct V13 namespace for operation elements
  const body = `<tns:GetOrganisation>
      <tns:code>${escapeXml(rtoCode)}</tns:code>
    </tns:GetOrganisation>`;
  
  console.log(`[TGA] [${correlationId}] Fetching org details for RTO ${rtoCode} from ${TGA_ORG_ENDPOINT}`);
  
  const result = await makeSoapRequest(TGA_ORG_ENDPOINT, 'GetOrganisation', body, correlationId);
  
  if (result.error) {
    return { 
      summary: null, 
      contacts: [], 
      addresses: [], 
      deliveryLocations: [], 
      error: result.error,
      correlationId 
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
    correlationId
  };
}

// Fetch scope using GetOrganisationScope
async function fetchOrganisationScope(rtoCode: string, correlationId: string): Promise<{
  qualifications: Record<string, unknown>[];
  skillsets: Record<string, unknown>[];
  units: Record<string, unknown>[];
  courses: Record<string, unknown>[];
  error: string | null;
}> {
  const body = `<tns:GetOrganisationScope>
      <tns:code>${escapeXml(rtoCode)}</tns:code>
    </tns:GetOrganisationScope>`;
  
  console.log(`[TGA] [${correlationId}] Fetching scope for RTO ${rtoCode}`);
  
  const result = await makeSoapRequest(TGA_ORG_ENDPOINT, 'GetOrganisationScope', body, correlationId);
  
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

serve(async (req) => {
  const correlationId = generateCorrelationId();
  
  if (req.method === 'OPTIONS') {
    return new Response(null, { headers: corsHeaders });
  }

  // Handle probe request for testing (GET with ?probe=1)
  const url = new URL(req.url);
  if (req.method === 'GET' && url.searchParams.get('probe') === '1') {
    const rto = url.searchParams.get('rto') || '91020';
    
    console.log(`[TGA] [${correlationId}] Probe request for RTO ${rto}`);
    
    try {
      const authHeader = req.headers.get('Authorization');
      if (!authHeader) {
        return new Response(JSON.stringify({ error: 'Missing authorization' }), {
          status: 401,
          headers: { ...corsHeaders, 'Content-Type': 'application/json' },
        });
      }

      const supabaseUrl = Deno.env.get('SUPABASE_URL')!;
      const supabaseKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!;
      const supabase = createClient(supabaseUrl, supabaseKey);

      const token = authHeader.replace('Bearer ', '');
      const { data: { user }, error: authError } = await supabase.auth.getUser(token);
      
      if (authError || !user) {
        return new Response(JSON.stringify({ error: 'Invalid token' }), {
          status: 401,
          headers: { ...corsHeaders, 'Content-Type': 'application/json' },
        });
      }

      // Check if SuperAdmin or Admin
      const { data: userProfile } = await supabase
        .from('users')
        .select('global_role')
        .eq('user_uuid', user.id)
        .single();

      if (userProfile?.global_role !== 'SuperAdmin' && userProfile?.global_role !== 'Admin') {
        return new Response(JSON.stringify({ error: 'Admin access required' }), {
          status: 403,
          headers: { ...corsHeaders, 'Content-Type': 'application/json' },
        });
      }

      const result = await fetchOrganisationDetails(rto, correlationId);
      
      return new Response(JSON.stringify({
        success: !result.error,
        probe: true,
        correlation_id: correlationId,
        rto_code: rto,
        endpoint: TGA_ORG_ENDPOINT,
        namespace: TGA_V13_NAMESPACE,
        summary: result.summary,
        contacts_count: result.contacts.length,
        addresses_count: result.addresses.length,
        error: result.error
      }), {
        status: result.error ? 500 : 200,
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      });
      
    } catch (error) {
      console.error(`[TGA] [${correlationId}] Probe error:`, error);
      return new Response(JSON.stringify({ 
        error: error instanceof Error ? error.message : 'Probe failed',
        correlation_id: correlationId
      }), {
        status: 500,
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      });
    }
  }

  try {
    const authHeader = req.headers.get('Authorization');
    if (!authHeader) {
      return new Response(JSON.stringify({ error: 'Missing authorization' }), {
        status: 401,
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      });
    }

    const supabaseUrl = Deno.env.get('SUPABASE_URL')!;
    const supabaseKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!;
    const supabase = createClient(supabaseUrl, supabaseKey);

    const token = authHeader.replace('Bearer ', '');
    const { data: { user }, error: authError } = await supabase.auth.getUser(token);
    
    if (authError || !user) {
      return new Response(JSON.stringify({
        ok: false,
        correlation_id: correlationId,
        stage: 'auth.resolve',
        error_code: 'auth.invalid_token',
        message: 'Invalid token',
        details: {}
      }), {
        status: 401,
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      });
    }

    // Check if SuperAdmin or Admin
    const { data: userProfile } = await supabase
      .from('users')
      .select('global_role')
      .eq('user_uuid', user.id)
      .single();

    const isAdmin = userProfile?.global_role === 'SuperAdmin' || userProfile?.global_role === 'Admin';
    if (!isAdmin) {
      return new Response(JSON.stringify({
        ok: false,
        correlation_id: correlationId,
        stage: 'auth.resolve',
        error_code: 'auth.forbidden',
        message: 'Admin access required',
        details: {}
      }), {
        status: 403,
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      });
    }

    const { job_id, tenant_id, rto_code, probe } = await req.json();

    if (!job_id || !tenant_id || !rto_code) {
      return new Response(JSON.stringify({
        ok: false,
        correlation_id: correlationId,
        stage: 'input.validate',
        error_code: 'input.missing_fields',
        message: 'job_id, tenant_id, and rto_code required',
        details: { required: ['job_id', 'tenant_id', 'rto_code'] }
      }), {
        status: 400,
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      });
    }

    // Probe mode (POST body.probe === true): SOAP-only org details, no DB writes.
    if (probe === true) {
      console.log(`[TGA] [${correlationId}] Probe request (POST) for RTO ${rto_code}`);
      const orgResult = await fetchOrganisationDetails(rto_code, correlationId);
      if (orgResult.error) {
        return new Response(JSON.stringify({
          ok: false,
          correlation_id: correlationId,
          stage: 'soap.org_details',
          error_code: orgResult.error.includes('auth') ? 'tga.auth_error' : 'tga.soap_error',
          message: orgResult.error,
          details: {}
        }), {
          status: 502,
          headers: { ...corsHeaders, 'Content-Type': 'application/json' },
        });
      }
      return new Response(JSON.stringify({
        ok: true,
        correlation_id: correlationId,
        rto_number: rto_code,
        imported: { org: orgResult.summary ? 1 : 0 },
        summary: orgResult.summary,
        contacts_count: orgResult.contacts.length,
        addresses_count: orgResult.addresses.length,
        delivery_locations_count: orgResult.deliveryLocations.length,
      }), {
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      });
    }

    console.log(`[TGA] [${correlationId}] Starting import for tenant ${tenant_id}, RTO ${rto_code}, job ${job_id}`);

    // Mark job as running
    await supabase
      .from('tga_rto_import_jobs')
      .update({ status: 'running', started_at: new Date().toISOString() })
      .eq('id', job_id);

    let errorMessage: string | null = null;
    let errorStage: string = 'init';
    let errorCode: string = 'tga.unknown_error';
    const now = new Date().toISOString();

    // Helper to log audit event
    const logAudit = async (action: string, details: Record<string, unknown>) => {
      try {
        await supabase.from('client_audit_log').insert({
          tenant_id,
          entity_type: 'tga_sync',
          entity_id: job_id,
          action,
          actor_user_id: user.id,
          details: { ...details, correlation_id: correlationId, rto_code }
        });
      } catch (e) {
        console.warn(`[TGA] [${correlationId}] Failed to log audit:`, e);
      }
    };

    try {
      // Log sync start
      await logAudit('sync_started', { stage: 'init' });

      // 1. Fetch organisation details
      errorStage = 'org_details';
      console.log(`[TGA] [${correlationId}] Stage: ${errorStage}`);
      const orgResult = await fetchOrganisationDetails(rto_code, correlationId);
      
      if (orgResult.error) {
        errorCode = orgResult.error.includes('auth') ? 'tga.auth_error' : 'tga.soap_error';
        throw new Error(orgResult.error);
      }

      // Upsert summary
      errorStage = 'db_upsert_summary';
      if (orgResult.summary) {
        console.log(`[TGA] [${correlationId}] Stage: ${errorStage} - upserting summary`);
        const { error: summaryErr } = await supabase.from('tga_rto_summary').upsert({
          tenant_id,
          rto_code,
          ...orgResult.summary,
          source_payload: orgResult.summary,
          fetched_at: now,
          updated_at: now,
        }, { onConflict: 'tenant_id,rto_code' });
        if (summaryErr) {
          errorCode = 'db_error';
          throw new Error(`Failed to upsert summary: ${summaryErr.message}`);
        }
      }

      // Delete old contacts and insert new
      errorStage = 'db_upsert_contacts';
      await supabase.from('tga_rto_contacts').delete().eq('tenant_id', tenant_id).eq('rto_code', rto_code);
      if (orgResult.contacts.length > 0) {
        console.log(`[TGA] [${correlationId}] Stage: ${errorStage} - inserting ${orgResult.contacts.length} contacts`);
        const { error: contactsErr } = await supabase.from('tga_rto_contacts').insert(
          orgResult.contacts.map(c => ({
            tenant_id,
            rto_code,
            ...c,
            source_payload: c,
            fetched_at: now,
          }))
        );
        if (contactsErr) {
          errorCode = 'db_error';
          throw new Error(`Failed to insert contacts: ${contactsErr.message}`);
        }
      }

      // Delete old addresses and insert new
      errorStage = 'db_upsert_addresses';
      await supabase.from('tga_rto_addresses').delete().eq('tenant_id', tenant_id).eq('rto_code', rto_code);
      if (orgResult.addresses.length > 0) {
        console.log(`[TGA] [${correlationId}] Stage: ${errorStage} - inserting ${orgResult.addresses.length} addresses`);
        const { error: addrErr } = await supabase.from('tga_rto_addresses').insert(
          orgResult.addresses.map(a => ({
            tenant_id,
            rto_code,
            ...a,
            source_payload: a,
            fetched_at: now,
          }))
        );
        if (addrErr) {
          errorCode = 'db_error';
          throw new Error(`Failed to insert addresses: ${addrErr.message}`);
        }
      }

      // Delete old delivery locations and insert new
      errorStage = 'db_upsert_locations';
      await supabase.from('tga_rto_delivery_locations').delete().eq('tenant_id', tenant_id).eq('rto_code', rto_code);
      if (orgResult.deliveryLocations.length > 0) {
        console.log(`[TGA] [${correlationId}] Stage: ${errorStage} - inserting ${orgResult.deliveryLocations.length} delivery locations`);
        const { error: locErr } = await supabase.from('tga_rto_delivery_locations').insert(
          orgResult.deliveryLocations.map(l => ({
            tenant_id,
            rto_code,
            ...l,
            source_payload: l,
            fetched_at: now,
          }))
        );
        if (locErr) {
          errorCode = 'db_error';
          throw new Error(`Failed to insert delivery locations: ${locErr.message}`);
        }
      }

      // Update job progress
      await supabase.from('tga_rto_import_jobs').update({
        summary_fetched: true,
        contacts_fetched: true,
        addresses_fetched: true,
      }).eq('id', job_id);

      // 2. Fetch scope
      errorStage = 'scope';
      console.log(`[TGA] [${correlationId}] Stage: ${errorStage}`);
      const scopeResult = await fetchOrganisationScope(rto_code, correlationId);

      // Delete old scope data and insert new (only if we got results)
      if (!scopeResult.error) {
        errorStage = 'db_upsert_qualifications';
        await supabase.from('tga_scope_qualifications').delete().eq('tenant_id', tenant_id).eq('rto_code', rto_code);
        if (scopeResult.qualifications.length > 0) {
          console.log(`[TGA] [${correlationId}] Stage: ${errorStage} - inserting ${scopeResult.qualifications.length} qualifications`);
          const { error: qualErr } = await supabase.from('tga_scope_qualifications').insert(
            scopeResult.qualifications.map(q => ({
              tenant_id,
              rto_code,
              ...q,
              source_payload: q,
              fetched_at: now,
            }))
          );
          if (qualErr) {
            errorCode = 'db_error';
            throw new Error(`Failed to insert qualifications: ${qualErr.message}`);
          }
        }

        errorStage = 'db_upsert_skillsets';
        await supabase.from('tga_scope_skillsets').delete().eq('tenant_id', tenant_id).eq('rto_code', rto_code);
        if (scopeResult.skillsets.length > 0) {
          console.log(`[TGA] [${correlationId}] Stage: ${errorStage} - inserting ${scopeResult.skillsets.length} skillsets`);
          const { error: skillErr } = await supabase.from('tga_scope_skillsets').insert(
            scopeResult.skillsets.map(s => ({
              tenant_id,
              rto_code,
              ...s,
              source_payload: s,
              fetched_at: now,
            }))
          );
          if (skillErr) {
            errorCode = 'db_error';
            throw new Error(`Failed to insert skillsets: ${skillErr.message}`);
          }
        }

        errorStage = 'db_upsert_units';
        await supabase.from('tga_scope_units').delete().eq('tenant_id', tenant_id).eq('rto_code', rto_code);
        if (scopeResult.units.length > 0) {
          console.log(`[TGA] [${correlationId}] Stage: ${errorStage} - inserting ${scopeResult.units.length} units`);
          const { error: unitErr } = await supabase.from('tga_scope_units').insert(
            scopeResult.units.map(u => ({
              tenant_id,
              rto_code,
              ...u,
              source_payload: u,
              fetched_at: now,
            }))
          );
          if (unitErr) {
            errorCode = 'db_error';
            throw new Error(`Failed to insert units: ${unitErr.message}`);
          }
        }

        errorStage = 'db_upsert_courses';
        await supabase.from('tga_scope_courses').delete().eq('tenant_id', tenant_id).eq('rto_code', rto_code);
        if (scopeResult.courses.length > 0) {
          console.log(`[TGA] [${correlationId}] Stage: ${errorStage} - inserting ${scopeResult.courses.length} courses`);
          const { error: courseErr } = await supabase.from('tga_scope_courses').insert(
            scopeResult.courses.map(c => ({
              tenant_id,
              rto_code,
              ...c,
              source_payload: c,
              fetched_at: now,
            }))
          );
          if (courseErr) {
            errorCode = 'db_error';
            throw new Error(`Failed to insert courses: ${courseErr.message}`);
          }
        }

        await supabase.from('tga_rto_import_jobs').update({
          qualifications_fetched: true,
          skillsets_fetched: true,
          units_fetched: true,
          courses_fetched: true,
          qualifications_count: scopeResult.qualifications.length,
          skillsets_count: scopeResult.skillsets.length,
          units_count: scopeResult.units.length,
          courses_count: scopeResult.courses.length,
        }).eq('id', job_id);
      } else {
        console.warn(`[TGA] [${correlationId}] Scope fetch failed (non-fatal): ${scopeResult.error}`);
      }

      // Mark job complete
      errorStage = 'finalize';
      await supabase.from('tga_rto_import_jobs').update({
        status: 'completed',
        completed_at: new Date().toISOString(),
      }).eq('id', job_id);

      console.log(`[TGA] [${correlationId}] Import completed successfully`);

      // Log sync success
      await logAudit('sync_completed', {
        stage: 'finalize',
        summary: orgResult.summary,
        contacts_count: orgResult.contacts.length,
        addresses_count: orgResult.addresses.length,
        qualifications_count: scopeResult.qualifications.length,
        skillsets_count: scopeResult.skillsets.length,
        units_count: scopeResult.units.length,
        courses_count: scopeResult.courses.length,
      });

      return new Response(JSON.stringify({ 
        ok: true, 
        correlation_id: correlationId,
        client_id: tenant_id,
        rto_number: rto_code,
        job_id,
        imported: {
          summary: orgResult.summary ? 1 : 0,
          contacts: orgResult.contacts.length,
          addresses: orgResult.addresses.length,
          delivery_locations: orgResult.deliveryLocations.length,
          qualifications: scopeResult.qualifications.length,
          skillsets: scopeResult.skillsets.length,
          units: scopeResult.units.length,
          courses: scopeResult.courses.length,
        }
      }), {
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      });

    } catch (importError) {
      errorMessage = importError instanceof Error ? importError.message : String(importError);
      console.error(`[TGA] [${correlationId}] Import error at stage '${errorStage}':`, importError);

      // Mark job as failed
      await supabase.from('tga_rto_import_jobs').update({
        status: 'failed',
        error_message: `${errorMessage} (Stage: ${errorStage}, Ref: ${correlationId})`,
        completed_at: new Date().toISOString(),
      }).eq('id', job_id);

      // Log sync failure
      await logAudit('sync_failed', {
        stage: errorStage,
        error_code: errorCode,
        error_message: errorMessage,
      });

      console.log(`[TGA] [${correlationId}] Job ${job_id} failed at stage '${errorStage}'`);

      return new Response(JSON.stringify({ 
        ok: false,
        correlation_id: correlationId,
        stage: errorStage,
        error_code: errorCode,
        message: errorMessage,
        details: {
          job_id,
          tenant_id,
          rto_code,
          hint: errorCode === 'tga.auth_error' 
            ? 'Check TGA credentials in secrets' 
            : errorCode === 'db_error'
            ? 'Database operation failed - check RLS policies'
            : 'Check edge function logs for more details'
        }
      }), {
        status: errorCode === 'tga.auth_error' ? 401 : 500,
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      });
    }

  } catch (error) {
    console.error(`[TGA] [${correlationId}] Handler error:`, error);
    return new Response(JSON.stringify({
      ok: false,
      correlation_id: correlationId,
      stage: 'handler',
      error_code: 'tga.handler_error',
      message: error instanceof Error ? error.message : 'Unknown error',
      details: {}
    }), {
      status: 500,
      headers: { ...corsHeaders, 'Content-Type': 'application/json' },
    });
  }
});
