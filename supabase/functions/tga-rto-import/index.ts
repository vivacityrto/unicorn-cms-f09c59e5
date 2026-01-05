import "https://deno.land/x/xhr@0.1.0/mod.ts";
import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2.49.4";

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
};

// ============================================================================
// TGA DATASET IMPORT EDGE FUNCTION
// 
// This function imports TGA datasets (CSV/XML) into the normalised tables:
// - tga_rtos (RTO registration data)
// - tga_scope_items (qualifications, units, skill sets)
// - tga_import_runs (audit trail)
// 
// The client sync is now handled by the tga_sync_client RPC function which
// reads from these local tables instead of making live SOAP calls.
// ============================================================================

// ============================================================================
// HELPERS
// ============================================================================

function generateCorrelationId(): string {
  return `tga-import-${crypto.randomUUID()}`;
}

function logStage(correlationId: string, stage: string, data: Record<string, unknown> = {}) {
  const sanitized: Record<string, unknown> = { correlation_id: correlationId, stage };
  
  for (const [k, v] of Object.entries(data)) {
    if (k.toLowerCase().includes('password') || k.toLowerCase().includes('auth') || k.toLowerCase().includes('token')) {
      continue;
    }
    if (typeof v === 'string' && v.length > 300) {
      sanitized[k] = v.slice(0, 300) + '...';
    } else {
      sanitized[k] = v;
    }
  }
  
  console.log(`[TGA-IMPORT] [${correlationId}] STAGE=${stage}`, JSON.stringify(sanitized));
}

function jsonResponse(body: object, status = 200): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: { ...corsHeaders, 'Content-Type': 'application/json' },
  });
}

// ============================================================================
// DATASET DOWNLOAD + PARSE
// ============================================================================

interface DatasetConfig {
  rtosUrl?: string;
  scopeUrl?: string;
}

const DEFAULT_DATASET_URLS: DatasetConfig = {
  // These should be the official Training.gov.au dataset URLs
  // User will provide these via request body
};

async function downloadDataset(url: string, correlationId: string): Promise<{ ok: boolean; data?: string; error?: string }> {
  logStage(correlationId, 'dataset.download.start', { url });
  
  try {
    const controller = new AbortController();
    const timeoutId = setTimeout(() => controller.abort(), 60000); // 60s timeout for large files
    
    const response = await fetch(url, {
      signal: controller.signal,
      headers: {
        'Accept': 'text/csv, application/xml, */*',
      },
    });
    
    clearTimeout(timeoutId);
    
    if (!response.ok) {
      return { ok: false, error: `HTTP ${response.status}: ${response.statusText}` };
    }
    
    const data = await response.text();
    logStage(correlationId, 'dataset.download.success', { url, size: data.length });
    
    return { ok: true, data };
  } catch (err) {
    const errorMsg = err instanceof Error ? err.message : String(err);
    logStage(correlationId, 'dataset.download.error', { url, error: errorMsg });
    return { ok: false, error: errorMsg };
  }
}

function parseCSV(csvData: string): Record<string, string>[] {
  const lines = csvData.split('\n');
  if (lines.length < 2) return [];
  
  // Parse header
  const headerLine = lines[0].trim();
  const headers = parseCSVLine(headerLine);
  
  const results: Record<string, string>[] = [];
  
  for (let i = 1; i < lines.length; i++) {
    const line = lines[i].trim();
    if (!line) continue;
    
    const values = parseCSVLine(line);
    const row: Record<string, string> = {};
    
    headers.forEach((header, idx) => {
      row[header] = values[idx] || '';
    });
    
    results.push(row);
  }
  
  return results;
}

function parseCSVLine(line: string): string[] {
  const result: string[] = [];
  let current = '';
  let inQuotes = false;
  
  for (let i = 0; i < line.length; i++) {
    const char = line[i];
    
    if (char === '"') {
      if (inQuotes && line[i + 1] === '"') {
        current += '"';
        i++;
      } else {
        inQuotes = !inQuotes;
      }
    } else if (char === ',' && !inQuotes) {
      result.push(current.trim());
      current = '';
    } else {
      current += char;
    }
  }
  
  result.push(current.trim());
  return result;
}

// ============================================================================
// DATABASE OPERATIONS
// ============================================================================

interface ImportRunResult {
  id: string;
  status: string;
  records_processed: number;
  error_message?: string;
}

// deno-lint-ignore no-explicit-any
type SupabaseClientAny = any;

async function createImportRun(
  supabase: SupabaseClientAny,
  runType: 'scheduled' | 'manual',
  userId: string | null,
  sourceRef: string | null,
  correlationId: string
): Promise<{ ok: boolean; runId?: string; error?: string }> {
  logStage(correlationId, 'import_run.create', { run_type: runType });
  
  const { data, error } = await supabase
    .from('tga_import_runs')
    .insert({
      run_type: runType,
      status: 'running',
      source_ref: sourceRef,
      created_by: userId,
    })
    .select('id')
    .single();
  
  if (error) {
    logStage(correlationId, 'import_run.create.error', { error: error.message });
    return { ok: false, error: error.message };
  }
  
  return { ok: true, runId: String(data.id) };
}

async function completeImportRun(
  supabase: SupabaseClientAny,
  runId: string,
  status: 'success' | 'failed',
  recordsProcessed: number,
  errorMessage: string | null,
  checksum: string | null,
  correlationId: string
): Promise<void> {
  logStage(correlationId, 'import_run.complete', { run_id: runId, status, records_processed: recordsProcessed });
  
  await supabase
    .from('tga_import_runs')
    .update({
      status,
      finished_at: new Date().toISOString(),
      records_processed: recordsProcessed,
      error_message: errorMessage,
      source_checksum: checksum,
    })
    .eq('id', runId);
  
  // Update import state if successful
  if (status === 'success') {
    await supabase
      .from('tga_import_state')
      .update({
        latest_success_import_id: runId,
        updated_at: new Date().toISOString(),
      })
      .eq('id', 1);
  }
}

async function upsertRtos(
  supabase: SupabaseClientAny,
  rtos: Record<string, string>[],
  importId: string,
  correlationId: string
): Promise<{ ok: boolean; count: number; error?: string }> {
  logStage(correlationId, 'rtos.upsert.start', { count: rtos.length });
  
  const mapped = rtos.map(row => ({
    rto_number: row['Code'] || row['RTO_CODE'] || row['code'] || '',
    legal_name: row['LegalName'] || row['LEGAL_NAME'] || row['legal_name'] || null,
    trading_name: row['TradingName'] || row['TRADING_NAME'] || row['trading_name'] || null,
    abn: row['ABN'] || row['abn'] || null,
    status: row['Status'] || row['STATUS'] || row['status'] || null,
    registration_start: parseDate(row['RegistrationStart'] || row['REGISTRATION_START'] || row['registration_start']),
    registration_end: parseDate(row['RegistrationEnd'] || row['REGISTRATION_END'] || row['registration_end']),
    cricos_provider_number: row['CRICOSProviderNumber'] || row['CRICOS_PROVIDER_NUMBER'] || null,
    website: row['Website'] || row['WEBSITE'] || row['website'] || null,
    phone: row['Phone'] || row['PHONE'] || row['phone'] || null,
    email: row['Email'] || row['EMAIL'] || row['email'] || null,
    last_seen_in_import_id: importId,
    updated_at: new Date().toISOString(),
  })).filter(r => r.rto_number);
  
  if (mapped.length === 0) {
    return { ok: true, count: 0 };
  }
  
  // Batch upsert in chunks
  const chunkSize = 500;
  let totalInserted = 0;
  
  for (let i = 0; i < mapped.length; i += chunkSize) {
    const chunk = mapped.slice(i, i + chunkSize);
    const { error } = await supabase
      .from('tga_rtos')
      .upsert(chunk, { onConflict: 'rto_number' });
    
    if (error) {
      logStage(correlationId, 'rtos.upsert.error', { error: error.message, chunk_start: i });
      return { ok: false, count: totalInserted, error: error.message };
    }
    
    totalInserted += chunk.length;
    logStage(correlationId, 'rtos.upsert.progress', { inserted: totalInserted, total: mapped.length });
  }
  
  logStage(correlationId, 'rtos.upsert.complete', { count: totalInserted });
  return { ok: true, count: totalInserted };
}

async function insertScopeItems(
  supabase: SupabaseClientAny,
  items: Record<string, string>[],
  importId: string,
  correlationId: string
): Promise<{ ok: boolean; count: number; error?: string }> {
  logStage(correlationId, 'scope_items.insert.start', { count: items.length });
  
  const mapped = items.map(row => {
    const code = row['NRTCode'] || row['Code'] || row['code'] || row['NRT_CODE'] || '';
    const typeRaw = row['TrainingComponentType'] || row['Type'] || row['type'] || row['TRAINING_COMPONENT_TYPE'] || '';
    
    return {
      rto_number: row['OrganisationCode'] || row['RTO_CODE'] || row['rto_number'] || row['ORGANISATION_CODE'] || '',
      code,
      type: normalizeType(typeRaw),
      title: row['NRTTitle'] || row['Title'] || row['title'] || row['NRT_TITLE'] || null,
      status: normalizeStatus(row['Status'] || row['STATUS'] || row['status']),
      currency_start: parseDate(row['StartDate'] || row['START_DATE'] || row['start_date']),
      currency_end: parseDate(row['EndDate'] || row['END_DATE'] || row['end_date']),
      import_id: importId,
    };
  }).filter(r => r.rto_number && r.code);
  
  if (mapped.length === 0) {
    return { ok: true, count: 0 };
  }
  
  // Batch insert in chunks
  const chunkSize = 1000;
  let totalInserted = 0;
  
  for (let i = 0; i < mapped.length; i += chunkSize) {
    const chunk = mapped.slice(i, i + chunkSize);
    const { error } = await supabase
      .from('tga_scope_items')
      .insert(chunk);
    
    if (error) {
      // Ignore duplicate key errors for scope items
      if (!error.message.includes('duplicate key')) {
        logStage(correlationId, 'scope_items.insert.error', { error: error.message, chunk_start: i });
        return { ok: false, count: totalInserted, error: error.message };
      }
    }
    
    totalInserted += chunk.length;
    
    if (i % 5000 === 0) {
      logStage(correlationId, 'scope_items.insert.progress', { inserted: totalInserted, total: mapped.length });
    }
  }
  
  logStage(correlationId, 'scope_items.insert.complete', { count: totalInserted });
  return { ok: true, count: totalInserted };
}

function normalizeType(typeRaw: string): string {
  const lower = typeRaw.toLowerCase();
  if (lower.includes('qualification')) return 'qualification';
  if (lower.includes('unit')) return 'unit';
  if (lower.includes('skill')) return 'skill_set';
  if (lower.includes('accredited') || lower.includes('course')) return 'accredited_course';
  return 'unit'; // default
}

function normalizeStatus(status: string | undefined): string {
  if (!status) return 'unknown';
  const lower = status.toLowerCase();
  if (lower.includes('current')) return 'current';
  if (lower.includes('superseded')) return 'superseded';
  if (lower.includes('removed') || lower.includes('deleted')) return 'removed';
  return 'unknown';
}

function parseDate(dateStr: string | undefined): string | null {
  if (!dateStr) return null;
  
  // Try various formats
  const cleaned = dateStr.trim();
  if (!cleaned) return null;
  
  // ISO format
  if (/^\d{4}-\d{2}-\d{2}/.test(cleaned)) {
    return cleaned.slice(0, 10);
  }
  
  // DD/MM/YYYY
  const dmyMatch = cleaned.match(/^(\d{1,2})\/(\d{1,2})\/(\d{4})$/);
  if (dmyMatch) {
    const [, d, m, y] = dmyMatch;
    return `${y}-${m.padStart(2, '0')}-${d.padStart(2, '0')}`;
  }
  
  return null;
}

function computeChecksum(data: string): string {
  // Simple hash for deduplication
  let hash = 0;
  for (let i = 0; i < data.length; i++) {
    const char = data.charCodeAt(i);
    hash = ((hash << 5) - hash) + char;
    hash = hash & hash;
  }
  return hash.toString(16);
}

// ============================================================================
// MAIN IMPORT FLOW
// ============================================================================

interface ImportRequest {
  run_type?: 'scheduled' | 'manual';
  rtos_url?: string;
  scope_url?: string;
  rtos_data?: string; // Direct CSV/JSON data
  scope_data?: string;
}

async function handleImport(
  supabase: SupabaseClientAny,
  userId: string | null,
  body: ImportRequest,
  correlationId: string
): Promise<Response> {
  const runType = body.run_type || 'manual';
  
  // Create import run
  const runResult = await createImportRun(supabase, runType, userId, body.rtos_url || 'direct_upload', correlationId);
  if (!runResult.ok || !runResult.runId) {
    return jsonResponse({
      ok: false,
      correlation_id: correlationId,
      stage: 'import_run.create.failed',
      error: runResult.error,
    }, 500);
  }
  
  const importId = runResult.runId;
  let totalRecords = 0;
  let checksum: string | null = null;
  
  try {
    // Download or use provided RTO data
    let rtosData: string | undefined = body.rtos_data;
    if (!rtosData && body.rtos_url) {
      const download = await downloadDataset(body.rtos_url, correlationId);
      if (!download.ok) {
        await completeImportRun(supabase, importId, 'failed', 0, `Failed to download RTOs: ${download.error}`, null, correlationId);
        return jsonResponse({
          ok: false,
          correlation_id: correlationId,
          stage: 'dataset.download.failed',
          error: download.error,
        }, 502);
      }
      rtosData = download.data;
    }
    
    // Parse and upsert RTOs
    if (rtosData) {
      checksum = computeChecksum(rtosData);
      const rtos = parseCSV(rtosData);
      const rtosResult = await upsertRtos(supabase, rtos, importId, correlationId);
      if (!rtosResult.ok) {
        await completeImportRun(supabase, importId, 'failed', rtosResult.count, rtosResult.error || 'RTO upsert failed', checksum, correlationId);
        return jsonResponse({
          ok: false,
          correlation_id: correlationId,
          stage: 'rtos.upsert.failed',
          error: rtosResult.error,
          records_processed: rtosResult.count,
        }, 500);
      }
      totalRecords += rtosResult.count;
    }
    
    // Download or use provided scope data
    let scopeData: string | undefined = body.scope_data;
    if (!scopeData && body.scope_url) {
      const download = await downloadDataset(body.scope_url, correlationId);
      if (!download.ok) {
        await completeImportRun(supabase, importId, 'failed', totalRecords, `Failed to download scope: ${download.error}`, checksum, correlationId);
        return jsonResponse({
          ok: false,
          correlation_id: correlationId,
          stage: 'dataset.download.failed',
          error: download.error,
          records_processed: totalRecords,
        }, 502);
      }
      scopeData = download.data;
    }
    
    // Parse and insert scope items
    if (scopeData) {
      const items = parseCSV(scopeData);
      const scopeResult = await insertScopeItems(supabase, items, importId, correlationId);
      if (!scopeResult.ok) {
        await completeImportRun(supabase, importId, 'failed', totalRecords + scopeResult.count, scopeResult.error || 'Scope insert failed', checksum, correlationId);
        return jsonResponse({
          ok: false,
          correlation_id: correlationId,
          stage: 'scope_items.insert.failed',
          error: scopeResult.error,
          records_processed: totalRecords + scopeResult.count,
        }, 500);
      }
      totalRecords += scopeResult.count;
    }
    
    // Complete import run
    await completeImportRun(supabase, importId, 'success', totalRecords, null, checksum, correlationId);
    
    return jsonResponse({
      ok: true,
      correlation_id: correlationId,
      stage: 'import.complete',
      import_id: importId,
      records_processed: totalRecords,
      checksum,
    });
    
  } catch (err) {
    const errorMsg = err instanceof Error ? err.message : String(err);
    await completeImportRun(supabase, importId, 'failed', totalRecords, errorMsg, checksum, correlationId);
    
    return jsonResponse({
      ok: false,
      correlation_id: correlationId,
      stage: 'import.exception',
      error: errorMsg,
      records_processed: totalRecords,
    }, 500);
  }
}

// ============================================================================
// STATUS / HEALTH CHECK
// ============================================================================

async function handleStatus(
  supabase: SupabaseClientAny,
  correlationId: string
): Promise<Response> {
  logStage(correlationId, 'status.check');
  
  // Get latest import state
  const { data: importState } = await supabase
    .from('tga_import_state')
    .select('latest_success_import_id, updated_at')
    .eq('id', 1)
    .maybeSingle();
  
  // Get counts
  const { count: rtosCount } = await supabase
    .from('tga_rtos')
    .select('*', { count: 'exact', head: true });
  
  const { count: scopeCount } = await supabase
    .from('tga_scope_items')
    .select('*', { count: 'exact', head: true });
  
  // Get latest import run
  const { data: latestRun } = await supabase
    .from('tga_import_runs')
    .select('*')
    .order('started_at', { ascending: false })
    .limit(1)
    .maybeSingle();
  
  return jsonResponse({
    ok: true,
    correlation_id: correlationId,
    stage: 'status',
    import_state: {
      latest_import_id: importState?.latest_success_import_id,
      last_updated: importState?.updated_at,
    },
    counts: {
      rtos: rtosCount || 0,
      scope_items: scopeCount || 0,
    },
    latest_run: latestRun ? {
      id: latestRun.id,
      status: latestRun.status,
      run_type: latestRun.run_type,
      started_at: latestRun.started_at,
      finished_at: latestRun.finished_at,
      records_processed: latestRun.records_processed,
      error: latestRun.error_message,
    } : null,
  });
}

// ============================================================================
// MAIN HANDLER
// ============================================================================

serve(async (req) => {
  const correlationId = generateCorrelationId();
  
  // CORS preflight
  if (req.method === 'OPTIONS') {
    return new Response(null, { headers: corsHeaders });
  }

  try {
    logStage(correlationId, 'request.start', { method: req.method, url: req.url });

    // Parse URL params
    const url = new URL(req.url);
    const action = url.searchParams.get('action') || 'status';

    // Status/health check (no auth required)
    if (action === 'status' || req.method === 'GET') {
      const supabaseUrl = Deno.env.get('SUPABASE_URL')!;
      const supabaseKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!;
      const supabase = createClient(supabaseUrl, supabaseKey);
      
      return await handleStatus(supabase, correlationId);
    }

    // Auth check for import operations
    const authHeader = req.headers.get('Authorization');
    if (!authHeader) {
      return jsonResponse({
        ok: false,
        correlation_id: correlationId,
        stage: 'auth.missing',
        error: 'Missing authorization header',
      }, 401);
    }

    const supabaseUrl = Deno.env.get('SUPABASE_URL')!;
    const supabaseKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!;
    const supabase = createClient(supabaseUrl, supabaseKey);

    const token = authHeader.replace('Bearer ', '');
    const { data: { user }, error: authError } = await supabase.auth.getUser(token);
    
    if (authError || !user) {
      return jsonResponse({
        ok: false,
        correlation_id: correlationId,
        stage: 'auth.invalid',
        error: 'Invalid token',
      }, 401);
    }

    // Parse request body
    let body: ImportRequest = {};
    if (req.method === 'POST') {
      try {
        body = await req.json();
      } catch {
        body = {};
      }
    }

    logStage(correlationId, 'request.parsed', { action, has_rtos_url: !!body.rtos_url, has_scope_url: !!body.scope_url });

    // Handle import action
    if (action === 'import') {
      return await handleImport(supabase, user.id, body, correlationId);
    }

    // Default: return status
    return await handleStatus(supabase, correlationId);

  } catch (err) {
    const errorMessage = err instanceof Error ? err.message : String(err);
    const errorStack = err instanceof Error ? err.stack : undefined;
    
    logStage(correlationId, 'unhandled.exception', { error: errorMessage });
    console.error(`[TGA-IMPORT] [${correlationId}] Unhandled exception:`, errorMessage, errorStack);
    
    return jsonResponse({
      ok: false,
      correlation_id: correlationId,
      stage: 'unhandled.exception',
      error: errorMessage,
    }, 500);
  }
});
