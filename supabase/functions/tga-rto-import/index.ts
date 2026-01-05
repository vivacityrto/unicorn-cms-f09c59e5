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

// --- WSDL-derived contract cache (in-memory) ---
type SoapVersion = '1.2' | '1.1';

interface WsdlContract {
  fetched_at: number;
  endpoint: string;
  target_namespace: string;
  soap_version: SoapVersion;
  operation: string;
  soap_action: string | null;
  request_root_element: string;
  request_wrapper_element: string | null;
  code_element: string;
}

let WSDL_CONTRACT_CACHE: Record<string, WsdlContract> = {};
let WSDL_TEXT_CACHE: { fetched_at: number; text: string } | null = null;
let WSDL_FETCH_INFLIGHT: Promise<string> | null = null;
const WSDL_CACHE_TTL_MS = 5 * 60 * 1000;

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

async function fetchWsdlText(correlationId: string): Promise<string> {
  const now = Date.now();
  if (WSDL_TEXT_CACHE && now - WSDL_TEXT_CACHE.fetched_at < WSDL_CACHE_TTL_MS) {
    return WSDL_TEXT_CACHE.text;
  }

  if (WSDL_FETCH_INFLIGHT) return WSDL_FETCH_INFLIGHT;

  const wsdlUrl = `${ORG_ENDPOINT}?wsdl`;
  logStage(correlationId, 'wsdl.fetch', { endpoint_used: ORG_ENDPOINT, url: wsdlUrl });

  WSDL_FETCH_INFLIGHT = (async () => {
    const controller = new AbortController();
    const timeoutId = setTimeout(() => controller.abort(), 10000);
    try {
      const res = await fetch(wsdlUrl, {
        method: 'GET',
        headers: { Accept: 'text/xml, application/xml' },
        signal: controller.signal,
      });
      const text = await res.text();
      logStage(correlationId, 'wsdl.fetch.result', {
        http_status: res.status,
        response_snippet: text.slice(0, 300),
      });
      if (res.status !== 200) {
        throw new Error(`WSDL fetch failed: HTTP ${res.status}`);
      }
      WSDL_TEXT_CACHE = { fetched_at: Date.now(), text };
      return text;
    } finally {
      clearTimeout(timeoutId);
    }
  })();

  try {
    return await WSDL_FETCH_INFLIGHT;
  } finally {
    WSDL_FETCH_INFLIGHT = null;
  }
}

function parseWsdlContract(wsdl: string, operationCandidates: string[]): WsdlContract {
  const now = Date.now();

  const targetNs =
    wsdl.match(/targetNamespace\s*=\s*"([^"]+)"/i)?.[1] ||
    // Fallback aligned to existing known-good tga-sync implementation
    'http://training.gov.au/services/Organisation';

  const hasSoap12 = /\bsoap12:binding\b|\/wsdl\/soap12\b/i.test(wsdl);
  const soapVersion: SoapVersion = hasSoap12 ? '1.2' : '1.1';

  const op = operationCandidates.find((c) => new RegExp(`<[^:>]*:?operation[^>]+name="${c}"`, 'i').test(wsdl));
  const operation = op || operationCandidates[0];

  const opBlockMatch = wsdl.match(new RegExp(`(<[^:>]*:?operation[^>]+name="${operation}"[\\s\\S]{0,1500}?</[^:>]*:?operation>)`, 'i'));
  const opBlock = opBlockMatch?.[1] || '';
  const soapAction =
    opBlock.match(/soap12:operation[^>]+soapAction\s*=\s*"([^"]+)"/i)?.[1] ||
    opBlock.match(/soap:operation[^>]+soapAction\s*=\s*"([^"]+)"/i)?.[1] ||
    null;

  let requestWrapper: string | null = null;
  let codeElement = 'Code';

  const schemaEl = wsdl.match(new RegExp(`<[^:>]*:?element[^>]+name="${operation}"[\\s\\S]{0,2000}?</[^:>]*:?element>`, 'i'))?.[0] || '';
  if (/name\s*=\s*"request"/i.test(schemaEl)) requestWrapper = 'request';
  if (/name\s*=\s*"code"/i.test(schemaEl) && !/name\s*=\s*"Code"/i.test(schemaEl)) codeElement = 'code';

  return {
    fetched_at: now,
    endpoint: ORG_ENDPOINT,
    target_namespace: targetNs,
    soap_version: soapVersion,
    operation,
    soap_action: soapAction,
    request_root_element: operation,
    request_wrapper_element: requestWrapper,
    code_element: codeElement,
  };
}

async function getWsdlContract(operationKey: string, operationCandidates: string[], correlationId: string): Promise<WsdlContract> {
  const cached = WSDL_CONTRACT_CACHE[operationKey];
  if (cached && Date.now() - cached.fetched_at < WSDL_CACHE_TTL_MS) return cached;

  const wsdlText = await fetchWsdlText(correlationId);
  const contract = parseWsdlContract(wsdlText, operationCandidates);
  WSDL_CONTRACT_CACHE[operationKey] = contract;

  logStage(correlationId, 'wsdl.contract', {
    endpoint_used: ORG_ENDPOINT,
    soap_version: contract.soap_version,
    operation: contract.operation,
    action_used: contract.soap_action,
    request_root_element: contract.request_root_element,
    target_namespace: contract.target_namespace,
  });

  return contract;
}

function buildSoapEnvelope(contract: WsdlContract, inner: string): string {
  const soapNs = contract.soap_version === '1.2'
    ? 'http://www.w3.org/2003/05/soap-envelope'
    : 'http://schemas.xmlsoap.org/soap/envelope/';

  const soapPrefix = contract.soap_version === '1.2' ? 'soap12' : 'soap';

  return `<?xml version="1.0" encoding="utf-8"?>
<${soapPrefix}:Envelope xmlns:${soapPrefix}="${soapNs}" xmlns:svc="${contract.target_namespace}">
  <${soapPrefix}:Body>
    <svc:${contract.request_root_element}>
      ${inner}
    </svc:${contract.request_root_element}>
  </${soapPrefix}:Body>
</${soapPrefix}:Envelope>`;
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
  soapVersion?: SoapVersion;
  actionUsed?: string | null;
  requestRootElement?: string;
}

// Make SOAP request (SOAP 1.2 preferred if WSDL indicates it; falls back to SOAP 1.1 only if required)
async function makeSoapRequest(
  endpoint: string,
  contract: WsdlContract,
  innerBodyXml: string,
  correlationId: string,
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
      soapVersion: contract.soap_version,
      actionUsed: contract.soap_action,
      requestRootElement: contract.request_root_element,
    };
  }

  const endpointUrl = new URL(endpoint);

  const soapEnvelope = buildSoapEnvelope(contract, innerBodyXml);
  const basicAuth = btoa(`${TGA_USERNAME}:${TGA_PASSWORD}`);

  const contentType = contract.soap_version === '1.2'
    ? (contract.soap_action
        ? `application/soap+xml; charset=utf-8; action="${contract.soap_action}"`
        : 'application/soap+xml; charset=utf-8')
    : 'text/xml; charset=utf-8';

  logStage(correlationId, 'soap.request.build', {
    endpoint_used: `${endpointUrl.host}${endpointUrl.pathname}`,
    soap_version: contract.soap_version,
    action_used: contract.soap_action,
    request_root_element: contract.request_root_element,
    content_type_sent: contentType,
  });

  try {
    const controller = new AbortController();
    const timeoutId = setTimeout(() => controller.abort(), REQUEST_TIMEOUT_MS);

    const headers: Record<string, string> = {
      'Content-Type': contentType,
      Accept: 'application/soap+xml, text/xml',
      Authorization: `Basic ${basicAuth}`,
      'User-Agent': 'Unicorn2.0/1.0',
    };

    if (contract.soap_version === '1.1' && contract.soap_action) {
      headers['SOAPAction'] = `"${contract.soap_action}"`;
    }

    const response = await fetch(endpoint, {
      method: 'POST',
      headers,
      body: soapEnvelope,
      signal: controller.signal,
    });

    clearTimeout(timeoutId);
    const responseText = await response.text();

    logStage(correlationId, 'soap.fetch', {
      endpoint_used: `${endpointUrl.host}${endpointUrl.pathname}`,
      http_status: response.status,
      soap_version: contract.soap_version,
      action_used: contract.soap_action,
      request_root_element: contract.request_root_element,
      content_type_sent: contentType,
      response_snippet: responseText.slice(0, 300),
    });

    if (response.status === 404) {
      return {
        xml: '',
        error: `Endpoint or action not found: ${endpoint}`,
        fault: null,
        httpStatus: 404,
        authOk: true,
        endpointOk: false,
        endpointUsed: endpoint,
        soapVersion: contract.soap_version,
        actionUsed: contract.soap_action,
        requestRootElement: contract.request_root_element,
      };
    }

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
        soapVersion: contract.soap_version,
        actionUsed: contract.soap_action,
        requestRootElement: contract.request_root_element,
      };
    }

    if (containsSoapFault(responseText)) {
      const fault = parseSoapFault(responseText);
      logStage(correlationId, 'soap.fault', { fault, http_status: response.status });
      return {
        xml: '',
        error: fault.faultstring || `SOAP Fault: ${fault.faultcode}`,
        fault,
        httpStatus: response.status,
        authOk: true,
        endpointOk: true,
        endpointUsed: endpoint,
        soapVersion: contract.soap_version,
        actionUsed: contract.soap_action,
        requestRootElement: contract.request_root_element,
      };
    }

    if (response.ok) {
      logStage(correlationId, 'soap.response.parse', {
        http_status: response.status,
        response_length: responseText.length,
      });

      return {
        xml: responseText,
        error: null,
        fault: null,
        httpStatus: response.status,
        authOk: true,
        endpointOk: true,
        endpointUsed: endpoint,
        soapVersion: contract.soap_version,
        actionUsed: contract.soap_action,
        requestRootElement: contract.request_root_element,
      };
    }

    return {
      xml: '',
      error: `HTTP ${response.status}: ${response.statusText}`,
      fault: parseSoapFault(responseText),
      httpStatus: response.status,
      authOk: true,
      endpointOk: true,
      endpointUsed: endpoint,
      soapVersion: contract.soap_version,
      actionUsed: contract.soap_action,
      requestRootElement: contract.request_root_element,
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
        soapVersion: contract.soap_version,
        actionUsed: contract.soap_action,
        requestRootElement: contract.request_root_element,
      };
    }

    return {
      xml: '',
      error: errorMsg,
      fault: null,
      authOk: true,
      endpointOk: false,
      endpointUsed: endpoint,
      soapVersion: contract.soap_version,
      actionUsed: contract.soap_action,
      requestRootElement: contract.request_root_element,
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
  soapVersion?: SoapVersion;
  actionUsed?: string | null;
  requestRootElement?: string;
}> {
  logStage(correlationId, 'soap.org_details', { rto_code: rtoCode });

  const contract = await getWsdlContract(
    'org_details',
    ['GetOrganisation', 'GetDetails'],
    correlationId,
  );

  const innerBody = contract.request_wrapper_element
    ? `<svc:${contract.request_wrapper_element}><svc:${contract.code_element}>${escapeXml(rtoCode)}</svc:${contract.code_element}></svc:${contract.request_wrapper_element}>`
    : `<svc:${contract.code_element}>${escapeXml(rtoCode)}</svc:${contract.code_element}>`;

  const result = await makeSoapRequest(ORG_ENDPOINT, contract, innerBody, correlationId);
  
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
      soapVersion: result.soapVersion,
      actionUsed: result.actionUsed,
      requestRootElement: result.requestRootElement,
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
    soapVersion: result.soapVersion,
    actionUsed: result.actionUsed,
    requestRootElement: result.requestRootElement,
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
  
  const contract = await getWsdlContract(
    'org_scope',
    ['GetRtoScope', 'GetScope'],
    correlationId,
  );

  const innerBody = contract.request_wrapper_element
    ? `<svc:${contract.request_wrapper_element}><svc:${contract.code_element}>${escapeXml(rtoCode)}</svc:${contract.code_element}></svc:${contract.request_wrapper_element}>`
    : `<svc:${contract.code_element}>${escapeXml(rtoCode)}</svc:${contract.code_element}>`;

  const result = await makeSoapRequest(ORG_ENDPOINT, contract, innerBody, correlationId);
  
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

    // GET ?probe=1&rto=91020 - WSDL + real org lookup (no DB writes)
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

      // 1) WSDL check
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

      // 2) Parse WSDL + perform one real org call
      const rto = url.searchParams.get('rto') || '91020';
      const contract = await getWsdlContract('org_details', ['GetOrganisation', 'GetDetails'], correlationId);
      const innerBody = contract.request_wrapper_element
        ? `<svc:${contract.request_wrapper_element}><svc:${contract.code_element}>${escapeXml(rto)}</svc:${contract.code_element}></svc:${contract.request_wrapper_element}>`
        : `<svc:${contract.code_element}>${escapeXml(rto)}</svc:${contract.code_element}>`;

      const soapResult = await makeSoapRequest(ORG_ENDPOINT, contract, innerBody, correlationId);

      const minimal = soapResult.xml
        ? {
            legal_name: extractValue(soapResult.xml, 'LegalName') || extractValue(soapResult.xml, 'Name'),
            trading_name: extractValue(soapResult.xml, 'TradingName'),
            abn: extractValue(soapResult.xml, 'ABN'),
            status: extractValue(soapResult.xml, 'Status'),
          }
        : null;

      return jsonResponse(
        {
          ok: !soapResult.error && !!minimal?.legal_name,
          correlation_id: correlationId,
          stage: 'probe.complete',
          endpoint_used: ORG_ENDPOINT,
          wsdl_ok: true,
          soap_version: contract.soap_version,
          action_used: contract.soap_action,
          request_root_element: contract.request_root_element,
          http_status: soapResult.httpStatus,
          summary_found: !!minimal?.legal_name,
          summary: minimal,
          error: soapResult.error,
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
        soap_version: orgResult.soapVersion,
        action_used: orgResult.actionUsed,
        request_root_element: orgResult.requestRootElement,
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
