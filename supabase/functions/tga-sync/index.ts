import "https://deno.land/x/xhr@0.1.0/mod.ts";
import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2.49.4";

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
};

// TGA Production SOAP Endpoints (uppercase WebServices per official WSDL)
const TGA_ENDPOINTS = {
  organisation: 'https://ws.training.gov.au/Deewr.Tga.WebServices/OrganisationServiceV13.svc',
  training: 'https://ws.training.gov.au/Deewr.Tga.WebServices/TrainingComponentServiceV13.svc',
  classification: 'https://ws.training.gov.au/Deewr.Tga.WebServices/ClassificationServiceV13.svc',
};

const TGA_WS_USERNAME = Deno.env.get('TGA_WS_USERNAME');
const TGA_WS_PASSWORD = Deno.env.get('TGA_WS_PASSWORD');

// SOAP namespaces
const SOAP_NS = {
  soap: 'http://www.w3.org/2003/05/soap-envelope',
  org: 'http://training.gov.au/services/Organisation',
  tc: 'http://training.gov.au/services/TrainingComponent',
};

// Build Basic Auth header
function getBasicAuthHeader(): string {
  if (!TGA_WS_USERNAME || !TGA_WS_PASSWORD) {
    throw new Error('TGA SOAP credentials not configured');
  }
  const credentials = btoa(`${TGA_WS_USERNAME}:${TGA_WS_PASSWORD}`);
  return `Basic ${credentials}`;
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

// Build SOAP envelope for Organisation service
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

// Build SOAP envelope for Training Component service
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

// Make SOAP request
async function makeSoapRequest(endpoint: string, soapAction: string, body: string): Promise<string> {
  console.log(`[TGA SOAP] Request to ${endpoint}, action: ${soapAction}`);
  
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
    console.error(`[TGA SOAP] Error ${response.status}:`, errorText.substring(0, 500));
    throw new Error(`SOAP request failed: ${response.status} ${response.statusText}`);
  }

  const xmlResponse = await response.text();
  console.log(`[TGA SOAP] Response length: ${xmlResponse.length}`);
  return xmlResponse;
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
    const body = buildTCSoapRequest('GetDetails', `<tc:request><tc:Code>${code}</tc:Code></tc:request>`);
    const response = await makeSoapRequest(TGA_ENDPOINTS.training, 'GetDetails', body);
    
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
    const body = buildOrgSoapRequest('GetDetails', `<org:request><org:Code>${code}</org:Code></org:request>`);
    const response = await makeSoapRequest(TGA_ENDPOINTS.organisation, 'GetDetails', body);
    
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
    
    const response = await makeSoapRequest(TGA_ENDPOINTS.training, 'Search', body);
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

// Test connection
async function testConnection(): Promise<{ success: boolean; message: string }> {
  try {
    // Try to fetch a known training component
    const result = await fetchTrainingComponent('BSB30120');
    if (result.data) {
      return { success: true, message: `Connected. Test fetch: ${result.data.title}` };
    }
    return { success: false, message: result.error || 'Unknown error' };
  } catch (error: unknown) {
    return { success: false, message: error instanceof Error ? error.message : String(error) };
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

    // Check if SuperAdmin
    const { data: userProfile } = await supabase
      .from('users')
      .select('global_role')
      .eq('user_uuid', user.id)
      .single();

    const isSuperAdmin = userProfile?.global_role === 'SuperAdmin';

    const url = new URL(req.url);
    const action = url.searchParams.get('action') || 'status';

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