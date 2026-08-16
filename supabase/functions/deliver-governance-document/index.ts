import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import * as zip from "https://deno.land/x/zipjs@v2.7.32/index.js";
import { requireCaller, FeatureKeys } from "../_shared/requireCaller.ts";
import { createServiceClient } from "../_shared/supabase-client.ts";
import { corsHeaders } from "../_shared/cors.ts";
import {
  graphUploadSmall,
  graphUploadSession,
  graphGet,
  graphDownload,
  ensureFolder,
  resolveDriveItemFromSharingUrl,
  type DriveItem,
} from "../_shared/graph-app-client.ts";
// ── Helpers ────────────────────────────────────────────────────────────────

interface ImageAsset {
  bytes: Uint8Array;
  ext: string; // e.g. "jpg", "png"
}

function inferImageExt(storagePath: string): string {
  const lower = storagePath.split('?')[0].split('#')[0].toLowerCase();
  const m = lower.match(/\.([a-z0-9]+)$/);
  if (!m) return 'png';
  const e = m[1];
  if (e === 'jpeg' || e === 'jpg') return 'jpeg';
  if (e === 'gif') return 'gif';
  if (e === 'bmp') return 'bmp';
  if (e === 'tiff' || e === 'tif') return 'tiff';
  return e === 'png' ? 'png' : 'png';
}

function imageContentType(ext: string): string {
  switch (ext) {
    case 'jpeg': case 'jpg': return 'image/jpeg';
    case 'gif': return 'image/gif';
    case 'bmp': return 'image/bmp';
    case 'tiff': return 'image/tiff';
    default: return 'image/png';
  }
}

function escapeXml(text: string): string {
  return text
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&apos;");
}

/**
 * Normalize merge field tokens that Word has split across XML runs.
 * Word often breaks {{FieldName}} into multiple <w:r> elements like:
 *   <w:t>{</w:t></w:r><w:r><w:t>{FieldName}}</w:t>
 * or even splits the field name itself across runs.
 * 
 * This function reassembles them by:
 * 1. Fixing split {{ and }} delimiters (XML tags between the braces)
 * 2. Removing XML tags from within the field name portion
 */
function normalizeMergeTokens(content: string): string {
  // Step 1: Fix split {{ delimiters — e.g. {<xml>{ → {{
  let result = content.replace(/\{(?:<[^>]*>)+\{/g, '{{');
  // Step 2: Fix split }} delimiters — e.g. }<xml>} → }}
  result = result.replace(/\}(?:<[^>]*>)+\}/g, '}}');
  
  // Step 3: Clean XML tags from within merge field tokens
  // Match {{...}} that may contain XML tags within the field name
  result = result.replace(/\{\{((?:[^}]|\}(?!\}))+)\}\}/g, (_match, inner) => {
    const cleanField = inner.replace(/<[^>]*>/g, '').trim();
    return `{{${cleanField}}}`;
  });
  
  return result;
}

/**
 * Process a DOCX template by replacing {{Tag}} merge fields with resolved values.
 * Supports both text and image injection (Logo field).
 * Returns processed bytes AND a list of all {{...}} tags found in the template.
 */
async function processDocxTemplate(
  templateBytes: Uint8Array,
  mergeData: Record<string, string>,
  imageData: Record<string, ImageAsset>,
): Promise<{ bytes: Uint8Array; detectedTags: string[] }> {
  const blob = new Blob([templateBytes.slice().buffer]);
  const reader = new zip.ZipReader(new zip.BlobReader(blob));
  const entries = await reader.getEntries();

  const writer = new zip.ZipWriter(
    new zip.BlobWriter(
      "application/vnd.openxmlformats-officedocument.wordprocessingml.document",
    ),
  );

  // Track image injections PER source XML file so relationships go to the correct .rels
  const imageInjectionsByFile = new Map<string, Array<{ rId: string; fileName: string }>>();
  let imageCounter = 100;
  // Collect ALL word rels files (deferred for patching)
  const deferredRels = new Map<string, string>();
  let contentTypesContent: string | null = null;
  let contentTypesFilename: string | null = null;

  // Collect all detected {{...}} tags across all XML entries
  const detectedTagsSet = new Set<string>();

  for (const entry of entries) {
    if (!entry.getData) continue;
    const data = await entry.getData(new zip.BlobWriter());
    const arrayBuffer = await data.arrayBuffer();

    if (entry.filename.endsWith(".xml") || entry.filename.endsWith(".rels")) {
      const decoder = new TextDecoder();
      let content = decoder.decode(arrayBuffer);

      // Normalize split merge field tokens BEFORE detection and replacement
      content = normalizeMergeTokens(content);

      // Detect merge field tags from normalized content
      const textOnly = content.replace(/<[^>]+>/g, "");
      const tagPattern = /\{\{\s*([^}]+?)\s*\}\}/g;
      let match;
      while ((match = tagPattern.exec(textOnly)) !== null) {
        const cleanedTag = match[1].replace(/<[^>]+>/g, "").trim();
        if (cleanedTag) {
          detectedTagsSet.add(cleanedTag);
        }
      }

      // Replace text merge fields (tokens are now normalized, so simple split/join works)
      for (const [field, value] of Object.entries(mergeData)) {
        const token = `{{${field}}}`;
        const escapedValue = escapeXml(value || "");
        content = content.split(token).join(escapedValue);
      }

      // Handle split tokens across XML tags
      const splitPattern = /\{\{([^}]+)\}\}/g;
      content = content.replace(splitPattern, (match, fieldName) => {
        const cleanField = fieldName.replace(/<[^>]+>/g, "").trim();
        if (mergeData[cleanField] !== undefined) {
          return escapeXml(mergeData[cleanField] || "");
        }
        if (imageData[cleanField]) {
          const imgAsset = imageData[cleanField];
          const rId = `rIdImg${imageCounter++}`;
          const imgFileName = `image_${cleanField}.${imgAsset.ext}`;
          if (!imageInjectionsByFile.has(entry.filename)) {
            imageInjectionsByFile.set(entry.filename, []);
          }
          imageInjectionsByFile.get(entry.filename)!.push({ rId, fileName: imgFileName });
          console.log(`[deliver] Image injection: tag=${cleanField}, rId=${rId}, sourceFile=${entry.filename}`);
          return `</w:t></w:r><w:r><w:drawing><wp:inline distT="0" distB="0" distL="0" distR="0" xmlns:wp="http://schemas.openxmlformats.org/drawingml/2006/wordprocessingDrawing"><wp:extent cx="1800000" cy="900000"/><wp:docPr id="${imageCounter}" name="${cleanField}"/><wp:cNvGraphicFramePr><a:graphicFrameLocks xmlns:a="http://schemas.openxmlformats.org/drawingml/2006/main" noChangeAspect="1"/></wp:cNvGraphicFramePr><a:graphic xmlns:a="http://schemas.openxmlformats.org/drawingml/2006/main"><a:graphicData uri="http://schemas.openxmlformats.org/drawingml/2006/picture"><pic:pic xmlns:pic="http://schemas.openxmlformats.org/drawingml/2006/picture"><pic:nvPicPr><pic:cNvPr id="${imageCounter}" name="${imgFileName}"/><pic:cNvPicPr/></pic:nvPicPr><pic:blipFill><a:blip r:embed="${rId}" xmlns:r="http://schemas.openxmlformats.org/officeDocument/2006/relationships"/><a:stretch><a:fillRect/></a:stretch></pic:blipFill><pic:spPr><a:xfrm><a:off x="0" y="0"/><a:ext cx="1800000" cy="900000"/></a:xfrm><a:prstGeom prst="rect"><a:avLst/></a:prstGeom></pic:spPr></pic:pic></a:graphicData></a:graphic></wp:inline></w:drawing></w:r><w:r><w:t>`;
        }
        return match;
      });

      if (entry.filename.startsWith('word/_rels/') && entry.filename.endsWith('.rels')) {
        deferredRels.set(entry.filename, content);
      } else if (entry.filename === '[Content_Types].xml') {
        contentTypesContent = content;
        contentTypesFilename = entry.filename;
      } else {
        const encoder = new TextEncoder();
        await writer.add(
          entry.filename,
          new zip.BlobReader(new Blob([encoder.encode(content)])),
        );
      }
    } else {
      await writer.add(
        entry.filename,
        new zip.BlobReader(new Blob([arrayBuffer])),
      );
    }
  }

  // Inject image relationships into the correct rels file for each source XML
  for (const [sourceFile, injections] of imageInjectionsByFile) {
    const parts = sourceFile.split('/');
    const fileName = parts.pop()!;
    const dir = parts.join('/');
    const relsPath = `${dir}/_rels/${fileName}.rels`;

    let rc = deferredRels.get(relsPath);
    if (!rc) {
      rc = '<?xml version="1.0" encoding="UTF-8" standalone="yes"?><Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships"></Relationships>';
      console.log(`[deliver] Creating rels file: ${relsPath} for image injections from ${sourceFile}`);
    }

    const relEntries = injections.map(
      (img) =>
        `<Relationship Id="${img.rId}" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/image" Target="media/${img.fileName}"/>`
    ).join('');
    rc = rc.replace('</Relationships>', relEntries + '</Relationships>');
    deferredRels.set(relsPath, rc);
  }

  // Write all deferred rels files
  for (const [relsPath, rc] of deferredRels) {
    const encoder = new TextEncoder();
    await writer.add(
      relsPath,
      new zip.BlobReader(new Blob([encoder.encode(rc)])),
    );
  }

  // Patch [Content_Types].xml with image extensions
  if (contentTypesContent !== null && contentTypesFilename !== null) {
    const requiredExts = new Set(Object.values(imageData).map(a => a.ext));
    for (const ext of requiredExts) {
      if (!new RegExp(`Extension="${ext}"`, 'i').test(contentTypesContent)) {
        contentTypesContent = contentTypesContent.replace(
          '</Types>',
          `<Default Extension="${ext}" ContentType="${imageContentType(ext)}"/></Types>`
        );
      }
    }
    const encoder = new TextEncoder();
    await writer.add(
      contentTypesFilename,
      new zip.BlobReader(new Blob([encoder.encode(contentTypesContent)])),
    );
  }

  for (const [field, imgAsset] of Object.entries(imageData)) {
    const imgFileName = `image_${field}.${imgAsset.ext}`;
    await writer.add(
      `word/media/${imgFileName}`,
      new zip.BlobReader(new Blob([imgAsset.bytes])),
    );
  }

  await reader.close();
  const result = await writer.close();
  return {
    bytes: new Uint8Array(await result.arrayBuffer()),
    detectedTags: Array.from(detectedTagsSet),
  };
}

/**
 * Process a PPTX template by replacing {{Tag}} merge fields with resolved values.
 * Supports both text and image injection (Logo field).
 * Returns processed bytes AND a list of all {{...}} tags found in the template.
 *
 * PPTX structure differs from DOCX:
 *  - Text runs use <a:t> instead of <w:t>
 *  - Slides live in ppt/slides/slide*.xml
 *  - Relationships in ppt/slides/_rels/slide*.xml.rels
 *  - Media in ppt/media/
 */
async function processPptxTemplate(
  templateBytes: Uint8Array,
  mergeData: Record<string, string>,
  imageData: Record<string, ImageAsset>,
): Promise<{ bytes: Uint8Array; detectedTags: string[] }> {
  const blob = new Blob([templateBytes.slice().buffer]);
  const reader = new zip.ZipReader(new zip.BlobReader(blob));
  const entries = await reader.getEntries();

  const writer = new zip.ZipWriter(
    new zip.BlobWriter(
      "application/vnd.openxmlformats-officedocument.presentationml.presentation",
    ),
  );

  // Track image injections per slide rels file
  const slideRelsMap = new Map<string, { content: string; injections: Array<{ rId: string; fileName: string }> }>();
  let imageCounter = 100;
  let contentTypesContent: string | null = null;
  let contentTypesFilename: string | null = null;

  const detectedTagsSet = new Set<string>();

  for (const entry of entries) {
    if (!entry.getData) continue;
    const data = await entry.getData(new zip.BlobWriter());
    const arrayBuffer = await data.arrayBuffer();

    if (entry.filename.endsWith(".xml") || entry.filename.endsWith(".rels")) {
      const decoder = new TextDecoder();
      let content = decoder.decode(arrayBuffer);

      // Normalize split merge field tokens BEFORE detection and replacement
      content = normalizeMergeTokens(content);

      // Detect merge field tags in text content
      const textOnly = content.replace(/<[^>]+>/g, "");
      const tagPattern = /\{\{\s*([^}]+?)\s*\}\}/g;
      let match;
      while ((match = tagPattern.exec(textOnly)) !== null) {
        const cleanedTag = match[1].replace(/<[^>]+>/g, "").trim();
        if (cleanedTag) {
          detectedTagsSet.add(cleanedTag);
        }
      }

      // Replace text merge fields (tokens are now normalized)
      for (const [field, value] of Object.entries(mergeData)) {
        const token = `{{${field}}}`;
        const escapedValue = escapeXml(value || "");
        content = content.split(token).join(escapedValue);
      }

      // Handle split tokens across XML tags (PowerPoint sometimes splits runs)
      const splitPattern = /\{\{([^}]+)\}\}/g;
      content = content.replace(splitPattern, (fullMatch, fieldName) => {
        const cleanField = fieldName.replace(/<[^>]+>/g, "").trim();
        if (mergeData[cleanField] !== undefined) {
          return escapeXml(mergeData[cleanField] || "");
        }
        if (imageData[cleanField]) {
          const imgAsset = imageData[cleanField];
          const rId = `rIdImg${imageCounter++}`;
          const imgFileName = `image_${cleanField}.${imgAsset.ext}`;

          // Track the relationship for the slide's .rels file
          const slideMatch = entry.filename.match(/^ppt\/slides\/(slide\d+)\.xml$/);
          if (slideMatch) {
            const relsPath = `ppt/slides/_rels/${slideMatch[1]}.xml.rels`;
            if (!slideRelsMap.has(relsPath)) {
              slideRelsMap.set(relsPath, { content: '', injections: [] });
            }
            slideRelsMap.get(relsPath)!.injections.push({ rId, fileName: imgFileName });
          }

          // Replace the {{Logo}} text run with an inline picture element in PPTX DrawingML
          // cx/cy in EMUs: 1800000 = ~1.27cm width, 900000 = ~0.63cm height (same as DOCX)
          return `</a:t></a:r></a:p><a:p><a:r><a:rPr lang="en-AU" dirty="0"/><a:drawing><a:inline distT="0" distB="0" distL="0" distR="0"><a:extent cx="1800000" cy="900000"/><a:docPr id="${imageCounter}" name="${cleanField}"/><a:graphic><a:graphicData uri="http://schemas.openxmlformats.org/drawingml/2006/picture"><pic:pic xmlns:pic="http://schemas.openxmlformats.org/drawingml/2006/picture"><pic:nvPicPr><pic:cNvPr id="${imageCounter}" name="${imgFileName}"/><pic:cNvPicPr/></pic:nvPicPr><pic:blipFill><a:blip r:embed="${rId}"/><a:stretch><a:fillRect/></a:stretch></pic:blipFill><pic:spPr><a:xfrm><a:off x="0" y="0"/><a:ext cx="1800000" cy="900000"/></a:xfrm><a:prstGeom prst="rect"><a:avLst/></a:prstGeom></pic:spPr></pic:pic></a:graphicData></a:graphic></a:inline></a:drawing></a:r><a:r><a:rPr lang="en-AU" dirty="0"/><a:t>`;
        }
        return fullMatch;
      });

      // Check if this is a slide rels file we need to track
      if (entry.filename.match(/^ppt\/slides\/_rels\/slide\d+\.xml\.rels$/)) {
        const existing = slideRelsMap.get(entry.filename);
        if (existing) {
          existing.content = content;
        } else {
          slideRelsMap.set(entry.filename, { content, injections: [] });
        }
      } else if (entry.filename === '[Content_Types].xml') {
        contentTypesContent = content;
        contentTypesFilename = entry.filename;
      } else {
        const encoder = new TextEncoder();
        await writer.add(
          entry.filename,
          new zip.BlobReader(new Blob([encoder.encode(content)])),
        );
      }
    } else {
      await writer.add(
        entry.filename,
        new zip.BlobReader(new Blob([arrayBuffer])),
      );
    }
  }

  // Write slide rels files with image relationships injected
  for (const [relsPath, { content, injections }] of slideRelsMap) {
    let relsContent = content;
    if (injections.length > 0 && relsContent) {
      const relEntries = injections.map(
        (img) =>
          `<Relationship Id="${img.rId}" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/image" Target="../media/${img.fileName}"/>`
      ).join('');
      relsContent = relsContent.replace('</Relationships>', relEntries + '</Relationships>');
    }
    if (relsContent) {
      const encoder = new TextEncoder();
      await writer.add(
        relsPath,
        new zip.BlobReader(new Blob([encoder.encode(relsContent)])),
      );
    }
  }

  // Patch [Content_Types].xml with image extensions
  if (contentTypesContent !== null && contentTypesFilename !== null) {
    const requiredExts = new Set(Object.values(imageData).map(a => a.ext));
    for (const ext of requiredExts) {
      if (!new RegExp(`Extension="${ext}"`, 'i').test(contentTypesContent)) {
        contentTypesContent = contentTypesContent.replace(
          '</Types>',
          `<Default Extension="${ext}" ContentType="${imageContentType(ext)}"/></Types>`
        );
      }
    }
    const encoder = new TextEncoder();
    await writer.add(
      contentTypesFilename,
      new zip.BlobReader(new Blob([encoder.encode(contentTypesContent)])),
    );
  }

  // Add image files to ppt/media/
  for (const [field, imgAsset] of Object.entries(imageData)) {
    const imgFileName = `image_${field}.${imgAsset.ext}`;
    await writer.add(
      `ppt/media/${imgFileName}`,
      new zip.BlobReader(new Blob([imgAsset.bytes])),
    );
  }

  await reader.close();
  const result = await writer.close();
  return {
    bytes: new Uint8Array(await result.arrayBuffer()),
    detectedTags: Array.from(detectedTagsSet),
  };
}

/**
 * Process XLSX/XLSM templates by replacing {{Tag}} merge fields in workbook XML.
 * Returns processed bytes AND a list of all {{...}} tags found in the template.
 */
async function processXlsxTemplate(
  templateBytes: Uint8Array,
  mergeData: Record<string, string>,
): Promise<{ bytes: Uint8Array; detectedTags: string[] }> {
  const blob = new Blob([templateBytes.slice().buffer]);
  const reader = new zip.ZipReader(new zip.BlobReader(blob));
  const entries = await reader.getEntries();
  const writer = new zip.ZipWriter(
    new zip.BlobWriter("application/vnd.openxmlformats-officedocument.spreadsheetml.sheet"),
  );
  const detectedTagsSet = new Set<string>();

  for (const entry of entries) {
    if (!entry.getData) continue;
    const data = await entry.getData(new zip.BlobWriter());
    const arrayBuffer = await data.arrayBuffer();

    if (entry.filename.endsWith(".xml") || entry.filename.endsWith(".rels")) {
      let content = new TextDecoder().decode(arrayBuffer);
      content = normalizeMergeTokens(content);

      const textOnly = content.replace(/<[^>]+>/g, "");
      const tagPattern = /\{\{\s*([^}]+?)\s*\}\}/g;
      let match;
      while ((match = tagPattern.exec(textOnly)) !== null) {
        const cleanedTag = match[1].replace(/<[^>]+>/g, "").trim();
        if (cleanedTag) detectedTagsSet.add(cleanedTag);
      }

      content = content.replace(/\{\{([^}]+)\}\}/g, (fullMatch, fieldName) => {
        const cleanField = fieldName.replace(/<[^>]+>/g, "").trim();
        return mergeData[cleanField] !== undefined ? escapeXml(mergeData[cleanField] || "") : fullMatch;
      });

      await writer.add(entry.filename, new zip.BlobReader(new Blob([new TextEncoder().encode(content)])));
    } else {
      await writer.add(entry.filename, new zip.BlobReader(new Blob([arrayBuffer])));
    }
  }

  await reader.close();
  const result = await writer.close();
  return {
    bytes: new Uint8Array(await result.arrayBuffer()),
    detectedTags: Array.from(detectedTagsSet),
  };
}

/**
 * For non-DOCX/PPTX/XLSX formats (e.g. legacy XLS), scan for merge field tags without processing.
 * Returns the original bytes unchanged.
 */
async function scanTemplateForTags(
  templateBytes: Uint8Array,
): Promise<{ bytes: Uint8Array; detectedTags: string[] }> {
  const detectedTagsSet = new Set<string>();

  try {
    const blob = new Blob([templateBytes.slice().buffer]);
    const reader = new zip.ZipReader(new zip.BlobReader(blob));
    const entries = await reader.getEntries();

    for (const entry of entries) {
      if (!entry.getData) continue;
      if (!entry.filename.endsWith(".xml") && !entry.filename.endsWith(".rels")) continue;

      const data = await entry.getData(new zip.BlobWriter());
      const arrayBuffer = await data.arrayBuffer();
      const textOnly = new TextDecoder().decode(arrayBuffer).replace(/<[^>]+>/g, "");
      const tagPattern = /\{\{\s*([^}]+?)\s*\}\}/g;
      let match;
      while ((match = tagPattern.exec(textOnly)) !== null) {
        const cleanedTag = match[1].replace(/<[^>]+>/g, "").trim();
        if (cleanedTag) detectedTagsSet.add(cleanedTag);
      }
    }
    await reader.close();
  } catch {
    // Not a ZIP file or couldn't scan — return empty tags
  }

  return {
    bytes: templateBytes,
    detectedTags: Array.from(detectedTagsSet),
  };
}

function sanitiseFileName(name: string): string {
  return name.replace(/[^a-zA-Z0-9_\-. ]/g, "").replace(/\s+/g, "_");
}

type MergeFieldRow = {
  field_tag: string;
  field_type: string;
  value: string | null;
};

async function resolveMergeFields(
  supabase: ReturnType<typeof createServiceClient>,
  tenantId: number,
): Promise<MergeFieldRow[]> {
  const { data, error } = await supabase.rpc("resolve_tenant_merge_fields", {
    p_tenant_id: tenantId,
  });

  if (!error && Array.isArray(data) && data.length > 0) {
    return data as MergeFieldRow[];
  }

  if (error) {
    console.warn(`[deliver] resolve_tenant_merge_fields returned no rows: ${error.message}`);
  }

  const { data: fieldDefs, error: defsError } = await supabase
    .from("dd_fields")
    .select("tag, field_type, source_table, source_column, source_address_type")
    .eq("is_active", true);

  if (defsError) throw defsError;

  const rows: MergeFieldRow[] = [];
  for (const field of fieldDefs || []) {
    let value: string | null = null;
    if (field.source_table === "tenants" && field.source_column) {
      const { data: row } = await supabase
        .from("tenants")
        .select(field.source_column)
        .eq("id", tenantId)
        .maybeSingle();
      const raw = row?.[field.source_column as keyof typeof row];
      value = raw == null ? null : String(raw);
    } else if (field.source_table === "tenant_profile" && field.source_column) {
      const { data: row } = await supabase
        .from("tenant_profile")
        .select(field.source_column)
        .eq("tenant_id", tenantId)
        .maybeSingle();
      const raw = row?.[field.source_column as keyof typeof row];
      value = raw == null ? null : String(raw);
    } else if (field.source_table === "tenant_addresses") {
      const { data: row } = await supabase
        .from("tenant_addresses")
        .select("address1, address2, suburb, state, postcode")
        .eq("tenant_id", tenantId)
        .eq("address_type", field.source_address_type)
        .order("created_at", { ascending: false })
        .limit(1)
        .maybeSingle();
      if (row) {
        if (field.source_column === "full_address") {
          value = [row.address1, row.address2, row.suburb, row.state, row.postcode].filter(Boolean).join(", ");
        } else if (field.source_column === "address1") {
          value = [row.address1, row.address2].filter(Boolean).join(", ");
        } else if (field.source_column) {
          const raw = row[field.source_column as keyof typeof row];
          value = raw == null ? null : String(raw);
        }
      }
    } else if (field.source_table === "tga_rto_snapshots") {
      const { data: snap } = await supabase
        .from("tga_rto_snapshots")
        .select("payload")
        .eq("tenant_id", tenantId)
        .order("created_at", { ascending: false })
        .limit(1)
        .maybeSingle();
      value = (snap?.payload as any)?.registrations?.[0]?.endDate ?? null;
    }

    rows.push({ field_tag: field.tag, field_type: field.field_type, value });
  }

  return rows;
}

// ── Main Handler ───────────────────────────────────────────────────────────

serve(async (req) => {
  if (req.method === "OPTIONS") {
    return new Response(null, { headers: corsHeaders(req) });
  }

  try {
    const supabase = createServiceClient();

    // Staff gate via check_permission. JWT user_metadata unicorn_role is
    // user-editable and is no longer consulted (tightening vs the previous
    // claim/metadata fallback). Bearer parse is the C1 two-part rule.
    const caller = await requireCaller(req, supabase, {
      featureKey: FeatureKeys.staffDocumentsGenerate,
      headers: corsHeaders(req),
      unauthorizedMessage: "Missing authorization",
      forbiddenMessage: "Permission denied — Vivacity staff only",
    });
    if (!caller.ok) return caller.response;
    const userId = caller.user.id;

    console.log("[deliver] auth", { userId, via: caller.via });


    // Parse request
    const body = await req.json();
    const { tenant_id, document_version_id, allow_incomplete, snapshot_id: pinned_snapshot_id, force, batch_id } = body;
    if (!tenant_id || !document_version_id) {
      return new Response(
        JSON.stringify({ error: "tenant_id and document_version_id are required" }),
        { status: 400, headers: { ...corsHeaders(req), "Content-Type": "application/json" } },
      );
    }

    console.log(`[deliver] Starting delivery: tenant=${tenant_id}, version=${document_version_id}, force=${!!force}`);

    // ── Load version + document ────────────────────────────────────────────
    const { data: version, error: vErr } = await supabase
      .from("document_versions")
      .select("*, document:documents!document_versions_document_id_fkey(id, title, category, format, framework_type, source_template_url)")
      .eq("id", document_version_id)
      .single();

    console.log("[deliver] version lookup", { found: !!version, error: vErr?.message ?? null, document_version_id });

    if (vErr || !version) {
      return new Response(JSON.stringify({ error: "Document version not found", detail: vErr?.message }), {
        status: 404,
        headers: { ...corsHeaders(req), "Content-Type": "application/json" },
      });
    }

    const doc = version.document as any;
    if (!doc) {
      return new Response(JSON.stringify({ error: "Parent document not found" }), {
        status: 404,
        headers: { ...corsHeaders(req), "Content-Type": "application/json" },
      });
    }

    // ── Get snapshot for idempotency ───────────────────────────────────────
    let snapshotId: string | null;
    if (pinned_snapshot_id) {
      snapshotId = pinned_snapshot_id;
    } else {
      const { data: latestSnapshot } = await supabase
        .from("tga_rto_snapshots")
        .select("id")
        .eq("tenant_id", tenant_id)
        .order("created_at", { ascending: false })
        .limit(1)
        .maybeSingle();
      snapshotId = latestSnapshot?.id || null;
    }

    // ── Idempotency check (skip if force=true) ─────────────────────────────
    if (!force) {
      const idempotencyQuery = supabase
        .from("governance_document_deliveries")
        .select("*")
        .eq("tenant_id", tenant_id)
        .eq("document_version_id", document_version_id)
        .eq("status", "success");

      if (snapshotId) {
        idempotencyQuery.eq("snapshot_id", snapshotId);
      } else {
        idempotencyQuery.is("snapshot_id", null);
      }

      const { data: existing } = await idempotencyQuery.maybeSingle();

      if (existing) {
        console.log(`[deliver] Already delivered — returning existing record ${existing.id}`);
        return new Response(
          JSON.stringify({ success: true, skipped: true, delivery: existing }),
          { headers: { ...corsHeaders(req), "Content-Type": "application/json" } },
        );
      }
    } else {
      console.log("[deliver] Force flag set — skipping idempotency check");
    }

    // ── Clean up previous delivery records for this combo ──────────────
    // Prevents unique constraint violation on retry or force re-generation
    {
      const statusesToClean = force ? ["failed", "success"] : ["failed"];
      for (const cleanStatus of statusesToClean) {
        const delQuery = supabase
          .from("governance_document_deliveries")
          .delete()
          .eq("tenant_id", tenant_id)
          .eq("document_version_id", document_version_id)
          .eq("status", cleanStatus);
        if (snapshotId) {
          delQuery.eq("snapshot_id", snapshotId);
        } else {
          delQuery.is("snapshot_id", null);
        }
        await delQuery;
      }
    }

    // ── Load template bytes ────────────────────────────────────────────────
    // Two sources, in order: Supabase storage (legacy import) → SharePoint Master Documents.
    const storagePath = version.frozen_storage_path || version.storage_path || version.file_path;
    const sourceTemplateUrl = (doc.source_template_url ?? "").trim();
    let templateBytes: Uint8Array | null = null;
    let templateSource: "supabase_storage" | "sharepoint_master" | null = null;

    if (storagePath && String(storagePath).trim() !== "") {
      const { data: templateBlob, error: dlErr } = await supabase.storage
        .from("document-files")
        .download(storagePath);
      if (dlErr || !templateBlob) {
        throw new Error(`Failed to download template from storage: ${dlErr?.message}`);
      }
      templateBytes = new Uint8Array(await templateBlob.arrayBuffer());
      templateSource = "supabase_storage";
      console.log(`[deliver] template loaded from supabase storage: ${storagePath}`);
    } else if (sourceTemplateUrl) {
      try {
        const resolved = await resolveDriveItemFromSharingUrl(sourceTemplateUrl);
        templateBytes = await graphDownload(resolved.driveId, resolved.itemId);
        templateSource = "sharepoint_master";
        console.log(`[deliver] template loaded from SharePoint: ${resolved.name} (${resolved.itemId})`);
      } catch (err) {
        const msg = err instanceof Error ? err.message : String(err);
        return new Response(JSON.stringify({ error: `Failed to download template from SharePoint: ${msg}` }), {
          status: 502,
          headers: { ...corsHeaders(req), "Content-Type": "application/json" },
        });
      }
    } else {
      return new Response(JSON.stringify({ error: "No template source: neither Supabase storage_path nor documents.source_template_url is set" }), {
        status: 400,
        headers: { ...corsHeaders(req), "Content-Type": "application/json" },
      });
    }
    void templateSource;

    // ── Fetch merge fields ─────────────────────────────────────────────────
    // Delivery is a staff-only server action; resolve values with the service client
    // so overwrite runs are not blocked by auth.uid()-dependent view semantics.
    const mergeFieldRows = await resolveMergeFields(supabase, tenant_id);
    console.log(`[deliver] merge fields fetched: ${mergeFieldRows?.length ?? 0} rows for tenant ${tenant_id}`);

    const mergeData: Record<string, string> = {};
    const imageFields: string[] = [];
    for (const row of mergeFieldRows || []) {
      if (row.field_type === "image") {
        imageFields.push(row.field_tag);
      } else {
        mergeData[row.field_tag] = row.value ?? "";
      }
    }

    // ── Download image assets (e.g. Logo) ──────────────────────────────────
    const imageData: Record<string, ImageAsset> = {};
    for (const tag of imageFields) {
      const imageValue = mergeFieldRows?.find((r) => r.field_tag === tag)?.value;
      if (imageValue) {
        try {
          const { data: imgBlob } = await supabase.storage
            .from("client-logos")
            .download(imageValue);
          if (imgBlob) {
            const ext = inferImageExt(imageValue);
            imageData[tag] = {
              bytes: new Uint8Array(await imgBlob.arrayBuffer()),
              ext,
            };
          }
        } catch (e) {
          console.warn(`[deliver] Could not download image for ${tag}: ${e}`);
        }
      }
    }

    // ── Tailoring Validation ───────────────────────────────────────────────

    // 1. Query required fields from document_fields
    const { data: requiredFieldRows } = await supabase
      .from("document_fields")
      .select("field:dd_fields(tag)")
      .eq("document_id", doc.id);

    const requiredTags = (requiredFieldRows || [])
      .map((r: any) => r.field?.tag)
      .filter(Boolean) as string[];

    // 2. Check which required tags have non-empty values
    const mergeValueMap = new Map(
      (mergeFieldRows || []).map((r) => [r.field_tag, r.value])
    );

    const missingTags = requiredTags.filter((tag) => {
      const val = mergeValueMap.get(tag);
      return !val || val.trim() === "";
    });

    // 3. Get all known dd_fields tags for invalid tag detection
    const { data: allDdFields } = await supabase
      .from("dd_fields")
      .select("tag");
    const knownTags = new Set((allDdFields || []).map((f) => f.tag));

    // ── Process template based on format ──────────────────────────────────
    const docFormat = ((doc.format as string) || '').toLowerCase();
    let processedBytes: Uint8Array;
    let detectedTags: string[];

    if (docFormat === 'pptx') {
      const result = await processPptxTemplate(templateBytes, mergeData, imageData);
      processedBytes = result.bytes;
      detectedTags = result.detectedTags;
    } else if (docFormat === 'docx') {
      const result = await processDocxTemplate(templateBytes, mergeData, imageData);
      processedBytes = result.bytes;
      detectedTags = result.detectedTags;
    } else if (docFormat === 'xlsx' || docFormat === 'xlsm') {
      const result = await processXlsxTemplate(templateBytes, mergeData);
      processedBytes = result.bytes;
      detectedTags = result.detectedTags;
    } else {
      // Legacy XLS, PDF, etc. — pass through unchanged, just scan for tags
      const result = await scanTemplateForTags(templateBytes);
      processedBytes = result.bytes;
      detectedTags = result.detectedTags;
    }

    // 4. Detect invalid tags (not in dd_fields at all)
    const invalidTags = detectedTags.filter((tag) => !knownTags.has(tag));

    // 4b. Detect unreplaced tags — tags found in template but with empty/missing values
    const allMergeKeys = new Set(Object.keys(mergeData));
    const imageFieldSet = new Set(imageFields);
    const unreplacedTags = detectedTags.filter((tag) => {
      if (invalidTags.includes(tag)) return false; // already tracked as invalid
      if (imageFieldSet.has(tag)) return false; // image fields handled separately
      if (allMergeKeys.has(tag) && mergeData[tag]?.trim()) return false; // has a value
      return true; // known tag but empty/missing value
    });

    // 5. Calculate risk level
    const totalRequired = requiredTags.length;
    const populatedCount = totalRequired - missingTags.length;
    const completeness = totalRequired > 0 ? Math.round((populatedCount / totalRequired) * 100) : 100;

    let riskLevel: string;
    if (completeness === 100 && invalidTags.length === 0 && unreplacedTags.length === 0) {
      riskLevel = "complete";
    } else if (completeness >= 75) {
      riskLevel = "partial";
    } else {
      riskLevel = "incomplete";
    }

    console.log(`[deliver] Tailoring: ${completeness}% complete, ${missingTags.length} missing, ${invalidTags.length} invalid, ${unreplacedTags.length} unreplaced, risk=${riskLevel}`);

    // 6. Block if incomplete unless overridden
    if (riskLevel === "incomplete" && !allow_incomplete) {
      return new Response(
        JSON.stringify({
          error: "Tailoring incomplete — delivery blocked",
          tailoring: {
            completeness_pct: completeness,
            missing_fields: missingTags,
            invalid_fields: invalidTags,
            risk_level: riskLevel,
          },
        }),
        { status: 422, headers: { ...corsHeaders(req), "Content-Type": "application/json" } },
      );
    }

    // ── Resolve tenant info for file naming ────────────────────────────────
    const { data: tenant } = await supabase
      .from("tenants")
      .select("name")
      .eq("id", tenant_id)
      .single();

    const tenantName = sanitiseFileName(tenant?.name || `tenant_${tenant_id}`);
    const docTitle = sanitiseFileName(doc.title || "document");
    const fileExt = docFormat || 'docx';
    const deliveredFileName = `${docTitle}.${fileExt}`;

    // ── Resolve SharePoint folder ──────────────────────────────────────────
    const { data: spSettings } = await supabase
      .from("tenant_sharepoint_settings")
      .select("drive_id, shared_folder_item_id")
      .eq("tenant_id", tenant_id)
      .maybeSingle();

    if (!spSettings?.drive_id || !spSettings?.shared_folder_item_id) {
      const errorMsg = "No shared folder configured for this tenant. Please configure the Shared Folder in Admin → Integrations → SharePoint before generating documents.";
      await supabase.from("governance_document_deliveries").insert({
        tenant_id,
        document_id: doc.id,
        document_version_id,
        snapshot_id: snapshotId,
        status: "failed",
        delivered_file_name: deliveredFileName,
        delivered_by: userId,
        error_message: errorMsg,
        tailoring_completeness_pct: completeness,
        missing_merge_fields: missingTags,
        invalid_merge_fields: invalidTags,
        tailoring_risk_level: riskLevel,
      });
      return new Response(
        JSON.stringify({ error: errorMsg, error_code: "SHARED_FOLDER_MISSING" }),
        { status: 400, headers: { ...corsHeaders(req), "Content-Type": "application/json" } },
      );
    }


    const driveId = spSettings.drive_id as string;
    const sharedRootId = spSettings.shared_folder_item_id as string;
    let categorySubfolder: string | null = null;

    // ── Resolve shared folder root path ────────────────────────────────────
    const sharedRootInfo = await graphGet<DriveItem>(
      `/drives/${driveId}/items/${sharedRootId}`,
    );
    if (!sharedRootInfo.ok) {
      throw new Error(`Could not resolve shared folder root (${sharedRootId})`);
    }
    const sharedParentRef = sharedRootInfo.data.parentReference as { path?: string } | undefined;
    const sharedFullPath = sharedParentRef?.path
      ? `${sharedParentRef.path.replace(/^\/drives\/[^/]+\/root:/, '')}/${sharedRootInfo.data.name}`
      : sharedRootInfo.data.name;
    let cleanPath = sharedFullPath.replace(/^\//, '');

    // ── Navigate into "- Governance" ───────────────────────────────────────
    const govSub = await ensureFolder(driveId, cleanPath, "- Governance");
    let parentItemId = govSub.itemId;
    cleanPath = `${cleanPath}/- Governance`;

    // ── Framework subfolder (e.g. "RTO", "CRICOS", "GTO") ──────────────────
    const frameworkType = doc.framework_type as string | null;
    if (frameworkType) {
      const frameworkFolderName = frameworkType.toUpperCase();
      try {
        const sub = await ensureFolder(driveId, cleanPath, frameworkFolderName);
        parentItemId = sub.itemId;
        cleanPath = `${cleanPath}/${frameworkFolderName}`;
      } catch (e) {
        console.warn(`[deliver] Could not resolve framework subfolder: ${e}`);
      }
    }

    if (doc.category) {
      const { data: catRow } = await supabase
        .from("dd_document_categories")
        .select("label")
        .eq("value", doc.category)
        .maybeSingle();

      const folderName = catRow?.label || null;

      if (folderName) {
        try {
          const sub = await ensureFolder(driveId, cleanPath, folderName);
          parentItemId = sub.itemId;
          cleanPath = `${cleanPath}/${folderName}`;
          categorySubfolder = folderName;
        } catch (e) {
          console.warn(`[deliver] Could not resolve category subfolder: ${e}`);
        }
      }
    }

    // ── Upload to SharePoint (with retry for locked files) ───────────────
    const FOUR_MB = 4 * 1024 * 1024;
    let driveItem: DriveItem;
    const maxRetries = 3;
    for (let attempt = 1; attempt <= maxRetries; attempt++) {
      try {
        if (processedBytes.byteLength < FOUR_MB) {
          driveItem = await graphUploadSmall(driveId, parentItemId, deliveredFileName, processedBytes);
        } else {
          driveItem = await graphUploadSession(driveId, parentItemId, deliveredFileName, processedBytes);
        }
        break; // success
      } catch (uploadErr: unknown) {
        const errMsg = uploadErr instanceof Error ? uploadErr.message : String(uploadErr);
        const isLocked = errMsg.includes('resourceLocked') || errMsg.includes('423') || errMsg.includes('locked');
        
        if (isLocked && attempt < maxRetries) {
          console.warn(`[deliver] File locked on attempt ${attempt}, retrying in ${attempt * 2}s...`);
          await new Promise((r) => setTimeout(r, attempt * 2000));
          continue;
        }

        if (isLocked) {
          throw new Error(
            `The file "${deliveredFileName}" is currently locked in SharePoint (likely open by another user or checked out). ` +
            `Please close the file in SharePoint/Word and try again.`
          );
        }
        throw uploadErr;
      }
    }

    console.log(`[deliver] Uploaded to SharePoint: ${driveItem.webUrl}`);





    // ── Atomically record the delivery and mark document_instances generated ──
    // Both writes (plus resolving any open document_generation_errors) happen
    // inside a single DB function call, which Postgres runs as one implicit
    // transaction. Previously these were two separate, non-transactional
    // client calls: if the delivery insert failed after the document_instances
    // update had already succeeded, a document could end up showing as fully
    // generated (real SharePoint file, isgenerated=true) with no matching
    // governance_document_deliveries row at all — confirmed against live data
    // for one document across 25 instances. Wrapping both in one function call
    // means either both succeed or neither does.
    const { data: delivery, error: rpcErr } = await supabase.rpc(
      "record_governance_delivery_and_mark_generated",
      {
        p_tenant_id: tenant_id,
        p_document_id: doc.id,
        p_document_version_id: document_version_id,
        p_snapshot_id: snapshotId,
        p_sharepoint_item_id: driveItem.id,
        p_sharepoint_web_url: driveItem.webUrl,
        p_delivered_file_name: deliveredFileName,
        p_category_subfolder: categorySubfolder,
        p_delivered_by: userId,
        p_tailoring_completeness_pct: completeness,
        p_missing_merge_fields: missingTags,
        p_invalid_merge_fields: invalidTags,
        p_tailoring_risk_level: riskLevel,
        p_batch_id: batch_id ?? null,
      },
    );

    if (rpcErr) {
      throw new Error(`Failed to record delivery: ${rpcErr.message}`);
    }

    // ── Audit log ──────────────────────────────────────────────────────────
    await supabase.from("document_activity_log").insert({
      tenant_id,
      activity_type: "governance_document_delivered",
      document_id: doc.id,
      actor_user_id: userId,
      metadata: {
        document_version_id,
        delivery_id: delivery.id,
        delivered_file_name: deliveredFileName,
        sharepoint_web_url: driveItem.webUrl,
        snapshot_id: snapshotId,
        tailoring_completeness_pct: completeness,
        tailoring_risk_level: riskLevel,
        missing_merge_fields: missingTags,
        invalid_merge_fields: invalidTags,
      },
    });

    return new Response(
      JSON.stringify({
        success: true,
        skipped: false,
        delivery,
        warnings: {
          unreplaced_fields: unreplacedTags,
          invalid_fields: invalidTags,
          missing_fields: missingTags,
        },

      }),
      { headers: { ...corsHeaders(req), "Content-Type": "application/json" } },
    );
  } catch (error) {
    console.error("[deliver] Error:", error);
    const msg = error instanceof Error ? error.message : "Internal server error";

    // ── Track failure on document_instances ─────────────────────────────────
    try {
      if (doc?.id && tenant_id) {
        const { data: failedInstances } = await supabase
          .from("document_instances")
          .select("id")
          .eq("document_id", doc.id)
          .eq("tenant_id", tenant_id);

        if (failedInstances && failedInstances.length > 0) {
          await supabase
            .from("document_instances")
            .update({ generation_status: "failed", last_error: msg, updated_by: userId || null })
            .eq("document_id", doc.id)
            .eq("tenant_id", tenant_id);

          for (const inst of failedInstances) {
            await supabase.from("document_generation_errors").insert({
              documentinstance_id: inst.id,
              error_code: "DELIVERY_FAILED",
              error_message: msg,
            });
          }

          // Audit log for failure
          await supabase.from("document_activity_log").insert({
            tenant_id,
            activity_type: "governance_generation_failed",
            document_id: doc.id,
            actor_user_id: userId || null,
            metadata: { error: msg, document_version_id },
          });
        }
      }
    } catch (trackErr) {
      console.error("[deliver] Failed to track generation error:", trackErr);
    }

    return new Response(JSON.stringify({ error: msg }), {
      status: 500,
      headers: { ...corsHeaders(req), "Content-Type": "application/json" },
    });
  }
});
