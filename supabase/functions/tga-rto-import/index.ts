import "https://deno.land/x/xhr@0.1.0/mod.ts";
import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2.49.4";

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
};

// TGA SOAP Endpoint - use production by default, can override with TGA_WS_BASE secret
const TGA_WS_BASE = Deno.env.get('TGA_WS_BASE') || 'https://ws.training.gov.au';
const TGA_ORG_ENDPOINT = `${TGA_WS_BASE}/Deewr.Tga.Webservices/OrganisationServiceV13.svc/Organisation`;

// Use production credentials (TGA_WS_*) as primary, sandbox as fallback
const TGA_USERNAME = Deno.env.get('TGA_WS_USERNAME') || Deno.env.get('TGA_SANDBOX_USERNAME') || '';
const TGA_PASSWORD = Deno.env.get('TGA_WS_PASSWORD') || Deno.env.get('TGA_SANDBOX_PASSWORD') || '';

function escapeXml(unsafe: string): string {
  return unsafe
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&apos;');
}

// Build SOAP 1.1 envelope with WS-Security (matching working function pattern)
function buildSoapEnvelope(body: string, action: string): string {
  const securityHeader = TGA_USERNAME && TGA_PASSWORD ? `
  <soap:Header>
    <wsse:Security xmlns:wsse="http://docs.oasis-open.org/wss/2004/01/oasis-200401-wss-wssecurity-secext-1.0.xsd">
      <wsse:UsernameToken>
        <wsse:Username>${escapeXml(TGA_USERNAME)}</wsse:Username>
        <wsse:Password Type="http://docs.oasis-open.org/wss/2004/01/oasis-200401-wss-username-token-profile-1.0#PasswordText">${escapeXml(TGA_PASSWORD)}</wsse:Password>
      </wsse:UsernameToken>
    </wsse:Security>
  </soap:Header>` : '';

  return `<?xml version="1.0" encoding="utf-8"?>
<soap:Envelope xmlns:soap="http://schemas.xmlsoap.org/soap/envelope/" 
               xmlns:tga="http://www.tga.deewr.gov.au/"
               xmlns:wsse="http://docs.oasis-open.org/wss/2004/01/oasis-200401-wss-wssecurity-secext-1.0.xsd">${securityHeader}
  <soap:Body>
    ${body}
  </soap:Body>
</soap:Envelope>`;
}

// XML parsing helpers
function extractValue(xml: string, tagName: string): string | null {
  const patterns = [
    new RegExp(`<a:${tagName}[^>]*>([^<]*)</a:${tagName}>`, 'i'),
    new RegExp(`<${tagName}[^>]*>([^<]*)</${tagName}>`, 'i'),
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
  // Also try without 'a:' prefix
  if (matches.length === 0) {
    const pattern2 = new RegExp(`<${tagName}[^>]*>[\\s\\S]*?</${tagName}>`, 'gi');
    return xml.match(pattern2) || [];
  }
  return matches;
}

async function makeSoapRequest(action: string, body: string): Promise<{ xml: string; error: string | null }> {
  console.log(`[TGA RTO Import] SOAP request, action: ${action}`);
  
  if (!TGA_USERNAME || !TGA_PASSWORD) {
    console.error('[TGA RTO Import] Missing TGA credentials');
    return { xml: '', error: 'TGA SOAP credentials not configured. Set TGA_WS_USERNAME and TGA_WS_PASSWORD secrets.' };
  }

  const soapEnvelope = buildSoapEnvelope(body, action);
  
  try {
    const response = await fetch(TGA_ORG_ENDPOINT, {
      method: 'POST',
      headers: {
        'Content-Type': 'text/xml; charset=utf-8',
        'SOAPAction': `http://www.tga.deewr.gov.au/IOrganisationService/${action}`,
      },
      body: soapEnvelope,
    });

    const responseText = await response.text();
    
    if (!response.ok) {
      console.error(`[TGA RTO Import] SOAP error ${response.status}:`, responseText.substring(0, 1000));
      
      if (responseText.includes('InvalidSecurity')) {
        return { xml: '', error: 'TGA authentication failed. Check credentials.' };
      }
      
      return { xml: '', error: `SOAP request failed: ${response.status} ${response.statusText}` };
    }

    console.log(`[TGA RTO Import] Got ${responseText.length} bytes`);
    return { xml: responseText, error: null };
  } catch (error) {
    console.error('[TGA RTO Import] Fetch error:', error);
    return { xml: '', error: error instanceof Error ? error.message : String(error) };
  }
}

// Fetch organisation details using GetOrganisation (matching working function)
async function fetchOrganisationDetails(rtoCode: string): Promise<{
  summary: Record<string, unknown> | null;
  contacts: Record<string, unknown>[];
  addresses: Record<string, unknown>[];
  deliveryLocations: Record<string, unknown>[];
  error: string | null;
}> {
  const body = `<tga:GetOrganisation>
      <tga:code>${escapeXml(rtoCode)}</tga:code>
    </tga:GetOrganisation>`;
  
  const { xml, error } = await makeSoapRequest('GetOrganisation', body);
  
  if (error) {
    return { summary: null, contacts: [], addresses: [], deliveryLocations: [], error };
  }

  // Parse summary
  const summary = {
    legal_name: extractValue(xml, 'LegalName') || extractValue(xml, 'Name'),
    trading_name: extractValue(xml, 'TradingName'),
    organisation_type: extractValue(xml, 'OrganisationType'),
    abn: extractValue(xml, 'ABN'),
    status: extractValue(xml, 'Status'),
    registration_start_date: extractValue(xml, 'RegistrationStartDate') || extractValue(xml, 'RegistrationDate'),
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
  const locationBlocks = extractMultipleBlocks(xml, 'DeliveryLocation');
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
    error: null 
  };
}

// Fetch scope using GetOrganisationScope
async function fetchOrganisationScope(rtoCode: string): Promise<{
  qualifications: Record<string, unknown>[];
  skillsets: Record<string, unknown>[];
  units: Record<string, unknown>[];
  courses: Record<string, unknown>[];
  error: string | null;
}> {
  const body = `<tga:GetOrganisationScope>
      <tga:code>${escapeXml(rtoCode)}</tga:code>
    </tga:GetOrganisationScope>`;
  
  const { xml, error } = await makeSoapRequest('GetOrganisationScope', body);
  
  if (error) {
    console.error('[TGA RTO Import] Scope fetch error:', error);
    // Don't fail the whole import if scope fails - just return empty
    return { qualifications: [], skillsets: [], units: [], courses: [], error };
  }

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

  // Parse units
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

  return { qualifications, skillsets, units, courses, error: null };
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
        console.log('[TGA RTO Import] Upserting summary:', orgResult.summary);
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
        console.log(`[TGA RTO Import] Inserting ${orgResult.contacts.length} contacts`);
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
        console.log(`[TGA RTO Import] Inserting ${orgResult.addresses.length} addresses`);
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
        console.log(`[TGA RTO Import] Inserting ${orgResult.deliveryLocations.length} delivery locations`);
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

      // Delete old scope data and insert new (only if we got results)
      if (!scopeResult.error) {
        await supabase.from('tga_scope_qualifications').delete().eq('tenant_id', tenant_id).eq('rto_code', rto_code);
        if (scopeResult.qualifications.length > 0) {
          console.log(`[TGA RTO Import] Inserting ${scopeResult.qualifications.length} qualifications`);
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
          console.log(`[TGA RTO Import] Inserting ${scopeResult.skillsets.length} skillsets`);
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
          console.log(`[TGA RTO Import] Inserting ${scopeResult.units.length} units`);
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
          console.log(`[TGA RTO Import] Inserting ${scopeResult.courses.length} courses`);
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
      }

      // Update job with counts
      await supabase.from('tga_rto_import_jobs').update({
        scope_fetched: !scopeResult.error,
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
      entity_type: 'tga_import',
      entity_id: job_id,
      action: errorMessage ? 'tga.import.failed' : 'tga.import.completed',
      actor_user_id: user.id,
      details: { rto_code, error: errorMessage },
    });

    console.log(`[TGA RTO Import] Job ${job_id} ${errorMessage ? 'failed' : 'completed'}`);

    return new Response(
      JSON.stringify({ 
        success: !errorMessage, 
        job_id,
        error: errorMessage 
      }),
      { headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
    );

  } catch (error) {
    console.error('[TGA RTO Import] Handler error:', error);
    return new Response(
      JSON.stringify({ error: error instanceof Error ? error.message : 'Unknown error' }),
      { status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
    );
  }
});
