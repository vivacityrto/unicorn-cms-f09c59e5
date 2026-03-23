import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import * as zip from "https://deno.land/x/zipjs@v2.7.32/index.js";
import { corsHeaders } from "../_shared/cors.ts";
import { createServiceClient } from "../_shared/supabase-client.ts";
import {
  graphUploadSmall,
  graphUploadSession,
  graphGet,
  ensureFolder,
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
  imageData: Record<string, Uint8Array>,
): Promise<{ bytes: Uint8Array; detectedTags: string[] }> {
  const blob = new Blob([templateBytes.slice().buffer]);
  const reader = new zip.ZipReader(new zip.BlobReader(blob));
  const entries = await reader.getEntries();

  const writer = new zip.ZipWriter(
    new zip.BlobWriter(
      "application/vnd.openxmlformats-officedocument.wordprocessingml.document",
    ),
  );

  const imageInjections: Array<{ rId: string; fileName: string }> = [];
  let imageCounter = 100;
  let relsContent: string | null = null;
  let relsFilename: string | null = null;

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
          const rId = `rIdImg${imageCounter++}`;
          const imgFileName = `image_${cleanField}.png`;
          imageInjections.push({ rId, fileName: imgFileName });
          return `</w:t></w:r><w:r><w:drawing><wp:inline distT="0" distB="0" distL="0" distR="0"><wp:extent cx="1800000" cy="900000"/><wp:docPr id="${imageCounter}" name="${cleanField}"/><a:graphic xmlns:a="http://schemas.openxmlformats.org/drawingml/2006/main"><a:graphicData uri="http://schemas.openxmlformats.org/drawingml/2006/picture"><pic:pic xmlns:pic="http://schemas.openxmlformats.org/drawingml/2006/picture"><pic:nvPicPr><pic:cNvPr id="${imageCounter}" name="${imgFileName}"/><pic:cNvPicPr/></pic:nvPicPr><pic:blipFill><a:blip r:embed="${rId}"/><a:stretch><a:fillRect/></a:stretch></pic:blipFill><pic:spPr><a:xfrm><a:off x="0" y="0"/><a:ext cx="1800000" cy="900000"/></a:xfrm><a:prstGeom prst="rect"><a:avLst/></a:prstGeom></pic:spPr></pic:pic></a:graphicData></a:graphic></wp:inline></w:drawing></w:r><w:r><w:t>`;
        }
        return match;
      });

      if (entry.filename === 'word/_rels/document.xml.rels') {
        relsContent = content;
        relsFilename = entry.filename;
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

  if (relsContent !== null && relsFilename !== null) {
    if (imageInjections.length > 0) {
      const relEntries = imageInjections.map(
        (img) =>
          `<Relationship Id="${img.rId}" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/image" Target="media/${img.fileName}"/>`
      ).join('');
      relsContent = relsContent.replace('</Relationships>', relEntries + '</Relationships>');
    }
    const encoder = new TextEncoder();
    await writer.add(
      relsFilename,
      new zip.BlobReader(new Blob([encoder.encode(relsContent)])),
    );
  }

  for (const [field, imgBytes] of Object.entries(imageData)) {
    const imgFileName = `image_${field}.png`;
    await writer.add(
      `word/media/${imgFileName}`,
      new zip.BlobReader(new Blob([imgBytes])),
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
  imageData: Record<string, Uint8Array>,
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
          const rId = `rIdImg${imageCounter++}`;
          const imgFileName = `image_${cleanField}.png`;

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
        // Don't add to writer yet — we'll handle rels files after
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

  // Add image files to ppt/media/
  for (const [field, imgBytes] of Object.entries(imageData)) {
    const imgFileName = `image_${field}.png`;
    await writer.add(
      `ppt/media/${imgFileName}`,
      new zip.BlobReader(new Blob([imgBytes])),
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
 * For non-DOCX/PPTX formats (e.g. XLSX), scan for merge field tags without processing.
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

// ── Main Handler ───────────────────────────────────────────────────────────

serve(async (req) => {
  if (req.method === "OPTIONS") {
    return new Response(null, { headers: corsHeaders });
  }

  try {
    const supabase = createServiceClient();

    // Auth check — Vivacity staff only
    const authHeader = req.headers.get("Authorization");
    if (!authHeader?.startsWith("Bearer ")) {
      return new Response(JSON.stringify({ error: "Missing authorization" }), {
        status: 401,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    const token = authHeader.replace("Bearer ", "");

    const { createClient } = await import("https://esm.sh/@supabase/supabase-js@2");
    const userClient = createClient(
      Deno.env.get("SUPABASE_URL")!,
      Deno.env.get("SUPABASE_ANON_KEY")!,
      {
        global: { headers: { Authorization: authHeader } },
        auth: { autoRefreshToken: false, persistSession: false },
      },
    );

    const { data: claimsData, error: claimsError } = await userClient.auth.getClaims(token);
    const claims = claimsData?.claims;
    const userId = claims?.sub;

    if (claimsError || !userId) {
      return new Response(JSON.stringify({ error: "Unauthorized" }), {
        status: 401,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    const { data: userData } = await supabase
      .from("users")
      .select("unicorn_role, global_role, is_team")
      .eq("user_uuid", userId)
      .maybeSingle();

    const normaliseRole = (value: unknown) =>
      typeof value === "string" ? value.toLowerCase().replace(/\s+/g, " ").trim() : "";

    const staffRoles = new Set(["super admin", "superadmin", "team leader", "team member"]);
    const claimRole = normaliseRole((claims as Record<string, unknown>)?.["unicorn_role"]);
    const metadataRole = normaliseRole(
      ((claims as Record<string, unknown>)?.["user_metadata"] as Record<string, unknown> | undefined)?.["unicorn_role"],
    );
    const dbRole = normaliseRole(userData?.unicorn_role);
    const globalRole = normaliseRole(userData?.global_role);

    const isStaff = userData?.is_team === true ||
      staffRoles.has(dbRole) ||
      staffRoles.has(globalRole) ||
      staffRoles.has(claimRole) ||
      staffRoles.has(metadataRole);

    console.log("[deliver] auth", {
      userId,
      isTeam: userData?.is_team ?? null,
      dbRole: userData?.unicorn_role ?? null,
      globalRole: userData?.global_role ?? null,
      claimRole,
      metadataRole,
      isStaff,
    });

    if (!isStaff) {
      return new Response(JSON.stringify({ error: "Permission denied — Vivacity staff only" }), {
        status: 403,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }


    // Parse request
    const body = await req.json();
    const { tenant_id, document_version_id, allow_incomplete, snapshot_id: pinned_snapshot_id, force } = body;
    if (!tenant_id || !document_version_id) {
      return new Response(
        JSON.stringify({ error: "tenant_id and document_version_id are required" }),
        { status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" } },
      );
    }

    console.log(`[deliver] Starting delivery: tenant=${tenant_id}, version=${document_version_id}, force=${!!force}`);

    // ── Load version + document ────────────────────────────────────────────
    const { data: version, error: vErr } = await supabase
      .from("document_versions")
      .select("*, document:documents!document_versions_document_id_fkey(id, title, category, format)")
      .eq("id", document_version_id)
      .single();

    console.log("[deliver] version lookup", { found: !!version, error: vErr?.message ?? null, document_version_id });

    if (vErr || !version) {
      return new Response(JSON.stringify({ error: "Document version not found", detail: vErr?.message }), {
        status: 404,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    const doc = version.document as any;
    if (!doc) {
      return new Response(JSON.stringify({ error: "Parent document not found" }), {
        status: 404,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
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
      }

      const { data: existing } = await idempotencyQuery.maybeSingle();

      if (existing) {
        console.log(`[deliver] Already delivered — returning existing record ${existing.id}`);
        return new Response(
          JSON.stringify({ success: true, skipped: true, delivery: existing }),
          { headers: { ...corsHeaders, "Content-Type": "application/json" } },
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
        }
        await delQuery;
      }
    }

    // ── Download template from storage ─────────────────────────────────────
    const storagePath = version.storage_path || version.file_path;
    if (!storagePath) {
      return new Response(JSON.stringify({ error: "No storage path on version" }), {
        status: 400,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    const { data: templateBlob, error: dlErr } = await supabase.storage
      .from("document-files")
      .download(storagePath);

    if (dlErr || !templateBlob) {
      throw new Error(`Failed to download template: ${dlErr?.message}`);
    }

    const templateBytes = new Uint8Array(await templateBlob.arrayBuffer());

    // ── Fetch merge fields ─────────────────────────────────────────────────
    const { data: mergeFieldRows } = await supabase
      .from("v_tenant_merge_fields")
      .select("field_tag, field_type, value")
      .eq("tenant_id", tenant_id);

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
    const imageData: Record<string, Uint8Array> = {};
    for (const tag of imageFields) {
      const imageValue = mergeFieldRows?.find((r) => r.field_tag === tag)?.value;
      if (imageValue) {
        try {
          const { data: imgBlob } = await supabase.storage
            .from("client-logos")
            .download(imageValue);
          if (imgBlob) {
            imageData[tag] = new Uint8Array(await imgBlob.arrayBuffer());
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
    } else {
      // XLSX, PDF, etc. — pass through unchanged, just scan for tags
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
        { status: 422, headers: { ...corsHeaders, "Content-Type": "application/json" } },
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
    const deliveredFileName = `${docTitle}_${tenantName}_v${version.version_number}.${fileExt}`;

    // ── Resolve SharePoint folder ──────────────────────────────────────────
    const { data: spSettings } = await supabase
      .from("tenant_sharepoint_settings")
      .select("governance_drive_id, governance_folder_item_id")
      .eq("tenant_id", tenant_id)
      .maybeSingle();

    if (!spSettings?.governance_drive_id || !spSettings?.governance_folder_item_id) {
      const errorMsg = "No governance folder configured for this tenant. Please verify the governance folder from the SharePoint Folder Mapping page (Admin → SharePoint Folder Mapping) before generating documents.";
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
        JSON.stringify({ error: errorMsg, error_code: "GOVERNANCE_FOLDER_MISSING" }),
        { status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" } },
      );
    }

    const driveId = spSettings.governance_drive_id;
    let parentItemId = spSettings.governance_folder_item_id;
    let categorySubfolder: string | null = null;

    if (doc.category) {
      const { data: catRow } = await supabase
        .from("dd_document_categories")
        .select("label")
        .eq("value", doc.category)
        .maybeSingle();

      const folderName = catRow?.label || null;

      if (folderName) {
        try {
          const parentInfo = await graphGet<DriveItem>(
            `/drives/${driveId}/items/${parentItemId}`,
          );
          if (parentInfo.ok) {
            const parentRef = parentInfo.data.parentReference as { path?: string } | undefined;
            const fullPath = parentRef?.path
              ? `${parentRef.path.replace(/^\/drives\/[^/]+\/root:/, '')}/${parentInfo.data.name}`
              : parentInfo.data.name;
            const cleanPath = fullPath.replace(/^\//, '');
            const sub = await ensureFolder(driveId, cleanPath, folderName);
            parentItemId = sub.itemId;
            categorySubfolder = folderName;
          }
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

    // ── Update document_instances with generation tracking ─────────────────
    const { data: matchedInstances } = await supabase
      .from("document_instances")
      .select("id")
      .eq("document_id", doc.id)
      .eq("tenant_id", tenant_id);

    if (matchedInstances && matchedInstances.length > 0) {
      const instanceIds = matchedInstances.map((i: any) => i.id);
      await supabase
        .from("document_instances")
        .update({
          status: "generated",
          generation_status: "generated",
          generated_file_url: driveItem.webUrl,
          generated_item_id: driveItem.id,
          isgenerated: true,
          generationdate: new Date().toISOString(),
          last_error: null,
          updated_by: userId,
        })
        .eq("document_id", doc.id)
        .eq("tenant_id", tenant_id);

      // Resolve any active errors for these instances
      for (const instId of instanceIds) {
        await supabase
          .from("document_generation_errors")
          .update({ resolved_at: new Date().toISOString(), resolved_by: userId })
          .eq("documentinstance_id", instId)
          .is("resolved_at", null);
      }
    }

    // ── Insert delivery record with tailoring data ─────────────────────────
    const { data: delivery, error: insErr } = await supabase
      .from("governance_document_deliveries")
      .insert({
        tenant_id,
        document_id: doc.id,
        document_version_id,
        snapshot_id: snapshotId,
        status: "success",
        sharepoint_item_id: driveItem.id,
        sharepoint_web_url: driveItem.webUrl,
        delivered_file_name: deliveredFileName,
        category_subfolder: categorySubfolder,
        delivered_by: userId,
        tailoring_completeness_pct: completeness,
        missing_merge_fields: missingTags,
        invalid_merge_fields: invalidTags,
        tailoring_risk_level: riskLevel,
      })
      .select()
      .single();

    if (insErr) {
      throw new Error(`Failed to insert delivery record: ${insErr.message}`);
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
      { headers: { ...corsHeaders, "Content-Type": "application/json" } },
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
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }
});
