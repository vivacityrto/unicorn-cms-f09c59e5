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

// ── Robust field extraction helpers ─────────────────────────────────
const norm = (v: any) => String(v ?? "").trim();

/** Walk nested dot-paths; return first non-empty value found */
const pick = (obj: any, paths: string[]): any => {
  for (const p of paths) {
    const parts = p.split(".");
    let cur = obj;
    let ok = true;
    for (const part of parts) {
      if (cur && typeof cur === "object" && Object.prototype.hasOwnProperty.call(cur, part)) {
        cur = cur[part];
      } else {
        ok = false;
        break;
      }
    }
    if (ok && cur !== undefined && cur !== null && String(cur).trim() !== "") return cur;
  }
  return null;
};

const getUsage = (item: any) => pick(item, [
  "usageRecommendation",
  "usage_recommendation",
  "tga_data.usageRecommendation",
  "tga_data.usage_recommendation",
  "scope.usageRecommendation",
  "scope.usage_recommendation",
  "trainingProduct.usageRecommendation",
]);

const getEndDate = (item: any) => pick(item, [
  "endDate",
  "end_date",
  "tga_data.endDate",
  "tga_data.end_date",
  "scope.endDate",
  "scope.end_date",
]);

const toDate = (v: any): Date | null => {
  if (!v) return null;
  const d = new Date(v);
  return Number.isNaN(d.getTime()) ? null : d;
};

const today0 = () => {
  const d = new Date();
  d.setHours(0, 0, 0, 0);
  return d;
};

// ── Drop reason tracking ────────────────────────────────────────────
type DropReason = "missing_usage" | "superseded_no_end_date" | "superseded_expired" | "unknown_usage";

interface ClassifyResult {
  include: boolean;
  scope_state: "current" | "teach_out" | null;
  endRaw: string | null;
  usageRaw: string | null;
  dropReason?: DropReason;
}

function classify(item: any): ClassifyResult {
  const usageRaw = getUsage(item);
  const usage = norm(usageRaw).toLowerCase();
  const endRaw = getEndDate(item);
  const endDate = toDate(endRaw);

  if (!usageRaw || usage === "") {
    return { include: false, scope_state: null, endRaw, usageRaw, dropReason: "missing_usage" };
  }

  if (usage === "current") {
    return { include: true, scope_state: "current", endRaw, usageRaw };
  }

  if (usage === "superseded" || usage === "deleted") {
    if (!endDate) {
      return { include: false, scope_state: null, endRaw, usageRaw, dropReason: "superseded_no_end_date" };
    }
    if (endDate.getTime() >= today0().getTime()) {
      return { include: true, scope_state: "teach_out", endRaw, usageRaw };
    }
    return { include: false, scope_state: null, endRaw, usageRaw, dropReason: "superseded_expired" };
  }

  return { include: false, scope_state: null, endRaw, usageRaw, dropReason: "unknown_usage" };
}

// Compute SHA256 hash
async function computeSha256(text: string): Promise<string> {
  const encoder = new TextEncoder();
  const data = encoder.encode(text);
  const hashBuffer = await crypto.subtle.digest('SHA-256', data);
  const hashArray = Array.from(new Uint8Array(hashBuffer));
  return hashArray.map(b => b.toString(16).padStart(2, '0')).join('');
}

function log(level: 'info' | 'warn' | 'error', message: string, data?: Record<string, unknown>) {
  const timestamp = new Date().toISOString();
  console.log(`[TGA_REST_SYNC] [${level.toUpperCase()}] [${timestamp}] ${message}`, data ? JSON.stringify(data) : '');
}

async function fetchWithRetry(url: string, maxRetries = 3): Promise<Response> {
  let lastError: Error | null = null;
  for (let attempt = 0; attempt < maxRetries; attempt++) {
    try {
      const response = await fetch(url, {
        headers: { 'User-Agent': 'Unicorn/2.0', 'Accept': 'application/json' }
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

// Fetch ALL scope items with pagination
async function fetchAllScopeUnfiltered(rtoId: string): Promise<{ items: any[]; urls: string[]; error?: string }> {
  const items: any[] = [];
  const urls: string[] = [];
  let offset = 0;
  let hasMore = true;

  while (hasMore) {
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
      const pageItems = Array.isArray(data) ? data : (data.value || data.items || []);
      log('info', `Got ${pageItems.length} scope items at offset ${offset}`, { total: data.count || null });
      items.push(...pageItems);
      if (pageItems.length < PAGE_SIZE) { hasMore = false; } else { offset += PAGE_SIZE; if (offset > 50000) { hasMore = false; } }
    } catch (err) {
      log('error', `Fetch error for scope`, { error: String(err) });
      return { items, urls, error: String(err) };
    }
  }
  return { items, urls };
}

// Categorise raw scope items by componentType
function categoriseScope(items: any[]): Record<string, any[]> {
  const result: Record<string, any[]> = { qualification: [], unit: [], skillSet: [], accreditedCourse: [], trainingPackage: [] };
  for (const item of items) {
    const ct = (item.componentType || item.type || '').toLowerCase();
    if (ct === 'qualification') result.qualification.push(item);
    else if (ct === 'unit' || ct === 'accreditedunit' || ct === 'unitofcompetency') result.unit.push(item);
    else if (ct === 'skillset' || ct === 'skill set') result.skillSet.push(item);
    else if (ct === 'accreditedcourse' || ct === 'course') result.accreditedCourse.push(item);
    else if (ct === 'trainingpackage' || ct === 'training package') result.trainingPackage.push(item);
    else {
      log('warn', `Unknown componentType: ${ct}`, { code: item.code });
      const code = (item.code || '').toUpperCase();
      if (/^[A-Z]{2,5}\d{4,5}$/.test(code)) result.unit.push(item);
    }
  }
  return result;
}

// ── Diagnostics structure ───────────────────────────────────────────
interface TypeDiagnostics {
  raw_total: number;
  kept: number;
  current: number;
  teach_out: number;
  dropped: number;
  drop_reasons: Record<DropReason, number>;
  sample_item?: { code: string; usageRaw: string | null; endRaw: string | null; scope_state: string | null };
}

// Classify + categorise, returning diagnostics
function classifyAndFilter(categorised: Record<string, any[]>): {
  filtered: Record<string, any[]>;
  diagnostics: Record<string, TypeDiagnostics>;
} {
  const filtered: Record<string, any[]> = {};
  const diagnostics: Record<string, TypeDiagnostics> = {};

  for (const [type, items] of Object.entries(categorised)) {
    const kept: any[] = [];
    const diag: TypeDiagnostics = { raw_total: items.length, kept: 0, current: 0, teach_out: 0, dropped: 0, drop_reasons: { missing_usage: 0, superseded_no_end_date: 0, superseded_expired: 0, unknown_usage: 0 } };

    for (const item of items) {
      const result = classify(item);
      if (result.include && result.scope_state) {
        item.scope_state = result.scope_state;
        item.usageRecommendation_raw = result.usageRaw;
        item.endDate_raw = result.endRaw;
        kept.push(item);
        if (result.scope_state === "current") diag.current++;
        else diag.teach_out++;

        // Capture first item as sample
        if (!diag.sample_item) {
          diag.sample_item = { code: item.code, usageRaw: result.usageRaw, endRaw: result.endRaw, scope_state: result.scope_state };
        }
      } else {
        diag.dropped++;
        if (result.dropReason) diag.drop_reasons[result.dropReason]++;
      }
    }
    diag.kept = kept.length;
    filtered[type] = kept;
    diagnostics[type] = diag;

    if (diag.dropped > 0) {
      log('info', `Filtered ${type}: kept ${kept.length} (${diag.current} current, ${diag.teach_out} teach-out), dropped ${diag.dropped}`, { drop_reasons: diag.drop_reasons });
    }
  }
  return { filtered, diagnostics };
}

// Fetch organization details
async function fetchOrgDetails(rtoId: string): Promise<{ data: any; url: string; error?: string }> {
  const url = `https://training.gov.au/api/organisation/${rtoId}?api-version=1.0&include=all`;
  log('info', 'Fetching org details', { url });
  try {
    const response = await fetch(url, { headers: { 'User-Agent': 'Unicorn/2.0', 'Accept': 'application/json' } });
    if (!response.ok) {
      if (response.status === 404) return { data: null, url, error: `RTO ${rtoId} not found` };
      return { data: null, url, error: `HTTP ${response.status}` };
    }
    return { data: await response.json(), url };
  } catch (err) {
    return { data: null, url, error: String(err) };
  }
}

async function updateJobStatus(jobId: string | null, status: string, payload: Record<string, unknown>, lastError?: string | null) {
  if (!jobId) return;
  try {
    await supabaseAdmin.from('tga_rest_sync_jobs').update({ status, last_error: lastError || null, payload, updated_at: new Date().toISOString() }).eq('id', jobId);
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
  const progress: Record<string, unknown> = { started_at: new Date().toISOString() };

  try {
    const { tenantId, rtoId, force = false } = await req.json();

    if (!tenantId || !rtoId) {
      return new Response(JSON.stringify({ success: false, error: 'Missing tenantId or rtoId' }), { status: 400, headers: { ...corsHeaders, 'Content-Type': 'application/json' } });
    }

    const tenantIdNum = typeof tenantId === 'string' ? parseInt(tenantId, 10) : tenantId;
    const syncRunId = crypto.randomUUID();
    progress.tenantId = tenantIdNum;
    progress.rtoId = rtoId;
    progress.syncRunId = syncRunId;
    progress.force = force;

    log('info', `Starting REST sync for RTO ${rtoId}`, { tenantId: tenantIdNum, syncRunId });

    // 1. Create job row
    const { data: job, error: jobError } = await supabaseAdmin.from('tga_rest_sync_jobs').insert({ tenant_id: tenantIdNum, rto_id: rtoId, status: 'processing', payload: progress }).select('id').single();
    if (jobError) { log('warn', 'Could not create job row', { error: jobError.message }); } else { jobId = job.id; }

    // 2. Fetch organization details
    progress.stage = 'fetching_org';
    const orgResult = await fetchOrgDetails(rtoId);
    if (orgResult.error || !orgResult.data) throw new Error(orgResult.error || 'Failed to fetch org details');

    const orgData = orgResult.data;
    const rawSha256 = await computeSha256(JSON.stringify(orgData));
    progress.stage = 'parsing_org';

    // Parse org details
    const currentLegalName = orgData.legalNames?.find((ln: any) => !ln.endDate);
    const legalName = currentLegalName?.name || null;
    const currentTradingNames = orgData.tradingNames?.filter((tn: any) => !tn.endDate) || [];
    const tradingName = currentTradingNames[0]?.name || null;

    let abn: string | null = null;
    if (currentLegalName?.abns?.length > 0) {
      const abnEntry = currentLegalName.abns[0];
      abn = typeof abnEntry === 'object' && abnEntry.abn ? String(abnEntry.abn) : abnEntry ? String(abnEntry) : null;
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

    if (orgData.registrations?.length > 0) {
      const now = new Date();
      const currentReg = orgData.registrations.find((r: any) => !r.endDate || new Date(r.endDate) > now) || orgData.registrations[orgData.registrations.length - 1];
      if (currentReg) {
        registrationStartDate = currentReg.startDate || null;
        registrationEndDate = currentReg.endDate || null;
        registrationManager = currentReg.registrationManagerDescription || currentReg.registrationManager || null;
        legalAuthority = currentReg.legalAuthorityDescription || currentReg.legalAuthority || null;
        exerciser = currentReg.exerciserDescription || currentReg.exerciser || null;
      }
      const allStartDates = orgData.registrations.map((r: any) => r.startDate).filter(Boolean).sort();
      if (allStartDates.length > 0) initialRegistrationDate = allStartDates[0];
    }

    let organisationType: string | null = null;
    if (orgData.classifications?.length > 0) {
      const orgTypeClass = orgData.classifications.find((c: any) => c.schemeDescription === 'Training Organisation Type' && !c.endDate && c.isPrimary !== false);
      if (orgTypeClass) organisationType = orgTypeClass.valueDescription || orgTypeClass.value || null;
    }

    // 3. Insert snapshot row
    progress.stage = 'saving_snapshot';
    let snapshotId: string | null = null;
    const { data: snapshot, error: snapError } = await supabaseAdmin.from('tga_rto_snapshots').insert({ tenant_id: tenantIdNum, rto_id: rtoId, source_url: orgResult.url, raw_sha256: rawSha256, payload: orgData }).select('id').single();
    if (snapError) { log('warn', 'Could not create snapshot', { error: snapError.message }); } else { snapshotId = snapshot.id; progress.snapshot_id = snapshotId; }

    // 4. Fetch ALL scope
    progress.stage = 'fetching_scope';
    const scopeUrls: Record<string, string[]> = {};
    const scopeErrors: Record<string, string> = {};

    const scopeResult = await fetchAllScopeUnfiltered(rtoId);
    scopeUrls['all'] = scopeResult.urls;

    if (scopeResult.error) {
      scopeErrors['all'] = scopeResult.error;
      log('error', 'Scope fetch failed entirely', { error: scopeResult.error });
    }

    // Log sample item for debugging
    if (scopeResult.items.length > 0) {
      const s = scopeResult.items[0];
      log('info', 'Sample item field check', { usageRecommendation: s.usageRecommendation, status: s.status, endDate: s.endDate, keys: Object.keys(s).join(',') });
    }

    const categorised = categoriseScope(scopeResult.items);

    // Classify with diagnostics
    const { filtered, diagnostics } = classifyAndFilter(categorised);

    const keptTotal = Object.values(filtered).reduce((sum, arr) => sum + arr.length, 0);
    const rawTotal = scopeResult.items.length;

    log('info', `Classification complete`, { rawTotal, keptTotal, diagnostics });

    // ── SANITY CHECKS before staging ────────────────────────────────
    if (rawTotal > 0 && keptTotal === 0) {
      const errMsg = `TGA returned ${rawTotal} scope items but ALL were dropped after classification. Aborting swap to preserve existing data.`;
      log('error', errMsg, { diagnostics });

      progress.stage = 'aborted_sanity_check';
      progress.diagnostics = diagnostics;
      await updateJobStatus(jobId, 'error', progress, errMsg);

      return new Response(JSON.stringify({
        success: false,
        error: errMsg,
        job_id: jobId,
        diagnostics,
        raw_total: rawTotal,
        kept_total: 0,
        duration_ms: Date.now() - startTime,
      }), { status: 200, headers: { ...corsHeaders, 'Content-Type': 'application/json' } });
    }

    // ── STAGE rows into tenant_rto_scope_staging ────────────────────
    progress.stage = 'staging';
    const dbTypeMap: Record<string, string> = { qualification: 'qualification', unit: 'unit', skillSet: 'skillset', accreditedCourse: 'accreditedCourse', trainingPackage: 'trainingPackage' };
    const scopeCounts: Record<string, number> = {};
    const now = new Date().toISOString();

    // Clean any stale staging rows for this tenant
    await supabaseAdmin.from('tenant_rto_scope_staging').delete().eq('tenant_id', tenantIdNum);

    for (const [apiType, items] of Object.entries(filtered)) {
      const dbType = dbTypeMap[apiType] || apiType;

      if (items.length === 0) {
        scopeCounts[apiType] = 0;
        continue;
      }

      // Build staging rows
      const stagingRows = items.map((item: any) => ({
        tenant_id: tenantIdNum,
        code: item.code || item.trainingComponentCode || 'UNKNOWN',
        title: item.title || item.name || '',
        scope_type: dbType,
        status: item.usageRecommendation || item.status || 'Current',
        is_superseded: item.scope_state === 'teach_out',
        superseded_by: item.supersededBy || null,
        tga_data: {
          ...item,
          scope_state: item.scope_state,
          usageRecommendation_raw: item.usageRecommendation_raw,
          endDate_raw: item.endDate_raw,
        },
        last_refreshed_at: now,
        sync_run_id: syncRunId,
      }));

      // Insert in batches of 500
      for (let i = 0; i < stagingRows.length; i += 500) {
        const batch = stagingRows.slice(i, i + 500);
        const { error: stageError } = await supabaseAdmin.from('tenant_rto_scope_staging').insert(batch);
        if (stageError) {
          log('error', `Failed to stage ${apiType} batch`, { error: stageError.message, batchStart: i });
          scopeErrors[apiType] = stageError.message;
        }
      }
      scopeCounts[apiType] = stagingRows.length;
      log('info', `Staged ${stagingRows.length} ${apiType}(s)`, { dbType });
    }

    const stagedTotal = Object.values(scopeCounts).reduce((a, b) => a + b, 0);
    progress.staged_total = stagedTotal;
    progress.scope_counts = scopeCounts;

    // ── SWAP: atomically move staging → live ────────────────────────
    progress.stage = 'swapping';
    log('info', `Swapping ${stagedTotal} staged rows to live`, { syncRunId });

    const { data: swapResult, error: swapError } = await supabaseAdmin.rpc('tga_swap_scope_from_staging', {
      p_tenant_id: tenantIdNum,
      p_sync_run_id: syncRunId,
    });

    if (swapError) {
      log('error', 'Swap RPC failed', { error: swapError.message });
      // Clean up staging
      await supabaseAdmin.from('tenant_rto_scope_staging').delete().eq('tenant_id', tenantIdNum).eq('sync_run_id', syncRunId);
      throw new Error(`Swap failed: ${swapError.message}. Old data preserved.`);
    }

    const swapData = swapResult as any;
    if (swapData?.error) {
      log('error', 'Swap returned error', { swapData });
      throw new Error(`Swap returned error: ${swapData.error}. Old data preserved.`);
    }

    log('info', 'Swap complete', { swapResult: swapData });
    progress.swap_result = swapData;

    // 5. Update tenants row with TGA status
    progress.stage = 'updating_tenant';
    const { error: tenantUpdateError } = await supabaseAdmin.from('tenants').update({ rto_id: rtoId, tga_connected_at: force ? now : undefined, tga_last_synced_at: now, tga_status: 'connected', tga_legal_name: legalName, tga_snapshot: orgData }).eq('id', tenantIdNum);
    if (tenantUpdateError) log('warn', 'Could not update tenant TGA status', { error: tenantUpdateError.message });

    // Update tenant_profile
    await supabaseAdmin.from('tenant_profile').upsert({ tenant_id: tenantIdNum, rto_number: rtoId, legal_name: legalName, trading_name: tradingName, abn, acn, website, org_type: organisationType, registration_start_date: registrationStartDate, registration_end_date: registrationEndDate, updated_at: now }, { onConflict: 'tenant_id' });

    // Upsert tga_rto_summary
    const { error: summaryError } = await supabaseAdmin.from('tga_rto_summary').upsert({ tenant_id: tenantIdNum, rto_code: rtoId, legal_name: legalName, trading_name: tradingName, abn, acn, web_address: website, initial_registration_date: initialRegistrationDate, registration_start_date: registrationStartDate, registration_end_date: registrationEndDate, organisation_type: organisationType, registration_manager: registrationManager, legal_authority: legalAuthority, exerciser, status: orgData.status || 'Registered', source_payload: orgData, fetched_at: now, updated_at: now }, { onConflict: 'tenant_id,rto_code' });
    if (summaryError) log('warn', 'Could not upsert tga_rto_summary', { error: summaryError.message });

    // ── PERSIST CONTACTS ────────────────────────────────────────────
    progress.stage = 'persisting_contacts';
    const contacts = orgData.contacts || [];
    const currentContacts = contacts.filter((c: any) => !c.endDate);

    await supabaseAdmin.from('tga_rto_contacts').delete().eq('tenant_id', tenantIdNum).eq('rto_code', rtoId);

    const contactRows = currentContacts.map((contact: any) => {
      const addrParts = [contact.address?.line1, contact.address?.line2, contact.address?.suburb, contact.address?.state, contact.address?.postcode].filter(Boolean);
      return {
        tenant_id: tenantIdNum, rto_code: rtoId,
        contact_type: contact.contactType || contact.type || null,
        contact_type_raw: contact.contactType || contact.type || null,
        name: [contact.title, contact.firstName, contact.lastName].filter(Boolean).join(' ') || contact.name || null,
        position: contact.jobTitle || contact.position || null,
        organisation_name: contact.organisationName || null,
        phone: contact.phone || null, mobile: contact.mobile || null, fax: contact.fax || null, email: contact.email || null,
        address: addrParts.length > 0 ? addrParts.join(', ') : null,
        source_payload: contact, fetched_at: now,
      };
    });

    if (contactRows.length > 0) {
      const { error: contactError } = await supabaseAdmin.from('tga_rto_contacts').insert(contactRows);
      if (contactError) log('warn', 'Could not insert contacts', { error: contactError.message });
    }
    progress.contacts_count = contactRows.length;

    // ── PERSIST ADDRESSES & DELIVERY LOCATIONS ──────────────────────
    progress.stage = 'persisting_addresses';
    const addresses = orgData.addresses || [];
    const currentAddresses = addresses.filter((addr: any) => !addr.endDate);
    const headOfficeAddrs = currentAddresses.filter((a: any) => a.addressType === 'headOffice');
    const postalAddrs = currentAddresses.filter((a: any) => a.addressType === 'postal');
    const deliveryLocationAddrs = currentAddresses.filter((a: any) => a.addressType === 'deliveryLocation');

    await supabaseAdmin.from('tga_rto_addresses').delete().eq('tenant_id', tenantIdNum).eq('rto_code', rtoId);

    const addressRows = [...headOfficeAddrs, ...postalAddrs].map((addr: any) => ({
      tenant_id: tenantIdNum, rto_code: rtoId, address_type: addr.addressType,
      address_line_1: addr.address?.line1 || addr.line1 || null, address_line_2: addr.address?.line2 || addr.line2 || null,
      suburb: addr.address?.suburb || addr.suburb || null, state: addr.address?.state || addr.state || null,
      postcode: addr.address?.postcode || addr.postcode || null, country: addr.address?.country || addr.country || 'Australia',
      phone: addr.phone || null, fax: addr.fax || null, email: addr.email || null, website: addr.webAddress || null,
      source_payload: addr, fetched_at: now,
    }));

    if (addressRows.length > 0) {
      const { error: addrError } = await supabaseAdmin.from('tga_rto_addresses').insert(addressRows);
      if (addrError) log('warn', 'Could not insert addresses', { error: addrError.message });
    }

    await supabaseAdmin.from('tga_rto_delivery_locations').delete().eq('tenant_id', tenantIdNum).eq('rto_code', rtoId);

    const deliveryRows = deliveryLocationAddrs.map((addr: any) => ({
      tenant_id: tenantIdNum, rto_code: rtoId,
      location_name: addr.address?.locationName || addr.locationName || 'Unnamed Location',
      address_line_1: addr.address?.line1 || addr.line1 || null, address_line_2: addr.address?.line2 || addr.line2 || null,
      suburb: addr.address?.suburb || addr.suburb || null, state: addr.address?.state || addr.state || null,
      postcode: addr.address?.postcode || addr.postcode || null, country: addr.address?.country || addr.country || 'Australia',
      source_payload: addr, fetched_at: now,
    }));

    if (deliveryRows.length > 0) {
      const { error: delError } = await supabaseAdmin.from('tga_rto_delivery_locations').insert(deliveryRows);
      if (delError) log('warn', 'Could not insert delivery locations', { error: delError.message });
    }
    progress.addresses_count = addressRows.length;
    progress.delivery_locations_count = deliveryRows.length;

    // 8. Mark job done
    const totalItems = stagedTotal;
    const hasErrors = Object.keys(scopeErrors).length > 0;

    progress.stage = 'done';
    progress.completed_at = now;
    progress.duration_ms = Date.now() - startTime;
    progress.scope_counts = scopeCounts;
    progress.scope_urls = scopeUrls;
    progress.scope_errors = scopeErrors;
    progress.snapshot_id = snapshotId;
    progress.diagnostics = diagnostics;
    progress.raw_total = rawTotal;

    await updateJobStatus(jobId, hasErrors ? 'done_with_errors' : 'done', progress, hasErrors ? JSON.stringify(scopeErrors) : null);

    // Update tga_links
    await supabaseAdmin.from('tga_links').update({ last_sync_at: now, last_sync_status: hasErrors ? 'partial' : 'success', last_sync_error: hasErrors ? Object.values(scopeErrors).join('; ') : null, updated_at: now }).eq('tenant_id', tenantIdNum).eq('rto_number', rtoId);

    log('info', 'Sync complete', { tenantId: tenantIdNum, rtoId, totalItems, scopeCounts, duration_ms: Date.now() - startTime });

    return new Response(JSON.stringify({
      success: true,
      tenant_id: tenantIdNum,
      rto_id: rtoId,
      legal_name: legalName,
      snapshot_id: snapshotId,
      job_id: jobId,
      sync_run_id: syncRunId,
      counts: scopeCounts,
      diagnostics,
      raw_total: rawTotal,
      kept_total: keptTotal,
      swap_result: swapData,
      contacts_count: contactRows.length,
      addresses_count: addressRows.length,
      delivery_locations_count: deliveryRows.length,
      total_items: totalItems,
      urls_used: scopeUrls,
      errors: hasErrors ? scopeErrors : undefined,
      duration_ms: Date.now() - startTime,
    }), { headers: { ...corsHeaders, 'Content-Type': 'application/json' } });
  } catch (error) {
    const errorMsg = error instanceof Error ? error.message : String(error);
    log('error', 'Sync failed', { error: errorMsg, duration_ms: Date.now() - startTime });
    progress.stage = 'error';
    progress.completed_at = new Date().toISOString();
    progress.duration_ms = Date.now() - startTime;
    await updateJobStatus(jobId, 'error', progress, errorMsg);

    return new Response(JSON.stringify({ success: false, error: errorMsg, job_id: jobId, duration_ms: Date.now() - startTime }), { status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' } });
  }
});
