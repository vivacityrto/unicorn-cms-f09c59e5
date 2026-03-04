import { corsHeaders } from '../_shared/cors.ts';
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2.81.1';
import { graphGet, getAppToken, _clearTokenCache, type DriveItem } from '../_shared/graph-app-client.ts';
import { emitTimelineEvent } from '../_shared/emit-timeline-event.ts';

const SUPABASE_URL = Deno.env.get('SUPABASE_URL')!;
const SUPABASE_SERVICE_ROLE_KEY = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!;
const MICROSOFT_CLIENT_ID = Deno.env.get('MICROSOFT_CLIENT_ID')!;
const MICROSOFT_CLIENT_SECRET = Deno.env.get('MICROSOFT_CLIENT_SECRET')!;

const GRAPH_BASE_URL = 'https://graph.microsoft.com/v1.0';

// ── Token helpers ───────────────────────────────────────────────────────────

/**
 * Get the calling user's delegated Microsoft token from oauth_tokens,
 * refreshing if needed. Returns null if user has no connected account.
 */
async function getUserDelegatedToken(
  supabaseAdmin: ReturnType<typeof createClient>,
  userId: string,
): Promise<string | null> {
  const { data: tokenData } = await supabaseAdmin
    .from('oauth_tokens')
    .select('access_token, refresh_token, expires_at, scope')
    .eq('user_id', userId)
    .eq('provider', 'microsoft')
    .maybeSingle();

  if (!tokenData) {
    console.log('[validate-sp] No delegated Microsoft token found for user');
    return null;
  }

  // Check if token needs refresh
  const expiresAt = new Date(tokenData.expires_at);
  if (expiresAt.getTime() - Date.now() > 5 * 60 * 1000) {
    return tokenData.access_token;
  }

  console.log('[validate-sp] Refreshing delegated token...');
  try {
    const tokenResponse = await fetch(
      'https://login.microsoftonline.com/common/oauth2/v2.0/token',
      {
        method: 'POST',
        headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
        body: new URLSearchParams({
          client_id: MICROSOFT_CLIENT_ID,
          client_secret: MICROSOFT_CLIENT_SECRET,
          refresh_token: tokenData.refresh_token,
          grant_type: 'refresh_token',
          scope: tokenData.scope || 'openid profile email offline_access Files.Read.All',
        }),
      },
    );

    if (!tokenResponse.ok) {
      const errText = await tokenResponse.text();
      console.error('[validate-sp] Delegated token refresh failed:', errText);
      return null;
    }

    const tokens = await tokenResponse.json();
    const newExpiresAt = new Date(Date.now() + tokens.expires_in * 1000);

    await supabaseAdmin
      .from('oauth_tokens')
      .update({
        access_token: tokens.access_token,
        refresh_token: tokens.refresh_token || tokenData.refresh_token,
        expires_at: newExpiresAt.toISOString(),
        updated_at: new Date().toISOString(),
      })
      .eq('user_id', userId)
      .eq('provider', 'microsoft');

    return tokens.access_token;
  } catch (err) {
    console.error('[validate-sp] Token refresh error:', err);
    return null;
  }
}

/**
 * Make a Graph GET request using a specific token.
 */
async function graphGetWithToken<T>(token: string, path: string): Promise<{ ok: boolean; status: number; data: T }> {
  const url = path.startsWith('http') ? path : `${GRAPH_BASE_URL}${path}`;
  const resp = await fetch(url, {
    headers: { Authorization: `Bearer ${token}` },
  });

  let data: T;
  const ct = resp.headers.get('content-type') || '';
  if (ct.includes('application/json')) {
    data = await resp.json();
  } else {
    await resp.arrayBuffer().catch(() => {});
    data = {} as T;
  }

  if (!resp.ok) {
    console.warn(`[validate-sp] Graph ${resp.status} on ${path}:`, JSON.stringify(data));
  }

  return { ok: resp.ok, status: resp.status, data };
}

// ── URL parsing ─────────────────────────────────────────────────────────────

function isSharingLink(url: string): boolean {
  return /\/:[a-z]:\/s\//i.test(url);
}

function parseSharingLinkSite(url: string): { host: string; siteName: string } | null {
  try {
    const parsed = new URL(url.trim());
    const host = parsed.hostname;
    const match = parsed.pathname.match(/\/:[a-z]:\/s\/([^/]+)/i);
    if (!match) return null;
    return { host, siteName: match[1] };
  } catch {
    return null;
  }
}

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

// ── Resolution logic ────────────────────────────────────────────────────────

/**
 * Resolve a sharing link using the /shares/ API with a delegated token.
 * The /shares/ API does NOT support app-only tokens — delegated auth required.
 */
async function resolveSharingLinkWithDelegatedToken(
  url: string,
  accessToken: string,
): Promise<{ host: string; sitePath: string; relativePath: string | null } | { error: string }> {
  const siteInfo = parseSharingLinkSite(url);
  if (!siteInfo) {
    return { error: 'Could not extract site information from this sharing link.' };
  }

  console.log('[validate-sp] Resolving sharing link with delegated token for site:', siteInfo.siteName);

  // Encode sharing URL for /shares/ API
  const base64 = btoa(url);
  const urlSafe = base64.replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '');
  const shareId = `u!${urlSafe}`;

  // Try /shares/ API with delegated token
  const sharesResp = await graphGetWithToken<{
    id: string;
    name: string;
    webUrl: string;
    folder?: unknown;
    file?: unknown;
    parentReference?: { driveId?: string; siteId?: string };
  }>(accessToken, `/shares/${shareId}/driveItem?$select=id,name,folder,file,parentReference,webUrl`);

  if (sharesResp.ok) {
    console.log('[validate-sp] /shares/ resolved successfully:', sharesResp.data.name, sharesResp.data.webUrl);
    const parentRef = sharesResp.data.parentReference;

    if (sharesResp.data.webUrl) {
      const directParsed = parseDirectUrl(sharesResp.data.webUrl);
      if (directParsed) return directParsed;
    }

    if (parentRef?.siteId) {
      return {
        host: siteInfo.host,
        sitePath: `/sites/${siteInfo.siteName}`,
        relativePath: null,
      };
    }
  } else {
    console.warn('[validate-sp] /shares/ API failed:', sharesResp.status);
  }

  // Fall back to resolving site directly with delegated token
  const siteRes = await graphGetWithToken<{ id: string; displayName: string; webUrl: string }>(
    accessToken,
    `/sites/${siteInfo.host}:/sites/${siteInfo.siteName}`,
  );

  if (siteRes.ok) {
    return {
      error: `Sharing links cannot be resolved to a specific folder. Please navigate to the folder in SharePoint and copy the URL from the browser address bar.\n\nYour site root: ${siteRes.data.webUrl}`,
    };
  }

  return {
    error: `Could not access site "${siteInfo.siteName}" (status ${siteRes.status}). Try copying the URL from the browser address bar instead.`,
  };
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
    const jwt = authHeader.replace('Bearer ', '');
    const { data: { user }, error: authError } = await supabaseAdmin.auth.getUser(jwt);

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

    // ── Get user's delegated Microsoft token (preferred) ──
    const delegatedToken = await getUserDelegatedToken(supabaseAdmin, user.id);
    
    if (!delegatedToken) {
      const errorMessage = 'Your Microsoft account is not connected. Please connect your Microsoft 365 account first (Settings → Microsoft 365), then try again.';
      await upsertSettings(supabaseAdmin, tenant_id, root_folder_url, user.id, {
        validation_status: 'invalid',
        validation_error: errorMessage,
      });
      return new Response(
        JSON.stringify({ success: false, error: errorMessage }),
        { status: 400, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }

    console.log('[validate-sp] Using delegated token for Graph API calls');

    let driveId: string;
    let driveItem: DriveItem;

    // ── Resolve URL to parsed components ──
    let parsed: { host: string; sitePath: string; relativePath: string | null } | null = null;

    if (isSharingLink(root_folder_url)) {
      const sharingResult = await resolveSharingLinkWithDelegatedToken(root_folder_url, delegatedToken);
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

    // ── Resolve site using delegated token ──
    const siteRes = await graphGetWithToken<{ id: string; displayName: string; webUrl: string }>(
      delegatedToken,
      `/sites/${parsed.host}:${parsed.sitePath}`,
    );

    if (!siteRes.ok) {
      let errorMessage = 'Could not access this SharePoint site. ';
      if (siteRes.status === 403) {
        errorMessage += 'You do not have permission to access this site.';
      } else if (siteRes.status === 404) {
        errorMessage += 'Site not found.';
      } else if (siteRes.status === 401) {
        errorMessage += 'Your Microsoft token may have expired. Please reconnect your Microsoft 365 account and try again.';
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
    const drivesRes = await graphGetWithToken<{
      value: Array<{ id: string; name: string; driveType: string }>;
    }>(delegatedToken, `/sites/${siteId}/drives`);

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
      const folderRes = await graphGetWithToken<DriveItem>(
        delegatedToken,
        `/drives/${driveId}/root:/${encodeURIComponent(parsed.relativePath).replace(/%2F/g, '/')}`,
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
      const rootRes = await graphGetWithToken<DriveItem>(delegatedToken, `/drives/${driveId}/root`);
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
