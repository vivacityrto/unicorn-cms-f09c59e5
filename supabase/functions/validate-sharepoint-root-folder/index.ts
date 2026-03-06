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
    const { tenant_id, root_folder_url, test_site_access, resolve_drive_id, graph_site_id } = body as {
      tenant_id: number;
      root_folder_url: string;
      test_site_access?: boolean;
      resolve_drive_id?: boolean;
      graph_site_id?: string;
    };

    // ── Resolve Drive ID mode: just fetch /sites/{siteId}/drive and return ──
    if (resolve_drive_id && graph_site_id) {
      // Auth check first
      const authHeader2 = req.headers.get('Authorization');
      if (!authHeader2?.startsWith('Bearer ')) {
        return new Response(JSON.stringify({ error: 'Unauthorized' }), { status: 401, headers: { ...corsHeaders, 'Content-Type': 'application/json' } });
      }
      const supabaseAdmin2 = createClient(SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY);
      const jwt2 = authHeader2.replace('Bearer ', '');
      const { data: { user: user2 }, error: authErr2 } = await supabaseAdmin2.auth.getUser(jwt2);
      if (authErr2 || !user2) {
        return new Response(JSON.stringify({ error: 'Unauthorized' }), { status: 401, headers: { ...corsHeaders, 'Content-Type': 'application/json' } });
      }
      const { data: caller2 } = await supabaseAdmin2.from('users').select('is_vivacity_internal').eq('user_uuid', user2.id).single();
      if (!caller2?.is_vivacity_internal) {
        return new Response(JSON.stringify({ error: 'Forbidden' }), { status: 403, headers: { ...corsHeaders, 'Content-Type': 'application/json' } });
      }

      console.log('[validate-sp] Resolving drive for site:', graph_site_id);
      
      // Get the default drive
      const driveRes = await graphGet<{ id: string; name: string; webUrl: string; driveType: string }>(`/sites/${graph_site_id}/drive`);
      if (!driveRes.ok) {
        // Also try listing all drives
        const drivesRes = await graphGet<{ value: Array<{ id: string; name: string; driveType: string; webUrl: string }> }>(`/sites/${graph_site_id}/drives`);
        if (!drivesRes.ok) {
          return new Response(
            JSON.stringify({ success: false, error: `Cannot access drives for this site (status ${driveRes.status}). Check Sites.Selected permission.` }),
            { status: 400, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
          );
        }
        // Return all drives so user can pick
        return new Response(
          JSON.stringify({ success: true, drives: drivesRes.data.value }),
          { headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
        );
      }

      // Also list all drives for visibility
      const allDrivesRes = await graphGet<{ value: Array<{ id: string; name: string; driveType: string; webUrl: string }> }>(`/sites/${graph_site_id}/drives`);
      
      return new Response(
        JSON.stringify({
          success: true,
          default_drive: { id: driveRes.data.id, name: driveRes.data.name, webUrl: driveRes.data.webUrl, driveType: driveRes.data.driveType },
          drives: allDrivesRes.ok ? allDrivesRes.data.value : [driveRes.data],
        }),
        { headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }

    // For site-level access tests, only root_folder_url is required
    if (test_site_access) {
      if (!root_folder_url) {
        return new Response(
          JSON.stringify({ error: 'root_folder_url is required for site access test' }),
          { status: 400, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
        );
      }
    } else if (!tenant_id || !root_folder_url) {
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

    // ── Strategy: resolve site+drive from sharepoint_sites table first ──
    // This matches the working pattern from provision-tenant-sharepoint-folder.
    // Only fall back to URL-based Graph resolution if table lookup fails.

    // Step 1: Extract site info from URL for context
    const siteInfo = extractSiteInfo(root_folder_url);
    if (!siteInfo) {
      const errorMessage = 'Could not parse this SharePoint URL. Navigate to the folder in SharePoint and copy the URL from the browser address bar.';
      if (!test_site_access) {
        await upsertSettings(supabaseAdmin, tenant_id, root_folder_url, user.id, {
          validation_status: 'invalid',
          validation_error: errorMessage,
        });
      }
      return new Response(
        JSON.stringify({ success: false, error: errorMessage }),
        { status: 400, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }

    console.log('[validate-sp] Extracted site:', siteInfo.host, siteInfo.siteName);

    // Step 2: Try to get site+drive from sharepoint_sites table (authoritative)
    // Determine which purpose to look up based on the site name in the URL
    let lookupPurpose: string | null = null;
    const siteNameLower = siteInfo.siteName.toLowerCase();
    if (siteNameLower === 'vivacityteam') lookupPurpose = 'client_files';
    else if (siteNameLower === 'clients938') lookupPurpose = 'governance_client_files';
    else if (siteNameLower === 'masterdocuments') lookupPurpose = 'master_documents';

    let siteId: string | null = null;
    let driveId: string | null = null;

    if (lookupPurpose) {
      const { data: spSite } = await supabaseAdmin
        .from('sharepoint_sites')
        .select('graph_site_id, drive_id')
        .eq('purpose', lookupPurpose)
        .eq('is_active', true)
        .limit(1)
        .maybeSingle();

      if (spSite?.graph_site_id) {
        siteId = spSite.graph_site_id;
        console.log('[validate-sp] Found site in sharepoint_sites:', siteId);

        // Resolve drive_id if it's stored as a Graph URL
        if (spSite.drive_id?.startsWith('http')) {
          console.log('[validate-sp] drive_id is a URL, resolving via site→drive...');
          const driveResp = await graphGet<{ id: string }>(`/sites/${siteId}/drive`);
          if (driveResp.ok) {
            driveId = driveResp.data.id;
            console.log('[validate-sp] Resolved drive ID from site:', driveId);
            // Cache resolved drive ID back
            await supabaseAdmin
              .from('sharepoint_sites')
              .update({ drive_id: driveId })
              .eq('purpose', lookupPurpose)
              .eq('is_active', true);
          } else {
            console.warn('[validate-sp] Drive resolution from site failed:', driveResp.status);
          }
        } else if (spSite.drive_id) {
          // Validate that the drive_id looks like a real Graph drive ID (starts with b!)
          // If it doesn't, it's likely a bad value (e.g. a user OID) — resolve from Graph
          if (spSite.drive_id.startsWith('b!')) {
            driveId = spSite.drive_id;
            console.log('[validate-sp] Using cached drive ID:', driveId);
          } else {
            console.warn('[validate-sp] Cached drive_id does not look like a Graph drive ID:', spSite.drive_id, '— resolving from Graph...');
            const driveResp = await graphGet<{ id: string }>(`/sites/${siteId}/drive`);
            if (driveResp.ok) {
              driveId = driveResp.data.id;
              console.log('[validate-sp] Resolved drive ID from site:', driveId);
              // Cache resolved drive ID back
              await supabaseAdmin
                .from('sharepoint_sites')
                .update({ drive_id: driveId })
                .eq('purpose', lookupPurpose)
                .eq('is_active', true);
            } else {
              console.warn('[validate-sp] Drive resolution from site failed:', driveResp.status, '— the stored drive_id is invalid and cannot be auto-resolved. Grant Sites.Selected permission or manually set the correct drive_id.');
            }
          }
        }
      }
    }

    // Step 3: Fall back to Graph URL-based resolution only if table lookup failed
    if (!siteId || !driveId) {
      console.log('[validate-sp] Table lookup failed, trying Graph API resolution...');
      const siteRes = await graphGet<{ id: string; displayName: string; webUrl: string }>(
        `/sites/${siteInfo.host}:/sites/${siteInfo.siteName}`,
      );

      if (!siteRes.ok) {
        let errorMessage: string;
        if (siteRes.status === 401 || siteRes.status === 403) {
          errorMessage = `Cannot access site "${siteInfo.siteName}". Ensure the sharepoint_sites table has a row for this site with a valid graph_site_id, or grant Sites.Selected permission.`;
        } else if (siteRes.status === 404) {
          errorMessage = `Site "${siteInfo.siteName}" not found. Verify the URL is correct.`;
        } else {
          errorMessage = `Could not access site "${siteInfo.siteName}" (status ${siteRes.status}).`;
        }
        console.error('[validate-sp] Site resolution failed:', siteRes.status, JSON.stringify(siteRes.data));
        if (!test_site_access) {
          await upsertSettings(supabaseAdmin, tenant_id, root_folder_url, user.id, {
            validation_status: 'invalid',
            validation_error: errorMessage,
          });
        }
        return new Response(
          JSON.stringify({ success: false, error: errorMessage }),
          { status: 400, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
        );
      }

      siteId = siteRes.data.id;

      const drivesRes = await graphGet<{
        value: Array<{ id: string; name: string; driveType: string }>;
      }>(`/sites/${siteId}/drives`);

      if (!drivesRes.ok || !drivesRes.data.value?.length) {
        const errorMessage = 'Could not list document libraries for this site.';
        if (!test_site_access) {
          await upsertSettings(supabaseAdmin, tenant_id, root_folder_url, user.id, {
            validation_status: 'invalid',
            validation_error: errorMessage,
          });
        }
        return new Response(
          JSON.stringify({ success: false, error: errorMessage }),
          { status: 400, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
        );
      }

      const drive =
        drivesRes.data.value.find((d) => d.driveType === 'documentLibrary') ||
        drivesRes.data.value[0];
      driveId = drive.id;
    }

    console.log('[validate-sp] Using site:', siteId, 'drive:', driveId);

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
              if (!test_site_access) {
                await upsertSettings(supabaseAdmin, tenant_id, root_folder_url, user.id, {
                  validation_status: 'invalid',
                  validation_error: errorMessage,
                });
              }
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
            if (!test_site_access) {
              await upsertSettings(supabaseAdmin, tenant_id, root_folder_url, user.id, {
                validation_status: 'invalid',
                validation_error: errorMessage,
              });
            }
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
          if (!test_site_access) {
            await upsertSettings(supabaseAdmin, tenant_id, root_folder_url, user.id, {
              validation_status: 'invalid',
              validation_error: errorMessage,
            });
          }
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
          if (!test_site_access) {
            await upsertSettings(supabaseAdmin, tenant_id, root_folder_url, user.id, {
              validation_status: 'invalid',
              validation_error: errorMessage,
            });
          }
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
      if (!test_site_access) {
        await upsertSettings(supabaseAdmin, tenant_id, root_folder_url, user.id, {
          validation_status: 'invalid',
          validation_error: errorMessage,
        });
      }
      return new Response(
        JSON.stringify({ success: false, error: errorMessage, is_folder: false }),
        { status: 400, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }

    const rootItemId = driveItem!.id;
    const rootName = driveItem!.name;
    const webUrl = driveItem!.webUrl;

    console.log('[validate-sp] Resolved folder:', { driveId, rootItemId, rootName, webUrl });

    // Upsert settings and emit timeline — only for real tenant validations
    if (!test_site_access) {
      await upsertSettings(supabaseAdmin, tenant_id, root_folder_url, user.id, {
        validation_status: 'valid',
        drive_id: driveId,
        root_item_id: rootItemId,
        root_name: rootName,
        validation_error: null,
        last_validated_at: new Date().toISOString(),
      });

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
    }

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
