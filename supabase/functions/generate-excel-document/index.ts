import { corsHeaders } from '../_shared/cors.ts';
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2.81.1';

const supabaseUrl = Deno.env.get('SUPABASE_URL') as string;
const supabaseServiceKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY') as string;

interface ExcelGenerateRequest {
  document_id: number;
  tenant_id: number;
  client_legacy_id?: string;
  stage_id?: number;
  package_id?: number;
  mode?: 'single' | 'pack';
}

interface TokenBinding {
  source_type: 'client' | 'tenant' | 'package' | 'stage' | 'system' | 'static';
  source_field?: string;
  static_value?: string;
}

interface DropdownBinding {
  list_id: string;
  list_name?: string;
}

interface ExcelBindings {
  status: string;
  detected_tokens: Array<{ token: string; sheet: string; cell: string }>;
  detected_dropdowns: Array<{ dropdown_id: string; sheet: string; cell: string }>;
  token_bindings: Record<string, TokenBinding>;
  dropdown_bindings: Record<string, DropdownBinding>;
  validation_errors: Array<{ type: string; message: string }>;
}

// Simple XML-based Excel (XLSX) processor
async function processExcelTemplate(
  templateBytes: Uint8Array,
  mergeData: Record<string, string>,
  listData: Record<string, string[]>
): Promise<Uint8Array> {
  console.log('Processing Excel template with merge fields:', Object.keys(mergeData).length);
  console.log('Processing Excel template with lists:', Object.keys(listData).length);

  const { ZipReader, ZipWriter, Uint8ArrayReader, Uint8ArrayWriter } = 
    await import('https://deno.land/x/zipjs@v2.7.32/index.js');

  const zipReader = new ZipReader(new Uint8ArrayReader(templateBytes));
  const entries = await zipReader.getEntries();
  
  const outputWriter = new Uint8ArrayWriter();
  const zipWriter = new ZipWriter(outputWriter);

  // Track if we need to add a hidden Lists sheet for dropdown data
  const listsSheetData: string[][] = [];
  const listRanges: Record<string, { start: number; end: number }> = {};
  
  // Prepare list data for hidden sheet
  let rowIndex = 0;
  for (const [listKey, values] of Object.entries(listData)) {
    listRanges[listKey] = { start: rowIndex + 1, end: rowIndex + values.length };
    values.forEach(value => {
      listsSheetData.push([value]);
      rowIndex++;
    });
  }

  for (const entry of entries) {
    if (entry.directory) continue;
    
    const fileName = entry.filename;
    const content = await entry.getData!(new Uint8ArrayWriter());
    
    if (fileName.endsWith('.xml') || fileName.endsWith('.xml.rels')) {
      const decoder = new TextDecoder();
      let xmlContent = decoder.decode(content);
      
      // Process worksheet and shared strings for merge field replacement
      if (fileName.startsWith('xl/worksheets/') || fileName === 'xl/sharedStrings.xml') {
        // Replace all token formats: {{Token}}, <<Token>>, [[Token]]
        for (const [key, value] of Object.entries(mergeData)) {
          const safeValue = escapeXml(value || '');
          // Double brace format
          xmlContent = xmlContent.replace(new RegExp(`\\{\\{${escapeRegex(key)}\\}\\}`, 'g'), safeValue);
          // Double angle bracket format
          xmlContent = xmlContent.replace(new RegExp(`<<${escapeRegex(key)}>>`, 'g'), safeValue);
          // Double square bracket format
          xmlContent = xmlContent.replace(new RegExp(`\\[\\[${escapeRegex(key)}\\]\\]`, 'g'), safeValue);
        }
      }
      
      const encoder = new TextEncoder();
      await zipWriter.add(fileName, new Uint8ArrayReader(encoder.encode(xmlContent)));
    } else {
      await zipWriter.add(fileName, new Uint8ArrayReader(content));
    }
  }
  
  await zipReader.close();
  await zipWriter.close();
  
  return await outputWriter.getData();
}

function escapeXml(str: string): string {
  return str
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&apos;');
}

function escapeRegex(str: string): string {
  return str.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
}

Deno.serve(async (req: Request) => {
  if (req.method === 'OPTIONS') {
    return new Response(null, { headers: corsHeaders });
  }

  try {
    const supabase = createClient(supabaseUrl, supabaseServiceKey);

    const authHeader = req.headers.get('Authorization');
    if (!authHeader) {
      throw new Error('Missing authorization header');
    }

    const { data: { user }, error: userError } = await supabase.auth.getUser(
      authHeader.replace('Bearer ', '')
    );

    if (userError || !user) {
      throw new Error('Unauthorized');
    }

    const body: ExcelGenerateRequest = await req.json();
    const { document_id, tenant_id, client_legacy_id, stage_id, package_id, mode = 'single' } = body;

    console.log('Generate Excel request:', { document_id, tenant_id, stage_id, package_id, mode });

    // SECURITY: Verify user has access to the target tenant
    const { data: userProfile } = await supabase
      .from('users')
      .select('unicorn_role')
      .eq('user_uuid', user.id)
      .single();

    const isSuperAdmin = userProfile?.unicorn_role === 'Super Admin';
    
    if (!isSuperAdmin) {
      // Check if user is a member of this tenant
      const { data: tenantMember, error: memberError } = await supabase
        .from('tenant_users')
        .select('id')
        .eq('user_id', user.id)
        .eq('tenant_id', tenant_id)
        .maybeSingle();

      if (memberError || !tenantMember) {
        console.error('Access denied: User not authorized for tenant', tenant_id);
        throw new Error('Access denied: You do not have permission to generate documents for this tenant');
      }
    }

    console.log('Authorization verified for user:', user.id, 'isSuperAdmin:', isSuperAdmin);

    // 1. Fetch the source document
    const { data: document, error: docError } = await supabase
      .from('documents')
      .select('id, title, format, file_names, uploaded_files, merge_fields')
      .eq('id', document_id)
      .single();

    if (docError || !document) {
      throw new Error(`Document not found: ${docError?.message || 'Unknown error'}`);
    }

    const format = (document.format || '').toLowerCase();
    if (!['xlsx', 'xls', 'xlsm'].includes(format)) {
      throw new Error(`Document format "${format}" is not an Excel file`);
    }

    console.log('Source Excel document:', document.title);

    // 2. Fetch Excel bindings if they exist
    const { data: excelBindings } = await supabase
      .from('excel_template_bindings')
      .select('*')
      .eq('document_id', document_id)
      .maybeSingle();

    const bindings = excelBindings as ExcelBindings | null;
    
    // Check if bindings exist and are ready
    if (bindings && bindings.status === 'error') {
      throw new Error('Excel bindings have validation errors. Please fix them before generating.');
    }

    // 3. Fetch tenant/client data for merge fields
    let tenantData: Record<string, unknown> = {};
    
    if (client_legacy_id) {
      const { data: client } = await supabase
        .from('clients_legacy')
        .select('*')
        .eq('id', client_legacy_id)
        .single();

      if (client) {
        tenantData = client as Record<string, unknown>;
        console.log('Client data fetched:', (client as { companyname?: string }).companyname);
      }
    }

    // Fetch merge field values from unified view
    const { data: mergeFieldRows } = await supabase
      .from('v_tenant_merge_fields')
      .select('field_tag, field_type, value')
      .eq('tenant_id', tenant_id);

    // Also get tenant name for file naming
    const { data: tenant } = await supabase
      .from('tenants')
      .select('name')
      .eq('id', tenant_id)
      .single();

    if (tenant) {
      tenantData = { ...tenantData, name: tenant.name };
    }

    // 4. Build merge data from bindings OR unified view
    const mergeData: Record<string, string> = {};
    
    if (bindings && Object.keys(bindings.token_bindings || {}).length > 0) {
      // Use new binding system
      for (const [token, binding] of Object.entries(bindings.token_bindings)) {
        let value = '';
        
        switch (binding.source_type) {
          case 'client':
          case 'tenant':
            if (binding.source_field) {
              const fieldValue = tenantData[binding.source_field];
              value = fieldValue !== null && fieldValue !== undefined ? String(fieldValue) : '';
            }
            break;
          case 'system':
            if (binding.source_field === 'current_date') {
              value = new Date().toLocaleDateString('en-AU');
            } else if (binding.source_field === 'current_time') {
              value = new Date().toLocaleTimeString('en-AU');
            } else if (binding.source_field === 'current_year') {
              value = new Date().getFullYear().toString();
            } else if (binding.source_field === 'generated_by') {
              value = user.email || '';
            }
            break;
          case 'static':
            value = binding.static_value || '';
            break;
        }
        
        mergeData[token] = value;
      }
    } else {
      // Use unified view data
      (mergeFieldRows || []).forEach((row: { field_tag: string; field_type: string; value: string }) => {
        mergeData[`{{${row.field_tag}}}`] = row.value !== null && row.value !== undefined ? String(row.value) : '';
      });
    }

    console.log('Merge data prepared with', Object.keys(mergeData).length, 'fields');

    // 5. Build list data from bindings
    const listData: Record<string, string[]> = {};
    
    if (bindings && Object.keys(bindings.dropdown_bindings || {}).length > 0) {
      for (const [dropdownId, binding] of Object.entries(bindings.dropdown_bindings)) {
        if (binding.list_id) {
          const { data: listItems } = await supabase
            .from('lookup_list_items')
            .select('value, label')
            .eq('list_id', binding.list_id)
            .eq('is_active', true)
            .order('sort_order');

          if (listItems && listItems.length > 0) {
            listData[dropdownId] = listItems.map(item => item.label || item.value);
          }
        }
      }
    }

    console.log('List data prepared:', Object.keys(listData));

    // 6. Fetch and process template
    const templatePath = document.uploaded_files?.[0];
    if (!templatePath) {
      throw new Error('No template file found for this document');
    }

    console.log('Downloading template from:', templatePath);

    const { data: templateFile, error: downloadError } = await supabase.storage
      .from('package-documents')
      .download(templatePath);

    if (downloadError || !templateFile) {
      throw new Error(`Failed to download template: ${downloadError?.message || 'Unknown error'}`);
    }

    const templateBytes = new Uint8Array(await templateFile.arrayBuffer());
    const generatedBytes = await processExcelTemplate(templateBytes, mergeData, listData);

    // 7. Save generated file
    const tenantName = (tenantData.name || tenantData.companyname || 'tenant') as string;
    const safeTenantName = tenantName.replace(/[^a-zA-Z0-9]/g, '_').substring(0, 50);
    const timestamp = Date.now();
    const generatedFileName = `${document.title}_${safeTenantName}_${timestamp}.xlsx`;
    const outputPath = `generated/${tenant_id}/${document_id}/${generatedFileName}`;

    const { error: uploadError } = await supabase.storage
      .from('package-documents')
      .upload(outputPath, generatedBytes, {
        contentType: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
        upsert: true
      });

    if (uploadError) {
      throw new Error(`Failed to upload generated file: ${uploadError.message}`);
    }

    console.log('Generated file uploaded to:', outputPath);

    // 8. Record in generated_documents
    const { data: generatedDoc, error: insertError } = await supabase
      .from('generated_documents')
      .insert({
        source_document_id: document_id,
        tenant_id: tenant_id,
        client_legacy_id: client_legacy_id || null,
        stage_id: stage_id || null,
        package_id: package_id || null,
        file_path: outputPath,
        file_name: generatedFileName,
        generated_by: user.id,
        status: 'generated',
        merge_data: mergeData
      })
      .select()
      .single();

    if (insertError) {
      throw new Error(`Failed to create generated document record: ${insertError.message}`);
    }

    // 9. Also record in excel_generated_files if we have bindings
    if (bindings) {
      await supabase
        .from('excel_generated_files')
        .insert({
          document_id: document_id,
          tenant_id: tenant_id,
          client_id: client_legacy_id ? parseInt(client_legacy_id) : null,
          package_id: package_id || null,
          stage_id: stage_id || null,
          storage_path: outputPath,
          generated_by: user.id
        });
    }

    // 10. Get signed URL
    const { data: signedUrlData, error: signedUrlError } = await supabase.storage
      .from('package-documents')
      .createSignedUrl(outputPath, 3600);

    if (signedUrlError) {
      throw new Error(`Failed to create download URL: ${signedUrlError.message}`);
    }

    // 11. Audit log
    await supabase
      .from('client_audit_log')
      .insert({
        tenant_id: tenant_id,
        entity_type: 'excel_document',
        entity_id: generatedDoc.id,
        action: 'excel.generated',
        actor_user_id: user.id,
        details: {
          document_id,
          document_title: document.title,
          file_name: generatedFileName,
          merge_fields_used: Object.keys(mergeData).length,
          lists_populated: Object.keys(listData),
          used_bindings: !!bindings
        }
      });

    console.log('Excel document generated successfully:', generatedDoc.id);

    return new Response(
      JSON.stringify({
        success: true,
        generated_document: generatedDoc,
        download_url: signedUrlData.signedUrl,
        file_name: generatedFileName,
        message: `Excel document "${document.title}" generated for ${tenantName}`
      }),
      {
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
        status: 200
      }
    );

  } catch (error: unknown) {
    const errorMessage = error instanceof Error ? error.message : 'Unknown error occurred';
    console.error('Generate Excel document error:', errorMessage);

    return new Response(
      JSON.stringify({
        success: false,
        error: errorMessage
      }),
      {
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
        status: 400
      }
    );
  }
});