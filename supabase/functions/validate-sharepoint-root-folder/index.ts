import { corsHeaders } from '../_shared/cors.ts';
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2.81.1';
import { graphGet, getAppToken, _clearTokenCache, type DriveItem } from '../_shared/graph-app-client.ts';
import { emitTimelineEvent } from '../_shared/emit-timeline-event.ts';

const SUPABASE_URL = Deno.env.get('SUPABASE_URL')!;
const SUPABASE_SERVICE_ROLE_KEY = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!;

/**
 * Detect if a URL is a SharePoint sharing link (/:f:/s/ or /:x:/s/ format).
 */
function isSharingLink(url: string): boolean {
  return /\/:[a-z]:\/s\//i.test(url);
}

/**
 * Extract host and site name from a sharing link URL.
 * e.g. https://org.sharepoint.com/:f:/s/sitename/TOKEN → { host, siteName }
 */
function parseSharingLinkSite(url: string): { host: string; siteName: string } | null {
  try {
    const parsed = new URL(url.trim());
    const host = parsed.hostname;
    // Pathname like /:f:/s/vivacityteam/TOKEN
    const match = parsed.pathname.match(/\/:[a-z]:\/s\/([^/]+)/i);
    if (!match) return null;
    return { host, siteName: match[1] };
  } catch {
    return null;
  }
}

/**
 * Resolve a sharing link by extracting the site, getting drives,
 * then using the /shares/ API with user-delegated approach OR
 * falling back to listing root children to find the folder.
 * Since Sites.Selected doesn't support /shares/, we resolve the site
 * directly and prompt the user to use the direct browser URL.
 */
async function resolveSharingLink(url: string): Promise<{
  host: string;
  sitePath: string;
  relativePath: string | null;
} | { error: string }> {
  const siteInfo = parseSharingLinkSite(url);
  if (!siteInfo) {
    return { error: 'Could not extract site information from this sharing link.' };
  }

  console.log('[validate-sp] Sharing link detected — extracted site:', siteInfo.siteName);

  // Strategy 1: Try /shares/ API first — this is the direct approach for sharing links
  const base64 = btoa(url);
  const urlSafe = base64.replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '');
  const shareId = `u!${urlSafe}`;

  try {
    const token = await getAppToken();
    const resp = await fetch(
      `https://graph.microsoft.com/v1.0/shares/${shareId}/driveItem?$select=id,name,folder,file,parentReference,webUrl`,
      { headers: { Authorization: `Bearer ${token}` } }
    );

    if (resp.ok) {
      const driveItem = await resp.json();
      console.log('[validate-sp] /shares/ resolved successfully:', driveItem.name, driveItem.webUrl);
      const parentRef = driveItem.parentReference;
      if (parentRef?.driveId && driveItem.webUrl) {
        const directParsed = parseDirectUrl(driveItem.webUrl);
        if (directParsed) return directParsed;
      }
      // If webUrl parse fails, try to construct from what we have
      if (parentRef?.siteId) {
        return {
          host: siteInfo.host,
          sitePath: `/sites/${siteInfo.siteName}`,
          relativePath: null,
        };
      }
    } else {
      const errBody = await resp.text();
      console.warn('[validate-sp] /shares/ API returned', resp.status, errBody);
    }
  } catch (sharesErr) {
    console.warn('[validate-sp] /shares/ API error:', sharesErr);
  }

  // Strategy 2: Fall back to resolving the site directly
  const siteRes = await graphGet<{ id: string; displayName: string; webUrl: string }>(
    `/sites/${siteInfo.host}:/sites/${siteInfo.siteName}`
  );

  if (siteRes.ok) {
    const siteWebUrl = siteRes.data.webUrl;
    console.log('[validate-sp] Site resolved, but sharing link cannot be mapped to a specific folder.');
    return {
      error: `Sharing links cannot be resolved to a specific folder. Please navigate to the folder in SharePoint and copy the URL from the browser address bar.\n\nYour site root: ${siteWebUrl}`,
    };
  }

  // If site resolution also fails, provide guidance based on status
  if (siteRes.status === 403) {
    return {
      error: `The app does not have Sites.Selected permission for site "${siteInfo.siteName}". Navigate to the folder in SharePoint and copy the URL from the browser address bar instead.`,
    };
  }

  // 401 likely means token issue — retry token acquisition
  if (siteRes.status === 401) {
    console.warn('[validate-sp] Got 401 from Graph — possible stale token, retrying...');
    // Force token refresh by clearing cache
    _clearTokenCache();
    const retryRes = await graphGet<{ id: string; displayName: string; webUrl: string }>(
      `/sites/${siteInfo.host}:/sites/${siteInfo.siteName}`
    );
    if (retryRes.ok) {
      return {
        error: `Sharing links cannot be resolved to a specific folder. Please navigate to the folder in SharePoint and copy the URL from the browser address bar.\n\nYour site root: ${retryRes.data.webUrl}`,
      };
    }
    return {
      error: `Authentication failed when accessing Microsoft Graph (status 401). This may be a temporary issue — please try again. If the problem persists, contact your administrator to verify the Microsoft app registration credentials.`,
    };
  }

  return {
    error: `Could not access site "${siteInfo.siteName}" (status ${siteRes.status}). Try copying the URL from the browser address bar instead.`,
  };
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

    // ── Resolve URL to parsed components ──
    let parsed: { host: string; sitePath: string; relativePath: string | null } | null = null;

    if (isSharingLink(root_folder_url)) {
      // Strategy 1: Sharing link → extract site, try /shares/, fallback to error with guidance
      const sharingResult = await resolveSharingLink(root_folder_url);
      if ('error' in sharingResult) {
        await upsertSettings(supabaseAdmin, tenant_id, root_folder_url, user.id, {
          validation_status: 'invalid',
          validation_error: sharingResult.error,
        });
        return new Response(
          JSON.stringify({ success: false, error: sharingResult.error }),
          { status: 400, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
        );
      }
      parsed = sharingResult;
    } else {
      // Strategy 2: Direct URL
      parsed = parseDirectUrl(root_folder_url);
    }

    if (!parsed) {
      const errorMessage =
        'Could not parse this SharePoint URL. Navigate to the folder in SharePoint and copy the URL from the browser address bar.';
      await upsertSettings(supabaseAdmin, tenant_id, root_folder_url, user.id, {
        validation_status: 'invalid',
        validation_error: errorMessage,
      });
      return new Response(
        JSON.stringify({ success: false, error: errorMessage }),
        { status: 400, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }

    // ── Resolve site ──
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

    // ── Get drives ──
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

    // ── Resolve folder ──
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
