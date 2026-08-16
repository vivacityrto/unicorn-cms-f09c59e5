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
// Auth model:
//   This function is invoked machine-to-machine by the launcher (and by
//   its own fire-and-forget re-invoke), not by a browser. The gate is a
//   shared secret (BULK_DOCUMENT_WORKER_SECRET) compared in constant time
//   against x-worker-secret. Requests lacking that secret are rejected.
//   The staff JWT is still forwarded via x-caller-authorization; the
//   worker verifies it with admin.auth.getUser and reads exp via
//   getClaims (never by decoding an unverified payload) so it can stall
//   before the token expires. The same JWT is reused for downstream
//   edge-function fetches and staff-gated RPCs. Known limitation:
//   Supabase access tokens expire ~1 hour; downstream 401s after expiry
//   are recorded with error_code='auth_expired'.

import { createClient } from 'https://esm.sh/@supabase/supabase-js@2';
import { corsHeadersFor, parseBearerToken, requireSharedSecret } from '../_shared/requireCaller.ts';

const WORKER_CORS_EXTRA = ['x-caller-authorization', 'x-worker-secret'];
const WORKER_SECRET_ENV = 'BULK_DOCUMENT_WORKER_SECRET';

const SUPABASE_URL = Deno.env.get('SUPABASE_URL')!;
const SUPABASE_ANON_KEY = Deno.env.get('SUPABASE_ANON_KEY')!;
const SUPABASE_SERVICE_ROLE_KEY = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!;

const TIME_BUDGET_MS = 50_000;
const LEASE_BATCH = 5;
const SUPPORTED_FORMATS = new Set(['docx', 'xlsx', 'xls', 'xlsm', 'pptx']);

// Stop leasing/processing when the forwarded caller JWT is within this window
// of expiring, so we don't burn through remaining items with an unauthorised
// token. `exp` is only read from a signature-verified claims set
// (auth.getClaims after auth.getUser). Fail-safe: if verified `exp` is
// missing we keep going (token is valid right now).
const JWT_SAFETY_MARGIN_MS = 90_000;

function jwtNearExpiry(expMs: number | null): boolean {
  if (expMs === null) return false;
  return Date.now() >= expMs - JWT_SAFETY_MARGIN_MS;
}

type BootstrapCacheEntry =
  | { ok: true }
  | { ok: false; transient: boolean; errorCode: string; errorMessage: string };

type RepairCacheEntry =
  | { ok: true }
  | { ok: false; errorMessage: string };

Deno.serve(async (req: Request) => {
  const corsHeaders = corsHeadersFor(req, WORKER_CORS_EXTRA);
  const json = (body: unknown, status = 200): Response =>
    new Response(JSON.stringify(body), {
      status,
      headers: { ...corsHeaders, 'Content-Type': 'application/json' },
    });

  if (req.method === 'OPTIONS') return new Response(null, { headers: corsHeaders });

  const secretGate = requireSharedSecret(req, WORKER_SECRET_ENV, 'x-worker-secret', WORKER_CORS_EXTRA);
  if (secretGate instanceof Response) return secretGate;

  if (req.method !== 'POST') return json({ error: 'Method not allowed' }, 405);

  const callerAuth = req.headers.get('x-caller-authorization');
  const callerToken = parseBearerToken(callerAuth);
  if (!callerToken) {
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

  const { data: callerUser, error: callerErr } = await supabaseService.auth.getUser(
    callerToken,
  );
  if (callerErr || !callerUser?.user) {
    return json({ error: 'Invalid or expired caller token' }, 401);
  }

  // Read exp only from a verified claims set. Do not decode the JWT
  // payload locally — a forged exp would skip the near-expiry stall.
  let callerExpMs: number | null = null;
  const { data: claimsData } = await supabaseService.auth.getClaims(callerToken);
  if (typeof claimsData?.claims?.exp === 'number') {
    callerExpMs = claimsData.claims.exp * 1000;
  }

  // Anon-key client with the caller's Authorization forwarded, used for
  // staff-gated RPCs (repair_package_instance_stages) where auth.uid() must
  // resolve to the real staff user. Service role is unsafe here — the
  // repair RPC raises insufficient_privilege under service_role.
  const supabaseCaller = createClient(SUPABASE_URL, SUPABASE_ANON_KEY, {
    global: { headers: { Authorization: callerAuth } },
    auth: { persistSession: false, autoRefreshToken: false },
  });

  const bootstrapCache = new Map<number, BootstrapCacheEntry>();
  const repairCache = new Map<number, RepairCacheEntry>();

  const deliverUrl = `${SUPABASE_URL}/functions/v1/deliver-governance-document`;
  const provisionUrl = `${SUPABASE_URL}/functions/v1/provision-tenant-sharepoint-folder`;
  const verifyUrl = `${SUPABASE_URL}/functions/v1/verify-compliance-folder`;
  const livenessUrl = `${SUPABASE_URL}/functions/v1/check-tenant-sharepoint-liveness`;
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

    // 1. Live liveness probe — replaces the previous DB-flag-only check.
    //    Uses the caller's forwarded JWT (staff-gated, same as provision/verify).
    let shared: 'ok' | 'missing' | 'unconfigured' | 'error';
    let governance: 'ok' | 'missing' | 'unconfigured' | 'error';
    let livenessError: string | null = null;
    try {
      const resp = await fetch(livenessUrl, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Authorization: callerAuth!,
        },
        body: JSON.stringify({ tenant_ids: [tenantId] }),
      });
      if (!resp.ok) {
        const bodyText = (await resp.text()).slice(0, 2000);
        const entry: BootstrapCacheEntry =
          resp.status === 401
            ? { ok: false, transient: false, errorCode: 'auth_expired', errorMessage: bodyText }
            : { ok: false, transient: true, errorCode: 'liveness_check_failed', errorMessage: bodyText };
        bootstrapCache.set(tenantId, entry);
        return entry;
      }
      const payload = await resp.json().catch(() => null) as
        | { results?: Array<{ tenant_id: number; shared: string; governance: string; error: string | null }> }
        | null;
      const row = payload?.results?.[0];
      if (!row) {
        const entry: BootstrapCacheEntry = {
          ok: false,
          transient: true,
          errorCode: 'liveness_check_failed',
          errorMessage: 'Empty results from check-tenant-sharepoint-liveness',
        };
        bootstrapCache.set(tenantId, entry);
        return entry;
      }
      shared = row.shared as typeof shared;
      governance = row.governance as typeof governance;
      livenessError = row.error;
    } catch (e) {
      const entry: BootstrapCacheEntry = {
        ok: false,
        transient: true,
        errorCode: 'liveness_check_failed',
        errorMessage: e instanceof Error ? e.message : String(e),
      };
      bootstrapCache.set(tenantId, entry);
      return entry;
    }

    // 2. Shared folder branch.
    if (shared === 'error') {
      const entry: BootstrapCacheEntry = {
        ok: false,
        transient: true,
        errorCode: 'settings_read_failed',
        errorMessage: livenessError ?? 'shared liveness error',
      };
      bootstrapCache.set(tenantId, entry);
      return entry;
    }
    if (shared === 'missing' || shared === 'unconfigured') {
      const body: Record<string, unknown> = { tenant_id: tenantId, force: true };
      const resp = await fetch(provisionUrl, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Authorization: callerAuth!,
        },
        body: JSON.stringify(body),
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
      await resp.text().catch(() => {});
    }

    // 3. Governance folder branch.
    if (governance === 'error') {
      const entry: BootstrapCacheEntry = {
        ok: false,
        transient: true,
        errorCode: 'settings_read_failed',
        errorMessage: livenessError ?? 'governance liveness error',
      };
      bootstrapCache.set(tenantId, entry);
      return entry;
    }
    if (governance === 'missing' || governance === 'unconfigured') {
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
      const { error: rErr } = await supabaseCaller.rpc('repair_package_instance_stages', {
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

  // A pinned document_version_id (set at job-creation time for a specific
  // already-published version — e.g. the Deliver to Clients flow) always
  // wins over "latest published". Classic bulk-generate items never carry a
  // pinned version, so this falls through to latestPublishedVersion exactly
  // as before.
  async function pinnedOrLatestVersion(
    documentId: number,
    pinnedVersionId: string | null,
  ): Promise<{ id: string; storage_path: string | null; frozen_storage_path: string | null } | null> {
    if (!pinnedVersionId) return latestPublishedVersion(documentId);
    const { data, error } = await supabaseService
      .from('document_versions')
      .select('id, storage_path, frozen_storage_path')
      .eq('id', pinnedVersionId)
      .maybeSingle();
    if (error) {
      console.error('[worker] pinnedVersion lookup error', pinnedVersionId, error);
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

  // Release this worker's still-leased items back to pending (fenced on
  // worker_id + state='leased') and stall the job. Called when the forwarded
  // caller JWT is about to expire so we don't waste the remaining budget
  // hammering deliver-governance-document with a soon-to-be-401 token.
  async function stallAndRelease(reason: string): Promise<void> {
    console.warn(`[worker] JWT near expiry — stalling job=${jobId} reason=${reason}`);
    const { error: relErr } = await supabaseService
      .from('bulk_document_job_items')
      .update({
        state: 'pending',
        worker_id: null,
        leased_at: null,
        lease_expires_at: null,
        started_at: null,
      })
      .eq('job_id', jobId)
      .eq('worker_id', WORKER_ID)
      .eq('state', 'leased');
    if (relErr) console.error('[worker] stallAndRelease lease-release error', relErr);
    const { error: stallErr } = await supabaseService.rpc('stall_bulk_document_job', {
      p_job_id: jobId,
      p_reason: reason,
    });
    if (stallErr) console.error('[worker] stall_bulk_document_job error', stallErr);
  }

  // ── Main loop ──────────────────────────────────────────────────────────
  let processed = 0;
  let timedOut = false;

  while (Date.now() - startedAt < TIME_BUDGET_MS) {
    if (jwtNearExpiry(callerExpMs)) {
      await stallAndRelease('jwt_near_expiry');
      return json({ worker_id: WORKER_ID, processed, stalled: true });
    }
    const { data: job, error: jobErr } = await supabaseService
      .from('bulk_document_jobs')
      .select('status, origin')
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
    // Deliver to Clients respects deliver-governance-document's own
    // idempotency check (skip if already delivered for this snapshot) —
    // classic bulk-generate keeps forcing regeneration, unchanged from
    // before this job type existed.
    const forceDelivery = job.origin !== 'deliver_to_clients';

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
      document_version_id: string | null;
      snapshot_id: string | null;
      allow_incomplete: boolean;
    }>;
    if (items.length === 0) break;

    for (const item of items) {
      if (Date.now() - startedAt >= TIME_BUDGET_MS) {
        timedOut = true;
        break;
      }
      if (jwtNearExpiry(callerExpMs)) {
        await stallAndRelease('jwt_near_expiry');
        return json({ worker_id: WORKER_ID, processed, stalled: true });
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

        const version = await pinnedOrLatestVersion(item.document_id, item.document_version_id);
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
            allow_incomplete: item.allow_incomplete,
            snapshot_id: item.snapshot_id ?? undefined,
            force: forceDelivery,
            batch_id: jobId,
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
          'x-worker-secret': Deno.env.get(WORKER_SECRET_ENV) ?? '',
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
