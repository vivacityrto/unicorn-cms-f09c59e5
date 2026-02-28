import { corsHeaders } from '../_shared/cors.ts';
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2.81.1';
import {
  ensureFolder,
  graphGet,
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

    // Load tenant SharePoint settings
    const { data: spSettings, error: spErr } = await supabase
      .from('tenant_sharepoint_settings')
      .select('drive_id, root_item_id, root_name, folder_path, compliance_docs_folder_item_id')
      .eq('tenant_id', tenant_id)
      .maybeSingle();

    if (!spSettings?.drive_id || !spSettings?.root_item_id) {
      return new Response(JSON.stringify({
        error: 'Tenant has no mapped SharePoint folder. Run resolve-tenant-folder first.',
      }), {
        status: 400, headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      });
    }

    const driveId = spSettings.drive_id;
    const rootItemId = spSettings.root_item_id;

    // Check if compliance docs folder already exists
    if (spSettings.compliance_docs_folder_item_id) {
      // Verify it still exists in SharePoint
      const check = await graphGet<DriveItem>(
        `/drives/${driveId}/items/${spSettings.compliance_docs_folder_item_id}`
      );
      if (check.ok && check.data.folder) {
        // Already exists and valid
        const result: Record<string, unknown> = {
          success: true,
          already_exists: true,
          compliance_folder: {
            item_id: check.data.id,
            name: check.data.name,
            web_url: check.data.webUrl,
          },
        };

        // Optionally create category subfolders
        if (create_category_subfolders) {
          const subs = await createCategorySubfolders(
            supabase, driveId, check.data.id, check.data.name
          );
          result.category_subfolders = subs;
        }

        return new Response(JSON.stringify(result), {
          headers: { ...corsHeaders, 'Content-Type': 'application/json' },
        });
      }
    }

    // Create "Compliance Documents" subfolder under the tenant root
    const complianceFolderName = 'Compliance Documents';
    
    // Get the root folder path for ensureFolder
    // We need to find the root folder's path
    const rootFolder = await graphGet<DriveItem>(`/drives/${driveId}/items/${rootItemId}`);
    if (!rootFolder.ok) {
      throw new Error('Could not retrieve tenant root folder');
    }

    // Extract the path from parentReference
    const parentRef = rootFolder.data.parentReference as { path?: string } | undefined;
    const rootPath = parentRef?.path
      ? `${parentRef.path.replace(/^\/drives\/[^/]+\/root:/, '')}/${rootFolder.data.name}`
      : rootFolder.data.name;

    const cleanPath = rootPath.replace(/^\//, '');

    const { itemId, webUrl } = await ensureFolder(driveId, cleanPath, complianceFolderName);

    // Update tenant_sharepoint_settings
    await supabase
      .from('tenant_sharepoint_settings')
      .update({
        compliance_docs_folder_item_id: itemId,
        compliance_docs_folder_name: complianceFolderName,
        updated_by: user.id,
        updated_at: new Date().toISOString(),
      })
      .eq('tenant_id', tenant_id);

    // Audit log
    await supabase.from('document_activity_log').insert({
      tenant_id,
      activity_type: 'compliance_folder_created',
      actor_user_id: user.id,
      actor_role: 'Vivacity Staff',
      metadata: {
        folder_item_id: itemId,
        folder_name: complianceFolderName,
        web_url: webUrl,
        parent_folder: rootFolder.data.name,
      },
    });

    const result: Record<string, unknown> = {
      success: true,
      already_exists: false,
      compliance_folder: {
        item_id: itemId,
        name: complianceFolderName,
        web_url: webUrl,
      },
    };

    // Optionally create category subfolders
    if (create_category_subfolders) {
      const subs = await createCategorySubfolders(supabase, driveId, itemId, complianceFolderName);
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
 * Create subfolders within the compliance docs folder for each active document category
 * that has a sharepoint_folder_name defined.
 */
async function createCategorySubfolders(
  supabase: ReturnType<typeof createClient>,
  driveId: string,
  parentItemId: string,
  parentName: string,
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
