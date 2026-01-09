import "https://deno.land/x/xhr@0.1.0/mod.ts";
import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2.49.4";

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Methods': 'POST, GET, OPTIONS',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type, x-action',
};

// TGA Production SOAP Endpoints - WCF basicHttpBinding (SOAP 1.1)
const TGA_ENV = Deno.env.get('TGA_ENV') || 'prod';
const isProduction = TGA_ENV === 'prod' || TGA_ENV === 'production';

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

function validateEndpoints() {
  for (const [name, url] of Object.entries(TGA_ENDPOINTS)) {
    if (!url.includes('V13.svc/')) {
      const error = `FATAL: ${name} endpoint missing V13.svc/ policy suffix: ${url}`;
      console.error(`[TGA-SYNC] ${error}`);
      throw new Error(error);
    }
  }
  console.log(`[TGA-SYNC] Endpoint validation passed - Environment: ${TGA_ENV}`);
}

validateEndpoints();

const TGA_V13_NAMESPACE = 'http://training.gov.au/services/13/';

const SOAP_ACTIONS = {
  getOrganisationDetails: `${TGA_V13_NAMESPACE}IOrganisationService/GetDetails`,
  searchOrganisation: `${TGA_V13_NAMESPACE}IOrganisationService/Search`,
  getTrainingComponentDetails: `${TGA_V13_NAMESPACE}ITrainingComponentService/GetDetails`,
  searchTrainingComponent: `${TGA_V13_NAMESPACE}ITrainingComponentService/Search`,
};

const FUNCTION_VERSION = '1.8.0';

// TGA State Code mapping
const TGA_STATE_CODES: Record<string, string> = {
  '01': 'NSW',
  '02': 'VIC',
  '03': 'QLD',
  '04': 'SA',
  '05': 'WA',
  '06': 'TAS',
  '07': 'NT',
  '08': 'ACT',
  '09': 'OT',
};

const STAGES = ['rto_summary', 'contacts', 'addresses', 'delivery_sites', 'scope_quals', 'scope_units', 'scope_skills', 'scope_courses'] as const;
type SyncStage = typeof STAGES[number];

const TGA_WS_USERNAME = Deno.env.get('TGA_USERNAME') || Deno.env.get('TGA_WS_USERNAME');
const TGA_WS_PASSWORD = Deno.env.get('TGA_PASSWORD') || Deno.env.get('TGA_WS_PASSWORD');

const SOAP_NS = {
  soap11: 'http://schemas.xmlsoap.org/soap/envelope/',
  wsse: 'http://docs.oasis-open.org/wss/2004/01/oasis-200401-wss-wssecurity-secext-1.0.xsd',
  wsu: 'http://docs.oasis-open.org/wss/2004/01/oasis-200401-wss-wssecurity-utility-1.0.xsd',
  tns: TGA_V13_NAMESPACE,
};

function escapeXml(unsafe: string): string {
  return unsafe
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&apos;');
}

// Decode XML/HTML entities (e.g. &amp; -> &, &#39; -> ', &quot; -> ")
function decodeXmlEntities(text: string | null): string | null {
  if (!text) return null;
  return text
    .replace(/&amp;/gi, '&')
    .replace(/&lt;/gi, '<')
    .replace(/&gt;/gi, '>')
    .replace(/&quot;/gi, '"')
    .replace(/&apos;/gi, "'")
    .replace(/&#39;/gi, "'")
    .replace(/&#x27;/gi, "'")
    .replace(/&#(\d+);/g, (_, dec) => String.fromCharCode(parseInt(dec, 10)))
    .replace(/&#x([0-9a-fA-F]+);/g, (_, hex) => String.fromCharCode(parseInt(hex, 16)));
}

// Strip all namespace prefixes from XML to normalize tag names
function stripXmlPrefixes(xml: string): string {
  return xml.replace(/<(\/?)\s*[A-Za-z0-9_]+:([A-Za-z0-9_\-]+)/g, '<$1$2');
}

// Generate unique correlation ID for request tracing
function generateCorrelationId(): string {
  return `tga-${Date.now()}-${Math.random().toString(36).substring(2, 8)}`;
}

// Log helper with correlation ID support
function log(level: 'info' | 'warn' | 'error', message: string, data?: Record<string, unknown>, correlationId?: string) {
  const sanitized = data ? { ...data } : {};
  delete sanitized.password;
  delete sanitized.credentials;
  delete sanitized.auth;
  const prefix = correlationId ? `[${correlationId}] ` : '';
  console.log(`[TGA-SYNC] [${level.toUpperCase()}] ${prefix}${message}`, JSON.stringify(sanitized));
}

function validateCredentials(): { valid: boolean; error?: string } {
  if (!TGA_WS_USERNAME) {
    return { valid: false, error: 'TGA_WS_USERNAME secret not configured' };
  }
  if (!TGA_WS_PASSWORD) {
    return { valid: false, error: 'TGA_WS_PASSWORD secret not configured' };
  }
  return { valid: true };
}

function buildWsSecurityHeader(): string {
  const validation = validateCredentials();
  if (!validation.valid) {
    throw new Error(validation.error || 'TGA credentials not configured');
  }
  
  const now = new Date();
  const expires = new Date(now.getTime() + 5 * 60 * 1000);
  
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

// ==================== REGEX-BASED XML PARSING ====================

// Extract single value from XML (namespace-agnostic, decodes entities)
function extractValue(xml: string, tagName: string): string | null {
  // Patterns to handle namespaced and non-namespaced tags
  const patterns = [
    // Namespaced: <ns:TagName>value</ns:TagName>
    new RegExp(`<[A-Za-z0-9_]+:${tagName}[^>]*>([^<]*)</[A-Za-z0-9_]+:${tagName}>`, 'i'),
    // Non-namespaced: <TagName>value</TagName>
    new RegExp(`<${tagName}[^>]*>([^<]*)</${tagName}>`, 'i'),
  ];
  for (const pattern of patterns) {
    const match = xml.match(pattern);
    if (match) {
      const raw = match[1].trim();
      return raw ? decodeXmlEntities(raw) : null;
    }
  }
  return null;
}

// Check if a tag exists in the XML (any namespace)
function tagExists(xml: string, tagName: string): boolean {
  // Match <TagName or <ns:TagName
  const pattern = new RegExp(`<(?:[A-Za-z0-9_]+:)?${tagName}[\\s>]`, 'i');
  return pattern.test(xml);
}

// Extract a section of XML by tag name (gets content between tags)
function extractSection(xml: string, tagName: string): string | null {
  const pattern = new RegExp(`<(?:\\w+:)?${tagName}[^>]*>([\\s\\S]*?)</(?:\\w+:)?${tagName}>`, 'i');
  const match = xml.match(pattern);
  return match ? match[1] : null;
}

// Extract the full tag including its content
function extractFullTag(xml: string, tagName: string): string | null {
  const pattern = new RegExp(`<(?:\\w+:)?${tagName}[^>]*>[\\s\\S]*?</(?:\\w+:)?${tagName}>`, 'i');
  const match = xml.match(pattern);
  return match ? match[0] : null;
}

// Extract all occurrences of a tag (returns full tag with content)
function extractAllTags(xml: string, tagName: string): string[] {
  const results: string[] = [];
  const pattern = new RegExp(`<(?:\\w+:)?${tagName}[^>]*>[\\s\\S]*?</(?:\\w+:)?${tagName}>`, 'gi');
  let match;
  while ((match = pattern.exec(xml)) !== null) {
    results.push(match[0]);
  }
  return results;
}

// ==================== DATA INTERFACES ====================

interface ParsedContact {
  contactType: string;
  contactTypeRaw: string | null; // Store raw type for debugging
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
  contacts: ParsedContact[];
  addresses: ParsedAddress[];
  deliveryLocations: ParsedDeliveryLocation[];
  scope: ParsedScope;
}

interface SectionPresence {
  contacts: boolean;
  addresses: boolean;
  locations: boolean;
  qualifications: boolean;
  skillSets: boolean;
  units: boolean;
  courses: boolean;
}

// ==================== REGEX-BASED PARSING FUNCTIONS ====================

function parseContacts(xml: string, correlationId?: string): ParsedContact[] {
  const contacts: ParsedContact[] = [];
  const today = new Date().toISOString().split('T')[0];
  const normalized = stripXmlPrefixes(xml);
  
  log('info', 'Parsing contacts with enhanced regex', {}, correlationId);
  
  // TGA uses specific contact containers like ContactChiefExecutive, ContactPublicEnquiries
  const contactTypeContainers = [
    { container: 'ContactChiefExecutive', type: 'ChiefExecutive' },
    { container: 'ContactPublicEnquiries', type: 'PublicEnquiries' },
    { container: 'ContactRegistrationEnquiries', type: 'RegistrationEnquiries' },
    { container: 'ChiefExecutive', type: 'ChiefExecutive' },
    { container: 'PublicEnquiries', type: 'PublicEnquiries' },
    { container: 'RegistrationEnquiries', type: 'RegistrationEnquiries' },
  ];
  
  const seenContacts = new Set<string>(); // Track by name+email to avoid duplicates
  
  // First, try specific contact type containers (TGA standard format)
  for (const { container, type } of contactTypeContainers) {
    const containerXml = extractFullTag(normalized, container);
    if (containerXml) {
      log('info', `Found contact container: ${container}`, { sampleLength: containerXml.length }, correlationId);
      
      // Check if contact is current
      const endDate = extractValue(containerXml, 'EndDate') || extractValue(containerXml, 'EffectiveTo');
      if (endDate && endDate < today) continue;
      
      const name = extractValue(containerXml, 'Name') || 
                  extractValue(containerXml, 'FullName') ||
                  extractValue(containerXml, 'ContactName') ||
                  [extractValue(containerXml, 'FirstName'), extractValue(containerXml, 'LastName')].filter(Boolean).join(' ') || 
                  null;
      
      const email = extractValue(containerXml, 'Email') || extractValue(containerXml, 'EmailAddress');
      const contactKey = `${name || ''}|${email || ''}`;
      
      if ((name || email || extractValue(containerXml, 'Phone')) && !seenContacts.has(contactKey)) {
        seenContacts.add(contactKey);
        contacts.push({
          contactType: type,
          contactTypeRaw: container,
          name,
          position: extractValue(containerXml, 'Position') || extractValue(containerXml, 'JobTitle') || extractValue(containerXml, 'Title'),
          phone: extractValue(containerXml, 'Phone') || extractValue(containerXml, 'PhoneNumber') || extractValue(containerXml, 'BusinessPhone') || extractValue(containerXml, 'Telephone'),
          mobile: extractValue(containerXml, 'Mobile') || extractValue(containerXml, 'MobileNumber') || extractValue(containerXml, 'MobilePhone'),
          fax: extractValue(containerXml, 'Fax') || extractValue(containerXml, 'FaxNumber'),
          email,
          address: extractValue(containerXml, 'Address') || extractValue(containerXml, 'StreetAddress'),
          organisationName: extractValue(containerXml, 'OrganisationName') || extractValue(containerXml, 'Organisation'),
        });
        log('info', `Added contact from container ${container}`, { type, name }, correlationId);
      }
    }
  }
  
  // Also try generic Contact elements in Contacts container
  const contactsSection = extractSection(normalized, 'Contacts') || normalized;
  const contactElements = extractAllTags(contactsSection, 'Contact');
  
  if (contactElements.length > 0) {
    log('info', `Found ${contactElements.length} generic Contact elements`, {}, correlationId);
    
    // Debug: log first contact's structure
    if (contactElements.length > 0 && contacts.length === 0) {
      const sample = contactElements[0].substring(0, 2000);
      log('info', 'First Contact XML sample', { sample }, correlationId);
    }
  }
  
  for (const contactXml of contactElements) {
    // Check if contact is current
    const endDate = extractValue(contactXml, 'EndDate') || extractValue(contactXml, 'EffectiveTo');
    if (endDate && endDate < today) continue;
    
    // Extract contact details first
    const name = extractValue(contactXml, 'Name') || 
                extractValue(contactXml, 'FullName') ||
                extractValue(contactXml, 'ContactName') ||
                [extractValue(contactXml, 'FirstName'), extractValue(contactXml, 'LastName')].filter(Boolean).join(' ') || 
                null;
    const email = extractValue(contactXml, 'Email') || extractValue(contactXml, 'EmailAddress');
    const position = extractValue(contactXml, 'Position') || extractValue(contactXml, 'JobTitle') || extractValue(contactXml, 'Title');
    
    // Try to determine contact type from various sources
    let rawType = '';
    
    // Approach 1: Look for Type/ContactType with nested Code/Description
    const typeContainer = extractFullTag(contactXml, 'Type') || extractFullTag(contactXml, 'ContactType');
    if (typeContainer) {
      rawType = extractValue(typeContainer, 'Code') || 
                extractValue(typeContainer, 'Description') || 
                extractValue(typeContainer, 'Name') || '';
    }
    
    // Approach 2: Look for direct ContactTypeCode or TypeCode
    if (!rawType) {
      rawType = extractValue(contactXml, 'ContactTypeCode') ||
                extractValue(contactXml, 'TypeCode') ||
                extractValue(contactXml, 'ContactTypeName') ||
                extractValue(contactXml, 'TypeName') || '';
    }
    
    // Approach 3: Look for type attribute or simple text in Type element
    if (!rawType) {
      const typeMatch = contactXml.match(/<(?:\w+:)?Type[^>]*>([^<]+)</i) ||
                        contactXml.match(/<(?:\w+:)?ContactType[^>]*>([^<]+)</i);
      if (typeMatch) rawType = typeMatch[1].trim();
    }
    
    // Infer contact type from position if no type found
    let normalizedType = '';
    const positionLower = (position || '').toLowerCase();
    const emailLower = (email || '').toLowerCase();
    const rawTypeLower = rawType.toLowerCase();
    
    // Priority 1: Check if rawType has useful info
    if (rawTypeLower.includes('chief') || rawTypeLower.includes('ceo') || 
        rawTypeLower.includes('executive') || rawTypeLower === 'ce' || rawTypeLower === 'cex') {
      normalizedType = 'ChiefExecutive';
    } else if (rawTypeLower.includes('public') || rawTypeLower === 'pe' || rawTypeLower === 'pub') {
      normalizedType = 'PublicEnquiries';
    } else if (rawTypeLower.includes('registration') || rawTypeLower === 're' || rawTypeLower === 'reg') {
      normalizedType = 'RegistrationEnquiries';
    }
    
    // Priority 2: Infer from position title
    if (!normalizedType) {
      if (positionLower.includes('ceo') || positionLower.includes('chief executive') || 
          positionLower.includes('managing director') || positionLower.includes('principal')) {
        normalizedType = 'ChiefExecutive';
      } else if (positionLower.includes('compliance') || positionLower.includes('quality') || 
                 positionLower.includes('registration') || positionLower.includes('rto manager')) {
        normalizedType = 'RegistrationEnquiries';
      } else if (positionLower.includes('admin') || positionLower.includes('reception') || 
                 positionLower.includes('enquir') || positionLower.includes('customer')) {
        normalizedType = 'PublicEnquiries';
      } else if (positionLower.includes('director') || positionLower.includes('manager')) {
        normalizedType = 'Administrative';
      } else if (positionLower.includes('training') || positionLower.includes('educator') ||
                 positionLower.includes('teacher') || positionLower.includes('facilitator')) {
        normalizedType = 'Training';
      }
    }
    
    // Priority 3: Infer from email patterns
    if (!normalizedType && email) {
      if (emailLower.includes('ceo@') || emailLower.includes('chief@') || emailLower.includes('director@')) {
        normalizedType = 'ChiefExecutive';
      } else if (emailLower.includes('compliance@') || emailLower.includes('registration@') || 
                 emailLower.includes('quality@')) {
        normalizedType = 'RegistrationEnquiries';
      } else if (emailLower.includes('info@') || emailLower.includes('admin@') || 
                 emailLower.includes('enquiries@') || emailLower.includes('hello@')) {
        normalizedType = 'PublicEnquiries';
      }
    }
    
    // Fallback: use raw type as-is if meaningful, otherwise Unknown
    if (!normalizedType) {
      if (rawType && rawType !== '0' && rawType.length > 1) {
        normalizedType = rawType;
      } else {
        normalizedType = 'Unknown';
      }
    }
    
    const contactKey = `${name || ''}|${email || ''}`;
    
    // Only add if we have meaningful data and haven't seen this contact
    if ((name || email) && !seenContacts.has(contactKey)) {
      seenContacts.add(contactKey);
      
      const contact: ParsedContact = {
        contactType: normalizedType,
        contactTypeRaw: rawType || null,
        name,
        position,
        phone: extractValue(contactXml, 'Phone') || extractValue(contactXml, 'PhoneNumber') || extractValue(contactXml, 'BusinessPhone') || extractValue(contactXml, 'Telephone'),
        mobile: extractValue(contactXml, 'Mobile') || extractValue(contactXml, 'MobileNumber') || extractValue(contactXml, 'MobilePhone'),
        fax: extractValue(contactXml, 'Fax') || extractValue(contactXml, 'FaxNumber'),
        email,
        address: extractValue(contactXml, 'Address') || extractValue(contactXml, 'StreetAddress'),
        organisationName: extractValue(contactXml, 'OrganisationName') || extractValue(contactXml, 'Organisation'),
      };
      
      if (contacts.length < 20) { // Reasonable limit
        contacts.push(contact);
        log('info', 'Parsed contact', { 
          type: normalizedType, 
          rawType, 
          name, 
          position,
          hasPhone: !!contact.phone, 
          hasEmail: !!contact.email 
        }, correlationId);
      }
    }
  }
  
  log('info', `Contact parsing complete: ${contacts.length} contacts`, 
      { types: contacts.map(c => c.contactType) }, correlationId);
  return contacts;
}

function parseAddresses(xml: string, correlationId?: string): ParsedAddress[] {
  const addresses: ParsedAddress[] = [];
  const normalized = stripXmlPrefixes(xml);
  
  log('info', 'Parsing addresses with regex', {}, correlationId);
  
  // Look for specific address type containers
  const addressMappings = [
    { tags: ['HeadOfficeLocation', 'HeadOfficePhysicalAddress', 'PhysicalAddress'], type: 'HeadOffice' },
    { tags: ['HeadOfficePostalAddress', 'PostalAddress'], type: 'Postal' },
    { tags: ['BusinessAddress'], type: 'Business' },
  ];
  
  const seenTypes = new Set<string>();
  
  for (const { tags, type } of addressMappings) {
    if (seenTypes.has(type)) continue;
    
    for (const tag of tags) {
      const section = extractFullTag(normalized, tag);
      if (section) {
        const line1 = extractValue(section, 'Line1') || extractValue(section, 'AddressLine1') || 
                     extractValue(section, 'Street') || extractValue(section, 'StreetAddress');
        const suburb = extractValue(section, 'Suburb') || extractValue(section, 'City') || extractValue(section, 'Locality');
        
        if (line1 || suburb) {
          seenTypes.add(type);
          addresses.push({
            addressType: type,
            addressLine1: line1,
            addressLine2: extractValue(section, 'Line2') || extractValue(section, 'AddressLine2'),
            suburb,
            state: extractValue(section, 'State') || extractValue(section, 'StateTerritory') || extractValue(section, 'StateCode'),
            postcode: extractValue(section, 'Postcode') || extractValue(section, 'PostCode'),
            country: extractValue(section, 'Country'),
            phone: extractValue(section, 'Phone') || extractValue(section, 'PhoneNumber'),
            fax: extractValue(section, 'Fax') || extractValue(section, 'FaxNumber'),
            email: extractValue(section, 'Email') || extractValue(section, 'EmailAddress'),
            website: extractValue(section, 'Website') || extractValue(section, 'WebAddress'),
          });
          log('info', `Added ${type} address`, { line1, suburb }, correlationId);
          break;
        }
      }
    }
  }
  
  // Also look for Address elements in an Addresses container
  const addressesSection = extractSection(normalized, 'Addresses');
  if (addressesSection) {
    const addressElements = extractAllTags(addressesSection, 'Address');
    for (const addrXml of addressElements) {
      const addrType = extractValue(addrXml, 'AddressType') || extractValue(addrXml, 'Type') || 'Unknown';
      if (!seenTypes.has(addrType)) {
        const line1 = extractValue(addrXml, 'Line1') || extractValue(addrXml, 'AddressLine1');
        const suburb = extractValue(addrXml, 'Suburb') || extractValue(addrXml, 'Locality');
        if (line1 || suburb) {
          seenTypes.add(addrType);
          addresses.push({
            addressType: addrType,
            addressLine1: line1,
            addressLine2: extractValue(addrXml, 'Line2') || extractValue(addrXml, 'AddressLine2'),
            suburb,
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
  }
  
  log('info', `Address parsing complete: ${addresses.length} addresses`, { types: addresses.map(a => a.addressType) }, correlationId);
  return addresses;
}

function parseDeliveryLocations(xml: string, correlationId?: string, logRawSample = false): { locations: ParsedDeliveryLocation[]; rawSample?: string } {
  const locations: ParsedDeliveryLocation[] = [];
  const normalized = stripXmlPrefixes(xml);
  let rawSample: string | undefined;
  
  log('info', 'Parsing delivery locations with regex', {}, correlationId);
  
  // TGA uses OrganisationLocation elements with nested Address
  // Format: <OrganisationLocation><Address><Line1>...</Line1><Suburb>...</Suburb>...</Address></OrganisationLocation>
  const orgLocationElements = extractAllTags(normalized, 'OrganisationLocation');
  
  if (orgLocationElements.length > 0) {
    log('info', `Found ${orgLocationElements.length} OrganisationLocation elements`, {}, correlationId);
    if (logRawSample) {
      rawSample = orgLocationElements[0].substring(0, 2000);
    }
    
    const today = new Date().toISOString().split('T')[0];
    const seenLocations = new Set<string>();
    
    for (const locXml of orgLocationElements) {
      // Check if location is current (no EndDate or EndDate >= today)
      const endDate = extractValue(locXml, 'EndDate');
      if (endDate && endDate < today) {
        continue; // Skip expired locations
      }
      
      // Extract address from nested Address element
      const addressXml = extractFullTag(locXml, 'Address') || locXml;
      
      const line1 = extractValue(addressXml, 'Line1') || 
                   extractValue(addressXml, 'AddressLine1') ||
                   extractValue(addressXml, 'Street');
      const line2 = extractValue(addressXml, 'Line2') || extractValue(addressXml, 'AddressLine2');
      const suburb = extractValue(addressXml, 'Suburb') || extractValue(addressXml, 'Locality');
      const postcode = extractValue(addressXml, 'Postcode') || extractValue(addressXml, 'PostCode');
      
      // StateCode is numeric in TGA, map to abbreviation
      const stateCode = extractValue(addressXml, 'StateCode') || extractValue(addressXml, 'State');
      const state = stateCode ? (TGA_STATE_CODES[stateCode] || stateCode) : null;
      
      // CountryCode 1101 = Australia
      const countryCode = extractValue(addressXml, 'CountryCode');
      const country = countryCode === '1101' ? 'Australia' : (countryCode || null);
      
      // Create unique key to avoid duplicates
      const key = `${line1 || ''}|${suburb || ''}|${postcode || ''}`;
      
      if ((line1 || suburb) && !seenLocations.has(key)) {
        seenLocations.add(key);
        locations.push({
          locationName: extractValue(locXml, 'LocationName') || extractValue(locXml, 'Name') || suburb || null,
          addressLine1: line1,
          addressLine2: line2,
          suburb,
          state,
          postcode,
          country,
        });
      }
    }
  }
  
  // Fallback: also check for DeliveryLocation, Location, etc.
  if (locations.length === 0) {
    const containerNames = ['DeliveryLocations', 'Locations', 'SiteLocations', 'TrainingLocations'];
    let containerXml: string | null = null;
    
    for (const name of containerNames) {
      containerXml = extractSection(normalized, name);
      if (containerXml) {
        log('info', `Found locations container: ${name}`, { length: containerXml.length }, correlationId);
        if (logRawSample && !rawSample) {
          rawSample = containerXml.substring(0, 2000);
        }
        break;
      }
    }
    
    const searchXml = containerXml || normalized;
    const locationNames = ['DeliveryLocation', 'Location', 'Site', 'TrainingLocation', 'SiteLocation'];
    const seenLocations = new Set<string>();
    
    for (const locName of locationNames) {
      const locationElements = extractAllTags(searchXml, locName);
      
      if (locationElements.length > 0 && locations.length === 0) {
        log('info', `Found ${locationElements.length} ${locName} elements`, {}, correlationId);
        if (logRawSample && !rawSample) {
          rawSample = locationElements[0].substring(0, 1500);
        }
      }
      
      for (const locXml of locationElements) {
        const locationName = extractValue(locXml, 'Name') || 
                            extractValue(locXml, 'LocationName') || 
                            extractValue(locXml, 'SiteName') || 
                            extractValue(locXml, 'Description') ||
                            extractValue(locXml, 'Title');
        
        const line1 = extractValue(locXml, 'Line1') || 
                     extractValue(locXml, 'AddressLine1') ||
                     extractValue(locXml, 'Street') || 
                     extractValue(locXml, 'StreetAddress') ||
                     extractValue(locXml, 'Address');
        
        const suburb = extractValue(locXml, 'Suburb') || 
                      extractValue(locXml, 'Locality') || 
                      extractValue(locXml, 'City');
        
        const postcode = extractValue(locXml, 'Postcode') || extractValue(locXml, 'PostCode');
        const stateCode = extractValue(locXml, 'State') || extractValue(locXml, 'StateCode') || extractValue(locXml, 'StateTerritory');
        const state = stateCode ? (TGA_STATE_CODES[stateCode] || stateCode) : null;
        
        const key = `${locationName || ''}|${line1 || ''}|${suburb || ''}|${postcode || ''}`;
        
        if ((locationName || line1 || suburb) && !seenLocations.has(key)) {
          seenLocations.add(key);
          locations.push({
            locationName,
            addressLine1: line1,
            addressLine2: extractValue(locXml, 'Line2') || extractValue(locXml, 'AddressLine2'),
            suburb,
            state,
            postcode,
            country: extractValue(locXml, 'Country'),
          });
        }
      }
    }
  }
  
  log('info', `Delivery locations parsing complete: ${locations.length} locations`, {}, correlationId);
  return { locations, rawSample };
}

function parseScope(xml: string, correlationId?: string): ParsedScope {
  const scope: ParsedScope = {
    qualifications: [],
    skillSets: [],
    units: [],
    courses: [],
  };
  const normalized = stripXmlPrefixes(xml);
  
  log('info', 'Parsing scope with regex', {}, correlationId);
  
  const parseScopeItem = (itemXml: string, isExplicitDefault: boolean): ParsedScopeItem | null => {
    const code = extractValue(itemXml, 'Code') || extractValue(itemXml, 'NrtCode') || 
                extractValue(itemXml, 'TrainingComponentCode') || extractValue(itemXml, 'NationalCode');
    if (!code) return null;
    
    const isExplicitVal = extractValue(itemXml, 'IsExplicit') || extractValue(itemXml, 'Explicit');
    const isExplicit = isExplicitVal ? isExplicitVal.toLowerCase() === 'true' : isExplicitDefault;
    
    return {
      code,
      title: extractValue(itemXml, 'Title') || extractValue(itemXml, 'Name') || extractValue(itemXml, 'Description'),
      status: extractValue(itemXml, 'Status') || extractValue(itemXml, 'ScopeStatus') || extractValue(itemXml, 'NrtStatus'),
      usageRecommendation: extractValue(itemXml, 'UsageRecommendation') || extractValue(itemXml, 'Recommendation'),
      extent: extractValue(itemXml, 'Extent') || extractValue(itemXml, 'ScopeExtent') || extractValue(itemXml, 'DeliveryScope'),
      startDate: extractValue(itemXml, 'StartDate') || extractValue(itemXml, 'ScopeStartDate') || extractValue(itemXml, 'EffectiveFrom'),
      endDate: extractValue(itemXml, 'EndDate') || extractValue(itemXml, 'ScopeEndDate') || extractValue(itemXml, 'EffectiveTo'),
      deliveryNotification: extractValue(itemXml, 'DeliveryNotification') || extractValue(itemXml, 'NotificationRequired'),
      trainingPackageCode: extractValue(itemXml, 'TrainingPackageCode') || extractValue(itemXml, 'ParentCode'),
      trainingPackageTitle: extractValue(itemXml, 'TrainingPackageTitle') || extractValue(itemXml, 'ParentTitle'),
      isExplicit,
      isCurrent: extractValue(itemXml, 'IsCurrent')?.toLowerCase() === 'true' || 
                extractValue(itemXml, 'Status')?.toLowerCase() === 'current',
    };
  };
  
  // Parse qualifications
  const qualContainerNames = ['RtoDeliveredQualifications', 'Qualifications', 'QualificationScope'];
  for (const containerName of qualContainerNames) {
    const container = extractSection(normalized, containerName);
    if (container) {
      const itemTags = ['RtoDeliveredQualification', 'Qualification', 'TrainingComponent'];
      for (const tag of itemTags) {
        const items = extractAllTags(container, tag);
        for (const itemXml of items) {
          const item = parseScopeItem(itemXml, true);
          if (item && !scope.qualifications.some(q => q.code === item.code)) {
            scope.qualifications.push(item);
          }
        }
      }
      break;
    }
  }
  
  // Parse skill sets
  const skillContainerNames = ['RtoDeliveredSkillSets', 'SkillSets', 'SkillSetScope'];
  for (const containerName of skillContainerNames) {
    const container = extractSection(normalized, containerName);
    if (container) {
      const itemTags = ['RtoDeliveredSkillSet', 'SkillSet'];
      for (const tag of itemTags) {
        const items = extractAllTags(container, tag);
        for (const itemXml of items) {
          const item = parseScopeItem(itemXml, true);
          if (item && !scope.skillSets.some(s => s.code === item.code)) {
            scope.skillSets.push(item);
          }
        }
      }
      break;
    }
  }
  
  // Parse units - only explicit ones
  const unitContainerNames = ['RtoDeliveredUnits', 'Units', 'ExplicitUnits', 'UnitScope'];
  for (const containerName of unitContainerNames) {
    const container = extractSection(normalized, containerName);
    if (container) {
      const itemTags = ['RtoDeliveredUnit', 'Unit', 'UnitOfCompetency'];
      for (const tag of itemTags) {
        const items = extractAllTags(container, tag);
        for (const itemXml of items) {
          const item = parseScopeItem(itemXml, false);
          if (item && item.isExplicit && !scope.units.some(u => u.code === item.code)) {
            scope.units.push(item);
          }
        }
      }
      break;
    }
  }
  
  // Parse accredited courses
  const courseContainerNames = ['RtoDeliveredAccreditedCourses', 'AccreditedCourses', 'Courses'];
  for (const containerName of courseContainerNames) {
    const container = extractSection(normalized, containerName);
    if (container) {
      const itemTags = ['RtoDeliveredAccreditedCourse', 'AccreditedCourse', 'Course'];
      for (const tag of itemTags) {
        const items = extractAllTags(container, tag);
        for (const itemXml of items) {
          const item = parseScopeItem(itemXml, true);
          if (item && !scope.courses.some(c => c.code === item.code)) {
            scope.courses.push(item);
          }
        }
      }
      break;
    }
  }
  
  log('info', 'Scope parsing complete', {
    qualifications: scope.qualifications.length,
    skillSets: scope.skillSets.length,
    units: scope.units.length,
    courses: scope.courses.length,
  }, correlationId);
  
  return scope;
}

// Check which sections are present in XML (for safety guardrails)
function checkSectionPresence(xml: string): SectionPresence {
  const normalized = stripXmlPrefixes(xml);
  return {
    contacts: normalized.includes('<Contact') || normalized.includes('ChiefExecutive') || normalized.includes('PublicEnquiries'),
    addresses: normalized.includes('<Address') || normalized.includes('HeadOffice') || normalized.includes('PhysicalAddress'),
    locations: normalized.includes('DeliveryLocation') || normalized.includes('Locations>') || normalized.includes('SiteLocation'),
    qualifications: normalized.includes('Qualification') || normalized.includes('RtoDeliveredQualification'),
    skillSets: normalized.includes('SkillSet') || normalized.includes('RtoDeliveredSkillSet'),
    units: normalized.includes('Unit') || normalized.includes('RtoDeliveredUnit'),
    courses: normalized.includes('AccreditedCourse') || normalized.includes('RtoDeliveredAccreditedCourse'),
  };
}

// Parse and debug organisation summary from XML (node-scoped)
function parseSummary(xml: string, canonicalRtoCode: string, correlationId?: string): {
  summary: Pick<ParsedOrganisation,
    'code' | 'legalName' | 'tradingName' | 'organisationType' | 'abn' | 'acn' | 'status' | 'webAddress' |
    'initialRegistrationDate' | 'registrationStartDate' | 'registrationEndDate'
  > | null;
  fieldPresence: Record<string, boolean>;
  extractedFrom: Record<string, string | null>;
  orgNodeExcerpt: string | null;
} {
  const normalized = stripXmlPrefixes(xml);

  // Prefer an Organisation node that matches the canonical code.
  const orgNodes = extractAllTags(normalized, 'Organisation');
  let orgNode: string | null = null;

  for (const node of orgNodes) {
    const code = extractValue(node, 'Code') || extractValue(node, 'RtoCode') || extractValue(node, 'NationalProviderId');
    if (code && code.toString().trim() === canonicalRtoCode) {
      orgNode = node;
      break;
    }
  }

  // Fallback: try OrganisationDetails, otherwise any Organisation
  orgNode ||= extractFullTag(normalized, 'OrganisationDetails') || extractFullTag(normalized, 'Organisation') || null;

  const scoped = orgNode || normalized;

  // Helper to check tag presence using the new tagExists function
  const checkTag = (tag: string) => tagExists(scoped, tag);
  
  // Track which tag each field was extracted from
  const extractedFrom: Record<string, string | null> = {};
  
  // Extract with tracking
  const extractWithSource = (tags: string[]): { value: string | null; source: string | null } => {
    for (const tag of tags) {
      if (checkTag(tag)) {
        const val = extractValue(scoped, tag);
        if (val) return { value: val, source: tag };
      }
    }
    // Check if any tag exists but has no value (empty tag)
    for (const tag of tags) {
      if (checkTag(tag)) {
        return { value: null, source: `${tag}:empty` };
      }
    }
    return { value: null, source: null };
  };

  const legalNameResult = extractWithSource(['LegalName', 'OrganisationLegalName', 'OrganisationName', 'Name']);
  const tradingNameResult = extractWithSource(['TradingName', 'TradingAs', 'BusinessName']);
  const abnResult = extractWithSource(['ABN', 'Abn', 'AustralianBusinessNumber', 'BusinessNumber']);
  const acnResult = extractWithSource(['ACN', 'Acn', 'AustralianCompanyNumber', 'CompanyNumber']);
  const webAddressResult = extractWithSource(['WebAddress', 'Website', 'WebSiteAddress', 'HomePage', 'Url', 'URL']);
  const organisationTypeResult = extractWithSource(['OrganisationType', 'OrganisationTypeDescription', 'OrganisationTypeCode', 'OrgType']);
  const statusResult = extractWithSource(['Status', 'RegistrationStatus', 'CurrentStatus']);
  const initialRegDateResult = extractWithSource(['InitialRegistrationDate', 'FirstRegistered']);
  const regStartDateResult = extractWithSource(['RegistrationStartDate', 'CurrentRegistrationStart']);
  const regEndDateResult = extractWithSource(['RegistrationEndDate', 'RegistrationExpiryDate']);

  extractedFrom.LegalName = legalNameResult.source;
  extractedFrom.TradingName = tradingNameResult.source;
  extractedFrom.ABN = abnResult.source;
  extractedFrom.ACN = acnResult.source;
  extractedFrom.WebAddress = webAddressResult.source;
  extractedFrom.OrganisationType = organisationTypeResult.source;
  extractedFrom.Status = statusResult.source;
  extractedFrom.InitialRegistrationDate = initialRegDateResult.source;
  extractedFrom.RegistrationStartDate = regStartDateResult.source;
  extractedFrom.RegistrationEndDate = regEndDateResult.source;

  const legalName = legalNameResult.value;
  const tradingName = tradingNameResult.value;
  const abn = abnResult.value;
  const acn = acnResult.value;
  const webAddress = webAddressResult.value;
  const organisationType = organisationTypeResult.value;
  const status = statusResult.value;
  const initialRegistrationDate = initialRegDateResult.value;
  const registrationStartDate = regStartDateResult.value;
  const registrationEndDate = regEndDateResult.value;

  // Field presence: true if any relevant tag exists in XML
  const fieldPresence: Record<string, boolean> = {
    LegalName: checkTag('LegalName') || checkTag('OrganisationLegalName') || checkTag('OrganisationName') || checkTag('Name'),
    TradingName: checkTag('TradingName') || checkTag('TradingAs') || checkTag('BusinessName'),
    ABN: checkTag('ABN') || checkTag('Abn') || checkTag('AustralianBusinessNumber') || checkTag('BusinessNumber'),
    ACN: checkTag('ACN') || checkTag('Acn') || checkTag('AustralianCompanyNumber') || checkTag('CompanyNumber'),
    WebAddress: checkTag('WebAddress') || checkTag('Website') || checkTag('WebSiteAddress') || checkTag('HomePage') || checkTag('Url') || checkTag('URL'),
    OrganisationType: checkTag('OrganisationType') || checkTag('OrganisationTypeDescription') || checkTag('OrganisationTypeCode') || checkTag('OrgType'),
    Status: checkTag('Status') || checkTag('RegistrationStatus') || checkTag('CurrentStatus'),
    InitialRegistrationDate: checkTag('InitialRegistrationDate') || checkTag('FirstRegistered'),
    RegistrationStartDate: checkTag('RegistrationStartDate') || checkTag('CurrentRegistrationStart'),
    RegistrationEndDate: checkTag('RegistrationEndDate') || checkTag('RegistrationExpiryDate'),
  };

  if (!legalName) {
    log('error', 'No legal name found in organisation response (scoped)', { canonicalRtoCode, fieldPresence, extractedFrom }, correlationId);
    return { summary: null, fieldPresence, extractedFrom, orgNodeExcerpt: orgNode ? orgNode.slice(0, 3000) : null };
  }

  log('info', 'Parsed org summary fields (scoped)', {
    canonicalRtoCode,
    legalName,
    tradingName: tradingName ?? 'null',
    abn: abn ?? 'null',
    acn: acn ?? 'null',
    webAddress: webAddress ?? 'null',
    organisationType: organisationType ?? 'null',
    status: status ?? 'null',
    extractedFrom,
  }, correlationId);

  return {
    summary: {
      code: canonicalRtoCode,
      legalName,
      tradingName,
      organisationType,
      abn,
      acn,
      status,
      webAddress,
      initialRegistrationDate,
      registrationStartDate,
      registrationEndDate,
    },
    fieldPresence,
    extractedFrom,
    orgNodeExcerpt: orgNode ? orgNode.slice(0, 3000) : null,
  };
}

// Generate SHA256 hash for raw XML (async not available here, use simple hash)
function simpleHash(str: string): string {
  let hash = 0;
  for (let i = 0; i < str.length; i++) {
    const char = str.charCodeAt(i);
    hash = ((hash << 5) - hash) + char;
    hash = hash & hash;
  }
  return Math.abs(hash).toString(16).padStart(8, '0');
}

function buildSummaryDebugPayload(xml: string, canonicalRtoCode: string, correlationId?: string) {
  // Store up to 50k chars of raw XML for complete proof
  const rawXmlExcerpt = xml.slice(0, 50000);
  const rawXmlHash = simpleHash(xml);
  const { summary, fieldPresence, extractedFrom, orgNodeExcerpt } = parseSummary(xml, canonicalRtoCode, correlationId);

  // Track which fields were present in XML but could not be parsed
  const parseFailed: string[] = [];
  const missing: string[] = [];
  
  for (const [field, present] of Object.entries(fieldPresence)) {
    if (present) {
      // Field tag exists in XML - check if we got a value
      const summaryValue = summary ? (summary as Record<string, unknown>)[
        field === 'LegalName' ? 'legalName' :
        field === 'TradingName' ? 'tradingName' :
        field === 'ABN' ? 'abn' :
        field === 'ACN' ? 'acn' :
        field === 'WebAddress' ? 'webAddress' :
        field === 'OrganisationType' ? 'organisationType' :
        field === 'Status' ? 'status' :
        field === 'InitialRegistrationDate' ? 'initialRegistrationDate' :
        field === 'RegistrationStartDate' ? 'registrationStartDate' :
        field === 'RegistrationEndDate' ? 'registrationEndDate' : field
      ] : null;
      
      if (!summaryValue && summaryValue !== false) {
        parseFailed.push(field);
      }
    } else {
      missing.push(field);
    }
  }

  return {
    endpoint: 'GetDetails',
    rawXml: rawXmlExcerpt,
    rawXmlLength: xml.length,
    rawXmlHash,
    orgNodeExcerpt,
    fieldPresence,
    extractedFrom,
    extractedSummary: summary,
    missingFields: missing,
    parseFailedFields: parseFailed,
  };
}

// Parse organisation from XML
function parseOrganisation(xml: string, canonicalRtoCode: string, correlationId?: string): ParsedOrganisation | null {
  const normalized = stripXmlPrefixes(xml);

  log('info', 'Parsing organisation with regex', { canonicalRtoCode }, correlationId);

  // RTO code from XML (for warnings only)
  const xmlCode = extractValue(normalized, 'Code') || extractValue(normalized, 'RtoCode') || extractValue(normalized, 'NationalProviderId');
  if (xmlCode && xmlCode !== canonicalRtoCode) {
    log('warn', `XML RTO code "${xmlCode}" differs from canonical "${canonicalRtoCode}". Using canonical.`, {}, correlationId);
  }

  const parsedSummary = parseSummary(normalized, canonicalRtoCode, correlationId);
  if (!parsedSummary.summary) return null;

  return {
    ...parsedSummary.summary,
    contacts: parseContacts(normalized, correlationId),
    addresses: parseAddresses(normalized, correlationId),
    deliveryLocations: parseDeliveryLocations(normalized, correlationId).locations,
    scope: parseScope(normalized, correlationId),
  };
}

// ==================== SOAP REQUEST FUNCTIONS ====================

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

async function makeSoapRequest(endpoint: string, soapAction: string, body: string, correlationId?: string): Promise<string> {
  const startTime = Date.now();
  
  if (endpoint.includes('?wsdl')) {
    throw new Error(`Invalid endpoint - must not use ?wsdl: ${endpoint}`);
  }
  
  if (!endpoint.includes('V13.svc/')) {
    throw new Error(`Invalid endpoint - must contain V13.svc/ with policy suffix: ${endpoint}`);
  }
  
  log('info', 'SOAP request starting', { endpoint, soapAction, bodyLength: body.length }, correlationId);
  
  try {
    const headers: Record<string, string> = {
      'Content-Type': 'text/xml; charset=utf-8',
      'SOAPAction': `"${soapAction}"`,
      'Accept': 'text/xml',
      'User-Agent': 'Unicorn2.0/1.3',
    };
    
    const response = await fetch(endpoint, {
      method: 'POST',
      headers,
      body,
    });

    const duration = Date.now() - startTime;
    const responseText = await response.text();
    
    log('info', 'SOAP response received', { status: response.status, duration, responseLength: responseText.length }, correlationId);

    if (!response.ok) {
      let errorDetail = `HTTP ${response.status}`;
      
      if (response.status === 404) {
        errorDetail = `HTTP 404 - Endpoint not found: ${endpoint}`;
      } else if (response.status === 401) {
        errorDetail = 'Authentication failed - check TGA credentials';
      } else if (response.status === 403) {
        errorDetail = 'Access denied - account may not have Web Services Read permission';
      } else if (responseText.includes('Fault')) {
        const faultMatch = responseText.match(/<(?:\w+:)?Text[^>]*>([^<]+)<\/(?:\w+:)?Text>/i) ||
                          responseText.match(/<faultstring[^>]*>([^<]+)<\/faultstring>/i);
        if (faultMatch) {
          errorDetail = faultMatch[1];
        }
      }
      
      log('error', 'SOAP request failed', { status: response.status, error: errorDetail, duration }, correlationId);
      throw new Error(`TGA API error: ${errorDetail}`);
    }
    
    return responseText;
  } catch (error: unknown) {
    const duration = Date.now() - startTime;
    const errorMsg = error instanceof Error ? error.message : String(error);
    
    if (!errorMsg.includes('TGA API error')) {
      log('error', 'Unexpected SOAP error', { error: errorMsg, duration }, correlationId);
    }
    
    throw error;
  }
}

// ==================== FETCH FUNCTIONS ====================

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

async function fetchTrainingComponent(code: string, correlationId?: string): Promise<{ data: ParsedTrainingComponent | null; raw: string; error: string | null }> {
  try {
    const body = buildTCSoapRequest('GetDetails', `<tns:code>${escapeXml(code)}</tns:code>`);
    const response = await makeSoapRequest(
      TGA_ENDPOINTS.training, 
      SOAP_ACTIONS.getTrainingComponentDetails, 
      body,
      correlationId
    );
    
    const parsed = parseTrainingComponent(response);
    return { data: parsed, raw: response, error: parsed ? null : 'Could not parse response' };
  } catch (error: unknown) {
    return { data: null, raw: '', error: error instanceof Error ? error.message : String(error) };
  }
}

async function fetchOrganisation(code: string, correlationId?: string): Promise<{ 
  data: ParsedOrganisation | null; 
  raw: string; 
  error: string | null;
  sectionPresence: SectionPresence;
}> {
  try {
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
    
    log('info', 'Fetching organisation', { code, requestSize: body.length }, correlationId);
    
    const response = await makeSoapRequest(
      TGA_ENDPOINTS.organisation, 
      SOAP_ACTIONS.getOrganisationDetails, 
      body,
      correlationId
    );
    
    // Check what sections are present in raw XML
    const sectionPresence = checkSectionPresence(response);
    
    log('info', 'Section presence check', { 
      code, 
      responseSize: response.length,
      ...sectionPresence 
    }, correlationId);
    
    const parsed = parseOrganisation(response, code, correlationId);
    
    log('info', 'Organisation parsing complete', {
      code,
      hasData: !!parsed,
      contacts: parsed?.contacts.length ?? 0,
      addresses: parsed?.addresses.length ?? 0,
      deliveryLocations: parsed?.deliveryLocations.length ?? 0,
      qualifications: parsed?.scope.qualifications.length ?? 0,
      skillSets: parsed?.scope.skillSets.length ?? 0,
      units: parsed?.scope.units.length ?? 0,
      courses: parsed?.scope.courses.length ?? 0,
    }, correlationId);
    
    return { 
      data: parsed, 
      raw: response, 
      error: parsed ? null : 'Could not parse response',
      sectionPresence 
    };
  } catch (error: unknown) {
    return { 
      data: null, 
      raw: '', 
      error: error instanceof Error ? error.message : String(error),
      sectionPresence: { contacts: false, addresses: false, locations: false, qualifications: false, skillSets: false, units: false, courses: false }
    };
  }
}

async function testConnection(correlationId?: string): Promise<{ success: boolean; message: string; details?: Record<string, unknown> }> {
  const credValidation = validateCredentials();
  if (!credValidation.valid) {
    return { 
      success: false, 
      message: credValidation.error || 'Credentials not configured',
      details: { username: TGA_WS_USERNAME ? 'configured' : 'missing' }
    };
  }
  
  const testCode = 'BSB30120';
  try {
    const result = await fetchTrainingComponent(testCode, correlationId);
    
    if (result.data) {
      return { 
        success: true, 
        message: `Connected successfully. Verified with: ${result.data.title}`,
        details: { testCode, testResult: result.data.title }
      };
    }
    
    return { 
      success: false, 
      message: result.error || 'Connected but could not parse response',
    };
  } catch (error: unknown) {
    return { 
      success: false, 
      message: error instanceof Error ? error.message : String(error),
    };
  }
}

// ==================== MAIN HANDLER ====================

serve(async (req) => {
  if (req.method === 'OPTIONS') {
    return new Response(null, { status: 200, headers: corsHeaders });
  }

  const correlationId = generateCorrelationId();

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

    const { data: userProfile } = await supabase
      .from('users')
      .select('global_role')
      .eq('user_uuid', user.id)
      .single();

    const isSuperAdmin = userProfile?.global_role === 'SuperAdmin';

    let requestBody: Record<string, unknown> = {};
    if (req.method === 'POST') {
      try {
        requestBody = await req.json();
      } catch {
        // Body may be empty
      }
    }

    const url = new URL(req.url);
    const action = (requestBody.action as string) || url.searchParams.get('action') || 'status';
    
    log('info', 'Request received', { action, userId: user.id }, correlationId);

    // ==================== PING ACTION ====================
    if (action === 'ping') {
      return new Response(JSON.stringify({
        success: true,
        version: FUNCTION_VERSION,
        timestamp: new Date().toISOString(),
        correlationId,
      }), {
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      });
    }

    // ==================== HEALTH CHECK ====================
    if (action === 'test' || action === 'health') {
      if (!isSuperAdmin) {
        return new Response(JSON.stringify({ error: 'SuperAdmin access required' }), {
          status: 403,
          headers: { ...corsHeaders, 'Content-Type': 'application/json' },
        });
      }

      const result = await testConnection(correlationId);
      
      await supabase
        .from('tga_sync_status')
        .update({
          connection_status: result.success ? 'connected' : 'error',
          last_health_check_at: new Date().toISOString(),
          last_health_check_result: result,
        })
        .eq('id', 1);

      return new Response(JSON.stringify({ ...result, correlationId }), {
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      });
    }

    // ==================== DIAGNOSTICS ACTION ====================
    if (action === 'diagnostics' || action === 'debug-org') {
      if (!isSuperAdmin) {
        return new Response(JSON.stringify({ error: 'SuperAdmin access required' }), {
          status: 403,
          headers: { ...corsHeaders, 'Content-Type': 'application/json' },
        });
      }

      const rto_number = (requestBody.rto_number as string) || url.searchParams.get('code') || '91020';
      log('info', 'Running diagnostics', { rto_number }, correlationId);
      
      const result = await fetchOrganisation(rto_number, correlationId);
      
      // Extract XML excerpts for debugging
      const extractExcerpt = (xml: string, searchTerms: string[], maxLen = 3000): string => {
        const normalized = stripXmlPrefixes(xml);
        for (const term of searchTerms) {
          const idx = normalized.indexOf(`<${term}`);
          if (idx !== -1) {
            return normalized.substring(idx, Math.min(idx + maxLen, normalized.length)) + '...';
          }
        }
        return 'NOT FOUND';
      };
      
      // Sanitize XML - redact sensitive info
      const sanitize = (text: string): string => {
        return text
          .replace(/<Email[^>]*>[^<]+<\/Email>/gi, '<Email>[REDACTED]</Email>')
          .replace(/<Phone[^>]*>[^<]+<\/Phone>/gi, '<Phone>[REDACTED]</Phone>')
          .replace(/<Mobile[^>]*>[^<]+<\/Mobile>/gi, '<Mobile>[REDACTED]</Mobile>')
          .replace(/<Fax[^>]*>[^<]+<\/Fax>/gi, '<Fax>[REDACTED]</Fax>')
          .replace(/<EmailAddress[^>]*>[^<]+<\/EmailAddress>/gi, '<EmailAddress>[REDACTED]</EmailAddress>')
          .replace(/<PhoneNumber[^>]*>[^<]+<\/PhoneNumber>/gi, '<PhoneNumber>[REDACTED]</PhoneNumber>');
      };

      const diagnosticsResult = {
        correlationId,
        requested_rto_number: rto_number,
        parsed_org_code: result.data?.code,
        parsed_legal_name: result.data?.legalName,
        code_matches: result.data?.code === rto_number,
        section_presence: result.sectionPresence,
        parsing_summary: {
          contacts: result.data?.contacts.length ?? 0,
          contacts_types: result.data?.contacts.map(c => c.contactType) ?? [],
          contacts_names: result.data?.contacts.map(c => c.name) ?? [],
          addresses: result.data?.addresses.length ?? 0,
          address_types: result.data?.addresses.map(a => a.addressType) ?? [],
          delivery_locations: result.data?.deliveryLocations.length ?? 0,
          qualifications: result.data?.scope.qualifications.length ?? 0,
          skill_sets: result.data?.scope.skillSets.length ?? 0,
          units: result.data?.scope.units.length ?? 0,
          courses: result.data?.scope.courses.length ?? 0,
        },
        xml_excerpts: {
          organisation: sanitize(extractExcerpt(result.raw, ['OrganisationDetailsResponse', 'GetDetailsResult', 'Organisation'])),
          contacts: sanitize(extractExcerpt(result.raw, ['ContactChiefExecutive', 'ChiefExecutive', 'Contacts', 'Contact'])),
          addresses: sanitize(extractExcerpt(result.raw, ['HeadOfficeLocation', 'PhysicalAddress', 'Addresses'])),
          locations: sanitize(extractExcerpt(result.raw, ['DeliveryLocations', 'Locations', 'DeliveryLocation'])),
          scope: sanitize(extractExcerpt(result.raw, ['RtoDeliveredQualifications', 'Qualifications', 'Scope'])),
        },
        raw_xml_length: result.raw.length,
        error: result.error,
      };

      return new Response(JSON.stringify(diagnosticsResult), {
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      });
    }

    // ==================== PROBE ACTION ====================
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

      if (type === 'organisation' || type === 'org') {
        const result = await fetchOrganisation(code, correlationId);
        return new Response(JSON.stringify({
          correlationId,
          code,
          type,
          found: result.data !== null,
          data: result.data,
          sectionPresence: result.sectionPresence,
          raw: result.raw.substring(0, 2000),
          error: result.error,
        }), {
          headers: { ...corsHeaders, 'Content-Type': 'application/json' },
        });
      } else {
        const result = await fetchTrainingComponent(code, correlationId);
        return new Response(JSON.stringify({
          correlationId,
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
    }

    // ==================== SYNC CLIENT ACTION ====================
    if (action === 'sync-client') {
      // Canonical identifier is tenant_id (matches /clients/:id)
      const { tenant_id, rto_number } = requestBody as { tenant_id?: string; rto_number?: string };

      if (!tenant_id) {
        return new Response(JSON.stringify({ error: 'tenant_id required' }), {
          status: 400,
          headers: { ...corsHeaders, 'Content-Type': 'application/json' },
        });
      }

      const tenantIdNum = parseInt(tenant_id);
      if (!Number.isFinite(tenantIdNum)) {
        return new Response(JSON.stringify({ error: `Invalid tenant_id: ${tenant_id}` }), {
          status: 400,
          headers: { ...corsHeaders, 'Content-Type': 'application/json' },
        });
      }

      // Validate tenant exists + handle merged tenants explicitly
      const { data: tenantRow, error: tenantErr } = await supabase
        .from('tenants')
        .select('id, name, status, metadata')
        .eq('id', tenantIdNum)
        .single();

      if (tenantErr || !tenantRow) {
        return new Response(JSON.stringify({ error: `Tenant ${tenantIdNum} not found` }), {
          status: 404,
          headers: { ...corsHeaders, 'Content-Type': 'application/json' },
        });
      }

      if (tenantRow.status === 'inactive') {
        const metadata = tenantRow.metadata as Record<string, unknown> | null;
        const mergedInto = metadata?.merged_into;
        return new Response(JSON.stringify({
          error: mergedInto
            ? `Tenant ${tenantIdNum} was merged into tenant ${mergedInto}`
            : `Tenant ${tenantIdNum} is inactive`,
          tenant_id: tenantIdNum,
          merged_into: mergedInto ?? null,
        }), {
          status: 409,
          headers: { ...corsHeaders, 'Content-Type': 'application/json' },
        });
      }

      // Ensure tenant_profile exists
      const { data: tenantProfile } = await supabase
        .from('tenant_profile')
        .select('tenant_id, rto_number')
        .eq('tenant_id', tenantIdNum)
        .maybeSingle();

      if (!tenantProfile) {
        await supabase.from('tenant_profile').insert({
          tenant_id: tenantIdNum,
          trading_name: tenantRow.name,
          updated_at: new Date().toISOString(),
        });
      }

      const effectiveRto = (rto_number || tenantProfile?.rto_number || null)?.toString().trim() || null;
      if (!effectiveRto) {
        return new Response(JSON.stringify({
          error: `Tenant ${tenantIdNum} has no tenant_profile.rto_number configured`,
          tenant_id: tenantIdNum,
        }), {
          status: 422,
          headers: { ...corsHeaders, 'Content-Type': 'application/json' },
        });
      }

      log('info', 'Starting tenant sync', { tenant_id: tenantIdNum, rto_number: effectiveRto }, correlationId);

      let runId: string | null = null;
      let jobId: string | null = null;

      try {
        const orgResult = await fetchOrganisation(effectiveRto, correlationId);
        const summaryDebug = buildSummaryDebugPayload(orgResult.raw, effectiveRto, correlationId);

        // Store debug payload(s) for visibility (one per stage-like section)
        await supabase.from('tga_debug_payloads').insert([
          {
            tenant_id: tenantIdNum,
            rto_code: effectiveRto,
            endpoint: 'GetDetails:summary',
            http_status: orgResult.data ? 200 : 404,
            record_count: orgResult.data ? 1 : 0,
            payload: {
              tenant_id: tenantIdNum,
              rto_number: effectiveRto,
              hasData: !!orgResult.data,
              error: orgResult.error,
              ...summaryDebug,
            },
          },
          {
            tenant_id: tenantIdNum,
            rto_code: effectiveRto,
            endpoint: 'GetDetails:contacts',
            http_status: orgResult.data ? 200 : 404,
            record_count: orgResult.data?.contacts?.length ?? 0,
            payload: {
              tenant_id: tenantIdNum,
              rto_number: effectiveRto,
              sectionPresence: orgResult.sectionPresence,
            },
          },
          {
            tenant_id: tenantIdNum,
            rto_code: effectiveRto,
            endpoint: 'GetDetails:addresses',
            http_status: orgResult.data ? 200 : 404,
            record_count: orgResult.data?.addresses?.length ?? 0,
            payload: {
              tenant_id: tenantIdNum,
              rto_number: effectiveRto,
              sectionPresence: orgResult.sectionPresence,
            },
          },
          {
            tenant_id: tenantIdNum,
            rto_code: effectiveRto,
            endpoint: 'GetDetails:delivery_sites',
            http_status: orgResult.data ? 200 : 404,
            record_count: orgResult.data?.deliveryLocations?.length ?? 0,
            payload: {
              tenant_id: tenantIdNum,
              rto_number: effectiveRto,
              sectionPresence: orgResult.sectionPresence,
              // Store raw XML sample for debugging if parse returns 0 but section is present
              rawXmlSample: (orgResult.sectionPresence?.locations && orgResult.data?.deliveryLocations?.length === 0)
                ? parseDeliveryLocations(orgResult.raw, correlationId, true).rawSample
                : undefined,
            },
          },
        ]);

        if (!orgResult.data) {
          return new Response(JSON.stringify({
            success: false,
            correlationId,
            error: orgResult.error || 'RTO not found in TGA registry',
            rto_number: effectiveRto,
            tenant_id: tenantIdNum,
          }), {
            headers: { ...corsHeaders, 'Content-Type': 'application/json' },
          });
        }

        const orgData = orgResult.data;
        const sectionPresence = orgResult.sectionPresence;
        const fetchedAt = new Date().toISOString();

        // Create a run + job record (monitoring/retry visibility)
        // Note: run_type must be 'manual' or 'scheduled' per constraint
        // Note: stage must be one of: rto_summary, addresses, contacts, delivery_sites, scope_*, full_sync
        const { data: runRow, error: runError } = await supabase
          .from('tga_import_runs')
          .insert({
            run_type: 'manual',
            status: 'running',
            started_at: fetchedAt,
            source_ref: `tenant:${tenantIdNum}:rto:${effectiveRto}`,
            records_processed: 0,
            error_message: null,
            created_by: user.id,
          })
          .select('id')
          .single();

        if (runError) {
          log('warn', 'Failed to create run record', { error: runError.message }, correlationId);
        }
        runId = runRow?.id ?? null;

        const { data: jobRow, error: jobError } = await supabase
          .from('tga_rto_import_jobs')
          .insert({
            tenant_id: tenantIdNum,
            rto_code: effectiveRto,
            status: 'processing',
            job_type: 'full',
            stage: 'full_sync',
            attempts: 1,
            max_attempts: 1,
            run_id: runId,
            created_by: user.id,
            started_at: fetchedAt,
            payload_meta: { correlationId },
            summary_fetched: false,
            contacts_fetched: false,
            addresses_fetched: false,
            scope_fetched: false,
          })
          .select('id')
          .single();

        if (jobError) {
          log('warn', 'Failed to create job record', { error: jobError.message }, correlationId);
        }
        jobId = jobRow?.id ?? null;

        // Track what was replaced vs skipped
        const syncStatus: Record<string, { replaced: boolean; count: number; reason?: string }> = {};


        // Upsert to tga_rtos cache
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

          // CONTACTS - with safety guardrail
          if (orgData.contacts.length > 0) {
            await supabase.from('tga_rto_contacts').delete().eq('tenant_id', tenantIdNum).eq('rto_code', orgData.code);
            await supabase.from('tga_rto_contacts').insert(
              orgData.contacts.map(c => ({
                tenant_id: tenantIdNum,
                rto_code: orgData.code,
                contact_type: c.contactType,
                contact_type_raw: c.contactTypeRaw,
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
            syncStatus.contacts = { replaced: true, count: orgData.contacts.length };
          } else if (sectionPresence.contacts) {
            log('warn', 'Contacts section present but parsed 0 - skipping delete to prevent data loss', {}, correlationId);
            syncStatus.contacts = { replaced: false, count: 0, reason: 'parse_failed_safety' };
          } else {
            await supabase.from('tga_rto_contacts').delete().eq('tenant_id', tenantIdNum).eq('rto_code', orgData.code);
            syncStatus.contacts = { replaced: true, count: 0, reason: 'not_in_response' };
          }

          // ADDRESSES - with safety guardrail
          if (orgData.addresses.length > 0) {
            await supabase.from('tga_rto_addresses').delete().eq('tenant_id', tenantIdNum).eq('rto_code', orgData.code);
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
            syncStatus.addresses = { replaced: true, count: orgData.addresses.length };
          } else if (sectionPresence.addresses) {
            log('warn', 'Addresses section present but parsed 0 - skipping delete', {}, correlationId);
            syncStatus.addresses = { replaced: false, count: 0, reason: 'parse_failed_safety' };
          } else {
            await supabase.from('tga_rto_addresses').delete().eq('tenant_id', tenantIdNum).eq('rto_code', orgData.code);
            syncStatus.addresses = { replaced: true, count: 0, reason: 'not_in_response' };
          }

          // DELIVERY LOCATIONS - with safety guardrail
          if (orgData.deliveryLocations.length > 0) {
            await supabase.from('tga_rto_delivery_locations').delete().eq('tenant_id', tenantIdNum).eq('rto_code', orgData.code);
            await supabase.from('tga_rto_delivery_locations').insert(
              orgData.deliveryLocations.map(l => ({
                tenant_id: tenantIdNum,
                rto_code: orgData.code,
                location_name: l.locationName,
                address_line_1: l.addressLine1,
                address_line_2: l.addressLine2,
                suburb: l.suburb,
                state: l.state,
                postcode: l.postcode,
                country: l.country,
                fetched_at: fetchedAt,
              }))
            );
            syncStatus.deliveryLocations = { replaced: true, count: orgData.deliveryLocations.length };
          } else if (sectionPresence.locations) {
            log('warn', 'Locations section present but parsed 0 - skipping delete', {}, correlationId);
            syncStatus.deliveryLocations = { replaced: false, count: 0, reason: 'parse_failed_safety' };
          } else {
            await supabase.from('tga_rto_delivery_locations').delete().eq('tenant_id', tenantIdNum).eq('rto_code', orgData.code);
            syncStatus.deliveryLocations = { replaced: true, count: 0, reason: 'not_in_response' };
          }

          // QUALIFICATIONS - with safety guardrail
          if (orgData.scope.qualifications.length > 0) {
            await supabase.from('tga_scope_qualifications').delete().eq('tenant_id', tenantIdNum).eq('rto_code', orgData.code);
            await supabase.from('tga_scope_qualifications').insert(
              orgData.scope.qualifications.map(q => ({
                tenant_id: tenantIdNum,
                rto_code: orgData.code,
                qualification_code: q.code,
                qualification_title: q.title,
                training_package_code: q.trainingPackageCode,
                training_package_title: q.trainingPackageTitle,
                status: q.status,
                usage_recommendation: q.usageRecommendation,
                extent: q.extent,
                start_date: q.startDate,
                end_date: q.endDate,
                fetched_at: fetchedAt,
              }))
            );
            syncStatus.qualifications = { replaced: true, count: orgData.scope.qualifications.length };
          } else if (sectionPresence.qualifications) {
            log('warn', 'Qualifications section present but parsed 0 - skipping delete', {}, correlationId);
            syncStatus.qualifications = { replaced: false, count: 0, reason: 'parse_failed_safety' };
          } else {
            syncStatus.qualifications = { replaced: false, count: 0, reason: 'not_in_response' };
          }

          // SKILL SETS - with safety guardrail
          if (orgData.scope.skillSets.length > 0) {
            await supabase.from('tga_scope_skillsets').delete().eq('tenant_id', tenantIdNum).eq('rto_code', orgData.code);
            await supabase.from('tga_scope_skillsets').insert(
              orgData.scope.skillSets.map(s => ({
                tenant_id: tenantIdNum,
                rto_code: orgData.code,
                skillset_code: s.code,
                skillset_title: s.title,
                training_package_code: s.trainingPackageCode,
                training_package_title: s.trainingPackageTitle,
                status: s.status,
                usage_recommendation: s.usageRecommendation,
                start_date: s.startDate,
                end_date: s.endDate,
                fetched_at: fetchedAt,
              }))
            );
            syncStatus.skillSets = { replaced: true, count: orgData.scope.skillSets.length };
          } else if (sectionPresence.skillSets) {
            log('warn', 'SkillSets section present but parsed 0 - skipping delete', {}, correlationId);
            syncStatus.skillSets = { replaced: false, count: 0, reason: 'parse_failed_safety' };
          } else {
            syncStatus.skillSets = { replaced: false, count: 0, reason: 'not_in_response' };
          }

          // UNITS - with safety guardrail
          if (orgData.scope.units.length > 0) {
            await supabase.from('tga_scope_units').delete().eq('tenant_id', tenantIdNum).eq('rto_code', orgData.code);
            await supabase.from('tga_scope_units').insert(
              orgData.scope.units.map(u => ({
                tenant_id: tenantIdNum,
                rto_code: orgData.code,
                unit_code: u.code,
                unit_title: u.title,
                status: u.status,
                usage_recommendation: u.usageRecommendation,
                is_explicit: u.isExplicit,
                start_date: u.startDate,
                end_date: u.endDate,
                fetched_at: fetchedAt,
              }))
            );
            syncStatus.units = { replaced: true, count: orgData.scope.units.length };
          } else if (sectionPresence.units) {
            log('warn', 'Units section present but parsed 0 - skipping delete', {}, correlationId);
            syncStatus.units = { replaced: false, count: 0, reason: 'parse_failed_safety' };
          } else {
            syncStatus.units = { replaced: false, count: 0, reason: 'not_in_response' };
          }

          // COURSES - with safety guardrail
          if (orgData.scope.courses.length > 0) {
            await supabase.from('tga_scope_courses').delete().eq('tenant_id', tenantIdNum).eq('rto_code', orgData.code);
            await supabase.from('tga_scope_courses').insert(
              orgData.scope.courses.map(c => ({
                tenant_id: tenantIdNum,
                rto_code: orgData.code,
                course_code: c.code,
                course_title: c.title,
                status: c.status,
                start_date: c.startDate,
                end_date: c.endDate,
                fetched_at: fetchedAt,
              }))
            );
            syncStatus.courses = { replaced: true, count: orgData.scope.courses.length };
          } else if (sectionPresence.courses) {
            log('warn', 'Courses section present but parsed 0 - skipping delete', {}, correlationId);
            syncStatus.courses = { replaced: false, count: 0, reason: 'parse_failed_safety' };
          } else {
            syncStatus.courses = { replaced: false, count: 0, reason: 'not_in_response' };
          }
          
          log('info', 'Stored TGA data to tenant tables', {
            tenant_id: tenantIdNum,
            rto_code: orgData.code,
            contacts: syncStatus.contacts?.count ?? 0,
            addresses: syncStatus.addresses?.count ?? 0,
            deliveryLocations: syncStatus.deliveryLocations?.count ?? 0,
            qualifications: syncStatus.qualifications?.count ?? 0,
            skillSets: syncStatus.skillSets?.count ?? 0,
            units: syncStatus.units?.count ?? 0,
            courses: syncStatus.courses?.count ?? 0,
            syncStatus,
          }, correlationId);
          
          // Backfill tenant_profile from TGA (keeps merge fields reliable)
          await supabase
            .from('tenant_profile')
            .upsert({
              tenant_id: tenantIdNum,
              rto_number: orgData.code,
              trading_name: orgData.tradingName || tenantRow.name,
              legal_name: orgData.legalName,
              abn: orgData.abn,
              acn: orgData.acn,
              website: orgData.webAddress,
              org_type: orgData.organisationType,
              updated_at: fetchedAt,
              updated_by: user.id,
            }, { onConflict: 'tenant_id' });

          // Write audit log
          await supabase.from('tga_import_audit').insert({
            tenant_id: tenantIdNum,
            triggered_by: user.id,
            rto_code: orgData.code,
            action: 'sync_now',
            status: 'completed',
            rows_affected: Object.values(syncStatus).reduce((sum, s) => sum + (s.count || 0), 0),
            metadata: { syncStatus, sectionPresence, correlationId },
          });
          
          // Update run/job tracking
          const rowsAffected = Object.values(syncStatus).reduce((sum, s) => sum + (s.count || 0), 0);

          if (jobId) {
            await supabase
              .from('tga_rto_import_jobs')
              .update({
                status: 'success',
                completed_at: fetchedAt,
                finished_at: fetchedAt,
                error_message: null,
                last_error: null,
                summary_fetched: true,
                contacts_fetched: (syncStatus.contacts?.replaced ?? false) || (syncStatus.contacts?.reason === 'not_in_response'),
                addresses_fetched: (syncStatus.addresses?.replaced ?? false) || (syncStatus.addresses?.reason === 'not_in_response'),
                scope_fetched: true,
                qualifications_count: syncStatus.qualifications?.count ?? 0,
                skillsets_count: syncStatus.skillSets?.count ?? 0,
                units_count: syncStatus.units?.count ?? 0,
                courses_count: syncStatus.courses?.count ?? 0,
                payload_meta: { correlationId, syncStatus, sectionPresence },
              })
              .eq('id', jobId);
          }

          if (runId) {
            await supabase
              .from('tga_import_runs')
              .update({
                status: 'success',
                finished_at: fetchedAt,
                records_processed: rowsAffected,
                error_message: null,
              })
              .eq('id', runId);
          }

          // Update tga_links with last sync status using tenant_id + rto_number
          await supabase
            .from('tga_links')
            .update({
              last_sync_at: fetchedAt,
              last_sync_status: 'success',
              last_sync_error: null,
              updated_at: fetchedAt,
            })
            .eq('tenant_id', tenantIdNum)
            .eq('rto_number', orgData.code);
          
          log('info', 'Updated tga_links sync status', { tenant_id: tenantIdNum, rto_number: orgData.code }, correlationId);
        }

        return new Response(JSON.stringify({
          success: true,
          correlationId,
          tenant_id: tenantIdNum,
          rto_code: orgData.code,
          legal_name: orgData.legalName,
          synced: {
            contacts: syncStatus.contacts?.count ?? 0,
            addresses: syncStatus.addresses?.count ?? 0,
            deliveryLocations: syncStatus.deliveryLocations?.count ?? 0,
            qualifications: syncStatus.qualifications?.count ?? 0,
            skillSets: syncStatus.skillSets?.count ?? 0,
            units: syncStatus.units?.count ?? 0,
            courses: syncStatus.courses?.count ?? 0,
          },
          syncStatus,
          sectionPresence,
        }), {
          headers: { ...corsHeaders, 'Content-Type': 'application/json' },
        });
      } catch (error: unknown) {
        const errorMsg = error instanceof Error ? error.message : String(error);
        log('error', 'Tenant sync failed', { error: errorMsg, tenant_id: tenantIdNum, rto_number: effectiveRto }, correlationId);

        // Update job/run status to 'failed'
        const failedAt = new Date().toISOString();
        if (jobId) {
          await supabase
            .from('tga_rto_import_jobs')
            .update({
              status: 'failed',
              finished_at: failedAt,
              last_error: errorMsg,
              error_message: errorMsg,
            })
            .eq('id', jobId);
        }
        if (runId) {
          await supabase
            .from('tga_import_runs')
            .update({
              status: 'failed',
              finished_at: failedAt,
              error_message: errorMsg,
            })
            .eq('id', runId);
        }

        // Update tga_links with failure status
        if (effectiveRto) {
          await supabase
            .from('tga_links')
            .update({
              last_sync_at: failedAt,
              last_sync_status: 'failed',
              last_sync_error: errorMsg,
              updated_at: failedAt,
            })
            .eq('tenant_id', tenantIdNum)
            .eq('rto_number', effectiveRto);
        }

        return new Response(JSON.stringify({
          success: false,
          correlationId,
          error: errorMsg,
          tenant_id: tenantIdNum,
          rto_number: effectiveRto,
        }), {
          status: 500,
          headers: { ...corsHeaders, 'Content-Type': 'application/json' },
        });
      }
    }

    // ==================== START STAGED SYNC ====================
    if (action === 'start-staged-sync') {
      const { tenant_id, rto_code } = requestBody as { tenant_id?: string; rto_code?: string };
      
      if (!tenant_id || !rto_code) {
        return new Response(JSON.stringify({ error: 'tenant_id and rto_code required' }), {
          status: 400,
          headers: { ...corsHeaders, 'Content-Type': 'application/json' },
        });
      }
      
      log('info', 'Starting staged sync', { tenant_id, rto_code }, correlationId);
      
      // Call the RPC function to create the run and jobs
      const { data: result, error: rpcError } = await supabase.rpc('tga_start_staged_sync', {
        p_tenant_id: parseInt(tenant_id),
        p_rto_code: rto_code,
        p_triggered_by: user.id,
      });
      
      if (rpcError) {
        return new Response(JSON.stringify({ 
          success: false, 
          error: rpcError.message,
          correlationId,
        }), {
          status: 500,
          headers: { ...corsHeaders, 'Content-Type': 'application/json' },
        });
      }
      
      return new Response(JSON.stringify({
        success: true,
        correlationId,
        ...result,
      }), {
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      });
    }

    // ==================== GET SYNC PROGRESS ====================
    if (action === 'sync-progress') {
      const run_id = (requestBody.run_id as string) || url.searchParams.get('run_id');
      
      if (!run_id) {
        return new Response(JSON.stringify({ error: 'run_id required' }), {
          status: 400,
          headers: { ...corsHeaders, 'Content-Type': 'application/json' },
        });
      }
      
      const { data: progress, error: progressError } = await supabase.rpc('tga_get_sync_progress', {
        p_run_id: run_id,
      });
      
      if (progressError) {
        return new Response(JSON.stringify({ 
          success: false, 
          error: progressError.message,
          correlationId,
        }), {
          status: 500,
          headers: { ...corsHeaders, 'Content-Type': 'application/json' },
        });
      }
      
      return new Response(JSON.stringify({
        success: true,
        correlationId,
        ...progress,
      }), {
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      });
    }

    // ==================== STATUS ACTION ====================
    if (action === 'status') {
      const credValidation = validateCredentials();
      
      const { data: syncStatus } = await supabase
        .from('tga_sync_status')
        .select('*')
        .eq('id', 1)
        .single();

      return new Response(JSON.stringify({
        correlationId,
        version: FUNCTION_VERSION,
        environment: TGA_ENV,
        credentials: {
          username: TGA_WS_USERNAME ? `${TGA_WS_USERNAME.substring(0, 3)}...` : 'not configured',
          valid: credValidation.valid,
        },
        endpoints: TGA_ENDPOINTS,
        syncStatus: syncStatus || null,
      }), {
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      });
    }

    return new Response(JSON.stringify({ 
      error: `Unknown action: ${action}`,
      availableActions: ['ping', 'status', 'test', 'health', 'diagnostics', 'debug-org', 'probe', 'sync-client', 'start-staged-sync', 'sync-progress'],
      correlationId,
    }), {
      status: 400,
      headers: { ...corsHeaders, 'Content-Type': 'application/json' },
    });

  } catch (error: unknown) {
    const errorMsg = error instanceof Error ? error.message : String(error);
    log('error', 'Request handler error', { error: errorMsg }, correlationId);
    
    return new Response(JSON.stringify({ 
      error: errorMsg,
      correlationId,
    }), {
      status: 500,
      headers: { ...corsHeaders, 'Content-Type': 'application/json' },
    });
  }
});
