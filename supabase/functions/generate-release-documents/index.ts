import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";
import * as zip from "https://deno.land/x/zipjs@v2.7.32/index.js";

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
};

interface GenerateRequest {
  release_id: string;
}

// Simple XML escape function
function escapeXml(text: string): string {
  return text
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&apos;');
}

// Process DOCX template by replacing merge fields
async function processDocxTemplate(
  templateBytes: Uint8Array,
  mergeData: Record<string, string>
): Promise<Uint8Array> {
  const blob = new Blob([templateBytes.slice().buffer]);
  const reader = new zip.ZipReader(new zip.BlobReader(blob));
  const entries = await reader.getEntries();
  
  const writer = new zip.ZipWriter(new zip.BlobWriter("application/vnd.openxmlformats-officedocument.wordprocessingml.document"));
  
  for (const entry of entries) {
    if (entry.getData) {
      const data = await entry.getData(new zip.BlobWriter());
      const arrayBuffer = await data.arrayBuffer();
      
      // Process XML files that might contain merge fields
      if (entry.filename.endsWith('.xml') || entry.filename.endsWith('.rels')) {
        const decoder = new TextDecoder();
        let content = decoder.decode(arrayBuffer);
        
        // Replace {{FieldName}} tokens
        for (const [field, value] of Object.entries(mergeData)) {
          const token = `{{${field}}}`;
          const escapedValue = escapeXml(value || '');
          content = content.split(token).join(escapedValue);
        }
        
        // Handle split tokens across XML tags (Word often splits text)
        // Pattern: {{Field}} might be split as <w:t>{{</w:t><w:t>Field</w:t><w:t>}}</w:t>
        const splitPattern = /\{\{([^}]+)\}\}/g;
        content = content.replace(splitPattern, (match, fieldName) => {
          const cleanField = fieldName.replace(/<[^>]+>/g, '').trim();
          if (mergeData[cleanField] !== undefined) {
            return escapeXml(mergeData[cleanField] || '');
          }
          return match;
        });
        
        const encoder = new TextEncoder();
        await writer.add(entry.filename, new zip.BlobReader(new Blob([encoder.encode(content)])));
      } else {
        await writer.add(entry.filename, new zip.BlobReader(new Blob([arrayBuffer])));
      }
    }
  }
  
  await reader.close();
  const result = await writer.close();
  return new Uint8Array(await result.arrayBuffer());
}

// Process XLSX template by replacing merge fields and injecting dropdown data
async function processXlsxTemplate(
  templateBytes: Uint8Array,
  mergeData: Record<string, string>,
  listData: Record<string, string[]>
): Promise<Uint8Array> {
  const blob = new Blob([templateBytes.slice().buffer]);
  const reader = new zip.ZipReader(new zip.BlobReader(blob));
  const entries = await reader.getEntries();
  
  const writer = new zip.ZipWriter(new zip.BlobWriter("application/vnd.openxmlformats-officedocument.spreadsheetml.sheet"));
  
  for (const entry of entries) {
    if (entry.getData) {
      const data = await entry.getData(new zip.BlobWriter());
      const arrayBuffer = await data.arrayBuffer();
      
      if (entry.filename.endsWith('.xml')) {
        const decoder = new TextDecoder();
        let content = decoder.decode(arrayBuffer);
        
        // Replace merge fields in shared strings and worksheets
        for (const [field, value] of Object.entries(mergeData)) {
          const token = `{{${field}}}`;
          const escapedValue = escapeXml(value || '');
          content = content.split(token).join(escapedValue);
        }
        
        const encoder = new TextEncoder();
        await writer.add(entry.filename, new zip.BlobReader(new Blob([encoder.encode(content)])));
      } else {
        await writer.add(entry.filename, new zip.BlobReader(new Blob([arrayBuffer])));
      }
    }
  }
  
  await reader.close();
  const result = await writer.close();
  return new Uint8Array(await result.arrayBuffer());
}

serve(async (req) => {
  if (req.method === 'OPTIONS') {
    return new Response(null, { headers: corsHeaders });
  }

  try {
    const supabaseUrl = Deno.env.get("SUPABASE_URL")!;
    const supabaseKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
    const supabase = createClient(supabaseUrl, supabaseKey);

    // Authenticate user
    const authHeader = req.headers.get("Authorization");
    if (!authHeader) {
      return new Response(
        JSON.stringify({ error: "Missing authorization" }),
        { status: 401, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    const token = authHeader.replace("Bearer ", "");
    const { data: { user }, error: authError } = await supabase.auth.getUser(token);
    
    if (authError || !user) {
      return new Response(
        JSON.stringify({ error: "Unauthorized" }),
        { status: 401, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    // Check admin role
    const { data: userData } = await supabase
      .from("users")
      .select("unicorn_role")
      .eq("user_uuid", user.id)
      .single();

    if (!userData || !['Super Admin', 'Admin'].includes(userData.unicorn_role)) {
      return new Response(
        JSON.stringify({ error: "Permission denied" }),
        { status: 403, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    // Check if generation is enabled (safety control)
    const { data: settings } = await supabase
      .from("app_settings")
      .select("generation_enabled, generation_rate_limit_per_hour")
      .single();

    if (settings && settings.generation_enabled === false) {
      return new Response(
        JSON.stringify({ error: "Document generation is currently disabled by administrator" }),
        { status: 503, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    const body: GenerateRequest = await req.json();
    const { release_id } = body;

    if (!release_id) {
      return new Response(
        JSON.stringify({ error: "release_id is required" }),
        { status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    console.log(`Starting document generation for release ${release_id}`);

    // Fetch the release and its items
    const { data: release, error: releaseError } = await supabase
      .from("stage_releases")
      .select("*")
      .eq("id", release_id)
      .single();

    if (releaseError || !release) {
      return new Response(
        JSON.stringify({ error: "Release not found" }),
        { status: 404, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    const { data: items, error: itemsError } = await supabase
      .from("stage_release_items")
      .select(`
        *,
        document:documents(
          id, title, format, uploaded_files, merge_fields, dropdown_sources
        ),
        document_version:document_versions(id, file_path)
      `)
      .eq("stage_release_id", release_id);

    if (itemsError) {
      return new Response(
        JSON.stringify({ error: "Failed to fetch release items" }),
        { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    // Fetch tenant data for merge fields
    const { data: tenant } = await supabase
      .from("tenants")
      .select("*")
      .eq("id", release.tenant_id)
      .single();

    // Fetch merge field definitions
    const { data: mergeFieldDefs } = await supabase
      .from("merge_field_definitions")
      .select("code, source_column")
      .eq("is_active", true);

    // Fetch tenant merge data
    const { data: tenantMergeData } = await supabase
      .from("tenant_merge_data")
      .select("data")
      .eq("tenant_id", release.tenant_id)
      .single();

    // Build merge data object
    const combinedData = { ...tenant, ...(tenantMergeData?.data || {}) };
    const mergeData: Record<string, string> = {};
    
    for (const field of mergeFieldDefs || []) {
      const value = combinedData[field.source_column];
      mergeData[field.code] = value !== null && value !== undefined ? String(value) : '';
    }

    console.log(`Processing ${items?.length || 0} documents with ${Object.keys(mergeData).length} merge fields`);

    // Process each item
    const results: Array<{ document_id: number; status: string; error?: string }> = [];

    for (const item of items || []) {
      try {
        // Update status to running
        await supabase
          .from("stage_release_items")
          .update({ generation_status: 'running' })
          .eq("id", item.id);

        const doc = item.document;
        const format = doc?.format?.toLowerCase() || '';
        
        // Get the template file path
        let templatePath: string | null = null;
        
        if (item.document_version?.file_path) {
          templatePath = item.document_version.file_path;
        } else if (doc?.uploaded_files && doc.uploaded_files.length > 0) {
          templatePath = doc.uploaded_files[0];
        }

        if (!templatePath) {
          // No template to process - skip generation
          await supabase
            .from("stage_release_items")
            .update({ generation_status: 'skipped' })
            .eq("id", item.id);
          
          results.push({ document_id: item.document_id, status: 'skipped', error: 'No template file' });
          continue;
        }

        // Download template
        const { data: templateData, error: downloadError } = await supabase.storage
          .from("document-files")
          .download(templatePath);

        if (downloadError || !templateData) {
          throw new Error(`Failed to download template: ${downloadError?.message}`);
        }

        const templateBytes = new Uint8Array(await templateData.arrayBuffer());
        let processedBytes: Uint8Array;

        // Process based on format
        if (format === 'docx' || format === 'doc') {
          processedBytes = await processDocxTemplate(templateBytes, mergeData);
        } else if (format === 'xlsx' || format === 'xls') {
          // Fetch dropdown data sources for Excel
          const { data: dataSources } = await supabase
            .from("document_data_sources")
            .select("name, table_data")
            .eq("document_id", item.document_id)
            .eq("tenant_id", release.tenant_id);
          
          const listData: Record<string, string[]> = {};
          for (const source of dataSources || []) {
            if (source.table_data && Array.isArray(source.table_data)) {
              // Extract first column values as list
              listData[source.name] = source.table_data.map((row: any) => 
                Object.values(row)[0] as string
              ).filter(Boolean);
            }
          }
          
          processedBytes = await processXlsxTemplate(templateBytes, mergeData, listData);
        } else {
          // Unsupported format - copy as-is
          processedBytes = templateBytes;
        }

        // Generate output path
        const timestamp = Date.now();
        const ext = format || 'docx';
        const outputFileName = `${doc?.title || 'document'}_${timestamp}.${ext}`;
        const outputPath = `generated/${release.tenant_id}/${release.stage_id}/${release_id}/${outputFileName}`;

        // Upload generated file
        const { error: uploadError } = await supabase.storage
          .from("document-files")
          .upload(outputPath, processedBytes, {
            contentType: format === 'xlsx' 
              ? 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet'
              : 'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
            upsert: true
          });

        if (uploadError) {
          throw new Error(`Failed to upload: ${uploadError.message}`);
        }

        // Create generated document record
        const { data: genDoc, error: genError } = await supabase
          .from("generated_documents")
          .insert({
            source_document_id: item.document_id,
            tenant_id: release.tenant_id,
            stage_id: release.stage_id,
            package_id: release.package_id,
            document_version_id: item.document_version_id,
            file_path: outputPath,
            file_name: outputFileName,
            status: 'success',
            generated_at: new Date().toISOString(),
            generated_by: user.id,
            merge_data: mergeData
          })
          .select()
          .single();

        if (genError) {
          throw new Error(`Failed to create record: ${genError.message}`);
        }

        // Update release item
        await supabase
          .from("stage_release_items")
          .update({ 
            generation_status: 'success',
            generated_document_id: genDoc.id
          })
          .eq("id", item.id);

        results.push({ document_id: item.document_id, status: 'success' });

        // Audit log
        await supabase.from("client_audit_log").insert({
          tenant_id: release.tenant_id,
          action: 'document.generated',
          entity_type: 'generated_document',
          entity_id: genDoc.id,
          actor_user_id: user.id,
          details: {
            release_id,
            document_id: item.document_id,
            file_name: outputFileName
          }
        });

      } catch (error) {
        const errorMessage = error instanceof Error ? error.message : 'Unknown error';
        console.error(`Generation failed for document ${item.document_id}:`, errorMessage);

        await supabase
          .from("stage_release_items")
          .update({ generation_status: 'failed' })
          .eq("id", item.id);

        // Create failed generated document record
        await supabase
          .from("generated_documents")
          .insert({
            source_document_id: item.document_id,
            tenant_id: release.tenant_id,
            stage_id: release.stage_id,
            package_id: release.package_id,
            file_path: '',
            file_name: '',
            status: 'failed',
            error_message: errorMessage,
            generated_by: user.id
          });

        results.push({ document_id: item.document_id, status: 'failed', error: errorMessage });

        // Audit log failure
        await supabase.from("client_audit_log").insert({
          tenant_id: release.tenant_id,
          action: 'document.generation_failed',
          entity_type: 'stage_release_item',
          entity_id: item.id,
          actor_user_id: user.id,
          details: {
            release_id,
            document_id: item.document_id,
            error: errorMessage
          }
        });
      }
    }

    // Update release status to ready if all succeeded
    const allSuccess = results.every(r => r.status === 'success' || r.status === 'skipped');
    const newStatus = allSuccess ? 'ready' : 'draft';

    await supabase
      .from("stage_releases")
      .update({ status: newStatus })
      .eq("id", release_id);

    // Audit log
    await supabase.from("client_audit_log").insert({
      tenant_id: release.tenant_id,
      action: 'stage.release_ready',
      entity_type: 'stage_release',
      entity_id: release_id,
      actor_user_id: user.id,
      details: {
        success_count: results.filter(r => r.status === 'success').length,
        failed_count: results.filter(r => r.status === 'failed').length,
        skipped_count: results.filter(r => r.status === 'skipped').length
      }
    });

    console.log(`Generation complete for release ${release_id}:`, results);

    return new Response(
      JSON.stringify({
        success: true,
        release_id,
        status: newStatus,
        results
      }),
      { headers: { ...corsHeaders, "Content-Type": "application/json" } }
    );

  } catch (error) {
    console.error("Generation error:", error);
    const errorMessage = error instanceof Error ? error.message : "Internal server error";
    return new Response(
      JSON.stringify({ error: errorMessage }),
      { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } }
    );
  }
});
