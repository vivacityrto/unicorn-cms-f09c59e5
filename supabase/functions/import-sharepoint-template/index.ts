import { corsHeaders } from '../_shared/cors.ts';
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2.81.1';
import {
  graphGet,
  graphDownload,
  type DriveItem,
} from '../_shared/graph-app-client.ts';

const supabaseUrl = Deno.env.get('SUPABASE_URL')!;
const supabaseServiceKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!;

/**
 * Compute SHA256 hex digest of a Uint8Array.
 */
async function sha256Hex(data: Uint8Array): Promise<string> {
  const hashBuffer = await crypto.subtle.digest('SHA-256', data);
  return Array.from(new Uint8Array(hashBuffer))
    .map((b) => b.toString(16).padStart(2, '0'))
    .join('');
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
    const { action } = body as { action: string };

    if (action === 'import') {
      return await handleImport(supabase, body, user.id);
    } else if (action === 'publish') {
      return await handlePublish(supabase, body, user.id);
    } else {
      return new Response(JSON.stringify({ error: `Unknown action: ${action}. Use "import" or "publish".` }), {
        status: 400, headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      });
    }
  } catch (error) {
    console.error('[import-sharepoint-template] Error:', error);
    return new Response(JSON.stringify({
      error: error instanceof Error ? error.message : 'Unknown error',
    }), {
      status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' },
    });
  }
});

/**
 * Import a template file from the Master Documents SharePoint site.
 */
async function handleImport(
  supabase: ReturnType<typeof createClient>,
  body: Record<string, unknown>,
  userId: string,
): Promise<Response> {
  const { document_id, source_drive_id, source_item_id } = body as {
    document_id: number;
    source_drive_id: string;
    source_item_id: string;
  };

  if (!document_id || !source_drive_id || !source_item_id) {
    return new Response(JSON.stringify({ error: 'document_id, source_drive_id, and source_item_id are required' }), {
      status: 400, headers: { ...corsHeaders, 'Content-Type': 'application/json' },
    });
  }

  // Fetch source file metadata
  const itemResp = await graphGet<DriveItem>(`/drives/${source_drive_id}/items/${source_item_id}`);
  if (!itemResp.ok) {
    return new Response(JSON.stringify({ error: 'Could not retrieve source file from SharePoint' }), {
      status: 400, headers: { ...corsHeaders, 'Content-Type': 'application/json' },
    });
  }

  const sourceItem = itemResp.data;
  const fileName = sourceItem.name;

  // Download file content
  const fileContent = await graphDownload(source_drive_id, source_item_id);
  const checksum = await sha256Hex(fileContent);

  // Determine next version number
  const { data: latestVersion } = await supabase
    .from('document_versions')
    .select('version_number')
    .eq('document_id', document_id)
    .order('version_number', { ascending: false })
    .limit(1)
    .maybeSingle();

  const nextVersion = (latestVersion?.version_number || 0) + 1;

  // Upload frozen copy to Supabase Storage
  const storagePath = `governance-templates/${document_id}/v${nextVersion}/${fileName}`;
  const { error: uploadError } = await supabase.storage
    .from('document-files')
    .upload(storagePath, fileContent, {
      contentType: sourceItem.file?.mimeType || 'application/octet-stream',
      upsert: true,
    });

  if (uploadError) {
    return new Response(JSON.stringify({ error: `Storage upload failed: ${uploadError.message}` }), {
      status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' },
    });
  }

  // Build source path display
  const parentRef = sourceItem.parentReference as { path?: string } | undefined;
  const sourcePathDisplay = parentRef?.path
    ? `${parentRef.path.replace(/^\/drives\/[^/]+\/root:/, '')}/${fileName}`
    : fileName;

  // Create document_versions row (status: draft)
  const { data: newVersion, error: versionError } = await supabase
    .from('document_versions')
    .insert({
      document_id,
      version_number: nextVersion,
      status: 'draft',
      storage_path: storagePath,
      file_name: fileName,
      mime_type: sourceItem.file?.mimeType || null,
      file_size: sourceItem.size || null,
      checksum_sha256: checksum,
      frozen_storage_path: storagePath,
      source_site_id: (sourceItem.parentReference as Record<string, unknown>)?.siteId as string || null,
      source_drive_item_id: source_item_id,
      source_path_display: sourcePathDisplay,
      created_by: userId,
      notes: `Imported from SharePoint: ${sourcePathDisplay}`,
    })
    .select('id')
    .single();

  if (versionError) {
    return new Response(JSON.stringify({ error: `Version creation failed: ${versionError.message}` }), {
      status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' },
    });
  }

  // Update documents.source_template_url
  await supabase
    .from('documents')
    .update({ source_template_url: sourceItem.webUrl })
    .eq('id', document_id);

  // Audit log
  await supabase.from('document_activity_log').insert({
    tenant_id: null,
    activity_type: 'governance_template_imported',
    actor_user_id: userId,
    actor_role: 'Vivacity Staff',
    metadata: {
      document_id,
      version_id: newVersion.id,
      version_number: nextVersion,
      file_name: fileName,
      checksum_sha256: checksum,
      source_drive_item_id: source_item_id,
      source_path: sourcePathDisplay,
    },
  });

  return new Response(JSON.stringify({
    success: true,
    version_id: newVersion.id,
    version_number: nextVersion,
    file_name: fileName,
    checksum_sha256: checksum,
    storage_path: storagePath,
  }), {
    headers: { ...corsHeaders, 'Content-Type': 'application/json' },
  });
}

/**
 * Publish a draft template version with drift detection.
 */
async function handlePublish(
  supabase: ReturnType<typeof createClient>,
  body: Record<string, unknown>,
  userId: string,
): Promise<Response> {
  const { version_id } = body as { version_id: string };

  if (!version_id) {
    return new Response(JSON.stringify({ error: 'version_id is required' }), {
      status: 400, headers: { ...corsHeaders, 'Content-Type': 'application/json' },
    });
  }

  // Load the draft version
  const { data: version, error: vErr } = await supabase
    .from('document_versions')
    .select('*')
    .eq('id', version_id)
    .single();

  if (vErr || !version) {
    return new Response(JSON.stringify({ error: 'Version not found' }), {
      status: 404, headers: { ...corsHeaders, 'Content-Type': 'application/json' },
    });
  }

  if (version.status !== 'draft') {
    return new Response(JSON.stringify({ error: `Version is not in draft status (current: ${version.status})` }), {
      status: 400, headers: { ...corsHeaders, 'Content-Type': 'application/json' },
    });
  }

  // Check merge field mappings exist
  const { count: mappingCount } = await supabase
    .from('document_template_mappings')
    .select('id', { count: 'exact', head: true })
    .eq('template_version_id', version_id);

  if (!mappingCount || mappingCount === 0) {
    return new Response(JSON.stringify({ error: 'Cannot publish without merge field mappings defined. Add mappings first.' }), {
      status: 400, headers: { ...corsHeaders, 'Content-Type': 'application/json' },
    });
  }

  // Drift detection: re-download source and compare checksum
  if (version.source_drive_item_id && version.checksum_sha256) {
    // Need to find the source drive_id — get from the master documents site
    const { data: masterSite } = await supabase
      .from('sharepoint_sites')
      .select('drive_id')
      .eq('purpose', 'master_documents')
      .eq('is_active', true)
      .limit(1)
      .maybeSingle();

    if (masterSite?.drive_id) {
      try {
        const currentContent = await graphDownload(masterSite.drive_id, version.source_drive_item_id);
        const currentChecksum = await sha256Hex(currentContent);

        if (currentChecksum !== version.checksum_sha256) {
          return new Response(JSON.stringify({
            error: 'Source file has changed since import (checksum mismatch). Re-import the template before publishing.',
            drift_detected: true,
            imported_checksum: version.checksum_sha256,
            current_checksum: currentChecksum,
          }), {
            status: 409, headers: { ...corsHeaders, 'Content-Type': 'application/json' },
          });
        }
      } catch (driftErr) {
        console.warn('[import-sharepoint-template] Drift check failed, proceeding:', driftErr);
      }
    }
  }

  // Archive previous published version for this document
  await supabase
    .from('document_versions')
    .update({ status: 'archived' })
    .eq('document_id', version.document_id)
    .eq('status', 'published');

  // Publish this version
  const { error: pubErr } = await supabase
    .from('document_versions')
    .update({
      status: 'published',
      published_by: userId,
      published_at: new Date().toISOString(),
    })
    .eq('id', version_id);

  if (pubErr) {
    return new Response(JSON.stringify({ error: `Publish failed: ${pubErr.message}` }), {
      status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' },
    });
  }

  // Update current_published_version_id on documents
  await supabase
    .from('documents')
    .update({ current_published_version_id: version_id })
    .eq('id', version.document_id);

  // Audit log
  await supabase.from('document_activity_log').insert({
    tenant_id: null,
    activity_type: 'governance_template_published',
    actor_user_id: userId,
    actor_role: 'Vivacity Staff',
    metadata: {
      document_id: version.document_id,
      version_id,
      version_number: version.version_number,
      file_name: version.file_name,
      checksum_sha256: version.checksum_sha256,
    },
  });

  return new Response(JSON.stringify({
    success: true,
    version_id,
    version_number: version.version_number,
    published_at: new Date().toISOString(),
  }), {
    headers: { ...corsHeaders, 'Content-Type': 'application/json' },
  });
}
