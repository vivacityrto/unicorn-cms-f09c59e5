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

function escapeXml(text: string): string {
  return text
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&apos;");
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

      // First strip XML tags within potential merge field tokens to handle Word split-runs
      // e.g. {{RTO</w:t></w:r><w:r><w:t>Name}} → {{RTOName}}
      // We do this by extracting text content, scanning, then doing replacements on original
      const textOnly = content.replace(/<[^>]+>/g, "");
      const tagPattern = /\{\{\s*([^}]+?)\s*\}\}/g;
      let match;
      while ((match = tagPattern.exec(textOnly)) !== null) {
        const cleanedTag = match[1].replace(/<[^>]+>/g, "").trim();
        if (cleanedTag) {
          detectedTagsSet.add(cleanedTag);
        }
      }

      // Replace text merge fields
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
    if (!authHeader) {
      return new Response(JSON.stringify({ error: "Missing authorization" }), {
        status: 401,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    const token = authHeader.replace("Bearer ", "");
    const {
      data: { user },
      error: authError,
    } = await supabase.auth.getUser(token);
    if (authError || !user) {
      return new Response(JSON.stringify({ error: "Unauthorized" }), {
        status: 401,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    const { data: userData } = await supabase
      .from("users")
      .select("unicorn_role, is_team")
      .eq("user_uuid", user.id)
      .single();

    if (!userData?.is_team) {
      return new Response(JSON.stringify({ error: "Permission denied — Vivacity staff only" }), {
        status: 403,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    // Parse request
    const body = await req.json();
    const { tenant_id, document_version_id, allow_incomplete, snapshot_id: pinned_snapshot_id } = body;
    if (!tenant_id || !document_version_id) {
      return new Response(
        JSON.stringify({ error: "tenant_id and document_version_id are required" }),
        { status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" } },
      );
    }

    console.log(`[deliver] Starting delivery: tenant=${tenant_id}, version=${document_version_id}`);

    // ── Load version + document ────────────────────────────────────────────
    const { data: version, error: vErr } = await supabase
      .from("document_versions")
      .select("*, document:documents(id, title, category, format)")
      .eq("id", document_version_id)
      .single();

    if (vErr || !version) {
      return new Response(JSON.stringify({ error: "Document version not found" }), {
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

    // ── Idempotency check ──────────────────────────────────────────────────
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

    // ── Process DOCX (also detects tags) ───────────────────────────────────
    const { bytes: processedBytes, detectedTags } = await processDocxTemplate(templateBytes, mergeData, imageData);

    // 4. Detect invalid tags
    const invalidTags = detectedTags.filter((tag) => !knownTags.has(tag));

    // 5. Calculate risk level
    const totalRequired = requiredTags.length;
    const populatedCount = totalRequired - missingTags.length;
    const completeness = totalRequired > 0 ? Math.round((populatedCount / totalRequired) * 100) : 100;

    let riskLevel: string;
    if (completeness === 100 && invalidTags.length === 0) {
      riskLevel = "complete";
    } else if (completeness >= 75) {
      riskLevel = "partial";
    } else {
      riskLevel = "incomplete";
    }

    console.log(`[deliver] Tailoring: ${completeness}% complete, ${missingTags.length} missing, ${invalidTags.length} invalid, risk=${riskLevel}`);

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
    const deliveredFileName = `${docTitle}_${tenantName}_v${version.version_number}.docx`;

    // ── Resolve SharePoint folder ──────────────────────────────────────────
    const { data: spSettings } = await supabase
      .from("tenant_sharepoint_settings")
      .select("governance_drive_id, governance_folder_item_id")
      .eq("tenant_id", tenant_id)
      .maybeSingle();

    if (!spSettings?.governance_drive_id || !spSettings?.governance_folder_item_id) {
      await supabase.from("governance_document_deliveries").insert({
        tenant_id,
        document_id: doc.id,
        document_version_id,
        snapshot_id: snapshotId,
        status: "failed",
        delivered_file_name: deliveredFileName,
        delivered_by: user.id,
        error_message: "No governance folder configured for this tenant",
        tailoring_completeness_pct: completeness,
        missing_merge_fields: missingTags,
        invalid_merge_fields: invalidTags,
        tailoring_risk_level: riskLevel,
      });
      return new Response(
        JSON.stringify({ error: "No governance folder configured for this tenant" }),
        { status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" } },
      );
    }

    const driveId = spSettings.governance_drive_id;
    let parentItemId = spSettings.governance_folder_item_id;
    let categorySubfolder: string | null = null;

    if (doc.category) {
      const { data: catRow } = await supabase
        .from("dd_document_categories")
        .select("sharepoint_folder_name")
        .eq("value", doc.category)
        .maybeSingle();

      if (catRow?.sharepoint_folder_name) {
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
            const sub = await ensureFolder(driveId, cleanPath, catRow.sharepoint_folder_name);
            parentItemId = sub.itemId;
            categorySubfolder = catRow.sharepoint_folder_name;
          }
        } catch (e) {
          console.warn(`[deliver] Could not resolve category subfolder: ${e}`);
        }
      }
    }

    // ── Upload to SharePoint ───────────────────────────────────────────────
    const FOUR_MB = 4 * 1024 * 1024;
    let driveItem: DriveItem;
    if (processedBytes.byteLength < FOUR_MB) {
      driveItem = await graphUploadSmall(driveId, parentItemId, deliveredFileName, processedBytes);
    } else {
      driveItem = await graphUploadSession(driveId, parentItemId, deliveredFileName, processedBytes);
    }

    console.log(`[deliver] Uploaded to SharePoint: ${driveItem.webUrl}`);

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
        delivered_by: user.id,
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
      actor_user_id: user.id,
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
      JSON.stringify({ success: true, skipped: false, delivery }),
      { headers: { ...corsHeaders, "Content-Type": "application/json" } },
    );
  } catch (error) {
    console.error("[deliver] Error:", error);
    const msg = error instanceof Error ? error.message : "Internal server error";
    return new Response(JSON.stringify({ error: msg }), {
      status: 500,
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }
});
