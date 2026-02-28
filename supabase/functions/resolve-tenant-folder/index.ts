import { corsHeaders } from '../_shared/cors.ts';
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2.81.1';
import {
  getAppToken,
  graphGet,
  type DriveItem,
  GRAPH_BASE,
} from '../_shared/graph-app-client.ts';

const supabaseUrl = Deno.env.get('SUPABASE_URL')!;
const supabaseServiceKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!;

interface FolderCandidate {
  item_id: string;
  name: string;
  web_url: string;
  match_type: 'stored' | 'rtoid' | 'name';
  confidence: 'high' | 'medium' | 'low';
}

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
        status: 401,
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      });
    }

    const token = authHeader.replace('Bearer ', '');
    const { data: { user }, error: userError } = await supabase.auth.getUser(token);
    if (userError || !user) {
      return new Response(JSON.stringify({ error: 'Unauthorized' }), {
        status: 401,
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      });
    }

    const { data: profile } = await supabase
      .from('users')
      .select('is_vivacity_internal')
      .eq('user_uuid', user.id)
      .single();

    if (!profile?.is_vivacity_internal) {
      return new Response(JSON.stringify({ error: 'Forbidden — Vivacity staff only' }), {
        status: 403,
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      });
    }

    const body = await req.json();
    const { tenant_id, action, folder_item_id } = body as {
      tenant_id: number;
      action: 'search' | 'confirm';
      folder_item_id?: string;
    };

    if (!tenant_id) {
      return new Response(JSON.stringify({ error: 'tenant_id is required' }), {
        status: 400,
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      });
    }

    // Load tenant data
    const { data: tenant, error: tenantErr } = await supabase
      .from('tenants')
      .select('id, name, slug, rto_id, abn, legal_name')
      .eq('id', tenant_id)
      .single();

    if (tenantErr || !tenant) {
      return new Response(JSON.stringify({ error: `Tenant ${tenant_id} not found` }), {
        status: 404,
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      });
    }

    // Load existing SharePoint settings
    const { data: spSettings } = await supabase
      .from('tenant_sharepoint_settings')
      .select('drive_id, site_id, root_item_id, root_name, root_folder_url')
      .eq('tenant_id', tenant_id)
      .maybeSingle();

    if (action === 'confirm' && folder_item_id) {
      // ── CONFIRM a folder mapping ──
      if (!spSettings?.drive_id) {
        return new Response(JSON.stringify({ error: 'No drive_id configured for this tenant' }), {
          status: 400,
          headers: { ...corsHeaders, 'Content-Type': 'application/json' },
        });
      }

      // Fetch the folder metadata from Graph to store canonical data
      const folderResp = await graphGet<DriveItem>(
        `/drives/${spSettings.drive_id}/items/${folder_item_id}`
      );

      if (!folderResp.ok) {
        return new Response(JSON.stringify({ error: 'Could not retrieve folder from SharePoint' }), {
          status: 400,
          headers: { ...corsHeaders, 'Content-Type': 'application/json' },
        });
      }

      const folder = folderResp.data;

      // Update tenant_sharepoint_settings
      await supabase
        .from('tenant_sharepoint_settings')
        .update({
          root_item_id: folder.id,
          root_name: folder.name,
          root_folder_url: folder.webUrl,
          match_method: 'manual',
          verified_by: user.id,
          verified_at: new Date().toISOString(),
          validation_status: 'valid',
          last_validated_at: new Date().toISOString(),
          updated_by: user.id,
          updated_at: new Date().toISOString(),
        })
        .eq('tenant_id', tenant_id);

      // Audit log
      await supabase.from('document_activity_log').insert({
        tenant_id,
        activity_type: 'folder_mapped',
        actor_user_id: user.id,
        actor_role: 'Vivacity Staff',
        metadata: {
          folder_item_id: folder.id,
          folder_name: folder.name,
          web_url: folder.webUrl,
          match_method: 'manual',
        },
      });

      return new Response(JSON.stringify({
        success: true,
        folder: { item_id: folder.id, name: folder.name, web_url: folder.webUrl },
      }), {
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      });
    }

    // ── SEARCH for candidate folders ──
    // Need a drive_id to search. Try from settings, or from sharepoint_sites registry.
    let driveId = spSettings?.drive_id;

    if (!driveId) {
      const { data: clientSite } = await supabase
        .from('sharepoint_sites')
        .select('drive_id')
        .eq('purpose', 'client_files')
        .eq('is_active', true)
        .limit(1)
        .maybeSingle();

      driveId = clientSite?.drive_id;
    }

    if (!driveId) {
      return new Response(JSON.stringify({
        error: 'No SharePoint drive configured. Please add a Client Files site to sharepoint_sites first.',
      }), {
        status: 400,
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      });
    }

    const candidates: FolderCandidate[] = [];

    // Priority 1: Stored root_item_id
    if (spSettings?.root_item_id) {
      const stored = await graphGet<DriveItem>(
        `/drives/${driveId}/items/${spSettings.root_item_id}`
      );
      if (stored.ok && stored.data.folder) {
        candidates.push({
          item_id: stored.data.id,
          name: stored.data.name,
          web_url: stored.data.webUrl,
          match_type: 'stored',
          confidence: 'high',
        });
      }
    }

    // Priority 2: Search by RTO ID
    if (tenant.rto_id && candidates.length === 0) {
      const searchResp = await graphGet<{ value: DriveItem[] }>(
        `/drives/${driveId}/root/search(q='${encodeURIComponent(tenant.rto_id)}')`
      );
      if (searchResp.ok) {
        for (const item of (searchResp.data.value || [])) {
          if (item.folder && !candidates.some(c => c.item_id === item.id)) {
            candidates.push({
              item_id: item.id,
              name: item.name,
              web_url: item.webUrl,
              match_type: 'rtoid',
              confidence: 'high',
            });
          }
        }
      }
    }

    // Priority 3: Search by tenant name
    if (candidates.length === 0 && tenant.name) {
      // Use first two significant words of the name
      const nameTokens = tenant.name.split(/\s+/).filter((t: string) => t.length > 2).slice(0, 2).join(' ');
      if (nameTokens) {
        const nameResp = await graphGet<{ value: DriveItem[] }>(
          `/drives/${driveId}/root/search(q='${encodeURIComponent(nameTokens)}')`
        );
        if (nameResp.ok) {
          for (const item of (nameResp.data.value || [])) {
            if (item.folder && !candidates.some(c => c.item_id === item.id)) {
              candidates.push({
                item_id: item.id,
                name: item.name,
                web_url: item.webUrl,
                match_type: 'name',
                confidence: 'medium',
              });
            }
          }
        }
      }
    }

    return new Response(JSON.stringify({
      success: true,
      tenant: { id: tenant.id, name: tenant.name, rto_id: tenant.rto_id },
      candidates: candidates.slice(0, 10), // Cap at 10 results
      has_existing_mapping: !!spSettings?.root_item_id,
    }), {
      headers: { ...corsHeaders, 'Content-Type': 'application/json' },
    });

  } catch (error) {
    console.error('[resolve-tenant-folder] Error:', error);
    return new Response(JSON.stringify({
      error: error instanceof Error ? error.message : 'Unknown error',
    }), {
      status: 500,
      headers: { ...corsHeaders, 'Content-Type': 'application/json' },
    });
  }
});
