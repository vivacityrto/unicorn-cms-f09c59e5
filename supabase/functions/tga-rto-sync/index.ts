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

// Status normalisation helpers
const normStatus = (s: any) => String(s ?? "").trim().toLowerCase();

// Classify scope state: current, teach_out (superseded with future endDate), or null (drop)
function classifyScopeState(item: any): "current" | "teach_out" | null {
  const usage = normStatus(item.usageRecommendation ?? item.status);
  const endDateStr = item.endDate ?? null;

  if (usage === "current") return "current";

  if (usage === "superseded" && endDateStr) {
    const endDate = new Date(endDateStr);
    if (!isNaN(endDate.getTime()) && endDate >= new Date()) {
      return "teach_out";
    }
  }

  return null; // drop this item
}

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

// Fetch ALL scope items (unfiltered) with pagination
async function fetchAllScopeUnfiltered(rtoId: string): Promise<{ items: any[]; urls: string[]; error?: string }> {
  const items: any[] = [];
  const urls: string[] = [];
  let offset = 0;
  let hasMore = true;
  
  while (hasMore) {
    // Fetch without filters first; fall back to filtered if unfiltered also fails
    const url = `https://training.gov.au/api/organisation/${encodeURIComponent(rtoId)}/scope?api-version=1.0&includeImplicitItems=true&offset=${offset}&pageSize=${PAGE_SIZE}`;
    urls.push(url);
    
    log('info', `Fetching scope at offset ${offset}`, { url });
    
    try {
      const response = await fetchWithRetry(url);
      
      if (!response.ok) {
        const responseText = await response.text();
        log('error', `TGA scope API error`, { status: response.status, body: responseText.substring(0, 500) });
        return { items, urls, error: `HTTP ${response.status}` };
      }
      
      const data = await response.json();
      // TGA may return { value: [...], count: N } or just an array
      const pageItems = Array.isArray(data) ? data : (data.value || data.items || []);
      const totalCount = data.count || data.totalCount || null;
      
      log('info', `Got ${pageItems.length} scope items at offset ${offset}`, { total: totalCount });
      
      items.push(...pageItems);
      
      if (pageItems.length < PAGE_SIZE) {
        hasMore = false;
      } else {
        offset += PAGE_SIZE;
        if (offset > 50000) {
          log('warn', `Safety limit reached at offset ${offset}`);
          hasMore = false;
        }
      }
    } catch (err) {
      log('error', `Fetch error for scope`, { error: String(err) });
      return { items, urls, error: String(err) };
    }
  }
  
  return { items, urls };
}

// Categorise raw scope items by componentType, client-side
function categoriseScope(items: any[]): Record<string, any[]> {
  const result: Record<string, any[]> = {
    qualification: [],
    unit: [],
    skillSet: [],
    accreditedCourse: [],
    trainingPackage: [],
  };
  
  for (const item of items) {
    const ct = item.componentType || item.type || '';
    const ctLower = ct.toLowerCase();
    
    if (ctLower === 'qualification') {
      result.qualification.push(item);
    } else if (ctLower === 'unit' || ctLower === 'accreditedunit' || ctLower === 'unitofcompetency') {
      result.unit.push(item);
    } else if (ctLower === 'skillset' || ctLower === 'skill set') {
      result.skillSet.push(item);
    } else if (ctLower === 'accreditedcourse' || ctLower === 'course') {
      result.accreditedCourse.push(item);
    } else if (ctLower === 'trainingpackage' || ctLower === 'training package') {
      result.trainingPackage.push(item);
    } else {
      // Unknown type - log and try to include based on code pattern
      log('warn', `Unknown componentType: ${ct}`, { code: item.code, title: item.title });
      // Heuristic: codes starting with letters then numbers
      const code = (item.code || '').toUpperCase();
      if (/^[A-Z]{2,5}\d{4,5}$/.test(code)) {
        result.unit.push(item);
      } else if (/^[A-Z]{2,5}\d{5}$/.test(code)) {
        result.qualification.push(item);
      }
    }
  }
  
  return result;
}

// fetchAllScope now uses the unfiltered approach
async function fetchAllScope(rtoId: string): Promise<{ categorised: Record<string, any[]>; urls: string[]; error?: string }> {
  const result = await fetchAllScopeUnfiltered(rtoId);
  
  if (result.error) {
    return { categorised: { qualification: [], unit: [], skillSet: [], accreditedCourse: [] }, urls: result.urls, error: result.error };
  }
  
  // Include ALL scope items — implicit items are inherited from training packages but are
  // still legitimate scope items displayed on training.gov.au
  const explicitItems = result.items;
  
  log('info', `Total scope items: ${result.items.length} (all included, no implicit filter)`);
  
  // Log sample items to understand structure
  if (result.items.length > 0) {
    const sample = result.items[0];
    log('info', 'Sample scope item structure', { 
      keys: Object.keys(sample).join(','),
      componentType: sample.componentType,
      type: sample.type,
      status: sample.status,
      statusLabel: sample.statusLabel,
      isImplicit: sample.isImplicit,
      code: sample.code,
    });
  }
  
  const categorised = categoriseScope(explicitItems);

  // Classify each item: keep Current + teach-out (superseded with future endDate), drop the rest
  for (const [type, items] of Object.entries(categorised)) {
    const before = items.length;
    const kept: any[] = [];
    for (const item of items) {
      const scopeState = classifyScopeState(item);
      if (scopeState) {
        // Inject scope_state into the item so it lands in tga_data
        item.scope_state = scopeState;
        kept.push(item);
      }
    }
    categorised[type] = kept;
    const dropped = before - kept.length;
    if (dropped > 0) log('info', `Filtered ${type}: kept ${kept.length} (${kept.filter((i: any) => i.scope_state === 'teach_out').length} teach-out), dropped ${dropped}`);
  }
  
  const keptTotal = Object.values(categorised).reduce((sum, arr) => sum + arr.length, 0);
  const teachOutTotal = Object.values(categorised).reduce((sum, arr) => sum + arr.filter((i: any) => i.scope_state === 'teach_out').length, 0);
  log('info', `Categorised scope (Current + teach-out)`, {
    qualification: categorised.qualification.length,
    unit: categorised.unit.length,
    skillSet: categorised.skillSet.length,
    accreditedCourse: categorised.accreditedCourse.length,
    trainingPackage: categorised.trainingPackage.length,
    total: keptTotal,
    teachOut: teachOutTotal,
    droppedFromTotal: explicitItems.length - keptTotal,
  });
  
  return { categorised, urls: result.urls };
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

    // 4. Fetch ALL scope in a single unfiltered call, then categorise client-side
    progress.stage = 'fetching_scope';
    const scopeCounts: Record<string, number> = {};
    const scopeUrls: Record<string, string[]> = {};
    const scopeErrors: Record<string, string> = {};
    
    const scopeResult = await fetchAllScope(rtoId);
    scopeUrls['all'] = scopeResult.urls;
    
    if (scopeResult.error) {
      scopeErrors['all'] = scopeResult.error;
      log('error', 'Scope fetch failed entirely', { error: scopeResult.error });
    }
    
    const dbTypeMap: Record<string, string> = {
      qualification: 'qualification',
      unit: 'unit',
      skillSet: 'skillset',
      accreditedCourse: 'accreditedCourse',
      trainingPackage: 'trainingPackage',
    };

    // Persist each category using full-replace strategy (delete all existing, insert Current-only)
    progress.stage = 'persisting_scope';
    for (const [apiType, items] of Object.entries(scopeResult.categorised)) {
      const dbType = dbTypeMap[apiType] || apiType;
      
      // Delete ALL existing rows for this tenant + scope_type before inserting fresh Current-only set
      const { error: deleteError } = await supabaseAdmin
        .from('tenant_rto_scope')
        .delete()
        .eq('tenant_id', tenantIdNum)
        .eq('scope_type', dbType);
      
      if (deleteError) {
        log('warn', `Failed to delete existing ${dbType} rows`, { error: deleteError.message });
      } else {
        log('info', `Deleted existing ${dbType} rows for tenant ${tenantIdNum}`);
      }
      
      if (items.length > 0) {
        const { data: persistResult, error: persistError } = await supabaseAdmin.rpc('persist_tga_scope_items', {
          p_tenant_id: tenantIdNum,
          p_scope_type: dbType,
          p_scope_items: items
        });
        
        if (persistError) {
          log('error', `Failed to persist ${apiType}`, { error: persistError.message });
          scopeErrors[apiType] = persistError.message;
          scopeCounts[apiType] = 0;
        } else {
          const persisted = (persistResult as any)?.items_persisted || items.length;
          log('info', `Persisted ${persisted} Current ${apiType}(s)`, { dbType });
          scopeCounts[apiType] = persisted;
        }
      } else {
        scopeCounts[apiType] = 0;
        log('info', `No Current ${apiType} items to persist`);
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
