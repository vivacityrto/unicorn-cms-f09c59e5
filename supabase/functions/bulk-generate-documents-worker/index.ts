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
//   x-caller-authorization (the launching staff member's browser JWT) is
//   only required to be structurally present — it is NOT validated against
//   Supabase Auth and is NOT used to authenticate any downstream call.
//   Every staff-gated downstream call (repair_package_instance_stages,
//   deliver-governance-document, provision-tenant-sharepoint-folder,
//   verify-compliance-folder, check-tenant-sharepoint-liveness) instead
//   authenticates as a dedicated system account
//   (bulk-generate-automation@vivacity.com.au, unicorn_role='Team Member'),
//   whose session is minted/refreshed on demand via
//   get_bulk_generate_system_session / set_bulk_generate_system_session
//   (Vault-backed, service_role-only) — see getSystemAuthHeader. This means
//   a job's duration is no longer bounded by the launching staff member's
//   own ~1hr browser session. If the system account's own session can't be
//   obtained or refreshed (e.g. its refresh token was revoked), the job
//   stalls with reason 'system_account_auth_failed' and the job's creator
//   gets an in-app notification (user_notifications) and an email — see
//   notifyJobStalled — rather than silently failing every remaining item.

import { createClient } from 'https://esm.sh/@supabase/supabase-js@2';
import { corsHeaders } from "../_shared/cors.ts";
import { parseBearerToken, requireSharedSecret } from '../_shared/requireCaller.ts';
import { appUrl } from "../_shared/app-base-url.ts";

const WORKER_CORS_EXTRA = ['x-caller-authorization', 'x-worker-secret'];
const WORKER_SECRET_ENV = 'BULK_DOCUMENT_WORKER_SECRET';


const SUPABASE_URL = Deno.env.get('SUPABASE_URL')!;
const SUPABASE_ANON_KEY = Deno.env.get('SUPABASE_ANON_KEY')!;
const SUPABASE_SERVICE_ROLE_KEY = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!;

const TIME_BUDGET_MS = 50_000;
const LEASE_BATCH = 5;
const SUPPORTED_FORMATS = new Set(['docx', 'xlsx', 'xls', 'xlsm', 'pptx']);

// Refresh the system account's session this far ahead of its actual expiry.
const SYSTEM_SESSION_SAFETY_MARGIN_MS = 120_000;

// ── Stalled-job alert (in-app notification + email to the job creator) ────
const MAILGUN_API_KEY = Deno.env.get('MAILGUN_API_KEY');
const MAILGUN_DOMAIN = Deno.env.get('MAILGUN_DOMAIN');
const MAILGUN_REGION = (Deno.env.get('MAILGUN_REGION') || 'us').toLowerCase();
const MAILGUN_FROM_EMAIL = Deno.env.get('MAILGUN_FROM_EMAIL') || 'noreply@vivacity.com.au';
const MAILGUN_FROM_NAME = Deno.env.get('MAILGUN_FROM_NAME') || 'Vivacity Unicorn';
const MAILGUN_BASE_URL =
  MAILGUN_REGION === 'eu' ? 'https://api.eu.mailgun.net/v3' : 'https://api.mailgun.net/v3';

function escapeHtml(str: string): string {
  return str
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;');
}

function stallReasonLabel(reason: string): string {
  if (reason === 'jwt_near_expiry') return 'your session token expired mid-run';
  if (reason === 'system_account_auth_failed') return 'the system account used to run this job lost its authentication and needs staff attention';
  return reason;
}

function buildStalledJobEmailHtml(opts: {
  recipientName: string;
  reasonLabel: string;
  jobUrl: string;
}): string {
  const { recipientName, reasonLabel, jobUrl } = opts;
  return `
<div style="font-family:Calibri,Arial,sans-serif;max-width:600px;margin:0 auto;background:#ffffff;">
  <div style="background:linear-gradient(135deg,#7130A0,#ED1878);padding:20px 28px;border-radius:8px 8px 0 0;">
    <span style="color:#ffffff;font-size:20px;font-weight:700;letter-spacing:0.5px;">Unicorn</span>
  </div>
  <div style="border:1px solid #DFD8E8;border-top:none;border-radius:0 0 8px 8px;padding:28px;">
    <p style="margin:0 0 4px;color:#44235F;font-size:13px;font-weight:600;text-transform:uppercase;letter-spacing:0.5px;">
      Bulk generation job stalled
    </p>
    <h2 style="margin:0 0 16px;color:#1a1a1a;font-size:19px;">Needs a manual retry</h2>
    <p style="margin:0 0 20px;color:#333;font-size:14px;">
      Hi ${escapeHtml(recipientName)}, a bulk document generation job you started
      has stalled — ${escapeHtml(reasonLabel)} — and won't continue on its own.
    </p>
    <a href="${jobUrl}" style="display:inline-block;background:#7130A0;color:#ffffff;text-decoration:none;padding:10px 22px;border-radius:6px;font-size:14px;font-weight:600;">View job in Unicorn</a>
    <p style="margin:28px 0 0;color:#888;font-size:11px;">This is an automated alert from Unicorn 2.0 by Vivacity Coaching &amp; Consulting.</p>
  </div>
</div>`;
}

async function sendMailgun(to: string, subject: string, html: string): Promise<string | null> {
  if (!MAILGUN_API_KEY || !MAILGUN_DOMAIN) {
    console.error('[worker] Missing Mailgun configuration; skipping stall-alert email');
    return null;
  }
  const formData = new FormData();
  formData.append('from', `${MAILGUN_FROM_NAME} <${MAILGUN_FROM_EMAIL}>`);
  formData.append('to', to);
  formData.append('subject', subject);
  formData.append('html', html);

  const res = await fetch(`${MAILGUN_BASE_URL}/${MAILGUN_DOMAIN}/messages`, {
    method: 'POST',
    headers: { Authorization: `Basic ${btoa(`api:${MAILGUN_API_KEY}`)}` },
    body: formData,
  });

  if (!res.ok) {
    console.error('[worker] Mailgun send failed', res.status, await res.text());
    return null;
  }
  const result = await res.json();
  return result?.id ?? null;
}

function json(req: Request, body: unknown, status = 200): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: { ...corsHeaders(req), 'Content-Type': 'application/json' },
  });

}

type BootstrapCacheEntry =
  | { ok: true }
  | { ok: false; transient: boolean; errorCode: string; errorMessage: string };

type RepairCacheEntry =
  | { ok: true }
  | { ok: false; errorMessage: string };

Deno.serve(async (req: Request) => {
  if (req.method === 'OPTIONS') return new Response(null, { headers: corsHeaders(req) });

  const secretGate = requireSharedSecret(req, WORKER_SECRET_ENV, 'x-worker-secret', WORKER_CORS_EXTRA);
  if (secretGate instanceof Response) return secretGate;

  if (req.method !== 'POST') return json(req, { error: 'Method not allowed' }, 405);

  const callerAuth = req.headers.get('x-caller-authorization');
  const callerToken = parseBearerToken(callerAuth);
  if (!callerToken) {
    return json(req, { error: 'Missing x-caller-authorization' }, 401);

  }

  let jobId: string;
  try {
    const body = await req.json();
    if (!body?.job_id || typeof body.job_id !== 'string') {
      return json(req, { error: 'job_id required' }, 400);
    }
    jobId = body.job_id;
  } catch {
    return json(req, { error: 'Invalid JSON body' }, 400);
  }

  const WORKER_ID = crypto.randomUUID();
  const startedAt = Date.now();
  console.log(`[worker] START job=${jobId} worker_id=${WORKER_ID}`);

  const supabaseService = createClient(SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY, {
    auth: { persistSession: false, autoRefreshToken: false },
  });

  // Mints (and, near expiry, refreshes) the bulk-generate-documents-worker
  // system account's own session — see get/set_bulk_generate_system_session
  // in the DB and the bootstrap-bulk-generate-system-account provisioning
  // function. Session is shared across every concurrent invocation of this
  // worker (any job), so a refresh is only attempted when genuinely near
  // expiry; if that refresh loses a race to another concurrent invocation
  // already refreshing (Supabase rotates refresh tokens on use), we re-read
  // once and use whatever that concurrent winner just stored instead of
  // failing the whole run.
  type SystemSession = { access_token: string; refresh_token: string; expires_at: string };

  function sessionNearExpiry(s: SystemSession | null): boolean {
    if (!s) return true;
    return new Date(s.expires_at).getTime() - Date.now() < SYSTEM_SESSION_SAFETY_MARGIN_MS;
  }

  async function readSystemSession(): Promise<SystemSession | null> {
    const { data: raw, error } = await supabaseService.rpc('get_bulk_generate_system_session');
    if (error) throw new Error(`get_bulk_generate_system_session failed: ${error.message}`);
    if (!raw) return null;
    return JSON.parse(raw as string) as SystemSession;
  }

  async function getSystemAuthHeader(): Promise<string> {
    let session = await readSystemSession();
    if (sessionNearExpiry(session)) {
      if (!session?.refresh_token) {
        throw new Error('bulk-generate system account session not provisioned');
      }
      const refreshClient = createClient(SUPABASE_URL, SUPABASE_ANON_KEY, {
        auth: { persistSession: false, autoRefreshToken: false },
      });
      const { data: refreshed, error: refreshErr } = await refreshClient.auth.refreshSession({
        refresh_token: session.refresh_token,
      });
      if (refreshErr || !refreshed?.session) {
        // Likely lost a refresh race to a concurrent invocation. Re-read
        // once — if the concurrent winner already refreshed it, use that.
        const retrySession = await readSystemSession();
        if (sessionNearExpiry(retrySession)) {
          throw new Error(`system account session refresh failed: ${refreshErr?.message ?? 'unknown'}`);
        }
        session = retrySession;
      } else {
        session = {
          access_token: refreshed.session.access_token,
          refresh_token: refreshed.session.refresh_token,
          expires_at: new Date(refreshed.session.expires_at! * 1000).toISOString(),
        };
        const { error: setErr } = await supabaseService.rpc('set_bulk_generate_system_session', {
          p_session: JSON.stringify(session),
        });
        if (setErr) console.error('[worker] set_bulk_generate_system_session failed', setErr);
      }
    }
    return `Bearer ${session!.access_token}`;
  }

  // callerToken is intentionally not validated against Supabase Auth (no
  // getUser call) — see the Auth model header comment. Everything below
  // authenticates as the system account instead.
  let systemAuthHeader: string;
  try {
    systemAuthHeader = await getSystemAuthHeader();
  } catch (e) {
    console.error('[worker] system account auth unavailable', e);
    await stallAndRelease('system_account_auth_failed');
    return json(req, { worker_id: WORKER_ID, processed: 0, stalled: true });
  }

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
    //    Uses the system account's auth (staff-gated, same as provision/verify).
    let shared: 'ok' | 'missing' | 'unconfigured' | 'error';
    let governance: 'ok' | 'missing' | 'unconfigured' | 'error';
    let livenessError: string | null = null;
    try {
      const resp = await fetch(livenessUrl, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Authorization: systemAuthHeader,
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
          Authorization: systemAuthHeader,
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
          Authorization: systemAuthHeader,
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

    // Anon-key client authenticated as the system account, so auth.uid()
    // resolves to a real staff-equivalent user — the RPC raises
    // insufficient_privilege under service_role (auth.uid() IS NULL).
    const supabaseSystem = createClient(SUPABASE_URL, SUPABASE_ANON_KEY, {
      global: { headers: { Authorization: systemAuthHeader } },
      auth: { persistSession: false, autoRefreshToken: false },
    });

    for (const pi of instances ?? []) {
      const { error: rErr } = await supabaseSystem.rpc('repair_package_instance_stages', {
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

  // Alert the job's creator (in-app notification + email) that their job
  // stalled and needs a manual retry. Called only on a genuine
  // running→stalled transition — see stallAndRelease below.
  async function notifyJobStalled(reason: string): Promise<void> {
    try {
      const { data: jobRow } = await supabaseService
        .from('bulk_document_jobs')
        .select('created_by')
        .eq('id', jobId)
        .maybeSingle();
      const creatorId = jobRow?.created_by as string | undefined;
      if (!creatorId) return;

      const { data: creator } = await supabaseService
        .from('users')
        .select('email, first_name')
        .eq('user_uuid', creatorId)
        .maybeSingle();

      const reasonLabel = stallReasonLabel(reason);
      const jobUrl = appUrl(`/manage-documents/bulk-jobs/${jobId}`);

      const { error: notifErr } = await supabaseService.from('user_notifications').insert({
        user_id: creatorId,
        type: 'bulk_job_stalled',
        title: 'Bulk generation job stalled',
        message: `Your bulk document generation job stalled (${reasonLabel}) and needs a manual retry.`,
        link: `/manage-documents/bulk-jobs/${jobId}`,
        source_id: jobId,
      });
      if (notifErr) console.error('[worker] notifyJobStalled insert error', notifErr);

      if (creator?.email) {
        const html = buildStalledJobEmailHtml({
          recipientName: creator.first_name || 'there',
          reasonLabel,
          jobUrl,
        });
        await sendMailgun(
          creator.email,
          'Your bulk generation job stalled and needs a retry',
          html,
        );
      }
    } catch (e) {
      console.error('[worker] notifyJobStalled error', e);
    }
  }

  async function stallAndRelease(reason: string): Promise<void> {
    console.warn(`[worker] stalling job=${jobId} reason=${reason}`);
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
    const { data: stallData, error: stallErr } = await supabaseService.rpc(
      'stall_bulk_document_job',
      { p_job_id: jobId, p_reason: reason },
    );
    if (stallErr) console.error('[worker] stall_bulk_document_job error', stallErr);
    // Only alert on a genuine running→stalled transition (RPC returns false
    // for a no-op, e.g. the job was already stalled) so a retried job that
    // stalls again correctly re-notifies, but redundant calls don't spam.
    if (stallData === true) await notifyJobStalled(reason);
  }

  // ── Main loop ──────────────────────────────────────────────────────────
  let processed = 0;
  let timedOut = false;

  while (Date.now() - startedAt < TIME_BUDGET_MS) {
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
            Authorization: systemAuthHeader,
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
          await record(item.id, 'failed', 'auth_expired', { http_status: 401 }, t || 'System account session invalid or expired', 'auth_expired');
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
  return json(req, { worker_id: WORKER_ID, processed, timed_out: timedOut, remaining });
});
