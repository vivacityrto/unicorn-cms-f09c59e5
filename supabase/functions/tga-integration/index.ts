import "https://deno.land/x/xhr@0.1.0/mod.ts";
import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2.49.4";

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
};

// TGA API configuration
const TGA_MODE = Deno.env.get('TGA_MODE') || 'REST';
const TGA_API_BASE = Deno.env.get('TGA_API_BASE') || 'https://training.gov.au';
const TGA_API_TOKEN = Deno.env.get('TGA_API_TOKEN');
const TGA_WS_BASE = Deno.env.get('TGA_WS_BASE') || 'https://ws.sandbox.training.gov.au';
const TGA_WS_USERNAME = Deno.env.get('TGA_WS_USERNAME');
const TGA_WS_PASSWORD = Deno.env.get('TGA_WS_PASSWORD');

// Type definitions
interface TGAProduct {
  product_code: string;
  product_type: 'qualification' | 'unit' | 'skillset' | 'accredited_course';
  title: string;
  status: string | null;
  training_package: string | null;
  release_version: string | null;
  superseded_by: string | null;
}

interface ProbeResult {
  code: string;
  found: boolean;
  mapped: TGAProduct | null;
  raw: Record<string, unknown> | null;
  error: string | null;
}

interface SyncResult {
  code: string;
  action: 'inserted' | 'updated' | 'unchanged' | 'error';
  error?: string;
}

// Determine product type from code pattern
function detectProductType(code: string): TGAProduct['product_type'] {
  // Qualifications: 3 letters + 5 digits (e.g., BSB30120, CHC33021)
  if (/^[A-Z]{3}\d{5}$/.test(code)) return 'qualification';
  // Skill sets: 3 letters + 2 letters + 4 digits (e.g., BSBSS00075)
  if (/^[A-Z]{3}SS\d{5}$/.test(code)) return 'skillset';
  // Units: 3+ letters + 3 digits + letter (e.g., HLTAID009, BSBOPS505)
  if (/^[A-Z]{3,}\d{3,}[A-Z]?$/.test(code)) return 'unit';
  // Default to unit if pattern doesn't match
  return 'unit';
}

// Compute deterministic hash for source data
function computeSourceHash(data: Record<string, unknown>): string {
  const str = JSON.stringify(data, Object.keys(data).sort());
  let hash = 0;
  for (let i = 0; i < str.length; i++) {
    const char = str.charCodeAt(i);
    hash = ((hash << 5) - hash) + char;
    hash = hash & hash; // Convert to 32bit integer
  }
  return hash.toString(16);
}

// REST API provider
async function fetchFromREST(code: string): Promise<{ mapped: TGAProduct | null; raw: Record<string, unknown> | null; error: string | null }> {
  try {
    // Use TGA's public search API
    const searchUrl = `${TGA_API_BASE}/Api/Search?searchType=TrainingProduct&term=${encodeURIComponent(code)}&includeSuperseded=true`;
    
    const headers: Record<string, string> = {
      'Accept': 'application/json',
    };
    
    if (TGA_API_TOKEN) {
      headers['Authorization'] = `Bearer ${TGA_API_TOKEN}`;
    }

    console.log(`[TGA REST] Fetching: ${searchUrl}`);
    
    const response = await fetch(searchUrl, { headers });
    
    if (!response.ok) {
      console.error(`[TGA REST] HTTP ${response.status}: ${response.statusText}`);
      return { mapped: null, raw: null, error: `HTTP ${response.status}: ${response.statusText}` };
    }

    const data = await response.json();
    console.log(`[TGA REST] Response:`, JSON.stringify(data).substring(0, 500));
    
    // Find exact match in results
    const results = data.Results || data.results || [];
    const match = results.find((r: Record<string, unknown>) => 
      (r.Code || r.code) === code || (r.NationalCode || r.nationalCode) === code
    );

    if (!match) {
      return { mapped: null, raw: null, error: 'Product not found' };
    }

    const mapped: TGAProduct = {
      product_code: code,
      product_type: detectProductType(code),
      title: match.Title || match.title || match.Name || match.name || '',
      status: match.Status || match.status || null,
      training_package: match.TrainingPackageCode || match.trainingPackageCode || null,
      release_version: match.Release || match.release || null,
      superseded_by: match.SupersededBy || match.supersededBy || null,
    };

    return { mapped, raw: match as Record<string, unknown>, error: null };
  } catch (error: unknown) {
    console.error(`[TGA REST] Error:`, error);
    return { mapped: null, raw: null, error: error instanceof Error ? error.message : String(error) };
  }
}

// SOAP API provider (simplified)
async function fetchFromSOAP(code: string): Promise<{ mapped: TGAProduct | null; raw: Record<string, unknown> | null; error: string | null }> {
  try {
    if (!TGA_WS_USERNAME || !TGA_WS_PASSWORD) {
      return { mapped: null, raw: null, error: 'SOAP credentials not configured' };
    }

    const soapEnvelope = `<?xml version="1.0" encoding="utf-8"?>
<soap:Envelope xmlns:soap="http://schemas.xmlsoap.org/soap/envelope/" 
               xmlns:tga="http://training.gov.au/services/Organisation">
  <soap:Header>
    <tga:AuthenticationHeader>
      <tga:Username>${TGA_WS_USERNAME}</tga:Username>
      <tga:Password>${TGA_WS_PASSWORD}</tga:Password>
    </tga:AuthenticationHeader>
  </soap:Header>
  <soap:Body>
    <tga:GetTrainingComponent>
      <tga:code>${code}</tga:code>
    </tga:GetTrainingComponent>
  </soap:Body>
</soap:Envelope>`;

    console.log(`[TGA SOAP] Fetching code: ${code}`);
    
    const response = await fetch(`${TGA_WS_BASE}/Organisation/Organisation.svc`, {
      method: 'POST',
      headers: {
        'Content-Type': 'text/xml; charset=utf-8',
        'SOAPAction': 'http://training.gov.au/services/Organisation/IOrganisation/GetTrainingComponent',
      },
      body: soapEnvelope,
    });

    if (!response.ok) {
      return { mapped: null, raw: null, error: `HTTP ${response.status}` };
    }

    const xmlText = await response.text();
    console.log(`[TGA SOAP] Response:`, xmlText.substring(0, 500));
    
    // Simple XML parsing for key fields
    const titleMatch = xmlText.match(/<(?:a:)?Title>([^<]+)<\/(?:a:)?Title>/i);
    const statusMatch = xmlText.match(/<(?:a:)?Status>([^<]+)<\/(?:a:)?Status>/i);
    const packageMatch = xmlText.match(/<(?:a:)?TrainingPackageCode>([^<]+)<\/(?:a:)?TrainingPackageCode>/i);

    if (!titleMatch) {
      return { mapped: null, raw: { xmlResponse: xmlText }, error: 'Could not parse response' };
    }

    const mapped: TGAProduct = {
      product_code: code,
      product_type: detectProductType(code),
      title: titleMatch[1],
      status: statusMatch ? statusMatch[1] : null,
      training_package: packageMatch ? packageMatch[1] : null,
      release_version: null,
      superseded_by: null,
    };

    return { mapped, raw: { xmlResponse: xmlText }, error: null };
  } catch (error: unknown) {
    console.error(`[TGA SOAP] Error:`, error);
    return { mapped: null, raw: null, error: error instanceof Error ? error.message : String(error) };
  }
}

// Unified fetch function
async function fetchProduct(code: string): Promise<{ mapped: TGAProduct | null; raw: Record<string, unknown> | null; error: string | null }> {
  if (TGA_MODE === 'SOAP') {
    return fetchFromSOAP(code);
  }
  return fetchFromREST(code);
}

serve(async (req) => {
  // Handle CORS preflight
  if (req.method === 'OPTIONS') {
    return new Response(null, { headers: corsHeaders });
  }

  try {
    // Verify authorization
    const authHeader = req.headers.get('Authorization');
    if (!authHeader) {
      return new Response(JSON.stringify({ error: 'Missing authorization header' }), {
        status: 401,
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      });
    }

    // Create Supabase client
    const supabaseUrl = Deno.env.get('SUPABASE_URL')!;
    const supabaseKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!;
    const supabase = createClient(supabaseUrl, supabaseKey);

    // Verify JWT and get user
    const token = authHeader.replace('Bearer ', '');
    const { data: { user }, error: authError } = await supabase.auth.getUser(token);
    
    if (authError || !user) {
      console.error('[TGA] Auth error:', authError);
      return new Response(JSON.stringify({ error: 'Invalid token' }), {
        status: 401,
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      });
    }

    const url = new URL(req.url);
    const isProbe = url.searchParams.get('probe') === '1';
    const probeCode = url.searchParams.get('code');
    
    // Handle GET requests (probe mode)
    if (req.method === 'GET') {
      if (!isProbe || !probeCode) {
        return new Response(JSON.stringify({ error: 'Probe mode requires ?probe=1&code=CODE' }), {
          status: 400,
          headers: { ...corsHeaders, 'Content-Type': 'application/json' },
        });
      }

      // Check admin access for probe (need tenant_id from query)
      const tenantId = url.searchParams.get('tenant_id');
      if (!tenantId) {
        return new Response(JSON.stringify({ error: 'tenant_id is required' }), {
          status: 400,
          headers: { ...corsHeaders, 'Content-Type': 'application/json' },
        });
      }

      // Check user permissions
      const { data: userProfile } = await supabase
        .from('users')
        .select('global_role')
        .eq('user_uuid', user.id)
        .single();

      const isSuperAdmin = userProfile?.global_role === 'SuperAdmin';

      if (!isSuperAdmin) {
        const { data: membership } = await supabase
          .from('tenant_members')
          .select('role')
          .eq('user_id', user.id)
          .eq('tenant_id', parseInt(tenantId))
          .eq('status', 'active')
          .single();

        if (!membership || membership.role !== 'Admin') {
          return new Response(JSON.stringify({ error: 'Admin access required' }), {
            status: 403,
            headers: { ...corsHeaders, 'Content-Type': 'application/json' },
          });
        }
      }

      // Perform probe - no DB writes
      console.log(`[TGA] Probe mode for code: ${probeCode}`);
      const result = await fetchProduct(probeCode);
      
      const probeResult: ProbeResult = {
        code: probeCode,
        found: result.mapped !== null,
        mapped: result.mapped,
        raw: result.raw,
        error: result.error,
      };

      return new Response(JSON.stringify(probeResult), {
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      });
    }

    // Handle POST requests (sync mode)
    if (req.method === 'POST') {
      const body = await req.json();
      const { codes, job_id, tenant_id } = body;

      if (!tenant_id) {
        return new Response(JSON.stringify({ error: 'tenant_id is required' }), {
          status: 400,
          headers: { ...corsHeaders, 'Content-Type': 'application/json' },
        });
      }

      if (!codes || !Array.isArray(codes) || codes.length === 0) {
        return new Response(JSON.stringify({ error: 'codes array is required' }), {
          status: 400,
          headers: { ...corsHeaders, 'Content-Type': 'application/json' },
        });
      }

      // Check user permissions
      const { data: userProfile } = await supabase
        .from('users')
        .select('global_role')
        .eq('user_uuid', user.id)
        .single();

      const isSuperAdmin = userProfile?.global_role === 'SuperAdmin';

      if (!isSuperAdmin) {
        const { data: membership } = await supabase
          .from('tenant_members')
          .select('role')
          .eq('user_id', user.id)
          .eq('tenant_id', tenant_id)
          .eq('status', 'active')
          .single();

        if (!membership || membership.role !== 'Admin') {
          return new Response(JSON.stringify({ error: 'Admin access required' }), {
            status: 403,
            headers: { ...corsHeaders, 'Content-Type': 'application/json' },
          });
        }
      }

      console.log(`[TGA] Sync mode for ${codes.length} codes, tenant: ${tenant_id}`);

      // Update job status if job_id provided
      if (job_id) {
        await supabase
          .from('tga_import_jobs')
          .update({ status: 'running', updated_at: new Date().toISOString() })
          .eq('id', job_id);
      }

      const results: SyncResult[] = [];
      let rowsUpserted = 0;

      for (const code of codes) {
        try {
          const fetchResult = await fetchProduct(code);
          
          if (fetchResult.error || !fetchResult.mapped) {
            results.push({ code, action: 'error', error: fetchResult.error || 'Product not found' });
            continue;
          }

          const sourceHash = computeSourceHash(fetchResult.raw || {});

          // Check if exists and hash changed
          const { data: existing } = await supabase
            .from('tga_cache')
            .select('id, source_hash')
            .eq('tenant_id', tenant_id)
            .eq('product_code', code)
            .single();

          if (existing && existing.source_hash === sourceHash) {
            results.push({ code, action: 'unchanged' });
            continue;
          }

          // Upsert the record
          const { error: upsertError } = await supabase
            .from('tga_cache')
            .upsert({
              tenant_id,
              product_code: code,
              product_type: fetchResult.mapped.product_type,
              title: fetchResult.mapped.title,
              status: fetchResult.mapped.status,
              training_package: fetchResult.mapped.training_package,
              release_version: fetchResult.mapped.release_version,
              superseded_by: fetchResult.mapped.superseded_by,
              fetched_at: new Date().toISOString(),
              source_hash: sourceHash,
              source_payload: fetchResult.raw,
              updated_by: user.id,
              updated_at: new Date().toISOString(),
            }, {
              onConflict: 'tenant_id,product_code',
            });

          if (upsertError) {
            console.error(`[TGA] Upsert error for ${code}:`, upsertError);
            results.push({ code, action: 'error', error: upsertError.message });
          } else {
            results.push({ code, action: existing ? 'updated' : 'inserted' });
            rowsUpserted++;
          }
        } catch (error: unknown) {
          console.error(`[TGA] Error processing ${code}:`, error);
          results.push({ code, action: 'error', error: error instanceof Error ? error.message : String(error) });
        }
      }

      // Update job status
      if (job_id) {
        const hasErrors = results.some(r => r.action === 'error');
        await supabase
          .from('tga_import_jobs')
          .update({
            status: hasErrors ? 'failed' : 'done',
            rows_upserted: rowsUpserted,
            results,
            error: hasErrors ? 'Some codes failed to sync' : null,
            updated_at: new Date().toISOString(),
          })
          .eq('id', job_id);
      }

      // Log audit event
      await supabase
        .from('client_audit_log')
        .insert({
          tenant_id,
          entity_type: 'tga_integration',
          action: 'sync_completed',
          actor_user_id: user.id,
          details: {
            codes_count: codes.length,
            rows_upserted: rowsUpserted,
            job_id,
          },
        });

      return new Response(JSON.stringify({
        success: true,
        rows_upserted: rowsUpserted,
        results,
      }), {
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      });
    }

    return new Response(JSON.stringify({ error: 'Method not allowed' }), {
      status: 405,
      headers: { ...corsHeaders, 'Content-Type': 'application/json' },
    });
  } catch (error: unknown) {
    console.error('[TGA] Unhandled error:', error);
    return new Response(JSON.stringify({ error: error instanceof Error ? error.message : String(error) }), {
      status: 500,
      headers: { ...corsHeaders, 'Content-Type': 'application/json' },
    });
  }
});