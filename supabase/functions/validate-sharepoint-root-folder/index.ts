import { corsHeaders } from '../_shared/cors.ts';
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2.81.1';
import { graphGet, getAppToken, _clearTokenCache, type DriveItem } from '../_shared/graph-app-client.ts';
import { emitTimelineEvent } from '../_shared/emit-timeline-event.ts';

const SUPABASE_URL = Deno.env.get('SUPABASE_URL')!;
const SUPABASE_SERVICE_ROLE_KEY = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!;
const MICROSOFT_CLIENT_ID = Deno.env.get('MICROSOFT_CLIENT_ID')!;
const MICROSOFT_CLIENT_SECRET = Deno.env.get('MICROSOFT_CLIENT_SECRET')!;

const GRAPH_BASE_URL = 'https://graph.microsoft.com/v1.0';

// ── URL parsing ─────────────────────────────────────────────────────────────

function isSharingLink(url: string): boolean {
  return /\/:[a-z]:\/s\//i.test(url);
}

/**
 * Extract site hostname and site name from ANY SharePoint URL (sharing or direct).
 */
function extractSiteInfo(url: string): { host: string; siteName: string } | null {
  try {
    const parsed = new URL(url.trim());
    const host = parsed.hostname;

    // Sharing link: /:f:/s/{siteName}/...
    const sharingMatch = parsed.pathname.match(/\/:[a-z]:\/s\/([^/]+)/i);
    if (sharingMatch) return { host, siteName: sharingMatch[1] };

    // Direct link with /sites/{siteName}
    const idParam = parsed.searchParams.get('id');
    const effectivePath = idParam ? decodeURIComponent(idParam) : decodeURIComponent(parsed.pathname);
    const parts = effectivePath.split('/').filter(Boolean);
    const sitesIdx = parts.findIndex((p) => p.toLowerCase() === 'sites');
    if (sitesIdx !== -1 && sitesIdx + 1 < parts.length) {
      return { host, siteName: parts[sitesIdx + 1] };
    }

    return null;
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
    } else {
      let pathname = parsed.pathname;
      pathname = pathname.replace(/\/:[a-z]:\/r\//i, '/');
      effectivePath = decodeURIComponent(pathname);
    }

    const pathParts = effectivePath.split('/').filter(Boolean);
    const sitesIdx = pathParts.findIndex((p) => p.toLowerCase() === 'sites');
    if (sitesIdx === -1 || sitesIdx + 1 >= pathParts.length) return null;

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

    return { host, sitePath, relativePath };
  } catch {
    return null;
  }
}

// ── Delegated token helper (optional, for /shares/ API) ─────────────────────

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

  if (!tokenData) return null;

  const expiresAt = new Date(tokenData.expires_at);
  if (expiresAt.getTime() - Date.now() > 5 * 60 * 1000) {
    return tokenData.access_token;
  }

  if (!tokenData.refresh_token) return null;

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

    if (!tokenResponse.ok) return null;

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

    // ── Strategy: always resolve site+drive with APP-ONLY token ──
    // The /shares/ API requires delegated tokens, so for sharing links we
    // extract the site name and resolve site/drive directly with app token.
    // This works because Sites.Selected grants app access to registered sites.

    // Step 1: Extract site info from any URL type
    const siteInfo = extractSiteInfo(root_folder_url);
    if (!siteInfo) {
      const errorMessage = 'Could not parse this SharePoint URL. Navigate to the folder in SharePoint and copy the URL from the browser address bar.';
      await upsertSettings(supabaseAdmin, tenant_id, root_folder_url, user.id, {
        validation_status: 'invalid',
        validation_error: errorMessage,
      });
      return new Response(
        JSON.stringify({ success: false, error: errorMessage }),
        { status: 400, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }

    console.log('[validate-sp] Extracted site:', siteInfo.host, siteInfo.siteName);

    // Step 2: Resolve site with app-only token
    const siteRes = await graphGet<{ id: string; displayName: string; webUrl: string }>(
      `/sites/${siteInfo.host}:/sites/${siteInfo.siteName}`,
    );

    if (!siteRes.ok) {
      let errorMessage: string;
      if (siteRes.status === 401) {
        errorMessage = `App token was rejected accessing site "${siteInfo.siteName}". Check that MICROSOFT_CLIENT_SECRET is valid and Sites.Selected permission is granted for this site.`;
      } else if (siteRes.status === 403) {
        errorMessage = `The app does not have Sites.Selected permission for site "${siteInfo.siteName}". Grant write access via POST /sites/{id}/permissions in Graph Explorer.`;
      } else if (siteRes.status === 404) {
        errorMessage = `Site "${siteInfo.siteName}" not found. Verify the URL is correct.`;
      } else {
        errorMessage = `Could not access site "${siteInfo.siteName}" (status ${siteRes.status}).`;
      }
      console.error('[validate-sp] Site resolution failed:', siteRes.status, JSON.stringify(siteRes.data));
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

    // Step 3: Get drives with app-only token
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
    const driveId = drive.id;
    console.log('[validate-sp] Using drive:', driveId, drive.name);

    // Step 4: Resolve folder
    let driveItem: DriveItem;

    // For sharing links, try /shares/ with delegated token if available
    if (isSharingLink(root_folder_url)) {
      let resolvedFromShares = false;

      const delegatedToken = await getUserDelegatedToken(supabaseAdmin, user.id);
      if (delegatedToken) {
        console.log('[validate-sp] Trying /shares/ API with delegated token');
        const base64 = btoa(root_folder_url);
        const urlSafe = base64.replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '');
        const shareId = `u!${urlSafe}`;

        const resp = await fetch(`${GRAPH_BASE_URL}/shares/${shareId}/driveItem?$select=id,name,folder,file,parentReference,webUrl`, {
          headers: { Authorization: `Bearer ${delegatedToken}` },
        });

        if (resp.ok) {
          const item = await resp.json();
          console.log('[validate-sp] /shares/ resolved:', item.name);
          driveItem = item as DriveItem;
          resolvedFromShares = true;
        } else {
          const errBody = await resp.text();
          console.warn('[validate-sp] /shares/ failed:', resp.status, errBody);
        }
      } else {
        console.log('[validate-sp] No delegated token — skipping /shares/ API');
      }

      if (!resolvedFromShares) {
        // Fallback: try to parse a relative path from the direct URL parse
        const directParsed = parseDirectUrl(root_folder_url);
        if (directParsed?.relativePath) {
          const folderRes = await graphGet<DriveItem>(
            `/drives/${driveId}/root:/${encodeURIComponent(directParsed.relativePath).replace(/%2F/g, '/')}`,
          );
          if (folderRes.ok) {
            driveItem = folderRes.data;
          } else {
            // Default to drive root
            console.log('[validate-sp] Folder path not found, defaulting to drive root');
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
        } else {
          // No relative path extractable from sharing link — use drive root
          console.log('[validate-sp] Sharing link with no extractable path — using drive root');
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
    } else {
      // Direct URL — parse and resolve folder path
      const directParsed = parseDirectUrl(root_folder_url);
      if (directParsed?.relativePath) {
        const folderRes = await graphGet<DriveItem>(
          `/drives/${driveId}/root:/${encodeURIComponent(directParsed.relativePath).replace(/%2F/g, '/')}`,
        );
        if (!folderRes.ok) {
          const errorMessage = `Could not find folder "${directParsed.relativePath}". ${
            folderRes.status === 404 ? 'Check the folder path is correct.' : `Microsoft returned status ${folderRes.status}.`
          }`;
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
    if (driveItem!.file) {
      const errorMessage = `"${driveItem!.name}" is a file, not a folder. Please provide a folder link.`;
      await upsertSettings(supabaseAdmin, tenant_id, root_folder_url, user.id, {
        validation_status: 'invalid',
        validation_error: errorMessage,
      });
      return new Response(
        JSON.stringify({ success: false, error: errorMessage, is_folder: false }),
        { status: 400, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }

    const rootItemId = driveItem!.id;
    const rootName = driveItem!.name;
    const webUrl = driveItem!.webUrl;

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
