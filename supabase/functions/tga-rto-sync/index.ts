import { serve } from "https://deno.land/std@0.224.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2.49.4";

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
};

const supabaseUrl = Deno.env.get("SUPABASE_URL")!;
const supabaseServiceKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
const supabaseAdmin = createClient(supabaseUrl, supabaseServiceKey);

const PAGE_SIZE = 500;

// Compute SHA256 hash of a string using Web Crypto API
async function computeSha256(text: string): Promise<string> {
  const encoder = new TextEncoder();
  const data = encoder.encode(text);
  const hashBuffer = await crypto.subtle.digest('SHA-256', data);
  const hashArray = Array.from(new Uint8Array(hashBuffer));
  return hashArray.map(b => b.toString(16).padStart(2, '0')).join('');
}

// Log helper with structured output
function log(level: 'info' | 'warn' | 'error', message: string, data?: Record<string, unknown>) {
  const timestamp = new Date().toISOString();
  console.log(`[TGA_REST_SYNC] [${level.toUpperCase()}] [${timestamp}] ${message}`, data ? JSON.stringify(data) : '');
}

// Retry helper with exponential backoff
async function fetchWithRetry(url: string, maxRetries = 3): Promise<Response> {
  let lastError: Error | null = null;
  for (let attempt = 0; attempt < maxRetries; attempt++) {
    try {
      const response = await fetch(url, {
        headers: {
          'User-Agent': 'Unicorn/2.0',
          'Accept': 'application/json'
        }
      });
      // If we get 500, retry (could be transient)
      if (response.status === 500 && attempt < maxRetries - 1) {
        const delay = Math.pow(2, attempt) * 300; // 300ms, 600ms, 1200ms
        log('warn', `TGA returned 500, retrying in ${delay}ms (attempt ${attempt + 1}/${maxRetries})`, { url });
        await new Promise(r => setTimeout(r, delay));
        continue;
      }
      return response;
    } catch (err) {
      lastError = err instanceof Error ? err : new Error(String(err));
      if (attempt < maxRetries - 1) {
        const delay = Math.pow(2, attempt) * 300;
        log('warn', `Fetch error, retrying in ${delay}ms`, { error: lastError.message });
        await new Promise(r => setTimeout(r, delay));
      }
    }
  }
  throw lastError || new Error('Max retries exceeded');
}

// Fetch a single scope type (no pipe characters - simple filter)
// Uses minimal URL params to avoid TGA 500 errors
async function fetchScopeSingleType(rtoId: string, componentType: string): Promise<{ items: any[]; urls: string[]; error?: string }> {
  const items: any[] = [];
  const urls: string[] = [];
  let offset = 0;
  let hasMore = true;
  
  // Build filter - fetch CURRENT, EXPLICIT scope items only
  // Note: isImplicit==false in URL causes TGA 500 errors, so we filter locally instead
  const filter = `componentType==${componentType};status==current`;
  
  while (hasMore) {
    // MINIMAL URL: no delivery param, no sorts (these may cause TGA 500s)
    const url = `https://training.gov.au/api/organisation/${encodeURIComponent(rtoId)}/scope?api-version=1.0&offset=${offset}&pageSize=${PAGE_SIZE}&filters=${encodeURIComponent(filter)}`;
    urls.push(url);
    
    log('info', `Fetching ${componentType} at offset ${offset}`, { url });
    
    try {
      const response = await fetchWithRetry(url);
      
      if (!response.ok) {
        const responseText = await response.text();
        log('error', `TGA API error for ${componentType}`, { status: response.status, body: responseText.substring(0, 500) });
        return { items, urls, error: `HTTP ${response.status}` };
      }
      
      const data = await response.json();
      const pageItems = data.value || [];
      
      log('info', `Got ${pageItems.length} ${componentType}(s) at offset ${offset}`, { total: data.count });
      
      // Filter locally: only explicit (isImplicit !== true) and current (status === 'current')
      const currentExplicitItems = pageItems.filter((item: any) => 
        item.isImplicit !== true && item.status === 'current'
      );
      items.push(...currentExplicitItems);
      
      if (pageItems.length < PAGE_SIZE) {
        hasMore = false;
      } else {
        offset += PAGE_SIZE;
        // Safety limit
        if (offset > 50000) {
          log('warn', `Safety limit reached for ${componentType} at offset ${offset}`);
          hasMore = false;
        }
      }
    } catch (err) {
      log('error', `Fetch error for ${componentType}`, { error: String(err) });
      return { items, urls, error: String(err) };
    }
  }
  
  return { items, urls };
}

// Fetch all pages of scope items for a component type
// For 'unit', fetches BOTH 'unit' and 'accreditedUnit' separately and merges
async function fetchAllScope(rtoId: string, componentType: string): Promise<{ items: any[]; urls: string[]; error?: string }> {
  // Units need two separate API calls (pipe character causes 500 errors)
  if (componentType === 'unit') {
    log('info', 'Fetching units with two separate API calls (unit + accreditedUnit)');
    
    const [unitResult, accreditedUnitResult] = await Promise.all([
      fetchScopeSingleType(rtoId, 'unit'),
      fetchScopeSingleType(rtoId, 'accreditedUnit'),
    ]);
    
    // Merge results
    const allItems = [...unitResult.items, ...accreditedUnitResult.items];
    const allUrls = [...unitResult.urls, ...accreditedUnitResult.urls];
    
    // Report any errors
    const errors: string[] = [];
    if (unitResult.error) errors.push(`unit: ${unitResult.error}`);
    if (accreditedUnitResult.error) errors.push(`accreditedUnit: ${accreditedUnitResult.error}`);
    
    log('info', `Merged unit results: ${unitResult.items.length} units + ${accreditedUnitResult.items.length} accreditedUnits = ${allItems.length} total`);
    
    return { 
      items: allItems, 
      urls: allUrls, 
      error: errors.length > 0 ? errors.join('; ') : undefined 
    };
  }
  
  // All other types: single API call
  return fetchScopeSingleType(rtoId, componentType);
}

// Fetch organization details from REST API
async function fetchOrgDetails(rtoId: string): Promise<{ data: any; url: string; error?: string }> {
  const url = `https://training.gov.au/api/organisation/${rtoId}?api-version=1.0&include=all`;
  
  log('info', 'Fetching org details', { url });
  
  try {
    const response = await fetch(url, {
      headers: {
        'User-Agent': 'Unicorn/2.0',
        'Accept': 'application/json'
      }
    });
    
    if (!response.ok) {
      if (response.status === 404) {
        return { data: null, url, error: `RTO ${rtoId} not found` };
      }
      return { data: null, url, error: `HTTP ${response.status}` };
    }
    
    const data = await response.json();
    return { data, url };
  } catch (err) {
    return { data: null, url, error: String(err) };
  }
}

serve(async (req) => {
  if (req.method === 'OPTIONS') {
    return new Response(null, { headers: corsHeaders });
  }

  const startTime = Date.now();
  let jobId: string | null = null;

  try {
    const { tenantId, rtoId, force = false } = await req.json();
    
    if (!tenantId || !rtoId) {
      return new Response(
        JSON.stringify({ success: false, error: 'Missing tenantId or rtoId' }),
        { status: 400, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }

    const tenantIdNum = typeof tenantId === 'string' ? parseInt(tenantId, 10) : tenantId;
    
    log('info', `Starting REST sync for RTO ${rtoId}`, { tenantId: tenantIdNum, force });

    // 1. Create job row in tga_rest_sync_jobs
    const { data: job, error: jobError } = await supabaseAdmin
      .from('tga_rest_sync_jobs')
      .insert({
        tenant_id: tenantIdNum,
        rto_id: rtoId,
        status: 'processing',
        payload: { started_at: new Date().toISOString(), force },
      })
      .select('id')
      .single();
    
    if (jobError) {
      log('warn', 'Could not create job row', { error: jobError.message });
    } else {
      jobId = job.id;
      log('info', 'Created sync job', { jobId });
    }

    // 2. Fetch organization details
    const orgResult = await fetchOrgDetails(rtoId);
    
    if (orgResult.error || !orgResult.data) {
      throw new Error(orgResult.error || 'Failed to fetch org details');
    }
    
    const orgData = orgResult.data;
    const orgRawText = JSON.stringify(orgData);
    const rawSha256 = await computeSha256(orgRawText);
    
    // =====================================================================
    // PARSE ORG DETAILS FROM REST PAYLOAD (correctly mapping real TGA structure)
    // =====================================================================
    
    // Legal Name: find current (no endDate)
    const currentLegalName = orgData.legalNames?.find((ln: any) => !ln.endDate);
    const legalName = currentLegalName?.name || null;
    
    // Trading Names: filter current (no endDate), take first
    const currentTradingNames = orgData.tradingNames?.filter((tn: any) => !tn.endDate) || [];
    const tradingName = currentTradingNames[0]?.name || null;
    
    // ABN: in legalNames[].abns[] - may be string/number or { abn: ... }
    let abn: string | null = null;
    if (currentLegalName?.abns && currentLegalName.abns.length > 0) {
      const abnEntry = currentLegalName.abns[0];
      // Handle both formats: { abn: "123" } or just "123" or 123
      if (typeof abnEntry === 'object' && abnEntry.abn) {
        abn = String(abnEntry.abn);
      } else if (abnEntry) {
        abn = String(abnEntry);
      }
    }
    
    // ACN: in legalNames[].acn
    const acn = currentLegalName?.acn || null;
    
    // Website: from webAddresses[] current entry (no endDate), field is "webAddress"
    const currentWebEntry = orgData.webAddresses?.find((w: any) => !w.endDate);
    const website = currentWebEntry?.webAddress || null;
    
    // Registration dates: from registrations[] - pick current/most recent
    let registrationStartDate: string | null = null;
    let registrationEndDate: string | null = null;
    let initialRegistrationDate: string | null = null;
    if (orgData.registrations && orgData.registrations.length > 0) {
      // Find current registration (no endDate or future endDate)
      const now = new Date();
      const currentReg = orgData.registrations.find((r: any) => 
        !r.endDate || new Date(r.endDate) > now
      ) || orgData.registrations[orgData.registrations.length - 1]; // fallback to last
      
      if (currentReg) {
        registrationStartDate = currentReg.startDate || null;
        registrationEndDate = currentReg.endDate || null;
      }
      
      // Initial registration date = earliest startDate from all registrations
      const allStartDates = orgData.registrations
        .map((r: any) => r.startDate)
        .filter((d: any) => d)
        .sort();
      if (allStartDates.length > 0) {
        initialRegistrationDate = allStartDates[0];
      }
    }
    
    // Organisation Type: from classifications[] where schemeDescription == 'Training Organisation Type'
    // Pick primary + current (no endDate), use valueDescription
    let organisationType: string | null = null;
    if (orgData.classifications && orgData.classifications.length > 0) {
      const orgTypeClass = orgData.classifications.find((c: any) => 
        c.schemeDescription === 'Training Organisation Type' && 
        !c.endDate && 
        c.isPrimary !== false
      );
      if (orgTypeClass) {
        organisationType = orgTypeClass.valueDescription || orgTypeClass.value || null;
      }
    }
    
    log('info', 'Parsed org details', { 
      legalName, tradingName, abn, acn, website, 
      initialRegistrationDate, registrationStartDate, registrationEndDate, organisationType,
      sha256: rawSha256.substring(0, 16) 
    });

    // 3. Insert snapshot row
    let snapshotId: string | null = null;
    const { data: snapshot, error: snapError } = await supabaseAdmin
      .from('tga_rto_snapshots')
      .insert({
        tenant_id: tenantIdNum,
        rto_id: rtoId,
        source_url: orgResult.url,
        raw_sha256: rawSha256,
        payload: orgData,
      })
      .select('id')
      .single();
    
    if (snapError) {
      log('warn', 'Could not create snapshot', { error: snapError.message });
    } else {
      snapshotId = snapshot.id;
      log('info', 'Created snapshot', { snapshotId });
    }

    // 4. Fetch and persist all scope types
    const scopeTypes = [
      { apiType: 'qualification', dbType: 'qualification' },
      { apiType: 'unit', dbType: 'unit' },
      { apiType: 'skillSet', dbType: 'skillset' },
      { apiType: 'accreditedCourse', dbType: 'accreditedCourse' }
    ];
    
    const scopeCounts: Record<string, number> = {};
    const scopeUrls: Record<string, string[]> = {};
    const scopeErrors: Record<string, string> = {};
    
    for (const { apiType, dbType } of scopeTypes) {
      log('info', `Fetching ${apiType}...`);
      
      const result = await fetchAllScope(rtoId, apiType);
      scopeUrls[apiType] = result.urls;
      
      if (result.error) {
        scopeErrors[apiType] = result.error;
        scopeCounts[apiType] = 0;
        continue;
      }
      
      if (result.items.length > 0) {
        // Persist via RPC function
        const { data: persistResult, error: persistError } = await supabaseAdmin.rpc('persist_tga_scope_items', {
          p_tenant_id: tenantIdNum,
          p_scope_type: dbType,
          p_scope_items: result.items
        });
        
        if (persistError) {
          log('error', `Failed to persist ${apiType}`, { error: persistError.message });
          scopeErrors[apiType] = persistError.message;
          scopeCounts[apiType] = 0;
        } else {
          const persisted = (persistResult as any)?.items_persisted || result.items.length;
          log('info', `Persisted ${persisted} ${apiType}(s)`, { dbType });
          scopeCounts[apiType] = persisted;
        }
      } else {
        log('info', `No ${apiType}s found`, {});
        scopeCounts[apiType] = 0;
      }
    }

    // 5. Update tenants row with TGA status
    const now = new Date().toISOString();
    const { error: tenantUpdateError } = await supabaseAdmin
      .from('tenants')
      .update({
        rto_id: rtoId,
        tga_connected_at: force ? now : undefined, // Only update if force or first time
        tga_last_synced_at: now,
        tga_status: 'connected',
        tga_legal_name: legalName,
        tga_snapshot: orgData,
      })
      .eq('id', tenantIdNum);
    
    if (tenantUpdateError) {
      log('warn', 'Could not update tenant TGA status', { error: tenantUpdateError.message });
    }

    // Also update tenant_profile for merge fields - with all parsed fields
    await supabaseAdmin
      .from('tenant_profile')
      .upsert({
        tenant_id: tenantIdNum,
        rto_number: rtoId,
        legal_name: legalName,
        trading_name: tradingName,
        abn: abn,
        acn: acn,
        website: website,
        org_type: organisationType,
        registration_start_date: registrationStartDate,
        registration_end_date: registrationEndDate,
        updated_at: now,
      }, { onConflict: 'tenant_id' });
    
    // Also upsert tga_rto_summary for the Summary tab UI
    // Columns: rto_code (not rto_id), web_address (not website), source_payload (not raw_payload)
    const { error: summaryError } = await supabaseAdmin
      .from('tga_rto_summary')
      .upsert({
        tenant_id: tenantIdNum,
        rto_code: rtoId,
        legal_name: legalName,
        trading_name: tradingName,
        abn: abn,
        acn: acn,
        web_address: website,
        initial_registration_date: initialRegistrationDate,
        registration_start_date: registrationStartDate,
        registration_end_date: registrationEndDate,
        organisation_type: organisationType,
        status: orgData.status || 'Registered',
        source_payload: orgData,
        fetched_at: now,
        updated_at: now,
      }, { onConflict: 'tenant_id,rto_code' });
    
    if (summaryError) {
      log('warn', 'Could not upsert tga_rto_summary', { error: summaryError.message });
    } else {
      log('info', 'Updated tga_rto_summary', { rtoCode: rtoId, abn, acn, website });
    }

    // =====================================================================
    // PERSIST ADDRESSES (Head Office, Postal) and DELIVERY LOCATIONS
    // =====================================================================
    
    // Parse addresses from orgData.addresses array
    const addresses = orgData.addresses || [];
    const currentAddresses = addresses.filter((addr: any) => !addr.endDate);
    
    // Separate by type
    const headOfficeAddrs = currentAddresses.filter((a: any) => a.addressType === 'headOffice');
    const postalAddrs = currentAddresses.filter((a: any) => a.addressType === 'postal');
    const deliveryLocationAddrs = currentAddresses.filter((a: any) => a.addressType === 'deliveryLocation');
    
    log('info', 'Parsing addresses', { 
      total: addresses.length,
      current: currentAddresses.length,
      headOffice: headOfficeAddrs.length,
      postal: postalAddrs.length,
      deliveryLocations: deliveryLocationAddrs.length
    });

    // Delete existing addresses for this tenant+rto, then insert fresh
    await supabaseAdmin
      .from('tga_rto_addresses')
      .delete()
      .eq('tenant_id', tenantIdNum)
      .eq('rto_code', rtoId);

    // Insert head office and postal addresses
    const addressRows = [...headOfficeAddrs, ...postalAddrs].map((addr: any) => ({
      tenant_id: tenantIdNum,
      rto_code: rtoId,
      address_type: addr.addressType,
      address_line_1: addr.address?.line1 || addr.line1 || null,
      address_line_2: addr.address?.line2 || addr.line2 || null,
      suburb: addr.address?.suburb || addr.suburb || null,
      state: addr.address?.state || addr.state || null,
      postcode: addr.address?.postcode || addr.postcode || null,
      country: addr.address?.country || addr.country || 'Australia',
      phone: addr.phone || null,
      fax: addr.fax || null,
      email: addr.email || null,
      website: addr.webAddress || null,
      source_payload: addr,
      fetched_at: now,
    }));

    if (addressRows.length > 0) {
      const { error: addrError } = await supabaseAdmin
        .from('tga_rto_addresses')
        .insert(addressRows);
      
      if (addrError) {
        log('warn', 'Could not insert addresses', { error: addrError.message });
      } else {
        log('info', `Inserted ${addressRows.length} addresses`);
      }
    }

    // Delete existing delivery locations, then insert fresh
    await supabaseAdmin
      .from('tga_rto_delivery_locations')
      .delete()
      .eq('tenant_id', tenantIdNum)
      .eq('rto_code', rtoId);

    // Insert delivery locations
    const deliveryRows = deliveryLocationAddrs.map((addr: any) => ({
      tenant_id: tenantIdNum,
      rto_code: rtoId,
      location_name: addr.address?.locationName || addr.locationName || 'Unnamed Location',
      address_line_1: addr.address?.line1 || addr.line1 || null,
      address_line_2: addr.address?.line2 || addr.line2 || null,
      suburb: addr.address?.suburb || addr.suburb || null,
      state: addr.address?.state || addr.state || null,
      postcode: addr.address?.postcode || addr.postcode || null,
      country: addr.address?.country || addr.country || 'Australia',
      source_payload: addr,
      fetched_at: now,
    }));

    if (deliveryRows.length > 0) {
      const { error: delError } = await supabaseAdmin
        .from('tga_rto_delivery_locations')
        .insert(deliveryRows);
      
      if (delError) {
        log('warn', 'Could not insert delivery locations', { error: delError.message });
      } else {
        log('info', `Inserted ${deliveryRows.length} delivery locations`);
      }
    }

    // 6. Mark job done
    const totalItems = Object.values(scopeCounts).reduce((a, b) => a + b, 0);
    const hasErrors = Object.keys(scopeErrors).length > 0;
    
    if (jobId) {
      await supabaseAdmin
        .from('tga_rest_sync_jobs')
        .update({
          status: hasErrors ? 'done_with_errors' : 'done',
          last_error: hasErrors ? JSON.stringify(scopeErrors) : null,
          payload: {
            completed_at: now,
            duration_ms: Date.now() - startTime,
            scope_counts: scopeCounts,
            scope_urls: scopeUrls,
            scope_errors: scopeErrors,
            snapshot_id: snapshotId,
          },
          updated_at: now,
        })
        .eq('id', jobId);
    }

    // Also update tga_links if exists
    await supabaseAdmin
      .from('tga_links')
      .update({
        last_sync_at: now,
        last_sync_status: hasErrors ? 'partial' : 'success',
        last_sync_error: hasErrors ? Object.values(scopeErrors).join('; ') : null,
        updated_at: now,
      })
      .eq('tenant_id', tenantIdNum)
      .eq('rto_number', rtoId);

    log('info', 'Sync complete', { 
      tenantId: tenantIdNum, 
      rtoId, 
      totalItems, 
      scopeCounts,
      duration_ms: Date.now() - startTime,
    });

    return new Response(
      JSON.stringify({
        success: true,
        tenant_id: tenantIdNum,
        rto_id: rtoId,
        legal_name: legalName,
        snapshot_id: snapshotId,
        job_id: jobId,
        counts: scopeCounts,
        total_items: totalItems,
        urls_used: scopeUrls,
        errors: hasErrors ? scopeErrors : undefined,
        duration_ms: Date.now() - startTime,
      }),
      { headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
    );
  } catch (error) {
    const errorMsg = error instanceof Error ? error.message : String(error);
    log('error', 'Sync failed', { error: errorMsg, duration_ms: Date.now() - startTime });
    
    // Update job to error status
    if (jobId) {
      await supabaseAdmin
        .from('tga_rest_sync_jobs')
        .update({
          status: 'error',
          last_error: errorMsg,
          updated_at: new Date().toISOString(),
        })
        .eq('id', jobId);
    }
    
    return new Response(
      JSON.stringify({ 
        success: false, 
        error: errorMsg,
        job_id: jobId,
        duration_ms: Date.now() - startTime,
      }),
      { status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
    );
  }
});
