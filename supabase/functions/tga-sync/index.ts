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

const FUNCTION_VERSION = '1.2.0';

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
// Extract single value from XML (namespace-agnostic)
function extractValue(xml: string, tagName: string): string | null {
  const patterns = [
    new RegExp(`<(?:\\w+:)?${tagName}[^>]*>([^<]*)</(?:\\w+:)?${tagName}>`, 'i'),
    new RegExp(`<${tagName}[^>]*>([^<]*)</${tagName}>`, 'i'),
  ];
  for (const pattern of patterns) {
    const match = xml.match(pattern);
    if (match) return match[1].trim() || null;
  }
  return null;
}

// Extract a section of XML by tag name
function extractSection(xml: string, tagName: string): string | null {
  const pattern = new RegExp(`<(?:\\w+:)?${tagName}[^>]*>([\\s\\S]*?)</(?:\\w+:)?${tagName}>`, 'i');
  const match = xml.match(pattern);
  return match ? match[1] : null;
}

// Extract all occurrences of a tag
function extractAllSections(xml: string, tagName: string): string[] {
  const results: string[] = [];
  const pattern = new RegExp(`<(?:\\w+:)?${tagName}[^>]*>([\\s\\S]*?)</(?:\\w+:)?${tagName}>`, 'gi');
  let match;
  while ((match = pattern.exec(xml)) !== null) {
    results.push(match[1]);
  }
  return results;
}

// ==================== DATA INTERFACES ====================

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

// ==================== DOM-BASED PARSING FUNCTIONS ====================

// Extract the 3 current contact types using DOM
function parseContactsDOM(doc: Document, correlationId?: string): ParsedContact[] {
  const contacts: ParsedContact[] = [];
  const today = new Date().toISOString().split('T')[0];
  
  log('info', 'Parsing contacts with DOM', {}, correlationId);
  
  // Find all Contact elements
  const contactElements = findAllByLocalName(doc, 'Contact');
  log('info', `Found ${contactElements.length} Contact elements`, {}, correlationId);
  
  // Also look for specific contact type containers
  const contactTypeContainers = [
    { names: ['ContactChiefExecutive', 'ChiefExecutive', 'CEO'], type: 'ChiefExecutive' },
    { names: ['ContactPublicEnquiries', 'PublicEnquiries'], type: 'PublicEnquiries' },
    { names: ['ContactRegistrationEnquiries', 'RegistrationEnquiries'], type: 'RegistrationEnquiries' },
  ];
  
  const seenTypes = new Set<string>();
  
  // Try specific containers first
  for (const { names, type } of contactTypeContainers) {
    for (const name of names) {
      const container = findFirstByLocalName(doc, name);
      if (container && !seenTypes.has(type)) {
        const endDate = getChildText(container, 'EndDate') || getChildText(container, 'EffectiveTo');
        const isCurrent = !endDate || endDate >= today;
        
        if (isCurrent) {
          const name = getChildText(container, 'Name') || 
                      getChildText(container, 'FullName') ||
                      [getChildText(container, 'FirstName'), getChildText(container, 'LastName')].filter(Boolean).join(' ') || null;
          
          if (name) {
            seenTypes.add(type);
            contacts.push({
              contactType: type,
              name,
              position: getChildText(container, 'Position') || getChildText(container, 'JobTitle') || type,
              phone: getChildText(container, 'Phone') || getChildText(container, 'PhoneNumber') || getChildText(container, 'BusinessPhone'),
              mobile: getChildText(container, 'Mobile') || getChildText(container, 'MobileNumber'),
              fax: getChildText(container, 'Fax') || getChildText(container, 'FaxNumber'),
              email: getChildText(container, 'Email') || getChildText(container, 'EmailAddress'),
              address: getChildText(container, 'Address') || getChildText(container, 'StreetAddress'),
              organisationName: getChildText(container, 'OrganisationName') || getChildText(container, 'Organisation'),
            });
            log('info', `Added ${type} contact from container`, { name }, correlationId);
            break;
          }
        }
      }
    }
  }
  
  // Fall back to generic Contact elements
  for (const contactEl of contactElements) {
    if (seenTypes.size >= 3) break;
    
    const endDate = getChildText(contactEl, 'EndDate') || getChildText(contactEl, 'EffectiveTo');
    const isCurrent = !endDate || endDate >= today;
    if (!isCurrent) continue;
    
    const rawType = getChildText(contactEl, 'ContactType') || getChildText(contactEl, 'Type') || '';
    let normalizedType = '';
    if (rawType.includes('Chief') || rawType.includes('CEO') || rawType.includes('Principal') || rawType.includes('Executive')) {
      normalizedType = 'ChiefExecutive';
    } else if (rawType.includes('Public')) {
      normalizedType = 'PublicEnquiries';
    } else if (rawType.includes('Registration')) {
      normalizedType = 'RegistrationEnquiries';
    }
    
    if (normalizedType && !seenTypes.has(normalizedType)) {
      seenTypes.add(normalizedType);
      const name = getChildText(contactEl, 'Name') || getChildText(contactEl, 'FullName') ||
                  [getChildText(contactEl, 'FirstName'), getChildText(contactEl, 'LastName')].filter(Boolean).join(' ') || null;
      
      contacts.push({
        contactType: normalizedType,
        name,
        position: getChildText(contactEl, 'Position') || getChildText(contactEl, 'JobTitle'),
        phone: getChildText(contactEl, 'Phone') || getChildText(contactEl, 'PhoneNumber'),
        mobile: getChildText(contactEl, 'Mobile') || getChildText(contactEl, 'MobileNumber'),
        fax: getChildText(contactEl, 'Fax') || getChildText(contactEl, 'FaxNumber'),
        email: getChildText(contactEl, 'Email') || getChildText(contactEl, 'EmailAddress'),
        address: getChildText(contactEl, 'Address'),
        organisationName: getChildText(contactEl, 'OrganisationName'),
      });
      log('info', `Added ${normalizedType} contact from Contact element`, { name, rawType }, correlationId);
    }
  }
  
  log('info', `Contact parsing complete: ${contacts.length} contacts`, { types: contacts.map(c => c.contactType) }, correlationId);
  return contacts;
}

// Parse addresses using DOM
function parseAddressesDOM(doc: Document, correlationId?: string): ParsedAddress[] {
  const addresses: ParsedAddress[] = [];
  
  log('info', 'Parsing addresses with DOM', {}, correlationId);
  
  // Look for specific address elements
  const addressMappings = [
    { names: ['HeadOfficeLocation', 'HeadOfficePhysicalAddress', 'PhysicalAddress'], type: 'HeadOffice' },
    { names: ['HeadOfficePostalAddress', 'PostalAddress'], type: 'Postal' },
    { names: ['BusinessAddress'], type: 'Business' },
  ];
  
  const seenTypes = new Set<string>();
  
  for (const { names, type } of addressMappings) {
    for (const name of names) {
      const container = findFirstByLocalName(doc, name);
      if (container && !seenTypes.has(type)) {
        const line1 = getChildText(container, 'Line1') || getChildText(container, 'AddressLine1') || 
                     getChildText(container, 'Street') || getChildText(container, 'StreetAddress');
        const suburb = getChildText(container, 'Suburb') || getChildText(container, 'City') || getChildText(container, 'Locality');
        
        if (line1 || suburb) {
          seenTypes.add(type);
          addresses.push({
            addressType: type,
            addressLine1: line1,
            addressLine2: getChildText(container, 'Line2') || getChildText(container, 'AddressLine2'),
            suburb,
            state: getChildText(container, 'State') || getChildText(container, 'StateTerritory') || getChildText(container, 'StateCode'),
            postcode: getChildText(container, 'Postcode') || getChildText(container, 'PostCode'),
            country: getChildText(container, 'Country'),
            phone: getChildText(container, 'Phone') || getChildText(container, 'PhoneNumber'),
            fax: getChildText(container, 'Fax') || getChildText(container, 'FaxNumber'),
            email: getChildText(container, 'Email') || getChildText(container, 'EmailAddress'),
            website: getChildText(container, 'Website') || getChildText(container, 'WebAddress'),
          });
          log('info', `Added ${type} address`, { line1, suburb }, correlationId);
          break;
        }
      }
    }
  }
  
  // Also look for Address elements in an Addresses container
  const addressesContainer = findFirstByLocalName(doc, 'Addresses');
  if (addressesContainer) {
    const addressElements = findAllByLocalName(addressesContainer, 'Address');
    for (const addrEl of addressElements) {
      const addrType = getChildText(addrEl, 'AddressType') || getChildText(addrEl, 'Type') || 'Unknown';
      if (!seenTypes.has(addrType)) {
        const line1 = getChildText(addrEl, 'Line1') || getChildText(addrEl, 'AddressLine1');
        const suburb = getChildText(addrEl, 'Suburb') || getChildText(addrEl, 'Locality');
        if (line1 || suburb) {
          seenTypes.add(addrType);
          addresses.push({
            addressType: addrType,
            addressLine1: line1,
            addressLine2: getChildText(addrEl, 'Line2') || getChildText(addrEl, 'AddressLine2'),
            suburb,
            state: getChildText(addrEl, 'State') || getChildText(addrEl, 'StateCode'),
            postcode: getChildText(addrEl, 'Postcode') || getChildText(addrEl, 'PostCode'),
            country: getChildText(addrEl, 'Country'),
            phone: getChildText(addrEl, 'Phone'),
            fax: getChildText(addrEl, 'Fax'),
            email: getChildText(addrEl, 'Email'),
            website: getChildText(addrEl, 'Website'),
          });
        }
      }
    }
  }
  
  log('info', `Address parsing complete: ${addresses.length} addresses`, { types: addresses.map(a => a.addressType) }, correlationId);
  return addresses;
}

// Parse delivery locations using DOM
function parseDeliveryLocationsDOM(doc: Document, correlationId?: string): ParsedDeliveryLocation[] {
  const locations: ParsedDeliveryLocation[] = [];
  
  log('info', 'Parsing delivery locations with DOM', {}, correlationId);
  
  // Look for location containers
  const containerNames = ['DeliveryLocations', 'Locations', 'SiteLocations'];
  let container: Element | null = null;
  
  for (const name of containerNames) {
    container = findFirstByLocalName(doc, name);
    if (container) {
      log('info', `Found locations container: ${name}`, {}, correlationId);
      break;
    }
  }
  
  if (container) {
    const locationNames = ['DeliveryLocation', 'Location', 'Site'];
    for (const locName of locationNames) {
      const locationElements = findAllByLocalName(container, locName);
      for (const locEl of locationElements) {
        const locationName = getChildText(locEl, 'Name') || getChildText(locEl, 'LocationName') || 
                           getChildText(locEl, 'SiteName') || getChildText(locEl, 'Description');
        const line1 = getChildText(locEl, 'Line1') || getChildText(locEl, 'AddressLine1') ||
                     getChildText(locEl, 'Street') || getChildText(locEl, 'StreetAddress');
        const suburb = getChildText(locEl, 'Suburb') || getChildText(locEl, 'Locality') || getChildText(locEl, 'City');
        
        if (locationName || line1 || suburb) {
          locations.push({
            locationName,
            addressLine1: line1,
            addressLine2: getChildText(locEl, 'Line2') || getChildText(locEl, 'AddressLine2'),
            suburb,
            state: getChildText(locEl, 'State') || getChildText(locEl, 'StateCode'),
            postcode: getChildText(locEl, 'Postcode') || getChildText(locEl, 'PostCode'),
            country: getChildText(locEl, 'Country'),
          });
        }
      }
    }
  }
  
  log('info', `Delivery locations parsing complete: ${locations.length} locations`, {}, correlationId);
  return locations;
}

// Parse scope items using DOM
function parseScopeDOM(doc: Document, correlationId?: string): ParsedScope {
  const scope: ParsedScope = {
    qualifications: [],
    skillSets: [],
    units: [],
    courses: [],
  };
  
  log('info', 'Parsing scope with DOM', {}, correlationId);
  
  const parseScopeItem = (el: Element, isExplicitDefault: boolean): ParsedScopeItem | null => {
    const code = getChildText(el, 'Code') || getChildText(el, 'NrtCode') || 
                getChildText(el, 'TrainingComponentCode') || getChildText(el, 'NationalCode');
    if (!code) return null;
    
    const isExplicitVal = getChildText(el, 'IsExplicit') || getChildText(el, 'Explicit');
    const isExplicit = isExplicitVal ? isExplicitVal.toLowerCase() === 'true' : isExplicitDefault;
    
    return {
      code,
      title: getChildText(el, 'Title') || getChildText(el, 'Name') || getChildText(el, 'Description'),
      status: getChildText(el, 'Status') || getChildText(el, 'ScopeStatus') || getChildText(el, 'NrtStatus'),
      usageRecommendation: getChildText(el, 'UsageRecommendation') || getChildText(el, 'Recommendation'),
      extent: getChildText(el, 'Extent') || getChildText(el, 'ScopeExtent') || getChildText(el, 'DeliveryScope'),
      startDate: getChildText(el, 'StartDate') || getChildText(el, 'ScopeStartDate') || getChildText(el, 'EffectiveFrom'),
      endDate: getChildText(el, 'EndDate') || getChildText(el, 'ScopeEndDate') || getChildText(el, 'EffectiveTo'),
      deliveryNotification: getChildText(el, 'DeliveryNotification') || getChildText(el, 'NotificationRequired'),
      trainingPackageCode: getChildText(el, 'TrainingPackageCode') || getChildText(el, 'ParentCode'),
      trainingPackageTitle: getChildText(el, 'TrainingPackageTitle') || getChildText(el, 'ParentTitle'),
      isExplicit,
      isCurrent: getChildText(el, 'IsCurrent')?.toLowerCase() === 'true' || 
                getChildText(el, 'Status')?.toLowerCase() === 'current',
    };
  };
  
  // Parse qualifications
  const qualContainers = ['RtoDeliveredQualifications', 'Qualifications', 'QualificationScope'];
  for (const containerName of qualContainers) {
    const container = findFirstByLocalName(doc, containerName);
    if (container) {
      const items = findAllByLocalName(container, 'RtoDeliveredQualification') 
                   .concat(findAllByLocalName(container, 'Qualification'))
                   .concat(findAllByLocalName(container, 'TrainingComponent'));
      for (const el of items) {
        const item = parseScopeItem(el, true);
        if (item && !scope.qualifications.some(q => q.code === item.code)) {
          scope.qualifications.push(item);
        }
      }
      break;
    }
  }
  
  // Parse skill sets
  const skillContainers = ['RtoDeliveredSkillSets', 'SkillSets', 'SkillSetScope'];
  for (const containerName of skillContainers) {
    const container = findFirstByLocalName(doc, containerName);
    if (container) {
      const items = findAllByLocalName(container, 'RtoDeliveredSkillSet')
                   .concat(findAllByLocalName(container, 'SkillSet'));
      for (const el of items) {
        const item = parseScopeItem(el, true);
        if (item && !scope.skillSets.some(s => s.code === item.code)) {
          scope.skillSets.push(item);
        }
      }
      break;
    }
  }
  
  // Parse units - only explicit ones
  const unitContainers = ['RtoDeliveredUnits', 'Units', 'ExplicitUnits', 'UnitScope'];
  for (const containerName of unitContainers) {
    const container = findFirstByLocalName(doc, containerName);
    if (container) {
      const items = findAllByLocalName(container, 'RtoDeliveredUnit')
                   .concat(findAllByLocalName(container, 'Unit'))
                   .concat(findAllByLocalName(container, 'UnitOfCompetency'));
      for (const el of items) {
        const item = parseScopeItem(el, false); // Default to not explicit, check IsExplicit field
        if (item && item.isExplicit && !scope.units.some(u => u.code === item.code)) {
          scope.units.push(item);
        }
      }
      break;
    }
  }
  
  // Parse accredited courses
  const courseContainers = ['RtoDeliveredAccreditedCourses', 'AccreditedCourses', 'Courses'];
  for (const containerName of courseContainers) {
    const container = findFirstByLocalName(doc, containerName);
    if (container) {
      const items = findAllByLocalName(container, 'RtoDeliveredAccreditedCourse')
                   .concat(findAllByLocalName(container, 'AccreditedCourse'))
                   .concat(findAllByLocalName(container, 'Course'));
      for (const el of items) {
        const item = parseScopeItem(el, true);
        if (item && !scope.courses.some(c => c.code === item.code)) {
          scope.courses.push(item);
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

// Parse organisation using DOM
function parseOrganisationDOM(xml: string, canonicalRtoCode: string, correlationId?: string): ParsedOrganisation | null {
  const doc = parseXmlDocument(xml);
  if (!doc) {
    log('error', 'Failed to parse XML document', {}, correlationId);
    return null;
  }
  
  // Find Organisation element - try various containers
  let orgElement = findFirstByLocalName(doc, 'OrganisationDetailsResponse') ||
                   findFirstByLocalName(doc, 'GetDetailsResult') ||
                   findFirstByLocalName(doc, 'Organisation');
  
  if (!orgElement) {
    log('error', 'No organisation element found in response', {}, correlationId);
    return null;
  }
  
  // Get basic info
  const legalName = getChildText(orgElement, 'LegalName') || getChildText(orgElement, 'Name');
  if (!legalName) {
    log('error', 'No legal name found in organisation', {}, correlationId);
    return null;
  }
  
  // Try to get RTO code from specific element, but use canonical as primary
  const xmlCode = getChildText(orgElement, 'Code') || getChildText(orgElement, 'RtoCode') || getChildText(orgElement, 'NationalProviderId');
  
  if (xmlCode && xmlCode !== canonicalRtoCode) {
    log('warn', `XML RTO code "${xmlCode}" differs from canonical "${canonicalRtoCode}". Using canonical.`, {}, correlationId);
  }
  
  return {
    code: canonicalRtoCode, // Always use the RTO code we requested
    legalName,
    tradingName: getChildText(orgElement, 'TradingName'),
    organisationType: getChildText(orgElement, 'OrganisationType') || getChildText(orgElement, 'Type'),
    abn: getChildText(orgElement, 'Abn') || getChildText(orgElement, 'ABN'),
    acn: getChildText(orgElement, 'Acn') || getChildText(orgElement, 'ACN'),
    status: getChildText(orgElement, 'Status') || getChildText(orgElement, 'RegistrationStatus'),
    webAddress: getChildText(orgElement, 'WebAddress') || getChildText(orgElement, 'Website'),
    initialRegistrationDate: getChildText(orgElement, 'InitialRegistrationDate'),
    registrationStartDate: getChildText(orgElement, 'RegistrationStartDate'),
    registrationEndDate: getChildText(orgElement, 'RegistrationEndDate'),
    contacts: parseContactsDOM(doc, correlationId),
    addresses: parseAddressesDOM(doc, correlationId),
    deliveryLocations: parseDeliveryLocationsDOM(doc, correlationId),
    scope: parseScopeDOM(doc, correlationId),
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
      'User-Agent': 'Unicorn2.0/1.2',
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

function extractValue(xml: string, tagName: string): string | null {
  const patterns = [
    new RegExp(`<(?:\\w+:)?${tagName}>([^<]*)<\\/(?:\\w+:)?${tagName}>`, 'i'),
    new RegExp(`<${tagName}[^>]*>([^<]*)<\\/${tagName}>`, 'i'),
  ];
  for (const pattern of patterns) {
    const match = xml.match(pattern);
    if (match) return match[1].trim() || null;
  }
  return null;
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
    
    const parsed = parseOrganisationDOM(response, code, correlationId);
    
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

// Test connection
async function testConnection(correlationId?: string): Promise<{ 
  success: boolean; 
  message: string; 
  details?: Record<string, unknown>;
}> {
  log('info', 'Testing TGA connection', { 
    username: TGA_WS_USERNAME ? `${TGA_WS_USERNAME.substring(0, 5)}...` : 'NOT_SET',
  }, correlationId);
  
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
      const { client_id, rto_number, tenant_id } = requestBody as { client_id?: string; rto_number?: string; tenant_id?: string };
      
      if (!rto_number) {
        return new Response(JSON.stringify({ error: 'rto_number required' }), {
          status: 400,
          headers: { ...corsHeaders, 'Content-Type': 'application/json' },
        });
      }

      log('info', 'Starting client sync', { rto_number, client_id, tenant_id }, correlationId);

      try {
        const orgResult = await fetchOrganisation(rto_number, correlationId);
        
        if (!orgResult.data) {
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
            correlationId,
            error: orgResult.error || 'RTO not found in TGA registry',
            rto_number,
          }), {
            headers: { ...corsHeaders, 'Content-Type': 'application/json' },
          });
        }

        const orgData = orgResult.data;
        const sectionPresence = orgResult.sectionPresence;
        const tenantIdNum = tenant_id ? parseInt(tenant_id) : null;
        const fetchedAt = new Date().toISOString();
        
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
            // Section exists in XML but we parsed 0 - DON'T DELETE existing data
            log('warn', 'Contacts section present but parsed 0 - skipping delete to prevent data loss', {}, correlationId);
            syncStatus.contacts = { replaced: false, count: 0, reason: 'parse_failed_safety' };
          } else {
            // Section not in XML - safe to delete
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
            syncStatus.qualifications = { replaced: true, count: orgData.scope.qualifications.length };
          } else if (sectionPresence.qualifications) {
            log('warn', 'Qualifications section present but parsed 0 - skipping delete', {}, correlationId);
            syncStatus.qualifications = { replaced: false, count: 0, reason: 'parse_failed_safety' };
          } else {
            // Note: For scope, TGA may simply not return it if empty - don't delete existing
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
                scope_start_date: s.startDate,
                scope_end_date: s.endDate,
                status: s.status,
                is_current: s.isCurrent,
                extent: s.extent,
                usage_recommendation: s.usageRecommendation,
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
                training_package_code: u.trainingPackageCode,
                scope_start_date: u.startDate,
                scope_end_date: u.endDate,
                status: u.status,
                is_current: u.isCurrent,
                is_explicit: true,
                extent: u.extent,
                delivery_notification: u.deliveryNotification,
                usage_recommendation: u.usageRecommendation,
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
            syncStatus,
          }, correlationId);
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
              correlationId,
              rto_number,
              legal_name: orgData.legalName,
              status: orgData.status,
              syncStatus,
              sectionPresence,
            },
          });
        }

        log('info', 'Client sync completed', { 
          rto_number, 
          legalName: orgData.legalName,
          syncStatus,
        }, correlationId);

        return new Response(JSON.stringify({
          success: true,
          correlationId,
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
          sync_status: syncStatus,
          section_presence: sectionPresence,
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
        
        log('error', 'Client sync failed', { error: errorMsg, rto_number }, correlationId);
        
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
          correlationId,
          error: errorMsg,
          rto_number,
        }), {
          status: 500,
          headers: { ...corsHeaders, 'Content-Type': 'application/json' },
        });
      }
    }

    // ==================== STATUS ACTION (default) ====================
    if (action === 'status') {
      const { data: status } = await supabase
        .from('tga_sync_status')
        .select('*')
        .eq('id', 1)
        .single();

      return new Response(JSON.stringify({
        correlationId,
        version: FUNCTION_VERSION,
        status: status || { connection_status: 'unknown' },
        endpoints: TGA_ENDPOINTS,
        credentialsConfigured: !!(TGA_WS_USERNAME && TGA_WS_PASSWORD),
      }), {
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      });
    }

    // Unknown action
    return new Response(JSON.stringify({ 
      error: `Unknown action: ${action}`,
      correlationId,
      validActions: ['ping', 'test', 'health', 'diagnostics', 'debug-org', 'probe', 'sync-client', 'status'],
    }), {
      status: 400,
      headers: { ...corsHeaders, 'Content-Type': 'application/json' },
    });

  } catch (error: unknown) {
    const errorMsg = error instanceof Error ? error.message : String(error);
    log('error', 'Request handler error', { error: errorMsg }, correlationId);
    
    return new Response(JSON.stringify({ error: errorMsg, correlationId }), {
      status: 500,
      headers: { ...corsHeaders, 'Content-Type': 'application/json' },
    });
  }
});
