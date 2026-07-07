// bulk-generate-documents-worker
//
// Drains a bulk_document_jobs job by leasing items, bootstrapping SharePoint
// prerequisites for each tenant, running stage repair, then invoking
// deliver-governance-document per item. Time-budgeted to ~50 seconds per
// invocation; re-invokes itself if the job is still running and there is more
// work left.
//
// WORKER_ID contract:
//   One crypto.randomUUID() per invocation. Used consistently for every
//   lease_bulk_document_job_items and record_bulk_document_item_outcome call
//   in this invocation. Never reused, never omitted. A false return from
//   record_bulk_document_item_outcome means "your lease was fenced" — log and
//   continue, do NOT retry and do NOT mark the item failed.
//
// SAFETY NOTE (do not remove):
//   cancel_bulk_document_job MUST always run under a real staff JWT — never
//   service_role — because its permission gate silently no-ops when
//   auth.uid() is NULL. This worker never calls cancel_bulk_document_job.
//
// Auth model (Option A):
//   Caller JWT is forwarded from the launcher via x-caller-authorization.
//   It's reused as the Authorization header for every downstream edge-
//   function fetch (provision-tenant-sharepoint-folder, verify-compliance-
//   folder, deliver-governance-document), for the staff-gated
//   repair_package_instance_stages RPC (via an anon-key Supabase client
//   with the caller Authorization forwarded), and for this worker's own
//   fire-and-forget self re-invoke. Known limitation: Supabase access
//   tokens expire ~1 hour; downstream 401s after expiry are recorded with
//   error_code='auth_expired'.

import { createClient } from 'https://esm.sh/@supabase/supabase-js@2';

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers':
    'authorization, x-caller-authorization, x-client-info, apikey, content-type',
  'Access-Control-Allow-Methods': 'POST, OPTIONS',
};

const SUPABASE_URL = Deno.env.get('SUPABASE_URL')!;
const SUPABASE_ANON_KEY = Deno.env.get('SUPABASE_ANON_KEY')!;
const SUPABASE_SERVICE_ROLE_KEY = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!;

const TIME_BUDGET_MS = 50_000;
const LEASE_BATCH = 5;
const SUPPORTED_FORMATS = new Set(['docx', 'xlsx', 'xls', 'xlsm', 'pptx']);

function json(body: unknown, status = 200): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: { ...corsHeaders, 'Content-Type': 'application/json' },
  });
}

type BootstrapCacheEntry =
  | { ok: true }
  | { ok: false; transient: boolean; errorCode: string; errorMessage: string };

type RepairCacheEntry =
  | { ok: true }
  | { ok: false; errorMessage: string };

Deno.serve(async (req: Request) => {
  if (req.method === 'OPTIONS') return new Response(null, { headers: corsHeaders });
  if (req.method !== 'POST') return json({ error: 'Method not allowed' }, 405);

  const callerAuth = req.headers.get('x-caller-authorization');
  if (!callerAuth?.startsWith('Bearer ')) {
    return json({ error: 'Missing x-caller-authorization' }, 401);
  }

  let jobId: string;
  try {
    const body = await req.json();
    if (!body?.job_id || typeof body.job_id !== 'string') {
      return json({ error: 'job_id required' }, 400);
    }
    jobId = body.job_id;
  } catch {
    return json({ error: 'Invalid JSON body' }, 400);
  }

  const WORKER_ID = crypto.randomUUID();
  const startedAt = Date.now();
  console.log(`[worker] START job=${jobId} worker_id=${WORKER_ID}`);

  const supabaseService = createClient(SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY, {
    auth: { persistSession: false, autoRefreshToken: false },
  });

  const bootstrapCache = new Map<number, BootstrapCacheEntry>();
  const repairCache = new Map<number, RepairCacheEntry>();

  const deliverUrl = `${SUPABASE_URL}/functions/v1/deliver-governance-document`;
  const provisionUrl = `${SUPABASE_URL}/functions/v1/provision-tenant-sharepoint-folder`;
  const verifyUrl = `${SUPABASE_URL}/functions/v1/verify-compliance-folder`;
  const selfUrl = `${SUPABASE_URL}/functions/v1/bulk-generate-documents-worker`;

  // ── Helpers ────────────────────────────────────────────────────────────
  async function record(
    itemId: number,
    state: 'generated' | 'skipped' | 'failed',
    reason: string | null,
    outcome: Record<string, unknown>,
    error: string | null,
    errorCode: string | null,
  ): Promise<void> {
    try {
      const { data, error: rpcErr } = await supabaseService.rpc(
        'record_bulk_document_item_outcome',
        {
          p_item_id: itemId,
          p_worker_id: WORKER_ID,
          p_state: state,
          p_reason: reason,
          p_outcome: outcome,
          p_error: error,
          p_error_code: errorCode,
        },
      );
      if (rpcErr) {
        console.error(`[worker] record RPC error item=${itemId}`, rpcErr);
        return;
      }
      if (data === false) {
        console.warn(`[worker] record returned false (fenced) item=${itemId} worker=${WORKER_ID}`);
      }
    } catch (e) {
      console.error(`[worker] record threw for item=${itemId}`, e);
    }
  }

  async function ensureSharepoint(tenantId: number): Promise<BootstrapCacheEntry> {
    const cached = bootstrapCache.get(tenantId);
    if (cached) return cached;

    const { data: settings, error: sErr } = await supabaseService
      .from('tenant_sharepoint_settings')
      .select('provisioning_status, validation_status, governance_folder_item_id')
      .eq('tenant_id', tenantId)
      .maybeSingle();

    if (sErr) {
      const entry: BootstrapCacheEntry = {
        ok: false,
        transient: true,
        errorCode: 'settings_read_failed',
        errorMessage: sErr.message,
      };
      bootstrapCache.set(tenantId, entry);
      return entry;
    }

    const needsProvision =
      !settings ||
      settings.provisioning_status !== 'success' ||
      settings.validation_status !== 'valid';

    if (needsProvision) {
      const resp = await fetch(provisionUrl, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Authorization: callerAuth!,
        },
        body: JSON.stringify({ tenant_id: tenantId }),
      });
      if (!resp.ok) {
        const bodyText = (await resp.text()).slice(0, 2000);
        const entry: BootstrapCacheEntry =
          resp.status === 401
            ? { ok: false, transient: false, errorCode: 'auth_expired', errorMessage: bodyText }
            : { ok: false, transient: true, errorCode: 'provision_failed', errorMessage: bodyText };
        bootstrapCache.set(tenantId, entry);
        return entry;
      }
      await resp.text().catch(() => {}); // consume body
    }

    // Re-read to check governance_folder_item_id after any provisioning
    const { data: settings2 } = await supabaseService
      .from('tenant_sharepoint_settings')
      .select('governance_folder_item_id')
      .eq('tenant_id', tenantId)
      .maybeSingle();

    if (!settings2?.governance_folder_item_id) {
      const resp = await fetch(verifyUrl, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Authorization: callerAuth!,
        },
        body: JSON.stringify({ tenant_id: tenantId }),
      });
      if (!resp.ok) {
        const bodyText = (await resp.text()).slice(0, 2000);
        const entry: BootstrapCacheEntry =
          resp.status === 401
            ? { ok: false, transient: false, errorCode: 'auth_expired', errorMessage: bodyText }
            : { ok: false, transient: true, errorCode: 'verify_failed', errorMessage: bodyText };
        bootstrapCache.set(tenantId, entry);
        return entry;
      }
      await resp.text().catch(() => {});
    }

    const entry: BootstrapCacheEntry = { ok: true };
    bootstrapCache.set(tenantId, entry);
    return entry;
  }

  async function ensureRepair(tenantId: number): Promise<RepairCacheEntry> {
    const cached = repairCache.get(tenantId);
    if (cached) return cached;

    const { data: instances, error: pErr } = await supabaseService
      .from('package_instances')
      .select('id')
      .eq('tenant_id', tenantId)
      .eq('is_active', true)
      .eq('is_complete', false)
      .eq('membership_state', 'active');

    if (pErr) {
      const entry: RepairCacheEntry = { ok: false, errorMessage: `package_instances read: ${pErr.message}` };
      repairCache.set(tenantId, entry);
      return entry;
    }

    for (const pi of instances ?? []) {
      const { error: rErr } = await supabaseService.rpc('repair_package_instance_stages', {
        p_package_instance_id: pi.id,
        p_dry_run: false,
      });
      if (rErr) {
        const entry: RepairCacheEntry = {
          ok: false,
          errorMessage: `repair pi=${pi.id}: ${rErr.message}`,
        };
        repairCache.set(tenantId, entry);
        return entry;
      }
    }

    const entry: RepairCacheEntry = { ok: true };
    repairCache.set(tenantId, entry);
    return entry;
  }

  async function latestPublishedVersion(
    documentId: number,
  ): Promise<{ id: string; storage_path: string | null; frozen_storage_path: string | null } | null> {
    const { data, error } = await supabaseService
      .from('document_versions')
      .select('id, storage_path, frozen_storage_path')
      .eq('document_id', documentId)
      .eq('status', 'published')
      .order('version_number', { ascending: false })
      .limit(1)
      .maybeSingle();
    if (error) {
      console.error('[worker] latestPublishedVersion error', documentId, error);
      return null;
    }
    return data as { id: string; storage_path: string | null; frozen_storage_path: string | null } | null;
  }

  async function documentMeta(
    documentId: number,
  ): Promise<{ format: string | null; source_template_url: string | null } | null> {
    const { data, error } = await supabaseService
      .from('documents')
      .select('format, source_template_url')
      .eq('id', documentId)
      .maybeSingle();
    if (error) {
      console.error('[worker] documentMeta error', documentId, error);
      return null;
    }
    return (data as { format: string | null; source_template_url: string | null } | null) ?? null;
  }

  // ── Main loop ──────────────────────────────────────────────────────────
  let processed = 0;
  let timedOut = false;

  while (Date.now() - startedAt < TIME_BUDGET_MS) {
    const { data: job, error: jobErr } = await supabaseService
      .from('bulk_document_jobs')
      .select('status')
      .eq('id', jobId)
      .maybeSingle();
    if (jobErr || !job) {
      console.error('[worker] job read error / not found', jobErr);
      break;
    }
    if (job.status !== 'running') {
      console.log(`[worker] job status=${job.status}, halting new leases`);
      break;
    }

    const { data: leased, error: leaseErr } = await supabaseService.rpc(
      'lease_bulk_document_job_items',
      { p_job_id: jobId, p_worker_id: WORKER_ID, p_limit: LEASE_BATCH },
    );
    if (leaseErr) {
      console.error('[worker] lease error', leaseErr);
      break;
    }
    const items = (leased ?? []) as Array<{
      id: number;
      tenant_id: number;
      document_id: number;
      package_instance_id: number;
      stageinstance_id: number;
    }>;
    if (items.length === 0) break;

    for (const item of items) {
      if (Date.now() - startedAt >= TIME_BUDGET_MS) {
        timedOut = true;
        break;
      }
      try {
        const bootstrap = await ensureSharepoint(item.tenant_id);
        if (!bootstrap.ok) {
          if (bootstrap.transient) {
            // Leave state='leased'; reclaim_stale_bulk_document_locks will
            // reset it to 'pending' after stall_minutes with bounded retry.
            console.warn(
              `[worker] transient bootstrap failure tenant=${item.tenant_id} code=${bootstrap.errorCode}; leaving leased`,
            );
            continue;
          }
          await record(item.id, 'failed', bootstrap.errorCode, {}, bootstrap.errorMessage, bootstrap.errorCode);
          continue;
        }

        const repair = await ensureRepair(item.tenant_id);
        if (!repair.ok) {
          await record(item.id, 'failed', 'stage_repair_failed', {}, repair.errorMessage, 'stage_repair_failed');
          continue;
        }

        const version = await latestPublishedVersion(item.document_id);
        if (!version) {
          await record(item.id, 'skipped', 'no_published_version', {}, null, null);
          continue;
        }

        const meta = await documentMeta(item.document_id);
        const fmt = ((meta?.format ?? '') as string).toLowerCase().trim();
        if (!SUPPORTED_FORMATS.has(fmt)) {
          await record(item.id, 'skipped', 'unsupported_format', { format: fmt }, null, null);
          continue;
        }

        const hasTemplate =
          !!version.storage_path ||
          !!version.frozen_storage_path ||
          !!meta?.source_template_url;
        if (!hasTemplate) {
          await record(
            item.id,
            'skipped',
            'no_template',
            { document_id: item.document_id, document_version_id: version.id },
            null,
            null,
          );
          continue;
        }

        const resp = await fetch(deliverUrl, {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
            Authorization: callerAuth!,
          },
          body: JSON.stringify({
            tenant_id: item.tenant_id,
            document_version_id: version.id,
            allow_incomplete: true,
            force: true,
          }),
        });

        if (resp.status === 401) {
          const t = (await resp.text()).slice(0, 2000);
          await record(item.id, 'failed', 'auth_expired', { http_status: 401 }, t || 'Caller JWT expired mid-job', 'auth_expired');
        } else if (resp.ok) {
          let body: unknown = null;
          try {
            body = await resp.json();
          } catch {
            body = { note: 'non-json response body' };
          }
          await record(item.id, 'generated', null, (body ?? {}) as Record<string, unknown>, null, null);
        } else {
          const text = (await resp.text()).slice(0, 2000);
          await record(
            item.id,
            'failed',
            'deliver_failed',
            { http_status: resp.status },
            text,
            `deliver_${resp.status}`,
          );
        }
        processed += 1;
      } catch (e) {
        console.error('[worker] per-item error', item.id, e);
        // Keep going.
      }
    }

    if (timedOut) break;
  }

  // Re-invoke if still work + still running
  const { data: postJob } = await supabaseService
    .from('bulk_document_jobs')
    .select('status')
    .eq('id', jobId)
    .maybeSingle();

  let remaining = 0;
  if (postJob?.status === 'running') {
    const { count } = await supabaseService
      .from('bulk_document_job_items')
      .select('id', { count: 'exact', head: true })
      .eq('job_id', jobId)
      .in('state', ['pending', 'leased']);
    remaining = count ?? 0;
    if (remaining > 0) {
      fetch(selfUrl, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'x-caller-authorization': callerAuth!,
          Authorization: `Bearer ${SUPABASE_SERVICE_ROLE_KEY}`,
        },
        body: JSON.stringify({ job_id: jobId }),
      }).catch((e) => console.error('[worker] self re-invoke failed', e));
    }
  }

  console.log(
    `[worker] END job=${jobId} worker_id=${WORKER_ID} processed=${processed} timed_out=${timedOut} remaining=${remaining}`,
  );
  return json({ worker_id: WORKER_ID, processed, timed_out: timedOut, remaining });
});
