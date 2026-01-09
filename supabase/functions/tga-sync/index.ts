import "https://deno.land/x/xhr@0.1.0/mod.ts";
import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2.49.4";

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Methods': 'POST, GET, OPTIONS',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type, x-action',
};

// TGA Production SOAP Endpoints - WCF basicHttpBinding (SOAP 1.1)
// Per TGA Web Services Specification v13r1 Section 3.9.2
// IMPORTANT: 
// - All services use V13 suffix and 'Webservices' (lowercase 's')
// - SOAP 1.1 requires policy suffix (e.g., /Organisation, /Training, /Classification)
const TGA_ENV = Deno.env.get('TGA_ENV') || 'prod';
const isProduction = TGA_ENV === 'prod' || TGA_ENV === 'production';

// Hardcoded V13 endpoints WITH policy suffix for SOAP 1.1 (per TGA spec section 3.9.2)
const TGA_PROD_ENDPOINTS = {
  organisation: 'https://ws.training.gov.au/Deewr.Tga.Webservices/OrganisationServiceV13.svc/Organisation',
  training: 'https://ws.training.gov.au/Deewr.Tga.Webservices/TrainingComponentServiceV13.svc/Training',
  classification: 'https://ws.training.gov.au/Deewr.Tga.Webservices/ClassificationServiceV13.svc/Classification',
};

const TGA_SANDBOX_ENDPOINTS = {
  organisation: 'https://ws.sandbox.training.gov.au/Deewr.Tga.Webservices/OrganisationServiceV13.svc/Organisation',
  training: 'https://ws.sandbox.training.gov.au/Deewr.Tga.Webservices/TrainingComponentServiceV13.svc/Training',
  classification: 'https://ws.sandbox.training.gov.au/Deewr.Tga.Webservices/ClassificationServiceV13.svc/Classification',
};

const TGA_ENDPOINTS = isProduction ? TGA_PROD_ENDPOINTS : TGA_SANDBOX_ENDPOINTS;

// V13 Guard - validate all endpoints contain V13.svc/ with policy suffix
function validateEndpoints() {
  for (const [name, url] of Object.entries(TGA_ENDPOINTS)) {
    if (!url.includes('V13.svc/')) {
      const error = `FATAL: ${name} endpoint missing V13.svc/ policy suffix: ${url}`;
      console.error(`[TGA-SYNC] ${error}`);
      throw new Error(error);
    }
  }
  console.log(`[TGA-SYNC] Endpoint validation passed - all URLs contain V13.svc/ with policy suffix`);
  console.log(`[TGA-SYNC] Environment: ${TGA_ENV} (isProduction: ${isProduction})`);
  console.log(`[TGA-SYNC] Org endpoint: ${TGA_ENDPOINTS.organisation}`);
}

// Run validation at module load
validateEndpoints();

// TGA V13 namespace - per WSDL
const TGA_V13_NAMESPACE = 'http://training.gov.au/services/13/';

// SOAP action patterns (per TGA Web Services Specification v13r1)
const SOAP_ACTIONS = {
  // Organisation service - GetDetails returns OrganisationDetailsResponse
  getOrganisationDetails: `${TGA_V13_NAMESPACE}IOrganisationService/GetDetails`,
  searchOrganisation: `${TGA_V13_NAMESPACE}IOrganisationService/Search`,
  // Training component service
  getTrainingComponentDetails: `${TGA_V13_NAMESPACE}ITrainingComponentService/GetDetails`,
  searchTrainingComponent: `${TGA_V13_NAMESPACE}ITrainingComponentService/Search`,
};

const FUNCTION_VERSION = '1.1.0';

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

// SOAP responses use varying namespace prefixes (a:, b:, s:, etc.).
// Our parsers are regex-based, so strip prefixes to make tag matching reliable.
function stripXmlPrefixes(xml: string): string {
  // Convert <ns:Tag> => <Tag> and </ns:Tag> => </Tag>
  return xml.replace(/<(\/?)\s*[A-Za-z0-9_]+:([A-Za-z0-9_\-]+)/g, '<$1$2');
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
  
  // Guard: must not use ?wsdl URL
  if (endpoint.includes('?wsdl')) {
    throw new Error(`Invalid endpoint - must not use ?wsdl: ${endpoint}`);
  }
  
  // Guard: must contain V13.svc/ with policy suffix
  if (!endpoint.includes('V13.svc/')) {
    throw new Error(`Invalid endpoint - must contain V13.svc/ with policy suffix: ${endpoint}`);
  }
  
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
          hint: 'Endpoint returned 404. Verify V13.svc/PolicySuffix URL is accessible and TGA service is online.',
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

// Parse organisation from XML - comprehensive data extraction
interface ParsedContact {
  contactType: string;
  name: string | null;
  position: string | null;
  phone: string | null;
  mobile: string | null;
  fax: string | null;
  email: string | null;
  address: string | null;
  organisationName: string | null;
}

interface ParsedAddress {
  addressType: string;
  addressLine1: string | null;
  addressLine2: string | null;
  suburb: string | null;
  state: string | null;
  postcode: string | null;
  country: string | null;
  phone: string | null;
  fax: string | null;
  email: string | null;
  website: string | null;
}

interface ParsedDeliveryLocation {
  locationName: string | null;
  addressLine1: string | null;
  addressLine2: string | null;
  suburb: string | null;
  state: string | null;
  postcode: string | null;
  country: string | null;
}

interface ParsedScopeItem {
  code: string;
  title: string | null;
  status: string | null;
  usageRecommendation: string | null;
  extent: string | null;
  startDate: string | null;
  endDate: string | null;
  deliveryNotification: string | null;
  trainingPackageCode: string | null;
  trainingPackageTitle: string | null;
  isExplicit: boolean;
  isCurrent: boolean;
}

interface ParsedScope {
  qualifications: ParsedScopeItem[];
  skillSets: ParsedScopeItem[];
  units: ParsedScopeItem[];
  courses: ParsedScopeItem[];
}

interface ParsedOrganisation {
  code: string;
  legalName: string;
  tradingName: string | null;
  organisationType: string | null;
  abn: string | null;
  acn: string | null;
  status: string | null;
  webAddress: string | null;
  initialRegistrationDate: string | null;
  registrationStartDate: string | null;
  registrationEndDate: string | null;
  // Nested collections
  contacts: ParsedContact[];
  addresses: ParsedAddress[];
  deliveryLocations: ParsedDeliveryLocation[];
  scope: ParsedScope;
}

// Helper to extract all items from a collection
function extractItems(xml: string, containerPattern: RegExp, itemPattern: RegExp): string[] {
  const containerMatch = xml.match(containerPattern);
  if (!containerMatch) return [];
  
  const items: string[] = [];
  let match;
  while ((match = itemPattern.exec(containerMatch[1])) !== null) {
    items.push(match[1]);
  }
  return items;
}

// Parse contacts from XML - extract the 3 CURRENT contact types (CEO, Registration, Public Enquiries)
// TGA returns time-variant records - we need to filter to only current ones (EndDate is null or >= today)
function parseContacts(xml: string): ParsedContact[] {
  const contacts: ParsedContact[] = [];
  const today = new Date().toISOString().split('T')[0];
  
  log('info', 'Starting contact parsing');
  
  // Helper to check if a contact record is current
  const isCurrentRecord = (recordXml: string): boolean => {
    const endDate = extractValue(recordXml, 'EndDate') || extractValue(recordXml, 'EffectiveTo');
    if (!endDate) return true; // No end date = current
    return endDate >= today;
  };
  
  // Helper to extract the MOST RECENT current record from a container of time-variant records
  const extractCurrentFromContainer = (containerXml: string, contactType: string): ParsedContact | null => {
    // Check if the container itself has the contact data directly
    const name = extractValue(containerXml, 'Name') || extractValue(containerXml, 'FullName') || 
                 (extractValue(containerXml, 'FirstName') ? 
                   `${extractValue(containerXml, 'FirstName') || ''} ${extractValue(containerXml, 'LastName') || ''}`.trim() : null);
    
    if (name && isCurrentRecord(containerXml)) {
      return {
        contactType,
        name,
        position: extractValue(containerXml, 'Position') || extractValue(containerXml, 'JobTitle') || contactType,
        phone: extractValue(containerXml, 'Phone') || extractValue(containerXml, 'PhoneNumber') || 
               extractValue(containerXml, 'BusinessPhone'),
        mobile: extractValue(containerXml, 'Mobile') || extractValue(containerXml, 'MobileNumber') ||
                extractValue(containerXml, 'MobilePhone'),
        fax: extractValue(containerXml, 'Fax') || extractValue(containerXml, 'FaxNumber'),
        email: extractValue(containerXml, 'Email') || extractValue(containerXml, 'EmailAddress'),
        address: extractValue(containerXml, 'Address') || extractValue(containerXml, 'StreetAddress'),
        organisationName: extractValue(containerXml, 'OrganisationName') || extractValue(containerXml, 'Organisation'),
      };
    }
    
    return null;
  };
  
  // TGA uses specific element names for the 3 contact types per the documentation
  const contactMappings = [
    { patterns: ['ContactChiefExecutive', 'ChiefExecutive', 'CEO', 'PrincipalExecutive'], type: 'ChiefExecutive' },
    { patterns: ['ContactPublicEnquiries', 'PublicEnquiries', 'PublicContact'], type: 'PublicEnquiries' },
    { patterns: ['ContactRegistrationEnquiries', 'RegistrationEnquiries', 'RegistrationContact'], type: 'RegistrationEnquiries' },
  ];
  
  for (const { patterns, type } of contactMappings) {
    for (const pattern of patterns) {
      const containerPattern = new RegExp(`<(?:a:)?${pattern}[^>]*>([\\s\\S]*?)<\\/(?:a:)?${pattern}>`, 'i');
      const match = xml.match(containerPattern);
      
      if (match) {
        log('info', `Found contact element: ${pattern} for type ${type}`);
        const contact = extractCurrentFromContainer(match[1], type);
        if (contact) {
          contacts.push(contact);
          log('info', `Added ${type} contact`, { name: contact.name, email: contact.email });
        }
        break; // Found this type, move to next
      }
    }
  }
  
  // If we didn't find all 3, try Contacts array fallback
  if (contacts.length < 3) {
    const contactsMatch = xml.match(/<(?:a:)?Contacts[^>]*>([\s\S]*?)<\/(?:a:)?Contacts>/i);
    if (contactsMatch) {
      const contactItemPattern = /<(?:a:)?Contact[^>]*>([\s\S]*?)<\/(?:a:)?Contact>/gi;
      let match;
      const seenTypes = new Set(contacts.map(c => c.contactType));
      
      while ((match = contactItemPattern.exec(contactsMatch[1])) !== null) {
        const contactXml = match[1];
        
        // Only process if current
        if (!isCurrentRecord(contactXml)) continue;
        
        const rawType = extractValue(contactXml, 'ContactType') || extractValue(contactXml, 'Type') || '';
        const normalizedType = rawType.includes('Chief') || rawType.includes('CEO') || rawType.includes('Principal') ? 'ChiefExecutive' :
                              rawType.includes('Public') ? 'PublicEnquiries' :
                              rawType.includes('Registration') ? 'RegistrationEnquiries' : null;
        
        if (normalizedType && !seenTypes.has(normalizedType)) {
          seenTypes.add(normalizedType);
          contacts.push({
            contactType: normalizedType,
            name: extractValue(contactXml, 'Name') || extractValue(contactXml, 'FullName'),
            position: extractValue(contactXml, 'Position') || extractValue(contactXml, 'JobTitle'),
            phone: extractValue(contactXml, 'Phone') || extractValue(contactXml, 'PhoneNumber'),
            mobile: extractValue(contactXml, 'Mobile') || extractValue(contactXml, 'MobileNumber'),
            fax: extractValue(contactXml, 'Fax') || extractValue(contactXml, 'FaxNumber'),
            email: extractValue(contactXml, 'Email') || extractValue(contactXml, 'EmailAddress'),
            address: extractValue(contactXml, 'Address'),
            organisationName: extractValue(contactXml, 'OrganisationName'),
          });
        }
      }
    }
  }
  
  log('info', 'Contact parsing complete', { totalContacts: contacts.length, types: contacts.map(c => c.contactType) });
  return contacts;
}

// Parse addresses from XML - Head Office Physical + Postal + any other addresses
function parseAddresses(xml: string): ParsedAddress[] {
  const addresses: ParsedAddress[] = [];
  
  log('info', 'Starting address parsing');
  
  // Look for specific address types in TGA response - these are the main ones
  const addressMappings = [
    // Head Office addresses - different possible element names
    { tags: ['HeadOfficeLocation', 'HeadOfficePhysicalAddress', 'PhysicalAddress'], type: 'HeadOffice' },
    { tags: ['HeadOfficePostalAddress', 'PostalAddress'], type: 'Postal' },
    { tags: ['BusinessAddress'], type: 'Business' },
  ];
  
  for (const { tags, type } of addressMappings) {
    for (const tag of tags) {
      const pattern = new RegExp(`<(?:a:)?${tag}[^>]*>([\\s\\S]*?)<\\/(?:a:)?${tag}>`, 'i');
      const match = xml.match(pattern);
      
      if (match) {
        log('info', `Found address element: ${tag} as type ${type}`);
        const addrXml = match[1];
        
        addresses.push({
          addressType: type,
          addressLine1: extractValue(addrXml, 'Line1') || extractValue(addrXml, 'AddressLine1') || 
                       extractValue(addrXml, 'Street') || extractValue(addrXml, 'StreetAddress'),
          addressLine2: extractValue(addrXml, 'Line2') || extractValue(addrXml, 'AddressLine2'),
          suburb: extractValue(addrXml, 'Suburb') || extractValue(addrXml, 'City') || extractValue(addrXml, 'Locality'),
          state: extractValue(addrXml, 'State') || extractValue(addrXml, 'StateTerritory') || extractValue(addrXml, 'StateCode'),
          postcode: extractValue(addrXml, 'Postcode') || extractValue(addrXml, 'PostCode'),
          country: extractValue(addrXml, 'Country'),
          phone: extractValue(addrXml, 'Phone') || extractValue(addrXml, 'PhoneNumber'),
          fax: extractValue(addrXml, 'Fax') || extractValue(addrXml, 'FaxNumber'),
          email: extractValue(addrXml, 'Email') || extractValue(addrXml, 'EmailAddress'),
          website: extractValue(addrXml, 'Website') || extractValue(addrXml, 'WebAddress'),
        });
        break; // Found this type, move to next
      }
    }
  }
  
  // Also look for an Addresses container with Address items
  const addressesContainerPatterns = [
    /<(?:a:)?Addresses[^>]*>([\s\S]*?)<\/(?:a:)?Addresses>/i,
    /<(?:a:)?AddressList[^>]*>([\s\S]*?)<\/(?:a:)?AddressList>/i,
  ];
  
  for (const containerPattern of addressesContainerPatterns) {
    const containerMatch = xml.match(containerPattern);
    if (containerMatch) {
      const addressItemPattern = /<(?:a:)?Address[^>]*>([\s\S]*?)<\/(?:a:)?Address>/gi;
      let match;
      while ((match = addressItemPattern.exec(containerMatch[1])) !== null) {
        const addrXml = match[1];
        const addrType = extractValue(addrXml, 'AddressType') || extractValue(addrXml, 'Type') || 'Unknown';
        
        // Skip if we already have this type
        if (addresses.some(a => a.addressType === addrType)) continue;
        
        addresses.push({
          addressType: addrType,
          addressLine1: extractValue(addrXml, 'Line1') || extractValue(addrXml, 'AddressLine1'),
          addressLine2: extractValue(addrXml, 'Line2') || extractValue(addrXml, 'AddressLine2'),
          suburb: extractValue(addrXml, 'Suburb') || extractValue(addrXml, 'Locality'),
          state: extractValue(addrXml, 'State') || extractValue(addrXml, 'StateCode'),
          postcode: extractValue(addrXml, 'Postcode') || extractValue(addrXml, 'PostCode'),
          country: extractValue(addrXml, 'Country'),
          phone: extractValue(addrXml, 'Phone'),
          fax: extractValue(addrXml, 'Fax'),
          email: extractValue(addrXml, 'Email'),
          website: extractValue(addrXml, 'Website'),
        });
      }
    }
  }
  
  log('info', 'Address parsing complete', { totalAddresses: addresses.length, types: addresses.map(a => a.addressType) });
  return addresses;
}

// Parse delivery locations from XML
function parseDeliveryLocations(xml: string): ParsedDeliveryLocation[] {
  const locations: ParsedDeliveryLocation[] = [];
  
  log('info', 'Starting delivery locations parsing');
  
  // Look for various container names TGA might use
  const containerPatterns = [
    /<(?:a:)?DeliveryLocations[^>]*>([\s\S]*?)<\/(?:a:)?DeliveryLocations>/i,
    /<(?:a:)?Locations[^>]*>([\s\S]*?)<\/(?:a:)?Locations>/i,
    /<(?:a:)?SiteLocations[^>]*>([\s\S]*?)<\/(?:a:)?SiteLocations>/i,
  ];
  
  for (const pattern of containerPatterns) {
    const match = xml.match(pattern);
    if (match) {
      log('info', 'Found delivery locations container');
      
      const locationPatterns = [
        /<(?:a:)?DeliveryLocation[^>]*>([\s\S]*?)<\/(?:a:)?DeliveryLocation>/gi,
        /<(?:a:)?Location[^>]*>([\s\S]*?)<\/(?:a:)?Location>/gi,
        /<(?:a:)?Site[^>]*>([\s\S]*?)<\/(?:a:)?Site>/gi,
      ];
      
      for (const locPattern of locationPatterns) {
        let locMatch;
        while ((locMatch = locPattern.exec(match[1])) !== null) {
          const locXml = locMatch[1];
          
          locations.push({
            locationName: extractValue(locXml, 'Name') || extractValue(locXml, 'LocationName') || 
                         extractValue(locXml, 'SiteName') || extractValue(locXml, 'Description'),
            addressLine1: extractValue(locXml, 'Line1') || extractValue(locXml, 'AddressLine1') ||
                         extractValue(locXml, 'Street') || extractValue(locXml, 'StreetAddress'),
            addressLine2: extractValue(locXml, 'Line2') || extractValue(locXml, 'AddressLine2'),
            suburb: extractValue(locXml, 'Suburb') || extractValue(locXml, 'Locality') || extractValue(locXml, 'City'),
            state: extractValue(locXml, 'State') || extractValue(locXml, 'StateCode'),
            postcode: extractValue(locXml, 'Postcode') || extractValue(locXml, 'PostCode'),
            country: extractValue(locXml, 'Country'),
          });
        }
      }
      break; // Found a container, don't check other patterns
    }
  }
  
  log('info', 'Delivery locations parsing complete', { totalLocations: locations.length });
  return locations;
}

// Parse scope items (qualifications, skill sets, units, courses)
// TGA returns scope via ShowRtoDeliveredQualifications, ShowRtoDeliveredUnits, etc.
function parseScope(xml: string): ParsedScope {
  const scope: ParsedScope = {
    qualifications: [],
    skillSets: [],
    units: [],
    courses: [],
  };
  
  log('info', 'Starting scope parsing');
  
  // Helper to parse a single scope item
  const parseScopeItem = (itemXml: string, isExplicitDefault: boolean): ParsedScopeItem | null => {
    const code = extractValue(itemXml, 'Code') || extractValue(itemXml, 'NrtCode') || 
                 extractValue(itemXml, 'TrainingComponentCode') || extractValue(itemXml, 'NationalCode');
    if (!code) return null;
    
    const isExplicitVal = extractValue(itemXml, 'IsExplicit') || extractValue(itemXml, 'Explicit');
    const isExplicit = isExplicitVal ? isExplicitVal.toLowerCase() === 'true' : isExplicitDefault;
    
    return {
      code,
      title: extractValue(itemXml, 'Title') || extractValue(itemXml, 'Name') || extractValue(itemXml, 'Description'),
      status: extractValue(itemXml, 'Status') || extractValue(itemXml, 'ScopeStatus') || 
              extractValue(itemXml, 'NrtStatus') || extractValue(itemXml, 'TrainingComponentStatus'),
      usageRecommendation: extractValue(itemXml, 'UsageRecommendation') || extractValue(itemXml, 'Recommendation'),
      extent: extractValue(itemXml, 'Extent') || extractValue(itemXml, 'ScopeExtent') || extractValue(itemXml, 'DeliveryScope'),
      startDate: extractValue(itemXml, 'StartDate') || extractValue(itemXml, 'ScopeStartDate') || 
                 extractValue(itemXml, 'EffectiveFrom') || extractValue(itemXml, 'ScopeFrom'),
      endDate: extractValue(itemXml, 'EndDate') || extractValue(itemXml, 'ScopeEndDate') ||
               extractValue(itemXml, 'EffectiveTo') || extractValue(itemXml, 'ScopeTo'),
      deliveryNotification: extractValue(itemXml, 'DeliveryNotification') || 
                           extractValue(itemXml, 'DeliveryNotificationRequired') ||
                           extractValue(itemXml, 'NotificationRequired'),
      trainingPackageCode: extractValue(itemXml, 'TrainingPackageCode') || extractValue(itemXml, 'ParentCode') ||
                          extractValue(itemXml, 'PackageCode'),
      trainingPackageTitle: extractValue(itemXml, 'TrainingPackageTitle') || extractValue(itemXml, 'ParentTitle') ||
                           extractValue(itemXml, 'PackageTitle'),
      isExplicit,
      isCurrent: extractValue(itemXml, 'IsCurrent')?.toLowerCase() === 'true' || 
                 extractValue(itemXml, 'Status')?.toLowerCase() === 'current' ||
                 extractValue(itemXml, 'Current')?.toLowerCase() === 'true',
    };
  };
  
  // Generic function to extract items from a container
  const extractScopeItems = (containerNames: string[], itemPatterns: RegExp[], isExplicit: boolean): ParsedScopeItem[] => {
    const items: ParsedScopeItem[] = [];
    
    for (const containerName of containerNames) {
      const containerPattern = new RegExp(`<(?:a:)?${containerName}[^>]*>([\\s\\S]*?)<\\/(?:a:)?${containerName}>`, 'gi');
      let containerMatch;
      
      while ((containerMatch = containerPattern.exec(xml)) !== null) {
        log('info', `Found scope container: ${containerName}`);
        
        for (const itemPattern of itemPatterns) {
          let match;
          while ((match = itemPattern.exec(containerMatch[1])) !== null) {
            const item = parseScopeItem(match[1], isExplicit);
            if (item && !items.some(i => i.code === item.code)) {
              items.push(item);
            }
          }
        }
      }
    }
    
    return items;
  };
  
  // Parse Qualifications - TGA uses RtoDeliveredQualifications or Qualifications
  scope.qualifications = extractScopeItems(
    ['RtoDeliveredQualifications', 'Qualifications', 'QualificationScope', 'ExplicitScope'],
    [
      /<(?:a:)?(?:RtoDeliveredQualification|Qualification|TrainingComponent|ScopeItem)[^>]*>([\s\S]*?)<\/(?:a:)?(?:RtoDeliveredQualification|Qualification|TrainingComponent|ScopeItem)>/gi,
    ],
    true
  );
  log('info', `Parsed ${scope.qualifications.length} qualifications`);
  
  // Parse Skill Sets - TGA uses RtoDeliveredSkillSets or SkillSets
  scope.skillSets = extractScopeItems(
    ['RtoDeliveredSkillSets', 'SkillSets', 'SkillSetScope'],
    [
      /<(?:a:)?(?:RtoDeliveredSkillSet|SkillSet|TrainingComponent|ScopeItem)[^>]*>([\s\S]*?)<\/(?:a:)?(?:RtoDeliveredSkillSet|SkillSet|TrainingComponent|ScopeItem)>/gi,
    ],
    true
  );
  log('info', `Parsed ${scope.skillSets.length} skill sets`);
  
  // Parse Units - TGA uses RtoDeliveredUnits or Units
  // ONLY explicit units per user requirement
  const allUnits = extractScopeItems(
    ['RtoDeliveredUnits', 'Units', 'ExplicitUnits', 'UnitScope'],
    [
      /<(?:a:)?(?:RtoDeliveredUnit|Unit|UnitOfCompetency|TrainingComponent|ScopeItem)[^>]*>([\s\S]*?)<\/(?:a:)?(?:RtoDeliveredUnit|Unit|UnitOfCompetency|TrainingComponent|ScopeItem)>/gi,
    ],
    false // Default to false, check IsExplicit field
  );
  // Filter to explicit only
  scope.units = allUnits.filter(u => u.isExplicit);
  log('info', `Parsed ${allUnits.length} units total, ${scope.units.length} explicit units`);
  
  // Parse Accredited Courses - TGA uses RtoDeliveredAccreditedCourses or AccreditedCourses
  scope.courses = extractScopeItems(
    ['RtoDeliveredAccreditedCourses', 'AccreditedCourses', 'Courses', 'CourseScope'],
    [
      /<(?:a:)?(?:RtoDeliveredAccreditedCourse|AccreditedCourse|Course|TrainingComponent|ScopeItem)[^>]*>([\s\S]*?)<\/(?:a:)?(?:RtoDeliveredAccreditedCourse|AccreditedCourse|Course|TrainingComponent|ScopeItem)>/gi,
    ],
    true
  );
  log('info', `Parsed ${scope.courses.length} accredited courses`);
  
  log('info', 'Scope parsing complete', {
    qualifications: scope.qualifications.length,
    skillSets: scope.skillSets.length,
    units: scope.units.length,
    courses: scope.courses.length,
  });
  
  return scope;
}

// Parse organisation with CANONICAL RTO code from request (not from XML, which may have wrong Code element)
function parseOrganisation(xml: string, canonicalRtoCode: string): ParsedOrganisation | null {
  // Try to extract code from specific organisation context, not just any <Code>
  // Look for OrganisationCode or the Code within GetDetailsResult/Organisation
  const orgResultMatch = xml.match(/<(?:a:)?GetDetailsResult[^>]*>([\s\S]*?)<\/(?:a:)?GetDetailsResult>/i) ||
                        xml.match(/<(?:a:)?OrganisationDetailsResponse[^>]*>([\s\S]*?)<\/(?:a:)?OrganisationDetailsResponse>/i) ||
                        xml.match(/<(?:a:)?Organisation[^>]*>([\s\S]*?)<\/(?:a:)?Organisation>/i);
  
  let derivedCode = canonicalRtoCode;
  let legalName = '';
  
  if (orgResultMatch) {
    const orgXml = orgResultMatch[1];
    // Extract code from org context specifically
    derivedCode = extractValue(orgXml, 'OrganisationCode') || 
                  extractValue(orgXml, 'NationalProviderId') ||
                  extractValue(orgXml, 'RtoCode') ||
                  extractValue(orgXml, 'Code') || 
                  canonicalRtoCode;
    legalName = extractValue(orgXml, 'LegalName') || extractValue(orgXml, 'Name') || '';
  } else {
    // Fallback - try top level
    legalName = extractValue(xml, 'LegalName') || extractValue(xml, 'Name') || '';
  }
  
  // CRITICAL: Log if derived code differs from canonical - helps debug
  if (derivedCode !== canonicalRtoCode) {
    log('warn', `Derived RTO code "${derivedCode}" differs from canonical "${canonicalRtoCode}". Using canonical for storage.`);
  }
  
  if (!legalName) {
    log('warn', 'Could not extract legal name from organisation response');
    return null;
  }

  // ALWAYS use canonical code for storage consistency
  return {
    code: canonicalRtoCode,
    legalName,
    tradingName: extractValue(xml, 'TradingName'),
    organisationType: extractValue(xml, 'OrganisationType') || extractValue(xml, 'Type'),
    abn: extractValue(xml, 'ABN'),
    acn: extractValue(xml, 'ACN'),
    status: extractValue(xml, 'Status'),
    webAddress: extractValue(xml, 'WebAddress') || extractValue(xml, 'Website') || extractValue(xml, 'URL'),
    initialRegistrationDate: extractValue(xml, 'InitialRegistrationDate'),
    registrationStartDate: extractValue(xml, 'RegistrationStartDate'),
    registrationEndDate: extractValue(xml, 'RegistrationEndDate'),
    contacts: parseContacts(xml),
    addresses: parseAddresses(xml),
    deliveryLocations: parseDeliveryLocations(xml),
    scope: parseScope(xml),
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

// Fetch organisation by code with full details including contacts, addresses, and scope
async function fetchOrganisation(code: string): Promise<{ data: ParsedOrganisation | null; raw: string; error: string | null }> {
  try {
    // Use TGA V13 GetDetails operation with OrganisationDetailsRequest (per spec section 6.5)
    // CRITICAL: Include InformationRequested to specify which sub-entities to return
    // Without this, TGA may not return contacts, addresses, scope etc.
    const body = buildOrgSoapRequest('GetDetails', `
      <tns:request>
        <tns:Code>${escapeXml(code)}</tns:Code>
        <tns:InformationRequested>
          <tns:ShowContacts>true</tns:ShowContacts>
          <tns:ShowLocations>true</tns:ShowLocations>
          <tns:ShowRegistrationManagers>true</tns:ShowRegistrationManagers>
          <tns:ShowRtoClassifications>true</tns:ShowRtoClassifications>
          <tns:ShowTradingNames>true</tns:ShowTradingNames>
          <tns:ShowRtoDeliveredQualifications>true</tns:ShowRtoDeliveredQualifications>
          <tns:ShowRtoDeliveredUnits>true</tns:ShowRtoDeliveredUnits>
          <tns:ShowRtoDeliveredSkillSets>true</tns:ShowRtoDeliveredSkillSets>
          <tns:ShowRtoDeliveredAccreditedCourses>true</tns:ShowRtoDeliveredAccreditedCourses>
          <tns:ShowExplicitScope>true</tns:ShowExplicitScope>
        </tns:InformationRequested>
      </tns:request>
    `);
    
    log('info', 'Fetching organisation with full details', { code, requestSize: body.length });
    
    const response = await makeSoapRequest(
      TGA_ENDPOINTS.organisation, 
      SOAP_ACTIONS.getOrganisationDetails, 
      body
    );
    
    // Normalize prefixes so our regex parsers can reliably find tags
    const normalized = stripXmlPrefixes(response);

    // Log sample of response for debugging (first 3000 chars)
    log('info', 'Parsing organisation response', {
      code,
      responseSize: response.length,
      // Sample key parts of the response to understand structure
      hasContacts: normalized.includes('Contact'),
      hasScope: normalized.includes('Scope') || normalized.includes('Qualification') || normalized.includes('RtoDelivered'),
      hasDeliveryLocations: normalized.includes('DeliveryLocation') || normalized.includes('DeliveryLocations') || normalized.includes('Locations'),
      hasExplicitScope: normalized.includes('ExplicitScope') || normalized.includes('ShowExplicitScope'),
    });

    const parsed = parseOrganisation(normalized, code);

    // Log parsing results
    log('info', 'Organisation parsing complete', {
      code,
      hasData: !!parsed,
      contactsFound: parsed?.contacts.length ?? 0,
      addressesFound: parsed?.addresses.length ?? 0,
      deliveryLocationsFound: parsed?.deliveryLocations.length ?? 0,
      qualificationsFound: parsed?.scope.qualifications.length ?? 0,
      skillSetsFound: parsed?.scope.skillSets.length ?? 0,
      unitsFound: parsed?.scope.units.length ?? 0,
      coursesFound: parsed?.scope.courses.length ?? 0,
    });
    
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
        isProduction,
        config: {
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

    // Debug action - returns sanitized XML excerpts for analysis
    if (action === 'debug-org') {
      if (!isSuperAdmin) {
        return new Response(JSON.stringify({ error: 'SuperAdmin access required' }), {
          status: 403,
          headers: { ...corsHeaders, 'Content-Type': 'application/json' },
        });
      }

      const rto_number = (requestBody.rto_number as string) || url.searchParams.get('code') || '91020';
      log('info', 'Debug org fetch', { rto_number });
      
      const result = await fetchOrganisation(rto_number);
      
      // Extract key XML sections for analysis
      const extractSection = (xml: string, patterns: string[]): string => {
        for (const pattern of patterns) {
          const regex = new RegExp(`<(?:a:)?${pattern}[^>]*>[\\s\\S]{0,5000}`, 'i');
          const match = xml.match(regex);
          if (match) return match[0].substring(0, 2000) + '...';
        }
        return 'NOT FOUND';
      };
      
      // Sanitize - redact sensitive info
      let sanitizedXml = result.raw
        .replace(/<(?:a:)?Email[^>]*>[^<]+<\/(?:a:)?Email>/gi, '<Email>[REDACTED]</Email>')
        .replace(/<(?:a:)?Phone[^>]*>[^<]+<\/(?:a:)?Phone>/gi, '<Phone>[REDACTED]</Phone>')
        .replace(/<(?:a:)?Mobile[^>]*>[^<]+<\/(?:a:)?Mobile>/gi, '<Mobile>[REDACTED]</Mobile>')
        .replace(/<(?:a:)?Fax[^>]*>[^<]+<\/(?:a:)?Fax>/gi, '<Fax>[REDACTED]</Fax>');

      return new Response(JSON.stringify({
        requested_rto_number: rto_number,
        parsed_org_code: result.data?.code,
        parsed_legal_name: result.data?.legalName,
        code_matches: result.data?.code === rto_number,
        parsing_summary: {
          contacts: result.data?.contacts.length ?? 0,
          contacts_types: result.data?.contacts.map(c => c.contactType) ?? [],
          addresses: result.data?.addresses.length ?? 0,
          address_types: result.data?.addresses.map(a => a.addressType) ?? [],
          delivery_locations: result.data?.deliveryLocations.length ?? 0,
          qualifications: result.data?.scope.qualifications.length ?? 0,
          skill_sets: result.data?.scope.skillSets.length ?? 0,
          units: result.data?.scope.units.length ?? 0,
          courses: result.data?.scope.courses.length ?? 0,
        },
        xml_sections: {
          organisation_root: extractSection(result.raw, ['GetDetailsResult', 'OrganisationDetailsResponse', 'Organisation']),
          contacts: extractSection(result.raw, ['ContactChiefExecutive', 'ChiefExecutive', 'Contacts']),
          addresses: extractSection(result.raw, ['HeadOfficeLocation', 'HeadOfficePhysicalAddress', 'Addresses']),
          delivery_locations: extractSection(result.raw, ['DeliveryLocations', 'Locations', 'SiteLocations']),
          scope_quals: extractSection(result.raw, ['RtoDeliveredQualifications', 'Qualifications']),
          scope_units: extractSection(result.raw, ['RtoDeliveredUnits', 'Units']),
        },
        raw_xml_length: result.raw.length,
        raw_xml_excerpt: sanitizedXml.substring(0, 8000),
        error: result.error,
      }), {
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

        const orgData = orgResult.data;
        const tenantIdNum = tenant_id ? parseInt(tenant_id) : null;
        const fetchedAt = new Date().toISOString();

        // We got RTO data - upsert to tga_rtos for local cache
        await supabase
          .from('tga_rtos')
          .upsert({
            rto_number: orgData.code,
            legal_name: orgData.legalName,
            trading_name: orgData.tradingName,
            abn: orgData.abn,
            status: orgData.status,
            registration_start: orgData.registrationStartDate,
            registration_end: orgData.registrationEndDate,
            phone: orgData.addresses[0]?.phone || null,
            email: orgData.addresses[0]?.email || null,
            website: orgData.webAddress,
            updated_at: fetchedAt,
          }, { onConflict: 'rto_number' });

        // Store to tga_rto_summary if we have tenant_id
        if (tenantIdNum) {
          // Upsert summary
          await supabase
            .from('tga_rto_summary')
            .upsert({
              tenant_id: tenantIdNum,
              rto_code: orgData.code,
              legal_name: orgData.legalName,
              trading_name: orgData.tradingName,
              organisation_type: orgData.organisationType,
              abn: orgData.abn,
              acn: orgData.acn,
              status: orgData.status,
              web_address: orgData.webAddress,
              initial_registration_date: orgData.initialRegistrationDate,
              registration_start_date: orgData.registrationStartDate,
              registration_end_date: orgData.registrationEndDate,
              fetched_at: fetchedAt,
              updated_at: fetchedAt,
            }, { onConflict: 'tenant_id,rto_code' });

          // Delete and re-insert contacts
          await supabase.from('tga_rto_contacts').delete().eq('tenant_id', tenantIdNum).eq('rto_code', orgData.code);
          if (orgData.contacts.length > 0) {
            await supabase.from('tga_rto_contacts').insert(
              orgData.contacts.map(c => ({
                tenant_id: tenantIdNum,
                rto_code: orgData.code,
                contact_type: c.contactType,
                name: c.name,
                position: c.position,
                phone: c.phone,
                mobile: c.mobile,
                fax: c.fax,
                email: c.email,
                address: c.address,
                organisation_name: c.organisationName,
                fetched_at: fetchedAt,
              }))
            );
          }

          // Delete and re-insert addresses
          await supabase.from('tga_rto_addresses').delete().eq('tenant_id', tenantIdNum).eq('rto_code', orgData.code);
          if (orgData.addresses.length > 0) {
            await supabase.from('tga_rto_addresses').insert(
              orgData.addresses.map(a => ({
                tenant_id: tenantIdNum,
                rto_code: orgData.code,
                address_type: a.addressType,
                address_line_1: a.addressLine1,
                address_line_2: a.addressLine2,
                suburb: a.suburb,
                state: a.state,
                postcode: a.postcode,
                country: a.country,
                phone: a.phone,
                fax: a.fax,
                email: a.email,
                website: a.website,
                fetched_at: fetchedAt,
              }))
            );
          }

          // Delete and re-insert delivery locations
          await supabase.from('tga_rto_delivery_locations').delete().eq('tenant_id', tenantIdNum).eq('rto_code', orgData.code);
          if (orgData.deliveryLocations.length > 0) {
            await supabase.from('tga_rto_delivery_locations').insert(
              orgData.deliveryLocations.map(loc => ({
                tenant_id: tenantIdNum,
                rto_code: orgData.code,
                location_name: loc.locationName,
                address_line_1: loc.addressLine1,
                address_line_2: loc.addressLine2,
                suburb: loc.suburb,
                state: loc.state,
                postcode: loc.postcode,
                country: loc.country,
                fetched_at: fetchedAt,
              }))
            );
          }

          // Delete and re-insert qualifications
          await supabase.from('tga_scope_qualifications').delete().eq('tenant_id', tenantIdNum).eq('rto_code', orgData.code);
          if (orgData.scope.qualifications.length > 0) {
            await supabase.from('tga_scope_qualifications').insert(
              orgData.scope.qualifications.map(q => ({
                tenant_id: tenantIdNum,
                rto_code: orgData.code,
                qualification_code: q.code,
                qualification_title: q.title,
                training_package_code: q.trainingPackageCode,
                training_package_title: q.trainingPackageTitle,
                scope_start_date: q.startDate,
                scope_end_date: q.endDate,
                status: q.status,
                is_current: q.isCurrent,
                extent: q.extent,
                delivery_notification: q.deliveryNotification,
                usage_recommendation: q.usageRecommendation,
                fetched_at: fetchedAt,
              }))
            );
          }

          // Delete and re-insert skill sets
          await supabase.from('tga_scope_skillsets').delete().eq('tenant_id', tenantIdNum).eq('rto_code', orgData.code);
          if (orgData.scope.skillSets.length > 0) {
            await supabase.from('tga_scope_skillsets').insert(
              orgData.scope.skillSets.map(s => ({
                tenant_id: tenantIdNum,
                rto_code: orgData.code,
                skillset_code: s.code,
                skillset_title: s.title,
                training_package_code: s.trainingPackageCode,
                scope_start_date: s.startDate,
                scope_end_date: s.endDate,
                status: s.status,
                is_current: s.isCurrent,
                extent: s.extent,
                usage_recommendation: s.usageRecommendation,
                fetched_at: fetchedAt,
              }))
            );
          }

          // Delete and re-insert units - ONLY EXPLICIT UNITS (already filtered in parseScope)
          await supabase.from('tga_scope_units').delete().eq('tenant_id', tenantIdNum).eq('rto_code', orgData.code);
          if (orgData.scope.units.length > 0) {
            await supabase.from('tga_scope_units').insert(
              orgData.scope.units.map(u => ({
                tenant_id: tenantIdNum,
                rto_code: orgData.code,
                unit_code: u.code,
                unit_title: u.title,
                training_package_code: u.trainingPackageCode,
                scope_start_date: u.startDate,
                scope_end_date: u.endDate,
                status: u.status,
                is_current: u.isCurrent,
                is_explicit: true, // These are explicitly on scope
                extent: u.extent,
                delivery_notification: u.deliveryNotification,
                usage_recommendation: u.usageRecommendation,
                fetched_at: fetchedAt,
              }))
            );
          }

          // Delete and re-insert courses
          await supabase.from('tga_scope_courses').delete().eq('tenant_id', tenantIdNum).eq('rto_code', orgData.code);
          if (orgData.scope.courses.length > 0) {
            await supabase.from('tga_scope_courses').insert(
              orgData.scope.courses.map(c => ({
                tenant_id: tenantIdNum,
                rto_code: orgData.code,
                course_code: c.code,
                course_title: c.title,
                scope_start_date: c.startDate,
                scope_end_date: c.endDate,
                status: c.status,
                is_current: c.isCurrent,
                extent: c.extent,
                delivery_notification: c.deliveryNotification,
                usage_recommendation: c.usageRecommendation,
                fetched_at: fetchedAt,
              }))
            );
          }

          log('info', 'Stored TGA data to tenant tables', {
            tenant_id: tenantIdNum,
            rto_code: orgData.code,
            contacts: orgData.contacts.length,
            addresses: orgData.addresses.length,
            deliveryLocations: orgData.deliveryLocations.length,
            qualifications: orgData.scope.qualifications.length,
            skillSets: orgData.scope.skillSets.length,
            units: orgData.scope.units.length,
            courses: orgData.scope.courses.length,
          });
        }

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
              last_sync_at: fetchedAt,
              last_sync_status: 'success',
              last_sync_error: null,
              updated_at: fetchedAt,
            }, { onConflict: 'client_id' })
            .select('id')
            .single();
          
          linkId = linkData?.id;
        }

        // Audit log
        if (tenantIdNum) {
          await supabase.from('client_audit_log').insert({
            tenant_id: tenantIdNum,
            entity_type: 'tga_integration',
            entity_id: client_id || rto_number,
            action: 'live_sync_completed',
            actor_user_id: user.id,
            details: {
              rto_number,
              legal_name: orgData.legalName,
              status: orgData.status,
              scope_counts: {
                qualifications: orgData.scope.qualifications.length,
                skillSets: orgData.scope.skillSets.length,
                units: orgData.scope.units.length,
                courses: orgData.scope.courses.length,
              },
            },
          });
        }

        log('info', 'Live client sync completed', { 
          rto_number, 
          legalName: orgData.legalName,
          scopeTotals: {
            quals: orgData.scope.qualifications.length,
            skills: orgData.scope.skillSets.length,
            units: orgData.scope.units.length,
            courses: orgData.scope.courses.length,
          }
        });

        return new Response(JSON.stringify({
          success: true,
          rto_number,
          link_id: linkId,
          rto_data: {
            legal_name: orgData.legalName,
            trading_name: orgData.tradingName,
            abn: orgData.abn,
            acn: orgData.acn,
            status: orgData.status,
            organisation_type: orgData.organisationType,
            web_address: orgData.webAddress,
            initial_registration_date: orgData.initialRegistrationDate,
            registration_start: orgData.registrationStartDate,
            registration_end: orgData.registrationEndDate,
          },
          scope_counts: {
            qualifications: orgData.scope.qualifications.length,
            skillSets: orgData.scope.skillSets.length,
            units: orgData.scope.units.length,
            courses: orgData.scope.courses.length,
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