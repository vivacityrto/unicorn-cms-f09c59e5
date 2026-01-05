import "https://deno.land/x/xhr@0.1.0/mod.ts";
import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2.49.4";

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
};

// TGA Production SOAP Endpoints
const TGA_ENDPOINTS = {
  organisation: 'https://ws.training.gov.au/Deewr.Tga.Webservices/OrganisationServiceV13.svc',
  training: 'https://ws.training.gov.au/Deewr.Tga.Webservices/TrainingComponentServiceV13.svc',
};

const TGA_WS_USERNAME = Deno.env.get('TGA_WS_USERNAME');
const TGA_WS_PASSWORD = Deno.env.get('TGA_WS_PASSWORD');

const SOAP_NS = {
  soap: 'http://www.w3.org/2003/05/soap-envelope',
  org: 'http://training.gov.au/services/Organisation',
};

function getBasicAuthHeader(): string {
  if (!TGA_WS_USERNAME || !TGA_WS_PASSWORD) {
    throw new Error('TGA SOAP credentials not configured');
  }
  return `Basic ${btoa(`${TGA_WS_USERNAME}:${TGA_WS_PASSWORD}`)}`;
}

// XML parsing helpers
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

function extractBlock(xml: string, tagName: string): string | null {
  const pattern = new RegExp(`<(?:a:)?${tagName}[^>]*>([\\s\\S]*?)<\\/(?:a:)?${tagName}>`, 'i');
  const match = xml.match(pattern);
  return match ? match[0] : null;
}

function extractMultipleBlocks(xml: string, tagName: string): string[] {
  const pattern = new RegExp(`<(?:a:)?${tagName}[^>]*>[\\s\\S]*?<\\/(?:a:)?${tagName}>`, 'gi');
  return xml.match(pattern) || [];
}

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

async function makeSoapRequest(endpoint: string, soapAction: string, body: string): Promise<string> {
  console.log(`[TGA RTO Import] SOAP request to ${endpoint}, action: ${soapAction}`);
  
  const response = await fetch(endpoint, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/soap+xml; charset=utf-8',
      'Authorization': getBasicAuthHeader(),
    },
    body,
  });

  if (!response.ok) {
    const errorText = await response.text();
    console.error(`[TGA RTO Import] Error ${response.status}:`, errorText.substring(0, 500));
    throw new Error(`SOAP request failed: ${response.status} ${response.statusText}`);
  }

  return await response.text();
}

// Fetch organisation details
async function fetchOrganisationDetails(rtoCode: string): Promise<{
  summary: Record<string, unknown> | null;
  contacts: Record<string, unknown>[];
  addresses: Record<string, unknown>[];
  deliveryLocations: Record<string, unknown>[];
  rawXml: string;
  error: string | null;
}> {
  try {
    const body = buildOrgSoapRequest('GetDetails', `<org:request><org:Code>${rtoCode}</org:Code></org:request>`);
    const xml = await makeSoapRequest(TGA_ENDPOINTS.organisation, 'GetDetails', body);
    
    console.log(`[TGA RTO Import] Got ${xml.length} bytes for org ${rtoCode}`);
    
    // Parse summary
    const summary = {
      legal_name: extractValue(xml, 'LegalName') || extractValue(xml, 'Name'),
      trading_name: extractValue(xml, 'TradingName'),
      organisation_type: extractValue(xml, 'OrganisationType'),
      abn: extractValue(xml, 'ABN'),
      status: extractValue(xml, 'Status'),
      registration_start_date: extractValue(xml, 'RegistrationStartDate'),
      registration_end_date: extractValue(xml, 'RegistrationEndDate'),
    };

    // Parse contacts
    const contactBlocks = extractMultipleBlocks(xml, 'Contact');
    const contacts = contactBlocks.map(block => ({
      contact_type: extractValue(block, 'ContactType') || extractValue(block, 'Type'),
      name: extractValue(block, 'Name') || `${extractValue(block, 'FirstName') || ''} ${extractValue(block, 'LastName') || ''}`.trim(),
      position: extractValue(block, 'Position'),
      phone: extractValue(block, 'Phone') || extractValue(block, 'PhoneNumber'),
      email: extractValue(block, 'Email'),
    })).filter(c => c.name || c.email);

    // Parse addresses
    const addressBlocks = extractMultipleBlocks(xml, 'Address');
    const addresses = addressBlocks.map(block => ({
      address_type: extractValue(block, 'AddressType') || extractValue(block, 'Type') || 'head_office',
      address_line_1: extractValue(block, 'AddressLine1') || extractValue(block, 'Line1'),
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
    const locationBlocks = extractMultipleBlocks(xml, 'DeliveryLocation');
    const deliveryLocations = locationBlocks.map(block => ({
      location_name: extractValue(block, 'Name') || extractValue(block, 'LocationName'),
      address_line_1: extractValue(block, 'AddressLine1') || extractValue(block, 'Line1'),
      address_line_2: extractValue(block, 'AddressLine2') || extractValue(block, 'Line2'),
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
      rawXml: xml,
      error: null 
    };
  } catch (error: unknown) {
    console.error(`[TGA RTO Import] Error fetching org ${rtoCode}:`, error);
    return { 
      summary: null, 
      contacts: [], 
      addresses: [], 
      deliveryLocations: [],
      rawXml: '',
      error: error instanceof Error ? error.message : String(error) 
    };
  }
}

// Fetch scope (qualifications, skillsets, units, courses)
async function fetchOrganisationScope(rtoCode: string): Promise<{
  qualifications: Record<string, unknown>[];
  skillsets: Record<string, unknown>[];
  units: Record<string, unknown>[];
  courses: Record<string, unknown>[];
  rawXml: string;
  error: string | null;
}> {
  try {
    const body = buildOrgSoapRequest('GetScope', `<org:request><org:OrganisationCode>${rtoCode}</org:OrganisationCode></org:request>`);
    const xml = await makeSoapRequest(TGA_ENDPOINTS.organisation, 'GetScope', body);
    
    console.log(`[TGA RTO Import] Got ${xml.length} bytes for scope ${rtoCode}`);

    // Parse qualifications
    const qualBlocks = extractMultipleBlocks(xml, 'Qualification');
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
    const skillBlocks = extractMultipleBlocks(xml, 'SkillSet');
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

    // Parse units (explicit)
    const unitBlocks = extractMultipleBlocks(xml, 'Unit');
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
    const courseBlocks = extractMultipleBlocks(xml, 'AccreditedCourse');
    const courses = courseBlocks.map(block => ({
      course_code: extractValue(block, 'Code'),
      course_title: extractValue(block, 'Title'),
      scope_start_date: extractValue(block, 'ScopeStartDate') || extractValue(block, 'StartDate'),
      scope_end_date: extractValue(block, 'ScopeEndDate') || extractValue(block, 'EndDate'),
      status: extractValue(block, 'Status'),
      is_current: extractValue(block, 'IsCurrent')?.toLowerCase() === 'true',
    })).filter(c => c.course_code);

    return { 
      qualifications, 
      skillsets, 
      units, 
      courses,
      rawXml: xml,
      error: null 
    };
  } catch (error: unknown) {
    console.error(`[TGA RTO Import] Error fetching scope ${rtoCode}:`, error);
    return { 
      qualifications: [], 
      skillsets: [], 
      units: [], 
      courses: [],
      rawXml: '',
      error: error instanceof Error ? error.message : String(error) 
    };
  }
}

serve(async (req) => {
  if (req.method === 'OPTIONS') {
    return new Response(null, { headers: corsHeaders });
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

    // Check if SuperAdmin or Admin
    const { data: userProfile } = await supabase
      .from('users')
      .select('global_role')
      .eq('user_uuid', user.id)
      .single();

    const isAdmin = userProfile?.global_role === 'SuperAdmin' || userProfile?.global_role === 'Admin';
    if (!isAdmin) {
      return new Response(JSON.stringify({ error: 'Admin access required' }), {
        status: 403,
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      });
    }

    const { job_id, tenant_id, rto_code } = await req.json();

    if (!job_id || !tenant_id || !rto_code) {
      return new Response(JSON.stringify({ error: 'job_id, tenant_id, and rto_code required' }), {
        status: 400,
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      });
    }

    console.log(`[TGA RTO Import] Starting import for tenant ${tenant_id}, RTO ${rto_code}, job ${job_id}`);

    // Mark job as running
    await supabase
      .from('tga_rto_import_jobs')
      .update({ status: 'running', started_at: new Date().toISOString() })
      .eq('id', job_id);

    let errorMessage: string | null = null;
    const now = new Date().toISOString();

    try {
      // 1. Fetch organisation details
      const orgResult = await fetchOrganisationDetails(rto_code);
      
      if (orgResult.error) {
        throw new Error(`Failed to fetch org details: ${orgResult.error}`);
      }

      // Upsert summary
      if (orgResult.summary) {
        await supabase.from('tga_rto_summary').upsert({
          tenant_id,
          rto_code,
          ...orgResult.summary,
          source_payload: orgResult.summary,
          fetched_at: now,
          updated_at: now,
        }, { onConflict: 'tenant_id,rto_code' });
      }

      // Delete old contacts and insert new
      await supabase.from('tga_rto_contacts').delete().eq('tenant_id', tenant_id).eq('rto_code', rto_code);
      if (orgResult.contacts.length > 0) {
        await supabase.from('tga_rto_contacts').insert(
          orgResult.contacts.map(c => ({
            tenant_id,
            rto_code,
            ...c,
            source_payload: c,
            fetched_at: now,
          }))
        );
      }

      // Delete old addresses and insert new
      await supabase.from('tga_rto_addresses').delete().eq('tenant_id', tenant_id).eq('rto_code', rto_code);
      if (orgResult.addresses.length > 0) {
        await supabase.from('tga_rto_addresses').insert(
          orgResult.addresses.map(a => ({
            tenant_id,
            rto_code,
            ...a,
            source_payload: a,
            fetched_at: now,
          }))
        );
      }

      // Delete old delivery locations and insert new
      await supabase.from('tga_rto_delivery_locations').delete().eq('tenant_id', tenant_id).eq('rto_code', rto_code);
      if (orgResult.deliveryLocations.length > 0) {
        await supabase.from('tga_rto_delivery_locations').insert(
          orgResult.deliveryLocations.map(l => ({
            tenant_id,
            rto_code,
            ...l,
            source_payload: l,
            fetched_at: now,
          }))
        );
      }

      // Update job progress
      await supabase.from('tga_rto_import_jobs').update({
        summary_fetched: true,
        contacts_fetched: true,
        addresses_fetched: true,
      }).eq('id', job_id);

      // 2. Fetch scope
      const scopeResult = await fetchOrganisationScope(rto_code);

      // Delete old scope data and insert new
      await supabase.from('tga_scope_qualifications').delete().eq('tenant_id', tenant_id).eq('rto_code', rto_code);
      if (scopeResult.qualifications.length > 0) {
        await supabase.from('tga_scope_qualifications').insert(
          scopeResult.qualifications.map(q => ({
            tenant_id,
            rto_code,
            ...q,
            source_payload: q,
            fetched_at: now,
          }))
        );
      }

      await supabase.from('tga_scope_skillsets').delete().eq('tenant_id', tenant_id).eq('rto_code', rto_code);
      if (scopeResult.skillsets.length > 0) {
        await supabase.from('tga_scope_skillsets').insert(
          scopeResult.skillsets.map(s => ({
            tenant_id,
            rto_code,
            ...s,
            source_payload: s,
            fetched_at: now,
          }))
        );
      }

      await supabase.from('tga_scope_units').delete().eq('tenant_id', tenant_id).eq('rto_code', rto_code);
      if (scopeResult.units.length > 0) {
        await supabase.from('tga_scope_units').insert(
          scopeResult.units.map(u => ({
            tenant_id,
            rto_code,
            ...u,
            source_payload: u,
            fetched_at: now,
          }))
        );
      }

      await supabase.from('tga_scope_courses').delete().eq('tenant_id', tenant_id).eq('rto_code', rto_code);
      if (scopeResult.courses.length > 0) {
        await supabase.from('tga_scope_courses').insert(
          scopeResult.courses.map(c => ({
            tenant_id,
            rto_code,
            ...c,
            source_payload: c,
            fetched_at: now,
          }))
        );
      }

      // Update job with counts
      await supabase.from('tga_rto_import_jobs').update({
        scope_fetched: true,
        qualifications_count: scopeResult.qualifications.length,
        skillsets_count: scopeResult.skillsets.length,
        units_count: scopeResult.units.length,
        courses_count: scopeResult.courses.length,
      }).eq('id', job_id);

      // Update registry link with last sync time
      await supabase.from('tenant_registry_links').update({
        last_synced_at: now,
        last_error: null,
      }).eq('tenant_id', tenant_id).eq('registry', 'tga');

    } catch (error: unknown) {
      console.error('[TGA RTO Import] Import error:', error);
      errorMessage = error instanceof Error ? error.message : String(error);
    }

    // Final job update
    await supabase.from('tga_rto_import_jobs').update({
      status: errorMessage ? 'failed' : 'done',
      completed_at: now,
      error_message: errorMessage,
    }).eq('id', job_id);

    // Audit log
    await supabase.from('client_audit_log').insert({
      tenant_id,
      entity_type: 'tga_rto_import_jobs',
      entity_id: job_id,
      action: errorMessage ? 'tga.import.failed' : 'tga.import.completed',
      actor_user_id: user.id,
      details: {
        job_id,
        rto_code,
        error: errorMessage,
      },
    });

    return new Response(JSON.stringify({
      success: !errorMessage,
      job_id,
      error: errorMessage,
    }), {
      headers: { ...corsHeaders, 'Content-Type': 'application/json' },
    });

  } catch (error: unknown) {
    console.error('[TGA RTO Import] Error:', error);
    return new Response(JSON.stringify({ error: error instanceof Error ? error.message : String(error) }), {
      status: 500,
      headers: { ...corsHeaders, 'Content-Type': 'application/json' },
    });
  }
});
