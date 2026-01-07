import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";
import * as zip from "https://deno.land/x/zipjs@v2.7.32/index.js";

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
};

interface ExportRequest {
  export_id: string;
}

// Format date for filenames
function formatDate(date: string | null): string {
  if (!date) return 'unknown';
  return new Date(date).toISOString().split('T')[0];
}

// Sanitize filename
function sanitize(name: string): string {
  return name.replace(/[^a-zA-Z0-9-_. ]/g, '_').substring(0, 100);
}

serve(async (req) => {
  if (req.method === 'OPTIONS') {
    return new Response(null, { headers: corsHeaders });
  }

  const supabaseUrl = Deno.env.get("SUPABASE_URL")!;
  const supabaseKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
  const supabase = createClient(supabaseUrl, supabaseKey);

  try {
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
      .select("unicorn_role, first_name, last_name")
      .eq("user_uuid", user.id)
      .single();

    if (!userData || !['Super Admin', 'Admin'].includes(userData.unicorn_role)) {
      return new Response(
        JSON.stringify({ error: "Permission denied" }),
        { status: 403, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    const body: ExportRequest = await req.json();
    const { export_id } = body;

    if (!export_id) {
      return new Response(
        JSON.stringify({ error: "export_id is required" }),
        { status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    console.log(`Starting compliance pack export ${export_id}`);

    // Fetch the export record
    const { data: exportRecord, error: exportError } = await supabase
      .from("compliance_pack_exports")
      .select("*")
      .eq("id", export_id)
      .single();

    if (exportError || !exportRecord) {
      return new Response(
        JSON.stringify({ error: "Export record not found" }),
        { status: 404, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    // Update status to running
    await supabase
      .from("compliance_pack_exports")
      .update({ status: 'running' })
      .eq("id", export_id);

    // Fetch tenant info
    const { data: tenant } = await supabase
      .from("tenants")
      .select("id, name")
      .eq("id", exportRecord.tenant_id)
      .single();

    const tenantName = sanitize(tenant?.name || `Tenant_${exportRecord.tenant_id}`);

    // Fetch stage release info
    const { data: release } = await supabase
      .from("stage_releases")
      .select(`
        *,
        stage:documents_stages(id, title)
      `)
      .eq("id", exportRecord.stage_release_id)
      .single();

    if (!release) {
      throw new Error("Stage release not found");
    }

    const stageName = sanitize(release.stage?.title || `Stage_${release.stage_id}`);
    const releaseId = release.id.substring(0, 8);

    // Fetch release items
    const { data: releaseItems } = await supabase
      .from("stage_release_items")
      .select(`
        *,
        document:documents(id, title, format),
        generated_document:generated_documents(id, file_path, file_name, status)
      `)
      .eq("stage_release_id", release.id);

    // Fetch email send logs
    const { data: emailLogs } = await supabase
      .from("email_send_log")
      .select("*")
      .eq("stage_release_id", release.id);

    // Fetch audit logs
    const { data: auditLogs } = await supabase
      .from("client_audit_log")
      .select("*")
      .eq("tenant_id", exportRecord.tenant_id)
      .eq("entity_id", release.id)
      .order("created_at", { ascending: false });

    // Fetch stage configuration (tasks)
    const { data: clientTasks } = await supabase
      .from("stage_tasks")
      .select("*")
      .eq("stage_id", release.stage_id)
      .eq("task_type", "client");

    const { data: teamTasks } = await supabase
      .from("stage_tasks")
      .select("*")
      .eq("stage_id", release.stage_id)
      .eq("task_type", "team");

    const { data: stageEmails } = await supabase
      .from("stage_emails")
      .select("*")
      .eq("stage_id", release.stage_id);

    // Build ZIP structure
    const zipWriter = new zip.ZipWriter(new zip.BlobWriter("application/zip"));
    const basePath = `${tenantName}/Stage Releases/${stageName}/${releaseId}`;

    // Track contents for summary
    const contentsSummary = {
      documents: [] as { name: string; type: string; status: string }[],
      emails: [] as { recipient: string; sent_at: string; status: string }[],
      audit_events: auditLogs?.length || 0,
      tasks: {
        client: clientTasks?.length || 0,
        team: teamTasks?.length || 0
      }
    };

    // Add documents
    for (const item of releaseItems || []) {
      const doc = item.document;
      const genDoc = item.generated_document;
      
      let filePath: string | null = null;
      let fileName: string;
      let docType = 'template';

      if (genDoc && genDoc.status === 'success' && genDoc.file_path) {
        filePath = genDoc.file_path;
        fileName = genDoc.file_name || `${doc?.title || 'document'}.${doc?.format || 'docx'}`;
        docType = 'generated';
      } else if (item.document_version_id) {
        // Get published version file
        const { data: version } = await supabase
          .from("document_versions")
          .select("file_path")
          .eq("id", item.document_version_id)
          .single();
        
        if (version?.file_path) {
          filePath = version.file_path;
          fileName = `${doc?.title || 'document'}.${doc?.format || 'docx'}`;
          docType = 'published_version';
        }
      }

      if (filePath) {
        try {
          const { data: fileData, error: downloadError } = await supabase.storage
            .from("document-files")
            .download(filePath);

          if (!downloadError && fileData) {
            const arrayBuffer = await fileData.arrayBuffer();
            await zipWriter.add(
              `${basePath}/Documents/${sanitize(fileName!)}`,
              new zip.BlobReader(new Blob([arrayBuffer]))
            );
            
            contentsSummary.documents.push({
              name: doc?.title || fileName!,
              type: docType,
              status: 'included'
            });
          }
        } catch (e) {
          console.error(`Failed to download document: ${filePath}`, e);
          contentsSummary.documents.push({
            name: doc?.title || 'Unknown',
            type: docType,
            status: 'failed'
          });
        }
      }
    }

    // Add email logs as CSV
    if (emailLogs && emailLogs.length > 0) {
      const emailCsvHeader = 'recipient,template_id,status,sent_at,error\n';
      const emailCsvRows = emailLogs.map(log => 
        `"${log.to_email || ''}","${log.email_template_id || ''}","${log.status}","${log.sent_at || ''}","${log.error || ''}"`
      ).join('\n');
      
      await zipWriter.add(
        `${basePath}/Emails/email_send_log.csv`,
        new zip.BlobReader(new Blob([emailCsvHeader + emailCsvRows], { type: 'text/csv' }))
      );

      for (const log of emailLogs) {
        contentsSummary.emails.push({
          recipient: log.to_email || 'unknown',
          sent_at: log.sent_at || '',
          status: log.status
        });
      }
    }

    // Add audit logs as JSON
    if (auditLogs && auditLogs.length > 0) {
      await zipWriter.add(
        `${basePath}/Logs/audit_log.json`,
        new zip.BlobReader(new Blob([JSON.stringify(auditLogs, null, 2)], { type: 'application/json' }))
      );
    }

    // Build index.json
    const indexData = {
      export_info: {
        export_id,
        exported_at: new Date().toISOString(),
        exported_by: `${userData.first_name || ''} ${userData.last_name || ''}`.trim() || user.email,
        scope: 'stage_release'
      },
      tenant: {
        id: tenant?.id,
        name: tenant?.name
      },
      release: {
        id: release.id,
        stage_id: release.stage_id,
        stage_name: release.stage?.title,
        status: release.status,
        released_at: release.released_at,
        released_by: release.released_by,
        created_at: release.created_at
      },
      documents: releaseItems?.map(item => ({
        id: item.document_id,
        title: item.document?.title,
        format: item.document?.format,
        version_id: item.document_version_id,
        generated: !!item.generated_document_id,
        visible_to_tenant: item.is_visible_to_tenant,
        included_in_pack: item.include_in_pack
      })),
      emails_sent: emailLogs?.length || 0,
      audit_events: auditLogs?.length || 0
    };

    await zipWriter.add(
      `${basePath}/index.json`,
      new zip.BlobReader(new Blob([JSON.stringify(indexData, null, 2)], { type: 'application/json' }))
    );

    // Build index.csv
    const indexCsv = [
      'Field,Value',
      `Export ID,${export_id}`,
      `Exported At,${new Date().toISOString()}`,
      `Tenant,${tenant?.name}`,
      `Stage,${release.stage?.title}`,
      `Release ID,${release.id}`,
      `Status,${release.status}`,
      `Released At,${release.released_at || 'Not released'}`,
      `Documents Count,${releaseItems?.length || 0}`,
      `Emails Sent,${emailLogs?.length || 0}`,
      `Audit Events,${auditLogs?.length || 0}`
    ].join('\n');

    await zipWriter.add(
      `${basePath}/index.csv`,
      new zip.BlobReader(new Blob([indexCsv], { type: 'text/csv' }))
    );

    // Build readme.txt
    const readme = `COMPLIANCE PACK EXPORT
======================

Scope: Stage Release
Tenant: ${tenant?.name} (ID: ${tenant?.id})
Stage: ${release.stage?.title} (ID: ${release.stage_id})
Release ID: ${release.id}

Generated: ${new Date().toISOString()}
Generated By: ${userData.first_name || ''} ${userData.last_name || ''} (${user.email})

CONTENTS
--------
- Documents/: Released document files (generated outputs or published versions)
- Emails/: Email send logs for this release
- Logs/: Audit trail of release events
- index.json: Structured metadata
- index.csv: Summary for spreadsheet import

VERIFICATION
------------
1. Compare document count in index.json with Documents/ folder
2. Verify release timestamps match your records
3. Check audit_log.json for complete event history
4. Email logs show notification delivery status

This export is read-only and reflects the state at time of generation.
For questions, contact your system administrator.
`;

    await zipWriter.add(
      `${basePath}/readme.txt`,
      new zip.BlobReader(new Blob([readme], { type: 'text/plain' }))
    );

    // Close ZIP and get blob
    const zipBlob = await zipWriter.close();
    const zipBytes = new Uint8Array(await zipBlob.arrayBuffer());

    // Generate unique filename
    const timestamp = new Date().toISOString().replace(/[:.]/g, '-');
    const fileName = `compliance-pack_${tenantName}_${stageName}_${timestamp}.zip`;
    const storagePath = `exports/${exportRecord.tenant_id}/${fileName}`;

    // Upload to storage
    const { error: uploadError } = await supabase.storage
      .from("compliance-packs")
      .upload(storagePath, zipBytes, {
        contentType: 'application/zip',
        upsert: true
      });

    if (uploadError) {
      throw new Error(`Failed to upload ZIP: ${uploadError.message}`);
    }

    // Update export record
    await supabase
      .from("compliance_pack_exports")
      .update({
        status: 'success',
        storage_path: storagePath,
        file_name: fileName,
        file_size_bytes: zipBytes.length,
        contents_summary: contentsSummary,
        completed_at: new Date().toISOString()
      })
      .eq("id", export_id);

    // Audit log
    await supabase.from("client_audit_log").insert({
      tenant_id: exportRecord.tenant_id,
      action: 'compliance_pack.completed',
      entity_type: 'compliance_pack_export',
      entity_id: export_id,
      actor_user_id: user.id,
      details: {
        file_name: fileName,
        file_size_bytes: zipBytes.length,
        documents_count: contentsSummary.documents.length,
        emails_count: contentsSummary.emails.length
      }
    });

    console.log(`Compliance pack export completed: ${fileName}`);

    return new Response(
      JSON.stringify({
        success: true,
        export_id,
        file_name: fileName,
        storage_path: storagePath
      }),
      { headers: { ...corsHeaders, "Content-Type": "application/json" } }
    );

  } catch (error) {
    console.error("Export error:", error);
    const errorMessage = error instanceof Error ? error.message : "Internal server error";

    // Try to update export record with error
    const body = await req.json().catch(() => ({}));
    if (body.export_id) {
      await supabase
        .from("compliance_pack_exports")
        .update({
          status: 'failed',
          error: errorMessage,
          completed_at: new Date().toISOString()
        })
        .eq("id", body.export_id);

      // Audit log failure
      const authHeader = req.headers.get("Authorization");
      if (authHeader) {
        const token = authHeader.replace("Bearer ", "");
        const { data: { user } } = await supabase.auth.getUser(token);
        if (user) {
          const { data: exportRecord } = await supabase
            .from("compliance_pack_exports")
            .select("tenant_id")
            .eq("id", body.export_id)
            .single();

          if (exportRecord) {
            await supabase.from("client_audit_log").insert({
              tenant_id: exportRecord.tenant_id,
              action: 'compliance_pack.failed',
              entity_type: 'compliance_pack_export',
              entity_id: body.export_id,
              actor_user_id: user.id,
              details: { error: errorMessage }
            });
          }
        }
      }
    }

    return new Response(
      JSON.stringify({ error: errorMessage }),
      { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } }
    );
  }
});
