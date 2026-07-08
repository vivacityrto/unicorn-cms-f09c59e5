// check-tenant-sharepoint-liveness
//
// For each tenant, verify (a) the DB flags on tenant_sharepoint_settings
// (matching the worker's provisioning predicate) and (b) that the recorded
// drive/folder items are still resolvable in Microsoft Graph right now.
//
// This is the pre-flight "liveness" check surfaced in the targeted bulk-
// generate mission-control page. It is NOT a substitute for the worker's
// own bootstrap — the worker still auto-provisions if flags say so. The
// point here is to catch tenants whose folder link has been deleted /
// moved / lost permissions since it was recorded.
//
// Auth: internal Vivacity staff only (RPC public.is_vivacity_internal_safe).
// Concurrency: at most CONCURRENCY Graph calls in flight across the batch.
// Cap: at most 200 tenants per request (matches page ceiling).

import { createClient } from 'https://esm.sh/@supabase/supabase-js@2.81.1';
import { z } from 'https://esm.sh/zod@3.23.8';
import { graphGet } from '../_shared/graph-app-client.ts';

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers':
    'authorization, x-client-info, apikey, content-type, x-supabase-client-platform, x-supabase-client-platform-version, x-supabase-client-runtime, x-supabase-client-runtime-version',
  'Access-Control-Allow-Methods': 'POST, OPTIONS',
};

const SUPABASE_URL = Deno.env.get('SUPABASE_URL')!;
const SUPABASE_ANON_KEY = Deno.env.get('SUPABASE_ANON_KEY')!;
const SUPABASE_SERVICE_ROLE_KEY = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!;

const CONCURRENCY = 8;
const MAX_TENANTS = 200;

const BodySchema = z.object({
  tenant_ids: z.array(z.number().int().positive()).max(MAX_TENANTS),
});

type TenantLiveness = {
  tenant_id: number;
  has_shared: boolean;
  has_governance: boolean;
  shared_live: boolean | null;
  governance_live: boolean | null;
  fully_live: boolean;
  error: string | null;
};

function json(body: unknown, status = 200): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: { ...corsHeaders, 'Content-Type': 'application/json' },
  });
}

async function verifyDriveItem(
  driveId: string,
  itemId: string,
): Promise<{ ok: boolean; error?: string }> {
  try {
    const resp = await graphGet(
      `/drives/${encodeURIComponent(driveId)}/items/${encodeURIComponent(itemId)}?$select=id`,
    );
    if (resp.status === 200) return { ok: true };
    if (resp.status === 404 || resp.status === 410) {
      return { ok: false, error: `not_found_${resp.status}` };
    }
    return { ok: false, error: `graph_${resp.status}` };
  } catch (e) {
    return { ok: false, error: (e as Error).message.slice(0, 200) };
  }
}

async function pMapLimit<T, R>(
  items: T[],
  limit: number,
  fn: (item: T) => Promise<R>,
): Promise<R[]> {
  const results: R[] = new Array(items.length);
  let i = 0;
  const workers = Array.from({ length: Math.min(limit, items.length) }, async () => {
    while (true) {
      const idx = i++;
      if (idx >= items.length) return;
      results[idx] = await fn(items[idx]);
    }
  });
  await Promise.all(workers);
  return results;
}

Deno.serve(async (req: Request) => {
  if (req.method === 'OPTIONS') return new Response(null, { headers: corsHeaders });
  if (req.method !== 'POST') return json({ error: 'Method not allowed' }, 405);

  const authHeader = req.headers.get('Authorization');
  if (!authHeader?.startsWith('Bearer ')) {
    return json({ error: 'Unauthorized', details: 'Missing bearer token' }, 401);
  }

  let parsed: z.infer<typeof BodySchema>;
  try {
    const raw = await req.json();
    const result = BodySchema.safeParse(raw);
    if (!result.success) {
      return json({ error: 'Invalid body', details: result.error.flatten() }, 400);
    }
    parsed = result.data;
  } catch {
    return json({ error: 'Invalid JSON body' }, 400);
  }

  // Staff gate — call is_vivacity_internal_safe under the caller's JWT.
  const supabaseAsCaller = createClient(SUPABASE_URL, SUPABASE_ANON_KEY, {
    global: { headers: { Authorization: authHeader } },
  });
  const { data: userData, error: userErr } = await supabaseAsCaller.auth.getUser();
  if (userErr || !userData?.user) {
    return json({ error: 'Unauthorized', details: 'Invalid token' }, 401);
  }
  const { data: isStaff, error: gateErr } = await supabaseAsCaller.rpc(
    'is_vivacity_internal_safe',
    { p_user_id: userData.user.id },
  );
  if (gateErr) {
    return json({ error: 'Permission check failed', details: gateErr.message }, 500);
  }
  if (!isStaff) {
    return json({ error: 'Forbidden', details: 'Internal staff only' }, 403);
  }

  if (parsed.tenant_ids.length === 0) {
    return json({ results: [] });
  }

  // Service-role read of tenant_sharepoint_settings — small, no side effects.
  const supabaseService = createClient(SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY);
  const { data: settingsRows, error: sErr } = await supabaseService
    .from('tenant_sharepoint_settings')
    .select(
      'tenant_id, drive_id, shared_folder_item_id, governance_folder_item_id, provisioning_status, validation_status',
    )
    .in('tenant_id', parsed.tenant_ids);

  if (sErr) {
    return json({ error: 'Failed to read settings', details: sErr.message }, 500);
  }

  type SRow = {
    tenant_id: number;
    drive_id: string | null;
    shared_folder_item_id: string | null;
    governance_folder_item_id: string | null;
    provisioning_status: string | null;
    validation_status: string | null;
  };
  const byTenant = new Map<number, SRow>();
  for (const row of (settingsRows ?? []) as SRow[]) {
    byTenant.set(row.tenant_id, row);
  }

  const results = await pMapLimit<number, TenantLiveness>(
    parsed.tenant_ids,
    CONCURRENCY,
    async (tenantId) => {
      const row = byTenant.get(tenantId);
      const has_shared =
        !!row &&
        (row.provisioning_status === 'success' || row.validation_status === 'valid');
      const has_governance = !!row?.governance_folder_item_id;

      if (!row || !row.drive_id) {
        return {
          tenant_id: tenantId,
          has_shared,
          has_governance,
          shared_live: null,
          governance_live: null,
          fully_live: false,
          error: row ? 'missing_drive_id' : 'no_settings_row',
        };
      }

      let shared_live: boolean | null = null;
      let governance_live: boolean | null = null;
      const errs: string[] = [];

      if (row.shared_folder_item_id) {
        const r = await verifyDriveItem(row.drive_id, row.shared_folder_item_id);
        shared_live = r.ok;
        if (!r.ok && r.error) errs.push(`shared:${r.error}`);
      } else {
        shared_live = false;
      }

      if (row.governance_folder_item_id) {
        const r = await verifyDriveItem(row.drive_id, row.governance_folder_item_id);
        governance_live = r.ok;
        if (!r.ok && r.error) errs.push(`governance:${r.error}`);
      } else {
        governance_live = false;
      }

      return {
        tenant_id: tenantId,
        has_shared,
        has_governance,
        shared_live,
        governance_live,
        fully_live: shared_live === true && governance_live === true,
        error: errs.length ? errs.join('; ') : null,
      };
    },
  );

  return json({ results });
});
