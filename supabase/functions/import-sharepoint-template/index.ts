import { corsHeaders } from '../_shared/cors.ts';
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2.81.1';
import { requireCaller, FeatureKeys } from '../_shared/requireCaller.ts';
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
    return new Response(null, { headers: corsHeaders(req) });
  }

  try {
    const supabase = createClient(supabaseUrl, supabaseServiceKey);

    const caller = await requireCaller(req, supabase, {
      featureKey: FeatureKeys.staffSharepoint,
      headers: corsHeaders(req),
      unauthorizedMessage: 'Unauthorized',
      forbiddenMessage: 'Forbidden — Vivacity staff only',
    });
    if (!caller.ok) return caller.response;
    const user = caller.user;

    const body = await req.json();
    const { action } = body as { action: string };

    if (action === 'browse') {
      return await handleBrowse(req, supabase, body);
    } else if (action === 'import') {
      return await handleImport(req, supabase, body, user.id);
    } else if (action === 'publish') {
      return await handlePublish(req, supabase, body, user.id);
    } else if (action === 'check_drift') {
      return await handleCheckDrift(req, supabase, body);
    } else {
      return new Response(JSON.stringify({ error: `Unknown action: ${action}. Use "browse", "import", "publish" or "check_drift".` }), {
        status: 400, headers: { ...corsHeaders(req), 'Content-Type': 'application/json' },
      });
    }
  } catch (error) {
    console.error('[import-sharepoint-template] Error:', error);
    return new Response(JSON.stringify({
      error: error instanceof Error ? error.message : 'Unknown error',
    }), {
      status: 500, headers: { ...corsHeaders(req), 'Content-Type': 'application/json' },
    });
  }
});

/**
 * Import a template file from the Master Documents SharePoint site.
 */
async function handleImport(
  req: Request,
  supabase: ReturnType<typeof createClient>,
  body: Record<string, unknown>,
  userId: string,
): Promise<Response> {
  const { document_id, source_drive_id, source_item_id, display_version } = body as {
    document_id: number;
    source_drive_id: string;
    source_item_id: string;
    display_version: string;
  };

  if (!document_id || !source_drive_id || !source_item_id) {
    return new Response(JSON.stringify({ error: 'document_id, source_drive_id, and source_item_id are required' }), {
      status: 400, headers: { ...corsHeaders(req), 'Content-Type': 'application/json' },
    });
  }

  const displayVersionFormat = /^\d{4}\.\d{2}\.\d{2}$/;
  if (!display_version || !displayVersionFormat.test(display_version)) {
    return new Response(JSON.stringify({ error: 'display_version is required and must match YYYY.MM.NN (e.g. 2026.03.00)' }), {
      status: 400, headers: { ...corsHeaders(req), 'Content-Type': 'application/json' },
    });
  }

  const { data: existingLabel } = await supabase
    .from('document_versions')
    .select('id')
    .eq('document_id', document_id)
    .eq('display_version', display_version)
    .maybeSingle();

  if (existingLabel) {
    return new Response(JSON.stringify({ error: `Version ${display_version} already exists for this document. Choose a different label.` }), {
      status: 400, headers: { ...corsHeaders(req), 'Content-Type': 'application/json' },
    });
  }

  // Fetch source file metadata
  const itemResp = await graphGet<DriveItem>(`/drives/${source_drive_id}/items/${source_item_id}`);
  if (!itemResp.ok) {
    return new Response(JSON.stringify({ error: 'Could not retrieve source file from SharePoint' }), {
      status: 400, headers: { ...corsHeaders(req), 'Content-Type': 'application/json' },
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
      status: 500, headers: { ...corsHeaders(req), 'Content-Type': 'application/json' },
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
      display_version,
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
      status: 500, headers: { ...corsHeaders(req), 'Content-Type': 'application/json' },
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

  const lowerName = fileName.toLowerCase();
  const isDocx = lowerName.endsWith('.docx');
  const isPptx = lowerName.endsWith('.pptx');
  if (isDocx || isPptx) {
    try {
      const scanResult = isPptx
        ? await scanPptxMergeFields(fileContent, document_id, supabase)
        : await scanDocxMergeFields(fileContent, document_id, supabase);
      detected_fields = scanResult.detected_fields;
      invalid_tags = scanResult.invalid_tags;
      fields_linked = scanResult.fields_linked;
    } catch (scanErr) {
      console.warn('[import-sharepoint-template] Merge field scan failed (non-fatal):', scanErr);
    }
  }

  // ── Auto-create document_template_mappings row from detected fields ────
  let fields_auto_mapped = 0;
  if (detected_fields.length > 0) {
    try {
      const fieldIds = detected_fields.map((f) => f.field_id);
      const { data: ddRows, error: ddErr } = await supabase
        .from('dd_fields')
        .select('id, name')
        .in('id', fieldIds);
      if (ddErr) throw ddErr;

      const nameById = new Map<number, string>();
      for (const r of ddRows ?? []) nameById.set(r.id as number, r.name as string);

      const mappingJson: Record<string, { label: string; defaultValue: string }> = {};
      for (const f of detected_fields) {
        const label = nameById.get(f.field_id);
        if (!label) continue;
        mappingJson[f.tag] = { label, defaultValue: '' };
      }

      const mappedCount = Object.keys(mappingJson).length;
      if (mappedCount > 0) {
        const canonical = JSON.stringify(mappingJson, Object.keys(mappingJson).sort());
        const checksumSha256 = await sha256Hex(new TextEncoder().encode(canonical));

        const { error: mapErr } = await supabase
          .from('document_template_mappings')
          .insert({
            template_version_id: newVersion.id,
            mapping_json: mappingJson,
            checksum_sha256: checksumSha256,
            created_by: userId,
          });
        if (mapErr) throw mapErr;
        fields_auto_mapped = mappedCount;
      }
    } catch (mapErr) {
      console.warn('[import-sharepoint-template] Auto-mapping insert failed (non-fatal):', mapErr);
    }
  }

  return new Response(JSON.stringify({
    success: true,
    version_id: newVersion.id,
    version_number: nextVersion,
    display_version,
    file_name: fileName,
    checksum_sha256: checksum,
    storage_path: storagePath,
    detected_fields,
    invalid_tags,
    fields_linked,
    fields_auto_mapped,
  }), {
    headers: { ...corsHeaders(req), 'Content-Type': 'application/json' },
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

  return await classifyAndSyncMergeFields(allText, documentId, supabase);
}

/**
 * Scan a PPTX file for {{...}} merge field patterns across all slides.
 * Matches against dd_fields tags and syncs document_fields table.
 */
async function scanPptxMergeFields(
  fileContent: Uint8Array,
  documentId: number,
  supabase: ReturnType<typeof createClient>,
): Promise<{
  detected_fields: Array<{ tag: string; field_id: number }>;
  invalid_tags: string[];
  fields_linked: number;
}> {
  const blob = new Blob([fileContent.slice().buffer]);
  const reader = new zip.ZipReader(new zip.BlobReader(blob));
  const entries = await reader.getEntries();

  const slidePattern = /^ppt\/slides\/slide\d+\.xml$/;

  let allText = '';
  for (const entry of entries) {
    if (!entry.getData) continue;
    if (!slidePattern.test(entry.filename)) continue;

    const data = await entry.getData(new zip.BlobWriter());
    const arrayBuffer = await data.arrayBuffer();
    const xmlContent = new TextDecoder().decode(arrayBuffer);

    // Strip all XML tags to defeat split-run splitting (same tactic as docx)
    allText += xmlContent.replace(/<[^>]+>/g, '') + ' ';
  }
  await reader.close();

  return await classifyAndSyncMergeFields(allText, documentId, supabase);
}

/**
 * Given the raw concatenated text of a template, find {{...}} placeholders,
 * classify against dd_fields, and sync document_fields for the document.
 */
async function classifyAndSyncMergeFields(
  allText: string,
  documentId: number,
  supabase: ReturnType<typeof createClient>,
): Promise<{
  detected_fields: Array<{ tag: string; field_id: number }>;
  invalid_tags: string[];
  fields_linked: number;
}> {
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

  const { data: ddFields } = await supabase
    .from('dd_fields')
    .select('id, tag')
    .eq('is_active', true);

  const tagMap = new Map<string, number>();
  for (const f of ddFields || []) {
    tagMap.set(f.tag, f.id);
  }

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
 * Re-download a version's source file from SharePoint and compare its
 * checksum against what was recorded at import time. Shared by handlePublish
 * (which proceeds if the check can't be completed — a transient Graph API
 * failure shouldn't block publishing) and handleCheckDrift (the standalone
 * "Check for Drift" action, which surfaces failures directly since checking
 * is the entire point of that call).
 */
async function computeDrift(
  supabase: ReturnType<typeof createClient>,
  version: { source_drive_item_id: string | null; checksum_sha256: string | null },
): Promise<{ checked: boolean; drifted: boolean; current_checksum?: string; error?: string }> {
  if (!version.source_drive_item_id || !version.checksum_sha256) {
    return { checked: false, drifted: false, error: 'This version has no recorded source reference to check against.' };
  }

  const { data: masterSite } = await supabase
    .from('sharepoint_sites')
    .select('drive_id')
    .eq('purpose', 'master_documents')
    .eq('is_active', true)
    .limit(1)
    .maybeSingle();

  if (!masterSite?.drive_id) {
    return { checked: false, drifted: false, error: 'Master Documents SharePoint site is not configured.' };
  }

  try {
    const currentContent = await graphDownload(masterSite.drive_id, version.source_drive_item_id);
    const currentChecksum = await sha256Hex(currentContent);
    return {
      checked: true,
      drifted: currentChecksum !== version.checksum_sha256,
      current_checksum: currentChecksum,
    };
  } catch (driftErr) {
    return {
      checked: false,
      drifted: false,
      error: driftErr instanceof Error ? driftErr.message : 'Could not reach SharePoint to check for drift.',
    };
  }
}

/**
 * Read-only drift check for the "Check for Drift" button — does not publish
 * or mutate anything, just reports whether the source file has changed
 * since this version was imported.
 */
async function handleCheckDrift(
  req: Request,
  supabase: ReturnType<typeof createClient>,
  body: Record<string, unknown>,
): Promise<Response> {
  const { version_id } = body as { version_id: string };

  if (!version_id) {
    return new Response(JSON.stringify({ error: 'version_id is required' }), {
      status: 400, headers: { ...corsHeaders(req), 'Content-Type': 'application/json' },
    });
  }

  const { data: version, error: vErr } = await supabase
    .from('document_versions')
    .select('source_drive_item_id, checksum_sha256')
    .eq('id', version_id)
    .single();

  if (vErr || !version) {
    return new Response(JSON.stringify({ error: 'Version not found' }), {
      status: 404, headers: { ...corsHeaders(req), 'Content-Type': 'application/json' },
    });
  }

  const result = await computeDrift(supabase, version);

  return new Response(JSON.stringify(result), {
    headers: { ...corsHeaders(req), 'Content-Type': 'application/json' },
  });
}

/**
 * Publish a draft template version with drift detection.
 */
async function handlePublish(
  req: Request,
  supabase: ReturnType<typeof createClient>,
  body: Record<string, unknown>,
  userId: string,
): Promise<Response> {
  const { version_id } = body as { version_id: string };

  if (!version_id) {
    return new Response(JSON.stringify({ error: 'version_id is required' }), {
      status: 400, headers: { ...corsHeaders(req), 'Content-Type': 'application/json' },
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
      status: 404, headers: { ...corsHeaders(req), 'Content-Type': 'application/json' },
    });
  }

  if (version.status !== 'draft') {
    return new Response(JSON.stringify({ error: `Version is not in draft status (current: ${version.status})` }), {
      status: 400, headers: { ...corsHeaders(req), 'Content-Type': 'application/json' },
    });
  }

  // Check merge field mappings exist. Merge fields are a Word/PowerPoint
  // concept (the auto-scan on import only ever runs for .docx/.pptx) — an
  // Excel workbook can be a perfectly valid, publishable template with zero
  // {{tag}} placeholders, so don't gate it on a mapping table that Excel
  // imports never populate.
  const isExcelFile = /\.(xlsx|xls)$/i.test(version.file_name || '');
  if (!isExcelFile) {
    const { count: mappingCount } = await supabase
      .from('document_template_mappings')
      .select('id', { count: 'exact', head: true })
      .eq('template_version_id', version_id);

    if (!mappingCount || mappingCount === 0) {
      return new Response(JSON.stringify({ error: 'Cannot publish without merge field mappings defined. Add mappings first.' }), {
        status: 400, headers: { ...corsHeaders(req), 'Content-Type': 'application/json' },
      });
    }
  }

  // Drift detection: re-download source and compare checksum. Proceed if the
  // check itself couldn't be completed (transient Graph API failure) — only
  // an actual confirmed mismatch blocks publishing.
  const drift = await computeDrift(supabase, version);
  if (drift.checked && drift.drifted) {
    return new Response(JSON.stringify({
      error: 'Source file has changed since import (checksum mismatch). Re-import the template before publishing.',
      drift_detected: true,
      imported_checksum: version.checksum_sha256,
      current_checksum: drift.current_checksum,
    }), {
      status: 409, headers: { ...corsHeaders(req), 'Content-Type': 'application/json' },
    });
  }
  if (!drift.checked && drift.error) {
    console.warn('[import-sharepoint-template] Drift check failed, proceeding:', drift.error);
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
      status: 500, headers: { ...corsHeaders(req), 'Content-Type': 'application/json' },
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
    headers: { ...corsHeaders(req), 'Content-Type': 'application/json' },
  });
}

/**
 * Browse folders/files on the Master Documents SharePoint site.
 * Used by the governance import dialog to pick template files.
 *
 * body.folder_id — driveItem id to list children of (omit for root)
 */
async function handleBrowse(
  req: Request,
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
      status: 400, headers: { ...corsHeaders(req), 'Content-Type': 'application/json' },
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
        status: 400, headers: { ...corsHeaders(req), 'Content-Type': 'application/json' },
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
        status: 400, headers: { ...corsHeaders(req), 'Content-Type': 'application/json' },
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
      status: 400, headers: { ...corsHeaders(req), 'Content-Type': 'application/json' },
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
    headers: { ...corsHeaders(req), 'Content-Type': 'application/json' },
  });
}
