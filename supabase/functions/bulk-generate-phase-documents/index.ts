import { corsHeaders } from '../_shared/cors.ts';
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2.81.1';
import { requireCaller, FeatureKeys, allowTenantMember } from '../_shared/requireCaller.ts';

const supabaseUrl = Deno.env.get('SUPABASE_URL') as string;
const supabaseServiceKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY') as string;

interface BulkGenerateRequest {
  tenant_id: number;
  stageinstance_id: number;
  package_id?: number;
  mode: 'all' | 'pending_only' | 'overwrite_all';
  plan_only?: boolean;
  record_audit?: boolean;
  // record_audit payload fields
  total?: number;
  generated?: number;
  skipped?: number;
  failed?: number;
  results?: BulkResult[];
}

type ResultStatus = 'generated' | 'skipped' | 'failed';
type ResultReason =
  | 'unsupported_format'
  | 'no_template'
  | 'already_generated'
  | 'tailoring_incomplete'
  | 'locked'
  | 'delivery_failed'
  | 'no_published_version'
  | 'delivered'
  | 'cancelled';

interface BulkResult {
  document_instance_id: number;
  document_id: number;
  document_title: string;
  status: ResultStatus;
  reason: ResultReason;
  error?: string;
}

interface PlanItem {
  document_instance_id: number;
  document_id: number;
  document_version_id: string;
  document_title: string;
}

const SUPPORTED_FORMATS = new Set(['docx', 'xlsx', 'xls', 'xlsm', 'pptx']);

function jsonResponse(req: Request, body: unknown, status = 200) {
  return new Response(JSON.stringify(body), {
    headers: { ...corsHeaders(req), 'Content-Type': 'application/json' },
    status,
  });
}

Deno.serve(async (req: Request) => {
  if (req.method === 'OPTIONS') {
    return new Response(null, { headers: corsHeaders(req) });
  }

  try {
    const supabase = createClient(supabaseUrl, supabaseServiceKey);

    const body: BulkGenerateRequest = await req.json();
    const {
      tenant_id,
      stageinstance_id,
      package_id,
      mode = 'pending_only',
      plan_only = false,
      record_audit = false,
    } = body;

    const caller = await requireCaller(req, supabase, {
      featureKey: FeatureKeys.staffDocumentsGenerate,
      headers: corsHeaders(req),
      unauthorizedMessage: 'Missing authorization header',
      forbiddenMessage: 'Access denied',
      orAllow: ({ userId, admin }) => allowTenantMember(admin, userId, tenant_id),
    });
    if (!caller.ok) return caller.response;
    const user = caller.user;

    console.log('[bulk-gen] request', { tenant_id, stageinstance_id, package_id, mode, plan_only, record_audit, user: user.id });

    // ── record_audit: write the bulk-run summary row and return ──────────
    if (record_audit) {
      const total = body.total ?? 0;
      const generated = body.generated ?? 0;
      const skipped = body.skipped ?? 0;
      const failed = body.failed ?? 0;
      const results = body.results ?? [];

      await supabase.from('audit_events').insert({
        action: 'bulk_generate_phase_documents',
        entity: 'bulk_generate',
        entity_id: crypto.randomUUID(),
        user_id: user.id,
        details: {
          tenant_id,
          stageinstance_id,
          package_id: package_id ?? null,
          mode,
          total,
          generated,
          skipped,
          failed,
          results,
          source: 'frontend_orchestrated',
        },
      });

      return jsonResponse(req, { success: true });
    }

    // ── Pre-flight: SharePoint governance folder must be mapped ──────────
    const { data: spSettings } = await supabase
      .from('tenant_sharepoint_settings')
      .select('governance_drive_id, governance_folder_item_id, drive_id, shared_folder_item_id')
      .eq('tenant_id', tenant_id)
      .maybeSingle();

    if (!spSettings?.governance_drive_id || !spSettings?.governance_folder_item_id) {
      return jsonResponse(req, {
        success: false,
        error: 'No governance folder configured for this tenant. Please verify the governance folder from the SharePoint Folder Mapping page (Admin → SharePoint Folder Mapping) before generating documents.',
        error_code: 'GOVERNANCE_FOLDER_MISSING',
      }, 400);
    }

    if (!spSettings?.drive_id || !spSettings?.shared_folder_item_id) {
      return jsonResponse(req, {
        success: false,
        error: 'No shared folder configured for this tenant. Please configure the Shared Folder in Admin → Integrations → SharePoint before generating documents.',
        error_code: 'SHARED_FOLDER_MISSING',
      }, 400);
    }

    // ── Rate limit: 1 bulk gen per tenant per 5 min ──────────────────────
    if (!plan_only) {
      const fiveMinAgo = new Date(Date.now() - 5 * 60 * 1000).toISOString();
      const { data: recentBulk, error: recentBulkErr } = await supabase
        .from('audit_events')
        .select('id')
        .eq('entity', 'bulk_generate')
        .eq('action', 'bulk_generate_phase_documents')
        .eq('details->>tenant_id', String(tenant_id))
        .gte('created_at', fiveMinAgo)
        .limit(1);

      if (recentBulkErr) {
        console.error('[bulk-gen] rate-limit lookup failed', recentBulkErr);
        // fail-closed: don't let a broken filter silently disable the guard
        return jsonResponse(req, { success: false, error: 'Rate limit check failed' }, 500);
      }

      if (recentBulk && recentBulk.length > 0) {
        return jsonResponse(req, {
          success: false,
          error: 'Rate limited. Please wait 5 minutes between bulk generations.'
        }, 429);
      }
    }

    // ── Fetch document_instances for this stage instance ─────────────────
    const { data: instances, error: instError } = await supabase
      .from('document_instances')
      .select('id, document_id, isgenerated, status')
      .eq('stageinstance_id', stageinstance_id)
      .eq('tenant_id', tenant_id);

    if (instError) throw instError;
    if (!instances || instances.length === 0) {
      if (plan_only) {
        return jsonResponse(req, { success: true, plan: [], total_eligible: 0, skipped: [] });
      }
      return jsonResponse(req, { success: true, total: 0, generated: 0, skipped: 0, failed: 0, results: [] });
    }

    // ── Fetch document metadata ──────────────────────────────────────────
    const docIds = [...new Set(instances.map(i => i.document_id))];
    const { data: docs } = await supabase
      .from('documents')
      .select('id, title, format, source_template_url')
      .in('id', docIds);

    const docMap = new Map((docs || []).map(d => [d.id, d]));

    // ── Pre-filter with stable reason codes ──────────────────────────────
    const results: BulkResult[] = [];
    const eligible: { inst: typeof instances[number]; doc: NonNullable<ReturnType<typeof docMap.get>> }[] = [];

    for (const inst of instances) {
      const doc = docMap.get(inst.document_id);
      if (!doc) {
        results.push({
          document_instance_id: inst.id, document_id: inst.document_id,
          document_title: '(missing document)', status: 'skipped', reason: 'no_template',
          error: 'Source document not found',
        });
        continue;
      }
      const fmt = (doc.format || '').toLowerCase();
      if (!SUPPORTED_FORMATS.has(fmt)) {
        results.push({
          document_instance_id: inst.id, document_id: doc.id, document_title: doc.title,
          status: 'skipped', reason: 'unsupported_format',
          error: `Format "${doc.format ?? 'none'}" is not supported`,
        });
        continue;
      }
      if (mode === 'pending_only' && inst.isgenerated) {
        results.push({
          document_instance_id: inst.id, document_id: doc.id, document_title: doc.title,
          status: 'skipped', reason: 'already_generated',
        });
        continue;
      }
      eligible.push({ inst, doc });
    }

    if (eligible.length > 500) {
      return jsonResponse(req, {
        success: false,
        error: `Batch too large (${eligible.length}). Maximum is 500 documents per call.`
      }, 400);
    }

    // ── Resolve latest published document_version per document_id ────────
    const eligibleDocIds = [...new Set(eligible.map(e => e.doc.id))];
    const versionByDocId = new Map<number, { id: string; storage_path?: string | null; frozen_storage_path?: string | null }>();
    if (eligibleDocIds.length > 0) {
      const { data: versions } = await supabase
        .from('document_versions')
        .select('id, document_id, version_number, status, storage_path, frozen_storage_path')
        .in('document_id', eligibleDocIds)
        .eq('status', 'published')
        .order('version_number', { ascending: false });

      for (const v of versions || []) {
        if (!versionByDocId.has(v.document_id)) {
          versionByDocId.set(v.document_id, v);
        }
      }
    }

    // ── Build plan / pre-finalised skipped, sharing logic between modes ──
    const plan: PlanItem[] = [];
    for (const { inst, doc } of eligible) {
      const version = versionByDocId.get(doc.id);
      const sp = (version?.storage_path ?? '').trim();
      const fsp = (version?.frozen_storage_path ?? '').trim();
      const sourceUrl = ((doc as { source_template_url?: string | null }).source_template_url ?? '').trim();

      if (!version) {
        results.push({
          document_instance_id: inst.id, document_id: doc.id, document_title: doc.title,
          status: 'skipped', reason: sourceUrl ? 'no_published_version' : 'no_template',
          error: sourceUrl
            ? 'Source template is allocated in SharePoint but no published document version exists yet.'
            : 'No published version and no SharePoint template URL.',
        });
        continue;
      }

      if (!sp && !fsp && !sourceUrl) {
        results.push({
          document_instance_id: inst.id, document_id: doc.id, document_title: doc.title,
          status: 'skipped', reason: 'no_template',
          error: 'No template file is allocated for this document (neither Supabase storage nor SharePoint URL).',
        });
        continue;
      }

      plan.push({
        document_instance_id: inst.id,
        document_id: doc.id,
        document_version_id: version.id,
        document_title: doc.title,
      });
    }

    // ── plan_only: return the planned + already-skipped list ────────────
    if (plan_only) {
      return jsonResponse(req, {
        success: true,
        plan,
        total_eligible: plan.length,
        skipped: results, // all entries here are status='skipped'
      });
    }

    // ── Legacy path: keep running the loop server-side for back-compat ──
    const deliverUrl = `${supabaseUrl}/functions/v1/deliver-governance-document`;
    let generated = 0;
    let failed = 0;

    for (const item of plan) {
      try {
        const resp = await fetch(deliverUrl, {
          method: 'POST',
          headers: {
            'Authorization': authHeader,
            'Content-Type': 'application/json',
          },
          body: JSON.stringify({
            tenant_id,
            document_version_id: item.document_version_id,
            allow_incomplete: true,
            force: mode === 'overwrite_all',
          }),
        });

        const respBody = await resp.json().catch(() => ({})) as {
          success?: boolean;
          error?: string;
          error_code?: string;
          tailoring?: unknown;
        };

        if (respBody?.error_code === 'SHARED_FOLDER_MISSING' || respBody?.error_code === 'GOVERNANCE_FOLDER_MISSING') {
          return jsonResponse(req, {
            success: false,
            error: respBody.error,
            error_code: respBody.error_code,
          }, 400);
        }

        if (resp.ok && respBody?.success) {
          results.push({
            document_instance_id: item.document_instance_id, document_id: item.document_id, document_title: item.document_title,
            status: 'generated', reason: 'delivered',
          });
          generated++;
          continue;
        }

        if (resp.status === 422 && respBody?.tailoring) {
          results.push({
            document_instance_id: item.document_instance_id, document_id: item.document_id, document_title: item.document_title,
            status: 'failed', reason: 'tailoring_incomplete',
            error: respBody.error || 'Tailoring incomplete',
          });
          failed++;
          continue;
        }

        const errMsg: string = respBody?.error || `HTTP ${resp.status}`;
        const reason: ResultReason = /lock|423|resourceLocked/i.test(errMsg)
          ? 'locked'
          : 'delivery_failed';

        results.push({
          document_instance_id: item.document_instance_id, document_id: item.document_id, document_title: item.document_title,
          status: 'failed', reason, error: errMsg,
        });
        failed++;
      } catch (err: unknown) {
        const msg = err instanceof Error ? err.message : 'Unknown error';
        console.error(`[bulk-gen] delivery threw for doc ${item.document_id}:`, msg);
        results.push({
          document_instance_id: item.document_instance_id, document_id: item.document_id, document_title: item.document_title,
          status: 'failed', reason: 'delivery_failed', error: msg,
        });
        failed++;
      }
    }

    const skipped = results.filter(r => r.status === 'skipped').length;
    const total = results.length;

    await supabase.from('audit_events').insert({
      action: 'bulk_generate_phase_documents',
      entity: 'bulk_generate',
      entity_id: crypto.randomUUID(),
      user_id: user.id,
      details: {
        tenant_id,
        stageinstance_id,
        package_id: package_id ?? null,
        mode,
        total,
        generated,
        skipped,
        failed,
        results,
      },
    });

    console.log(`[bulk-gen] complete: ${generated}/${total} generated, ${skipped} skipped, ${failed} failed`);

    return jsonResponse(req, {
      success: true, total, generated, skipped, failed, results,
    });

  } catch (error: unknown) {
    const msg = error instanceof Error ? error.message : 'Unknown error';
    console.error('[bulk-gen] error:', msg);
    return jsonResponse(req, { success: false, error: msg }, 400);
  }
});
