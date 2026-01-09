import "https://deno.land/x/xhr@0.1.0/mod.ts";
import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2.49.4";

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Methods': 'POST, GET, OPTIONS',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type, x-action',
};

// TGA Production SOAP Endpoints - WCF basicHttpBinding (SOAP 1.1)
// Per TGA Web Services Specification v13r1
// IMPORTANT: V13 is NOT in the URL path - it's only in the SOAP namespace
// - OrganisationService uses 'WebServices' (capital S)
// - TrainingComponentService uses 'Webservices' (lowercase s)
// - ClassificationService uses 'Webservices' (lowercase s)
const TGA_ENV = Deno.env.get('TGA_ENV') || 'prod';
const TGA_BASE_HOST = TGA_ENV === 'sandbox' 
  ? 'ws.sandbox.training.gov.au' 
  : 'ws.training.gov.au';

// Endpoints do NOT include V13 in the service name - V13 is only in SOAP namespace
const TGA_ENDPOINTS = {
  // OrganisationService uses WebServices (capital S)
  organisation: `https://${TGA_BASE_HOST}/Deewr.Tga.WebServices/OrganisationService.svc`,
  // TrainingComponentService uses Webservices (lowercase s)
  training: `https://${TGA_BASE_HOST}/Deewr.Tga.Webservices/TrainingComponentService.svc`,
  classification: `https://${TGA_BASE_HOST}/Deewr.Tga.Webservices/ClassificationService.svc`,
};

// TGA V13 namespace - per WSDL
const TGA_V13_NAMESPACE = 'http://training.gov.au/services/13/';

// SOAP action patterns to try (ordered by likelihood)
const SOAP_ACTIONS = {
  // Organisation service - use V13 namespace with I prefix
  getOrganisationDetails: `${TGA_V13_NAMESPACE}IOrganisationService/GetOrganisation`,
  searchOrganisation: `${TGA_V13_NAMESPACE}IOrganisationService/SearchOrganisation`,
  // Training component service
  getTrainingComponentDetails: `${TGA_V13_NAMESPACE}ITrainingComponentService/GetDetails`,
  searchTrainingComponent: `${TGA_V13_NAMESPACE}ITrainingComponentService/Search`,
};

const FUNCTION_VERSION = '1.0.8';

// Credentials loaded from Supabase secrets (try new names first, fall back to old)
const TGA_WS_USERNAME = Deno.env.get('TGA_USERNAME') || Deno.env.get('TGA_WS_USERNAME');
const TGA_WS_PASSWORD = Deno.env.get('TGA_PASSWORD') || Deno.env.get('TGA_WS_PASSWORD');

// SOAP namespaces per TGA Web Services Specification
// Using SOAP 1.1 (basicHttpBinding) with WS-Security
const SOAP_NS = {
  soap11: 'http://schemas.xmlsoap.org/soap/envelope/',
  wsse: 'http://docs.oasis-open.org/wss/2004/01/oasis-200401-wss-wssecurity-secext-1.0.xsd',
  wsu: 'http://docs.oasis-open.org/wss/2004/01/oasis-200401-wss-wssecurity-utility-1.0.xsd',
  tns: TGA_V13_NAMESPACE,
};

// XML escape helper
function escapeXml(unsafe: string): string {
  return unsafe
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&apos;');
}

// Log helper (redacts sensitive data)
function log(level: 'info' | 'warn' | 'error', message: string, data?: Record<string, unknown>) {
  const sanitized = data ? { ...data } : {};
  // Never log passwords or full credentials
  delete sanitized.password;
  delete sanitized.credentials;
  delete sanitized.auth;
  console.log(`[TGA-SYNC] [${level.toUpperCase()}] ${message}`, JSON.stringify(sanitized));
}

// Validate credentials are configured
function validateCredentials(): { valid: boolean; error?: string } {
  if (!TGA_WS_USERNAME) {
    return { valid: false, error: 'TGA_WS_USERNAME secret not configured' };
  }
  if (!TGA_WS_PASSWORD) {
    return { valid: false, error: 'TGA_WS_PASSWORD secret not configured' };
  }
  // Validate username format (should be an email for TGA)
  if (!TGA_WS_USERNAME.includes('@')) {
    log('warn', 'TGA_WS_USERNAME may not be in correct format (expected email)');
  }
  return { valid: true };
}

// Build WS-Security header for SOAP envelope (per TGA WSDL)
function buildWsSecurityHeader(): string {
  const validation = validateCredentials();
  if (!validation.valid) {
    throw new Error(validation.error || 'TGA credentials not configured');
  }
  
  const now = new Date();
  const expires = new Date(now.getTime() + 5 * 60 * 1000); // 5 minutes
  
  return `
    <wsse:Security xmlns:wsse="${SOAP_NS.wsse}" xmlns:wsu="${SOAP_NS.wsu}">
      <wsu:Timestamp wsu:Id="Timestamp-${Date.now()}">
        <wsu:Created>${now.toISOString()}</wsu:Created>
        <wsu:Expires>${expires.toISOString()}</wsu:Expires>
      </wsu:Timestamp>
      <wsse:UsernameToken wsu:Id="UsernameToken-${Date.now()}">
        <wsse:Username>${escapeXml(TGA_WS_USERNAME!)}</wsse:Username>
        <wsse:Password Type="http://docs.oasis-open.org/wss/2004/01/oasis-200401-wss-username-token-profile-1.0#PasswordText">${escapeXml(TGA_WS_PASSWORD!)}</wsse:Password>
      </wsse:UsernameToken>
    </wsse:Security>`;
}

// Compute deterministic hash for source data
function computeSourceHash(data: Record<string, unknown>): string {
  const str = JSON.stringify(data, Object.keys(data).sort());
  let hash = 0;
  for (let i = 0; i < str.length; i++) {
    const char = str.charCodeAt(i);
    hash = ((hash << 5) - hash) + char;
    hash = hash & hash;
  }
  return Math.abs(hash).toString(16);
}

// Simple XML parser helpers
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

// Build SOAP 1.1 envelope with WS-Security for Organisation service
function buildOrgSoapRequest(action: string, body: string): string {
  return `<?xml version="1.0" encoding="utf-8"?>
<soap:Envelope xmlns:soap="${SOAP_NS.soap11}" xmlns:tns="${SOAP_NS.tns}">
  <soap:Header>
    ${buildWsSecurityHeader()}
  </soap:Header>
  <soap:Body>
    <tns:${action}>
      ${body}
    </tns:${action}>
  </soap:Body>
</soap:Envelope>`;
}

// Build SOAP 1.1 envelope with WS-Security for Training Component service
function buildTCSoapRequest(action: string, body: string): string {
  return `<?xml version="1.0" encoding="utf-8"?>
<soap:Envelope xmlns:soap="${SOAP_NS.soap11}" xmlns:tns="${SOAP_NS.tns}">
  <soap:Header>
    ${buildWsSecurityHeader()}
  </soap:Header>
  <soap:Body>
    <tns:${action}>
      ${body}
    </tns:${action}>
  </soap:Body>
</soap:Envelope>`;
}

// Make SOAP request with enhanced error handling and detailed logging
async function makeSoapRequest(endpoint: string, soapAction: string, body: string): Promise<string> {
  const startTime = Date.now();
  
  // Build request details for logging
  const requestDetails = {
    endpoint,
    soapAction,
    method: 'POST',
    soapVersion: '1.1',
    contentType: 'text/xml; charset=utf-8',
    bodyLength: body.length,
    bodyPreview: body.substring(0, 200) + '...',
  };
  
  log('info', 'SOAP request starting', requestDetails);
  
  try {
    // SOAP 1.1 uses text/xml and SOAPAction header
    // WS-Security is included in the SOAP envelope itself, not as HTTP header
    const headers: Record<string, string> = {
      'Content-Type': 'text/xml; charset=utf-8',
      'SOAPAction': `"${soapAction}"`,
      'Accept': 'text/xml',
      'User-Agent': 'Unicorn2.0/1.0',
    };
    
    log('info', 'Request headers prepared', {
      contentType: headers['Content-Type'],
      soapAction: headers['SOAPAction'],
      wsSecurityIncluded: true,
    });
    
    const response = await fetch(endpoint, {
      method: 'POST',
      headers,
      body,
    });

    const duration = Date.now() - startTime;
    const responseText = await response.text();
    
    // Log response details (truncated for security)
    const responseDetails = {
      status: response.status,
      statusText: response.statusText,
      duration,
      responseLength: responseText.length,
      responsePreview: responseText.substring(0, 300),
      headers: {
        contentType: response.headers.get('content-type'),
        server: response.headers.get('server'),
      },
    };
    
    log('info', 'SOAP response received', responseDetails);

    if (!response.ok) {
      // Parse specific error types
      let errorDetail = `HTTP ${response.status}`;
      
      if (response.status === 404) {
        errorDetail = `HTTP 404 - Endpoint not found. URL: ${endpoint}, Service: ${soapAction.split('/').pop()}`;
        log('error', 'TGA endpoint not found (404)', {
          endpoint,
          soapAction,
          soapVersion: '1.1',
          hint: 'URL should NOT include V13 in path. V13 is only in SOAP namespace.',
          responsePreview: responseText.substring(0, 300),
          duration,
        });
      } else if (response.status === 401) {
        errorDetail = 'Authentication failed - check TGA_WS_USERNAME and TGA_WS_PASSWORD secrets';
        log('error', 'TGA authentication failed', { status: 401, duration });
      } else if (response.status === 403) {
        errorDetail = 'Access denied - account may not have Web Services Read permission';
        log('error', 'TGA access denied', { status: 403, duration });
      } else if (response.status === 415) {
        errorDetail = 'Unsupported Media Type - Content-Type or SOAP version mismatch';
        log('error', 'TGA content type rejected', { 
          status: 415, 
          contentTypeSent: headers['Content-Type'],
          soapVersion: '1.1',
          duration 
        });
      } else if (responseText.includes('Fault')) {
        // Extract SOAP fault message
        const faultMatch = responseText.match(/<(?:a:)?Text[^>]*>([^<]+)<\/(?:a:)?Text>/i) ||
                          responseText.match(/<faultstring[^>]*>([^<]+)<\/faultstring>/i);
        if (faultMatch) {
          errorDetail = faultMatch[1];
        }
        log('error', 'SOAP fault received', { status: response.status, fault: errorDetail, duration });
      } else {
        log('error', 'SOAP request failed', { 
          status: response.status, 
          statusText: response.statusText, 
          responsePreview: responseText.substring(0, 300),
          duration 
        });
      }
      
      throw new Error(`TGA API error: ${errorDetail}`);
    }

    log('info', 'SOAP request successful', { 
      endpoint, 
      action: soapAction, 
      responseLength: responseText.length,
      duration 
    });
    
    return responseText;
  } catch (error: unknown) {
    const duration = Date.now() - startTime;
    const errorMsg = error instanceof Error ? error.message : String(error);
    
    // Network errors
    if (errorMsg.includes('fetch') || errorMsg.includes('network') || errorMsg.includes('connect')) {
      log('error', 'Network error connecting to TGA', { 
        error: errorMsg, 
        endpoint,
        duration 
      });
      throw new Error('Cannot connect to TGA Web Services - check network connectivity');
    }
    
    // Re-throw with enhanced context if not already a TGA API error
    if (!errorMsg.includes('TGA API error')) {
      log('error', 'Unexpected error in SOAP request', {
        error: errorMsg,
        endpoint,
        soapAction,
        duration,
      });
    }
    
    throw error;
  }
}

// Parse training component from XML
interface ParsedTrainingComponent {
  code: string;
  title: string;
  componentType: string;
  trainingPackageCode: string | null;
  trainingPackageTitle: string | null;
  status: string | null;
  releaseNumber: string | null;
  releaseDate: string | null;
  currencyStatus: string | null;
  supersededBy: string | null;
  isCurrent: boolean;
  usageRecommendation: string | null;
  nominalHours: number | null;
}

function parseTrainingComponent(xml: string): ParsedTrainingComponent | null {
  const code = extractValue(xml, 'Code');
  const title = extractValue(xml, 'Title');
  
  if (!code || !title) return null;

  return {
    code,
    title,
    componentType: extractValue(xml, 'ComponentType') || 'unknown',
    trainingPackageCode: extractValue(xml, 'TrainingPackageCode'),
    trainingPackageTitle: extractValue(xml, 'TrainingPackageTitle'),
    status: extractValue(xml, 'Status'),
    releaseNumber: extractValue(xml, 'ReleaseNumber'),
    releaseDate: extractValue(xml, 'ReleaseDate'),
    currencyStatus: extractValue(xml, 'CurrencyStatus'),
    supersededBy: extractValue(xml, 'SupersededByCode'),
    isCurrent: extractValue(xml, 'IsCurrent')?.toLowerCase() === 'true',
    usageRecommendation: extractValue(xml, 'UsageRecommendation'),
    nominalHours: extractValue(xml, 'NominalHours') ? parseFloat(extractValue(xml, 'NominalHours')!) : null,
  };
}

// Parse organisation from XML
interface ParsedOrganisation {
  code: string;
  legalName: string;
  tradingName: string | null;
  organisationType: string | null;
  abn: string | null;
  status: string | null;
  registrationStartDate: string | null;
  registrationEndDate: string | null;
  addressLine1: string | null;
  suburb: string | null;
  state: string | null;
  postcode: string | null;
  country: string | null;
  phone: string | null;
  email: string | null;
  website: string | null;
}

function parseOrganisation(xml: string): ParsedOrganisation | null {
  const code = extractValue(xml, 'Code') || extractValue(xml, 'OrganisationCode');
  const legalName = extractValue(xml, 'LegalName') || extractValue(xml, 'Name');
  
  if (!code || !legalName) return null;

  return {
    code,
    legalName,
    tradingName: extractValue(xml, 'TradingName'),
    organisationType: extractValue(xml, 'OrganisationType'),
    abn: extractValue(xml, 'ABN'),
    status: extractValue(xml, 'Status'),
    registrationStartDate: extractValue(xml, 'RegistrationStartDate'),
    registrationEndDate: extractValue(xml, 'RegistrationEndDate'),
    addressLine1: extractValue(xml, 'AddressLine1') || extractValue(xml, 'Line1'),
    suburb: extractValue(xml, 'Suburb'),
    state: extractValue(xml, 'State'),
    postcode: extractValue(xml, 'Postcode'),
    country: extractValue(xml, 'Country'),
    phone: extractValue(xml, 'Phone'),
    email: extractValue(xml, 'Email'),
    website: extractValue(xml, 'Website'),
  };
}

// Fetch training component by code
async function fetchTrainingComponent(code: string): Promise<{ data: ParsedTrainingComponent | null; raw: string; error: string | null }> {
  try {
    const body = buildTCSoapRequest('GetDetails', `<tns:code>${escapeXml(code)}</tns:code>`);
    const response = await makeSoapRequest(
      TGA_ENDPOINTS.training, 
      SOAP_ACTIONS.getTrainingComponentDetails, 
      body
    );
    
    const parsed = parseTrainingComponent(response);
    return { data: parsed, raw: response, error: parsed ? null : 'Could not parse response' };
  } catch (error: unknown) {
    console.error(`[TGA] Error fetching ${code}:`, error);
    return { data: null, raw: '', error: error instanceof Error ? error.message : String(error) };
  }
}

// Fetch organisation by code
async function fetchOrganisation(code: string): Promise<{ data: ParsedOrganisation | null; raw: string; error: string | null }> {
  try {
    // Use TGA V13 namespace format for GetOrganisation operation
    const body = buildOrgSoapRequest('GetOrganisation', `<tns:code>${escapeXml(code)}</tns:code>`);
    const response = await makeSoapRequest(
      TGA_ENDPOINTS.organisation, 
      SOAP_ACTIONS.getOrganisationDetails, 
      body
    );
    
    const parsed = parseOrganisation(response);
    return { data: parsed, raw: response, error: parsed ? null : 'Could not parse response' };
  } catch (error: unknown) {
    console.error(`[TGA] Error fetching org ${code}:`, error);
    return { data: null, raw: '', error: error instanceof Error ? error.message : String(error) };
  }
}

// Search training components by modified date (for delta sync)
async function searchByModifiedDate(since: Date, componentType?: string): Promise<{ data: ParsedTrainingComponent[]; error: string | null }> {
  try {
    const sinceStr = since.toISOString().split('T')[0];
    const typeFilter = componentType ? `<tc:ComponentType>${componentType}</tc:ComponentType>` : '';
    
    const body = buildTCSoapRequest('Search', `
      <tc:request>
        <tc:ModifiedSince>${sinceStr}</tc:ModifiedSince>
        ${typeFilter}
        <tc:PageNumber>1</tc:PageNumber>
        <tc:PageSize>1000</tc:PageSize>
      </tc:request>
    `);
    
    const response = await makeSoapRequest(
      TGA_ENDPOINTS.training, 
      SOAP_ACTIONS.searchTrainingComponent, 
      body
    );
    const items = extractMultiple(response, 'TrainingComponents', 'TrainingComponent');
    
    const parsed = items
      .map(item => parseTrainingComponent(item))
      .filter((p): p is ParsedTrainingComponent => p !== null);
    
    console.log(`[TGA] Found ${parsed.length} modified components since ${sinceStr}`);
    return { data: parsed, error: null };
  } catch (error: unknown) {
    console.error('[TGA] Search error:', error);
    return { data: [], error: error instanceof Error ? error.message : String(error) };
  }
}

// Test connection with comprehensive validation
async function testConnection(): Promise<{ 
  success: boolean; 
  message: string; 
  details?: {
    username?: string;
    endpoint?: string;
    testCode?: string;
    testResult?: string;
    timestamp?: string;
  }
}> {
  log('info', 'Testing TGA connection', { 
    username: TGA_WS_USERNAME ? `${TGA_WS_USERNAME.substring(0, 5)}...` : 'NOT_SET',
    endpoint: TGA_ENDPOINTS.training 
  });
  
  // Step 1: Validate credentials are configured
  const credValidation = validateCredentials();
  if (!credValidation.valid) {
    log('error', 'Credential validation failed', { error: credValidation.error });
    return { 
      success: false, 
      message: credValidation.error || 'Credentials not configured',
      details: {
        username: TGA_WS_USERNAME ? 'configured' : 'missing',
        timestamp: new Date().toISOString()
      }
    };
  }
  
  // Step 2: Try to fetch a known training component (BSB30120 - Certificate III in Business)
  const testCode = 'BSB30120';
  try {
    log('info', 'Attempting test fetch', { testCode });
    const result = await fetchTrainingComponent(testCode);
    
    if (result.data) {
      log('info', 'TGA connection test successful', { 
        testCode, 
        title: result.data.title 
      });
      return { 
        success: true, 
        message: `Connected successfully. Verified with: ${result.data.title}`,
        details: {
          username: TGA_WS_USERNAME,
          endpoint: TGA_ENDPOINTS.training,
          testCode,
          testResult: result.data.title,
          timestamp: new Date().toISOString()
        }
      };
    }
    
    log('warn', 'TGA connection succeeded but parse failed', { error: result.error });
    return { 
      success: false, 
      message: result.error || 'Connected but could not parse response',
      details: {
        username: TGA_WS_USERNAME,
        testCode,
        timestamp: new Date().toISOString()
      }
    };
  } catch (error: unknown) {
    const errorMsg = error instanceof Error ? error.message : String(error);
    log('error', 'TGA connection test failed', { error: errorMsg });
    return { 
      success: false, 
      message: errorMsg,
      details: {
        username: TGA_WS_USERNAME,
        endpoint: TGA_ENDPOINTS.training,
        testCode,
        timestamp: new Date().toISOString()
      }
    };
  }
}

serve(async (req) => {
  // Handle CORS preflight
  if (req.method === 'OPTIONS') {
    return new Response(null, { status: 200, headers: corsHeaders });
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
      return new Response(JSON.stringify({ error: 'Invalid token' }), {
        status: 401,
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      });
    }

    // Check if SuperAdmin
    const { data: userProfile } = await supabase
      .from('users')
      .select('global_role')
      .eq('user_uuid', user.id)
      .single();

    const isSuperAdmin = userProfile?.global_role === 'SuperAdmin';

    // Parse request body for action (preferred) or fall back to query param
    let requestBody: Record<string, unknown> = {};
    if (req.method === 'POST') {
      try {
        requestBody = await req.json();
      } catch {
        // Body may be empty for some actions
      }
    }

    const url = new URL(req.url);
    // Read action from body first, then query param, default to 'status'
    const action = (requestBody.action as string) || url.searchParams.get('action') || 'status';
    
    log('info', 'Request received', { action, method: req.method, userId: user.id });

    // Ping action - returns version, config, and confirms TGA host is reachable
    if (action === 'ping') {
      const pingResult: Record<string, unknown> = {
        success: true,
        version: FUNCTION_VERSION,
        timestamp: new Date().toISOString(),
        environment: TGA_ENV,
        config: {
          baseHost: TGA_BASE_HOST,
          endpoints: TGA_ENDPOINTS,
          credentialsConfigured: !!(TGA_WS_USERNAME && TGA_WS_PASSWORD),
          usernameFormat: TGA_WS_USERNAME?.includes('@') ? 'email' : 'unknown',
        },
      };

      // Probe TGA endpoint reachability with GET request
      try {
        const probeUrl = TGA_ENDPOINTS.organisation;
        log('info', 'Probing TGA endpoint', { url: probeUrl });
        const pingStart = Date.now();
        const pingResponse = await fetch(probeUrl, {
          method: 'GET',
          headers: { 'Accept': 'text/html' },
        });
        pingResult.probe = {
          url: probeUrl,
          reachable: true,
          status: pingResponse.status,
          statusText: pingResponse.statusText,
          pingMs: Date.now() - pingStart,
        };
        log('info', 'TGA probe result', pingResult.probe as Record<string, unknown>);
      } catch (pingError: unknown) {
        pingResult.probe = {
          url: TGA_ENDPOINTS.organisation,
          reachable: false,
          error: pingError instanceof Error ? pingError.message : String(pingError),
        };
        log('warn', 'TGA probe failed', pingResult.probe as Record<string, unknown>);
      }

      return new Response(JSON.stringify(pingResult), {
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      });
    }

    // Health check / test connection
    if (action === 'test' || action === 'health') {
      if (!isSuperAdmin) {
        return new Response(JSON.stringify({ error: 'SuperAdmin access required' }), {
          status: 403,
          headers: { ...corsHeaders, 'Content-Type': 'application/json' },
        });
      }

      const result = await testConnection();
      
      // Update sync status
      await supabase
        .from('tga_sync_status')
        .update({
          connection_status: result.success ? 'connected' : 'error',
          last_health_check_at: new Date().toISOString(),
          last_health_check_result: result,
        })
        .eq('id', 1);

      return new Response(JSON.stringify(result), {
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      });
    }

    // Probe a code (read-only, no DB write)
    if (action === 'probe') {
      if (!isSuperAdmin) {
        return new Response(JSON.stringify({ error: 'SuperAdmin access required' }), {
          status: 403,
          headers: { ...corsHeaders, 'Content-Type': 'application/json' },
        });
      }

      const code = url.searchParams.get('code');
      const type = url.searchParams.get('type') || 'training';
      
      if (!code) {
        return new Response(JSON.stringify({ error: 'code parameter required' }), {
          status: 400,
          headers: { ...corsHeaders, 'Content-Type': 'application/json' },
        });
      }

      let result;
      if (type === 'organisation' || type === 'org') {
        result = await fetchOrganisation(code);
      } else {
        result = await fetchTrainingComponent(code);
      }

      return new Response(JSON.stringify({
        code,
        type,
        found: result.data !== null,
        data: result.data,
        raw: result.raw.substring(0, 2000),
        error: result.error,
      }), {
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      });
    }

    // Live sync for a specific client/RTO
    if (action === 'sync-client') {
      // Use requestBody already parsed above (don't re-parse req.json())
      const { client_id, rto_number, tenant_id } = requestBody as { client_id?: string; rto_number?: string; tenant_id?: string };
      
      if (!rto_number) {
        return new Response(JSON.stringify({ error: 'rto_number required' }), {
          status: 400,
          headers: { ...corsHeaders, 'Content-Type': 'application/json' },
        });
      }

      log('info', 'Starting live client sync', { rto_number, client_id, tenant_id });

      try {
        // Fetch RTO details via SOAP
        const orgResult = await fetchOrganisation(rto_number);
        
        if (!orgResult.data) {
          // Update link status to indicate not found
          if (client_id) {
            await supabase
              .from('tga_links')
              .upsert({
                client_id,
                rto_number,
                is_linked: false,
                link_status: 'not_found',
                last_sync_at: new Date().toISOString(),
                last_sync_status: 'failed',
                last_sync_error: orgResult.error || 'RTO not found in TGA registry',
                updated_at: new Date().toISOString(),
              }, { onConflict: 'client_id' });
          }
          
          return new Response(JSON.stringify({
            success: false,
            error: orgResult.error || 'RTO not found in TGA registry',
            rto_number,
          }), {
            headers: { ...corsHeaders, 'Content-Type': 'application/json' },
          });
        }

        // We got RTO data - upsert to tga_rtos for local cache
        await supabase
          .from('tga_rtos')
          .upsert({
            rto_number: orgResult.data.code,
            legal_name: orgResult.data.legalName,
            trading_name: orgResult.data.tradingName,
            abn: orgResult.data.abn,
            status: orgResult.data.status,
            registration_start: orgResult.data.registrationStartDate,
            registration_end: orgResult.data.registrationEndDate,
            phone: orgResult.data.phone,
            email: orgResult.data.email,
            website: orgResult.data.website,
            updated_at: new Date().toISOString(),
          }, { onConflict: 'rto_number' });

        // Update link status
        let linkId = null;
        if (client_id) {
          const { data: linkData } = await supabase
            .from('tga_links')
            .upsert({
              client_id,
              rto_number,
              is_linked: true,
              link_status: 'linked',
              last_sync_at: new Date().toISOString(),
              last_sync_status: 'success',
              last_sync_error: null,
              updated_at: new Date().toISOString(),
            }, { onConflict: 'client_id' })
            .select('id')
            .single();
          
          linkId = linkData?.id;
        }

        // Audit log
        if (tenant_id) {
          await supabase.from('client_audit_log').insert({
            tenant_id: parseInt(tenant_id),
            entity_type: 'tga_integration',
            entity_id: client_id || rto_number,
            action: 'live_sync_completed',
            actor_user_id: user.id,
            details: {
              rto_number,
              legal_name: orgResult.data.legalName,
              status: orgResult.data.status,
            },
          });
        }

        log('info', 'Live client sync completed', { 
          rto_number, 
          legalName: orgResult.data.legalName 
        });

        return new Response(JSON.stringify({
          success: true,
          rto_number,
          link_id: linkId,
          rto_data: {
            legal_name: orgResult.data.legalName,
            trading_name: orgResult.data.tradingName,
            abn: orgResult.data.abn,
            status: orgResult.data.status,
            registration_start: orgResult.data.registrationStartDate,
            registration_end: orgResult.data.registrationEndDate,
            phone: orgResult.data.phone,
            email: orgResult.data.email,
            website: orgResult.data.website,
          },
        }), {
          headers: { ...corsHeaders, 'Content-Type': 'application/json' },
        });
      } catch (error: unknown) {
        const errorMsg = error instanceof Error ? error.message : String(error);
        
        // Extract status code from error message if present
        const statusMatch = errorMsg.match(/HTTP (\d+)/);
        const upstreamStatus = statusMatch ? parseInt(statusMatch[1]) : null;
        
        log('error', 'Live client sync failed', { 
          error: errorMsg, 
          rto_number,
          endpoint: TGA_ENDPOINTS.organisation,
          upstreamStatus,
        });
        
        // Update link with error
        if (client_id) {
          await supabase
            .from('tga_links')
            .upsert({
              client_id,
              rto_number,
              is_linked: false,
              link_status: 'error',
              last_sync_at: new Date().toISOString(),
              last_sync_status: 'failed',
              last_sync_error: errorMsg,
              updated_at: new Date().toISOString(),
            }, { onConflict: 'client_id' });
        }
        
        return new Response(JSON.stringify({
          success: false,
          error: errorMsg,
          rto_number,
          endpoint: TGA_ENDPOINTS.organisation,
          status: upstreamStatus,
        }), {
          status: 500,
          headers: { ...corsHeaders, 'Content-Type': 'application/json' },
        });
      }
    }

    // Run sync job
    if (action === 'sync') {
      if (!isSuperAdmin) {
        return new Response(JSON.stringify({ error: 'SuperAdmin access required' }), {
          status: 403,
          headers: { ...corsHeaders, 'Content-Type': 'application/json' },
        });
      }

      const body = await req.json();
      const { job_id, job_type, codes, delta_since } = body;

      if (!job_id) {
        return new Response(JSON.stringify({ error: 'job_id required' }), {
          status: 400,
          headers: { ...corsHeaders, 'Content-Type': 'application/json' },
        });
      }

      // Mark job as running
      await supabase
        .from('tga_sync_jobs')
        .update({ status: 'running', started_at: new Date().toISOString() })
        .eq('id', job_id);

      let recordsFetched = 0;
      let recordsInserted = 0;
      let recordsUpdated = 0;
      let recordsUnchanged = 0;
      let recordsFailed = 0;
      let errorMessage: string | null = null;

      try {
        // If specific codes provided
        if (codes && Array.isArray(codes) && codes.length > 0) {
          for (const code of codes) {
            const result = await fetchTrainingComponent(code);
            recordsFetched++;

            if (!result.data) {
              recordsFailed++;
              continue;
            }

            const sourceHash = computeSourceHash(result.data as unknown as Record<string, unknown>);
            const isUnit = result.data.componentType === 'Unit' || result.data.componentType === 'UnitOfCompetency';
            
            // Check existing
            const table = isUnit ? 'tga_units' : 'tga_training_products';
            const { data: existing } = await supabase
              .from(table)
              .select('id, source_hash')
              .eq('code', code)
              .single();

            if (existing && existing.source_hash === sourceHash) {
              recordsUnchanged++;
              continue;
            }

            // Upsert
            const record = isUnit ? {
              code: result.data.code,
              title: result.data.title,
              usage_recommendation: result.data.usageRecommendation,
              training_package_code: result.data.trainingPackageCode,
              training_package_title: result.data.trainingPackageTitle,
              status: result.data.status,
              release_number: result.data.releaseNumber,
              release_date: result.data.releaseDate,
              currency_status: result.data.currencyStatus,
              superseded_by: result.data.supersededBy,
              is_current: result.data.isCurrent,
              nominal_hours: result.data.nominalHours,
              source_hash: sourceHash,
              source_payload: result.data,
              fetched_at: new Date().toISOString(),
            } : {
              code: result.data.code,
              title: result.data.title,
              product_type: result.data.componentType.toLowerCase().includes('skill') ? 'skillset' : 'qualification',
              training_package_code: result.data.trainingPackageCode,
              training_package_title: result.data.trainingPackageTitle,
              status: result.data.status,
              release_number: result.data.releaseNumber,
              release_date: result.data.releaseDate,
              currency_status: result.data.currencyStatus,
              superseded_by: result.data.supersededBy,
              is_current: result.data.isCurrent,
              source_hash: sourceHash,
              source_payload: result.data,
              fetched_at: new Date().toISOString(),
            };

            const { error: upsertError } = await supabase
              .from(table)
              .upsert(record, { onConflict: 'code' });

            if (upsertError) {
              console.error(`[TGA] Upsert error for ${code}:`, upsertError);
              recordsFailed++;
            } else if (existing) {
              recordsUpdated++;
            } else {
              recordsInserted++;
            }
          }
        }
        // Delta sync
        else if (job_type === 'delta' && delta_since) {
          const sinceDate = new Date(delta_since);
          const { data: modified, error: searchError } = await searchByModifiedDate(sinceDate);
          
          if (searchError) {
            throw new Error(searchError);
          }

          for (const item of modified) {
            recordsFetched++;
            const sourceHash = computeSourceHash(item as unknown as Record<string, unknown>);
            const isUnit = item.componentType === 'Unit' || item.componentType === 'UnitOfCompetency';
            const table = isUnit ? 'tga_units' : 'tga_training_products';

            const { data: existing } = await supabase
              .from(table)
              .select('id, source_hash')
              .eq('code', item.code)
              .single();

            if (existing && existing.source_hash === sourceHash) {
              recordsUnchanged++;
              continue;
            }

            const record = isUnit ? {
              code: item.code,
              title: item.title,
              usage_recommendation: item.usageRecommendation,
              training_package_code: item.trainingPackageCode,
              training_package_title: item.trainingPackageTitle,
              status: item.status,
              release_number: item.releaseNumber,
              release_date: item.releaseDate,
              currency_status: item.currencyStatus,
              superseded_by: item.supersededBy,
              is_current: item.isCurrent,
              nominal_hours: item.nominalHours,
              source_hash: sourceHash,
              source_payload: item,
              fetched_at: new Date().toISOString(),
            } : {
              code: item.code,
              title: item.title,
              product_type: item.componentType.toLowerCase().includes('skill') ? 'skillset' : 'qualification',
              training_package_code: item.trainingPackageCode,
              training_package_title: item.trainingPackageTitle,
              status: item.status,
              release_number: item.releaseNumber,
              release_date: item.releaseDate,
              currency_status: item.currencyStatus,
              superseded_by: item.supersededBy,
              is_current: item.isCurrent,
              source_hash: sourceHash,
              source_payload: item,
              fetched_at: new Date().toISOString(),
            };

            const { error: upsertError } = await supabase
              .from(table)
              .upsert(record, { onConflict: 'code' });

            if (upsertError) {
              recordsFailed++;
            } else if (existing) {
              recordsUpdated++;
            } else {
              recordsInserted++;
            }
          }
        }
      } catch (error: unknown) {
        console.error('[TGA] Sync error:', error);
        errorMessage = error instanceof Error ? error.message : String(error);
      }

      // Update job
      const finalStatus = errorMessage ? 'failed' : 'done';
      await supabase
        .from('tga_sync_jobs')
        .update({
          status: finalStatus,
          completed_at: new Date().toISOString(),
          records_fetched: recordsFetched,
          records_inserted: recordsInserted,
          records_updated: recordsUpdated,
          records_unchanged: recordsUnchanged,
          records_failed: recordsFailed,
          error_message: errorMessage,
        })
        .eq('id', job_id);

      // Update sync status
      const statusUpdate: Record<string, unknown> = {
        is_syncing: false,
        current_job_id: null,
        last_sync_job_id: job_id,
      };
      
      if (job_type === 'full') {
        statusUpdate.last_full_sync_at = new Date().toISOString();
      } else if (job_type === 'delta') {
        statusUpdate.last_delta_sync_at = new Date().toISOString();
      }

      // Get counts
      const { count: productsCount } = await supabase.from('tga_training_products').select('*', { count: 'exact', head: true });
      const { count: unitsCount } = await supabase.from('tga_units').select('*', { count: 'exact', head: true });
      const { count: orgsCount } = await supabase.from('tga_organisations').select('*', { count: 'exact', head: true });

      statusUpdate.products_count = productsCount || 0;
      statusUpdate.units_count = unitsCount || 0;
      statusUpdate.organisations_count = orgsCount || 0;

      await supabase.from('tga_sync_status').update(statusUpdate).eq('id', 1);

      // Audit log
      await supabase.from('client_audit_log').insert({
        tenant_id: 1,
        entity_type: 'tga_integration',
        entity_id: job_id,
        action: `sync_${job_type}_completed`,
        actor_user_id: user.id,
        details: {
          job_id,
          job_type,
          records_fetched: recordsFetched,
          records_inserted: recordsInserted,
          records_updated: recordsUpdated,
          records_failed: recordsFailed,
          error: errorMessage,
        },
      });

      return new Response(JSON.stringify({
        success: !errorMessage,
        job_id,
        records_fetched: recordsFetched,
        records_inserted: recordsInserted,
        records_updated: recordsUpdated,
        records_unchanged: recordsUnchanged,
        records_failed: recordsFailed,
        error: errorMessage,
      }), {
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      });
    }

    // Default: return status
    const { data: status } = await supabase.from('tga_sync_status').select('*').eq('id', 1).single();
    
    return new Response(JSON.stringify({
      action: 'status',
      data: status,
    }), {
      headers: { ...corsHeaders, 'Content-Type': 'application/json' },
    });

  } catch (error: unknown) {
    console.error('[TGA] Error:', error);
    return new Response(JSON.stringify({ error: error instanceof Error ? error.message : String(error) }), {
      status: 500,
      headers: { ...corsHeaders, 'Content-Type': 'application/json' },
    });
  }
});