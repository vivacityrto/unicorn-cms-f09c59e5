import { corsHeaders } from '../_shared/cors.ts';
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2.81.1';
import * as zip from 'https://deno.land/x/zipjs@v2.7.34/index.js';
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

    if (action === 'browse') {
      return await handleBrowse(supabase, body);
    } else if (action === 'import') {
      return await handleImport(supabase, body, user.id);
    } else if (action === 'publish') {
      return await handlePublish(supabase, body, user.id);
    } else {
      return new Response(JSON.stringify({ error: `Unknown action: ${action}. Use "browse", "import" or "publish".` }), {
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

  // ── Auto-scan DOCX for merge fields ────────────────────────────────────
  let detected_fields: Array<{ tag: string; field_id: number }> = [];
  let invalid_tags: string[] = [];
  let fields_linked = 0;

  const isDocx = fileName.toLowerCase().endsWith('.docx');
  if (isDocx) {
    try {
      const scanResult = await scanDocxMergeFields(fileContent, document_id, supabase);
      detected_fields = scanResult.detected_fields;
      invalid_tags = scanResult.invalid_tags;
      fields_linked = scanResult.fields_linked;
    } catch (scanErr) {
      console.warn('[import-sharepoint-template] Merge field scan failed (non-fatal):', scanErr);
    }
  }

  return new Response(JSON.stringify({
    success: true,
    version_id: newVersion.id,
    version_number: nextVersion,
    file_name: fileName,
    checksum_sha256: checksum,
    storage_path: storagePath,
    detected_fields,
    invalid_tags,
    fields_linked,
  }), {
    headers: { ...corsHeaders, 'Content-Type': 'application/json' },
  });
}

/**
 * Scan a DOCX file for {{...}} merge field patterns.
 * Matches against dd_fields tags and syncs document_fields table.
 */
async function scanDocxMergeFields(
  fileContent: Uint8Array,
  documentId: number,
  supabase: ReturnType<typeof createClient>,
): Promise<{
  detected_fields: Array<{ tag: string; field_id: number }>;
  invalid_tags: string[];
  fields_linked: number;
}> {
  // 1. Unzip and extract text from relevant XML entries
  const blob = new Blob([fileContent.slice().buffer]);
  const reader = new zip.ZipReader(new zip.BlobReader(blob));
  const entries = await reader.getEntries();

  const relevantFiles = ['word/document.xml'];
  // Also include headers/footers
  const relevantPattern = /^word\/(header|footer)\d*\.xml$/;

  let allText = '';
  for (const entry of entries) {
    if (!entry.getData) continue;
    const isRelevant = relevantFiles.includes(entry.filename) || relevantPattern.test(entry.filename);
    if (!isRelevant) continue;

    const data = await entry.getData(new zip.BlobWriter());
    const arrayBuffer = await data.arrayBuffer();
    const xmlContent = new TextDecoder().decode(arrayBuffer);

    // Strip all XML tags to get plain text (handles Word split-run issue)
    allText += xmlContent.replace(/<[^>]+>/g, '') + ' ';
  }
  await reader.close();

  // 2. Find all {{...}} patterns in the concatenated text
  const mergeFieldRegex = /\{\{\s*([^}]+?)\s*\}\}/g;
  const foundTags = new Set<string>();
  let match: RegExpExecArray | null;
  while ((match = mergeFieldRegex.exec(allText)) !== null) {
    const cleaned = match[1].trim();
    if (cleaned) foundTags.add(cleaned);
  }

  if (foundTags.size === 0) {
    return { detected_fields: [], invalid_tags: [], fields_linked: 0 };
  }

  // 3. Fetch all dd_fields tags
  const { data: ddFields } = await supabase
    .from('dd_fields')
    .select('id, tag')
    .eq('is_active', true);

  const tagMap = new Map<string, number>();
  for (const f of ddFields || []) {
    tagMap.set(f.tag, f.id);
  }

  // 4. Classify found tags
  const detected_fields: Array<{ tag: string; field_id: number }> = [];
  const invalid_tags: string[] = [];

  for (const tag of foundTags) {
    const fieldId = tagMap.get(tag);
    if (fieldId !== undefined) {
      detected_fields.push({ tag, field_id: fieldId });
    } else {
      invalid_tags.push(tag);
    }
  }

  // 5. Sync document_fields: clear old, insert new
  if (detected_fields.length > 0) {
    await supabase
      .from('document_fields')
      .delete()
      .eq('document_id', documentId);

    const rows = detected_fields.map((f) => ({
      document_id: documentId,
      field_id: f.field_id,
    }));

    const { error: insertErr } = await supabase
      .from('document_fields')
      .insert(rows);

    if (insertErr) {
      console.error('[import-sharepoint-template] document_fields insert error:', insertErr);
    }
  }

  console.log(`[import-sharepoint-template] Scan complete: ${detected_fields.length} valid, ${invalid_tags.length} invalid for document ${documentId}`);

  return {
    detected_fields,
    invalid_tags,
    fields_linked: detected_fields.length,
  };
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

/**
 * Browse folders/files on the Master Documents SharePoint site.
 * Used by the governance import dialog to pick template files.
 *
 * body.folder_id — driveItem id to list children of (omit for root)
 */
async function handleBrowse(
  supabase: ReturnType<typeof createClient>,
  body: Record<string, unknown>,
): Promise<Response> {
  const { folder_id } = body as { folder_id?: string };

  // Look up the master documents site
  const { data: masterSite } = await supabase
    .from('sharepoint_sites')
    .select('graph_site_id, drive_id, site_url')
    .eq('purpose', 'master_documents')
    .eq('is_active', true)
    .limit(1)
    .maybeSingle();

  if (!masterSite) {
    return new Response(JSON.stringify({ error: 'Master Documents site not configured' }), {
      status: 400, headers: { ...corsHeaders, 'Content-Type': 'application/json' },
    });
  }

  // If we don't have the graph_site_id yet, resolve it from the site URL
  let graphSiteId = masterSite.graph_site_id;
  let driveId = masterSite.drive_id;

  if (!graphSiteId && masterSite.site_url) {
    // Extract hostname and path from URL
    const url = new URL(masterSite.site_url);
    const sitePath = url.pathname.replace(/\/$/, '');
    const siteResp = await graphGet<{ id: string }>(`/sites/${url.hostname}:${sitePath}`);
    if (!siteResp.ok) {
      return new Response(JSON.stringify({ error: 'Could not resolve SharePoint site from Graph API' }), {
        status: 400, headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      });
    }
    graphSiteId = siteResp.data.id;

    // Persist for future calls
    await supabase
      .from('sharepoint_sites')
      .update({ graph_site_id: graphSiteId })
      .eq('purpose', 'master_documents')
      .eq('is_active', true);
  }

  if (!driveId) {
    // Get the default document library drive
    const drivesResp = await graphGet<{ value: Array<{ id: string; name: string }> }>(
      `/sites/${graphSiteId}/drives`
    );
    if (!drivesResp.ok || !drivesResp.data.value?.length) {
      return new Response(JSON.stringify({ error: 'Could not find document library drives' }), {
        status: 400, headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      });
    }
    // Prefer "Documents" or "Shared Documents", else first
    const docDrive = drivesResp.data.value.find(d =>
      d.name === 'Documents' || d.name === 'Shared Documents'
    ) || drivesResp.data.value[0];
    driveId = docDrive.id;

    await supabase
      .from('sharepoint_sites')
      .update({ drive_id: driveId })
      .eq('purpose', 'master_documents')
      .eq('is_active', true);
  }

  // List children of the specified folder (or root)
  const listPath = folder_id
    ? `/drives/${driveId}/items/${folder_id}/children?$top=200&$orderby=name`
    : `/drives/${driveId}/root/children?$top=200&$orderby=name`;

  const listResp = await graphGet<{ value: DriveItem[] }>(listPath);
  if (!listResp.ok) {
    return new Response(JSON.stringify({ error: 'Failed to list SharePoint folder contents' }), {
      status: 400, headers: { ...corsHeaders, 'Content-Type': 'application/json' },
    });
  }

  const items = (listResp.data.value || []).map((item) => ({
    id: item.id,
    name: item.name,
    webUrl: item.webUrl,
    isFolder: !!item.folder,
    childCount: item.folder?.childCount || 0,
    size: item.size || 0,
    mimeType: item.file?.mimeType || null,
  }));

  return new Response(JSON.stringify({
    success: true,
    drive_id: driveId,
    items,
  }), {
    headers: { ...corsHeaders, 'Content-Type': 'application/json' },
  });
}
