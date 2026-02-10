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
      if (response.status === 500 && attempt < maxRetries - 1) {
        const delay = Math.pow(2, attempt) * 300;
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

// Fetch a single scope type
async function fetchScopeSingleType(rtoId: string, componentType: string): Promise<{ items: any[]; urls: string[]; error?: string }> {
  const items: any[] = [];
  const urls: string[] = [];
  let offset = 0;
  let hasMore = true;
  
  const filter = `componentType==${componentType};status==current`;
  
  while (hasMore) {
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
      
      const currentExplicitItems = pageItems.filter((item: any) => 
        item.isImplicit !== true && item.status === 'current'
      );
      items.push(...currentExplicitItems);
      
      if (pageItems.length < PAGE_SIZE) {
        hasMore = false;
      } else {
        offset += PAGE_SIZE;
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

// Fetch all scope items for a component type
async function fetchAllScope(rtoId: string, componentType: string): Promise<{ items: any[]; urls: string[]; error?: string }> {
  if (componentType === 'unit') {
    log('info', 'Fetching units with two separate API calls (unit + accreditedUnit)');
    
    const [unitResult, accreditedUnitResult] = await Promise.all([
      fetchScopeSingleType(rtoId, 'unit'),
      fetchScopeSingleType(rtoId, 'accreditedUnit'),
    ]);
    
    const allItems = [...unitResult.items, ...accreditedUnitResult.items];
    const allUrls = [...unitResult.urls, ...accreditedUnitResult.urls];
    
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

// Helper to update job status (used in finally blocks to ensure it always runs)
async function updateJobStatus(jobId: string | null, status: string, payload: Record<string, unknown>, lastError?: string | null) {
  if (!jobId) return;
  try {
    await supabaseAdmin
      .from('tga_rest_sync_jobs')
      .update({
        status,
        last_error: lastError || null,
        payload,
        updated_at: new Date().toISOString(),
      })
      .eq('id', jobId);
  } catch (err) {
    log('error', 'Failed to update job status', { jobId, error: String(err) });
  }
}

serve(async (req) => {
  if (req.method === 'OPTIONS') {
    return new Response(null, { headers: corsHeaders });
  }

  const startTime = Date.now();
  let jobId: string | null = null;
  // Track progress so we can report partial results on timeout/error
  const progress: Record<string, unknown> = { started_at: new Date().toISOString() };

  try {
    const { tenantId, rtoId, force = false } = await req.json();
    
    if (!tenantId || !rtoId) {
      return new Response(
        JSON.stringify({ success: false, error: 'Missing tenantId or rtoId' }),
        { status: 400, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }

    const tenantIdNum = typeof tenantId === 'string' ? parseInt(tenantId, 10) : tenantId;
    progress.tenantId = tenantIdNum;
    progress.rtoId = rtoId;
    progress.force = force;
    
    log('info', `Starting REST sync for RTO ${rtoId}`, { tenantId: tenantIdNum, force });

    // 1. Create job row
    const { data: job, error: jobError } = await supabaseAdmin
      .from('tga_rest_sync_jobs')
      .insert({
        tenant_id: tenantIdNum,
        rto_id: rtoId,
        status: 'processing',
        payload: progress,
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
    progress.stage = 'fetching_org';
    const orgResult = await fetchOrgDetails(rtoId);
    
    if (orgResult.error || !orgResult.data) {
      throw new Error(orgResult.error || 'Failed to fetch org details');
    }
    
    const orgData = orgResult.data;
    const orgRawText = JSON.stringify(orgData);
    const rawSha256 = await computeSha256(orgRawText);
    progress.stage = 'parsing_org';
    
    // Parse org details
    const currentLegalName = orgData.legalNames?.find((ln: any) => !ln.endDate);
    const legalName = currentLegalName?.name || null;
    
    const currentTradingNames = orgData.tradingNames?.filter((tn: any) => !tn.endDate) || [];
    const tradingName = currentTradingNames[0]?.name || null;
    
    let abn: string | null = null;
    if (currentLegalName?.abns && currentLegalName.abns.length > 0) {
      const abnEntry = currentLegalName.abns[0];
      if (typeof abnEntry === 'object' && abnEntry.abn) {
        abn = String(abnEntry.abn);
      } else if (abnEntry) {
        abn = String(abnEntry);
      }
    }
    
    const acn = currentLegalName?.acn || null;
    
    const currentWebEntry = orgData.webAddresses?.find((w: any) => !w.endDate);
    const website = currentWebEntry?.webAddress || null;
    
    let registrationStartDate: string | null = null;
    let registrationEndDate: string | null = null;
    let initialRegistrationDate: string | null = null;
    let registrationManager: string | null = null;
    let legalAuthority: string | null = null;
    let exerciser: string | null = null;

    if (orgData.registrations && orgData.registrations.length > 0) {
      const now = new Date();
      const currentReg = orgData.registrations.find((r: any) => 
        !r.endDate || new Date(r.endDate) > now
      ) || orgData.registrations[orgData.registrations.length - 1];
      
      if (currentReg) {
        registrationStartDate = currentReg.startDate || null;
        registrationEndDate = currentReg.endDate || null;
        registrationManager = currentReg.registrationManagerDescription || currentReg.registrationManager || null;
        legalAuthority = currentReg.legalAuthorityDescription || currentReg.legalAuthority || null;
        exerciser = currentReg.exerciserDescription || currentReg.exerciser || null;
      }
      
      const allStartDates = orgData.registrations
        .map((r: any) => r.startDate)
        .filter((d: any) => d)
        .sort();
      if (allStartDates.length > 0) {
        initialRegistrationDate = allStartDates[0];
      }
    }
    
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
    progress.stage = 'saving_snapshot';
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
      progress.snapshot_id = snapshotId;
      log('info', 'Created snapshot', { snapshotId });
    }

    // 4. Fetch ALL scope types in PARALLEL (key fix for timeout)
    progress.stage = 'fetching_scope';
    const scopeTypes = [
      { apiType: 'qualification', dbType: 'qualification' },
      { apiType: 'unit', dbType: 'unit' },
      { apiType: 'skillSet', dbType: 'skillset' },
      { apiType: 'accreditedCourse', dbType: 'accreditedCourse' }
    ];
    
    const scopeCounts: Record<string, number> = {};
    const scopeUrls: Record<string, string[]> = {};
    const scopeErrors: Record<string, string> = {};
    
    // Fetch all scope types in parallel instead of sequentially
    const scopeResults = await Promise.all(
      scopeTypes.map(async ({ apiType, dbType }) => {
        log('info', `Fetching ${apiType}...`);
        const result = await fetchAllScope(rtoId, apiType);
        return { apiType, dbType, result };
      })
    );

    // Persist scope items sequentially (to avoid DB contention)
    progress.stage = 'persisting_scope';
    for (const { apiType, dbType, result } of scopeResults) {
      scopeUrls[apiType] = result.urls;
      
      if (result.error) {
        scopeErrors[apiType] = result.error;
        scopeCounts[apiType] = 0;
        continue;
      }
      
      if (result.items.length > 0) {
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
    progress.scope_counts = scopeCounts;

    // 5. Update tenants row with TGA status
    progress.stage = 'updating_tenant';
    const now = new Date().toISOString();
    const { error: tenantUpdateError } = await supabaseAdmin
      .from('tenants')
      .update({
        rto_id: rtoId,
        tga_connected_at: force ? now : undefined,
        tga_last_synced_at: now,
        tga_status: 'connected',
        tga_legal_name: legalName,
        tga_snapshot: orgData,
      })
      .eq('id', tenantIdNum);
    
    if (tenantUpdateError) {
      log('warn', 'Could not update tenant TGA status', { error: tenantUpdateError.message });
    }

    // Update tenant_profile for merge fields
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
    
    // Upsert tga_rto_summary
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
        registration_manager: registrationManager,
        legal_authority: legalAuthority,
        exerciser: exerciser,
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
    // 6. PERSIST CONTACTS (Chief Executive, Registration Enquiries, etc.)
    // =====================================================================
    progress.stage = 'persisting_contacts';
    const contacts = orgData.contacts || [];
    const currentContacts = contacts.filter((c: any) => !c.endDate);
    
    log('info', 'Parsing contacts', { total: contacts.length, current: currentContacts.length });

    // Delete existing contacts for this tenant+rto, then insert fresh
    await supabaseAdmin
      .from('tga_rto_contacts')
      .delete()
      .eq('tenant_id', tenantIdNum)
      .eq('rto_code', rtoId);

    const contactRows = currentContacts.map((contact: any) => {
      // Build a single address string from structured address parts
      const addrParts = [
        contact.address?.line1,
        contact.address?.line2,
        contact.address?.suburb,
        contact.address?.state,
        contact.address?.postcode,
      ].filter(Boolean);
      const addressStr = addrParts.length > 0 ? addrParts.join(', ') : null;

      return {
        tenant_id: tenantIdNum,
        rto_code: rtoId,
        contact_type: contact.contactType || contact.type || null,
        contact_type_raw: contact.contactType || contact.type || null,
        name: [contact.title, contact.firstName, contact.lastName].filter(Boolean).join(' ') || contact.name || null,
        position: contact.jobTitle || contact.position || null,
        organisation_name: contact.organisationName || null,
        phone: contact.phone || null,
        mobile: contact.mobile || null,
        fax: contact.fax || null,
        email: contact.email || null,
        address: addressStr,
        source_payload: contact,
        fetched_at: now,
      };
    });

    if (contactRows.length > 0) {
      const { error: contactError } = await supabaseAdmin
        .from('tga_rto_contacts')
        .insert(contactRows);
      
      if (contactError) {
        log('warn', 'Could not insert contacts', { error: contactError.message });
      } else {
        log('info', `Inserted ${contactRows.length} contacts`);
      }
    }
    progress.contacts_count = contactRows.length;

    // =====================================================================
    // 7. PERSIST ADDRESSES (Head Office, Postal) and DELIVERY LOCATIONS
    // =====================================================================
    progress.stage = 'persisting_addresses';
    const addresses = orgData.addresses || [];
    const currentAddresses = addresses.filter((addr: any) => !addr.endDate);
    
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

    // Delete existing addresses, then insert fresh
    await supabaseAdmin
      .from('tga_rto_addresses')
      .delete()
      .eq('tenant_id', tenantIdNum)
      .eq('rto_code', rtoId);

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
    progress.addresses_count = addressRows.length;
    progress.delivery_locations_count = deliveryRows.length;

    // 8. Mark job done
    const totalItems = Object.values(scopeCounts).reduce((a, b) => a + b, 0);
    const hasErrors = Object.keys(scopeErrors).length > 0;
    
    progress.stage = 'done';
    progress.completed_at = now;
    progress.duration_ms = Date.now() - startTime;
    progress.scope_counts = scopeCounts;
    progress.scope_urls = scopeUrls;
    progress.scope_errors = scopeErrors;
    progress.snapshot_id = snapshotId;

    await updateJobStatus(
      jobId,
      hasErrors ? 'done_with_errors' : 'done',
      progress,
      hasErrors ? JSON.stringify(scopeErrors) : null
    );

    // Update tga_links if exists
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
      contacts: contactRows.length,
      addresses: addressRows.length,
      deliveryLocations: deliveryRows.length,
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
        contacts_count: contactRows.length,
        addresses_count: addressRows.length,
        delivery_locations_count: deliveryRows.length,
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
    
    // Always update job to error status
    progress.stage = 'error';
    progress.completed_at = new Date().toISOString();
    progress.duration_ms = Date.now() - startTime;
    await updateJobStatus(jobId, 'error', progress, errorMsg);
    
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
