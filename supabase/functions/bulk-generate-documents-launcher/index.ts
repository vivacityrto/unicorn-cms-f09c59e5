// bulk-generate-documents-launcher
//
// Thin authenticated forwarder over the PR-C RPCs
// (create_bulk_document_job / preview_bulk_document_job / cancel_bulk_document_job).
// The permission gate (is_vivacity_internal_safe for create/preview, and a
// composite v_creator/check_permission gate for cancel) lives inside those
// RPCs, so this function does NOT add its own permission check — it just
// forwards the caller's JWT through.
//
// SAFETY NOTE (do not remove):
//   cancel_bulk_document_job MUST always run under a real staff JWT — never
//   service_role — because its permission gate reads:
//
//       IF v_creator <> v_user_id AND NOT public.check_permission(...) THEN
//         RAISE EXCEPTION ...
//
//   Under service_role, auth.uid() is NULL, so v_creator <> NULL evaluates to
//   NULL, PL/pgSQL treats a NULL IF condition as false, and the gate silently
//   no-ops. Never route cancel through service_role, even from cron.
//
// On 'create', this function fires an initial fire-and-forget invocation of
// bulk-generate-documents-worker with the caller's Authorization header so
// the job starts draining immediately without waiting for a cron tick.

import { createClient } from 'https://esm.sh/@supabase/supabase-js@2';
import { z } from 'https://esm.sh/zod@3.23.8';
import { corsHeaders } from "../_shared/cors.ts";

const SUPABASE_URL = Deno.env.get('SUPABASE_URL')!;
const SUPABASE_ANON_KEY = Deno.env.get('SUPABASE_ANON_KEY')!;

const SelectionSchema = z.object({
  tenant_id: z.number().int().positive(),
  package_id: z.number().int().positive(),
  stage_ids: z.array(z.number().int().positive()).min(1),
});

const BodySchema = z.object({
  action: z.enum(['create', 'preview', 'cancel', 'create_targeted', 'preview_targeted', 'retry', 'skip_items', 'create_delivery']),
  scope: z.enum(['all', 'selected']).optional(),
  tenant_ids: z.array(z.number().int().positive()).optional().nullable(),
  package_ids: z.array(z.number().int().positive()).optional().nullable(),
  stage_ids: z.array(z.number().int().positive()).optional().nullable(),
  document_ids: z.array(z.number().int().positive()).optional().nullable(),
  selections: z.array(SelectionSchema).optional().nullable(),
  job_id: z.string().uuid().optional(),
  reason: z.string().max(500).optional().nullable(),
  item_ids: z.array(z.number().int().positive()).optional().nullable(),
  document_id: z.number().int().positive().optional(),
  document_version_id: z.string().uuid().optional(),
  snapshot_ids: z.record(z.string(), z.string().uuid()).optional().nullable(),
  allow_incomplete_tenant_ids: z.array(z.number().int().positive()).optional().nullable(),
});

function kickoffWorker(jobId: string, authHeader: string) {
  // Fire-and-forget. Anon key satisfies the platform JWT verification;
  // x-caller-authorization carries the real staff JWT to the worker for its
  // internal downstream calls (this is the pattern the simple-path 'create'
  // action has always used successfully).
  const workerUrl = `${SUPABASE_URL}/functions/v1/bulk-generate-documents-worker`;
  fetch(workerUrl, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'x-caller-authorization': authHeader,
      Authorization: `Bearer ${SUPABASE_ANON_KEY}`,
    },
    body: JSON.stringify({ job_id: jobId }),
  }).catch((e) => console.error('[launcher] worker fire-and-forget failed (job still created)', e));
}

function json(req: Request, body: unknown, status = 200): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: { ...corsHeaders(req), 'Content-Type': 'application/json' },
  });
}

Deno.serve(async (req: Request) => {
  if (req.method === 'OPTIONS') return new Response(null, { headers: corsHeaders(req) });
  if (req.method !== 'POST') return json(req, { error: 'Method not allowed' }, 405);

  const authHeader = req.headers.get('Authorization');
  if (!authHeader?.startsWith('Bearer ')) {
    return json(req, { error: 'Unauthorized', details: 'Missing bearer token' }, 401);
  }

  let parsed: z.infer<typeof BodySchema>;
  try {
    const raw = await req.json();
    const result = BodySchema.safeParse(raw);
    if (!result.success) {
      return json(req, { error: 'Invalid body', details: result.error.flatten() }, 400);
    }
    parsed = result.data;
  } catch {
    return json(req, { error: 'Invalid JSON body' }, 400);
  }

  // Anon-key client with the caller's Authorization propagated, so every RPC
  // executes as the caller and auth.uid() resolves to the real staff user.
  const supabase = createClient(SUPABASE_URL, SUPABASE_ANON_KEY, {
    global: { headers: { Authorization: authHeader } },
    auth: { persistSession: false, autoRefreshToken: false },
  });

  try {
    if (parsed.action === 'create') {
      if (!parsed.scope) return json(req, { error: 'scope is required for create' }, 400);
      const { data, error } = await supabase.rpc('create_bulk_document_job', {
        p_scope: parsed.scope,
        p_tenant_ids: parsed.tenant_ids ?? null,
        p_package_ids: parsed.package_ids ?? null,
        p_stage_ids: parsed.stage_ids ?? null,
        p_document_ids: parsed.document_ids ?? null,
      });
      if (error) {
        console.error('[launcher] create_bulk_document_job error', error);
        return json(req, { error: 'create_failed', status: error.code, details: error.message }, 400);
      }
      const jobId = data as string;
      kickoffWorker(jobId, authHeader);
      return json(req, { job_id: jobId });
    }

    if (parsed.action === 'preview') {
      if (!parsed.scope) return json(req, { error: 'scope is required for preview' }, 400);
      const { data, error } = await supabase.rpc('preview_bulk_document_job', {
        p_scope: parsed.scope,
        p_tenant_ids: parsed.tenant_ids ?? null,
        p_package_ids: parsed.package_ids ?? null,
        p_stage_ids: parsed.stage_ids ?? null,
        p_document_ids: parsed.document_ids ?? null,
      });
      if (error) {
        console.error('[launcher] preview_bulk_document_job error', error);
        return json(req, { error: 'preview_failed', status: error.code, details: error.message }, 400);
      }
      const row = Array.isArray(data) ? data[0] ?? null : data;
      return json(req, row);
    }

    if (parsed.action === 'create_targeted') {
      if (!parsed.selections || parsed.selections.length === 0) {
        return json(req, { error: 'selections is required for create_targeted' }, 400);
      }
      const { data, error } = await supabase.rpc('create_targeted_bulk_document_job', {
        p_selections: parsed.selections as unknown as never,
        p_document_ids: parsed.document_ids ?? undefined,
      });
      if (error) {
        console.error('[launcher] create_targeted_bulk_document_job error', error);
        return json(req, { error: 'create_targeted_failed', status: error.code, details: error.message }, 400);
      }
      const jobId = data as string;
      kickoffWorker(jobId, authHeader);
      return json(req, { job_id: jobId });
    }

    if (parsed.action === 'create_delivery') {
      if (!parsed.document_id) return json(req, { error: 'document_id is required for create_delivery' }, 400);
      if (!parsed.document_version_id) return json(req, { error: 'document_version_id is required for create_delivery' }, 400);
      if (!parsed.tenant_ids || parsed.tenant_ids.length === 0) {
        return json(req, { error: 'tenant_ids is required for create_delivery' }, 400);
      }
      const { data, error } = await supabase.rpc('create_document_delivery_job', {
        p_document_id: parsed.document_id,
        p_document_version_id: parsed.document_version_id,
        p_tenant_ids: parsed.tenant_ids,
        p_snapshot_ids: (parsed.snapshot_ids ?? {}) as unknown as never,
        p_allow_incomplete_tenant_ids: parsed.allow_incomplete_tenant_ids ?? [],
      });
      if (error) {
        console.error('[launcher] create_document_delivery_job error', error);
        return json(req, { error: 'create_delivery_failed', status: error.code, details: error.message }, 400);
      }
      const jobId = data as string;
      kickoffWorker(jobId, authHeader);
      return json(req, { job_id: jobId });
    }

    if (parsed.action === 'preview_targeted') {
      if (!parsed.selections || parsed.selections.length === 0) {
        return json(req, { error: 'selections is required for preview_targeted' }, 400);
      }
      const { data, error } = await supabase.rpc('preview_targeted_bulk_document_job', {
        p_selections: parsed.selections as unknown as never,
        p_document_ids: parsed.document_ids ?? undefined,
      });
      if (error) {
        console.error('[launcher] preview_targeted_bulk_document_job error', error);
        return json(req, { error: 'preview_targeted_failed', status: error.code, details: error.message }, 400);
      }
      const row = Array.isArray(data) ? data[0] ?? null : data;
      return json(req, row);
    }

    if (parsed.action === 'cancel') {
      if (!parsed.job_id) return json(req, { error: 'job_id is required for cancel' }, 400);
      // NOTE: cancel_bulk_document_job MUST run under the caller JWT (see
      // header comment) — never service_role.
      const { data, error } = await supabase.rpc('cancel_bulk_document_job', {
        p_job_id: parsed.job_id,
        p_reason: parsed.reason ?? null,
      });
      if (error) {
        console.error('[launcher] cancel_bulk_document_job error', error);
        return json(req, { error: 'cancel_failed', status: error.code, details: error.message }, 400);
      }
      return json(req, { ok: true, result: data });
    }

    if (parsed.action === 'retry') {
      if (!parsed.job_id) return json(req, { error: 'job_id is required for retry' }, 400);
      // retry_bulk_document_job's gate reads auth.uid(); must run under caller JWT.
      const { error } = await supabase.rpc('retry_bulk_document_job', {
        p_job_id: parsed.job_id,
      });
      if (error) {
        console.error('[launcher] retry_bulk_document_job error', error);
        return json(req, { error: 'retry_failed', status: error.code, details: error.message }, 400);
      }
      // Fresh caller JWT — kick worker off immediately with the current token.
      kickoffWorker(parsed.job_id, authHeader);
      return json(req, { ok: true, job_id: parsed.job_id });
    }

    if (parsed.action === 'skip_items') {
      if (!parsed.job_id) return json(req, { error: 'job_id is required for skip_items' }, 400);
      if (!parsed.item_ids || parsed.item_ids.length === 0) {
        return json(req, { error: 'item_ids is required for skip_items' }, 400);
      }
      // skip_bulk_document_job_items's gate reads auth.uid(); must run under caller JWT.
      const { data, error } = await supabase.rpc('skip_bulk_document_job_items', {
        p_job_id: parsed.job_id,
        p_item_ids: parsed.item_ids,
      });
      if (error) {
        console.error('[launcher] skip_bulk_document_job_items error', error);
        return json(req, { error: 'skip_items_failed', status: error.code, details: error.message }, 400);
      }
      return json(req, { ok: true, moved: (data as number) ?? 0 });
    }

    return json(req, { error: 'unknown action' }, 400);
  } catch (e) {
    console.error('[launcher] unexpected error', e);
    return json(req, { error: 'internal_error', details: (e as Error)?.message ?? String(e) }, 500);
  }
});
