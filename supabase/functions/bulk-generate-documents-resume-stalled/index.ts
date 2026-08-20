// bulk-generate-documents-resume-stalled
//
// Resilience backstop for bulk-generate-documents-worker's self-reinvoke
// chain. The worker keeps a job moving by re-invoking its own edge function
// after each ~50s batch; if that re-invoke fetch is ever rejected the chain
// dies and the job just sits 'running' with no further progress until the
// 120-minute reclaim_stale_bulk_document_locks watchdog eventually flags it
// 'stalled' for a human to notice and click Retry.
//
// Confirmed live on job 85e00e30 (2026-08-19): BOTH its first stall (03:00
// UTC, before the EdgeRuntime.waitUntil fix) and its second (07:06 UTC,
// after that fix was already live) were a 503
// SUPABASE_EDGE_RUNTIME_SERVICE_DEGRADED on this exact self-reinvoke fetch --
// a recurring transient condition on this Supabase project, not a one-off.
//
// This function runs on a short cron interval (every 2 minutes — see
// migration 20260819234500_bulk_generate_stall_resilience.sql) and
// re-invokes the worker directly for any 'running' job that still has
// pending/leased items but has shown no item activity in the last few
// minutes (list_idle_running_bulk_document_jobs), recovering a dead chain
// within a couple of minutes instead of requiring a human to notice.
// Complements (does not replace) the worker's own inline retry/backoff on a
// rejected self-reinvoke — that handles a short blip immediately; this cron
// catches anything that still falls through (e.g. the whole
// waitUntil-tracked continuation never running at all).
//
// Cron-only: gated via the standard pg_cron auth helper (_shared/cron-auth.ts).

import { createClient } from 'https://esm.sh/@supabase/supabase-js@2';
import { corsHeaders } from '../_shared/cors.ts';
import { isCronAuthorized, cronUnauthorizedResponse } from '../_shared/cron-auth.ts';

const SUPABASE_URL = Deno.env.get('SUPABASE_URL')!;
const SUPABASE_SERVICE_ROLE_KEY = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!;
const WORKER_SECRET = Deno.env.get('BULK_DOCUMENT_WORKER_SECRET') ?? '';
const IDLE_MINUTES = 3;

function json(req: Request, body: unknown, status = 200): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: { ...corsHeaders(req), 'Content-Type': 'application/json' },
  });
}

Deno.serve(async (req: Request) => {
  if (req.method === 'OPTIONS') return new Response(null, { headers: corsHeaders(req) });

  if (!(await isCronAuthorized(req))) {
    return cronUnauthorizedResponse(req, corsHeaders);
  }

  const admin = createClient(SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY, {
    auth: { persistSession: false, autoRefreshToken: false },
  });

  const { data: idleJobs, error } = await admin.rpc('list_idle_running_bulk_document_jobs', {
    p_idle_minutes: IDLE_MINUTES,
  });
  if (error) {
    console.error('[resume-stalled] list_idle_running_bulk_document_jobs error', error);
    return json(req, { error: error.message }, 500);
  }

  const jobIds = ((idleJobs ?? []) as Array<{ job_id: string }>).map((r) => r.job_id);
  if (jobIds.length === 0) {
    return json(req, { checked: 0, resumed: [] });
  }

  const workerUrl = `${SUPABASE_URL}/functions/v1/bulk-generate-documents-worker`;

  const results = await Promise.allSettled(
    jobIds.map(async (jobId) => {
      const resp = await fetch(workerUrl, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          // Structurally-present-only per the worker's auth model — not
          // validated against Supabase Auth, not used to authenticate any
          // downstream call (see worker's own "Auth model" doc comment).
          'x-caller-authorization': `Bearer ${SUPABASE_SERVICE_ROLE_KEY}`,
          'x-worker-secret': WORKER_SECRET,
          Authorization: `Bearer ${SUPABASE_SERVICE_ROLE_KEY}`,
        },
        body: JSON.stringify({ job_id: jobId }),
      });
      if (!resp.ok) {
        const text = await resp.text().catch(() => '');
        console.error(`[resume-stalled] resume rejected job=${jobId} status=${resp.status}`, text);
      } else {
        console.log(`[resume-stalled] resumed job=${jobId}`);
      }
      return { jobId, ok: resp.ok, status: resp.status };
    }),
  );

  return json(req, {
    checked: jobIds.length,
    resumed: results.map((r) =>
      r.status === 'fulfilled' ? r.value : { error: String(r.reason) },
    ),
  });
});
