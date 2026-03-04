import { corsHeaders } from '../_shared/cors.ts';
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2.81.1';
import { graphGet, type DriveItem } from '../_shared/graph-app-client.ts';
import { emitTimelineEvent } from '../_shared/emit-timeline-event.ts';

const SUPABASE_URL = Deno.env.get('SUPABASE_URL')!;
const SUPABASE_SERVICE_ROLE_KEY = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!;

/**
 * Parse a SharePoint URL into its components for Graph API resolution.
 * Supports URLs like:
 *   https://tenant.sharepoint.com/sites/SiteName/Shared%20Documents/Folder/SubFolder
 *   https://tenant.sharepoint.com/:f:/r/sites/SiteName/Shared%20Documents/Folder
 */
function parseSharePointUrl(url: string): {
  host: string;
  sitePath: string;
  relativePath: string | null;
} | null {
  try {
    // Clean up encoded sharing URLs (e.g. /:f:/r/sites/...)
    let cleanUrl = url.trim();
    // Remove sharing format markers like /:f:/r or /:x:/r etc.
    cleanUrl = cleanUrl.replace(/\/:[a-z]:\/[rs]\//i, '/');
    // Remove query params and hash
    cleanUrl = cleanUrl.split('?')[0].split('#')[0];

    const parsed = new URL(cleanUrl);
    const host = parsed.hostname;
    const pathParts = decodeURIComponent(parsed.pathname).split('/').filter(Boolean);

    // Find "sites" segment
    const sitesIdx = pathParts.findIndex(p => p.toLowerCase() === 'sites');
    if (sitesIdx === -1 || sitesIdx + 1 >= pathParts.length) {
      return null;
    }

    const siteName = pathParts[sitesIdx + 1];
    const sitePath = `/sites/${siteName}`;

    // Everything after "Shared Documents" (or "Shared%20Documents") is the folder path
    const remaining = pathParts.slice(sitesIdx + 2);
    const sharedDocsIdx = remaining.findIndex(
      p => p.toLowerCase() === 'shared documents' || p.toLowerCase() === 'shared%20documents'
    );

    let relativePath: string | null = null;
    if (sharedDocsIdx !== -1) {
      const folderParts = remaining.slice(sharedDocsIdx + 1);
      // Filter out SharePoint view artifacts
      const filtered = folderParts.filter(p =>
        p.toLowerCase() !== 'forms' &&
        p.toLowerCase() !== 'allitems.aspx'
      );
      if (filtered.length > 0) {
        relativePath = filtered.join('/');
      }
    }

    return { host, sitePath, relativePath };
  } catch {
    return null;
  }
}

Deno.serve(async (req: Request) => {
  if (req.method === 'OPTIONS') {
    return new Response(null, { headers: corsHeaders });
  }

  try {
    const body = await req.json();
    const { tenant_id, root_folder_url } = body as {
      tenant_id: number;
      root_folder_url: string;
    };

    if (!tenant_id || !root_folder_url) {
      return new Response(
        JSON.stringify({ error: 'tenant_id and root_folder_url are required' }),
        { status: 400, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }

    // Auth
    const authHeader = req.headers.get('Authorization');
    if (!authHeader?.startsWith('Bearer ')) {
      return new Response(
        JSON.stringify({ error: 'Unauthorized' }),
        { status: 401, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }

    const supabaseAdmin = createClient(SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY);
    const token = authHeader.replace('Bearer ', '');
    const { data: { user }, error: authError } = await supabaseAdmin.auth.getUser(token);

    if (authError || !user) {
      return new Response(
        JSON.stringify({ error: 'Unauthorized' }),
        { status: 401, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }

    // Verify caller is Vivacity staff
    const { data: callerUser } = await supabaseAdmin
      .from('users')
      .select('is_vivacity_internal')
      .eq('user_uuid', user.id)
      .single();

    if (!callerUser?.is_vivacity_internal) {
      return new Response(
        JSON.stringify({ error: 'Forbidden — Vivacity staff only' }),
        { status: 403, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }

    // Parse the SharePoint URL
    const parsed = parseSharePointUrl(root_folder_url);
    if (!parsed) {
      const errorMessage = 'Could not parse this SharePoint URL. Please provide a direct link to a SharePoint folder.';
      await upsertSettings(supabaseAdmin, tenant_id, root_folder_url, user.id, {
        validation_status: 'invalid',
        validation_error: errorMessage,
      });
      return new Response(
        JSON.stringify({ success: false, error: errorMessage }),
        { status: 400, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }

    console.log('[validate-sp] Parsed URL:', parsed);

    // Step 1: Resolve the site using app-level credentials
    const siteRes = await graphGet<{ id: string; displayName: string; webUrl: string }>(
      `/sites/${parsed.host}:${parsed.sitePath}`
    );

    if (!siteRes.ok) {
      let errorMessage = 'Could not access this SharePoint site. ';
      if (siteRes.status === 403) {
        errorMessage += 'The app does not have permission to this site. Ensure Sites.Selected permission is granted for this site.';
      } else if (siteRes.status === 404) {
        errorMessage += 'Site not found. Check the URL is correct.';
      } else {
        errorMessage += `Microsoft returned status ${siteRes.status}.`;
      }
      await upsertSettings(supabaseAdmin, tenant_id, root_folder_url, user.id, {
        validation_status: 'invalid',
        validation_error: errorMessage,
      });
      return new Response(
        JSON.stringify({ success: false, error: errorMessage }),
        { status: 400, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }

    const siteId = siteRes.data.id;
    console.log('[validate-sp] Resolved site:', siteId, siteRes.data.displayName);

    // Step 2: Get the default document library drive
    const drivesRes = await graphGet<{ value: Array<{ id: string; name: string; driveType: string; webUrl: string }> }>(
      `/sites/${siteId}/drives`
    );

    if (!drivesRes.ok || !drivesRes.data.value?.length) {
      const errorMessage = 'Could not list document libraries for this site.';
      await upsertSettings(supabaseAdmin, tenant_id, root_folder_url, user.id, {
        validation_status: 'invalid',
        validation_error: errorMessage,
      });
      return new Response(
        JSON.stringify({ success: false, error: errorMessage }),
        { status: 400, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }

    // Use the first documentLibrary drive (typically "Shared Documents" / "Documents")
    const drive = drivesRes.data.value.find(d => d.driveType === 'documentLibrary') || drivesRes.data.value[0];
    const driveId = drive.id;
    console.log('[validate-sp] Using drive:', driveId, drive.name);

    // Step 3: Resolve the folder within the drive
    let driveItem: DriveItem;

    if (parsed.relativePath) {
      // Navigate to the specific subfolder
      const folderRes = await graphGet<DriveItem>(
        `/drives/${driveId}/root:/${encodeURIComponent(parsed.relativePath).replace(/%2F/g, '/')}`
      );

      if (!folderRes.ok) {
        let errorMessage = `Could not find folder "${parsed.relativePath}" in this drive. `;
        if (folderRes.status === 404) {
          errorMessage += 'Check that the folder path in the URL is correct.';
        } else {
          errorMessage += `Microsoft returned status ${folderRes.status}.`;
        }
        await upsertSettings(supabaseAdmin, tenant_id, root_folder_url, user.id, {
          validation_status: 'invalid',
          validation_error: errorMessage,
        });
        return new Response(
          JSON.stringify({ success: false, error: errorMessage }),
          { status: 400, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
        );
      }
      driveItem = folderRes.data;
    } else {
      // Use the drive root
      const rootRes = await graphGet<DriveItem>(`/drives/${driveId}/root`);
      if (!rootRes.ok) {
        const errorMessage = 'Could not access the document library root.';
        await upsertSettings(supabaseAdmin, tenant_id, root_folder_url, user.id, {
          validation_status: 'invalid',
          validation_error: errorMessage,
        });
        return new Response(
          JSON.stringify({ success: false, error: errorMessage }),
          { status: 400, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
        );
      }
      driveItem = rootRes.data;
    }

    // Verify it's a folder
    if (driveItem.file) {
      const errorMessage = `"${driveItem.name}" is a file, not a folder. Please provide a folder link.`;
      await upsertSettings(supabaseAdmin, tenant_id, root_folder_url, user.id, {
        validation_status: 'invalid',
        validation_error: errorMessage,
      });
      return new Response(
        JSON.stringify({ success: false, error: errorMessage, is_folder: false }),
        { status: 400, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }

    const rootItemId = driveItem.id;
    const rootName = driveItem.name;
    const webUrl = driveItem.webUrl;

    console.log('[validate-sp] Resolved folder:', { driveId, rootItemId, rootName, webUrl });

    // Upsert settings — valid
    await upsertSettings(supabaseAdmin, tenant_id, root_folder_url, user.id, {
      validation_status: 'valid',
      drive_id: driveId,
      root_item_id: rootItemId,
      root_name: rootName,
      validation_error: null,
      last_validated_at: new Date().toISOString(),
    });

    // Emit timeline event
    await emitTimelineEvent(supabaseAdmin, {
      tenant_id,
      client_id: String(tenant_id),
      event_type: 'sharepoint_root_configured',
      title: `SharePoint root folder configured: ${rootName}`,
      source: 'microsoft',
      visibility: 'internal',
      entity_type: 'tenant_sharepoint_settings',
      metadata: {
        root_name: rootName,
        drive_id: driveId,
        root_item_id: rootItemId,
      },
      created_by: user.id,
      dedupe_key: `sp_root:${tenant_id}:${new Date().toISOString().split('T')[0]}`,
    });

    return new Response(
      JSON.stringify({
        success: true,
        drive_id: driveId,
        root_item_id: rootItemId,
        root_name: rootName,
        web_url: webUrl,
        is_folder: true,
      }),
      { headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
    );
  } catch (error) {
    console.error('[validate-sp] Unhandled error:', error);
    return new Response(
      JSON.stringify({ error: error instanceof Error ? error.message : 'Unknown error' }),
      { status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
    );
  }
});

async function upsertSettings(
  supabaseAdmin: ReturnType<typeof createClient>,
  tenantId: number,
  rootFolderUrl: string,
  userId: string,
  fields: Record<string, unknown>
) {
  const { data: existing } = await supabaseAdmin
    .from('tenant_sharepoint_settings')
    .select('id')
    .eq('tenant_id', tenantId)
    .maybeSingle();

  if (existing) {
    await supabaseAdmin
      .from('tenant_sharepoint_settings')
      .update({
        root_folder_url: rootFolderUrl,
        updated_by: userId,
        updated_at: new Date().toISOString(),
        ...fields,
      })
      .eq('tenant_id', tenantId);
  } else {
    await supabaseAdmin
      .from('tenant_sharepoint_settings')
      .insert({
        tenant_id: tenantId,
        root_folder_url: rootFolderUrl,
        created_by: userId,
        ...fields,
      });
  }
}
