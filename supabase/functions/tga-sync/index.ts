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

const FUNCTION_VERSION = '1.4.0';

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
  
  log('info', 'Parsing contacts with regex', {}, correlationId);
  
  // Look for specific contact type containers first
  const contactMappings = [
    { tags: ['ContactChiefExecutive', 'ChiefExecutive'], type: 'ChiefExecutive' },
    { tags: ['ContactPublicEnquiries', 'PublicEnquiries'], type: 'PublicEnquiries' },
    { tags: ['ContactRegistrationEnquiries', 'RegistrationEnquiries'], type: 'RegistrationEnquiries' },
  ];
  
  const seenTypes = new Set<string>();
  
  for (const { tags, type } of contactMappings) {
    if (seenTypes.has(type)) continue;
    
    for (const tag of tags) {
      const section = extractFullTag(normalized, tag);
      if (section) {
        const endDate = extractValue(section, 'EndDate') || extractValue(section, 'EffectiveTo');
        const isCurrent = !endDate || endDate >= today;
        
        if (isCurrent) {
          const name = extractValue(section, 'Name') || 
                      extractValue(section, 'FullName') ||
                      [extractValue(section, 'FirstName'), extractValue(section, 'LastName')].filter(Boolean).join(' ') || null;
          
          if (name) {
            seenTypes.add(type);
            contacts.push({
              contactType: type,
              name,
              position: extractValue(section, 'Position') || extractValue(section, 'JobTitle') || type,
              phone: extractValue(section, 'Phone') || extractValue(section, 'PhoneNumber') || extractValue(section, 'BusinessPhone'),
              mobile: extractValue(section, 'Mobile') || extractValue(section, 'MobileNumber'),
              fax: extractValue(section, 'Fax') || extractValue(section, 'FaxNumber'),
              email: extractValue(section, 'Email') || extractValue(section, 'EmailAddress'),
              address: extractValue(section, 'Address') || extractValue(section, 'StreetAddress'),
              organisationName: extractValue(section, 'OrganisationName') || extractValue(section, 'Organisation'),
            });
            log('info', `Added ${type} contact from container`, { name }, correlationId);
            break;
          }
        }
      }
    }
  }
  
  // Also look for generic Contact elements if we haven't found all 3
  if (seenTypes.size < 3) {
    const contactElements = extractAllTags(normalized, 'Contact');
    log('info', `Found ${contactElements.length} generic Contact elements`, {}, correlationId);
    
    // Debug: log the first few contact types we find
    const debugTypes: string[] = [];
    for (let i = 0; i < Math.min(5, contactElements.length); i++) {
      const contactXml = contactElements[i];
      // Try multiple ways to extract contact type
      const typeSection = extractSection(contactXml, 'ContactType');
      const typeCode = typeSection ? extractValue(typeSection, 'Code') : null;
      const typeDesc = typeSection ? extractValue(typeSection, 'Description') : null;
      const directType = extractValue(contactXml, 'ContactType') || extractValue(contactXml, 'Type');
      debugTypes.push(`code=${typeCode || 'null'}, desc=${typeDesc || 'null'}, direct=${directType || 'null'}`);
    }
    log('info', 'Sample contact types found', { samples: debugTypes }, correlationId);
    
    for (const contactXml of contactElements) {
      if (seenTypes.size >= 3) break;
      
      const endDate = extractValue(contactXml, 'EndDate') || extractValue(contactXml, 'EffectiveTo');
      const isCurrent = !endDate || endDate >= today;
      if (!isCurrent) continue;
      
      // Extract contact type - try Code inside ContactType first, then Description, then direct value
      const typeSection = extractSection(contactXml, 'ContactType');
      const typeCode = typeSection ? extractValue(typeSection, 'Code') : null;
      const typeDesc = typeSection ? (extractValue(typeSection, 'Description') || extractValue(typeSection, 'Name')) : null;
      const directType = extractValue(contactXml, 'ContactType') || extractValue(contactXml, 'Type');
      const rawType = typeCode || typeDesc || directType || '';
      const rawTypeLower = rawType.toLowerCase();
      
      let normalizedType = '';
      
      // Match on various patterns for the 3 main contact types
      if (rawTypeLower.includes('chief') || rawTypeLower.includes('ceo') || 
          rawTypeLower.includes('principal') || rawTypeLower.includes('executive') ||
          rawTypeLower === 'ce' || rawTypeLower === 'cex') {
        normalizedType = 'ChiefExecutive';
      } else if (rawTypeLower.includes('public') || rawTypeLower === 'pe' || rawTypeLower === 'pub') {
        normalizedType = 'PublicEnquiries';
      } else if (rawTypeLower.includes('registration') || rawTypeLower === 're' || rawTypeLower === 'reg') {
        normalizedType = 'RegistrationEnquiries';
      }
      
      if (normalizedType && !seenTypes.has(normalizedType)) {
        seenTypes.add(normalizedType);
        const name = extractValue(contactXml, 'Name') || extractValue(contactXml, 'FullName') ||
                    [extractValue(contactXml, 'FirstName'), extractValue(contactXml, 'LastName')].filter(Boolean).join(' ') || null;
        
        contacts.push({
          contactType: normalizedType,
          name,
          position: extractValue(contactXml, 'Position') || extractValue(contactXml, 'JobTitle'),
          phone: extractValue(contactXml, 'Phone') || extractValue(contactXml, 'PhoneNumber'),
          mobile: extractValue(contactXml, 'Mobile') || extractValue(contactXml, 'MobileNumber'),
          fax: extractValue(contactXml, 'Fax') || extractValue(contactXml, 'FaxNumber'),
          email: extractValue(contactXml, 'Email') || extractValue(contactXml, 'EmailAddress'),
          address: extractValue(contactXml, 'Address'),
          organisationName: extractValue(contactXml, 'OrganisationName'),
        });
        log('info', `Added ${normalizedType} contact from generic Contact`, { name, rawType }, correlationId);
      }
    }
  }
  
  log('info', `Contact parsing complete: ${contacts.length} contacts`, { types: contacts.map(c => c.contactType) }, correlationId);
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

function parseDeliveryLocations(xml: string, correlationId?: string): ParsedDeliveryLocation[] {
  const locations: ParsedDeliveryLocation[] = [];
  const normalized = stripXmlPrefixes(xml);
  
  log('info', 'Parsing delivery locations with regex', {}, correlationId);
  
  // Look for location containers
  const containerNames = ['DeliveryLocations', 'Locations', 'SiteLocations'];
  let containerXml: string | null = null;
  
  for (const name of containerNames) {
    containerXml = extractSection(normalized, name);
    if (containerXml) {
      log('info', `Found locations container: ${name}`, {}, correlationId);
      break;
    }
  }
  
  if (containerXml) {
    const locationNames = ['DeliveryLocation', 'Location', 'Site'];
    for (const locName of locationNames) {
      const locationElements = extractAllTags(containerXml, locName);
      for (const locXml of locationElements) {
        const locationName = extractValue(locXml, 'Name') || extractValue(locXml, 'LocationName') || 
                            extractValue(locXml, 'SiteName') || extractValue(locXml, 'Description');
        const line1 = extractValue(locXml, 'Line1') || extractValue(locXml, 'AddressLine1') ||
                     extractValue(locXml, 'Street') || extractValue(locXml, 'StreetAddress');
        const suburb = extractValue(locXml, 'Suburb') || extractValue(locXml, 'Locality') || extractValue(locXml, 'City');
        
        if (locationName || line1 || suburb) {
          locations.push({
            locationName,
            addressLine1: line1,
            addressLine2: extractValue(locXml, 'Line2') || extractValue(locXml, 'AddressLine2'),
            suburb,
            state: extractValue(locXml, 'State') || extractValue(locXml, 'StateCode'),
            postcode: extractValue(locXml, 'Postcode') || extractValue(locXml, 'PostCode'),
            country: extractValue(locXml, 'Country'),
          });
        }
      }
    }
  }
  
  log('info', `Delivery locations parsing complete: ${locations.length} locations`, {}, correlationId);
  return locations;
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

// Parse organisation from XML
function parseOrganisation(xml: string, canonicalRtoCode: string, correlationId?: string): ParsedOrganisation | null {
  const normalized = stripXmlPrefixes(xml);
  
  log('info', 'Parsing organisation with regex', { canonicalRtoCode }, correlationId);
  
  // Get basic info
  const legalName = extractValue(normalized, 'LegalName') || extractValue(normalized, 'Name');
  if (!legalName) {
    log('error', 'No legal name found in organisation response', {}, correlationId);
    return null;
  }
  
  // Get RTO code from XML
  const xmlCode = extractValue(normalized, 'Code') || extractValue(normalized, 'RtoCode') || extractValue(normalized, 'NationalProviderId');
  
  if (xmlCode && xmlCode !== canonicalRtoCode) {
    log('warn', `XML RTO code "${xmlCode}" differs from canonical "${canonicalRtoCode}". Using canonical.`, {}, correlationId);
  }
  
  return {
    code: canonicalRtoCode,
    legalName,
    tradingName: extractValue(normalized, 'TradingName'),
    organisationType: extractValue(normalized, 'OrganisationType') || extractValue(normalized, 'Type'),
    abn: extractValue(normalized, 'Abn') || extractValue(normalized, 'ABN'),
    acn: extractValue(normalized, 'Acn') || extractValue(normalized, 'ACN'),
    status: extractValue(normalized, 'Status') || extractValue(normalized, 'RegistrationStatus'),
    webAddress: extractValue(normalized, 'WebAddress') || extractValue(normalized, 'Website'),
    initialRegistrationDate: extractValue(normalized, 'InitialRegistrationDate'),
    registrationStartDate: extractValue(normalized, 'RegistrationStartDate'),
    registrationEndDate: extractValue(normalized, 'RegistrationEndDate'),
    contacts: parseContacts(normalized, correlationId),
    addresses: parseAddresses(normalized, correlationId),
    deliveryLocations: parseDeliveryLocations(normalized, correlationId),
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
          
          // Update import state on success
          await supabase.from('tga_import_state')
            .update({ 
              latest_success: fetchedAt,
              updated_at: fetchedAt,
            })
            .eq('id', 1);
        }

        // Update link status
        if (client_id) {
          await supabase
            .from('tga_links')
            .upsert({
              client_id,
              rto_number: orgData.code,
              is_linked: true,
              link_status: 'synced',
              last_sync_at: fetchedAt,
              last_sync_status: 'success',
              last_sync_error: null,
              updated_at: fetchedAt,
            }, { onConflict: 'client_id' });
        }

        return new Response(JSON.stringify({
          success: true,
          correlationId,
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
        log('error', 'Client sync failed', { error: errorMsg, rto_number, client_id }, correlationId);
        
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
