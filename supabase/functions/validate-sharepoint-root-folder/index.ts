import { corsHeaders } from '../_shared/cors.ts';
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2.81.1';
import { graphGet, getAppToken, type DriveItem } from '../_shared/graph-app-client.ts';
import { emitTimelineEvent } from '../_shared/emit-timeline-event.ts';

const SUPABASE_URL = Deno.env.get('SUPABASE_URL')!;
const SUPABASE_SERVICE_ROLE_KEY = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!;

/**
 * Detect if a URL is a SharePoint sharing link (/:f:/s/ or /:x:/s/ format).
 * These use an encoded item ID rather than a folder path.
 */
function isSharingLink(url: string): boolean {
  return /\/:[a-z]:\/s\//i.test(url);
}

/**
 * Resolve a sharing link via the Graph /shares/ API using app-level token.
 */
async function resolveViaSharingApi(url: string): Promise<{
  driveId: string;
  driveItem: DriveItem;
} | { error: string }> {
  const base64 = btoa(url);
  const urlSafe = base64.replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '');
  const shareId = `u!${urlSafe}`;

  console.log('[validate-sp] Resolving sharing link via /shares/ API');

  const token = await getAppToken();
  const resp = await fetch(
    `https://graph.microsoft.com/v1.0/shares/${shareId}/driveItem?$select=id,name,folder,file,parentReference,webUrl`,
    { headers: { Authorization: `Bearer ${token}` } }
  );

  if (!resp.ok) {
    const errBody = await resp.text();
    console.error('[validate-sp] /shares/ resolution failed:', resp.status, errBody);

    if (resp.status === 403) {
      return {
        error: 'The app does not have permission to resolve this sharing link. Try using the direct folder URL from the browser address bar instead (navigate to the folder in SharePoint and copy the URL).',
      };
    }
    if (resp.status === 404) {
      return { error: 'Could not find the shared resource. The link may have expired or been revoked.' };
    }
    return { error: `Microsoft returned status ${resp.status} when resolving sharing link.` };
  }

  const driveItem = (await resp.json()) as DriveItem;
  const parentRef = driveItem.parentReference as Record<string, string> | undefined;
  const driveId = parentRef?.driveId;

  if (!driveId) {
    return { error: 'Could not determine the drive ID from the sharing link.' };
  }

  return { driveId, driveItem };
}

/**
 * Parse a direct SharePoint URL into components for Graph API resolution.
 */
function parseDirectUrl(url: string): {
  host: string;
  sitePath: string;
  relativePath: string | null;
} | null {
  try {
    const parsed = new URL(url.trim());
    const host = parsed.hostname;

    const idParam = parsed.searchParams.get('id');
    let effectivePath: string;

    if (idParam) {
      effectivePath = decodeURIComponent(idParam);
      console.log('[validate-sp] Using id param path:', effectivePath);
    } else {
      let pathname = parsed.pathname;
      // Remove direct resource markers /:f:/r/ but NOT sharing markers /:f:/s/
      pathname = pathname.replace(/\/:[a-z]:\/r\//i, '/');
      effectivePath = decodeURIComponent(pathname);
    }

    const pathParts = effectivePath.split('/').filter(Boolean);

    const sitesIdx = pathParts.findIndex((p) => p.toLowerCase() === 'sites');
    if (sitesIdx === -1 || sitesIdx + 1 >= pathParts.length) {
      console.log('[validate-sp] No /sites/ segment in:', pathParts);
      return null;
    }

    const siteName = pathParts[sitesIdx + 1];
    const sitePath = `/sites/${siteName}`;

    const remaining = pathParts.slice(sitesIdx + 2);
    const sharedDocsIdx = remaining.findIndex(
      (p) =>
        p.toLowerCase() === 'shared documents' ||
        p.toLowerCase() === 'shared%20documents'
    );

    let relativePath: string | null = null;
    if (sharedDocsIdx !== -1) {
      const folderParts = remaining.slice(sharedDocsIdx + 1);
      const filtered = folderParts.filter(
        (p) => p.toLowerCase() !== 'forms' && p.toLowerCase() !== 'allitems.aspx'
      );
      if (filtered.length > 0) {
        relativePath = filtered.join('/');
      }
    }

    console.log('[validate-sp] Parsed direct URL:', { host, sitePath, relativePath });
    return { host, sitePath, relativePath };
  } catch {
    return null;
  }
}

// ── Main handler ────────────────────────────────────────────────────────────

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

    console.log('[validate-sp] URL:', root_folder_url);

    let driveId: string;
    let driveItem: DriveItem;

    // ── Strategy 1: Sharing link → resolve via /shares/ API ──
    if (isSharingLink(root_folder_url)) {
      const result = await resolveViaSharingApi(root_folder_url);
      if ('error' in result) {
        await upsertSettings(supabaseAdmin, tenant_id, root_folder_url, user.id, {
          validation_status: 'invalid',
          validation_error: result.error,
        });
        return new Response(
          JSON.stringify({ success: false, error: result.error }),
          { status: 400, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
        );
      }
      driveId = result.driveId;
      driveItem = result.driveItem;
    }
    // ── Strategy 2: Direct URL → parse and resolve via site/drive/path ──
    else {
      const parsed = parseDirectUrl(root_folder_url);
      if (!parsed) {
        const errorMessage =
          'Could not parse this SharePoint URL. Provide a direct link to a folder or use "Copy link" from SharePoint.';
        await upsertSettings(supabaseAdmin, tenant_id, root_folder_url, user.id, {
          validation_status: 'invalid',
          validation_error: errorMessage,
        });
        return new Response(
          JSON.stringify({ success: false, error: errorMessage }),
          { status: 400, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
        );
      }

      // Resolve site
      const siteRes = await graphGet<{ id: string; displayName: string; webUrl: string }>(
        `/sites/${parsed.host}:${parsed.sitePath}`
      );

      if (!siteRes.ok) {
        let errorMessage = 'Could not access this SharePoint site. ';
        if (siteRes.status === 403) {
          errorMessage +=
            'The app does not have permission. Ensure Sites.Selected is granted for this site.';
        } else if (siteRes.status === 404) {
          errorMessage += 'Site not found.';
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

      // Get drives
      const drivesRes = await graphGet<{
        value: Array<{ id: string; name: string; driveType: string }>;
      }>(`/sites/${siteId}/drives`);

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

      const drive =
        drivesRes.data.value.find((d) => d.driveType === 'documentLibrary') ||
        drivesRes.data.value[0];
      driveId = drive.id;
      console.log('[validate-sp] Using drive:', driveId, drive.name);

      // Resolve folder
      if (parsed.relativePath) {
        const folderRes = await graphGet<DriveItem>(
          `/drives/${driveId}/root:/${encodeURIComponent(parsed.relativePath).replace(/%2F/g, '/')}`
        );
        if (!folderRes.ok) {
          let errorMessage = `Could not find folder "${parsed.relativePath}". `;
          errorMessage +=
            folderRes.status === 404
              ? 'Check the folder path is correct.'
              : `Microsoft returned status ${folderRes.status}.`;
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
      metadata: { root_name: rootName, drive_id: driveId, root_item_id: rootItemId },
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

// ── Helpers ─────────────────────────────────────────────────────────────────

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
