import { corsHeaders } from '../_shared/cors.ts';
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2.81.1';
import {
  ensureFolder,
  graphGet,
  buildClientFolderName,
  type DriveItem,
} from '../_shared/graph-app-client.ts';

const supabaseUrl = Deno.env.get('SUPABASE_URL')!;
const supabaseServiceKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!;

Deno.serve(async (req: Request) => {
  if (req.method === 'OPTIONS') {
    return new Response(null, { headers: corsHeaders });
  }

  try {
    const supabase = createClient(supabaseUrl, supabaseServiceKey);

    // Auth: Vivacity staff only
    const authHeader = req.headers.get('Authorization');
    if (!authHeader?.startsWith('Bearer ')) {
      return new Response(JSON.stringify({ error: 'Unauthorized' }), {
        status: 401, headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      });
    }

    const token = authHeader.replace('Bearer ', '');
    const { data: { user }, error: userError } = await supabase.auth.getUser(token);
    if (userError || !user) {
      return new Response(JSON.stringify({ error: 'Unauthorized' }), {
        status: 401, headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      });
    }

    const { data: profile } = await supabase
      .from('users')
      .select('is_vivacity_internal')
      .eq('user_uuid', user.id)
      .single();

    if (!profile?.is_vivacity_internal) {
      return new Response(JSON.stringify({ error: 'Forbidden — Vivacity staff only' }), {
        status: 403, headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      });
    }

    const body = await req.json();
    const { tenant_id, create_category_subfolders } = body as {
      tenant_id: number;
      create_category_subfolders?: boolean;
    };

    if (!tenant_id) {
      return new Response(JSON.stringify({ error: 'tenant_id is required' }), {
        status: 400, headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      });
    }

    // Load tenant data (need name, rto_id, legal_name, status for folder naming + guard)
    const { data: tenant, error: tenantErr } = await supabase
      .from('tenants')
      .select('id, name, rto_id, legal_name, status')
      .eq('id', tenant_id)
      .single();

    if (tenantErr || !tenant) {
      return new Response(JSON.stringify({ error: `Tenant ${tenant_id} not found` }), {
        status: 404, headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      });
    }

    // Active tenant guard
    if (tenant.status !== 'active') {
      return new Response(JSON.stringify({
        error: `Tenant is not active (status: ${tenant.status}). Governance folder creation is only allowed for active tenants.`,
      }), {
        status: 400, headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      });
    }

    // Look up the Governance site drive from sharepoint_sites
    const { data: govSite } = await supabase
      .from('sharepoint_sites')
      .select('graph_site_id, drive_id')
      .eq('purpose', 'governance_client_files')
      .eq('is_active', true)
      .limit(1)
      .maybeSingle();

    if (!govSite?.drive_id) {
      return new Response(JSON.stringify({
        error: 'No Governance SharePoint site configured. Add a governance_client_files site to sharepoint_sites first.',
      }), {
        status: 400, headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      });
    }

    const driveId = govSite.drive_id;

    // Load existing governance settings
    const { data: spSettings } = await supabase
      .from('tenant_sharepoint_settings')
      .select('governance_folder_item_id, governance_drive_id')
      .eq('tenant_id', tenant_id)
      .maybeSingle();

    // Check if governance folder already exists
    if (spSettings?.governance_folder_item_id) {
      const check = await graphGet<DriveItem>(
        `/drives/${driveId}/items/${spSettings.governance_folder_item_id}`
      );
      if (check.ok && check.data.folder) {
        const result: Record<string, unknown> = {
          success: true,
          already_exists: true,
          governance_folder: {
            item_id: check.data.id,
            name: check.data.name,
            web_url: check.data.webUrl,
          },
        };

        if (create_category_subfolders) {
          const subs = await createCategorySubfolders(supabase, driveId, check.data.id);
          result.category_subfolders = subs;
        }

        return new Response(JSON.stringify(result), {
          headers: { ...corsHeaders, 'Content-Type': 'application/json' },
        });
      }
    }

    // Build tenant folder name using unified convention
    const tenantFolderName = buildClientFolderName(tenant.rto_id, tenant.legal_name, tenant.name);

    // Create tenant folder under Shared Documents root
    // The governance site structure is: Shared Documents / {tenant folder}
    const { itemId, webUrl } = await ensureFolder(driveId, '', tenantFolderName);

    // Update tenant_sharepoint_settings with governance columns
    const { data: existingSettings } = await supabase
      .from('tenant_sharepoint_settings')
      .select('id')
      .eq('tenant_id', tenant_id)
      .maybeSingle();

    const govFields = {
      governance_site_id: govSite.graph_site_id,
      governance_drive_id: driveId,
      governance_folder_item_id: itemId,
      governance_folder_url: webUrl,
      governance_folder_name: tenantFolderName,
      updated_by: user.id,
      updated_at: new Date().toISOString(),
    };

    if (existingSettings) {
      await supabase
        .from('tenant_sharepoint_settings')
        .update(govFields)
        .eq('tenant_id', tenant_id);
    } else {
      await supabase
        .from('tenant_sharepoint_settings')
        .insert({
          tenant_id,
          created_by: user.id,
          ...govFields,
        });
    }

    // Audit log
    await supabase.from('document_activity_log').insert({
      tenant_id,
      activity_type: 'governance_folder_created',
      actor_user_id: user.id,
      actor_role: 'Vivacity Staff',
      metadata: {
        folder_item_id: itemId,
        folder_name: tenantFolderName,
        web_url: webUrl,
        site_purpose: 'governance_client_files',
      },
    });

    const result: Record<string, unknown> = {
      success: true,
      already_exists: false,
      governance_folder: {
        item_id: itemId,
        name: tenantFolderName,
        web_url: webUrl,
      },
    };

    if (create_category_subfolders) {
      const subs = await createCategorySubfolders(supabase, driveId, itemId);
      result.category_subfolders = subs;
    }

    return new Response(JSON.stringify(result), {
      headers: { ...corsHeaders, 'Content-Type': 'application/json' },
    });

  } catch (error) {
    console.error('[verify-compliance-folder] Error:', error);
    return new Response(JSON.stringify({
      error: error instanceof Error ? error.message : 'Unknown error',
    }), {
      status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' },
    });
  }
});

/**
 * Create subfolders within the governance folder for each active document category
 * that has a sharepoint_folder_name defined.
 */
async function createCategorySubfolders(
  supabase: ReturnType<typeof createClient>,
  driveId: string,
  parentItemId: string,
): Promise<{ created: string[]; errors: string[] }> {
  const { data: categories } = await supabase
    .from('dd_document_categories')
    .select('label, sharepoint_folder_name')
    .eq('is_active', true)
    .not('sharepoint_folder_name', 'is', null)
    .order('sort_order', { ascending: true, nullsFirst: false });

  const created: string[] = [];
  const errors: string[] = [];

  if (!categories || categories.length === 0) {
    return { created, errors };
  }

  // Get the parent folder's path for ensureFolder
  const parentFolder = await graphGet<DriveItem>(`/drives/${driveId}/items/${parentItemId}`);
  if (!parentFolder.ok) {
    errors.push('Could not retrieve parent folder path');
    return { created, errors };
  }

  const parentRef = parentFolder.data.parentReference as { path?: string } | undefined;
  const parentPath = parentRef?.path
    ? `${parentRef.path.replace(/^\/drives\/[^/]+\/root:/, '')}/${parentFolder.data.name}`
    : parentFolder.data.name;

  const cleanParentPath = parentPath.replace(/^\//, '');

  for (const cat of categories) {
    const folderName = cat.sharepoint_folder_name as string;
    try {
      await ensureFolder(driveId, cleanParentPath, folderName);
      created.push(folderName);
    } catch (e) {
      errors.push(`${folderName}: ${e instanceof Error ? e.message : 'Unknown error'}`);
    }
  }

  return { created, errors };
}
