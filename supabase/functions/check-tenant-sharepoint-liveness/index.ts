// check-tenant-sharepoint-liveness
//
// For each tenant, resolve a single four-state enum for shared/governance
// SharePoint folders by combining the recorded DB flags with a live Graph
// GET on the recorded drive/item ids.
//
// Returned per-folder state (source of truth — do NOT derive elsewhere):
//   'ok'            live in Graph now
//   'missing'       DB flag says provisioned, Graph returned 404/410
//   'unconfigured'  no drive_id / item_id recorded yet
//   'error'         Graph returned another non-200 status or the call threw
//
// Auth:        internal Vivacity staff only (RPC is_vivacity_internal_safe).
// Concurrency: at most CONCURRENCY Graph calls in flight across the batch.
// Cap:         at most MAX_TENANTS tenants per request.

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

type FolderState = 'ok' | 'missing' | 'unconfigured' | 'error';

type TenantLiveness = {
  tenant_id: number;
  shared: FolderState;
  governance: FolderState;
  error: string | null;
};

function json(body: unknown, status = 200): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: { ...corsHeaders, 'Content-Type': 'application/json' },
  });
}

/**
 * Live verification of a single (drive, item) — returns the enum branch
 * we should assign to the folder given a successful DB-flag precondition.
 *   200         → 'ok'
 *   404 / 410   → 'missing'
 *   other       → 'error' (with a tag for logs)
 */
async function verifyDriveItem(
  driveId: string,
  itemId: string,
): Promise<{ state: 'ok' | 'missing' | 'error'; detail?: string }> {
  try {
    const resp = await graphGet(
      `/drives/${encodeURIComponent(driveId)}/items/${encodeURIComponent(itemId)}?$select=id`,
    );
    if (resp.status === 200) return { state: 'ok' };
    if (resp.status === 404 || resp.status === 410) {
      return { state: 'missing', detail: `graph_${resp.status}` };
    }
    return { state: 'error', detail: `graph_${resp.status}` };
  } catch (e) {
    return { state: 'error', detail: (e as Error).message.slice(0, 200) };
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

  // Staff gate — is_vivacity_internal_safe under the caller's JWT.
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
      'tenant_id, drive_id, shared_folder_item_id, governance_drive_id, governance_folder_item_id, provisioning_status, validation_status',
    )
    .in('tenant_id', parsed.tenant_ids);

  if (sErr) {
    return json({ error: 'Failed to read settings', details: sErr.message }, 500);
  }

  type SRow = {
    tenant_id: number;
    drive_id: string | null;
    shared_folder_item_id: string | null;
    governance_drive_id: string | null;
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

      // No settings row at all → both folders unconfigured.
      if (!row) {
        return {
          tenant_id: tenantId,
          shared: 'unconfigured',
          governance: 'unconfigured',
          error: null,
        };
      }

      // has_X mirrors the worker's provisioning predicate. Only when the DB
      // flag says "provisioned" AND an item_id is recorded do we spend a
      // Graph call — otherwise it's unconfigured.
      const has_shared =
        !!row.drive_id &&
        !!row.shared_folder_item_id &&
        (row.provisioning_status === 'success' ||
          row.validation_status === 'valid');
      // Governance folder lives on a DIFFERENT SharePoint site with its own
      // drive_id (governance_drive_id). If the item is recorded but the
      // governance drive is not, treat as 'unconfigured' — the row is
      // incomplete (legacy) but the item was recorded by an older provisioner.
      const has_governance =
        !!row.governance_drive_id && !!row.governance_folder_item_id;

      const errs: string[] = [];

      let shared: FolderState;
      if (!has_shared) {
        shared = 'unconfigured';
      } else {
        const r = await verifyDriveItem(row.drive_id!, row.shared_folder_item_id!);
        shared = r.state;
        if (r.state === 'error' && r.detail) errs.push(`shared:${r.detail}`);
      }

      let governance: FolderState;
      if (!has_governance) {
        governance = 'unconfigured';
      } else {
        const r = await verifyDriveItem(
          row.governance_drive_id!,
          row.governance_folder_item_id!,
        );
        governance = r.state;
        if (r.state === 'error' && r.detail) errs.push(`governance:${r.detail}`);
      }

      return {
        tenant_id: tenantId,
        shared,
        governance,
        error: errs.length ? errs.join('; ') : null,
      };
    },
  );

  return json({ results });
});
